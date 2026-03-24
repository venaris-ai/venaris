// src/app/orga/subscription/page.tsx #12
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { getBillingPlan, BILLING_PLANS } from "@/lib/billing/plans";
import {
  canCreateCamera,
  canInviteMember,
  resolveSubscriptionState,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionPolicy";

type SubscriptionRow = {
  organization_id: string;
  plan_key: "starter" | "pro" | "enterprise";
  status: SubscriptionStatus;
  billing_cycle: "monthly" | "yearly";
  started_at: string | null;
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
  notes: string | null;
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

function addDays(value: string | null, days: number) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function getEffectiveTrialEnd(subscription: SubscriptionRow) {
  return subscription.trial_ends_at ?? addDays(subscription.started_at, 30);
}

function getTrialDaysLeft(value: string | null) {
  if (!value) return null;

  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return null;

  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return 0;

  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatPlanPrice(params: {
  subscription: Pick<
    SubscriptionRow,
    "plan_key" | "billing_cycle" | "price_amount_cents" | "price_currency"
  >;
  planPriceCents: number | null;
}) {
  const { subscription, planPriceCents } = params;

  if (subscription.price_amount_cents > 0) {
    return formatMoney(subscription.price_amount_cents, subscription.price_currency);
  }

  if (planPriceCents != null) {
    return formatMoney(planPriceCents, subscription.price_currency);
  }

  if (subscription.plan_key === "enterprise") {
    return "Individuell";
  }

  return "Noch nicht festgelegt";
}

function formatPlanLimit(value: number | null) {
  return value == null ? "Individuell" : String(value);
}

function planLabel(planKey: SubscriptionRow["plan_key"]) {
  switch (planKey) {
    case "starter":
      return "Starter";
    case "pro":
      return "Pro";
    case "enterprise":
      return "Enterprise";
    default:
      return planKey;
  }
}

function billingCycleLabel(cycle: SubscriptionRow["billing_cycle"]) {
  switch (cycle) {
    case "monthly":
      return "Monatlich";
    case "yearly":
      return "Jährlich";
    default:
      return cycle;
  }
}

function billingProviderLabel(provider: SubscriptionRow["billing_provider"]) {
  switch (provider) {
    case "none":
      return "Noch keiner";
    case "manual":
      return "Manuell";
    case "stripe":
      return "Stripe";
    default:
      return provider;
  }
}

function statusUi(status: SubscriptionStatus) {
  switch (status) {
    case "trialing":
      return {
        label: "Trialing",
        badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
        text: "Testphase aktiv. Die Organization kann Venaris innerhalb der aktuellen Limits nutzen.",
      };
    case "active":
      return {
        label: "Active",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        text: "Subscription aktiv. Nutzung innerhalb der Planlimits ist freigeschaltet.",
      };
    case "past_due":
      return {
        label: "Past Due",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        text: "Es besteht ein kommerzieller Klärungsbedarf. Bestehende Nutzung kann fortlaufen, neue Erweiterungen sind aktuell gesperrt.",
      };
    case "canceled":
      return {
        label: "Canceled",
        badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
        text: "Subscription wurde gekündigt. Bestehende Nutzung kann gegebenenfalls noch laufen, neue Erweiterungen sind gesperrt.",
      };
    case "expired":
      return {
        label: "Expired",
        badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
        text: "Subscription abgelaufen. Neue Erweiterungen sind aktuell nicht möglich.",
      };
    default:
      return {
        label: status,
        badgeClass: "border-gray-200 bg-gray-50 text-gray-700",
        text: "Unbekannter Status.",
      };
  }
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function UsageCard({
  title,
  used,
  allowed,
  detail,
  href,
  linkLabel,
}: {
  title: string;
  used: number;
  allowed: number;
  detail?: string;
  href?: string;
  linkLabel?: string;
}) {
  const percentage = allowed > 0 ? Math.min((used / allowed) * 100, 100) : 0;

  return (
    <div className="rounded-xl border bg-gray-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {title}
      </div>

      <div className="mt-2 flex items-end justify-between gap-4">
        <div className="text-2xl font-semibold text-gray-900">
          {used} / {allowed}
        </div>
        <div className="text-xs text-gray-500">
          {allowed > 0 ? `${Math.round(percentage)}% genutzt` : "—"}
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-gray-200">
        <div
          className="h-2 rounded-full bg-gray-700"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {detail ? <p className="mt-3 text-xs leading-5 text-gray-500">{detail}</p> : null}

      {href && linkLabel ? (
        <div className="mt-4">
          <Link
            href={href}
            className="inline-flex rounded-md border px-3 py-2 text-xs hover:bg-white"
          >
            {linkLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default async function OrgaSubscriptionPage() {
  const ctx = await getOptionalActiveOrganization();

  if (!ctx) {
    redirect("/login");
  }

  const organization = ctx.activeMembership.organizations;

  if (!organization) {
    throw new Error("Active organization not found in auth context.");
  }

  const supabase = supabaseServer();
  const nowIso = new Date().toISOString();

  const [
    subscriptionResult,
    cameraCountResult,
    memberCountResult,
    inviteCountResult,
  ] = await Promise.all([
    supabase
      .from("organization_subscriptions")
      .select(
        `
        organization_id,
        plan_key,
        status,
        billing_cycle,
        started_at,
        current_period_start,
        current_period_end,
        trial_ends_at,
        cancel_at_period_end,
        canceled_at,
        price_amount_cents,
        price_currency,
        max_cameras,
        max_members,
        billing_provider,
        notes
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
      .neq("status", "accepted")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  ]);

  if (subscriptionResult.error) {
    throw new Error(
      `Failed to load organization subscription: ${subscriptionResult.error.message}`
    );
  }

  if (cameraCountResult.error) {
    throw new Error(`Failed to load camera usage: ${cameraCountResult.error.message}`);
  }

  if (memberCountResult.error) {
    throw new Error(`Failed to load member usage: ${memberCountResult.error.message}`);
  }

  if (inviteCountResult.error) {
    throw new Error(`Failed to load invite usage: ${inviteCountResult.error.message}`);
  }

  const subscription = subscriptionResult.data;
  const cameraCount = cameraCountResult.count ?? 0;
  const memberCount = memberCountResult.count ?? 0;
  const openInviteCount = inviteCountResult.count ?? 0;

  if (!subscription) {
    return (
      <main className="space-y-8">
        <section className="space-y-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Subscription</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Hier siehst Du den kommerziellen Rahmen der aktiven Organization:
              Plan, Status, Laufzeit, Limits und Billing-Basis.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-medium text-amber-900">
            Keine Subscription gefunden
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900/80">
            Für diese Organization ist aktuell noch keine Subscription hinterlegt.
            Bitte prüfe Backfill, Trigger oder die Anlage der Organization.
          </p>
        </section>
      </main>
    );
  }

  const policyInput = {
    status: subscription.status,
    trialEndsAt: subscription.trial_ends_at,
    currentPeriodEnd: subscription.current_period_end,
    maxCameras: subscription.max_cameras,
    maxMembers: subscription.max_members,
    currentCameraCount: cameraCount,
    activeMemberCount: memberCount,
    openInviteCount,
  } as const;

  const resolvedState = resolveSubscriptionState(policyInput);
  const effectiveStatus = resolvedState.effectiveStatus;
  const status = statusUi(effectiveStatus);
  const cameraPolicy = canCreateCamera(policyInput);
  const memberPolicy = canInviteMember(policyInput);

  const plan = getBillingPlan(subscription.plan_key);
  const displayPrice = plan
    ? formatPlanPrice({
        subscription,
        planPriceCents:
          subscription.billing_cycle === "yearly"
            ? plan.yearlyPriceCents
            : plan.monthlyPriceCents,
      })
    : "—";

  const effectiveTrialEnd = getEffectiveTrialEnd(subscription);
  const trialDaysLeft = getTrialDaysLeft(effectiveTrialEnd);

  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Subscription</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Hier siehst Du Plan, Status, Laufzeit, Limits und den vorbereiteten
            Upgrade-Pfad der aktiven Organization.
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border bg-white p-6 shadow-sm xl:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">
              {planLabel(subscription.plan_key)}
            </h2>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${status.badgeClass}`}
            >
              {status.label}
            </span>
          </div>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
            {status.text}
          </p>

          {resolvedState.effectiveStatus !== subscription.status ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-medium text-red-900">
                Trial fachlich abgelaufen
              </div>
              <p className="mt-2 text-sm leading-6 text-red-800">
                Der gespeicherte Status ist aktuell noch <code>{subscription.status}</code>,
                wird aber fachlich bereits als <code>expired</code> behandelt, weil
                das Trial-Ende überschritten ist.
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <UsageCard
              title="Kameras"
              used={cameraCount}
              allowed={subscription.max_cameras}
              detail={cameraPolicy.message}
              href="/cameras/new"
              linkLabel="Kameraanlage öffnen"
            />
            <UsageCard
              title="Members"
              used={resolvedState.currentMemberUsage}
              allowed={subscription.max_members}
              detail={memberPolicy.message}
              href="/orga/members/invite"
              linkLabel="Members öffnen"
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium">Billing Snapshot</h2>

          <dl className="mt-4">
            <FieldRow label="Preis inkl. MwSt." value={displayPrice} />
            <FieldRow
              label="Abrechnung"
              value={billingCycleLabel(subscription.billing_cycle)}
            />
            <FieldRow label="Trial endet" value={formatDate(effectiveTrialEnd)} />
            <FieldRow
              label="Trial verbleibend"
              value={
                trialDaysLeft == null
                  ? "—"
                  : trialDaysLeft === 0
                  ? "Abgelaufen"
                  : `${trialDaysLeft} Tage`
              }
            />
            <FieldRow label="Status effektiv" value={status.label} />
            <FieldRow
              label="Provider"
              value={billingProviderLabel(subscription.billing_provider)}
            />
          </dl>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Planoptionen</h2>
            <p className="mt-1 text-sm text-gray-600">
              Hier ist der vorbereitete Upgrade-Pfad über die verfügbaren Venaris-Pläne.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {(["starter", "pro", "enterprise"] as const).map((planKey) => {
            const planDef = BILLING_PLANS[planKey];
            const isCurrent = subscription.plan_key === planKey;

            const priceText =
              subscription.billing_cycle === "yearly"
                ? planDef.yearlyPriceCents != null
                  ? formatMoney(planDef.yearlyPriceCents, subscription.price_currency)
                  : "Individuell"
                : planDef.monthlyPriceCents != null
                ? formatMoney(planDef.monthlyPriceCents, subscription.price_currency)
                : "Individuell";

            return (
              <div
                key={planKey}
                className={`rounded-2xl border p-5 ${
                  isCurrent ? "border-blue-300 bg-blue-50" : "bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-semibold text-gray-900">
                    {planDef.label}
                  </div>
                  {isCurrent ? (
                    <span className="rounded-full border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-900">
                      Aktueller Plan
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {planDef.description}
                </p>

                <div className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">
                  {priceText}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {billingCycleLabel(subscription.billing_cycle)} · inkl. MwSt.
                </div>

                <div className="mt-4 space-y-2 text-sm text-gray-700">
                  <div>Kameras: {formatPlanLimit(planDef.maxCameras)}</div>
                  <div>Members: {formatPlanLimit(planDef.maxMembers)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}