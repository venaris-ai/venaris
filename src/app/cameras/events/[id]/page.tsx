// src/app/cameras/events/[id]/page.tsx #3
export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import AssetGrid from "./AssetGrid";
import { requirePathAccess } from "@/lib/authz";
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

function buildEventsBackHref(revier?: string) {
  if (!revier) return "/cameras/events";
  const params = new URLSearchParams({ revier });
  return `/cameras/events?${params.toString()}`;
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
  const backHref = buildEventsBackHref(rawRevier);

  if (!eventId) {
    return (
      <main className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Event</h1>
            <p className="text-sm text-gray-600">Details & Assets</p>
          </div>
          <Link
            href={backHref}
            className="rounded-md border px-3 py-2 text-sm"
          >
            ← Zurück
          </Link>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
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
      <main className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Event</h1>
            <p className="text-sm text-gray-600">Details & Assets</p>
          </div>
          <Link
            href={backHref}
            className="rounded-md border px-3 py-2 text-sm"
          >
            ← Zurück
          </Link>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
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
      <main className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Event</h1>
            <p className="text-sm text-gray-600">Details & Assets</p>
          </div>
          <Link
            href={backHref}
            className="rounded-md border px-3 py-2 text-sm"
          >
            ← Zurück
          </Link>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
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
      <main className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Event</h1>
            <p className="text-sm text-gray-600">Details & Assets</p>
          </div>
          <Link
            href={backHref}
            className="rounded-md border px-3 py-2 text-sm"
          >
            ← Zurück
          </Link>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
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
      <main className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Event</h1>
            <p className="text-sm text-gray-600">Details & Assets</p>
          </div>
          <Link
            href={backHref}
            className="rounded-md border px-3 py-2 text-sm"
          >
            ← Zurück
          </Link>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
          Event nicht gefunden oder nicht erlaubt.
        </div>
      </main>
    );
  }

  const { data: eventAssets, error: assetsErr } = await supabase
    .from("event_assets")
    .select("asset_id")
    .eq("event_id", eventId);

  const assetIds = (eventAssets ?? [])
    .map((x: any) => x.asset_id)
    .filter(Boolean);

  let assets: any[] = [];
  if (!assetsErr && assetIds.length > 0) {
    const { data: assetsData, error: assetsDataErr } = await supabase
      .from("assets")
      .select(
        "id,camera_id,storage_path,created_at,captured_at,status,relevant,empty,empty_confidence"
      )
      .in("id", assetIds)
      .order("created_at", { ascending: false });

    if (!assetsDataErr && assetsData) assets = assetsData;
  }

  const signedUrlsByAssetId: Record<string, string> = {};
  for (const a of assets) {
    if (!a.storage_path) continue;
    const { data: signed } = await supabase.storage
      .from("camera-assets")
      .createSignedUrl(a.storage_path, 60 * 20);

    if (signed?.signedUrl) signedUrlsByAssetId[a.id] = signed.signedUrl;
  }

  const initialAssets = assets.map((a) => ({
    id: a.id,
    previewUrl: signedUrlsByAssetId[a.id],
    timestampLabel: fmt(a.captured_at ?? a.created_at),
    storagePath: a.storage_path,
    relevant: a.relevant ?? null,
    empty: a.empty ?? null,
    emptyConfidence: a.empty_confidence ?? null,
  }));

  const cameraLabel = camera?.name
    ? `${camera.name}${camera.location_name ? ` (${camera.location_name})` : ""}`
    : event.camera_id;

  const topLabel = event.top_species
    ? `${prettySpecies(event.top_species)}${
        event.top_count ? ` (${event.top_count})` : ""
      }`
    : "—";

  return (
    <main className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Event</h1>
          <p className="text-sm text-gray-600">
            Zeitraum: {fmt(event.start_at)} – {fmt(event.end_at)}
          </p>
        </div>

        <Link
          href={backHref}
          className="rounded-md border px-3 py-2 text-sm"
        >
          ← Zurück
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Kamera:</span> {cameraLabel}
          </div>

          <div className="text-sm text-gray-700">
            <span className="font-medium">Assets im Event:</span> {assets.length}
          </div>

          <div className="text-sm text-gray-700">
            <span className="font-medium">Top Species:</span> {topLabel}
          </div>

          <div className="text-sm text-gray-700">
            <span className="font-medium">Relevance Score:</span>{" "}
            {typeof event.relevance_score === "number"
              ? `${event.relevance_score.toFixed(3)} · ${scoreBadge(event.relevance_score)}`
              : "—"}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-medium">Assets</h2>

        {assets.length === 0 ? (
          <div className="mt-3 rounded-xl border p-4 text-sm text-gray-600">
            Keine Assets gefunden (event_assets leer oder Asset-IDs fehlen).
          </div>
        ) : (
          <AssetGrid initialAssets={initialAssets} />
        )}
      </div>
    </main>
  );
}