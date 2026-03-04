export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("de-DE");
}

export default async function EventsPage() {
  const supabase = supabaseServer();

  const { data: events, error } = await supabase
    .from("event_feed")
    .select(
      "id,camera_id,start_at,end_at,asset_count,top_species,top_count,relevance_score"
    )
    .order("end_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Events</h1>
          <p className="text-sm text-gray-600">Aktuelle Event-Zusammenfassungen</p>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
          Fehler: {error.message}
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Events</h1>
        <p className="text-sm text-gray-600">Aktuelle Event-Zusammenfassungen</p>
      </div>

      <div className="space-y-3">
        {(events ?? []).map((e) => (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            className="block rounded-xl border p-4 transition hover:bg-gray-50"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">Zeitraum:</span>{" "}
                {fmt(e.start_at)} – {fmt(e.end_at)}
              </div>
              <div className="text-sm">
                <span className="font-medium">Assets:</span> {e.asset_count ?? 0}
              </div>
            </div>

            <div className="mt-2 text-sm text-gray-700">
              <span className="font-medium">Kamera:</span> {e.camera_id}
            </div>

            <div className="mt-2 text-sm text-gray-700">
              <span className="font-medium">Top:</span>{" "}
              {e.top_species
                ? `${e.top_species}${e.top_count ? ` (${e.top_count})` : ""}`
                : "—"}
              {typeof e.relevance_score === "number"
                ? ` · Score: ${e.relevance_score.toFixed(2)}`
                : ""}
            </div>

            <div className="mt-3 text-xs text-gray-500 underline">
              Details anzeigen →
            </div>
          </Link>
        ))}

        {(!events || events.length === 0) && (
          <div className="rounded-xl border p-4 text-sm text-gray-600">
            Noch keine Events vorhanden.
          </div>
        )}
      </div>
    </main>
  );
}