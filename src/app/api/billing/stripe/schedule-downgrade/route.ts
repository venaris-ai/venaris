// src/app/api/billing/stripe/schedule-downgrade/route.ts #1
import { NextRequest, NextResponse } from "next/server";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";

import {
  getBillingPlan,
  isBillingPlanKey,
  isSelfServeBillingPlanKey,
  type BillingCycle,
  type BillingPlanKey,
} from "@/lib/billing/plans";
import { getStripeClient, getStripePriceId } from "@/lib/billing/stripe";

import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

type RequestBody = {
  planKey?: string;
  billingCycle?: string;
};

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_key: BillingPlanKey;
  status: string;
  billing_cycle: BillingCycle;
  max_cameras: number;
  max_members: number;
  billing_provider: "none" | "manual" | "stripe";
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
};

type Counts = {
  cameraCount: number;
  memberCount: number;
  inviteCount: number;
};

const PLAN_ORDER: Record<BillingPlanKey, number> = {
  starter: 1,
  pro: 2,
  enterprise: 3,
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        notAuthenticated: "Not authenticated.",
        noActiveOrganization: "No active organization selected.",
        ownerOnly: "Only organization owners can schedule a downgrade.",
        invalidJsonBody: "Invalid JSON body.",
        invalidPlanKey: "Invalid plan key.",
        selfServeOnly:
          "Only Starter and Pro can be used for self-service downgrade.",
        monthlyOnly: "Only monthly billing is currently supported.",
        failedToLoadSubscription: "Failed to load subscription.",
        failedToLoadCameraUsage: "Failed to load camera usage.",
        failedToLoadMemberUsage: "Failed to load member usage.",
        failedToLoadInviteUsage: "Failed to load invite usage.",
        subscriptionNotFound:
          "Subscription not found for active organization.",
        stripeOnly:
          "Scheduled downgrade is only available for Stripe-managed subscriptions.",
        providerSubscriptionMissing:
          "Stripe subscription ID is missing for this subscription.",
        downgradeOnly:
          "This route only supports scheduled downgrades to a smaller plan.",
        targetPlanNotFound: "Target plan not found.",
        scheduleAlreadyExists:
          "A scheduled subscription change already exists for this Stripe subscription.",
        stripeItemMissing:
          "The Stripe subscription has no subscription items.",
        stripePeriodEndMissing:
          "The Stripe subscription has no current period end.",
        failedToSchedule:
          "Failed to schedule the downgrade at period end.",
        cameraQuotaExceeded: (current: number, max: number, label: string) =>
          `Current camera usage (${current}) exceeds the ${label} limit (${max}).`,
        memberQuotaExceeded: (current: number, max: number, label: string) =>
          `Current member usage (${current}) exceeds the ${label} limit (${max}).`,
      }
    : {
        notAuthenticated: "Nicht authentifiziert.",
        noActiveOrganization: "Keine aktive Organization ausgewählt.",
        ownerOnly:
          "Nur Owner der Organization können ein Downgrade planen.",
        invalidJsonBody: "Ungültiger JSON-Body.",
        invalidPlanKey: "Ungültiger Plan-Key.",
        selfServeOnly:
          "Nur Starter und Pro können für ein Self-Service-Downgrade verwendet werden.",
        monthlyOnly: "Aktuell wird nur monatliche Abrechnung unterstützt.",
        failedToLoadSubscription: "Abo konnte nicht geladen werden.",
        failedToLoadCameraUsage:
          "Kameranutzung konnte nicht geladen werden.",
        failedToLoadMemberUsage:
          "Member-Nutzung konnte nicht geladen werden.",
        failedToLoadInviteUsage:
          "Invite-Nutzung konnte nicht geladen werden.",
        subscriptionNotFound:
          "Für die aktive Organization wurde kein Abo gefunden.",
        stripeOnly:
          "Geplante Downgrades sind nur für Stripe-verwaltete Abos verfügbar.",
        providerSubscriptionMissing:
          "Für dieses Abo fehlt die Stripe Subscription ID.",
        downgradeOnly:
          "Diese Route unterstützt nur geplante Downgrades auf einen kleineren Plan.",
        targetPlanNotFound: "Zielplan nicht gefunden.",
        scheduleAlreadyExists:
          "Für dieses Stripe-Abo existiert bereits eine geplante Änderung.",
        stripeItemMissing:
          "Das Stripe-Abo enthält keine Subscription Items.",
        stripePeriodEndMissing:
          "Für das Stripe-Abo fehlt das Ende der aktuellen Periode.",
        failedToSchedule:
          "Das Downgrade zum Periodenende konnte nicht geplant werden.",
        cameraQuotaExceeded: (current: number, max: number, label: string) =>
          `Die aktuelle Kameranutzung (${current}) überschreitet das ${label}-Limit (${max}).`,
        memberQuotaExceeded: (current: number, max: number, label: string) =>
          `Die aktuelle Member-Nutzung (${current}) überschreitet das ${label}-Limit (${max}).`,
      };
}

function errorResponse(
  status: number,
  error: string,
  details?: string
) {
  return NextResponse.json(details ? { error, details } : { error }, {
    status,
  });
}

function buildCounts(
  cameraCount: number,
  memberCount: number,
  inviteCount: number
): Counts {
  return {
    cameraCount,
    memberCount,
    inviteCount,
  };
}

function fitsTargetPlan(
  targetPlanKey: BillingPlanKey,
  counts: Counts,
  language: AppLanguage
) {
  const text = t(language);
  const plan = getBillingPlan(targetPlanKey);

  if (!plan) {
    return {
      ok: false,
      message: text.targetPlanNotFound,
    };
  }

  if (plan.maxCameras != null && counts.cameraCount > plan.maxCameras) {
    return {
      ok: false,
      message: text.cameraQuotaExceeded(
        counts.cameraCount,
        plan.maxCameras,
        plan.label
      ),
    };
  }

  const effectiveMemberUsage = counts.memberCount + counts.inviteCount;
  if (plan.maxMembers != null && effectiveMemberUsage > plan.maxMembers) {
    return {
      ok: false,
      message: text.memberQuotaExceeded(
        effectiveMemberUsage,
        plan.maxMembers,
        plan.label
      ),
    };
  }

  return { ok: true } as const;
}

export async function POST(request: NextRequest) {
  const language = getLanguageFromRequest(request);
  const text = t(language);

  const ctx = await requirePathAccess("/orga/subscription");

  if (!ctx.user) {
    return errorResponse(401, text.notAuthenticated);
  }

  const activeMembership =
    "activeMembership" in ctx ? ctx.activeMembership : null;

  const activeOrganizationId = activeMembership?.organizations?.id ?? null;
  const role = activeMembership?.role ?? null;

  if (!activeOrganizationId) {
    return errorResponse(400, text.noActiveOrganization);
  }

  if (role !== "owner") {
    return errorResponse(403, text.ownerOnly);
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return errorResponse(400, text.invalidJsonBody);
  }

  const rawPlanKey = String(body.planKey ?? "").trim();
  const rawBillingCycle = String(body.billingCycle ?? "").trim();

  if (!isBillingPlanKey(rawPlanKey)) {
    return errorResponse(400, text.invalidPlanKey);
  }

  if (!isSelfServeBillingPlanKey(rawPlanKey)) {
    return errorResponse(400, text.selfServeOnly);
  }

  const billingCycle = rawBillingCycle === "monthly" ? "monthly" : null;
  if (!billingCycle) {
    return errorResponse(400, text.monthlyOnly);
  }

  const supabase = await supabaseServer();

  const [subscriptionResult, cameraCountResult, memberCountResult, inviteCountResult] =
    await Promise.all([
      supabase
        .from("organization_subscriptions")
        .select(
          "id,organization_id,plan_key,status,billing_cycle,max_cameras,max_members,billing_provider,provider_customer_id,provider_subscription_id"
        )
        .eq("organization_id", activeOrganizationId)
        .maybeSingle<SubscriptionRow>(),
      supabase
        .from("cameras")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", activeOrganizationId),
      supabase
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", activeOrganizationId),
      supabase
        .from("organization_invites")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", activeOrganizationId)
        .eq("status", "pending"),
    ]);

  if (subscriptionResult.error) {
    return errorResponse(
      500,
      text.failedToLoadSubscription,
      subscriptionResult.error.message
    );
  }

  if (cameraCountResult.error) {
    return errorResponse(
      500,
      text.failedToLoadCameraUsage,
      cameraCountResult.error.message
    );
  }

  if (memberCountResult.error) {
    return errorResponse(
      500,
      text.failedToLoadMemberUsage,
      memberCountResult.error.message
    );
  }

  if (inviteCountResult.error) {
    return errorResponse(
      500,
      text.failedToLoadInviteUsage,
      inviteCountResult.error.message
    );
  }

  const subscription = subscriptionResult.data;
  if (!subscription) {
    return errorResponse(404, text.subscriptionNotFound);
  }

  if (subscription.billing_provider !== "stripe") {
    return errorResponse(400, text.stripeOnly);
  }

  if (!subscription.provider_subscription_id) {
    return errorResponse(400, text.providerSubscriptionMissing);
  }

  if (PLAN_ORDER[rawPlanKey] >= PLAN_ORDER[subscription.plan_key]) {
    return errorResponse(400, text.downgradeOnly);
  }

  const targetPlan = getBillingPlan(rawPlanKey);
  if (!targetPlan) {
    return errorResponse(400, text.targetPlanNotFound);
  }

  const counts = buildCounts(
    cameraCountResult.count ?? 0,
    memberCountResult.count ?? 0,
    inviteCountResult.count ?? 0
  );

  const targetPlanCheck = fitsTargetPlan(rawPlanKey, counts, language);
  if (!targetPlanCheck.ok) {
    return errorResponse(400, targetPlanCheck.message);
  }

  const stripe = getStripeClient();
  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscription.provider_subscription_id
  );

  const currentItem = stripeSubscription.items.data[0];
  if (!currentItem) {
    return errorResponse(400, text.stripeItemMissing);
  }

  const currentPeriodStart = currentItem.current_period_start ?? null;
  const currentPeriodEnd = currentItem.current_period_end ?? null;

  if (!currentPeriodEnd) {
    return errorResponse(400, text.stripePeriodEndMissing);
  }

  const targetPriceId = getStripePriceId(rawPlanKey, billingCycle);
  const currentPriceId = currentItem.price.id;
  const currentQuantity = currentItem.quantity ?? 1;

  const existingScheduleId =
    typeof stripeSubscription.schedule === "string"
      ? stripeSubscription.schedule
      : stripeSubscription.schedule?.id ?? null;

  if (existingScheduleId) {
    return errorResponse(409, text.scheduleAlreadyExists);
  }

  const createdSchedule = await stripe.subscriptionSchedules.create({
    from_subscription: stripeSubscription.id,
  });

  try {
    const updatedSchedule = await stripe.subscriptionSchedules.update(
      createdSchedule.id,
      {
        end_behavior: "release",
        phases: [
          {
            start_date: currentPeriodStart ?? "now",
            end_date: currentPeriodEnd,
            items: [
              {
                price: currentPriceId,
                quantity: currentQuantity,
              },
            ],
            proration_behavior: "none",
            metadata: {
              organization_id: String(activeOrganizationId),
              plan_key: String(subscription.plan_key),
              billing_cycle: String(subscription.billing_cycle),
            },
          },
          {
            start_date: currentPeriodEnd,
            items: [
              {
                price: targetPriceId,
                quantity: currentQuantity,
              },
            ],
            proration_behavior: "none",
            metadata: {
              organization_id: String(activeOrganizationId),
              plan_key: String(rawPlanKey),
              billing_cycle: String(billingCycle),
            },
          },
        ],
      }
    );

    return NextResponse.json({
      ok: true,
      scheduledFor: new Date(currentPeriodEnd * 1000).toISOString(),
      scheduleId: updatedSchedule.id,
      requestedPlanKey: rawPlanKey,
    });
  } catch (error) {
    await stripe.subscriptionSchedules.release(createdSchedule.id).catch(() => null);

    return errorResponse(
      500,
      text.failedToSchedule,
      error instanceof Error ? error.message : String(error)
    );
  }
}