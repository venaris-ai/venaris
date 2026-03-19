// src/app/wildlife/species/page.tsx
export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireActiveOrganization } from "@/lib/auth";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

type PeriodKey = "30d" | "90d" | "365d";

type SearchParams = {
  period?: string;
  revier?: string;
};

type EventFeedRow = {
  id: string;
  camera_id: string;
  start_at: string | null;
  relevance_score: number | null;
  top_species: string | null;
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
  revier_id: string;
};

type RevierRow = {
  id: string;
  name: string;
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

function buildHref(period: PeriodKey, revierValue: string) {
  const params = new URLSearchParams();
  params.set("period", period);
  params.set("revier", revierValue);
  return `/wildlife/species?${params.toString()}`;
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

function SpeciesPageHeader({
  period,
  revierValue,
}: {
  period: PeriodKey;
  revierValue: string;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-3xl font-semibold">Species</h1>
        <p className="text-sm text-gray-600">
          Artenübersicht, Häufigkeiten und Schwerpunkte für den aktuellen Revier-Scope.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["30d", "90d", "365d"] as PeriodKey[]).map((p) => {
          const active = p === period;
          return (
            <Link
              key={p}
              href={buildHref(p, revierValue)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                active
                  ? "border-black bg-black text-white"
                  : "border-gray-300 bg-white text-black hover:bg-gray-100"
              }`}
            >
              {p}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default async function WildlifeSpeciesPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const { activeMembership } = await requireActiveOrganization();
  const activeOrganization = activeMembership.organizations;

  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  const rawPeriod = searchParams?.period;
  const rawRevier = searchParams?.revier;

  const period: PeriodKey =
    rawPeriod === "30d" || rawPeriod === "90d" || rawPeriod === "365d"
      ? rawPeriod
      : "30d";

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <SpeciesPageHeader period={period} revierValue="all" />

        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Active organization not found.
        </div>
      </main>
    );
  }

  const supabase = supabaseServer();
  const { startAt, endAt } = resolvePeriodRange(period);

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-8">
        <SpeciesPageHeader period={period} revierValue="all" />

        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Fehler beim Laden der Reviere: {reviersError.message}
        </div>
      </main>
    );
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const allowedReviers: RevierOption[] = reviers.map((r) => ({
    id: r.id,
    name: r.name,
  }));

  const revierScope = resolveRevierScope(rawRevier, allowedReviers);
  const currentRevierValue =
    revierScope.type === "single" ? revierScope.revierId : "all";

  const allowedRevierIds = allowedReviers.map((r) => r.id);

  if (allowedRevierIds.length === 0) {
    return (
      <main className="space-y-8">
        <SpeciesPageHeader period={period} revierValue="all" />

        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          Für die aktive Organisation sind derzeit keine aktiven Reviere vorhanden.
        </div>
      </main>
    );
  }

  let camerasQuery = supabase
    .from("cameras")
    .select("id,name,location_name,revier_id")
    .eq("organization_id", activeOrganization.id)
    .order("name", { ascending: true });

  camerasQuery =
    revierScope.type === "single"
      ? camerasQuery.eq("revier_id", revierScope.revierId)
      : camerasQuery.in("revier_id", allowedRevierIds);

  const { data: cameras, error: camerasError } = await camerasQuery;

  if (camerasError) {
    return (
      <main className="space-y-8">
        <SpeciesPageHeader
          period={period}
          revierValue={currentRevierValue}
        />

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
        <SpeciesPageHeader
          period={period}
          revierValue={currentRevierValue}
        />

        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          Für den aktuellen Revier-Scope sind keine Kameras vorhanden.
        </div>
      </main>
    );
  }

  const { data: eventsData, error: eventsError } = await supabase
    .from("event_feed")
    .select("id,camera_id,start_at,relevance_score,top_species")
    .in("camera_id", cameraIds)
    .gte("start_at", startAt)
    .lt("start_at", endAt)
    .order("start_at", { ascending: false });

  if (eventsError) {
    return (
      <main className="space-y-8">
        <SpeciesPageHeader
          period={period}
          revierValue={currentRevierValue}
        />

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
          <SpeciesPageHeader
            period={period}
            revierValue={currentRevierValue}
          />

          <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
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
      speciesStats.get(row.species) ?? {
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

  const totalSpecies = speciesOverview.length;
  const totalObservedAnimals = speciesOverview.reduce((sum, s) => sum + s.observedAnimals, 0);
  const totalEvents = speciesOverview.reduce((sum, s) => sum + s.eventCount, 0);

  const topSpecies = speciesOverview.slice(0, 3);

  return (
    <main className="space-y-8">
      <SpeciesPageHeader period={period} revierValue={currentRevierValue} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Observed Species
          </div>
          <div className="mt-2 text-3xl font-semibold">{totalSpecies}</div>
          <div className="mt-1 text-sm text-gray-600">im Zeitraum</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Species Events
          </div>
          <div className="mt-2 text-3xl font-semibold">{totalEvents}</div>
          <div className="mt-1 text-sm text-gray-600">mit Species-Summary</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Observed Animals
          </div>
          <div className="mt-2 text-3xl font-semibold">{totalObservedAnimals}</div>
          <div className="mt-1 text-sm text-gray-600">aggregiert</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Cameras In Scope
          </div>
          <div className="mt-2 text-3xl font-semibold">{cameraList.length}</div>
          <div className="mt-1 text-sm text-gray-600">aktueller Revier-Scope</div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-xl border bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-medium">Top Species</h2>
            <p className="text-sm text-gray-600">
              Schnellblick auf die häufigsten Arten im gewählten Zeitraum.
            </p>
          </div>

          <div className="space-y-3">
            {topSpecies.map((row) => (
              <div key={row.species} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{titleCase(row.species)}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Top Camera:{" "}
                      {row.topCameraId
                        ? cameraLabelById[row.topCameraId] ?? row.topCameraId
                        : "—"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-medium">{row.eventCount} Events</div>
                    <div className="text-xs text-gray-500">
                      {row.observedAnimals} Tiere
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {topSpecies.length === 0 && (
              <div className="text-sm text-gray-600">
                Noch keine Species-Daten im gewählten Zeitraum.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-medium">Species Overview</h2>
            <p className="text-sm text-gray-600">
              Detaillierte Artenübersicht für den aktuellen Revier-Scope.
            </p>
          </div>

          {speciesOverview.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Keine Species-Beobachtungen im gewählten Zeitraum gefunden.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium">Species</th>
                    <th className="px-3 py-2 font-medium">Events</th>
                    <th className="px-3 py-2 font-medium">Observed Animals</th>
                    <th className="px-3 py-2 font-medium">Avg / Event</th>
                    <th className="px-3 py-2 font-medium">Max</th>
                    <th className="px-3 py-2 font-medium">Top Camera</th>
                    <th className="px-3 py-2 font-medium">Avg Relevance</th>
                  </tr>
                </thead>
                <tbody>
                  {speciesOverview.map((row) => (
                    <tr key={row.species} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium">
                        {titleCase(row.species)}
                      </td>
                      <td className="px-3 py-2">{row.eventCount}</td>
                      <td className="px-3 py-2">{row.observedAnimals}</td>
                      <td className="px-3 py-2">{row.avgAnimals.toFixed(2)}</td>
                      <td className="px-3 py-2">{row.maxAnimals}</td>
                      <td className="px-3 py-2">
                        {row.topCameraId
                          ? cameraLabelById[row.topCameraId] ?? row.topCameraId
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{row.avgRelevance.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}