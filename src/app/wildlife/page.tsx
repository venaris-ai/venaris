// src/app/wildlife/page.tsx #6
export const runtime = "nodejs";

import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { requirePathAccess } from "@/lib/authz";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";
import {
  DEFAULT_APP_TIME_ZONE,
  getAppHour,
} from "@/lib/dateTime";

type SearchParams = {
  revier?: string;
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
  timezone: string | null;
};

function locale(language: AppLanguage) {
  return language === "en" ? "en-GB" : "de-DE";
}

function fmtHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function fmtWindow(startHour: number, spanHours = 2) {
  const endHour = (startHour + spanHours) % 24;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(
    2,
    "0"
  )}:00`;
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

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Wildlife",
      title: "Wildlife Dashboard",
      intro:
        "Species, activity, first patterns and model-based population signals for the current scope.",
      activeOrganizationNotFound: "Active organization not found.",
      reviersLoadFailed: "Failed to load grounds:",
      activeGroundsMissing:
        "There are currently no active grounds for the active organization.",
      camerasLoadFailed: "Failed to load cameras:",
      noCamerasInScope:
        "There are no cameras for the current ground scope.",
      eventsLoadFailed: "Failed to load events:",
      speciesSummaryLoadFailed: "Failed to load species summary:",
      unknownError: "unknown error",
      cameras: "Cameras",
      currentGroundScope: "current ground scope",
      wildlifeEvents: "Wildlife Events",
      last30Days: "last 30 days",
      observedSpecies: "Observed Species",
      avgAnimalsPerEvent: "Avg Animals / Event",
      wildlifeOnly: "wildlife only",
      peakActivity: "Peak Activity",
      events: "events",
      speciesSnapshot: "Species Snapshot",
      speciesSnapshotText: "Most frequent species in the current period.",
      topCamera: "Top camera",
      totalAnimals: "animals total",
      noSpeciesSignalsYet: "No species signals yet.",
      whereWhenHint: "Where & When Hint",
      whereWhenHintText: "Condensed hint from camera and time window.",
      strongestHint: "Current strongest hint",
      near: "Near",
      timeWindow: "Time window",
      basis: "Basis",
      noWhereWhenHint:
        "No robust where-and-when hint available yet.",
      activitySnapshot: "Activity Snapshot",
      activitySnapshotText:
        "Wildlife activity by hour, condensed for the dashboard.",
      popsim: "PopSim",
      popsimText:
        "Model-based population signals for more grounded assessment, target pictures and management decisions in the ground.",
      popsimEyebrow: "Stock. Trends. Guidance.",
      popsimBody1:
        "PopSim condenses events and patterns into model-based population signals for more grounded decisions in the ground.",
      popsimBody2:
        "Not an exact census, but a model-based view that helps connect camera observations with broader wildlife management interpretation.",
    };
  }

  return {
    eyebrow: "Wildlife",
    title: "Wildlife Dashboard",
    intro:
      "Arten, Aktivität, erste Muster und modellgestützte Populationssignale für den aktuellen Scope.",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden.",
    reviersLoadFailed: "Fehler beim Laden der Reviere:",
    activeGroundsMissing:
      "Für die aktive Organisation sind derzeit keine aktiven Reviere vorhanden.",
    camerasLoadFailed: "Fehler beim Laden der Kameras:",
    noCamerasInScope:
      "Für den aktuellen Revier-Scope sind keine Kameras vorhanden.",
    eventsLoadFailed: "Fehler beim Laden der Ereignisse:",
    speciesSummaryLoadFailed: "Fehler beim Laden der Artenzusammenfassung:",
    unknownError: "Unbekannter Fehler",
    cameras: "Kameras",
    currentGroundScope: "Aktueller Revier-Scope",
    wildlifeEvents: "Wildtier-Ereignisse",
    last30Days: "Letzte 30 Tage",
    observedSpecies: "Beobachtete Arten",
    avgAnimalsPerEvent: "Ø Tiere / Ereignis",
    wildlifeOnly: "nur Wildlife",
    peakActivity: "Aktivitätsspitze",
    events: "Ereignisse",
    speciesSnapshot: "Arten-Snapshot",
    speciesSnapshotText: "Häufigste Arten im aktuellen Zeitraum.",
    topCamera: "Top-Kamera",
    totalAnimals: "Tiere gesamt",
    noSpeciesSignalsYet: "Noch keine Artensignale vorhanden.",
    whereWhenHint: "Wo-&-Wann-Hinweis",
    whereWhenHintText:
      "Verdichteter Hinweis aus Kamera- und Zeitfenster.",
    strongestHint: "Aktuell stärkster Hinweis",
    near: "Nähe",
    timeWindow: "Zeitfenster",
    basis: "Basis",
    noWhereWhenHint:
      "Noch kein belastbarer Wo-und-Wann-Hinweis verfügbar.",
    activitySnapshot: "Aktivitäts-Snapshot",
    activitySnapshotText:
      "Wildlife-Aktivität nach Stunde, verdichtet für das Dashboard.",
    popsim: "PopSim",
    popsimText:
      "Modellgestützte Populationssignale für fundiertere Einschätzungen, Zielbilder und Management-Entscheidungen im Revier.",
    popsimEyebrow: "Bestand. Tendenzen. Ableitungen.",
    popsimBody1:
      "PopSim verdichtet Ereignisse und Muster zu modellgestützten Populationssignalen für fundiertere Entscheidungen im Revier.",
    popsimBody2:
      "Kein exakter Zensus, sondern eine modellgestützte Sicht, die Kamera-Beobachtungen mit einer breiteren wildbiologischen Einordnung verbindet.",
  };
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
  const ctx = await requirePathAccess("/wildlife");

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const cookieStore = await cookies();
  const supabase = supabaseServer();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  const text = t(language);
  const activeOrganization = ctx.activeMembership?.organizations;
  const speciesMetaRows = await loadSpeciesMeta();
  const speciesMetaMap = buildSpeciesMetaMap(speciesMetaRows);

  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <ErrorState message={text.activeOrganizationNotFound} />
      </main>
    );
  }

  const { startAt, endAt } = resolveLast30DaysRange();

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,timezone")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <ErrorState message={`${text.reviersLoadFailed} ${reviersError.message}`} />
      </main>
    );
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const allowedReviers: RevierOption[] = reviers.map((r) => ({
    id: r.id,
    name: r.name,
  }));

  const revierScope = resolveRevierScope(searchParams?.revier, allowedReviers);
  const selectedRevier =
    revierScope.type === "single"
      ? reviers.find((r) => r.id === revierScope.revierId) ?? null
      : null;

  const wildlifeTimeZone = selectedRevier?.timezone ?? DEFAULT_APP_TIME_ZONE;

  const allowedRevierIds = allowedReviers.map((r) => r.id);

  if (allowedRevierIds.length === 0) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <EmptyState message={text.activeGroundsMissing} />
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
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <ErrorState message={`${text.camerasLoadFailed} ${camerasError.message}`} />
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
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title={text.cameras} value="0" subline={text.currentGroundScope} />
          <StatCard
            title={text.wildlifeEvents}
            value="0"
            subline={text.last30Days}
          />
          <StatCard
            title={text.observedSpecies}
            value="0"
            subline={text.last30Days}
          />
          <StatCard
            title={text.avgAnimalsPerEvent}
            value="0.00"
            subline={text.noSpeciesSignalsYet}
          />
        </section>

        <EmptyState message={text.noCamerasInScope} />
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
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <ErrorState message={`${text.eventsLoadFailed} ${eventsError.message}`} />
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
              {text.eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
            <p className="mt-2 text-sm text-white/68">{text.intro}</p>
          </section>

          <ErrorState
            message={`${text.speciesSummaryLoadFailed} ${
              err instanceof Error ? err.message : text.unknownError
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
      const hour = getAppHour(evt.start_at, wildlifeTimeZone);
      if (hour === null) return null;

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

  const comboCounts = new Map<string, number>();

  for (const row of selectedSpeciesEvents) {
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
    const h = getAppHour(evt.start_at, wildlifeTimeZone);
    if (h === null) continue;

    overallHourly[h].count += 1;
  }

  const peakHour =
    overallHourly.slice().sort((a, b) => b.count - a.count)[0] ?? {
      hour: 0,
      count: 0,
    };

  const selectedSpeciesLabel = getSpeciesLabel(
    selectedSpecies,
    language,
    speciesMetaMap
  );

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          {text.eyebrow}
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/68">{text.intro}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title={text.cameras}
          value={String(cameraList.length)}
          subline={text.currentGroundScope}
        />
        <StatCard
          title={text.wildlifeEvents}
          value={String(totalWildlifeEvents)}
          subline={text.last30Days}
        />
        <StatCard
          title={text.observedSpecies}
          value={String(speciesOverview.length)}
          subline={text.last30Days}
        />
        <StatCard
          title={text.avgAnimalsPerEvent}
          value={avgAnimalsPerWildlifeEvent.toFixed(2)}
          subline={text.wildlifeOnly}
        />
        <StatCard
          title={text.peakActivity}
          value={fmtHour(peakHour.hour)}
          subline={`${peakHour.count} ${text.events}`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4">
            <div>
              <h2 className="text-lg font-medium text-white">{text.speciesSnapshot}</h2>
              <p className="text-sm text-white/65">{text.speciesSnapshotText}</p>
            </div>
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
                      {getSpeciesLabel(row.species, language, speciesMetaMap)}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {text.topCamera}:{" "}
                      {row.topCameraId
                        ? cameraLabelById[row.topCameraId] ?? row.topCameraId
                        : "—"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-medium text-white">
                      {row.eventCount} {text.events}
                    </div>
                    <div className="text-xs text-white/45">
                      {row.observedAnimals} {text.totalAnimals}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {topSpecies.length === 0 && (
              <div className="text-sm text-white/68">{text.noSpeciesSignalsYet}</div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4">
            <div>
              <h2 className="text-lg font-medium text-white">{text.whereWhenHint}</h2>
              <p className="text-sm text-white/65">{text.whereWhenHintText}</p>
            </div>
          </div>

          {!selectedSpecies || !topComboEntry ? (
            <div className="text-sm text-white/68">{text.noWhereWhenHint}</div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-white/50">{text.strongestHint}</div>
              <div className="text-xl font-semibold text-white">
                {selectedSpeciesLabel}
              </div>
              <div className="text-sm text-white/72">
                {text.near}{" "}
                <span className="font-medium text-white">
                  {cameraLabelById[topComboEntry.cameraId] ?? topComboEntry.cameraId}
                </span>
              </div>
              <div className="text-sm text-white/72">
                {text.timeWindow}{" "}
                <span className="font-medium text-white">
                  {fmtWindow(topComboEntry.window2h)}
                </span>
              </div>
              <div className="text-sm text-white/72">
                {text.basis}:{" "}
                <span className="font-medium text-white">{topComboEntry.count}</span>{" "}
                {text.events}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4">
            <div>
              <h2 className="text-lg font-medium text-white">{text.activitySnapshot}</h2>
              <p className="text-sm text-white/65">{text.activitySnapshotText}</p>
            </div>
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

        <div className="rounded-[28px] border border-amber-300/15 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-5 backdrop-blur-sm">
          <div className="mb-4">
            <div>
              <h2 className="text-lg font-medium text-white">{text.popsim}</h2>
              <p className="text-sm text-white/65">{text.popsimText}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-200/80">
              {text.popsimEyebrow}
            </div>

            <div className="text-sm leading-6 text-white/78">{text.popsimBody1}</div>

            <div className="rounded-[20px] border border-white/10 bg-black/10 p-4 text-sm leading-6 text-white/68">
              {text.popsimBody2}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}