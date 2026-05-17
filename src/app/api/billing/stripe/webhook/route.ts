// src/app/api/billing/stripe/webhook/route.ts #5
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import type {
  BillingCycle,
  BillingPlanKey,
} from "@/lib/billing/plans";
import {
  getBillingCycleFromStripePriceId,
  getPlanSnapshotForStripe,
  getSelfServePlanFromStripePriceId,
  getStripeClient,
  getStripeWebhookSecret,
} from "@/lib/billing/stripe";

type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

type ScheduledChangeType = "upgrade" | "downgrade" | "cancel";

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_key: BillingPlanKey;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  price_amount_cents: number;
  price_currency: string;
  max_cameras: number;
  max_members: number;
  billing_provider: "none" | "manual" | "stripe";
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  scheduled_plan_key: BillingPlanKey | null;
  scheduled_change_type: ScheduledChangeType | null;
  scheduled_change_effective_at: string | null;
};

type SubscriptionUpdate = Partial<{
  plan_key: BillingPlanKey;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  price_amount_cents: number;
  price_currency: string;
  max_cameras: number;
  max_members: number;
  billing_provider: "none" | "manual" | "stripe";
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  scheduled_plan_key: BillingPlanKey | null;
  scheduled_change_type: ScheduledChangeType | null;
  scheduled_change_effective_at: string | null;
  updated_at: string;
}>;

function toIsoOrNull(unixSeconds: number | null | undefined) {
  if (!unixSeconds || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function extractOrganizationIdFromMetadata(
  metadata: Record<string, string> | null | undefined
) {
  const organizationId = metadata?.organization_id?.trim();
  return organizationId || null;
}

function inferPlanFromPriceId(priceId: string | null | undefined) {
  const planKey = getSelfServePlanFromStripePriceId(priceId);
  const billingCycle = getBillingCycleFromStripePriceId(priceId);

  if (!planKey || !billingCycle) {
    return null;
  }

  return {
    planKey,
    billingCycle,
    snapshot: getPlanSnapshotForStripe(planKey, billingCycle),
  };
}

function getPrimaryPriceIdFromSubscription(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0];
  return firstItem?.price?.id ?? null;
}

function extractPriceIdFromSchedulePhaseItem(
  item: Stripe.SubscriptionSchedule.Phase.Item | undefined
) {
  if (!item?.price) return null;

  if (typeof item.price === "string") {
    return item.price;
  }

  if ("id" in item.price && typeof item.price.id === "string") {
    return item.price.id;
  }

  return null;
}

function mapStripeSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status
): SubscriptionStatus {
  switch (stripeStatus) {
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "expired";
    default:
      return "active";
  }
}

function planOrder(planKey: BillingPlanKey) {
  switch (planKey) {
    case "starter":
      return 1;
    case "pro":
      return 2;
    case "enterprise":
      return 3;
    default:
      return 0;
  }
}

async function findSubscriptionRow(params: {
  organizationId?: string | null;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
}) {
  const supabase = await supabaseServer();

  if (params.providerSubscriptionId) {
    const result = await supabase
      .from("organization_subscriptions")
      .select(
        "id,organization_id,plan_key,status,billing_cycle,current_period_start,current_period_end,trial_ends_at,cancel_at_period_end,canceled_at,price_amount_cents,price_currency,max_cameras,max_members,billing_provider,provider_customer_id,provider_subscription_id,scheduled_plan_key,scheduled_change_type,scheduled_change_effective_at"
      )
      .eq("provider_subscription_id", params.providerSubscriptionId)
      .maybeSingle<SubscriptionRow>();

    if (result.error) throw new Error(result.error.message);
    if (result.data) return result.data;
  }

  if (params.organizationId) {
    const result = await supabase
      .from("organization_subscriptions")
      .select(
        "id,organization_id,plan_key,status,billing_cycle,current_period_start,current_period_end,trial_ends_at,cancel_at_period_end,canceled_at,price_amount_cents,price_currency,max_cameras,max_members,billing_provider,provider_customer_id,provider_subscription_id,scheduled_plan_key,scheduled_change_type,scheduled_change_effective_at"
      )
      .eq("organization_id", params.organizationId)
      .maybeSingle<SubscriptionRow>();

    if (result.error) throw new Error(result.error.message);
    if (result.data) return result.data;
  }

  if (params.providerCustomerId) {
    const result = await supabase
      .from("organization_subscriptions")
      .select(
        "id,organization_id,plan_key,status,billing_cycle,current_period_start,current_period_end,trial_ends_at,cancel_at_period_end,canceled_at,price_amount_cents,price_currency,max_cameras,max_members,billing_provider,provider_customer_id,provider_subscription_id,scheduled_plan_key,scheduled_change_type,scheduled_change_effective_at"
      )
      .eq("provider_customer_id", params.providerCustomerId)
      .maybeSingle<SubscriptionRow>();

    if (result.error) throw new Error(result.error.message);
    if (result.data) return result.data;
  }

  return null;
}

async function applySubscriptionUpdate(
  rowId: string,
  update: SubscriptionUpdate
) {
  const supabase = await supabaseServer();

  const result = await supabase
    .from("organization_subscriptions")
    .update({
      ...update,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

function getSubscriptionPeriodBounds(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0];

  return {
    currentPeriodStart: toIsoOrNull(firstItem?.current_period_start),
    currentPeriodEnd: toIsoOrNull(firstItem?.current_period_end),
  };
}

async function resolveScheduledChangeFromSubscription(params: {
  subscription: Stripe.Subscription;
  currentPlanKey: BillingPlanKey;
}) {
  const { subscription, currentPlanKey } = params;

  const cancelAtIso = toIsoOrNull(subscription.cancel_at);

  if (cancelAtIso && subscription.status === "active") {
    return {
      scheduled_plan_key: null,
      scheduled_change_type: "cancel" as const,
      scheduled_change_effective_at: cancelAtIso,
    };
  }

  if (subscription.cancel_at_period_end) {
    return {
      scheduled_plan_key: null,
      scheduled_change_type: "cancel" as const,
      scheduled_change_effective_at:
        getSubscriptionPeriodBounds(subscription).currentPeriodEnd,
    };
  }

  const scheduleId =
    typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule?.id ?? null;

  if (!scheduleId) {
    return {
      scheduled_plan_key: null,
      scheduled_change_type: null,
      scheduled_change_effective_at: null,
    };
  }

  const stripe = getStripeClient();
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);

  const currentPhase = schedule.current_phase;
  if (!currentPhase?.end_date) {
    return {
      scheduled_plan_key: null,
      scheduled_change_type: null,
      scheduled_change_effective_at: null,
    };
  }

  const nextPhase = schedule.phases.find(
    (phase) => phase.start_date === currentPhase.end_date
  );

  if (!nextPhase) {
    return {
      scheduled_plan_key: null,
      scheduled_change_type: null,
      scheduled_change_effective_at: null,
    };
  }

  const nextPriceId = extractPriceIdFromSchedulePhaseItem(nextPhase.items[0]);
  const nextPlanKey = getSelfServePlanFromStripePriceId(nextPriceId);

  if (!nextPlanKey || nextPlanKey === currentPlanKey) {
    return {
      scheduled_plan_key: null,
      scheduled_change_type: null,
      scheduled_change_effective_at: null,
    };
  }

  return {
    scheduled_plan_key: nextPlanKey,
    scheduled_change_type:
      planOrder(nextPlanKey) > planOrder(currentPlanKey)
        ? ("upgrade" as const)
        : ("downgrade" as const),
    scheduled_change_effective_at: new Date(
      nextPhase.start_date * 1000
    ).toISOString(),
  };
}

async function syncFromStripeSubscription(
  row: SubscriptionRow,
  subscription: Stripe.Subscription,
  overrides?: Partial<SubscriptionUpdate>
) {
  const priceId = getPrimaryPriceIdFromSubscription(subscription);
  const inferredPlan = inferPlanFromPriceId(priceId);

  const periodBounds = getSubscriptionPeriodBounds(subscription);
  const effectivePlanKey = inferredPlan?.planKey ?? row.plan_key;

  const scheduledChange = await resolveScheduledChangeFromSubscription({
    subscription,
    currentPlanKey: effectivePlanKey,
  });

  const update: SubscriptionUpdate = {
    billing_provider: "stripe",
    provider_customer_id:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    provider_subscription_id: subscription.id,
    current_period_start: periodBounds.currentPeriodStart,
    current_period_end: periodBounds.currentPeriodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: toIsoOrNull(subscription.canceled_at),
    status: mapStripeSubscriptionStatus(subscription.status),
    trial_ends_at: null,
    scheduled_plan_key: scheduledChange.scheduled_plan_key,
    scheduled_change_type: scheduledChange.scheduled_change_type,
    scheduled_change_effective_at:
      scheduledChange.scheduled_change_effective_at,
  };

  if (inferredPlan) {
    if (
      inferredPlan.snapshot.maxCameras == null ||
      inferredPlan.snapshot.maxMembers == null
    ) {
      throw new Error(
        `Self-service plan ${inferredPlan.planKey} must define numeric camera/member limits.`
      );
    }

    update.plan_key = inferredPlan.planKey;
    update.billing_cycle = inferredPlan.billingCycle;
    update.price_amount_cents = inferredPlan.snapshot.priceAmountCents;
    update.price_currency = inferredPlan.snapshot.priceCurrency;
    update.max_cameras = inferredPlan.snapshot.maxCameras;
    update.max_members = inferredPlan.snapshot.maxMembers;
  }

  if (overrides) {
    Object.assign(update, overrides);
  }

  await applySubscriptionUpdate(row.id, update);
}

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Invalid Stripe webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = extractOrganizationIdFromMetadata(
          session.metadata
        );
        const providerCustomerId =
          typeof session.customer === "string" ? session.customer : null;
        const providerSubscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;

        const row = await findSubscriptionRow({
          organizationId,
          providerSubscriptionId,
          providerCustomerId,
        });

        if (!row) {
          break;
        }

        await applySubscriptionUpdate(row.id, {
          billing_provider: "stripe",
          provider_customer_id: providerCustomerId,
          provider_subscription_id: providerSubscriptionId,
        });

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const organizationId = extractOrganizationIdFromMetadata(
          subscription.metadata
        );
        const providerCustomerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        const row = await findSubscriptionRow({
          organizationId,
          providerSubscriptionId: subscription.id,
          providerCustomerId,
        });

        if (!row) {
          break;
        }

        await syncFromStripeSubscription(row, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = extractOrganizationIdFromMetadata(
          subscription.metadata
        );
        const providerCustomerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        const row = await findSubscriptionRow({
          organizationId,
          providerSubscriptionId: subscription.id,
          providerCustomerId,
        });

        if (!row) {
          break;
        }

        const periodBounds = getSubscriptionPeriodBounds(subscription);

        await applySubscriptionUpdate(row.id, {
          billing_provider: "stripe",
          provider_customer_id: providerCustomerId,
          provider_subscription_id: subscription.id,
          status: "expired",
          cancel_at_period_end: false,
          canceled_at:
            toIsoOrNull(subscription.canceled_at) ?? new Date().toISOString(),
          current_period_start: periodBounds.currentPeriodStart,
          current_period_end: periodBounds.currentPeriodEnd,
          trial_ends_at: null,
          scheduled_plan_key: null,
          scheduled_change_type: null,
          scheduled_change_effective_at: null,
        });

        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const providerCustomerId =
          typeof invoice.customer === "string" ? invoice.customer : null;

        const providerSubscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : null;

        const row = await findSubscriptionRow({
          organizationId: null,
          providerSubscriptionId,
          providerCustomerId,
        });

        if (!row) {
          break;
        }

        if (!providerSubscriptionId) {
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(
          providerSubscriptionId
        );
        const statusOverride: SubscriptionStatus =
          event.type === "invoice.paid" ? "active" : "past_due";

        await syncFromStripeSubscription(row, subscription, {
          status: statusOverride,
          trial_ends_at: event.type === "invoice.paid" ? null : row.trial_ends_at,
        });

        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unhandled Stripe webhook error.";
    return NextResponse.json(
      { error: "Stripe webhook handling failed.", details: message },
      { status: 500 }
    );
  }
}