// src/app/cameras/events/[id]/page.tsx #14
export const runtime = "nodejs";

import Link from "next/link";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import AssetGrid from "./AssetGrid";
import EventHeroPanel from "./EventHeroPanel";
import EventDetailControls from "./EventDetailControls";
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
  species: string | null;
  species_user: string | null;
  score: number | null;
};

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

function buildBackHref(revier?: string) {
  if (!revier) return "/cameras/ingest";
  const params = new URLSearchParams({ revier });
  return `/cameras/ingest?${params.toString()}`;
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Event",
      title: "Event",
      intro: "Details & assets",
      back: "← Back",
      missingId: "Event ID is missing (params.id is undefined). Please reload the page.",
      notFound: "Event not found",
      notFoundOrForbidden: "Event not found or not allowed.",
      errorPrefix: "Error:",
      probability: "Probability",
      camera: "Camera",
      timestamp: "Timestamp",
      additionalShotsTitle: "More captures",
      additionalShotsText:
        "Additional images from this event. Relevance can still be reviewed and overridden here.",
      noAssets:
        "No assets found (event_assets empty or asset IDs missing).",
      noAdditionalShots: "There are no additional captures for this event.",
      unnamedCamera: "Unnamed camera",
    };
  }

  return {
    eyebrow: "Event",
    title: "Event",
    intro: "Details & Assets",
    back: "← Zurück",
    missingId: "Event-ID fehlt (params.id ist undefined). Bitte Seite neu laden.",
    notFound: "Event nicht gefunden",
    notFoundOrForbidden: "Event nicht gefunden oder nicht erlaubt.",
    errorPrefix: "Fehler:",
    probability: "Wahrscheinlichkeit",
    camera: "Kamera",
    timestamp: "Zeitpunkt",
    additionalShotsTitle: "Weitere Aufnahmen",
    additionalShotsText:
      "Weitere Bilder dieses Events. Relevanz kann hier weiterhin geprüft und überschrieben werden.",
    noAssets: "Keine Assets gefunden (event_assets leer oder Asset-IDs fehlen).",
    noAdditionalShots: "Für dieses Event gibt es keine weiteren Aufnahmen.",
    unnamedCamera: "Unbenannte Kamera",
  };
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
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              {text.back}
            </Link>
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
  const speciesOptions = getSpeciesOptions(speciesMetaRows, language);
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
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              {text.back}
            </Link>
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
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              {text.back}
            </Link>
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
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              {text.back}
            </Link>
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
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              {text.back}
            </Link>
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

  const initialAssets: AssetViewItem[] = assets.map((asset) => ({
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
  }));

  const heroAsset = initialAssets[0] ?? null;
  const additionalAssets = initialAssets.slice(1);

  let heroDetection: DetectionTopRow | null = null;
  if (heroAsset) {
    const { data: detectionData } = await supabase
      .from("detections")
      .select("species,species_user,score")
      .eq("asset_id", heroAsset.id)
      .eq("label", "animal")
      .order("score", { ascending: false })
      .limit(1)
      .returns<DetectionTopRow[]>();

    heroDetection = detectionData?.[0] ?? null;
  }

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
        <div className="flex items-start justify-between gap-4">
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

          <Link
            href={backHref}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            {text.back}
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_380px]">
        <div>
          <EventHeroPanel
            asset={heroAsset}
            totalCount={initialAssets.length}
            language={language}
          />
        </div>

        <aside className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <EventDetailControls
            assetId={heroAsset?.id ?? null}
            initialRelevantAuto={heroAsset?.relevant ?? null}
            initialRelevantUser={heroAsset?.relevantUser ?? null}
            initialSpeciesAuto={heroDetection?.species ?? null}
            initialSpeciesUser={heroDetection?.species_user ?? null}
            isDemo={Boolean(activeOrganization.is_demo)}
            language={language}
            speciesOptions={speciesOptions}
            speciesLabelByCode={speciesLabelByCode}
            topSpeciesLabel={topSpeciesLabel}
            eventCount={event.top_count}
            assetCount={initialAssets.length}
          />

          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">{text.probability}</div>
            <div className="mt-1 text-sm font-medium text-white">
              {typeof event.relevance_score === "number"
                ? `${Math.round(event.relevance_score * 100)}% · ${scoreBadge(
                    event.relevance_score,
                    language
                  )}`
                : "—"}
            </div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">{text.camera}</div>
            <div className="mt-1 text-sm font-medium text-white">
              {cameraLabel}
            </div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">{text.timestamp}</div>
            <div className="mt-1 text-sm font-medium text-white">
              {heroAsset?.timestampLabel ??
                formatAppDateTime(event.start_at, language, eventTimeZone)}
            </div>
          </div>
        </aside>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-medium text-white">
              {text.additionalShotsTitle}
            </h2>
            <p className="mt-1 text-sm text-white/62">
              {text.additionalShotsText}
            </p>
          </div>
        </div>

        {initialAssets.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            {text.noAssets}
          </div>
        ) : additionalAssets.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            {text.noAdditionalShots}
          </div>
        ) : (
          <AssetGrid
            initialAssets={additionalAssets}
            isDemo={Boolean(activeOrganization.is_demo)}
            language={language}
          />
        )}
      </section>
    </main>
  );
}