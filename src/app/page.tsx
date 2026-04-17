// src/app/page.tsx #8
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { requirePathAccess, canAccessPath } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import { getBillingPlan } from "@/lib/billing/plans";
import {
  resolveSubscriptionState,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionPolicy";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";

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

function locale(language: AppLanguage) {
  return language === "en" ? "en-GB" : "de-DE";
}

function formatDate(value: string | null, language: AppLanguage) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(locale(language), {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string | null, language: AppLanguage) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(locale(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(
  amountCents: number,
  currency: string,
  language: AppLanguage
) {
  return new Intl.NumberFormat(locale(language), {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function formatPlanPrice(
  subscription: SubscriptionRow,
  language: AppLanguage
) {
  const plan = getBillingPlan(subscription.plan_key);

  if (subscription.price_amount_cents > 0) {
    return formatMoney(
      subscription.price_amount_cents,
      subscription.price_currency,
      language
    );
  }

  if (!plan) return "—";

  const price =
    subscription.billing_cycle === "yearly"
      ? plan.yearlyPriceCents
      : plan.monthlyPriceCents;

  if (price != null) {
    return formatMoney(price, subscription.price_currency, language);
  }

  return subscription.plan_key === "enterprise"
    ? language === "en"
      ? "Custom"
      : "Individuell"
    : language === "en"
      ? "Not set yet"
      : "Noch nicht festgelegt";
}

function billingCycleLabel(
  cycle: "monthly" | "yearly",
  language: AppLanguage
) {
  if (language === "en") {
    return cycle === "yearly" ? "Yearly" : "Monthly";
  }
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

function statusUi(status: SubscriptionStatus, language: AppLanguage) {
  if (language === "en") {
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

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      pageEyebrow: "Home",
      pageTitle: "Venaris Home",
      pageBody:
        "Central overview of wildlife, cameras and organization in the active context.",

      open: "Open →",

      wildlifeEyebrow: "Wildlife",
      operationsEyebrow: "Operations",
      commercialEyebrow: "Commercial",
      teamEyebrow: "Team",

      signalMissing: "No signal yet",
      camerasMetric: (count: number) => `${count} cameras`,
      events14dMetric: (count: number) => `${count} events / 14 days`,
      noPlan: "No plan",

      understandMovement: "Understand movement in the ground",
      buildWildlife: "Build wildlife visibility",
      wildlifeWithSignalText: (count: number) =>
        `${count} relevant wildlife events in the last 14 days. This gives you an immediate view of what is actually happening right now.`,
      wildlifeNoSignalText:
        "No recent wildlife events are visible yet. The best next step is the wildlife overview.",

      keepCameraSituationInView: "Keep camera operations in view",
      activateFirstCameras: "Activate first cameras",
      camerasWithSignalText: (count: number) =>
        `${count} cameras are visible in the scope of the active organization. Status and Ingest are the fastest operational entry points.`,
      camerasNoSignalText:
        "As soon as cameras are created and connected, this becomes the operational backbone for wildlife and monitoring.",

      managePlanAndLimits: "Actively manage plan and limits",
      managePlanAndLimitsText: (
        plan: string,
        status: string
      ) =>
        `${plan} is currently running with status ${status}. This is where you manage growth, limits and plan changes.`,
      noSubscriptionText:
        "No subscription is stored yet for this organization. That should be clarified next.",

      unlockAccessForMoreUsers: "Enable access for more users",
      memberUsageText: (used: number, max: number) =>
        `${used} of ${max} member slots are currently in use.`,
      extendTeam: "Expand team",
      inviteUsersText:
        "Invite more users and extend operational access to the organization.",

      wildlifeEvents14d: "Wildlife Events (14 days)",
      wildlifeEvents14dSubline:
        "Fast activity anchor for the current period.",
      camerasTitle: "Cameras",
      camerasPlanSubline: (current: number, max: number) =>
        `${current} / ${max} in the active plan`,
      noSubscriptionFound: "No subscription found",
      membersTitle: "Members",
      openInvites: (count: number) => `${count} open invites`,
      subscriptionTitle: "Abo",
      subscriptionSubline: (price: string, status: string) =>
        `${price} incl. VAT · ${status}`,
      noSubscriptionStored: "No subscription stored",

      wildlifeOpen: "Open wildlife",
      camerasOpen: "Open cameras",
      orgaOpen: "Open organization",

      organizationAndSubscription: "Organization & Subscription",
      organizationAndSubscriptionText:
        "Commercial framework, team and ground scope of the active organization.",
      subscriptionMissingForOrg:
        "No subscription has been found for this organization.",

      scope: "Scope",
      grounds: "Grounds",
      members: "Members",
      openInvitesLabel: "Open invites",

      trialEnds: "Trial ends",
      periodUntil: "Period until",

      wildlifeSnapshot: "Wildlife Snapshot",
      wildlifeSnapshotText:
        "The latest visible events and the fastest entry into wildlife.",
      noRecentEvents:
        "No recent events are visible in the dashboard scope yet.",
      cameraLabel: "Camera",
      assetsLabel: "Assets",
      scoreLabel: "Score",

      cameraSnapshot: "Camera Snapshot",
      cameraSnapshotText:
        "Most recently created or most recently visible cameras with quick access to setup.",
      noCamerasYet: "No cameras created yet.",
      noLocationLabel: "No location label",
      createdLabel: "Created",
      lastSeenLabel: "Last seen",
    };
  }

  return {
    pageEyebrow: "Home",
    pageTitle: "Venaris Home",
    pageBody:
      "Zentrale Übersicht über Wildlife, Cameras und Organization der aktiven Umgebung.",

    open: "Öffnen →",

    wildlifeEyebrow: "Wildlife",
    operationsEyebrow: "Operations",
    commercialEyebrow: "Commercial",
    teamEyebrow: "Team",

    signalMissing: "Noch kein Signal",
    camerasMetric: (count: number) => `${count} Kameras`,
    events14dMetric: (count: number) => `${count} Events / 14 Tage`,
    noPlan: "Kein Plan",

    understandMovement: "Bewegung im Revier verstehen",
    buildWildlife: "Wildlife aufbauen",
    wildlifeWithSignalText: (count: number) =>
      `${count} relevante Wildlife-Events in den letzten 14 Tagen. Hier siehst Du sofort, was gerade wirklich los ist.`,
    wildlifeNoSignalText:
      "Noch keine aktuellen Wildlife-Events sichtbar. Der beste Startpunkt ist jetzt die Wildlife-Übersicht.",

    keepCameraSituationInView: "Kamera-Lage im Blick behalten",
    activateFirstCameras: "Erste Kameras aktivieren",
    camerasWithSignalText: (count: number) =>
      `${count} Kameras sind im Scope der aktiven Organisation sichtbar. Status und Ingest sind der schnellste operative Einstieg.`,
    camerasNoSignalText:
      "Sobald Kameras angelegt und verbunden sind, entsteht hier der operative Backbone für Wildlife und Monitoring.",

    managePlanAndLimits: "Plan und Limits aktiv steuern",
    managePlanAndLimitsText: (plan: string, status: string) =>
      `${plan} läuft aktuell mit Status ${status}. Hier steuerst Du Wachstum, Limits und Planwechsel.`,
    noSubscriptionText:
      "Für diese Organisation ist noch kein Abo hinterlegt. Das solltest Du als Nächstes klären.",

    unlockAccessForMoreUsers: "Zugang für weitere Nutzer freischalten",
    memberUsageText: (used: number, max: number) =>
      `${used} von ${max} Member-Slots sind aktuell genutzt.`,
    extendTeam: "Team erweitern",
    inviteUsersText:
      "Lade weitere Nutzer ein und erweitere den operativen Zugriff auf die Organisation.",

    wildlifeEvents14d: "Wildtier-Ereignisse (14 Tage)",
    wildlifeEvents14dSubline:
      "Schneller Aktivitätsanker für den aktuellen Zeitraum.",
    camerasTitle: "Kameras",
    camerasPlanSubline: (current: number, max: number) =>
      `${current} / ${max} im aktiven Plan`,
    noSubscriptionFound: "Kein Abo gefunden",
    membersTitle: "Mitglieder",
    openInvites: (count: number) => `${count} offene Einladungen`,
    subscriptionTitle: "Abo",
    subscriptionSubline: (price: string, status: string) =>
      `${price} inkl. MwSt. · ${status}`,
    noSubscriptionStored: "Kein Abo hinterlegt",

    wildlifeOpen: "Wildlife öffnen",
    camerasOpen: "Cameras öffnen",
    orgaOpen: "Orga öffnen",

    organizationAndSubscription: "Organisation & Abo",
    organizationAndSubscriptionText:
      "Kommerzieller Rahmen, Team und Revier-Scope der aktiven Organization.",
    subscriptionMissingForOrg:
      "Für diese Organisation wurde noch kein Abo gefunden.",

    scope: "Scope",
    grounds: "Reviere",
    members: "Members",
    openInvitesLabel: "Offene Invites",

    trialEnds: "Trial endet",
    periodUntil: "Periode bis",

    wildlifeSnapshot: "Wildlife Snapshot",
    wildlifeSnapshotText:
      "Die letzten sichtbaren Ereignisse und der schnellste Einstieg in Wildlife.",
    noRecentEvents:
      "Noch keine aktuellen Events im Dashboard-Scope sichtbar.",
    cameraLabel: "Kamera",
    assetsLabel: "Assets",
    scoreLabel: "Score",

    cameraSnapshot: "Kamera Snapshot",
    cameraSnapshotText:
      "Zuletzt angelegte bzw. zuletzt sichtbare Kameras mit schnellem Zugang zur Anlage.",
    noCamerasYet: "Noch keine Kameras angelegt.",
    noLocationLabel: "Keine Ortsbezeichnung",
    createdLabel: "Erstellt",
    lastSeenLabel: "Last seen",
  };
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
  actions?: ReactNode;
  children: ReactNode;
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
  openLabel,
}: {
  href: string;
  eyebrow: string;
  title: string;
  text: string;
  metric?: string;
  openLabel: string;
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
        {openLabel}
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const ctx = await requirePathAccess("/");
  const cookieStore = await cookies();
  const supabase = supabaseServer();

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  const text = t(language);
  const speciesMetaRows = await loadSpeciesMeta();
  const speciesMetaMap = buildSpeciesMetaMap(speciesMetaRows);

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
    ? statusUi(resolvedSubscription?.effectiveStatus ?? subscription.status, language)
    : null;

  const subscriptionPrice = subscription
    ? formatPlanPrice(subscription, language)
    : "—";

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
          eyebrow: text.wildlifeEyebrow,
          title:
            recentEventsCount > 0
              ? text.understandMovement
              : text.buildWildlife,
          text:
            recentEventsCount > 0
              ? text.wildlifeWithSignalText(recentEventsCount)
              : text.wildlifeNoSignalText,
          metric:
            recentEventsCount > 0
              ? text.events14dMetric(recentEventsCount)
              : text.signalMissing,
        }
      : null,

    showCameras
      ? {
          href: "/cameras",
          eyebrow: text.operationsEyebrow,
          title:
            cameras.length > 0
              ? text.keepCameraSituationInView
              : text.activateFirstCameras,
          text:
            cameras.length > 0
              ? text.camerasWithSignalText(cameras.length)
              : text.camerasNoSignalText,
          metric: text.camerasMetric(cameras.length),
        }
      : null,

    showSubscription
      ? {
          href: "/orga/subscription",
          eyebrow: text.commercialEyebrow,
          title: text.managePlanAndLimits,
          text: subscription
            ? text.managePlanAndLimitsText(
                planLabel(subscription.plan_key),
                effectiveStatus?.label ?? "—"
              )
            : text.noSubscriptionText,
          metric: subscription ? planLabel(subscription.plan_key) : text.noPlan,
        }
      : showInvite
        ? {
            href: "/orga/members/invite",
            eyebrow: text.teamEyebrow,
            title: text.unlockAccessForMoreUsers,
            text:
              subscription && resolvedSubscription
                ? text.memberUsageText(
                    resolvedSubscription.currentMemberUsage,
                    subscription.max_members
                  )
                : text.inviteUsersText,
            metric:
              subscription && resolvedSubscription
                ? `${resolvedSubscription.currentMemberUsage} / ${subscription.max_members}`
                : text.extendTeam,
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
      title: text.wildlifeEvents14d,
      value: String(recentEventsCount),
      subline: text.wildlifeEvents14dSubline,
    },
    {
      visible: showCameras,
      title: text.camerasTitle,
      value: String(cameras.length),
      subline: subscription
        ? text.camerasPlanSubline(cameras.length, subscription.max_cameras)
        : text.noSubscriptionFound,
    },
    {
      visible: showOrga,
      title: text.membersTitle,
      value: String(membersCount),
      subline: text.openInvites(openInvitesCount),
    },
    {
      visible: showSubscription,
      title: text.subscriptionTitle,
      value: subscription ? planLabel(subscription.plan_key) : "—",
      subline: subscription
        ? text.subscriptionSubline(
            subscriptionPrice,
            effectiveStatus?.label ?? "—"
          )
        : text.noSubscriptionStored,
    },
  ].filter((item) => item.visible);

  const wildlifeActions = [{ href: "/wildlife", label: text.wildlifeOpen }].filter(
    (item) => canSee(item.href)
  );

  const cameraActions = [{ href: "/cameras", label: text.camerasOpen }].filter(
    (item) => canSee(item.href)
  );

  const orgaActions = [{ href: "/orga", label: text.orgaOpen }].filter((item) =>
    canSee(item.href)
  );

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.pageEyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.pageTitle}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/68">
            {text.pageBody}
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
                openLabel={text.open}
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
            title={text.organizationAndSubscription}
            text={text.organizationAndSubscriptionText}
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
                {text.subscriptionMissingForOrg}
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
                    {subscriptionPrice}{" "}
                    {language === "en" ? "incl. VAT" : "inkl. MwSt."} ·{" "}
                    {billingCycleLabel(subscription.billing_cycle, language)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    {text.trialEnds}: {formatDate(subscription.trial_ends_at, language)} ·{" "}
                    {text.periodUntil}:{" "}
                    {formatDate(subscription.current_period_end, language)}
                  </p>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="text-sm font-medium text-white/50">{text.scope}</div>
                  <div className="mt-3 space-y-2 text-sm text-white/72">
                    <div>
                      {text.grounds}: {reviersCount}
                    </div>
                    <div>
                      {text.members}:{" "}
                      {resolvedSubscription?.currentMemberUsage ?? membersCount} /{" "}
                      {subscription.max_members}
                    </div>
                    <div>
                      {text.camerasTitle}: {cameras.length} / {subscription.max_cameras}
                    </div>
                    <div>
                      {text.openInvitesLabel}: {openInvitesCount}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={text.wildlifeSnapshot}
            text={text.wildlifeSnapshotText}
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
                {text.noRecentEvents}
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
                          {getSpeciesLabel(event.top_species, language, speciesMetaMap)}
                          {event.top_count ? ` · ${event.top_count}` : ""}
                        </div>
                        <p className="mt-1 text-sm text-white/65">
                          {text.cameraLabel}:{" "}
                          {cameraNameById.get(event.camera_id) ?? "—"}
                        </p>
                      </div>

                      <div className="text-right text-xs text-white/45">
                        <div>{formatDateTime(event.start_at, language)}</div>
                        <div className="mt-1">
                          {text.assetsLabel}: {event.asset_count ?? 0} · {text.scoreLabel}:{" "}
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
              title={text.wildlifeSnapshot}
              text={text.wildlifeSnapshotText}
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
                  {text.noRecentEvents}
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
                            {getSpeciesLabel(event.top_species, language, speciesMetaMap)}
                            {event.top_count ? ` · ${event.top_count}` : ""}
                          </div>
                          <p className="mt-1 text-sm text-white/65">
                            {text.cameraLabel}:{" "}
                            {cameraNameById.get(event.camera_id) ?? "—"}
                          </p>
                        </div>

                        <div className="text-right text-xs text-white/45">
                          <div>{formatDateTime(event.start_at, language)}</div>
                          <div className="mt-1">
                            {text.assetsLabel}: {event.asset_count ?? 0} · {text.scoreLabel}:{" "}
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
              title={text.cameraSnapshot}
              text={text.cameraSnapshotText}
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
                  {text.noCamerasYet}
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
                            {camera.location_name || text.noLocationLabel}
                          </p>
                        </div>

                        <div className="text-right text-xs text-white/45">
                          <div>
                            {text.createdLabel}:{" "}
                            {formatDate(camera.created_at, language)}
                          </div>
                          <div className="mt-1">
                            {text.lastSeenLabel}:{" "}
                            {formatDateTime(camera.last_seen_at, language)}
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
            title={text.cameraSnapshot}
            text={text.cameraSnapshotText}
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
                {text.noCamerasYet}
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
                          {camera.location_name || text.noLocationLabel}
                        </p>
                      </div>

                      <div className="text-right text-xs text-white/45">
                        <div>
                          {text.createdLabel}: {formatDate(camera.created_at, language)}
                        </div>
                        <div className="mt-1">
                          {text.lastSeenLabel}:{" "}
                          {formatDateTime(camera.last_seen_at, language)}
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