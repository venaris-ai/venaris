// src/app/page.tsx #13
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
  is_default: boolean;
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

type EventAssetRow = {
  event_id: string;
  asset_id: string;
};

type AssetDetectionScoreRow = {
  asset_id: string | null;
  score: number | null;
};

type EventPreviewItem = {
  event: EventRow;
  previewUrl: string | null;
  timestampLabel: string;
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

function formatRelativeTime(value: string | null, language: AppLanguage) {
  if (!value) return "—";

  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();

  if (!Number.isFinite(diffMs)) return "—";

  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const formatter = new Intl.RelativeTimeFormat(getIntlLocale(language), {
    numeric: "auto",
    style: "short",
  });

  if (absMs < hour) {
    return formatter.format(Math.round(diffMs / minute), "minute");
  }

  if (absMs < day) {
    return formatter.format(Math.round(diffMs / hour), "hour");
  }

  return formatter.format(Math.round(diffMs / day), "day");
}

function getAssetSortTime(asset: AssetPreviewRow) {
  const value = asset.captured_at ?? asset.created_at;

  if (!value) return Number.MAX_SAFE_INTEGER;

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
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
  if (language === "en") {
    return {
      pageEyebrow: "Home",
      pageTitle: "Venaris Home",
      pageBody:
        "Central overview of setup, wildlife activity and organization in the active context.",

      setupEyebrow: "Setup",
      setupGroundTitle: "Configure ground",
      setupGroundText:
        "Adjust the automatically created default ground so cameras, events and insights are assigned correctly.",
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

      latestEventTitle: "Latest Wildlife Events",
      latestEventText:
        "Compact visual overview of the most recent wildlife events in the current scope.",
      noRecentEvents:
        "No wildlife event is visible in the dashboard scope yet.",
      detailsLabel: "View details",
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
    setupGroundTitle: "Revier konfigurieren",
    setupGroundText:
      "Passe das automatisch angelegte Standardrevier an, damit Kameras, Events und Auswertungen sauber zugeordnet werden können.",
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

    latestEventTitle: "Letzte Wildtier-Ereignisse",
    latestEventText:
      "Kompakte Bildübersicht der letzten Wildtier-Ereignisse.",
    noRecentEvents: "Noch kein Wildtier-Ereignis sichtbar.",
    detailsLabel: "Details ansehen",
    noPreview: "Keine Vorschau",
    previewAlt: "Vorschau des letzten Wildtier-Ereignisse",
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

function EventGalleryCard({
  events,
  language,
}: {
  events: EventPreviewItem[];
  language: AppLanguage;
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

      {events.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
          {text.noRecentEvents}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map(({ event, previewUrl, timestampLabel }) => (
            <Link
              key={event.id}
              href={`/cameras/events/${event.id}`}
              className="group rounded-[24px] border border-white/10 bg-white/5 p-3 backdrop-blur-sm transition hover:border-amber-300/25 hover:bg-white/8"
            >
              <div className="aspect-video w-full overflow-hidden rounded-[16px] bg-white/5">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={text.previewAlt}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/45">
                    {text.noPreview}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-white/55">
                  {timestampLabel}
                </span>
                <span className="whitespace-nowrap font-medium text-amber-200 group-hover:text-amber-100">
                  {text.detailsLabel}
                </span>
              </div>
            </Link>
          ))}
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
      .select("id,timezone,is_default", { count: "exact" })
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
const reviers = (reviersResult.data ?? []) as RevierRow[];

const activeRevierIds = new Set(reviers.map((revier) => revier.id));

const scopedCameras = cameras.filter(
  (camera) => camera.revier_id && activeRevierIds.has(camera.revier_id),
);

const cameraIds = scopedCameras.map((camera) => camera.id);




  const membersCount = membersResult.count ?? 0;
  const openInvitesCount = invitesResult.count ?? 0;
  const subscription = subscriptionResult.data;

  let latestEvents: EventRow[] = [];
  let recentEventsCount = 0;
  let latestEventPreviews: EventPreviewItem[] = [];

  if (cameraIds.length > 0) {
    const [latestEventsResult, eventsCountResult] = await Promise.all([
      supabase
        .from("events")
        .select(
          "id,camera_id,start_at,end_at,top_species,top_count,relevance_score,created_at",
        )
        .in("camera_id", cameraIds)
        .order("start_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(9)
        .returns<EventRow[]>(),

supabase
  .from("event_feed")
  .select("id", { count: "exact", head: true })
  .in("camera_id", cameraIds)
  .gte("start_at", recentWindowIso)
  .lt("start_at", nowIso)
  .not("top_species", "is", null),



    ]);

    if (latestEventsResult.error) {
      throw new Error(
        `Failed to load latest events: ${latestEventsResult.error.message}`,
      );
    }

    if (eventsCountResult.error) {
      throw new Error(
        `Failed to load event count: ${eventsCountResult.error.message}`,
      );
    }

    latestEvents = latestEventsResult.data ?? [];
    recentEventsCount = eventsCountResult.count ?? 0;
  }

  if (latestEvents.length > 0) {
    const eventIds = latestEvents.map((event) => event.id);

    const { data: eventAssets, error: eventAssetsError } = await supabase
      .from("event_assets")
      .select("event_id,asset_id")
      .in("event_id", eventIds)
      .returns<EventAssetRow[]>();

    if (eventAssetsError) {
      throw new Error(
        `Failed to load latest event assets: ${eventAssetsError.message}`,
      );
    }

    const assetIds = Array.from(
      new Set((eventAssets ?? []).map((row) => row.asset_id)),
    );

    let assetsById = new Map<string, AssetPreviewRow>();
    let bestAnimalScoreByAssetId = new Map<string, number>();

    if (assetIds.length > 0) {
      const [assetsDataResult, detectionsDataResult] = await Promise.all([
        supabase
          .from("assets")
          .select("id,camera_id,storage_path,created_at,captured_at")
          .in("id", assetIds)
          .returns<AssetPreviewRow[]>(),

        supabase
          .from("detections")
          .select("asset_id,score")
          .in("asset_id", assetIds)
          .eq("label", "animal")
          .returns<AssetDetectionScoreRow[]>(),
      ]);

      if (assetsDataResult.error) {
        throw new Error(
          `Failed to load latest event preview assets: ${assetsDataResult.error.message}`,
        );
      }

      if (detectionsDataResult.error) {
        throw new Error(
          `Failed to load latest event preview detection scores: ${detectionsDataResult.error.message}`,
        );
      }

      assetsById = new Map(
        (assetsDataResult.data ?? []).map((asset) => [asset.id, asset]),
      );

      for (const detection of detectionsDataResult.data ?? []) {
        if (!detection.asset_id) continue;
        if (typeof detection.score !== "number") continue;

        const current = bestAnimalScoreByAssetId.get(detection.asset_id);

        if (current === undefined || detection.score > current) {
          bestAnimalScoreByAssetId.set(detection.asset_id, detection.score);
        }
      }
    }

    const assetsByEventId = new Map<string, AssetPreviewRow[]>();

    for (const row of eventAssets ?? []) {
      const asset = assetsById.get(row.asset_id);

      if (!asset) continue;

      const assetsForEvent = assetsByEventId.get(row.event_id) ?? [];
      assetsForEvent.push(asset);
      assetsByEventId.set(row.event_id, assetsForEvent);
    }

    latestEventPreviews = await Promise.all(
      latestEvents.map(async (event) => {
        const assetsForEvent = [...(assetsByEventId.get(event.id) ?? [])].sort(
          (a, b) => {
            const scoreA = bestAnimalScoreByAssetId.get(a.id) ?? -1;
            const scoreB = bestAnimalScoreByAssetId.get(b.id) ?? -1;
            const scoreDiff = scoreB - scoreA;

            if (scoreDiff !== 0) return scoreDiff;

            const capturedDiff = getAssetSortTime(a) - getAssetSortTime(b);

            if (capturedDiff !== 0) return capturedDiff;

            return a.id.localeCompare(b.id);
          },
        );

        const heroAsset = assetsForEvent[0] ?? null;
        const previewUrl = heroAsset
          ? await resolveAssetPreviewUrl({
              asset: {
                id: heroAsset.id,
                camera_id: heroAsset.camera_id,
                storage_path: heroAsset.storage_path ?? null,
              },
              isDemo: Boolean(organization.is_demo),
            })
          : null;

        return {
          event,
          previewUrl,
          timestampLabel: formatRelativeTime(
            heroAsset?.captured_at ??
              heroAsset?.created_at ??
              event.start_at ??
              event.created_at,
            language,
          ),
        };
      }),
    );
  }

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
  const showSetupCards = cameras.length === 0;
  const defaultRevier = reviers.find((revier) => revier.is_default);
  const setupRevierHref = defaultRevier
    ? `/orga/reviere/${defaultRevier.id}/edit`
    : "/orga/reviere";

  const setupCards = [
    showOrga
      ? {
          href: setupRevierHref,
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

        {showSetupCards && setupCards.length > 0 ? (
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
        <EventGalleryCard events={latestEventPreviews} language={language} />
      ) : null}
    </main>
  );
}