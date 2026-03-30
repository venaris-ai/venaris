// src/app/wildlife/page.tsx #2
export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireActiveOrganization } from "@/lib/auth";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

type SearchParams = {
  revier?: string;
};

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
  revier_id: string;
};

type RevierRow = {
  id: string;
  name: string;
};

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

function fmtWindow(startHour: number, spanHours = 2) {
  const endHour = (startHour + spanHours) % 24;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour)
    .padStart(2, "0")}:00`;
}

function bucket2h(hour: number) {
  return Math.floor(hour / 2) * 2;
}

function resolveLast30DaysRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
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

function StatCard({
  title,
  value,
  subline,
}: {
  title: string;
  value: string;
  subline: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-white/65">{subline}</div>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 backdrop-blur-sm hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
    >
      {label}
    </Link>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
      {message}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
      {message}
    </div>
  );
}

export default async function WildlifePage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const { activeMembership } = await requireActiveOrganization();
  const activeOrganization = activeMembership.organizations;

  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Wildlife
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Wildlife Dashboard
          </h1>
          <p className="mt-2 text-sm text-white/68">
            Arten, Aktivität, erste Muster und modellgestützte Populationssignale
            für den aktuellen Scope.
          </p>
        </section>

        <ErrorState message="Active organization not found." />
      </main>
    );
  }

  const supabase = supabaseServer();
  const { startAt, endAt } = resolveLast30DaysRange();

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
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Wildlife
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Wildlife Dashboard
          </h1>
          <p className="mt-2 text-sm text-white/68">
            Arten, Aktivität, erste Muster und modellgestützte Populationssignale
            für den aktuellen Scope.
          </p>
        </section>

        <ErrorState message={`Fehler beim Laden der Reviere: ${reviersError.message}`} />
      </main>
    );
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const allowedReviers: RevierOption[] = reviers.map((r) => ({
    id: r.id,
    name: r.name,
  }));

  const revierScope = resolveRevierScope(searchParams?.revier, allowedReviers);
  const currentRevierValue =
    revierScope.type === "single" ? revierScope.revierId : "all";

  const scopeLabel =
    currentRevierValue === "all"
      ? "Alle aktiven Reviere"
      : reviers.find((r) => r.id === currentRevierValue)?.name ?? "Ein Revier";

  const allowedRevierIds = allowedReviers.map((r) => r.id);

  if (allowedRevierIds.length === 0) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Wildlife
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Wildlife Dashboard
          </h1>
          <p className="mt-2 text-sm text-white/68">
            Arten, Aktivität, erste Muster und modellgestützte Populationssignale
            für den aktuellen Scope.
          </p>
        </section>

        <EmptyState message="Für die aktive Organisation sind derzeit keine aktiven Reviere vorhanden." />
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
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Wildlife
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Wildlife Dashboard
          </h1>
          <p className="mt-2 text-sm text-white/68">
            Arten, Aktivität, erste Muster und modellgestützte Populationssignale
            für den aktuellen Scope.
          </p>
        </section>

        <ErrorState message={`Fehler beim Laden der Kameras: ${camerasError.message}`} />
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
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                Wildlife
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                Wildlife Dashboard
              </h1>
              <p className="mt-2 text-sm text-white/68">
                Arten, Aktivität, erste Muster und modellgestützte Populationssignale
                für den aktuellen Scope.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
              {scopeLabel}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Cameras"
            value="0"
            subline="aktueller Revier-Scope"
          />
          <StatCard
            title="Wildlife Events"
            value="0"
            subline="letzte 30 Tage"
          />
          <StatCard
            title="Observed Species"
            value="0"
            subline="letzte 30 Tage"
          />
          <StatCard
            title="Avg Animals / Event"
            value="0.00"
            subline="noch keine Daten"
          />
        </section>

        <EmptyState message="Für den aktuellen Revier-Scope sind keine Kameras vorhanden." />
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
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Wildlife
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Wildlife Dashboard
          </h1>
          <p className="mt-2 text-sm text-white/68">
            Arten, Aktivität, erste Muster und modellgestützte Populationssignale
            für den aktuellen Scope.
          </p>
        </section>

        <ErrorState message={`Fehler beim Laden der Events: ${eventsError.message}`} />
      </main>
    );
  }

  const events = (eventsData ?? []) as EventFeedRow[];
  const wildlifeEvents = events.filter((e) => e.top_species);
  const eventIds = wildlifeEvents.map((e) => e.id);

  let summaryRows: EventSpeciesSummaryRow[] = [];
  if (eventIds.length > 0) {
    try {
      summaryRows = await fetchEventSpeciesSummaryChunked(supabase, eventIds, 200);
    } catch (err) {
      return (
        <main className="space-y-8">
          <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              Wildlife
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              Wildlife Dashboard
            </h1>
            <p className="mt-2 text-sm text-white/68">
              Arten, Aktivität, erste Muster und modellgestützte Populationssignale
              für den aktuellen Scope.
            </p>
          </section>

          <ErrorState
            message={`Fehler beim Laden der Species-Zusammenfassung: ${
              err instanceof Error ? err.message : "unknown error"
            }`}
          />
        </main>
      );
    }
  }

  const eventById = new Map(wildlifeEvents.map((e) => [e.id, e]));

  const speciesStats = new Map<
    string,
    {
      species: string;
      eventCount: number;
      observedAnimals: number;
      maxAnimals: number;
      topCameraId: string | null;
      topCameraCount: number;
      sumRelevance: number;
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
        maxAnimals: 0,
        topCameraId: null,
        topCameraCount: 0,
        sumRelevance: 0,
        cameraCounts: new Map<string, number>(),
      };

    existing.eventCount += 1;
    existing.observedAnimals += row.event_species_count;
    existing.maxAnimals = Math.max(existing.maxAnimals, row.event_species_count);
    existing.sumRelevance += evt.relevance_score ?? 0;

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
    .sort(
      (a, b) => b.eventCount - a.eventCount || b.observedAnimals - a.observedAnimals
    );

  const selectedSpecies = speciesOverview[0]?.species ?? null;

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
      };
    })
    .filter(Boolean) as Array<{
    eventId: string;
    cameraId: string;
    hour: number;
    window2h: number;
  }>;

  const totalSelectedSpeciesEvents = selectedSpeciesEvents.length;

  const cameraSpeciesCounts = new Map<string, number>();
  const windowSpeciesCounts = new Map<number, number>();
  const comboCounts = new Map<string, number>();

  for (const row of selectedSpeciesEvents) {
    cameraSpeciesCounts.set(
      row.cameraId,
      (cameraSpeciesCounts.get(row.cameraId) ?? 0) + 1
    );
    windowSpeciesCounts.set(
      row.window2h,
      (windowSpeciesCounts.get(row.window2h) ?? 0) + 1
    );

    const comboKey = `${row.cameraId}__${row.window2h}`;
    comboCounts.set(comboKey, (comboCounts.get(comboKey) ?? 0) + 1);
  }

  const topSpecies = speciesOverview.slice(0, 5);

  const topComboEntry =
    Array.from(comboCounts.entries())
      .map(([key, count]) => {
        const [cameraId, windowRaw] = key.split("__");
        return {
          cameraId,
          window2h: Number(windowRaw),
          count,
          probability:
            totalSelectedSpeciesEvents > 0
              ? (count / totalSelectedSpeciesEvents) * 100
              : 0,
        };
      })
      .sort((a, b) => b.count - a.count)[0] ?? null;

  const totalWildlifeEvents = wildlifeEvents.length;
  const totalObservedAnimals = speciesOverview.reduce(
    (sum, s) => sum + s.observedAnimals,
    0
  );
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

  const peakHour =
    overallHourly.slice().sort((a, b) => b.count - a.count)[0] ?? {
      hour: 0,
      count: 0,
    };

  const latestEvents = wildlifeEvents
    .slice()
    .sort((a, b) => {
      const ta = a.start_at ? new Date(a.start_at).getTime() : 0;
      const tb = b.start_at ? new Date(b.start_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 6);

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              Wildlife
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              Wildlife Dashboard
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-white/68">
              Arten, Aktivität, erste Muster und modellgestützte Populationssignale
              für den aktuellen Scope.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
            {scopeLabel}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Cameras"
          value={String(cameraList.length)}
          subline="aktueller Revier-Scope"
        />

        <StatCard
          title="Wildlife Events"
          value={String(totalWildlifeEvents)}
          subline="letzte 30 Tage"
        />

        <StatCard
          title="Observed Species"
          value={String(speciesOverview.length)}
          subline="letzte 30 Tage"
        />

        <StatCard
          title="Avg Animals / Event"
          value={avgAnimalsPerWildlifeEvent.toFixed(2)}
          subline="wildlife only"
        />

        <StatCard
          title="Peak Activity"
          value={fmtHour(peakHour.hour)}
          subline={`${peakHour.count} Events`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Species Snapshot</h2>
              <p className="text-sm text-white/65">
                Häufigste Arten im aktuellen Zeitraum.
              </p>
            </div>
            <ActionLink href="/wildlife/species" label="Mehr" />
          </div>

          <div className="space-y-3">
            {topSpecies.map((row) => (
              <div
                key={row.species}
                className="rounded-[20px] border border-white/10 bg-white/5 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">
                      {titleCase(row.species)}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Top Camera:{" "}
                      {row.topCameraId
                        ? cameraLabelById[row.topCameraId] ?? row.topCameraId
                        : "—"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-medium text-white">
                      {row.eventCount} Events
                    </div>
                    <div className="text-xs text-white/45">
                      {row.observedAnimals} Tiere gesamt
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {topSpecies.length === 0 && (
              <div className="text-sm text-white/68">
                Noch keine Species-Signale vorhanden.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">
                Where &amp; When Hint
              </h2>
              <p className="text-sm text-white/65">
                Verdichteter Hinweis aus Kamera- und Zeitfenster.
              </p>
            </div>
            <ActionLink href="/wildlife/wherewhen" label="Mehr" />
          </div>

          {!selectedSpecies || !topComboEntry ? (
            <div className="text-sm text-white/68">
              Noch kein belastbarer Where-&amp;-When-Hinweis verfügbar.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-white/50">Aktuell stärkster Hinweis</div>
              <div className="text-xl font-semibold text-white">
                {titleCase(selectedSpecies)}
              </div>
              <div className="text-sm text-white/72">
                Nähe{" "}
                <span className="font-medium text-white">
                  {cameraLabelById[topComboEntry.cameraId] ?? topComboEntry.cameraId}
                </span>
              </div>
              <div className="text-sm text-white/72">
                Zeitfenster{" "}
                <span className="font-medium text-white">
                  {fmtWindow(topComboEntry.window2h)}
                </span>
              </div>
              <div className="text-sm text-white/72">
                Basis: <span className="font-medium text-white">{topComboEntry.count}</span>{" "}
                Events
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Activity Snapshot</h2>
              <p className="text-sm text-white/65">
                Wildlife-Aktivität nach Stunde, verdichtet für das Dashboard.
              </p>
            </div>
            <ActionLink href="/wildlife/activity" label="Mehr" />
          </div>

          <div className="space-y-2">
            {overallHourly.map((row) => {
              const maxCount = Math.max(1, ...overallHourly.map((r) => r.count));
              const widthPct = `${(row.count / maxCount) * 100}%`;

              return (
                <div
                  key={row.hour}
                  className="grid grid-cols-[72px_1fr_48px] items-center gap-3"
                >
                  <div className="text-sm text-white/72">{fmtHour(row.hour)}</div>
                  <div className="h-5 rounded-full bg-white/8">
                    <div
                      className="h-5 rounded-full bg-[#c9952e]"
                      style={{ width: widthPct }}
                    />
                  </div>
                  <div className="text-right text-sm text-white/72">{row.count}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">PopSim</h2>
              <p className="text-sm text-white/65">
                Qualifizierte Populationsschätzung auf Basis modellierter Revierdaten.
              </p>
            </div>
            <ActionLink href="/wildlife/popsim" label="Mehr" />
          </div>

          <div className="space-y-3 text-sm text-white/72">
            <div>
              Vorbereiteter Bereich für populationsbasierte Näherungen und
              Management-Hinweise.
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/5 p-3 text-white/65">
              Kein exakter Zensus, sondern ein modellgestützter Snapshot aus Präsenz,
              Kameradeckung, Artlogik und Zielwerten.
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Latest Wildlife Events</h2>
            <p className="text-sm text-white/65">
              Jüngste Wildlife-Events im aktuellen Revier-Scope.
            </p>
          </div>
          <ActionLink href="/cameras/events" label="Zu Events" />
        </div>

        <div className="space-y-3">
          {latestEvents.map((evt) => (
            <Link
              key={evt.id}
              href={`/cameras/events/${evt.id}`}
              className="block rounded-[20px] border border-white/10 bg-white/5 p-3 text-sm hover:border-amber-300/20 hover:bg-white/8"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-white">
                  {titleCase(evt.top_species)}
                  {typeof evt.top_count === "number" ? ` (${evt.top_count})` : ""}
                </div>
                <div className="text-white/72">
                  {typeof evt.relevance_score === "number"
                    ? evt.relevance_score.toFixed(3)
                    : "—"}
                </div>
              </div>
              <div className="mt-1 text-xs text-white/45">
                {cameraLabelById[evt.camera_id] ?? evt.camera_id} · {fmtTs(evt.start_at)} ·
                Assets {evt.asset_count ?? 0}
              </div>
            </Link>
          ))}

          {latestEvents.length === 0 && (
            <div className="text-sm text-white/68">
              Noch keine Wildlife-Events vorhanden.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}