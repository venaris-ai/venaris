// src/app/page.tsx #12
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
  getIntlLocale,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";
import { DEFAULT_APP_TIME_ZONE, formatAppDateTime } from "@/lib/dateTime";
import { resolveAssetPreviewUrl } from "@/lib/demoAssetResolver";

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
  revier_id: string | null;
};

type RevierRow = {
  id: string;
  timezone: string | null;
};

type EventRow = {
  id: string;
  camera_id: string;
  start_at: string | null;
  end_at: string | null;
  top_species: string | null;
  top_count: number | null;
  relevance_score: number | null;
  created_at: string | null;
};

type AssetPreviewRow = {
  id: string;
  camera_id: string;
  storage_path: string | null;
  created_at: string | null;
  captured_at: string | null;
};

function formatMoney(
  amountCents: number,
  currency: string,
  language: AppLanguage,
) {
  return new Intl.NumberFormat(getIntlLocale(language), {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function formatPlanPrice(subscription: SubscriptionRow, language: AppLanguage) {
  const plan = getBillingPlan(subscription.plan_key);

  if (subscription.price_amount_cents > 0) {
    return formatMoney(
      subscription.price_amount_cents,
      subscription.price_currency,
      language,
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

function scoreBadge(score: number | null, language: AppLanguage) {
  if (typeof score !== "number") return "—";

  if (language === "en") {
    if (score >= 0.9) return "very high";
    if (score >= 0.75) return "high";
    if (score >= 0.5) return "medium";
    return "low";
  }

  if (score >= 0.9) return "sehr hoch";
  if (score >= 0.75) return "hoch";
  if (score >= 0.5) return "mittel";
  return "niedrig";
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      pageEyebrow: "Home",
      pageTitle: "Venaris Home",
      pageBody:
        "Central overview of setup, wildlife activity and organization in the active context.",

      setupEyebrow: "Setup",
      setupGroundTitle: "Set up ground",
      setupGroundText:
        "Create the first ground so cameras, events and insights can be assigned correctly.",
      setupCamerasTitle: "Set up cameras",
      setupCamerasText:
        "Connect your first cameras so Venaris can receive and analyze images.",
      inviteMembersTitle: "Invite members",
      inviteMembersText:
        "Invite more users and extend access to organization, grounds and cameras.",
      setupOpen: "Start setup →",

      wildlifeEvents30d: "Wildlife Events (30 days)",
      wildlifeEvents30dSubline: "Fast activity anchor for the current period.",
      camerasTitle: "Cameras",
      camerasPlanSubline: (current: number, max: number) =>
        `${current} / ${max} in the active plan`,
      noSubscriptionFound: "No subscription found",
      membersTitle: "Members",
      openInvites: (count: number) => `${count} open invites`,
      subscriptionTitle: "Subscription",
      subscriptionSubline: (price: string, status: string) =>
        `${price} incl. VAT · ${status}`,
      noSubscriptionStored: "No subscription stored",

      latestEventTitle: "Latest Wildlife Event",
      latestEventText:
        "Compact view of the most recent visible wildlife event in the current scope.",
      noRecentEvents:
        "No wildlife event is visible in the dashboard scope yet.",
      cameraLabel: "Camera",
      timeLabel: "Time",
      assetsLabel: "Assets",
      probabilityLabel: "Probability",
      countLabel: "Count",
      speciesUnknown: "Unknown species",
      noPreview: "No preview",
      previewAlt: "Latest wildlife event preview",
    };
  }

  return {
    pageEyebrow: "Home",
    pageTitle: "Venaris Home",
    pageBody:
      "Zentrale Übersicht über Setup, Wildlife-Aktivität und Organisation der aktiven Umgebung.",

    setupEyebrow: "Setup",
    setupGroundTitle: "Revier einrichten",
    setupGroundText:
      "Lege Dein erstes Revier an, damit Kameras, Events und Auswertungen sauber zugeordnet werden können.",
    setupCamerasTitle: "Kameras einrichten",
    setupCamerasText:
      "Verbinde Deine ersten Kameras, damit Venaris Bilder empfangen und auswerten kann.",
    inviteMembersTitle: "Mitglieder einladen",
    inviteMembersText:
      "Lade weitere Nutzer ein und verteile den Zugriff auf Organisation, Reviere und Kameras.",
    setupOpen: "Einrichten →",

    wildlifeEvents30d: "Wildtier-Ereignisse (30 Tage)",
    wildlifeEvents30dSubline:
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

    latestEventTitle: "Letztes Wildlife Event",
    latestEventText:
      "Kompakte Sicht auf das zuletzt sichtbare Wildlife Event im aktuellen Scope.",
    noRecentEvents: "Noch kein Wildlife Event im Dashboard-Scope sichtbar.",
    cameraLabel: "Kamera",
    timeLabel: "Zeitpunkt",
    assetsLabel: "Assets",
    probabilityLabel: "Wahrscheinlichkeit",
    countLabel: "Anzahl",
    speciesUnknown: "Unbekannte Art",
    noPreview: "Kein Preview",
    previewAlt: "Vorschau des letzten Wildlife Events",
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

function SetupCard({
  href,
  eyebrow,
  title,
  text,
  openLabel,
}: {
  href: string;
  eyebrow: string;
  title: string;
  text: string;
  openLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 backdrop-blur-sm transition hover:border-amber-300/20 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))]"
    >
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-white/45">
        {eyebrow}
      </div>
      <div className="mt-4 text-xl font-semibold tracking-tight text-white">
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-white/68">{text}</p>
      <div className="mt-5 text-sm font-medium text-amber-200 group-hover:text-amber-100">
        {openLabel}
      </div>
    </Link>
  );
}

function EventDetailCard({
  event,
  cameraName,
  timeZone,
  language,
  speciesLabel,
  previewUrl,
  heroTimestamp,
  assetCount,
}: {
  event: EventRow | null;
  cameraName: string | null;
  timeZone: string;
  language: AppLanguage;
  speciesLabel: string;
  previewUrl: string | null;
  heroTimestamp: string | null;
  assetCount: number;
}) {
  const text = t(language);

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div>
        <h2 className="text-lg font-medium text-white">
          {text.latestEventTitle}
        </h2>
        <p className="mt-1 text-sm text-white/65">{text.latestEventText}</p>
      </div>

      {!event ? (
        <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
          {text.noRecentEvents}
        </div>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-white/5">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={text.previewAlt}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/45">
                  {text.noPreview}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold tracking-tight text-white">
                  {speciesLabel || text.speciesUnknown}
                </div>
              </div>

            </div>

            <div className="mt-5 grid gap-3">
              <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wide text-white/45">
                  {text.cameraLabel}
                </div>
                <div className="mt-2 text-sm font-medium text-white/78">
                  {cameraName ?? "—"}
                </div>
              </div>

              <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wide text-white/45">
                  {text.probabilityLabel}
                </div>
                <div className="mt-2 text-sm font-medium text-white/78">
                  {typeof event.relevance_score === "number"
                    ? `${Math.round(event.relevance_score * 100)}% · ${scoreBadge(
                        event.relevance_score,
                        language,
                      )}`
                    : "—"}
                </div>
              </div>

              <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wide text-white/45">
                  {text.timeLabel}
                </div>
                <div className="mt-2 text-sm text-white/78">
                  {formatAppDateTime(
                    heroTimestamp ?? event.start_at,
                    language,
                    timeZone,
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wide text-white/45">
                    {text.assetsLabel}
                  </div>
                  <div className="mt-2 text-sm text-white/78">{assetCount}</div>
                </div>

                <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wide text-white/45">
                    {text.countLabel}
                  </div>
                  <div className="mt-2 text-sm text-white/78">
                    {event.top_count ?? "—"}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </section>
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
  recentWindow.setDate(recentWindow.getDate() - 30);
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
      .select("id,name,location_name,last_seen_at,created_at,revier_id")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("reviers")
      .select("id,timezone", { count: "exact" })
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
        `,
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
      `Failed to load subscription: ${subscriptionResult.error.message}`,
    );
  }

  const cameras = (camerasResult.data ?? []) as CameraRow[];
  const cameraIds = cameras.map((camera) => camera.id);
  const reviers = (reviersResult.data ?? []) as RevierRow[];

  const timezoneByRevierId = new Map(
    reviers.map((revier) => [
      revier.id,
      revier.timezone || DEFAULT_APP_TIME_ZONE,
    ]),
  );

  const timezoneByCameraId = new Map(
    cameras.map((camera) => [
      camera.id,
      camera.revier_id
        ? (timezoneByRevierId.get(camera.revier_id) ?? DEFAULT_APP_TIME_ZONE)
        : DEFAULT_APP_TIME_ZONE,
    ]),
  );

  const membersCount = membersResult.count ?? 0;
  const openInvitesCount = invitesResult.count ?? 0;
  const subscription = subscriptionResult.data;

  let latestEvent: EventRow | null = null;
  let recentEventsCount = 0;
  let latestEventAssetCount = 0;
  let latestEventHeroAsset: AssetPreviewRow | null = null;
  let latestEventPreviewUrl: string | null = null;

  if (cameraIds.length > 0) {
    const [latestEventResult, eventsCountResult] = await Promise.all([
      supabase
        .from("events")
        .select(
          "id,camera_id,start_at,end_at,top_species,top_count,relevance_score,created_at",
        )
        .in("camera_id", cameraIds)
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle<EventRow>(),

      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .in("camera_id", cameraIds)
        .gte("start_at", recentWindowIso),
    ]);

    if (latestEventResult.error) {
      throw new Error(
        `Failed to load latest event: ${latestEventResult.error.message}`,
      );
    }

    if (eventsCountResult.error) {
      throw new Error(
        `Failed to load event count: ${eventsCountResult.error.message}`,
      );
    }

    latestEvent = latestEventResult.data ?? null;
    recentEventsCount = eventsCountResult.count ?? 0;
  }

  if (latestEvent) {
    const { data: eventAssets, error: eventAssetsError } = await supabase
      .from("event_assets")
      .select("asset_id")
      .eq("event_id", latestEvent.id);

    if (eventAssetsError) {
      throw new Error(
        `Failed to load latest event assets: ${eventAssetsError.message}`,
      );
    }

    const assetIds = (eventAssets ?? [])
      .map((row: { asset_id: string | null }) => row.asset_id)
      .filter(Boolean) as string[];

    latestEventAssetCount = assetIds.length;

    if (assetIds.length > 0) {
      const { data: assetsData, error: assetsDataError } = await supabase
        .from("assets")
        .select("id,camera_id,storage_path,created_at,captured_at")
        .in("id", assetIds)
        .order("captured_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .returns<AssetPreviewRow[]>();

      if (assetsDataError) {
        throw new Error(
          `Failed to load latest event preview asset: ${assetsDataError.message}`,
        );
      }

      latestEventHeroAsset = assetsData?.[0] ?? null;
    }

    if (latestEventHeroAsset) {
      latestEventPreviewUrl = await resolveAssetPreviewUrl({
        asset: {
          id: latestEventHeroAsset.id,
          camera_id: latestEventHeroAsset.camera_id,
          storage_path: latestEventHeroAsset.storage_path ?? null,
        },
        isDemo: Boolean(organization.is_demo),
      });
    }
  }

  const cameraNameById = new Map(
    cameras.map((camera) => [
      camera.id,
      camera.name
        ? `${camera.name}${
            camera.location_name ? ` (${camera.location_name})` : ""
          }`
        : "—",
    ]),
  );

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
    ? statusUi(
        resolvedSubscription?.effectiveStatus ?? subscription.status,
        language,
      )
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

  const setupCards = [
    showOrga
      ? {
          href: "/orga/reviere/new",
          title: text.setupGroundTitle,
          text: text.setupGroundText,
        }
      : null,
    canSee("/cameras/new")
      ? {
          href: "/cameras/new",
          title: text.setupCamerasTitle,
          text: text.setupCamerasText,
        }
      : null,
    canSee("/orga/members/invite")
      ? {
          href: "/orga/members/invite",
          title: text.inviteMembersTitle,
          text: text.inviteMembersText,
        }
      : null,
  ].filter(Boolean) as {
    href: string;
    title: string;
    text: string;
  }[];

  const statCards = [
    {
      visible: showWildlife,
      title: text.wildlifeEvents30d,
      value: String(recentEventsCount),
      subline: text.wildlifeEvents30dSubline,
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
            effectiveStatus?.label ?? "—",
          )
        : text.noSubscriptionStored,
    },
  ].filter((item) => item.visible);

  const latestEventTimeZone = latestEvent
    ? (timezoneByCameraId.get(latestEvent.camera_id) ?? DEFAULT_APP_TIME_ZONE)
    : DEFAULT_APP_TIME_ZONE;

  const latestEventSpeciesLabel = latestEvent
    ? getSpeciesLabel(latestEvent.top_species, language, speciesMetaMap)
    : "";

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

        {setupCards.length > 0 ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {setupCards.map((card) => (
              <SetupCard
                key={card.href}
                href={card.href}
                eyebrow={text.setupEyebrow}
                title={card.title}
                text={card.text}
                openLabel={text.setupOpen}
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

      {showWildlife ? (
        <EventDetailCard
          event={latestEvent}
          cameraName={
            latestEvent
              ? (cameraNameById.get(latestEvent.camera_id) ?? null)
              : null
          }
          timeZone={latestEventTimeZone}
          language={language}
          speciesLabel={latestEventSpeciesLabel}
          previewUrl={latestEventPreviewUrl}
          heroTimestamp={
            latestEventHeroAsset
              ? (latestEventHeroAsset.captured_at ??
                latestEventHeroAsset.created_at)
              : null
          }
          assetCount={latestEventAssetCount}
        />
      ) : null}
    </main>
  );
}
