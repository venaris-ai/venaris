// src/app/orga/page.tsx #3
import Link from "next/link";
import { requirePathAccess, canAccessPath } from "@/lib/authz";
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
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="text-sm text-white/50">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      {subline ? (
        <p className="mt-2 text-sm leading-6 text-white/68">{subline}</p>
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
      className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 backdrop-blur-sm hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
    >
      {label}
    </Link>
  );
}

export default async function OrgaPage() {
  const ctx = await requirePathAccess("/orga");
  const supabase = supabaseServer();

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const role = ctx.activeMembership.role;
  const userEmail = ctx.user.email ?? null;
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

  const canSeeSubscription = canAccessPath({
    pathname: "/orga/subscription",
    role,
    email: userEmail,
  });

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Organization
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Organisation
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            Überblick über Konto, Reviere, Members und – sofern freigegeben –
            die Subscription der aktiven Organization.
          </p>
        </div>
      </section>

      <section
        className={`grid gap-4 md:grid-cols-2 ${
          canSeeSubscription ? "xl:grid-cols-4" : "xl:grid-cols-3"
        }`}
      >
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
        {canSeeSubscription ? (
          <StatCard
            title="Subscription"
            value={subscription ? planLabel(subscription.plan_key) : "—"}
            subline={
              subscription
                ? `${effectiveStatus?.label ?? "—"} · ${planPrice} inkl. MwSt.`
                : "Keine Subscription hinterlegt"
            }
          />
        ) : null}
      </section>

      <section
        className={`grid gap-4 ${
          canSeeSubscription ? "xl:grid-cols-2" : "xl:grid-cols-3"
        }`}
      >
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">Mein Konto</h2>
              <p className="mt-1 text-sm text-white/65">
                Aktiver Organisationskontext und Deine Rolle.
              </p>
            </div>
            <ActionLink href="/orga/account" label="Mein Konto öffnen" />
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-white/45">Organization</dt>
              <dd className="text-right font-medium text-white">
                {organization.name}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-white/45">Slug</dt>
              <dd className="text-right font-medium text-white">
                {organization.slug}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-white/45">Deine Rolle</dt>
              <dd className="text-right font-medium capitalize text-white">
                {role}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-white/45">E-Mail</dt>
              <dd className="text-right font-medium text-white">
                {userEmail ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">Reviere</h2>
              <p className="mt-1 text-sm text-white/65">
                Fachliche Flächen- und Revierstruktur der Organization.
              </p>
            </div>
            <div className="flex gap-2">
              <ActionLink href="/orga/reviere" label="Reviere öffnen" />
              <ActionLink href="/orga/reviere/new" label="Neues Revier" />
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-white/45">
              Status
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {reviersCount}
            </div>
            <p className="mt-2 text-sm leading-6 text-white/68">
              Reviere sind angelegt und über die Orga-Verwaltung administrierbar.
            </p>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">Members</h2>
              <p className="mt-1 text-sm text-white/65">
                Teamzugänge, Rollen und offene Einladungen.
              </p>
            </div>
            <div className="flex gap-2">
              <ActionLink href="/orga/members" label="Members öffnen" />
              <ActionLink href="/orga/members/invite" label="Mitglied einladen" />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                Aktive Members
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {membersCount}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                Offene Invites
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {openInvitesCount}
              </div>
            </div>
          </div>

          {subscription && resolvedSubscription ? (
            <p className="mt-4 text-sm text-white/68">
              Aktuell angerechnet: {resolvedSubscription.currentMemberUsage} von{" "}
              {subscription.max_members} Members.
            </p>
          ) : null}
        </div>

        {canSeeSubscription ? (
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-white">Subscription</h2>
                <p className="mt-1 text-sm text-white/65">
                  Kommerzieller Rahmen, Plan und aktuelle Nutzungsgrenzen.
                </p>
              </div>
              <ActionLink href="/orga/subscription" label="Subscription öffnen" />
            </div>

            {!subscription ? (
              <div className="mt-6 rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
                Für diese Organization wurde noch keine Subscription gefunden.
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <div className="text-2xl font-semibold text-white">
                    {planLabel(subscription.plan_key)}
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${effectiveStatus?.badgeClass}`}
                  >
                    {effectiveStatus?.label}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                      Preis
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {planPrice}
                    </div>
                    <p className="mt-1 text-sm text-white/68">
                      {billingCycleLabel(subscription.billing_cycle)} · inkl. MwSt.
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                      Nutzung
                    </div>
                    <div className="mt-2 text-sm font-medium text-white">
                      Kameras: {camerasCount} / {subscription.max_cameras}
                    </div>
                    <div className="mt-1 text-sm font-medium text-white">
                      Members: {resolvedSubscription?.currentMemberUsage ?? 0} /{" "}
                      {subscription.max_members}
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-white/68">
                  Trial endet: {formatDate(subscription.trial_ends_at)} · Periode bis:{" "}
                  {formatDate(subscription.current_period_end)}
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}