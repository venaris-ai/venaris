// src/app/wildlife/wherewhen/page.tsx
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
  species?: string;
};

type EventFeedRow = {
  id: string;
  camera_id: string;
  start_at: string | null;
  top_species: string | null;
  relevance_score: number | null;
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

function fmtPct(value: number) {
  return `${Math.round(value)}%`;
}

function fmtWindow(startHour: number, spanHours = 2) {
  const endHour = (startHour + spanHours) % 24;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:00`;
}

function buildHref(
  period: PeriodKey,
  revierValue: string,
  species?: string | null
) {
  const params = new URLSearchParams();
  params.set("period", period);
  params.set("revier", revierValue);
  if (species) params.set("species", species);
  return `/wildlife/wherewhen?${params.toString()}`;
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

function WhereWhenPageHeader({
  period,
  revierValue,
  selectedSpecies,
}: {
  period: PeriodKey;
  revierValue: string;
  selectedSpecies?: string | null;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-3xl font-semibold">Where &amp; When</h1>
        <p className="text-sm text-gray-600">
          Wo und wann ausgewählte Arten im aktuellen Revier-Scope sichtbar werden.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["30d", "90d", "365d"] as PeriodKey[]).map((p) => {
          const active = p === period;
          return (
            <Link
              key={p}
              href={buildHref(p, revierValue, selectedSpecies)}
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

export default async function WildlifeWhereWhenPage(props: {
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
        <WhereWhenPageHeader period={period} revierValue="all" />

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
        <WhereWhenPageHeader period={period} revierValue="all" />

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
        <WhereWhenPageHeader period={period} revierValue="all" />

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
        <WhereWhenPageHeader
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
        <WhereWhenPageHeader
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
    .select("id,camera_id,start_at,top_species,relevance_score")
    .in("camera_id", cameraIds)
    .gte("start_at", startAt)
    .lt("start_at", endAt)
    .order("start_at", { ascending: false });

  if (eventsError) {
    return (
      <main className="space-y-8">
        <WhereWhenPageHeader
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
          <WhereWhenPageHeader
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

  const speciesCounts = new Map<string, number>();
  for (const row of summaryRows) {
    speciesCounts.set(row.species, (speciesCounts.get(row.species) ?? 0) + 1);
  }

  const speciesOptions = Array.from(speciesCounts.entries())
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count);

  const selectedSpecies =
    typeof searchParams?.species === "string" && speciesCounts.has(searchParams.species)
      ? searchParams.species
      : speciesOptions[0]?.species ?? null;

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
    .slice(0, 5);

  const topWindowEntries = Array.from(windowSpeciesCounts.entries())
    .map(([window2h, count]) => ({
      window2h,
      count,
      probability:
        totalSelectedSpeciesEvents > 0 ? (count / totalSelectedSpeciesEvents) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topComboEntries = Array.from(comboCounts.entries())
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
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const primaryHint = topComboEntries[0] ?? null;

  return (
    <main className="space-y-8">
      <WhereWhenPageHeader
        period={period}
        revierValue={currentRevierValue}
        selectedSpecies={selectedSpecies}
      />

      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-medium">Species Selection</h2>
            <p className="text-sm text-gray-600">
              Analyse von Kamera- und Zeitfenstern für eine ausgewählte Art.
            </p>
          </div>

          <form
            method="get"
            action="/wildlife/wherewhen"
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="revier" value={currentRevierValue} />

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
                {speciesOptions.map((row) => (
                  <option key={row.species} value={row.species}>
                    {titleCase(row.species)} ({row.count})
                  </option>
                ))}
              </select>
            </div>

            <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
              Update
            </button>
          </form>
        </div>
      </section>

      {!selectedSpecies || totalSelectedSpeciesEvents === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          Keine belastbaren Where-&amp;-When-Daten für den gewählten Zeitraum verfügbar.
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">Species</div>
              <div className="mt-2 text-3xl font-semibold">
                {titleCase(selectedSpecies)}
              </div>
              <div className="mt-1 text-sm text-gray-600">aktuelle Auswahl</div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Species Events
              </div>
              <div className="mt-2 text-3xl font-semibold">{totalSelectedSpeciesEvents}</div>
              <div className="mt-1 text-sm text-gray-600">im Zeitraum</div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Top Camera
              </div>
              <div className="mt-2 text-xl font-semibold">
                {topCameraEntries[0]
                  ? cameraLabelById[topCameraEntries[0].cameraId] ?? topCameraEntries[0].cameraId
                  : "—"}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {topCameraEntries[0] ? fmtPct(topCameraEntries[0].probability) : "—"}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Top Time Window
              </div>
              <div className="mt-2 text-3xl font-semibold">
                {topWindowEntries[0] ? fmtWindow(topWindowEntries[0].window2h) : "—"}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {topWindowEntries[0] ? fmtPct(topWindowEntries[0].probability) : "—"}
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5">
            <div className="mb-4">
              <h2 className="text-lg font-medium">Primary Hint</h2>
              <p className="text-sm text-gray-600">
                Verdichteter Hinweis aus Kamera und 2h-Zeitfenster.
              </p>
            </div>

            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="text-sm text-gray-600">Stärkster Hinweis</div>
              <div className="mt-2 text-xl font-semibold">
                Nähe{" "}
                {primaryHint
                  ? cameraLabelById[primaryHint.cameraId] ?? primaryHint.cameraId
                  : "—"}
              </div>
              <div className="mt-2 text-sm text-gray-700">
                Species: <span className="font-medium">{titleCase(selectedSpecies)}</span>
              </div>
              <div className="text-sm text-gray-700">
                Zeitfenster:{" "}
                <span className="font-medium">
                  {primaryHint ? fmtWindow(primaryHint.window2h) : "—"}
                </span>
              </div>
              <div className="text-sm text-gray-700">
                Wahrscheinlichkeit:{" "}
                <span className="font-medium">
                  {primaryHint ? fmtPct(primaryHint.probability) : "—"}
                </span>
              </div>
              <div className="text-sm text-gray-700">
                Basis:{" "}
                <span className="font-medium">
                  {primaryHint ? primaryHint.count : "—"}
                </span>{" "}
                Events
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-5">
              <div className="mb-4">
                <h2 className="text-lg font-medium">
                  Top Cameras for {titleCase(selectedSpecies)}
                </h2>
                <p className="text-sm text-gray-600">
                  Wahrscheinlichkeitsorientierte Verteilung nach Kamera.
                </p>
              </div>

              <div className="space-y-3">
                {topCameraEntries.map((row) => (
                  <div
                    key={row.cameraId}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <span>{cameraLabelById[row.cameraId] ?? row.cameraId}</span>
                    <span>
                      {row.count} Events · {fmtPct(row.probability)}
                    </span>
                  </div>
                ))}

                {topCameraEntries.length === 0 && (
                  <div className="text-sm text-gray-600">
                    Keine Kamera-Hinweise verfügbar.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5">
              <div className="mb-4">
                <h2 className="text-lg font-medium">
                  Top Time Windows for {titleCase(selectedSpecies)}
                </h2>
                <p className="text-sm text-gray-600">
                  Verdichtung nach 2h-Fenstern.
                </p>
              </div>

              <div className="space-y-3">
                {topWindowEntries.map((row) => (
                  <div
                    key={row.window2h}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <span>{fmtWindow(row.window2h)}</span>
                    <span>
                      {row.count} Events · {fmtPct(row.probability)}
                    </span>
                  </div>
                ))}

                {topWindowEntries.length === 0 && (
                  <div className="text-sm text-gray-600">
                    Keine Zeitfenster-Hinweise verfügbar.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5">
            <div className="mb-4">
              <h2 className="text-lg font-medium">Camera × Time Window Matrix</h2>
              <p className="text-sm text-gray-600">
                Die stärksten Kombinationen aus Ort und Zeit.
              </p>
            </div>

            <div className="space-y-3">
              {topComboEntries.map((row, idx) => (
                <div
                  key={`${row.cameraId}-${row.window2h}`}
                  className="rounded-lg border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        #{idx + 1} · {cameraLabelById[row.cameraId] ?? row.cameraId}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Zeitfenster {fmtWindow(row.window2h)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-medium">{fmtPct(row.probability)}</div>
                      <div className="text-xs text-gray-500">{row.count} Events</div>
                    </div>
                  </div>
                </div>
              ))}

              {topComboEntries.length === 0 && (
                <div className="text-sm text-gray-600">
                  Keine belastbaren Kombinationen verfügbar.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}