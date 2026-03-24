// src/app/page.tsx #2
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

type CameraRow = {
  id: string;
  name: string;
  location_name: string | null;
  last_seen_at: string | null;
  created_at: string | null;
};

type EventFeedRow = {
  id: string;
  camera_id: string;
  start_at: string | null;
  end_at: string | null;
  top_species: string | null;
  top_count: number | null;
  relevance_score: number | null;
  asset_count: number | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function formatSpecies(value: string | null) {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
      {subline ? <p className="mt-2 text-sm leading-6 text-gray-600">{subline}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  text,
  actions,
  children,
}: {
  title: string;
  text: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">{text}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
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

export default async function HomePage() {
  const ctx = await requireActiveOrganization();
  const supabase = supabaseServer();

  const organization = ctx.activeMembership.organizations;
  const recentWindow = new Date();
  recentWindow.setDate(recentWindow.getDate() - 14);
  const recentWindowIso = recentWindow.toISOString();
  const nowIso = new Date().toISOString();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const [
    camerasResult,
    reviersResult,
    membersResult,
    invitesResult,
    subscriptionResult,
  ] = await Promise.all([
    supabase
      .from("cameras")
      .select("id,name,location_name,last_seen_at,created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(6),

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
  ]);

  if (camerasResult.error) {
    throw new Error(`Failed to load cameras: ${camerasResult.error.message}`);
  }

  if (reviersResult.error) {
    throw new Error(`Failed to load reviers: ${reviersResult.error.message}`);
  }

  if (membersResult.error) {
    throw new Error(`Failed to load members: ${membersResult.error.message}`);
  }

  if (invitesResult.error) {
    throw new Error(`Failed to load invites: ${invitesResult.error.message}`);
  }

  if (subscriptionResult.error) {
    throw new Error(`Failed to load subscription: ${subscriptionResult.error.message}`);
  }

  const cameras = (camerasResult.data ?? []) as CameraRow[];
  const cameraIds = cameras.map((camera) => camera.id);
  const reviersCount = reviersResult.count ?? 0;
  const membersCount = membersResult.count ?? 0;
  const openInvitesCount = invitesResult.count ?? 0;
  const subscription = subscriptionResult.data;

  let recentEvents: EventFeedRow[] = [];
  let recentEventsCount = 0;

  if (cameraIds.length > 0) {
    const [eventsListResult, eventsCountResult] = await Promise.all([
      supabase
        .from("event_feed")
        .select("id,camera_id,start_at,end_at,top_species,top_count,relevance_score,asset_count")
        .in("camera_id", cameraIds)
        .order("start_at", { ascending: false })
        .limit(5),

      supabase
        .from("event_feed")
        .select("id", { count: "exact", head: true })
        .in("camera_id", cameraIds)
        .gte("start_at", recentWindowIso),
    ]);

    if (eventsListResult.error) {
      throw new Error(`Failed to load recent events: ${eventsListResult.error.message}`);
    }

    if (eventsCountResult.error) {
      throw new Error(`Failed to load event count: ${eventsCountResult.error.message}`);
    }

    recentEvents = (eventsListResult.data ?? []) as EventFeedRow[];
    recentEventsCount = eventsCountResult.count ?? 0;
  }

  const cameraNameById = new Map(cameras.map((camera) => [camera.id, camera.name]));

  const resolvedSubscription = subscription
    ? resolveSubscriptionState({
        status: subscription.status,
        trialEndsAt: subscription.trial_ends_at,
        currentPeriodEnd: subscription.current_period_end,
        maxCameras: subscription.max_cameras,
        maxMembers: subscription.max_members,
        currentCameraCount: cameras.length,
        activeMemberCount: membersCount,
        openInviteCount: openInvitesCount,
      })
    : null;

  const effectiveStatus = subscription
    ? statusUi(resolvedSubscription?.effectiveStatus ?? subscription.status)
    : null;

  const subscriptionPrice = subscription ? formatPlanPrice(subscription) : "—";

  const nextActions = [
    {
      href: "/wildlife",
      title: "Wildlife prüfen",
      text:
        recentEventsCount > 0
          ? `${recentEventsCount} Wildlife-Events in den letzten 14 Tagen.`
          : "Noch keine aktuellen Wildlife-Events im Blick.",
    },
    {
      href: "/cameras/new",
      title: "Kamera anlegen",
      text: subscription
        ? `${cameras.length} von ${subscription.max_cameras} Kamera-Slots genutzt.`
        : "Subscription prüfen, bevor neue Kameras angelegt werden.",
    },
    {
      href: "/orga/members/invite",
      title: "Mitglied einladen",
      text: subscription && resolvedSubscription
        ? `${resolvedSubscription.currentMemberUsage} von ${subscription.max_members} Member-Slots genutzt.`
        : "Members und Subscription prüfen.",
    },
    {
      href: "/orga/subscription",
      title: "Subscription prüfen",
      text: subscription
        ? `${planLabel(subscription.plan_key)} · ${effectiveStatus?.label ?? "—"}`
        : "Keine Subscription gefunden.",
    },
  ];

  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Home</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Zentrale Übersicht über Wildlife, Cameras und Organization der aktiven
            Umgebung.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Wildlife Events (14 Tage)"
          value={String(recentEventsCount)}
          subline="Schneller Aktivitätsanker für den aktuellen Zeitraum."
        />
        <StatCard
          title="Kameras"
          value={String(cameras.length)}
          subline={
            subscription
              ? `${cameras.length} / ${subscription.max_cameras} im aktiven Plan`
              : "Keine Subscription gefunden"
          }
        />
        <StatCard
          title="Members"
          value={String(membersCount)}
          subline={`${openInvitesCount} offene Invites`}
        />
        <StatCard
          title="Subscription"
          value={subscription ? planLabel(subscription.plan_key) : "—"}
          subline={
            subscription
              ? `${subscriptionPrice} inkl. MwSt. · ${effectiveStatus?.label ?? "—"}`
              : "Keine Subscription hinterlegt"
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Wichtigste nächste Schritte"
          text="Die Home-Seite soll direkt in die nächste sinnvolle Aktion führen."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {nextActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border bg-gray-50 p-5 transition hover:bg-gray-100"
              >
                <div className="text-base font-medium text-gray-900">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.text}</p>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Organization & Subscription"
          text="Kommerzieller Rahmen, Team und Revier-Scope der aktiven Organization."
          actions={<ActionLink href="/orga" label="Orga öffnen" />}
        >
          {!subscription ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Für diese Organization wurde noch keine Subscription gefunden.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-gray-50 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-lg font-semibold text-gray-900">
                    {planLabel(subscription.plan_key)}
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${effectiveStatus?.badgeClass}`}
                  >
                    {effectiveStatus?.label}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {subscriptionPrice} inkl. MwSt. ·{" "}
                  {billingCycleLabel(subscription.billing_cycle)}
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Trial endet: {formatDate(subscription.trial_ends_at)} · Periode bis:{" "}
                  {formatDate(subscription.current_period_end)}
                </p>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-5">
                <div className="text-sm font-medium text-gray-500">Scope</div>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <div>Reviere: {reviersCount}</div>
                  <div>
                    Members: {resolvedSubscription?.currentMemberUsage ?? membersCount} /{" "}
                    {subscription.max_members}
                  </div>
                  <div>
                    Kameras: {cameras.length} / {subscription.max_cameras}
                  </div>
                  <div>Offene Invites: {openInvitesCount}</div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Wildlife Snapshot"
          text="Die letzten sichtbaren Ereignisse und der schnellste Einstieg in Wildlife."
          actions={
            <>
              <ActionLink href="/wildlife" label="Wildlife öffnen" />
              <ActionLink href="/wildlife/species" label="Species" />
            </>
          }
        >
          {recentEvents.length === 0 ? (
            <div className="rounded-2xl border bg-gray-50 p-5 text-sm text-gray-600">
              Noch keine aktuellen Events im Dashboard-Scope sichtbar.
            </div>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {formatSpecies(event.top_species)}
                        {event.top_count ? ` · ${event.top_count}` : ""}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        Kamera: {cameraNameById.get(event.camera_id) ?? "—"}
                      </p>
                    </div>

                    <div className="text-right text-xs text-gray-500">
                      <div>{formatDateTime(event.start_at)}</div>
                      <div className="mt-1">
                        Assets: {event.asset_count ?? 0} · Score:{" "}
                        {event.relevance_score != null
                          ? Math.round(event.relevance_score)
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Camera Snapshot"
          text="Zuletzt angelegte bzw. zuletzt sichtbare Kameras mit schnellem Zugang zur Anlage."
          actions={
            <>
              <ActionLink href="/cameras" label="Cameras öffnen" />
              <ActionLink href="/cameras/new" label="Create Camera" />
            </>
          }
        >
          {cameras.length === 0 ? (
            <div className="rounded-2xl border bg-gray-50 p-5 text-sm text-gray-600">
              Noch keine Kameras angelegt.
            </div>
          ) : (
            <div className="space-y-3">
              {cameras.map((camera) => (
                <div key={camera.id} className="rounded-2xl border bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {camera.name}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {camera.location_name || "Keine Ortsbezeichnung"}
                      </p>
                    </div>

                    <div className="text-right text-xs text-gray-500">
                      <div>Erstellt: {formatDate(camera.created_at)}</div>
                      <div className="mt-1">
                        Last seen: {formatDateTime(camera.last_seen_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>
    </main>
  );
}