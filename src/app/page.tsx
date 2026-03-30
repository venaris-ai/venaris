// src/app/page.tsx #6
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

  return subscription.plan_key === "enterprise"
    ? "Individuell"
    : "Noch nicht festgelegt";
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
        badgeClass:
          "border-sky-300/25 bg-sky-300/10 text-sky-200",
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
        badgeClass:
          "border-amber-300/25 bg-amber-300/10 text-amber-200",
      };
    case "canceled":
      return {
        label: "Canceled",
        badgeClass:
          "border-orange-300/25 bg-orange-300/10 text-orange-200",
      };
    case "expired":
      return {
        label: "Expired",
        badgeClass:
          "border-rose-300/25 bg-rose-300/10 text-rose-200",
      };
    default:
      return {
        label: status,
        badgeClass:
          "border-white/10 bg-white/5 text-white/72",
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
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-white">{title}</h2>
          <p className="mt-1 text-sm text-white/65">{text}</p>
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
      className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 backdrop-blur-sm hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
    >
      {label}
    </Link>
  );
}

function FocusCard({
  href,
  eyebrow,
  title,
  text,
  metric,
}: {
  href: string;
  eyebrow: string;
  title: string;
  text: string;
  metric?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 backdrop-blur-sm transition hover:border-amber-300/20 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-white/45">
          {eyebrow}
        </div>
        {metric ? (
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/72">
            {metric}
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="text-xl font-semibold tracking-tight text-white">
          {title}
        </div>
        <p className="mt-2 text-sm leading-6 text-white/68">{text}</p>
      </div>

      <div className="mt-5 text-sm font-medium text-amber-200 group-hover:text-amber-100">
        Öffnen →
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const ctx = await requirePathAccess("/");
  const supabase = supabaseServer();

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const role = ctx.activeMembership.role;
  const email = ctx.user.email ?? null;
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
    throw new Error(
      `Failed to load subscription: ${subscriptionResult.error.message}`
    );
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
        .select(
          "id,camera_id,start_at,end_at,top_species,top_count,relevance_score,asset_count"
        )
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
      throw new Error(
        `Failed to load recent events: ${eventsListResult.error.message}`
      );
    }

    if (eventsCountResult.error) {
      throw new Error(
        `Failed to load event count: ${eventsCountResult.error.message}`
      );
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

  const canSee = (pathname: string) =>
    canAccessPath({
      pathname,
      role,
      email,
    });

  const showWildlife = canSee("/wildlife");
  const showCameras = canSee("/cameras");
  const showOrga = canSee("/orga");
  const showSubscription = canSee("/orga/subscription");
  const showInvite = canSee("/orga/members/invite");

  const focusCards = [
    showWildlife
      ? {
          href: "/wildlife",
          eyebrow: "Wildlife",
          title:
            recentEventsCount > 0 ? "Bewegung im Revier verstehen" : "Wildlife aufbauen",
          text:
            recentEventsCount > 0
              ? `${recentEventsCount} relevante Wildlife-Events in den letzten 14 Tagen. Hier siehst Du sofort, was gerade wirklich los ist.`
              : "Noch keine aktuellen Wildlife-Events sichtbar. Der beste Startpunkt ist jetzt die Wildlife-Übersicht.",
          metric:
            recentEventsCount > 0
              ? `${recentEventsCount} Events / 14 Tage`
              : "Noch kein Signal",
        }
      : null,

    showCameras
      ? {
          href: "/cameras",
          eyebrow: "Operations",
          title:
            cameras.length > 0 ? "Kamera-Lage im Blick behalten" : "Erste Kameras aktivieren",
          text:
            cameras.length > 0
              ? `${cameras.length} Kameras sind im Scope der aktiven Organisation sichtbar. Health, Events und Ingest sind der schnellste operative Einstieg.`
              : "Sobald Kameras angelegt und verbunden sind, entsteht hier der operative Backbone für Wildlife und Monitoring.",
          metric: `${cameras.length} Kameras`,
        }
      : null,

    showSubscription
      ? {
          href: "/orga/subscription",
          eyebrow: "Commercial",
          title: "Plan und Limits aktiv steuern",
          text: subscription
            ? `${planLabel(subscription.plan_key)} läuft aktuell mit Status ${effectiveStatus?.label ?? "—"}. Hier steuerst Du Wachstum, Limits und Planwechsel.`
            : "Für diese Organisation ist noch keine Subscription hinterlegt. Das solltest Du als Nächstes klären.",
          metric: subscription ? planLabel(subscription.plan_key) : "Kein Plan",
        }
      : showInvite
      ? {
          href: "/orga/members/invite",
          eyebrow: "Team",
          title: "Zugang für weitere Nutzer freischalten",
          text:
            subscription && resolvedSubscription
              ? `${resolvedSubscription.currentMemberUsage} von ${subscription.max_members} Member-Slots sind aktuell genutzt.`
              : "Lade weitere Nutzer ein und erweitere den operativen Zugriff auf die Organisation.",
          metric:
            subscription && resolvedSubscription
              ? `${resolvedSubscription.currentMemberUsage} / ${subscription.max_members}`
              : "Team erweitern",
        }
      : null,
  ].filter(Boolean) as {
    href: string;
    eyebrow: string;
    title: string;
    text: string;
    metric?: string;
  }[];

  const statCards = [
    {
      visible: showWildlife,
      title: "Wildlife Events (14 Tage)",
      value: String(recentEventsCount),
      subline: "Schneller Aktivitätsanker für den aktuellen Zeitraum.",
    },
    {
      visible: showCameras,
      title: "Kameras",
      value: String(cameras.length),
      subline: subscription
        ? `${cameras.length} / ${subscription.max_cameras} im aktiven Plan`
        : "Keine Subscription gefunden",
    },
    {
      visible: showOrga,
      title: "Members",
      value: String(membersCount),
      subline: `${openInvitesCount} offene Invites`,
    },
    {
      visible: showSubscription,
      title: "Subscription",
      value: subscription ? planLabel(subscription.plan_key) : "—",
      subline: subscription
        ? `${subscriptionPrice} inkl. MwSt. · ${effectiveStatus?.label ?? "—"}`
        : "Keine Subscription hinterlegt",
    },
  ].filter((item) => item.visible);

  const wildlifeActions = [{ href: "/wildlife", label: "Wildlife öffnen" }].filter(
    (item) => canSee(item.href)
  );

  const cameraActions = [{ href: "/cameras", label: "Cameras öffnen" }].filter(
    (item) => canSee(item.href)
  );

  const orgaActions = [{ href: "/orga", label: "Orga öffnen" }].filter((item) =>
    canSee(item.href)
  );

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Home
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Venaris Home
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/68">
            Zentrale Übersicht über Wildlife, Cameras und Organization der aktiven
            Umgebung.
          </p>
        </div>

        {focusCards.length > 0 ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {focusCards.map((card) => (
              <FocusCard
                key={card.href}
                href={card.href}
                eyebrow={card.eyebrow}
                title={card.title}
                text={card.text}
                metric={card.metric}
              />
            ))}
          </div>
        ) : null}
      </section>

      {statCards.length > 0 ? (
        <section
          className={`grid gap-4 ${
            statCards.length >= 4
              ? "md:grid-cols-2 xl:grid-cols-4"
              : statCards.length === 3
                ? "md:grid-cols-3"
                : statCards.length === 2
                  ? "md:grid-cols-2"
                  : "md:grid-cols-1"
          }`}
        >
          {statCards.map((item) => (
            <StatCard
              key={item.title}
              title={item.title}
              value={item.value}
              subline={item.subline}
            />
          ))}
        </section>
      ) : null}

      {showOrga ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title="Organization & Subscription"
            text="Kommerzieller Rahmen, Team und Revier-Scope der aktiven Organization."
            actions={
              orgaActions.length > 0 ? (
                <>
                  {orgaActions.map((item) => (
                    <ActionLink key={item.href} href={item.href} label={item.label} />
                  ))}
                </>
              ) : undefined
            }
          >
            {!subscription ? (
              <div className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100">
                Für diese Organization wurde noch keine Subscription gefunden.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-lg font-semibold text-white">
                      {planLabel(subscription.plan_key)}
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${effectiveStatus?.badgeClass}`}
                    >
                      {effectiveStatus?.label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/68">
                    {subscriptionPrice} inkl. MwSt. ·{" "}
                    {billingCycleLabel(subscription.billing_cycle)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Trial endet: {formatDate(subscription.trial_ends_at)} · Periode bis:{" "}
                    {formatDate(subscription.current_period_end)}
                  </p>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="text-sm font-medium text-white/50">Scope</div>
                  <div className="mt-3 space-y-2 text-sm text-white/72">
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

          <SectionCard
            title="Wildlife Snapshot"
            text="Die letzten sichtbaren Ereignisse und der schnellste Einstieg in Wildlife."
            actions={
              wildlifeActions.length > 0 ? (
                <>
                  {wildlifeActions.map((item) => (
                    <ActionLink key={item.href} href={item.href} label={item.label} />
                  ))}
                </>
              ) : undefined
            }
          >
            {recentEvents.length === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
                Noch keine aktuellen Events im Dashboard-Scope sichtbar.
              </div>
            ) : (
              <div className="space-y-3">
                {recentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-[24px] border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">
                          {formatSpecies(event.top_species)}
                          {event.top_count ? ` · ${event.top_count}` : ""}
                        </div>
                        <p className="mt-1 text-sm text-white/65">
                          Kamera: {cameraNameById.get(event.camera_id) ?? "—"}
                        </p>
                      </div>

                      <div className="text-right text-xs text-white/45">
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
        </section>
      ) : null}

      {!showOrga ? (
        <section className={`grid gap-4 ${showCameras ? "xl:grid-cols-2" : ""}`}>
          {showWildlife ? (
            <SectionCard
              title="Wildlife Snapshot"
              text="Die letzten sichtbaren Ereignisse und der schnellste Einstieg in Wildlife."
              actions={
                wildlifeActions.length > 0 ? (
                  <>
                    {wildlifeActions.map((item) => (
                      <ActionLink key={item.href} href={item.href} label={item.label} />
                    ))}
                  </>
                ) : undefined
              }
            >
              {recentEvents.length === 0 ? (
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
                  Noch keine aktuellen Events im Dashboard-Scope sichtbar.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[24px] border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {formatSpecies(event.top_species)}
                            {event.top_count ? ` · ${event.top_count}` : ""}
                          </div>
                          <p className="mt-1 text-sm text-white/65">
                            Kamera: {cameraNameById.get(event.camera_id) ?? "—"}
                          </p>
                        </div>

                        <div className="text-right text-xs text-white/45">
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
          ) : null}

          {showCameras ? (
            <SectionCard
              title="Camera Snapshot"
              text="Zuletzt angelegte bzw. zuletzt sichtbare Kameras mit schnellem Zugang zur Anlage."
              actions={
                cameraActions.length > 0 ? (
                  <>
                    {cameraActions.map((item) => (
                      <ActionLink key={item.href} href={item.href} label={item.label} />
                    ))}
                  </>
                ) : undefined
              }
            >
              {cameras.length === 0 ? (
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
                  Noch keine Kameras angelegt.
                </div>
              ) : (
                <div className="space-y-3">
                  {cameras.map((camera) => (
                    <div
                      key={camera.id}
                      className="rounded-[24px] border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {camera.name}
                          </div>
                          <p className="mt-1 text-sm text-white/65">
                            {camera.location_name || "Keine Ortsbezeichnung"}
                          </p>
                        </div>

                        <div className="text-right text-xs text-white/45">
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
          ) : null}
        </section>
      ) : showCameras ? (
        <section>
          <SectionCard
            title="Camera Snapshot"
            text="Zuletzt angelegte bzw. zuletzt sichtbare Kameras mit schnellem Zugang zur Anlage."
            actions={
              cameraActions.length > 0 ? (
                <>
                  {cameraActions.map((item) => (
                    <ActionLink key={item.href} href={item.href} label={item.label} />
                  ))}
                </>
              ) : undefined
            }
          >
            {cameras.length === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
                Noch keine Kameras angelegt.
              </div>
            ) : (
              <div className="space-y-3">
                {cameras.map((camera) => (
                  <div
                    key={camera.id}
                    className="rounded-[24px] border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">
                          {camera.name}
                        </div>
                        <p className="mt-1 text-sm text-white/65">
                          {camera.location_name || "Keine Ortsbezeichnung"}
                        </p>
                      </div>

                      <div className="text-right text-xs text-white/45">
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
      ) : null}
    </main>
  );
}