// src/app/api/billing/stripe/portal/route.ts #3
import { NextRequest, NextResponse } from "next/server";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  getStripeClient,
  getStripePortalConfigurationId,
} from "@/lib/billing/stripe";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

type SubscriptionRow = {
  organization_id: string;
  billing_provider: "none" | "manual" | "stripe";
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
};

type ProfileRow = {
  preferred_language: AppLanguage | null;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        notAuthenticated: "Not authenticated.",
        noActiveOrganization: "No active organization selected.",
        ownerOnly: "Only organization owners can manage billing.",
        failedToLoadSubscription: "Failed to load subscription.",
        failedToLoadProfile: "Failed to load user profile.",
        subscriptionNotFound:
          "Subscription not found for active organization.",
        stripeOnly:
          "Billing portal is only available for Stripe-managed subscriptions.",
        customerIdMissing:
          "Stripe customer ID is missing for this subscription.",
        portalUrlMissing: "Stripe portal session did not return a URL.",
      }
    : {
        notAuthenticated: "Nicht authentifiziert.",
        noActiveOrganization: "Keine aktive Organization ausgewählt.",
        ownerOnly: "Nur Owner der Organization können die Abrechnung verwalten.",
        failedToLoadSubscription: "Abo konnte nicht geladen werden.",
        failedToLoadProfile: "Benutzerprofil konnte nicht geladen werden.",
        subscriptionNotFound:
          "Für die aktive Organization wurde kein Abo gefunden.",
        stripeOnly:
          "Das Billing Portal ist nur für Stripe-verwaltete Abos verfügbar.",
        customerIdMissing:
          "Für dieses Abo fehlt die Stripe Customer ID.",
        portalUrlMissing: "Stripe hat keine Billing-Portal-URL zurückgegeben.",
      };
}

function errorResponse(status: number, error: string, details?: string) {
  return NextResponse.json(details ? { error, details } : { error }, { status });
}

function resolveReturnUrl(request: NextRequest) {
  const url = new URL("/orga/subscription", request.nextUrl.origin);
  return url.toString();
}

function normalizeStripeLocale(language: AppLanguage | null | undefined) {
  return language === "en" ? "en" : "de";
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

  const activeOrganizationId =
    activeMembership?.organizations?.id ?? null;
  const role = activeMembership?.role ?? null;

  if (!activeOrganizationId) {
    return errorResponse(400, text.noActiveOrganization);
  }

  if (role !== "owner") {
    return errorResponse(403, text.ownerOnly);
  }

  const supabase = await supabaseServer();

  const [subscriptionResult, profileResult] = await Promise.all([
    supabase
      .from("organization_subscriptions")
      .select(
        "organization_id,billing_provider,provider_customer_id,provider_subscription_id"
      )
      .eq("organization_id", activeOrganizationId)
      .maybeSingle<SubscriptionRow>(),
    supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", ctx.user.id)
      .maybeSingle<ProfileRow>(),
  ]);

  if (subscriptionResult.error) {
    return errorResponse(
      500,
      text.failedToLoadSubscription,
      subscriptionResult.error.message
    );
  }

  if (profileResult.error) {
    return errorResponse(
      500,
      text.failedToLoadProfile,
      profileResult.error.message
    );
  }

  const subscription = subscriptionResult.data;
  if (!subscription) {
    return errorResponse(404, text.subscriptionNotFound);
  }

  if (subscription.billing_provider !== "stripe") {
    return errorResponse(400, text.stripeOnly);
  }

  const customerId = subscription.provider_customer_id?.trim();
  if (!customerId) {
    return errorResponse(400, text.customerIdMissing);
  }

  const preferredLanguage =
    profileResult.data?.preferred_language ?? language;

  const stripe = getStripeClient();
  const configuration = getStripePortalConfigurationId();

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: resolveReturnUrl(request),
    configuration: configuration ?? undefined,
    locale: normalizeStripeLocale(preferredLanguage),
  });

  if (!portalSession.url) {
    return errorResponse(500, text.portalUrlMissing);
  }

  return NextResponse.json({
    ok: true,
    url: portalSession.url,
  });
}