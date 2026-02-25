export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import AssetGrid from "./AssetGrid";

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("de-DE");
}

export default async function EventDetailPage(props: any) {
  const supabase = supabaseServer();

  // ✅ Next.js versions-robust: params kann Objekt ODER Promise sein
  const params = await Promise.resolve(props?.params);
  const eventId: string | undefined = params?.id;

  if (!eventId) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Event Details</h1>
          <Link href="/events" className="text-sm underline">
            Zurück
          </Link>
        </div>
        <p className="mt-4 text-red-600">
          Event-ID fehlt (params.id ist undefined). Bitte Seite neu laden.
        </p>
      </div>
    );
  }

  // 1) Event laden
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select(
      "id,camera_id,start_at,end_at,top_label,top_species,top_count,relevance_score,created_at"
    )
    .eq("id", eventId)
    .single();

  if (eventErr || !event) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Event Details</h1>
          <Link href="/events" className="text-sm underline">
            Zurück
          </Link>
        </div>
        <p className="mt-4 text-red-600">
          Event nicht gefunden: {eventErr?.message ?? "unknown error"}
        </p>
      </div>
    );
  }

  // 2) Kamera-Name laden (für UX)
  const { data: camera } = await supabase
    .from("cameras")
    .select("id,name,location_name")
    .eq("id", event.camera_id)
    .single();

  // 3) Assets zum Event laden (via Join-Tabelle)
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
      .select("id, camera_id, storage_path, created_at, captured_at, status, relevant")
      .in("id", assetIds)
      .order("created_at", { ascending: false });

    if (!assetsDataErr && assetsData) assets = assetsData;
  }

  // 4) Signed URLs erzeugen (serverseitig)
  const signedUrlsByAssetId: Record<string, string> = {};
  for (const a of assets) {
    if (!a.storage_path) continue;
    const { data: signed } = await supabase.storage
      .from("camera-assets")
      .createSignedUrl(a.storage_path, 60 * 20); // 20 min

    if (signed?.signedUrl) signedUrlsByAssetId[a.id] = signed.signedUrl;
  }

  // 5) Client Grid Input vorbereiten
  const initialAssets = assets.map((a) => ({
    id: a.id,
    previewUrl: signedUrlsByAssetId[a.id],
    timestampLabel: fmt(a.captured_at ?? a.created_at),
    storagePath: a.storage_path,
    relevant: !!a.relevant,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Event</h1>
          <div className="mt-1 text-sm text-gray-600">
            Zeitraum: {fmt(event.start_at)} – {fmt(event.end_at)}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/events" className="text-sm underline">
            Zurück
          </Link>
          <Link href="/" className="text-sm underline">
            Home
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-white/50 p-4 shadow-sm">
        <div className="text-sm">
          <span className="font-medium">Kamera:</span>{" "}
          {camera?.name
            ? `${camera.name}${camera.location_name ? ` (${camera.location_name})` : ""}`
            : event.camera_id}
        </div>

        <div className="mt-2 text-sm text-gray-700">
          <span className="font-medium">Top:</span>{" "}
          {event.top_species
            ? `${event.top_species}${event.top_count ? ` (${event.top_count})` : ""}`
            : "—"}
          {typeof event.relevance_score === "number"
            ? ` · Score: ${event.relevance_score.toFixed(2)}`
            : ""}
        </div>

        <div className="mt-2 text-sm text-gray-700">
          <span className="font-medium">Assets im Event:</span> {assets.length}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">Assets</h2>

        {assets.length === 0 ? (
          <div className="mt-3 rounded-xl border p-4 text-sm text-gray-600">
            Keine Assets gefunden (event_assets leer oder Asset-IDs fehlen).
          </div>
        ) : (
          <AssetGrid initialAssets={initialAssets} />
        )}
      </div>
    </div>
  );
}