export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

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

export default async function EventsPage() {
  const supabase = supabaseServer();

  const { data: events, error } = await supabase
    .from("event_feed")
    .select(
      "id,camera_id,start_at,end_at,asset_count,top_species,top_count,relevance_score"
    )
    .order("relevance_score", { ascending: false, nullsFirst: false })
    .order("end_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Events</h1>
          <p className="text-sm text-gray-600">
            Priorisierte Event-Zusammenfassungen
          </p>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
          Fehler: {error.message}
        </div>
      </main>
    );
  }

  const cameraIds = Array.from(
    new Set((events ?? []).map((e) => e.camera_id).filter(Boolean))
  );

  let camerasById: Record<string, string> = {};

  if (cameraIds.length > 0) {
    const { data: cameras } = await supabase
      .from("cameras")
      .select("id,name,location_name")
      .in("id", cameraIds);

    camerasById = Object.fromEntries(
      (cameras ?? []).map((c) => [
        c.id,
        c.name
          ? `${c.name}${c.location_name ? ` (${c.location_name})` : ""}`
          : c.id,
      ])
    );
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Events</h1>
        <p className="text-sm text-gray-600">
          Priorisierte Event-Zusammenfassungen nach Relevanz
        </p>
      </div>

      <div className="space-y-3">
        {(events ?? []).map((e) => {
          const cameraLabel = camerasById[e.camera_id] ?? e.camera_id ?? "—";

          return (
            <Link
              key={e.id}
              href={`/events/${e.id}`}
              className="block rounded-xl border bg-white p-4 transition hover:bg-gray-50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    {prettySpecies(e.top_species)}
                    {e.top_count ? ` (${e.top_count})` : ""}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {fmt(e.start_at)} – {fmt(e.end_at)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium">
                    {typeof e.relevance_score === "number"
                      ? e.relevance_score.toFixed(3)
                      : "—"}
                  </div>
                  <div className="text-xs text-gray-500">
                    Score · {scoreBadge(e.relevance_score ?? null)}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                <div>
                  <span className="font-medium">Kamera:</span> {cameraLabel}
                </div>
                <div>
                  <span className="font-medium">Assets:</span> {e.asset_count ?? 0}
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-500 underline">
                Details anzeigen →
              </div>
            </Link>
          );
        })}

        {(!events || events.length === 0) && (
          <div className="rounded-xl border p-4 text-sm text-gray-600">
            Noch keine Events vorhanden.
          </div>
        )}
      </div>
    </main>
  );
}