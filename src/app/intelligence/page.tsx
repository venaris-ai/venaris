export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

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
  import_method: string;
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

function fmtPct(value: number) {
  return `${Math.round(value)}%`;
}

function fmtHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function fmtWindow(startHour: number, spanHours = 2) {
  const endHour = (startHour + spanHours) % 24;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:00`;
}

function buildHref(period: PeriodKey, species?: string | null) {
  const params = new URLSearchParams();
  params.set("period", period);
  if (species) params.set("species", species);
  return `/intelligence?${params.toString()}`;
}

function bucket2h(hour: number) {
  return Math.floor(hour / 2) * 2;
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

export default async function IntelligencePage(props: any) {
  const supabase = supabaseServer();

  const searchParams = await Promise.resolve(props?.searchParams);
  const rawPeriod = searchParams?.period;
  const period: PeriodKey =
    rawPeriod === "30d" || rawPeriod === "90d" || rawPeriod === "365d"
      ? rawPeriod
      : "30d";

  const { startAt, endAt } = resolvePeriodRange(period);

  const { data: seedCameras, error: camErr } = await supabase
    .from("cameras")
    .select("id,name,location_name,import_method")
    .eq("import_method", "seed")
    .order("name", { ascending: true });

  if (camErr) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Visible Intelligence</h1>
          <p className="text-sm text-gray-600">
            Seed cameras only · dashboard test scope
          </p>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
          Fehler beim Laden der Seed-Kameras: {camErr.message}
        </div>
      </main>
    );
  }

  const cameras = (seedCameras ?? []) as CameraRow[];
  const cameraIds = cameras.map((c) => c.id);
  const cameraLabelById = Object.fromEntries(
    cameras.map((c) => [
      c.id,
      c.location_name ? `${c.name} (${c.location_name})` : c.name,
    ])
  );

  if (cameraIds.length === 0) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Visible Intelligence</h1>
          <p className="text-sm text-gray-600">
            Seed cameras only · dashboard test scope
          </p>
        </div>

        <div className="rounded-xl border p-4 text-sm text-gray-600">
          Keine Seed-Kameras gefunden.
        </div>
      </main>
    );
  }

  const { data: eventsData, error: eventsErr } = await supabase
    .from("event_feed")
    .select(
      "id,camera_id,start_at,end_at,top_species,top_count,relevance_score,asset_count"
    )
    .in("camera_id", cameraIds)
    .gte("start_at", startAt)
    .lt("start_at", endAt)
    .order("start_at", { ascending: false });

  if (eventsErr) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Visible Intelligence</h1>
          <p className="text-sm text-gray-600">
            Seed cameras only · dashboard test scope
          </p>
        </div>

        <div className="rounded-xl border p-4 text-sm text-red-600">
          Fehler beim Laden der Events: {eventsErr.message}
        </div>
      </main>
    );
  }

  const events = (eventsData ?? []) as EventFeedRow[];
  const eventIds = events.map((e) => e.id);

  let summaryRows: EventSpeciesSummaryRow[] = [];
  if (eventIds.length > 0) {
    try {
      summaryRows = await fetchEventSpeciesSummaryChunked(supabase, eventIds, 200);
    } catch (err) {
      return (
        <main className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold">Visible Intelligence</h1>
            <p className="text-sm text-gray-600">
              Seed cameras only · dashboard test scope
            </p>
          </div>

          <div className="rounded-xl border p-4 text-sm text-red-600">
            Fehler beim Laden der Species-Zusammenfassung:{" "}
            {err instanceof Error ? err.message : "unknown error"}
          </div>
        </main>
      );
    }
  }

  const eventById = new Map(events.map((e) => [e.id, e]));

  const speciesStats = new Map<
    string,
    {
      species: string;
      eventCount: number;
      observedAnimals: number;
      avgAnimals: number;
      maxAnimals: number;
      topCameraId: string | null;
      topCameraCount: number;
      sumRelevance: number;
      bestScore: number;
      cameraCounts: Map<string, number>;
    }
  >();

  for (const row of summaryRows) {
    const evt = eventById.get(row.event_id);
    if (!evt) continue;

    const existing =
      speciesStats.get(row.species) ??
      {
        species: row.species,
        eventCount: 0,
        observedAnimals: 0,
        avgAnimals: 0,
        maxAnimals: 0,
        topCameraId: null,
        topCameraCount: 0,
        sumRelevance: 0,
        bestScore: 0,
        cameraCounts: new Map<string, number>(),
      };

    existing.eventCount += 1;
    existing.observedAnimals += row.event_species_count;
    existing.maxAnimals = Math.max(existing.maxAnimals, row.event_species_count);
    existing.sumRelevance += evt.relevance_score ?? 0;
    existing.bestScore = Math.max(existing.bestScore, row.best_score ?? 0);

    const prevCam = existing.cameraCounts.get(evt.camera_id) ?? 0;
    existing.cameraCounts.set(evt.camera_id, prevCam + 1);

    if (prevCam + 1 > existing.topCameraCount) {
      existing.topCameraCount = prevCam + 1;
      existing.topCameraId = evt.camera_id;
    }

    speciesStats.set(row.species, existing);
  }

  const speciesOverview = Array.from(speciesStats.values())
    .map((s) => ({
      ...s,
      avgAnimals: s.eventCount > 0 ? s.observedAnimals / s.eventCount : 0,
      avgRelevance: s.eventCount > 0 ? s.sumRelevance / s.eventCount : 0,
    }))
    .sort((a, b) => b.eventCount - a.eventCount || b.observedAnimals - a.observedAnimals);

  const selectedSpecies =
    typeof searchParams?.species === "string" && speciesStats.has(searchParams.species)
      ? searchParams.species
      : speciesOverview[0]?.species ?? null;

  const selectedSpeciesRows = selectedSpecies
    ? summaryRows.filter((r) => r.species === selectedSpecies)
    : [];

  const selectedSpeciesEvents = selectedSpeciesRows
    .map((r) => {
      const evt = eventById.get(r.event_id);
      if (!evt || !evt.start_at) return null;
      const dt = new Date(evt.start_at);
      const hour = dt.getHours();
      return {
        eventId: r.event_id,
        cameraId: evt.camera_id,
        hour,
        window2h: bucket2h(hour),
        count: r.event_species_count,
        relevance: evt.relevance_score ?? 0,
      };
    })
    .filter(Boolean) as Array<{
    eventId: string;
    cameraId: string;
    hour: number;
    window2h: number;
    count: number;
    relevance: number;
  }>;

  const totalSelectedSpeciesEvents = selectedSpeciesEvents.length;

  const cameraSpeciesCounts = new Map<string, number>();
  const windowSpeciesCounts = new Map<number, number>();
  const comboCounts = new Map<string, number>();

  for (const row of selectedSpeciesEvents) {
    cameraSpeciesCounts.set(row.cameraId, (cameraSpeciesCounts.get(row.cameraId) ?? 0) + 1);
    windowSpeciesCounts.set(row.window2h, (windowSpeciesCounts.get(row.window2h) ?? 0) + 1);

    const comboKey = `${row.cameraId}__${row.window2h}`;
    comboCounts.set(comboKey, (comboCounts.get(comboKey) ?? 0) + 1);
  }

  const topCameraEntries = Array.from(cameraSpeciesCounts.entries())
    .map(([cameraId, count]) => ({
      cameraId,
      count,
      probability:
        totalSelectedSpeciesEvents > 0 ? (count / totalSelectedSpeciesEvents) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topWindowEntries = Array.from(windowSpeciesCounts.entries())
    .map(([window2h, count]) => ({
      window2h,
      count,
      probability:
        totalSelectedSpeciesEvents > 0 ? (count / totalSelectedSpeciesEvents) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topComboEntry =
    Array.from(comboCounts.entries())
      .map(([key, count]) => {
        const [cameraId, windowRaw] = key.split("__");
        return {
          cameraId,
          window2h: Number(windowRaw),
          count,
          probability:
            totalSelectedSpeciesEvents > 0 ? (count / totalSelectedSpeciesEvents) * 100 : 0,
        };
      })
      .sort((a, b) => b.count - a.count)[0] ?? null;

  const wildlifeEvents = events.filter((e) => e.top_species);
  const totalWildlifeEvents = wildlifeEvents.length;

  const totalObservedAnimals = speciesOverview.reduce((sum, s) => sum + s.observedAnimals, 0);
  const avgAnimalsPerWildlifeEvent =
    totalWildlifeEvents > 0 ? totalObservedAnimals / totalWildlifeEvents : 0;

  const overallHourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));

  for (const evt of wildlifeEvents) {
    if (!evt.start_at) continue;
    const h = new Date(evt.start_at).getHours();
    overallHourly[h].count += 1;
  }

  const speciesHourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));

  for (const row of selectedSpeciesEvents) {
    speciesHourly[row.hour].count += 1;
  }

  const maxOverallHourly = Math.max(1, ...overallHourly.map((r) => r.count));
  const maxSpeciesHourly = Math.max(1, ...speciesHourly.map((r) => r.count));

  const cameraActivity = cameras
    .map((c) => {
      const camEvents = wildlifeEvents.filter((e) => e.camera_id === c.id);
      return {
        cameraId: c.id,
        cameraLabel: cameraLabelById[c.id] ?? c.name,
        wildlifeEvents: camEvents.length,
        avgRelevance:
          camEvents.length > 0
            ? camEvents.reduce((s, e) => s + (e.relevance_score ?? 0), 0) / camEvents.length
            : 0,
        topSpecies:
          speciesOverview
            .filter((s) => s.topCameraId === c.id)
            .sort((a, b) => b.topCameraCount - a.topCameraCount)[0]?.species ?? null,
      };
    })
    .sort((a, b) => b.wildlifeEvents - a.wildlifeEvents);

  const latestEvents = wildlifeEvents
    .slice()
    .sort((a, b) => {
      const ta = a.start_at ? new Date(a.start_at).getTime() : 0;
      const tb = b.start_at ? new Date(b.start_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 8);

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Visible Intelligence</h1>
        <p className="mt-1 text-sm text-gray-600">
          Seed cameras only · dashboard test scope for wildlife intelligence
        </p>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-medium">Data Scope</div>
            <div className="mt-1 text-sm text-gray-600">
              Using only cameras with <code>import_method = &apos;seed&apos;</code>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            <div className="text-sm font-medium">Period</div>
            <div className="flex flex-wrap gap-2">
              {(["30d", "90d", "365d"] as PeriodKey[]).map((p) => {
                const active = p === period;
                return (
                  <Link
                    key={p}
                    href={buildHref(p, selectedSpecies)}
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
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Seed Cameras</div>
          <div className="mt-2 text-2xl font-semibold">{cameras.length}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Wildlife Events</div>
          <div className="mt-2 text-2xl font-semibold">{totalWildlifeEvents}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Observed Species</div>
          <div className="mt-2 text-2xl font-semibold">{speciesOverview.length}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Avg Animals / Wildlife Event
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {avgAnimalsPerWildlifeEvent.toFixed(2)}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">1. Species Overview</h2>
          <p className="text-sm text-gray-600">
            Seed-based wildlife observation overview for the selected period.
          </p>
        </div>

        {speciesOverview.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No wildlife observations found in the selected seed period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Species</th>
                  <th className="px-3 py-2 font-medium">Events</th>
                  <th className="px-3 py-2 font-medium">Observed Animals</th>
                  <th className="px-3 py-2 font-medium">Avg Animals / Event</th>
                  <th className="px-3 py-2 font-medium">Top Camera</th>
                  <th className="px-3 py-2 font-medium">Avg Relevance</th>
                </tr>
              </thead>
              <tbody>
                {speciesOverview.map((row) => (
                  <tr key={row.species} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <Link
                        href={buildHref(period, row.species)}
                        className={`underline ${
                          row.species === selectedSpecies ? "font-semibold" : ""
                        }`}
                      >
                        {titleCase(row.species)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{row.eventCount}</td>
                    <td className="px-3 py-2">{row.observedAnimals}</td>
                    <td className="px-3 py-2">{row.avgAnimals.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {row.topCameraId ? cameraLabelById[row.topCameraId] ?? row.topCameraId : "—"}
                    </td>
                    <td className="px-3 py-2">{row.avgRelevance.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">2. Where & When</h2>
            <p className="text-sm text-gray-600">
              Probability-oriented hint based on seed-camera wildlife observations.
            </p>
          </div>

          <form method="get" action="/intelligence" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value={period} />
            <div className="flex flex-col gap-1">
              <label htmlFor="species" className="text-sm font-medium">
                Species
              </label>
              <select
                id="species"
                name="species"
                defaultValue={selectedSpecies ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              >
                {speciesOverview.map((row) => (
                  <option key={row.species} value={row.species}>
                    {titleCase(row.species)}
                  </option>
                ))}
              </select>
            </div>

            <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
              Update
            </button>
          </form>
        </div>

        {!selectedSpecies || totalSelectedSpeciesEvents === 0 ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No species-specific observations available for this period.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="text-sm text-gray-600">Primary hint</div>
              <div className="mt-2 text-xl font-semibold">
                Near{" "}
                {topComboEntry
                  ? cameraLabelById[topComboEntry.cameraId] ?? topComboEntry.cameraId
                  : "—"}{" "}
                between {topComboEntry ? fmtWindow(topComboEntry.window2h) : "—"}
              </div>
              <div className="mt-2 text-sm text-gray-700">
                Species: <span className="font-medium">{titleCase(selectedSpecies)}</span> ·
                Probability:{" "}
                <span className="font-medium">
                  {topComboEntry ? fmtPct(topComboEntry.probability) : "—"}
                </span>{" "}
                · Based on <span className="font-medium">{totalSelectedSpeciesEvents}</span> seed
                events
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="mb-3 text-sm font-medium">
                  Top Cameras for {titleCase(selectedSpecies)}
                </div>
                <div className="space-y-2">
                  {topCameraEntries.map((row) => (
                    <div key={row.cameraId} className="flex items-center justify-between text-sm">
                      <span>{cameraLabelById[row.cameraId] ?? row.cameraId}</span>
                      <span>
                        {row.count} events · {fmtPct(row.probability)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3 text-sm font-medium">
                  Top Time Windows for {titleCase(selectedSpecies)}
                </div>
                <div className="space-y-2">
                  {topWindowEntries.map((row) => (
                    <div key={row.window2h} className="flex items-center justify-between text-sm">
                      <span>{fmtWindow(row.window2h)}</span>
                      <span>
                        {row.count} events · {fmtPct(row.probability)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 text-sm font-medium">
                Hourly Activity for {titleCase(selectedSpecies)}
              </div>
              <div className="space-y-2">
                {speciesHourly.map((row) => {
                  const widthPct = `${(row.count / maxSpeciesHourly) * 100}%`;
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
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">3. Activity</h2>
          <p className="text-sm text-gray-600">
            Wildlife-only activity based on seed-camera event observations.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-sm font-medium">Overall Wildlife Activity by Hour</div>
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

          <div>
            <div className="mb-3 text-sm font-medium">Camera Activity</div>
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
                      <td className="px-3 py-2">{titleCase(row.topSpecies)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <div className="mb-3 text-sm font-medium">Latest Wildlife Events</div>
              <div className="space-y-2">
                {latestEvents.map((evt) => (
                  <Link
                    key={evt.id}
                    href={`/events/${evt.id}`}
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
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}