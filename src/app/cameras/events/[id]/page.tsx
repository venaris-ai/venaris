// src/app/cameras/events/[id]/page.tsx #10
export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import AssetGrid from "./AssetGrid";
import EventHeroPanel from "./EventHeroPanel";
import EventDetailControls from "./EventDetailControls";
import { requirePathAccess } from "@/lib/authz";
import { resolveAssetPreviewUrl } from "@/lib/demoAssetResolver";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

type SearchParams = {
  revier?: string;
};

type RevierRow = {
  id: string;
  name: string;
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

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("de-DE");
}

function prettySpecies(value: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function scoreBadge(score: number | null) {
  if (typeof score !== "number") return "—";
  if (score >= 0.9) return "very high";
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function buildBackHref(revier?: string) {
  if (!revier) return "/cameras/ingest";
  const params = new URLSearchParams({ revier });
  return `/cameras/ingest?${params.toString()}`;
}

export default async function CameraEventDetailPage(props: {
  params?: Promise<{ id?: string }> | { id?: string };
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const supabase = supabaseServer();
  const params = props?.params ? await Promise.resolve(props.params) : undefined;
  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  const eventId: string | undefined = params?.id;
  const rawRevier = searchParams?.revier;
  const backHref = buildBackHref(rawRevier);

  if (!eventId) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                Event
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">Event</h1>
              <p className="mt-2 text-sm text-white/68">Details & Assets</p>
            </div>
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              ← Zurück
            </Link>
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Event-ID fehlt (params.id ist undefined). Bitte Seite neu laden.
        </div>
      </main>
    );
  }

  const ctx = await requirePathAccess(`/cameras/events/${eventId}`);
  const activeOrganization = ctx.activeMembership?.organizations;

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
                Event
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">Event</h1>
              <p className="mt-2 text-sm text-white/68">Details & Assets</p>
            </div>
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              ← Zurück
            </Link>
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Event nicht gefunden: {eventErr?.message ?? "unknown error"}
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
                Event
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">Event</h1>
              <p className="mt-2 text-sm text-white/68">Details & Assets</p>
            </div>
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              ← Zurück
            </Link>
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Event nicht gefunden oder nicht erlaubt.
        </div>
      </main>
    );
  }

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name")
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
                Event
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">Event</h1>
              <p className="mt-2 text-sm text-white/68">Details & Assets</p>
            </div>
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              ← Zurück
            </Link>
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Fehler: {reviersError.message}
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
                Event
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">Event</h1>
              <p className="mt-2 text-sm text-white/68">Details & Assets</p>
            </div>
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              ← Zurück
            </Link>
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Event nicht gefunden oder nicht erlaubt.
        </div>
      </main>
    );
  }

  const { data: eventAssets, error: assetsErr } = await supabase
    .from("event_assets")
    .select("asset_id")
    .eq("event_id", eventId);

  const assetIds = (eventAssets ?? []).map((x: any) => x.asset_id).filter(Boolean);

  let assets: any[] = [];
  if (!assetsErr && assetIds.length > 0) {
    const { data: assetsData, error: assetsDataErr } = await supabase
      .from("assets")
      .select(
        "id,camera_id,storage_path,created_at,captured_at,status,relevant,relevant_user,empty,empty_confidence"
      )
      .in("id", assetIds)
      .order("captured_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (!assetsDataErr && assetsData) assets = assetsData;
  }

  const signedUrlsByAssetId: Record<string, string> = {};
  for (const a of assets) {
    const url = await resolveAssetPreviewUrl({
      asset: {
        id: a.id,
        camera_id: a.camera_id,
        storage_path: a.storage_path,
      },
      isDemo: Boolean(activeOrganization.is_demo),
    });

    if (url) signedUrlsByAssetId[a.id] = url;
  }

  const initialAssets: AssetViewItem[] = assets.map((a) => ({
    id: a.id,
    previewUrl: signedUrlsByAssetId[a.id],
    timestampLabel: fmt(a.captured_at ?? a.created_at),
    storagePath: a.storage_path,
    relevant: a.relevant,
    relevantUser: a.relevant_user ?? null,
    empty: a.empty ?? null,
    emptyConfidence: a.empty_confidence ?? null,
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

  const cameraLabel = camera?.name
    ? `${camera.name}${camera.location_name ? ` (${camera.location_name})` : ""}`
    : "Unbenannte Kamera";

  const topSpeciesLabel = prettySpecies(event.top_species);

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              Event
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">{topSpeciesLabel}</h1>
            <p className="mt-2 text-sm text-white/68">
              Zeitraum: {fmt(event.start_at)} – {fmt(event.end_at)}
            </p>
          </div>

          <Link
            href={backHref}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            ← Zurück
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_380px]">
        <div>
          <EventHeroPanel asset={heroAsset} totalCount={initialAssets.length} />
        </div>

        <aside className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <EventDetailControls
            assetId={heroAsset?.id ?? null}
            initialRelevantAuto={heroAsset?.relevant ?? null}
            initialRelevantUser={heroAsset?.relevantUser ?? null}
            initialSpeciesAuto={heroDetection?.species ?? null}
            initialSpeciesUser={heroDetection?.species_user ?? null}
            isDemo={Boolean(activeOrganization.is_demo)}
          />

          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">Wahrscheinlichkeit</div>
            <div className="mt-1 text-sm font-medium text-white">
              {typeof event.relevance_score === "number"
                ? `${Math.round(event.relevance_score * 100)}% · ${scoreBadge(
                    event.relevance_score
                  )}`
                : "—"}
            </div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">Kamera</div>
            <div className="mt-1 text-sm font-medium text-white">{cameraLabel}</div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">Zeitpunkt</div>
            <div className="mt-1 text-sm font-medium text-white">
              {heroAsset?.timestampLabel ?? fmt(event.start_at)}
            </div>
          </div>
        </aside>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-medium text-white">Weitere Aufnahmen</h2>
            <p className="mt-1 text-sm text-white/62">
              Weitere Bilder dieses Events. Relevanz kann hier weiterhin geprüft und
              überschrieben werden.
            </p>
          </div>
        </div>

        {initialAssets.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            Keine Assets gefunden (event_assets leer oder Asset-IDs fehlen).
          </div>
        ) : additionalAssets.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            Für dieses Event gibt es keine weiteren Aufnahmen.
          </div>
        ) : (
          <AssetGrid initialAssets={additionalAssets} />
        )}
      </section>
    </main>
  );
}