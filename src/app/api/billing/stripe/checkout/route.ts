// src/app/api/billing/stripe/checkout/route.ts #4
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
  organization_id: string;
  plan_key: BillingPlanKey;
  status: string;
  billing_cycle: BillingCycle;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
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

function t(language: AppLanguage) {
  return language === "en"
    ? {
        notAuthenticated: "Not authenticated.",
        noActiveOrganization: "No active organization selected.",
        ownerOnly: "Only organization owners can start checkout.",
        invalidJsonBody: "Invalid JSON body.",
        invalidPlanKey: "Invalid plan key.",
        selfServeOnly: "Only Starter and Pro can be purchased via Stripe.",
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
        manualNotSwitchable:
          "Manual subscriptions cannot be switched to a self-service plan automatically.",
        targetPlanNotFound: "Target plan not found.",
        checkoutUrlMissing: "Stripe checkout session did not return a URL.",
        billingDataIncomplete:
          "Billing data is incomplete. Please complete the account data before activating a paid plan.",
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
      }
    : {
        notAuthenticated: "Nicht authentifiziert.",
        noActiveOrganization: "Keine aktive Organization ausgewählt.",
        ownerOnly: "Nur Owner der Organization können den Checkout starten.",
        invalidJsonBody: "Ungültiger JSON-Body.",
        invalidPlanKey: "Ungültiger Plan-Key.",
        selfServeOnly: "Nur Starter und Pro können über Stripe gekauft werden.",
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
        manualNotSwitchable:
          "Manuell verwaltete Abos können nicht automatisch in einen Self-Service-Plan gewechselt werden.",
        targetPlanNotFound: "Zielplan nicht gefunden.",
        checkoutUrlMissing: "Stripe Checkout hat keine URL zurückgegeben.",
        billingDataIncomplete:
          "Die Rechnungsdaten sind unvollständig. Bitte vervollständige vor der Aktivierung eines bezahlten Plans die Account-Daten.",
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
        "organization_id,plan_key,status,billing_cycle,trial_ends_at,current_period_end,cancel_at_period_end,max_cameras,max_members,billing_provider,provider_customer_id,provider_subscription_id"
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

  if (subscription.billing_provider === "manual") {
    return errorResponse(400, text.manualNotSwitchable);
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

  const baseUrl = request.nextUrl.origin;
  const successUrl = new URL("/orga/subscription", baseUrl);
  successUrl.searchParams.set("checkout", "success");

  const cancelUrl = new URL("/orga/subscription", baseUrl);
  cancelUrl.searchParams.set("checkout", "canceled");

  const stripe = getStripeClient();
  const priceId = getStripePriceId(rawPlanKey, billingCycle);
  const taxRateId = getStripeTaxRateDe19();

  const metadata = {
    organization_id: String(activeOrganizationId),
    requested_plan_key: String(rawPlanKey),
    billing_cycle: String(billingCycle),
    current_plan_key: String(subscription.plan_key),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
locale: normalizeStripeLocale(preferredLanguage),
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    allow_promotion_codes: false,
    metadata,
    subscription_data: {
      metadata,
      default_tax_rates: [taxRateId],
    },
  });

  if (!session.url) {
    return errorResponse(500, text.checkoutUrlMissing);
  }

  return NextResponse.json({
    ok: true,
    url: session.url,
  });
}