// src/app/orga/subscription/page.tsx #23
import type { ReactNode } from "react";
import SubscriptionSyncNotice from "@/components/SubscriptionSyncNotice";
import StripeBillingPortalButton from "@/components/StripeBillingPortalButton";
import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import { BILLING_PLANS, type BillingCycle } from "@/lib/billing/plans";
import {
  resolveSubscriptionState,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionPolicy";
import PlanSelectionCards from "@/components/PlanSelectionCards";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import { formatAppDate as formatDate } from "@/lib/dateTime";

type ScheduledChangeType = "upgrade" | "downgrade" | "cancel";

type SubscriptionRow = {
  plan_key: "starter" | "pro" | "enterprise";
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  trial_ends_at: string | null;
  current_period_end: string | null;
  price_amount_cents: number;
  price_currency: string;
  max_cameras: number;
  max_members: number;
  billing_provider: "none" | "manual" | "stripe";
  provider_subscription_id: string | null;
  scheduled_plan_key: "starter" | "pro" | "enterprise" | null;
  scheduled_change_type: ScheduledChangeType | null;
  scheduled_change_effective_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

type OpenRequestRow = {
  requested_plan_key: "starter" | "pro" | "enterprise";
  request_type: "upgrade" | "downgrade" | "change";
  status: "open";
  created_at: string | null;
};

async function resolveUiLanguageForProtectedPath(pathname: string) {
  const ctx = await requirePathAccess(pathname);

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const supabase = supabaseServer();
  const cookieStore = await cookies();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  return { ctx, supabase, language };
}

function formatMoney(
  amountCents: number,
  currency: string,
  language: AppLanguage
) {
  return new Intl.NumberFormat(language === "en" ? "en-GB" : "de-DE", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function billingCycleLabel(cycle: BillingCycle, language: AppLanguage) {
  if (language === "en") {
    return cycle === "yearly" ? "Yearly" : "Monthly";
  }
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
}

function billingProviderLabel(
  provider: SubscriptionRow["billing_provider"],
  language: AppLanguage
) {
  if (language === "en") {
    switch (provider) {
      case "manual":
        return "Manual";
      case "stripe":
        return "Stripe";
      case "none":
        return "No billing";
      default:
        return provider;
    }
  }

  switch (provider) {
    case "manual":
      return "Manuell";
    case "stripe":
      return "Stripe";
    case "none":
      return "Keine Abrechnung";
    default:
      return provider;
  }
}

function planPriceText(subscription: SubscriptionRow, language: AppLanguage) {
  if (subscription.price_amount_cents > 0) {
    return formatMoney(
      subscription.price_amount_cents,
      subscription.price_currency,
      language
    );
  }

  const plan = BILLING_PLANS[subscription.plan_key];
  const cents =
    subscription.billing_cycle === "yearly"
      ? plan.yearlyPriceCents
      : plan.monthlyPriceCents;

  if (cents == null) {
    return language === "en" ? "Custom" : "Individuell";
  }

  return formatMoney(cents, subscription.price_currency, language);
}

function statusUi(status: SubscriptionStatus, language: AppLanguage) {
  if (language === "en") {
    switch (status) {
      case "trialing":
        return {
          label: "Trial",
          badgeClass: "border-sky-300/25 bg-sky-300/10 text-sky-200",
        };
      case "active":
        return {
          label: "Active",
          badgeClass:
            "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
        };
      case "past_due":
        return {
          label: "Past Due",
          badgeClass: "border-amber-300/25 bg-amber-300/10 text-amber-200",
        };
      case "canceled":
        return {
          label: "Canceled",
          badgeClass: "border-orange-300/25 bg-orange-300/10 text-orange-200",
        };
      case "expired":
        return {
          label: "Expired",
          badgeClass: "border-rose-300/25 bg-rose-300/10 text-rose-200",
        };
      default:
        return {
          label: status,
          badgeClass: "border-white/10 bg-white/5 text-white/72",
        };
    }
  }

  switch (status) {
    case "trialing":
      return {
        label: "Trial",
        badgeClass: "border-sky-300/25 bg-sky-300/10 text-sky-200",
      };
    case "active":
      return {
        label: "Active",
        badgeClass: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
      };
    case "past_due":
      return {
        label: "Past Due",
        badgeClass: "border-amber-300/25 bg-amber-300/10 text-amber-200",
      };
    case "canceled":
      return {
        label: "Canceled",
        badgeClass: "border-orange-300/25 bg-orange-300/10 text-orange-200",
      };
    case "expired":
      return {
        label: "Expired",
        badgeClass: "border-rose-300/25 bg-rose-300/10 text-rose-200",
      };
    default:
      return {
        label: status,
        badgeClass: "border-white/10 bg-white/5 text-white/72",
      };
  }
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        eyebrow: "Subscription",
        pageTitle: "Subscription",
        pageText:
          "Status, current plan and available plan options for the active organization.",
        missingPageText:
          "No subscription was found for this organization yet.",
        missingSectionTitle: "Subscription",
        missingSectionText:
          "No subscription was found for this organization yet.",
        missingBoxText:
          "Please review the subscription configuration in the database.",
        currentSectionTitle: "Subscription",
        currentSectionText:
          "Status, current plan and available plan options for the active organization.",
        usageTitle: "Current usage",
        priceLabel: "Price",
        billingLabel: "Billing",
        trialEndsLabel: "Trial ends",
        periodUntilLabel: "Current period until",
        camerasLabel: "Cameras",
        membersWithInvitesLabel: "Members incl. open invites",
        activeMembersLabel: "Active members",
        openInvitesLabel: "Open invites",
        choosePlanTitle: "Choose plan",
        choosePlanText:
          "Choose the right plan for your organization. Smaller plans can only be selected if current usage fits the target limits.",
        inclVat: "incl. VAT",
        stripeBoxTitle: "Self-service billing",
        stripeBoxText:
          "Starter and Pro are managed via Stripe. The first activation from a trial uses checkout. Plan changes for existing Stripe subscriptions are triggered directly here. Payment method changes and cancellation continue via the Stripe Billing Portal.",
        manualBoxTitle: "Manual billing",
        manualBoxText:
          "This subscription is managed manually by Venaris. Enterprise requests continue to run through the manual approval process.",
        noneBoxTitle: "Trial / no billing provider yet",
        noneBoxText:
          "Venaris is a brand of easg.aero GmbH & Co. KG. Starter and Pro can be activated directly via our billing provider Stripe.",
        scheduledDowngrade: (planLabel: string, date: string) =>
          `Scheduled from ${date}: ${planLabel}`,
        scheduledUpgrade: (planLabel: string, date: string) =>
          `Scheduled from ${date}: ${planLabel}`,
        scheduledCancel: (date: string) => `Canceled effective ${date}`,
      }
    : {
        eyebrow: "Abo",
        pageTitle: "Abo",
        pageText:
          "Status, aktueller Plan und verfügbare Planoptionen der aktiven Organization.",
        missingPageText:
          "Für diese Organisation wurde noch kein Abo gefunden.",
        missingSectionTitle: "Abo",
        missingSectionText:
          "Für diese Organisation wurde noch kein Abo gefunden.",
        missingBoxText:
          "Bitte prüfe die Abo-Konfiguration in der Datenbank.",
        currentSectionTitle: "Abo",
        currentSectionText:
          "Status, aktueller Plan und verfügbare Planoptionen der aktiven Organization.",
        usageTitle: "Aktuelle Nutzung",
        priceLabel: "Preis",
        billingLabel: "Abrechnung",
        trialEndsLabel: "Trial endet",
        periodUntilLabel: "Periode bis",
        camerasLabel: "Kameras",
        membersWithInvitesLabel: "Mitglieder inkl. offene Einladungen",
        activeMembersLabel: "Aktive Mitglieder",
        openInvitesLabel: "Offene Einladungen",
        choosePlanTitle: "Plan auswählen",
        choosePlanText:
          "Wähle den passenden Plan für Deine Organization. Kleinere Pläne sind nur auswählbar, wenn die aktuelle Nutzung in die Ziel-Limits passt.",
        inclVat: "inkl. MwSt.",
        stripeBoxTitle: "Self-Service-Billing",
        stripeBoxText:
          "Starter und Pro werden über Stripe verwaltet. Die erste Aktivierung aus dem Trial läuft über einen sicheren Checkout. Planwechsel bestehender Stripe-Abos werden direkt hier angestoßen. Änderungen an Zahlungsmethode und Kündigung laufen weiterhin über das Stripe Billing Portal.",
        manualBoxTitle: "Manuelle Abrechnung",
        manualBoxText:
          "Dieses Abo wird manuell durch Venaris verwaltet. Enterprise-Anfragen laufen weiterhin über den manuellen Freigabeprozess.",
        noneBoxTitle: "Trial / noch kein Billing-Provider",
        noneBoxText:
          "Venaris ist eine Marke der easg.aero GmbH & Co. KG. Starter und Pro können über unseren Billing-Provider Stripe direkt aktiviert werden.",
        scheduledDowngrade: (planLabel: string, date: string) =>
          `Geplant ab ${date}: ${planLabel}`,
        scheduledUpgrade: (planLabel: string, date: string) =>
          `Geplant ab ${date}: ${planLabel}`,
        scheduledCancel: (date: string) => `Gekündigt zum ${date}`,
      };
}

function Section({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div>
        <h2 className="text-lg font-medium text-white">{title}</h2>
        <p className="mt-1 text-sm text-white/65">{text}</p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default async function SubscriptionPage() {
  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    "/orga/subscription"
  );

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const nowIso = new Date().toISOString();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const text = t(language);

  const [
    subscriptionResult,
    camerasCountResult,
    membersCountResult,
    invitesCountResult,
    openRequestResult,
  ] = await Promise.all([
    supabase
      .from("organization_subscriptions")
      .select(
        `
        plan_key,
        status,
        billing_cycle,
        trial_ends_at,
        current_period_end,
        price_amount_cents,
        price_currency,
        max_cameras,
        max_members,
        billing_provider,
        provider_subscription_id,
        scheduled_plan_key,
        scheduled_change_type,
        scheduled_change_effective_at,
        cancel_at_period_end,
        canceled_at
        `
      )
      .eq("organization_id", organization.id)
      .maybeSingle<SubscriptionRow>(),

    supabase
      .from("cameras")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),

    supabase
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", organization.id),

    supabase
      .from("organization_invites")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "pending")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`),

    supabase
      .from("organization_subscription_change_requests")
      .select("requested_plan_key,request_type,status,created_at")
      .eq("organization_id", organization.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<OpenRequestRow>(),
  ]);

  if (subscriptionResult.error) {
    throw new Error(
      `Failed to load subscription: ${subscriptionResult.error.message}`
    );
  }

  if (camerasCountResult.error) {
    throw new Error(
      `Failed to load camera count: ${camerasCountResult.error.message}`
    );
  }

  if (membersCountResult.error) {
    throw new Error(
      `Failed to load member count: ${membersCountResult.error.message}`
    );
  }

  if (invitesCountResult.error) {
    throw new Error(
      `Failed to load invite count: ${invitesCountResult.error.message}`
    );
  }

  if (openRequestResult.error) {
    throw new Error(
      `Failed to load open subscription request: ${openRequestResult.error.message}`
    );
  }

  const subscription = subscriptionResult.data;
  const currentCameraCount = camerasCountResult.count ?? 0;
  const activeMemberCount = membersCountResult.count ?? 0;
  const openInviteCount = invitesCountResult.count ?? 0;
  const currentMemberUsage = activeMemberCount + openInviteCount;
  const openRequest =
    openRequestResult.data?.requested_plan_key === "enterprise"
      ? openRequestResult.data
      : null;

  if (!subscription) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              {text.eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {text.pageTitle}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-white/68">
              {text.missingPageText}
            </p>
          </div>
        </section>

        <Section
          title={text.missingSectionTitle}
          text={text.missingSectionText}
        >
          <div className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100">
            {text.missingBoxText}
          </div>
        </Section>
      </main>
    );
  }

  const resolved = resolveSubscriptionState({
    status: subscription.status,
    trialEndsAt: subscription.trial_ends_at,
    currentPeriodEnd: subscription.current_period_end,
    maxCameras: subscription.max_cameras,
    maxMembers: subscription.max_members,
    currentCameraCount,
    activeMemberCount,
    openInviteCount,
  });

  const effectiveStatus = statusUi(resolved.effectiveStatus, language);

  const existingScheduledChange =
    subscription.scheduled_plan_key &&
    (subscription.scheduled_change_type === "upgrade" ||
      subscription.scheduled_change_type === "downgrade") &&
    (subscription.scheduled_plan_key === "starter" ||
      subscription.scheduled_plan_key === "pro")
      ? {
          requestedPlanKey: subscription.scheduled_plan_key,
          requestType: subscription.scheduled_change_type,
          scheduledFor: subscription.scheduled_change_effective_at,
        }
      : null;

  const cancellationNotice =
    subscription.scheduled_change_type === "cancel" &&
    subscription.scheduled_change_effective_at
      ? text.scheduledCancel(
          formatDate(subscription.scheduled_change_effective_at, language)
        )
      : null;

  const scheduledPlanNotice =
    subscription.scheduled_plan_key &&
    subscription.scheduled_change_effective_at &&
    subscription.scheduled_change_type === "downgrade"
      ? text.scheduledDowngrade(
          BILLING_PLANS[subscription.scheduled_plan_key].label,
          formatDate(subscription.scheduled_change_effective_at, language)
        )
      : subscription.scheduled_plan_key &&
          subscription.scheduled_change_effective_at &&
          subscription.scheduled_change_type === "upgrade"
        ? text.scheduledUpgrade(
            BILLING_PLANS[subscription.scheduled_plan_key].label,
            formatDate(subscription.scheduled_change_effective_at, language)
          )
        : null;

  return (
    <main className="space-y-8">
      <SubscriptionSyncNotice language={language} />
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.pageTitle}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            {text.pageText}
          </p>
        </div>
      </section>

      <Section title={text.currentSectionTitle} text={text.currentSectionText}>
        {cancellationNotice ? (
          <div className="mb-4 rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
            {cancellationNotice}
          </div>
        ) : null}

        {scheduledPlanNotice ? (
          <div className="mb-4 rounded-[24px] border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-sky-100">
            {scheduledPlanNotice}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-semibold text-white">
                {BILLING_PLANS[subscription.plan_key].label}
              </div>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${effectiveStatus.badgeClass}`}
              >
                {effectiveStatus.label}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-white/72">
              <div>
                {text.priceLabel}: {planPriceText(subscription, language)}{" "}
                {text.inclVat} ·{" "}
                {billingCycleLabel(subscription.billing_cycle, language)}
              </div>
              <div>
                {text.billingLabel}:{" "}
                {billingProviderLabel(subscription.billing_provider, language)}
              </div>
              <div>
                {text.trialEndsLabel}:{" "}
                {formatDate(subscription.trial_ends_at, language)}
              </div>
              <div>
                {text.periodUntilLabel}:{" "}
                {formatDate(subscription.current_period_end, language)}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-white/50">
              {text.usageTitle}
            </div>

            <div className="mt-4 space-y-2 text-sm text-white/72">
              <div>
                {text.camerasLabel}: {currentCameraCount} / {subscription.max_cameras}
              </div>
              <div>
                {text.membersWithInvitesLabel}: {currentMemberUsage} /{" "}
                {subscription.max_members}
              </div>
              <div>{text.activeMembersLabel}: {activeMemberCount}</div>
              <div>{text.openInvitesLabel}: {openInviteCount}</div>
            </div>
          </div>
        </div>
      </Section>

      <Section title={text.choosePlanTitle} text={text.choosePlanText}>
        {subscription.billing_provider === "stripe" ? (
          <div className="mb-6 rounded-[24px] border border-sky-300/20 bg-sky-300/10 p-5 text-sm text-sky-100">
            <div className="font-medium text-white">{text.stripeBoxTitle}</div>
            <p className="mt-2 leading-6 text-sky-100/90">{text.stripeBoxText}</p>
            <div className="mt-4">
              <StripeBillingPortalButton language={language} />
            </div>
          </div>
        ) : null}

        {subscription.billing_provider === "manual" ? (
          <div className="mb-6 rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100">
            <div className="font-medium text-white">{text.manualBoxTitle}</div>
            <p className="mt-2 leading-6 text-amber-100/90">{text.manualBoxText}</p>
          </div>
        ) : null}

        {subscription.billing_provider === "none" ? (
          <div className="mb-6 rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-5 text-sm text-emerald-100">
            <div className="font-medium text-white">{text.noneBoxTitle}</div>
            <p className="mt-2 leading-6 text-emerald-100/90">{text.noneBoxText}</p>
          </div>
        ) : null}

        <PlanSelectionCards
          currentPlanKey={subscription.plan_key}
          billingCycle={subscription.billing_cycle}
          currency={subscription.price_currency}
          currentCameraCount={currentCameraCount}
          currentMemberUsage={currentMemberUsage}
          currentStatusLabel={effectiveStatus.label}
          billingProvider={subscription.billing_provider}
          existingOpenRequest={
            openRequest
              ? {
                  requestedPlanKey: openRequest.requested_plan_key,
                  requestType: openRequest.request_type,
                  status: openRequest.status,
                  createdAt: openRequest.created_at,
                }
              : null
          }
          existingScheduledChange={existingScheduledChange}
          language={language}
        />
      </Section>
    </main>
  );
}