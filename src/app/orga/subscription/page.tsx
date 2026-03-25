// src/app/orga/subscription/page.tsx #14
import { requireActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { BILLING_PLANS, type BillingCycle } from "@/lib/billing/plans";
import {
  resolveSubscriptionState,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionPolicy";
import PlanSelectionCards from "@/components/PlanSelectionCards";

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
};

type OpenRequestRow = {
  requested_plan_key: "starter" | "pro" | "enterprise";
  request_type: "upgrade" | "downgrade" | "change";
  status: "open";
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function billingCycleLabel(cycle: BillingCycle) {
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
}

function billingProviderLabel(provider: SubscriptionRow["billing_provider"]) {
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

function planPriceText(subscription: SubscriptionRow) {
  if (subscription.price_amount_cents > 0) {
    return formatMoney(subscription.price_amount_cents, subscription.price_currency);
  }

  const plan = BILLING_PLANS[subscription.plan_key];
  const cents =
    subscription.billing_cycle === "yearly"
      ? plan.yearlyPriceCents
      : plan.monthlyPriceCents;

  if (cents == null) {
    return "Individuell";
  }

  return formatMoney(cents, subscription.price_currency);
}

function statusUi(status: SubscriptionStatus) {
  switch (status) {
    case "trialing":
      return {
        label: "Trialing",
        badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
      };
    case "active":
      return {
        label: "Active",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "past_due":
      return {
        label: "Past Due",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "canceled":
      return {
        label: "Canceled",
        badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
      };
    case "expired":
      return {
        label: "Expired",
        badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      };
    default:
      return {
        label: status,
        badgeClass: "border-gray-200 bg-gray-50 text-gray-700",
      };
  }
}

function Section({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="mt-1 text-sm text-gray-600">{text}</p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default async function SubscriptionPage() {
  const ctx = await requireActiveOrganization();
  const supabase = supabaseServer();
  const organization = ctx.activeMembership.organizations;
  const nowIso = new Date().toISOString();

  if (!organization) {
    throw new Error("Active organization not found");
  }

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
        billing_provider
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
  const openRequest = openRequestResult.data ?? null;

  if (!subscription) {
    return (
      <main className="space-y-8">
        <Section
          title="Subscription"
          text="Für diese Organization wurde noch keine Subscription gefunden."
        >
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Bitte prüfe die Subscription-Konfiguration in der Datenbank.
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

  const effectiveStatus = statusUi(resolved.effectiveStatus);

  return (
    <main className="space-y-8">
      <Section
        title="Subscription"
        text="Status, aktueller Plan und verfügbare Planoptionen der aktiven Organization."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-semibold text-gray-900">
                {BILLING_PLANS[subscription.plan_key].label}
              </div>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${effectiveStatus.badgeClass}`}
              >
                {effectiveStatus.label}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <div>
                Preis: {planPriceText(subscription)} inkl. MwSt. ·{" "}
                {billingCycleLabel(subscription.billing_cycle)}
              </div>
              <div>Abrechnung: {billingProviderLabel(subscription.billing_provider)}</div>
              <div>Trial endet: {formatDate(subscription.trial_ends_at)}</div>
              <div>
                Periode bis: {formatDate(subscription.current_period_end)}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm font-medium text-gray-500">
              Aktuelle Nutzung
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <div>
                Kameras: {currentCameraCount} / {subscription.max_cameras}
              </div>
              <div>
                Members inkl. offene Invites: {currentMemberUsage} /{" "}
                {subscription.max_members}
              </div>
              <div>Aktive Members: {activeMemberCount}</div>
              <div>Offene Invites: {openInviteCount}</div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Plan auswählen"
        text="Wähle den passenden Plan für Deine Organization. Kleinere Pläne sind nur auswählbar, wenn die aktuelle Nutzung in die Ziel-Limits passt."
      >
        <PlanSelectionCards
          currentPlanKey={subscription.plan_key}
          billingCycle={subscription.billing_cycle}
          currency={subscription.price_currency}
          currentCameraCount={currentCameraCount}
          currentMemberUsage={currentMemberUsage}
          currentStatusLabel={effectiveStatus.label}
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
        />
      </Section>
    </main>
  );
}