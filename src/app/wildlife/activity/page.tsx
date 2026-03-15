// src/app/wildlife/activity/page.tsx
export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireActiveOrganization } from "@/lib/auth";

type PeriodKey = "30d" | "90d" | "365d";

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

type EventSpeciesSummaryRow = {
  event_id: string;
  species: string;
  event_species_count: number;
  best_score: number | null;
};

type CameraRow = {
  id: string;
  name: string;
  location_name: string | null;
};

function resolvePeriodRange(period: PeriodKey) {
  const end = new Date();
  const start = new Date(end);

  if (period === "30d") start.setDate(start.getDate() - 30);
  else if (period === "90d") start.setDate(start.getDate() - 90);
  else start.setDate(start.getDate() - 365);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

function prettySpecies(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function titleCase(value: string | null | undefined) {
  const s = prettySpecies(value);
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtTs(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("de-DE");
}

function fmtHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function buildHref(period: PeriodKey) {
  const params = new URLSearchParams();
  params.set("period", period);
  return `/wildlife/activity?${params.toString()}`;
}

async function fetchEventSpeciesSummaryChunked(
  supabase: ReturnType<typeof supabaseServer>,
  eventIds: string[],
  chunkSize = 200
) {
  const rows: EventSpeciesSummaryRow[] = [];

  for (let i = 0; i < eventIds.length; i += chunkSize) {
    const chunk = eventIds.slice(i, i + chunkSize);

    const { data, error } = await supabase
      .from("event_species_summary")
      .select("event_id,species,event_species_count,best_score")
      .in("event_id", chunk);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...((data ?? []) as EventSpeciesSummaryRow[]));
  }

  return rows;
}

export default async function WildlifeActivityPage(props: any) {
  const { activeMembership } = await requireActiveOrganization();
  const activeOrganization = activeMembership.organizations;

  const searchParams = await Promise.resolve(props?.searchParams);
  const rawPeriod = searchParams?.period;
  const period: PeriodKey =
    rawPeriod === "30d" || rawPeriod === "90d" || rawPeriod === "365d"
      ? rawPeriod
      : "30d";

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Activity</h1>
            <p className="text-sm text-gray-600">
              Aktivitätsmuster der aktiven Organisation nach Stunde und Kamera.
            </p>
          </div>

          <Link
            href="/wildlife"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Zurück zu Wildlife
          </Link>
        </section>

        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Active organization not found.
        </div>
      </main>
    );
  }

  const supabase = supabaseServer();
  const { startAt, endAt } = resolvePeriodRange(period);

  const { data: cameras, error: camerasError } = await supabase
    .from("cameras")
    .select("id,name,location_name")
    .eq("organization_id", activeOrganization.id)
    .order("name", { ascending: true });

  if (camerasError) {
    return (
      <main className="space-y-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Activity</h1>
            <p className="text-sm text-gray-600">
              Aktivitätsmuster der aktiven Organisation nach Stunde und Kamera.
            </p>
          </div>

          <Link
            href="/wildlife"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Zurück zu Wildlife
          </Link>
        </section>

        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Fehler beim Laden der Kameras: {camerasError.message}
        </div>
      </main>
    );
  }

  const cameraList = (cameras ?? []) as CameraRow[];
  const cameraIds = cameraList.map((c) => c.id);
  const cameraLabelById = Object.fromEntries(
    cameraList.map((c) => [
      c.id,
      c.location_name ? `${c.name} (${c.location_name})` : c.name,
    ])
  );

  if (cameraIds.length === 0) {
    return (
      <main className="space-y-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Activity</h1>
            <p className="text-sm text-gray-600">
              Aktivitätsmuster der aktiven Organisation nach Stunde und Kamera.
            </p>
          </div>

          <Link
            href="/wildlife"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Zurück zu Wildlife
          </Link>
        </section>

        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          Für die aktive Organisation sind noch keine Kameras vorhanden.
        </div>
      </main>
    );
  }

  const { data: eventsData, error: eventsError } = await supabase
    .from("event_feed")
    .select(
      "id,camera_id,start_at,end_at,top_species,top_count,relevance_score,asset_count"
    )
    .in("camera_id", cameraIds)
    .gte("start_at", startAt)
    .lt("start_at", endAt)
    .order("start_at", { ascending: false });

  if (eventsError) {
    return (
      <main className="space-y-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Activity</h1>
            <p className="text-sm text-gray-600">
              Aktivitätsmuster der aktiven Organisation nach Stunde und Kamera.
            </p>
          </div>

          <Link
            href="/wildlife"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Zurück zu Wildlife
          </Link>
        </section>

        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Fehler beim Laden der Events: {eventsError.message}
        </div>
      </main>
    );
  }

  const events = ((eventsData ?? []) as EventFeedRow[]).filter((e) => e.top_species);
  const eventIds = events.map((e) => e.id);

  let summaryRows: EventSpeciesSummaryRow[] = [];
  if (eventIds.length > 0) {
    try {
      summaryRows = await fetchEventSpeciesSummaryChunked(supabase, eventIds, 200);
    } catch (err) {
      return (
        <main className="space-y-8">
          <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Activity</h1>
              <p className="text-sm text-gray-600">
                Aktivitätsmuster der aktiven Organisation nach Stunde und Kamera.
              </p>
            </div>

            <Link
              href="/wildlife"
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Zurück zu Wildlife
            </Link>
          </section>

          <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
            Fehler beim Laden der Species-Zusammenfassung:{" "}
            {err instanceof Error ? err.message : "unknown error"}
          </div>
        </main>
      );
    }
  }

  const speciesStats = new Map<
    string,
    {
      species: string;
      eventCount: number;
      topCameraId: string | null;
      topCameraCount: number;
      cameraCounts: Map<string, number>;
    }
  >();

  const eventById = new Map(events.map((e) => [e.id, e]));

  for (const row of summaryRows) {
    const evt = eventById.get(row.event_id);
    if (!evt) continue;

    const existing =
      speciesStats.get(row.species) ?? {
        species: row.species,
        eventCount: 0,
        topCameraId: null,
        topCameraCount: 0,
        cameraCounts: new Map<string, number>(),
      };

    existing.eventCount += 1;

    const prevCam = existing.cameraCounts.get(evt.camera_id) ?? 0;
    existing.cameraCounts.set(evt.camera_id, prevCam + 1);

    if (prevCam + 1 > existing.topCameraCount) {
      existing.topCameraCount = prevCam + 1;
      existing.topCameraId = evt.camera_id;
    }

    speciesStats.set(row.species, existing);
  }

  const speciesOverview = Array.from(speciesStats.values()).sort(
    (a, b) => b.eventCount - a.eventCount
  );

  const overallHourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));

  for (const evt of events) {
    if (!evt.start_at) continue;
    const h = new Date(evt.start_at).getHours();
    overallHourly[h].count += 1;
  }

  const maxOverallHourly = Math.max(1, ...overallHourly.map((r) => r.count));

  const cameraActivity = cameraList
    .map((c) => {
      const camEvents = events.filter((e) => e.camera_id === c.id);

      const leadingSpecies =
        speciesOverview
          .filter((s) => s.topCameraId === c.id)
          .sort((a, b) => b.topCameraCount - a.topCameraCount)[0]?.species ?? null;

      return {
        cameraId: c.id,
        cameraLabel: cameraLabelById[c.id] ?? c.name,
        wildlifeEvents: camEvents.length,
        avgRelevance:
          camEvents.length > 0
            ? camEvents.reduce((sum, e) => sum + (e.relevance_score ?? 0), 0) /
              camEvents.length
            : 0,
        leadingSpecies,
      };
    })
    .sort((a, b) => b.wildlifeEvents - a.wildlifeEvents);

  const latestEvents = events
    .slice()
    .sort((a, b) => {
      const ta = a.start_at ? new Date(a.start_at).getTime() : 0;
      const tb = b.start_at ? new Date(b.start_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 10);

  const peakHour =
    overallHourly.slice().sort((a, b) => b.count - a.count)[0] ?? { hour: 0, count: 0 };

  return (
    <main className="space-y-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Activity</h1>
          <p className="text-sm text-gray-600">
            Aktivitätsmuster der aktiven Organisation nach Stunde und Kamera.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["30d", "90d", "365d"] as PeriodKey[]).map((p) => {
            const active = p === period;
            return (
              <Link
                key={p}
                href={buildHref(p)}
                className={`rounded-md border px-3 py-2 text-sm ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-gray-300 bg-white text-black hover:bg-gray-50"
                }`}
              >
                {p}
              </Link>
            );
          })}

          <Link
            href="/wildlife"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Zurück
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Wildlife Events
          </div>
          <div className="mt-2 text-3xl font-semibold">{events.length}</div>
          <div className="mt-1 text-sm text-gray-600">im Zeitraum</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Cameras In Scope
          </div>
          <div className="mt-2 text-3xl font-semibold">{cameraList.length}</div>
          <div className="mt-1 text-sm text-gray-600">aktive Organisation</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Peak Activity
          </div>
          <div className="mt-2 text-3xl font-semibold">{fmtHour(peakHour.hour)}</div>
          <div className="mt-1 text-sm text-gray-600">{peakHour.count} Events</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Species In Activity
          </div>
          <div className="mt-2 text-3xl font-semibold">{speciesOverview.length}</div>
          <div className="mt-1 text-sm text-gray-600">mit Activity-Signal</div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-medium">Overall Wildlife Activity by Hour</h2>
            <p className="text-sm text-gray-600">
              Stündliche Verteilung aller Wildlife-Events im gewählten Zeitraum.
            </p>
          </div>

          <div className="space-y-2">
            {overallHourly.map((row) => {
              const widthPct = `${(row.count / maxOverallHourly) * 100}%`;

              return (
                <div
                  key={row.hour}
                  className="grid grid-cols-[72px_1fr_48px] items-center gap-3"
                >
                  <div className="text-sm text-gray-700">{fmtHour(row.hour)}</div>
                  <div className="h-5 rounded bg-gray-100">
                    <div className="h-5 rounded bg-black" style={{ width: widthPct }} />
                  </div>
                  <div className="text-right text-sm text-gray-700">{row.count}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-medium">Camera Activity</h2>
            <p className="text-sm text-gray-600">
              Aktivität je Kamera, inklusive Relevanz und führender Art.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Camera</th>
                  <th className="px-3 py-2 font-medium">Wildlife Events</th>
                  <th className="px-3 py-2 font-medium">Avg Relevance</th>
                  <th className="px-3 py-2 font-medium">Leading Species</th>
                </tr>
              </thead>
              <tbody>
                {cameraActivity.map((row) => (
                  <tr key={row.cameraId} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{row.cameraLabel}</td>
                    <td className="px-3 py-2">{row.wildlifeEvents}</td>
                    <td className="px-3 py-2">{row.avgRelevance.toFixed(3)}</td>
                    <td className="px-3 py-2">{titleCase(row.leadingSpecies)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cameraActivity.length === 0 && (
            <div className="mt-3 text-sm text-gray-600">
              Keine Kamera-Aktivität im gewählten Zeitraum.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Latest Wildlife Events</h2>
            <p className="text-sm text-gray-600">
              Jüngste Wildlife-Events der aktiven Organisation.
            </p>
          </div>

          <Link
            href="/cameras/events"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Zu Events
          </Link>
        </div>

        <div className="space-y-3">
          {latestEvents.map((evt) => (
            <Link
              key={evt.id}
              href={`/cameras/events/${evt.id}`}
              className="block rounded-lg border p-3 text-sm hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">
                  {titleCase(evt.top_species)}
                  {typeof evt.top_count === "number" ? ` (${evt.top_count})` : ""}
                </div>
                <div>
                  {typeof evt.relevance_score === "number"
                    ? evt.relevance_score.toFixed(3)
                    : "—"}
                </div>
              </div>

              <div className="mt-1 text-xs text-gray-500">
                {cameraLabelById[evt.camera_id] ?? evt.camera_id} · {fmtTs(evt.start_at)} ·
                Assets {evt.asset_count ?? 0}
              </div>
            </Link>
          ))}

          {latestEvents.length === 0 && (
            <div className="text-sm text-gray-600">
              Noch keine Wildlife-Events vorhanden.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}