// src/app/orga/page.tsx #1
import Link from "next/link";
import { requireActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { getBillingPlan } from "@/lib/billing/plans";
import {
  resolveSubscriptionState,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionPolicy";

type SubscriptionRow = {
  plan_key: "starter" | "pro" | "enterprise";
  status: SubscriptionStatus;
  billing_cycle: "monthly" | "yearly";
  trial_ends_at: string | null;
  current_period_end: string | null;
  price_amount_cents: number;
  price_currency: string;
  max_cameras: number;
  max_members: number;
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

function billingCycleLabel(cycle: "monthly" | "yearly") {
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
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

function formatPlanPrice(subscription: SubscriptionRow) {
  const plan = getBillingPlan(subscription.plan_key);

  if (subscription.price_amount_cents > 0) {
    return formatMoney(subscription.price_amount_cents, subscription.price_currency);
  }

  if (!plan) return "—";

  const price =
    subscription.billing_cycle === "yearly"
      ? plan.yearlyPriceCents
      : plan.monthlyPriceCents;

  if (price != null) {
    return formatMoney(price, subscription.price_currency);
  }

  return subscription.plan_key === "enterprise" ? "Individuell" : "Noch nicht festgelegt";
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

function StatCard({
  title,
  value,
  subline,
}: {
  title: string;
  value: string;
  subline?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
        {value}
      </div>
      {subline ? (
        <p className="mt-2 text-sm leading-6 text-gray-600">{subline}</p>
      ) : null}
    </div>
  );
}

function ActionLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
    >
      {label}
    </Link>
  );
}

export default async function OrgaPage() {
  const ctx = await requireActiveOrganization();
  const supabase = supabaseServer();

  const organization = ctx.activeMembership.organizations;
  const role = ctx.activeMembership.role;
  const userEmail = ctx.user.email ?? "—";
  const nowIso = new Date().toISOString();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const [
    reviersResult,
    membersResult,
    invitesResult,
    subscriptionResult,
    camerasResult,
  ] = await Promise.all([
    supabase
      .from("reviers")
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
        max_members
        `
      )
      .eq("organization_id", organization.id)
      .maybeSingle<SubscriptionRow>(),

    supabase
      .from("cameras")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
  ]);

  if (reviersResult.error) {
    throw new Error(`Failed to load reviers summary: ${reviersResult.error.message}`);
  }

  if (membersResult.error) {
    throw new Error(`Failed to load members summary: ${membersResult.error.message}`);
  }

  if (invitesResult.error) {
    throw new Error(`Failed to load invites summary: ${invitesResult.error.message}`);
  }

  if (subscriptionResult.error) {
    throw new Error(
      `Failed to load subscription summary: ${subscriptionResult.error.message}`
    );
  }

  if (camerasResult.error) {
    throw new Error(`Failed to load cameras summary: ${camerasResult.error.message}`);
  }

  const reviersCount = reviersResult.count ?? 0;
  const membersCount = membersResult.count ?? 0;
  const openInvitesCount = invitesResult.count ?? 0;
  const camerasCount = camerasResult.count ?? 0;
  const subscription = subscriptionResult.data;

  const resolvedSubscription = subscription
    ? resolveSubscriptionState({
        status: subscription.status,
        trialEndsAt: subscription.trial_ends_at,
        currentPeriodEnd: subscription.current_period_end,
        maxCameras: subscription.max_cameras,
        maxMembers: subscription.max_members,
        currentCameraCount: camerasCount,
        activeMemberCount: membersCount,
        openInviteCount: openInvitesCount,
      })
    : null;

  const effectiveStatus = subscription
    ? statusUi(resolvedSubscription?.effectiveStatus ?? subscription.status)
    : null;

  const planPrice = subscription ? formatPlanPrice(subscription) : "—";

  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Orga</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Überblick über Konto, Reviere, Members und Subscription der aktiven
            Organization.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Reviere"
          value={String(reviersCount)}
          subline="Aktuelle Revier-Struktur dieser Organization."
        />
        <StatCard
          title="Members"
          value={String(membersCount)}
          subline={`${openInvitesCount} offene Invites`}
        />
        <StatCard
          title="Kameras"
          value={String(camerasCount)}
          subline={
            subscription
              ? `${camerasCount} / ${subscription.max_cameras} im aktiven Plan`
              : "Keine Subscription gefunden"
          }
        />
        <StatCard
          title="Subscription"
          value={subscription ? planLabel(subscription.plan_key) : "—"}
          subline={
            subscription
              ? `${effectiveStatus?.label ?? "—"} · ${planPrice} inkl. MwSt.`
              : "Keine Subscription hinterlegt"
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Mein Konto</h2>
              <p className="mt-1 text-sm text-gray-600">
                Aktiver Organisationskontext und Deine Rolle.
              </p>
            </div>
            <ActionLink href="/orga/account" label="Mein Konto öffnen" />
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3">
              <dt className="text-gray-500">Organization</dt>
              <dd className="text-right font-medium text-gray-900">
                {organization.name}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3">
              <dt className="text-gray-500">Slug</dt>
              <dd className="text-right font-medium text-gray-900">
                {organization.slug}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3">
              <dt className="text-gray-500">Deine Rolle</dt>
              <dd className="text-right font-medium capitalize text-gray-900">
                {role}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">E-Mail</dt>
              <dd className="text-right font-medium text-gray-900">
                {userEmail}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Reviere</h2>
              <p className="mt-1 text-sm text-gray-600">
                Fachliche Flächen- und Revierstruktur der Organization.
              </p>
            </div>
            <div className="flex gap-2">
              <ActionLink href="/orga/reviere" label="Reviere öffnen" />
              <ActionLink href="/orga/reviere/new" label="Neues Revier" />
            </div>
          </div>

          <div className="mt-6 rounded-xl border bg-gray-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Status
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {reviersCount}
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Reviere sind angelegt und über die Orga-Verwaltung administrierbar.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Members</h2>
              <p className="mt-1 text-sm text-gray-600">
                Teamzugänge, Rollen und offene Einladungen.
              </p>
            </div>
            <div className="flex gap-2">
              <ActionLink href="/orga/members" label="Members öffnen" />
              <ActionLink href="/orga/members/invite" label="Mitglied einladen" />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Aktive Members
              </div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">
                {membersCount}
              </div>
            </div>

            <div className="rounded-xl border bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Offene Invites
              </div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">
                {openInvitesCount}
              </div>
            </div>
          </div>

          {subscription && resolvedSubscription ? (
            <p className="mt-4 text-sm text-gray-600">
              Aktuell angerechnet: {resolvedSubscription.currentMemberUsage} von{" "}
              {subscription.max_members} Members.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Subscription</h2>
              <p className="mt-1 text-sm text-gray-600">
                Kommerzieller Rahmen, Plan und aktuelle Nutzungsgrenzen.
              </p>
            </div>
            <ActionLink href="/orga/subscription" label="Subscription öffnen" />
          </div>

          {!subscription ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Für diese Organization wurde noch keine Subscription gefunden.
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="text-2xl font-semibold text-gray-900">
                  {planLabel(subscription.plan_key)}
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${effectiveStatus?.badgeClass}`}
                >
                  {effectiveStatus?.label}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-gray-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Preis
                  </div>
                  <div className="mt-2 text-xl font-semibold text-gray-900">
                    {planPrice}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {billingCycleLabel(subscription.billing_cycle)} · inkl. MwSt.
                  </p>
                </div>

                <div className="rounded-xl border bg-gray-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Nutzung
                  </div>
                  <div className="mt-2 text-sm font-medium text-gray-900">
                    Kameras: {camerasCount} / {subscription.max_cameras}
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    Members: {resolvedSubscription?.currentMemberUsage ?? 0} /{" "}
                    {subscription.max_members}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-600">
                Trial endet: {formatDate(subscription.trial_ends_at)} · Periode bis:{" "}
                {formatDate(subscription.current_period_end)}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}