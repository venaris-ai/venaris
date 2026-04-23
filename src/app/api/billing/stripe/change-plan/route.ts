// src/app/api/billing/stripe/change-plan/route.ts #4
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
import {
  getStripeClient,
  getStripePriceId,
  getStripeTaxRateDe19,
} from "@/lib/billing/stripe";
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

type OrganizationRow = {
  id: string;
  name: string | null;
  legal_name: string | null;
  billing_email: string | null;
  billing_street: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
};

type ProfileRow = {
  preferred_language: AppLanguage | null;
};

type Counts = {
  cameraCount: number;
  memberCount: number;
  inviteCount: number;
};

type MissingBillingFieldKey =
  | "legal_name"
  | "billing_email"
  | "billing_street"
  | "billing_postal_code"
  | "billing_city"
  | "billing_country";

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
        ownerOnly: "Only organization owners can change the plan.",
        invalidJsonBody: "Invalid JSON body.",
        invalidPlanKey: "Invalid plan key.",
        selfServeOnly:
          "Only Starter and Pro can be changed via self-service billing.",
        monthlyOnly: "Only monthly billing is currently supported.",
        failedToLoadSubscription: "Failed to load subscription.",
        failedToLoadOrganization: "Failed to load organization.",
        failedToLoadProfile: "Failed to load user profile.",
        failedToLoadCameraUsage: "Failed to load camera usage.",
        failedToLoadMemberUsage: "Failed to load member usage.",
        failedToLoadInviteUsage: "Failed to load invite usage.",
        failedToPersistStripeCustomer:
          "Stripe customer could not be linked to the subscription.",
        subscriptionNotFound:
          "Subscription not found for active organization.",
        organizationNotFound: "Organization not found.",
        stripeOnly:
          "Direct plan changes are only available for Stripe-managed subscriptions.",
        providerSubscriptionMissing:
          "Stripe subscription ID is missing for this subscription.",
        targetPlanNotFound: "Target plan not found.",
        currentPlanSelected:
          "The selected plan is already the current plan.",
        stripeItemMissing:
          "The Stripe subscription has no subscription items.",
        stripePeriodEndMissing:
          "The Stripe subscription has no current period end.",
        scheduleAlreadyExists:
          "A scheduled subscription change already exists for this Stripe subscription.",
        billingDataIncomplete:
          "Billing data is incomplete. Please complete the account data before changing a paid plan.",
        billingFieldLabels: {
          legal_name: "Name on invoice",
          billing_email: "Billing email",
          billing_street: "Street / house number",
          billing_postal_code: "Postal code",
          billing_city: "City",
          billing_country: "Country",
        } satisfies Record<MissingBillingFieldKey, string>,
        cameraQuotaExceeded: (current: number, max: number, label: string) =>
          `Current camera usage (${current}) exceeds the ${label} limit (${max}).`,
        memberQuotaExceeded: (current: number, max: number, label: string) =>
          `Current member usage (${current}) exceeds the ${label} limit (${max}).`,
        failedToChangePlan: "Failed to change the plan in Stripe.",
      }
    : {
        notAuthenticated: "Nicht authentifiziert.",
        noActiveOrganization: "Keine aktive Organization ausgewählt.",
        ownerOnly: "Nur Owner der Organization können den Plan ändern.",
        invalidJsonBody: "Ungültiger JSON-Body.",
        invalidPlanKey: "Ungültiger Plan-Key.",
        selfServeOnly:
          "Nur Starter und Pro können über Self-Service-Billing geändert werden.",
        monthlyOnly: "Aktuell wird nur monatliche Abrechnung unterstützt.",
        failedToLoadSubscription: "Abo konnte nicht geladen werden.",
        failedToLoadOrganization: "Organisation konnte nicht geladen werden.",
        failedToLoadProfile: "Benutzerprofil konnte nicht geladen werden.",
        failedToLoadCameraUsage:
          "Kameranutzung konnte nicht geladen werden.",
        failedToLoadMemberUsage:
          "Member-Nutzung konnte nicht geladen werden.",
        failedToLoadInviteUsage:
          "Invite-Nutzung konnte nicht geladen werden.",
        failedToPersistStripeCustomer:
          "Stripe Customer konnte nicht mit dem Abo verknüpft werden.",
        subscriptionNotFound:
          "Für die aktive Organization wurde kein Abo gefunden.",
        organizationNotFound: "Organisation nicht gefunden.",
        stripeOnly:
          "Direkte Planwechsel sind nur für Stripe-verwaltete Abos verfügbar.",
        providerSubscriptionMissing:
          "Für dieses Abo fehlt die Stripe Subscription ID.",
        targetPlanNotFound: "Zielplan nicht gefunden.",
        currentPlanSelected:
          "Der ausgewählte Plan ist bereits der aktuelle Plan.",
        stripeItemMissing:
          "Das Stripe-Abo enthält keine Subscription Items.",
        stripePeriodEndMissing:
          "Für das Stripe-Abo fehlt das Ende der aktuellen Periode.",
        scheduleAlreadyExists:
          "Für dieses Stripe-Abo existiert bereits eine geplante Änderung.",
        billingDataIncomplete:
          "Die Rechnungsdaten sind unvollständig. Bitte vervollständige vor einem Planwechsel die Account-Daten.",
        billingFieldLabels: {
          legal_name: "Name auf der Rechnung",
          billing_email: "Rechnungs-E-Mail",
          billing_street: "Straße / Hausnummer",
          billing_postal_code: "PLZ",
          billing_city: "Ort",
          billing_country: "Land",
        } satisfies Record<MissingBillingFieldKey, string>,
        cameraQuotaExceeded: (current: number, max: number, label: string) =>
          `Die aktuelle Kameranutzung (${current}) überschreitet das ${label}-Limit (${max}).`,
        memberQuotaExceeded: (current: number, max: number, label: string) =>
          `Die aktuelle Member-Nutzung (${current}) überschreitet das ${label}-Limit (${max}).`,
        failedToChangePlan: "Der Plan konnte in Stripe nicht geändert werden.",
      };
}

function errorResponse(status: number, error: string, details?: string) {
  return NextResponse.json(details ? { error, details } : { error }, { status });
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

function normalizeBillingCountry(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function normalizeStripeLocale(language: AppLanguage | null | undefined) {
  return language === "en" ? "en" : "de";
}

function findMissingBillingFields(
  organization: OrganizationRow
): MissingBillingFieldKey[] {
  const missing: MissingBillingFieldKey[] = [];

  if (!organization.legal_name?.trim()) missing.push("legal_name");
  if (!organization.billing_email?.trim()) missing.push("billing_email");
  if (!organization.billing_street?.trim()) missing.push("billing_street");
  if (!organization.billing_postal_code?.trim()) {
    missing.push("billing_postal_code");
  }
  if (!organization.billing_city?.trim()) missing.push("billing_city");
  if (!normalizeBillingCountry(organization.billing_country)) {
    missing.push("billing_country");
  }

  return missing;
}

async function upsertStripeCustomer(params: {
  organization: OrganizationRow;
  existingCustomerId: string | null;
  preferredLanguage: AppLanguage;
}) {
  const { organization, existingCustomerId, preferredLanguage } = params;
  const stripe = getStripeClient();

  const customerPayload = {
    name: organization.legal_name!.trim(),
    email: organization.billing_email!.trim(),
    address: {
      line1: organization.billing_street!.trim(),
      postal_code: organization.billing_postal_code!.trim(),
      city: organization.billing_city!.trim(),
      country: normalizeBillingCountry(organization.billing_country),
    },
    preferred_locales: [normalizeStripeLocale(preferredLanguage)],
    metadata: {
      organization_id: organization.id,
      organization_name: organization.name?.trim() ?? "",
    },
  };

  if (existingCustomerId?.trim()) {
    const customer = await stripe.customers.update(
      existingCustomerId.trim(),
      customerPayload
    );
    return customer.id;
  }

  const customer = await stripe.customers.create(customerPayload);
  return customer.id;
}

export async function POST(request: NextRequest) {
  const requestLanguage = getLanguageFromRequest(request);
  const text = t(requestLanguage);

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

  const [
    subscriptionResult,
    organizationResult,
    profileResult,
    cameraCountResult,
    memberCountResult,
    inviteCountResult,
  ] = await Promise.all([
    supabase
      .from("organization_subscriptions")
      .select(
        "id,organization_id,plan_key,status,billing_cycle,max_cameras,max_members,billing_provider,provider_customer_id,provider_subscription_id"
      )
      .eq("organization_id", activeOrganizationId)
      .maybeSingle<SubscriptionRow>(),
    supabase
      .from("organizations")
      .select(
        "id,name,legal_name,billing_email,billing_street,billing_postal_code,billing_city,billing_country"
      )
      .eq("id", activeOrganizationId)
      .maybeSingle<OrganizationRow>(),
    supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", ctx.user.id)
      .maybeSingle<ProfileRow>(),
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

  if (organizationResult.error) {
    return errorResponse(
      500,
      text.failedToLoadOrganization,
      organizationResult.error.message
    );
  }

  if (profileResult.error) {
    return errorResponse(
      500,
      text.failedToLoadProfile,
      profileResult.error.message
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

  const organization = organizationResult.data;
  if (!organization) {
    return errorResponse(404, text.organizationNotFound);
  }

  const preferredLanguage =
    profileResult.data?.preferred_language ?? requestLanguage;

  if (subscription.billing_provider !== "stripe") {
    return errorResponse(400, text.stripeOnly);
  }

  if (!subscription.provider_subscription_id) {
    return errorResponse(400, text.providerSubscriptionMissing);
  }

  if (subscription.plan_key === rawPlanKey) {
    return errorResponse(400, text.currentPlanSelected);
  }

  const missingBillingFields = findMissingBillingFields(organization);
  if (missingBillingFields.length > 0) {
    const missingLabels = missingBillingFields.map(
      (field) => text.billingFieldLabels[field]
    );

    return errorResponse(
      400,
      text.billingDataIncomplete,
      missingLabels.join(", ")
    );
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

  const targetPlanCheck = fitsTargetPlan(rawPlanKey, counts, requestLanguage);
  if (!targetPlanCheck.ok) {
    return errorResponse(400, targetPlanCheck.message);
  }

  const stripeCustomerId = await upsertStripeCustomer({
    organization,
    existingCustomerId: subscription.provider_customer_id,
    preferredLanguage,
  });

  if (subscription.provider_customer_id !== stripeCustomerId) {
    const persistCustomerResult = await supabase
      .from("organization_subscriptions")
      .update({
        provider_customer_id: stripeCustomerId,
      })
      .eq("organization_id", activeOrganizationId);

    if (persistCustomerResult.error) {
      return errorResponse(
        500,
        text.failedToPersistStripeCustomer,
        persistCustomerResult.error.message
      );
    }
  }

  const stripe = getStripeClient();
  const taxRateId = getStripeTaxRateDe19();
  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscription.provider_subscription_id
  );

  const currentItem = stripeSubscription.items.data[0];
  if (!currentItem) {
    return errorResponse(400, text.stripeItemMissing);
  }

  const currentQuantity = currentItem.quantity ?? 1;
  const currentPriceId = currentItem.price.id;
  const currentPeriodStart = currentItem.current_period_start ?? null;
  const currentPeriodEnd = currentItem.current_period_end ?? null;

  const existingScheduleId =
    typeof stripeSubscription.schedule === "string"
      ? stripeSubscription.schedule
      : stripeSubscription.schedule?.id ?? null;

  if (existingScheduleId) {
    return errorResponse(409, text.scheduleAlreadyExists);
  }

  const targetPriceId = getStripePriceId(rawPlanKey, billingCycle);
  const isUpgrade = PLAN_ORDER[rawPlanKey] > PLAN_ORDER[subscription.plan_key];

  try {
    if (isUpgrade) {
      const updatedSubscription = await stripe.subscriptions.update(
        stripeSubscription.id,
        {
          items: [
            {
              id: currentItem.id,
              price: targetPriceId,
              quantity: currentQuantity,
              tax_rates: [taxRateId],
            },
          ],
          cancel_at_period_end: false,
          proration_behavior: "always_invoice",
          metadata: {
            organization_id: String(activeOrganizationId),
            plan_key: String(rawPlanKey),
            billing_cycle: String(billingCycle),
          },
          default_tax_rates: [taxRateId],
        }
      );

      return NextResponse.json({
        ok: true,
        mode: "upgrade",
        effective: "immediate",
        subscriptionId: updatedSubscription.id,
        requestedPlanKey: rawPlanKey,
      });
    }

    if (!currentPeriodEnd) {
      return errorResponse(400, text.stripePeriodEndMissing);
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
                  tax_rates: [taxRateId],
                },
              ],
              default_tax_rates: [taxRateId],
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
                  tax_rates: [taxRateId],
                },
              ],
              default_tax_rates: [taxRateId],
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
        mode: "downgrade",
        effective: "period_end",
        scheduledFor: new Date(currentPeriodEnd * 1000).toISOString(),
        scheduleId: updatedSchedule.id,
        requestedPlanKey: rawPlanKey,
      });
    } catch (scheduleError) {
      await stripe.subscriptionSchedules.release(createdSchedule.id).catch(() => null);

      return errorResponse(
        500,
        text.failedToChangePlan,
        scheduleError instanceof Error
          ? scheduleError.message
          : String(scheduleError)
      );
    }
  } catch (error) {
    return errorResponse(
      500,
      text.failedToChangePlan,
      error instanceof Error ? error.message : String(error)
    );
  }
}