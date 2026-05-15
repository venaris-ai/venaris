// src/app/cameras/events/[id]/page.tsx #18
export const runtime = "nodejs";

import Link from "next/link";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import EventAssetReviewPanel from "./EventAssetReviewPanel";
import { requirePathAccess } from "@/lib/authz";
import { resolveAssetPreviewUrl } from "@/lib/demoAssetResolver";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import { formatAppDateTime } from "@/lib/dateTime";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  getSpeciesOptions,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";

type SearchParams = {
  revier?: string;
};

type RevierRow = {
  id: string;
  name: string;
  timezone: string | null;
};

type AssetViewItem = {
  id: string;
  previewUrl?: string;
  timestampLabel: string;
  storagePath?: string;
  relevant: boolean;
  relevantUser: boolean | null;
  empty?: boolean | null;
  emptyConfidence?: number | null;
};


type DetectionTopRow = {
  asset_id: string | null;
  species: string | null;
  species_user: string | null;
  score: number | null; // MegaDetector animal score
  meta: unknown;
  speciesScore?: number | null; // SpeciesNet species score from meta.species.score
};

function readSpeciesScore(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;

  const speciesMeta = (meta as { species?: unknown }).species;
  if (!speciesMeta || typeof speciesMeta !== "object") return null;

  const value = (speciesMeta as { score?: unknown }).score;
  const numericValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  return Number.isFinite(numericValue) ? numericValue : null;
}



function buildBackHref(revier?: string) {
  if (!revier) return "/cameras/ingest";
  const params = new URLSearchParams({ revier });
  return `/cameras/ingest?${params.toString()}`;
}

function buildEventHref(eventId: string, revier?: string) {
  if (!revier) return `/cameras/events/${eventId}`;
  const params = new URLSearchParams({ revier });
  return `/cameras/events/${eventId}?${params.toString()}`;
}

function buildEventQuerySuffix(revier?: string) {
  if (!revier) return "";
  const params = new URLSearchParams({ revier });
  return `?${params.toString()}`;
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Event",
      title: "Event",
      intro: "Details & assets",
      overview: "Overview",
      olderEvent: "← Older",
      newerEvent: "Newer →",
      missingId: "Event ID is missing (params.id is undefined). Please reload the page.",
      notFound: "Event not found",
      notFoundOrForbidden: "Event not found or not allowed.",
      errorPrefix: "Error:",
      unnamedCamera: "Unnamed camera",
    };
  }

  return {
    eyebrow: "Ereignis",
    title: "Ereignis",
    intro: "Details & Assets",
    overview: "Übersicht",
    olderEvent: "← Älter",
    newerEvent: "Neuer →",
    missingId: "Ereignis-ID fehlt (params.id ist undefined). Bitte Seite neu laden.",
    notFound: "Ereignis nicht gefunden",
    notFoundOrForbidden: "Ereignis nicht gefunden oder nicht erlaubt.",
    errorPrefix: "Fehler:",
    unnamedCamera: "Unbenannte Kamera",
  };
}

function EventNavigation({
  olderEventHref,
  overviewHref,
  newerEventHref,
  text,
}: {
  olderEventHref: string | null;
  overviewHref: string;
  newerEventHref: string | null;
  text: ReturnType<typeof t>;
}) {
  const linkClass =
    "rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white";
  const disabledClass =
    "rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/28";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {olderEventHref ? (
        <Link href={olderEventHref} className={linkClass}>
          {text.olderEvent}
        </Link>
      ) : (
        <span className={disabledClass}>{text.olderEvent}</span>
      )}

      <Link href={overviewHref} className={linkClass}>
        {text.overview}
      </Link>

      {newerEventHref ? (
        <Link href={newerEventHref} className={linkClass}>
          {text.newerEvent}
        </Link>
      ) : (
        <span className={disabledClass}>{text.newerEvent}</span>
      )}
    </div>
  );
}

export default async function CameraEventDetailPage(props: {
  params?: Promise<{ id?: string }> | { id?: string };
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = props?.params ? await Promise.resolve(props.params) : undefined;
  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  const eventId: string | undefined = params?.id;
  const rawRevier = searchParams?.revier;
  const backHref = buildBackHref(rawRevier);
  const eventQuerySuffix = buildEventQuerySuffix(rawRevier);
  const cookieStore = await cookies();

  if (!eventId) {
    const language = resolveLanguage({
      cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    });
    const text = t(language);

    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <EventNavigation
              olderEventHref={null}
              overviewHref={backHref}
              newerEventHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.missingId}
        </div>
      </main>
    );
  }

  const ctx = await requirePathAccess(`/cameras/events/${eventId}`);

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const supabase = supabaseServer();

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
  const activeOrganization = ctx.activeMembership?.organizations;

  const speciesMetaRows = await loadSpeciesMeta();
  const speciesMetaMap = buildSpeciesMetaMap(speciesMetaRows);

const speciesOptions = getSpeciesOptions(speciesMetaRows, language).sort(
  (a, b) => {
    if (a.value === "other") return 1;
    if (b.value === "other") return -1;

    return a.label.localeCompare(b.label, language === "de" ? "de" : "en", {
      sensitivity: "base",
    });
  }
);



  const speciesLabelByCode = speciesOptions.reduce<Record<string, string>>(
    (acc, option) => {
      acc[option.value] = option.label;
      return acc;
    },
    {}
  );

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select(
      "id,camera_id,start_at,end_at,top_label,top_species,top_count,relevance_score,created_at"
    )
    .eq("id", eventId)
    .single();

  if (eventErr || !event) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <EventNavigation
              olderEventHref={null}
              overviewHref={backHref}
              newerEventHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.notFound}: {eventErr?.message ?? "unknown error"}
        </div>
      </main>
    );
  }

  const { data: camera } = await supabase
    .from("cameras")
    .select("id,name,location_name,organization_id,revier_id")
    .eq("id", event.camera_id)
    .single();

  if (!activeOrganization || !camera || camera.organization_id !== activeOrganization.id) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <EventNavigation
              olderEventHref={null}
              overviewHref={backHref}
              newerEventHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.notFoundOrForbidden}
        </div>
      </main>
    );
  }

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,timezone")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <EventNavigation
              olderEventHref={null}
              overviewHref={backHref}
              newerEventHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.errorPrefix} {reviersError.message}
        </div>
      </main>
    );
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const allowedReviers: RevierOption[] = reviers.map((revier) => ({
    id: revier.id,
    name: revier.name,
  }));
  const revierScope = resolveRevierScope(rawRevier, allowedReviers);
  const allowedRevierIds = allowedReviers.map((revier) => revier.id);

  const cameraAllowedInScope =
    allowedRevierIds.length > 0 &&
    (revierScope.type === "single"
      ? camera.revier_id === revierScope.revierId
      : allowedRevierIds.includes(camera.revier_id));

  if (!cameraAllowedInScope) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <EventNavigation
              olderEventHref={null}
              overviewHref={backHref}
              newerEventHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.notFoundOrForbidden}
        </div>
      </main>
    );
  }

  const eventTimeZone =
    reviers.find((revier) => revier.id === camera.revier_id)?.timezone ?? null;

  let scopeCameraIds: string[] = [camera.id];

  if (allowedRevierIds.length > 0) {
    let scopeCameraQuery = supabase
      .from("cameras")
      .select("id")
      .eq("organization_id", activeOrganization.id);

    if (revierScope.type === "single") {
      scopeCameraQuery = scopeCameraQuery.eq("revier_id", revierScope.revierId);
    } else {
      scopeCameraQuery = scopeCameraQuery.in("revier_id", allowedRevierIds);
    }

    const { data: scopeCameras } = await scopeCameraQuery;

    const nextScopeCameraIds = (scopeCameras ?? [])
      .map((row: { id: string | null }) => row.id)
      .filter(Boolean) as string[];

    if (nextScopeCameraIds.length > 0) {
      scopeCameraIds = nextScopeCameraIds;
    }
  }

  let olderEventHref: string | null = null;
  let newerEventHref: string | null = null;

  if (scopeCameraIds.length > 0) {
    const { data: olderEvent } = await supabase
      .from("event_feed")
      .select("id,start_at")
      .in("camera_id", scopeCameraIds)
      .neq("id", eventId)
      .lt("start_at", event.start_at)
      .gt("asset_count", 0)
      .gt("relevance_score", 0)
      .not("top_species", "is", null)
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: newerEvent } = await supabase
      .from("event_feed")
      .select("id,start_at")
      .in("camera_id", scopeCameraIds)
      .neq("id", eventId)
      .gt("start_at", event.start_at)
      .gt("asset_count", 0)
      .gt("relevance_score", 0)
      .not("top_species", "is", null)
      .order("start_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (olderEvent?.id) {
      olderEventHref = buildEventHref(olderEvent.id, rawRevier);
    }

    if (newerEvent?.id) {
      newerEventHref = buildEventHref(newerEvent.id, rawRevier);
    }
  }

  const afterRemoveHref = olderEventHref ?? newerEventHref ?? backHref;

  const { data: eventAssets, error: assetsErr } = await supabase
    .from("event_assets")
    .select("asset_id")
    .eq("event_id", eventId);

  const assetIds = (eventAssets ?? [])
    .map((row: { asset_id: string | null }) => row.asset_id)
    .filter(Boolean) as string[];

  let assets: Array<{
    id: string;
    camera_id: string;
    storage_path: string | null;
    created_at: string | null;
    captured_at: string | null;
    status: string | null;
    relevant: boolean;
    relevant_user: boolean | null;
    empty: boolean | null;
    empty_confidence: number | null;
  }> = [];

  if (!assetsErr && assetIds.length > 0) {
    const { data: assetsData, error: assetsDataErr } = await supabase
      .from("assets")
      .select(
        "id,camera_id,storage_path,created_at,captured_at,status,relevant,relevant_user,empty,empty_confidence"
      )
      .in("id", assetIds)
      .order("captured_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (!assetsDataErr && assetsData) {
      assets = assetsData;
    }
  }

  const signedUrlsByAssetId: Record<string, string> = {};
  for (const asset of assets) {
    const url = await resolveAssetPreviewUrl({
      asset: {
        id: asset.id,
        camera_id: asset.camera_id,
        storage_path: asset.storage_path ?? null,
      },
      isDemo: Boolean(activeOrganization.is_demo),
    });

    if (url) {
      signedUrlsByAssetId[asset.id] = url;
    }
  }

  const detectionsByAssetId: Record<string, DetectionTopRow> = {};
  if (assetIds.length > 0) {

const { data: detectionData } = await supabase
  .from("detections")
  .select("asset_id,species,species_user,score,meta")
  .in("asset_id", assetIds)
  .eq("label", "animal")
  .order("score", { ascending: false })
  .returns<DetectionTopRow[]>();

for (const detection of detectionData ?? []) {
  if (detection.asset_id && !detectionsByAssetId[detection.asset_id]) {
    detectionsByAssetId[detection.asset_id] = {
      ...detection,
      speciesScore: readSpeciesScore(detection.meta),
    };
  }
}

  }

  const initialAssets: AssetViewItem[] = assets
    .map((asset) => ({
      id: asset.id,
      previewUrl: signedUrlsByAssetId[asset.id],
      timestampLabel: formatAppDateTime(
        asset.captured_at ?? asset.created_at,
        language,
        eventTimeZone
      ),
      storagePath: asset.storage_path ?? undefined,
      relevant: asset.relevant,
      relevantUser: asset.relevant_user ?? null,
      empty: asset.empty ?? null,
      emptyConfidence: asset.empty_confidence ?? null,
    }))
    .sort((a, b) => {
const scoreA =
  detectionsByAssetId[a.id]?.speciesScore ??
  detectionsByAssetId[a.id]?.score ??
  -1;
const scoreB =
  detectionsByAssetId[b.id]?.speciesScore ??
  detectionsByAssetId[b.id]?.score ??
  -1;

      const scoreDiff = scoreB - scoreA;

      if (scoreDiff !== 0) return scoreDiff;

      const originalIndexA = assets.findIndex((asset) => asset.id === a.id);
      const originalIndexB = assets.findIndex((asset) => asset.id === b.id);

      return originalIndexA - originalIndexB;
    });

  const initialSelectedAssetId = initialAssets[0]?.id ?? null;
  const cameraLabel = camera.name
    ? `${camera.name}${camera.location_name ? ` (${camera.location_name})` : ""}`
    : text.unnamedCamera;

  const topSpeciesLabel = getSpeciesLabel(
    event.top_species,
    language,
    speciesMetaMap
  );

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              {text.eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              {topSpeciesLabel}
            </h1>
            <p className="mt-2 text-sm text-white/68">
              {formatAppDateTime(event.start_at, language, eventTimeZone)} –{" "}
              {formatAppDateTime(event.end_at, language, eventTimeZone)}
            </p>
          </div>

          <EventNavigation
            olderEventHref={olderEventHref}
            overviewHref={backHref}
            newerEventHref={newerEventHref}
            text={text}
          />
        </div>
      </section>

      <EventAssetReviewPanel
        assets={initialAssets}
        detectionsByAssetId={detectionsByAssetId}
        initialSelectedAssetId={initialSelectedAssetId}
        isDemo={Boolean(activeOrganization.is_demo)}
        language={language}
        speciesOptions={speciesOptions}
        speciesLabelByCode={speciesLabelByCode}
        topSpeciesLabel={topSpeciesLabel}
        eventCount={event.top_count}
        cameraLabel={cameraLabel}
        currentEventId={eventId}
        afterRemoveHref={afterRemoveHref}
        eventQuerySuffix={eventQuerySuffix}
      />
    </main>
  );
}