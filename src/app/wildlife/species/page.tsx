// src/app/wildlife/species/page.tsx #4
export const runtime = "nodejs";

import Link from "next/link";
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

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Species",
      title: "Species",
      intro:
        "Species overview, frequencies and focal points for the current ground scope.",
      activeOrganizationNotFound: "Active organization not found.",
      reviersLoadFailed: "Failed to load grounds:",
      noActiveGrounds:
        "There are currently no active grounds for the active organization.",
      camerasLoadFailed: "Failed to load cameras:",
      noCamerasInScope:
        "There are no cameras for the current ground scope.",
      eventsLoadFailed: "Failed to load events:",
      speciesSummaryLoadFailed: "Failed to load species summary:",
      unknownError: "unknown error",
      observedSpecies: "Observed Species",
      inPeriod: "in period",
      speciesEvents: "Species Events",
      withSpeciesSummary: "with species summary",
      observedAnimals: "Observed Animals",
      aggregated: "aggregated",
      camerasInScope: "Cameras In Scope",
      currentGroundScope: "current ground scope",
      topSpecies: "Top Species",
      topSpeciesText:
        "Quick look at the most frequent species in the selected period.",
      topCamera: "Top camera",
      animals: "animals",
      noSpeciesData:
        "No species data in the selected period yet.",
      speciesOverview: "Species Overview",
      speciesOverviewText:
        "Detailed species overview for the current ground scope.",
      noSpeciesObservations:
        "No species observations found in the selected period.",
      species: "Species",
      events: "Events",
      observedAnimalsCol: "Observed Animals",
      avgPerEvent: "Avg / Event",
      max: "Max",
      topCameraCol: "Top Camera",
      avgRelevance: "Avg Relevance",
    };
  }

  return {
eyebrow: "Arten",
title: "Arten",
intro:
  "Artenübersicht, Häufigkeiten und Schwerpunkte für den aktuellen Revier-Scope.",
activeOrganizationNotFound: "Aktive Organisation nicht gefunden.",
reviersLoadFailed: "Fehler beim Laden der Reviere:",
noActiveGrounds:
  "Für die aktive Organisation sind derzeit keine aktiven Reviere vorhanden.",
camerasLoadFailed: "Fehler beim Laden der Kameras:",
noCamerasInScope:
  "Für den aktuellen Revier-Scope sind keine Kameras vorhanden.",
eventsLoadFailed: "Fehler beim Laden der Ereignisse:",
speciesSummaryLoadFailed: "Fehler beim Laden der Artenzusammenfassung:",
unknownError: "Unbekannter Fehler",
observedSpecies: "Beobachtete Arten",
inPeriod: "im Zeitraum",
speciesEvents: "Arten-Ereignisse",
withSpeciesSummary: "mit Artenzusammenfassung",
observedAnimals: "Beobachtete Tiere",
aggregated: "aggregiert",
camerasInScope: "Kameras im Scope",
currentGroundScope: "Aktueller Revier-Scope",
topSpecies: "Top-Arten",
topSpeciesText:
  "Schnellblick auf die häufigsten Arten im gewählten Zeitraum.",
topCamera: "Top-Kamera",
animals: "Tiere",
noSpeciesData:
  "Noch keine Artdaten im gewählten Zeitraum.",
speciesOverview: "Artenübersicht",
speciesOverviewText:
  "Detaillierte Artenübersicht für den aktuellen Revier-Scope.",
noSpeciesObservations:
  "Keine Artenbeobachtungen im gewählten Zeitraum gefunden.",
species: "Art",
events: "Ereignisse",
observedAnimalsCol: "Beobachtete Tiere",
avgPerEvent: "Ø / Ereignis",
max: "Max.",
topCameraCol: "Top-Kamera",
avgRelevance: "Ø Relevanz",
  };
}

function SpeciesPageHeader({
  period,
  revierValue,
  language,
}: {
  period: PeriodKey;
  revierValue: string;
  language: AppLanguage;
}) {
  const text = t(language);

  return (
    <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          {text.eyebrow}
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
        <p className="mt-2 text-sm text-white/68">{text.intro}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {(["30d", "90d", "365d"] as PeriodKey[]).map((p) => {
          const active = p === period;
          return (
            <Link
              key={p}
              href={buildHref(p, revierValue)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                active
                  ? "border-amber-300/30 bg-amber-300/15 text-amber-100"
                  : "border-white/10 bg-white/5 text-white/72 hover:bg-white/8"
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

function StatCard({
  title,
  value,
  subline,
}: {
  title: string;
  value: string | number;
  subline: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-white/60">{subline}</div>
    </div>
  );
}

export default async function WildlifeSpeciesPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/wildlife/species");

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

  const rawPeriod = searchParams?.period;
  const rawRevier = searchParams?.revier;

  const period: PeriodKey =
    rawPeriod === "30d" || rawPeriod === "90d" || rawPeriod === "365d"
      ? rawPeriod
      : "30d";

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <SpeciesPageHeader period={period} revierValue="all" language={language} />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.activeOrganizationNotFound}
        </div>
      </main>
    );
  }

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
        <SpeciesPageHeader period={period} revierValue="all" language={language} />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.reviersLoadFailed} {reviersError.message}
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
        <SpeciesPageHeader period={period} revierValue="all" language={language} />
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          {text.noActiveGrounds}
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
          language={language}
        />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.camerasLoadFailed} {camerasError.message}
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
          language={language}
        />
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          {text.noCamerasInScope}
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
          language={language}
        />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.eventsLoadFailed} {eventsError.message}
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
            language={language}
          />
          <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
            {text.speciesSummaryLoadFailed}{" "}
            {err instanceof Error ? err.message : text.unknownError}
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
      <SpeciesPageHeader
        period={period}
        revierValue={currentRevierValue}
        language={language}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={text.observedSpecies}
          value={totalSpecies}
          subline={text.inPeriod}
        />
        <StatCard
          title={text.speciesEvents}
          value={totalEvents}
          subline={text.withSpeciesSummary}
        />
        <StatCard
          title={text.observedAnimals}
          value={totalObservedAnimals}
          subline={text.aggregated}
        />
        <StatCard
          title={text.camerasInScope}
          value={cameraList.length}
          subline={text.currentGroundScope}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-white">{text.topSpecies}</h2>
            <p className="text-sm text-white/65">{text.topSpeciesText}</p>
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
                    <div className="font-medium text-white">{row.eventCount} {text.events}</div>
                    <div className="text-xs text-white/45">
                      {row.observedAnimals} {text.animals}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {topSpecies.length === 0 && (
              <div className="text-sm text-white/68">{text.noSpeciesData}</div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-white">{text.speciesOverview}</h2>
            <p className="text-sm text-white/65">{text.speciesOverviewText}</p>
          </div>

          {speciesOverview.length === 0 ? (
            <div className="rounded-[14px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
              {text.noSpeciesObservations}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left text-white/55">
                    <th className="px-3 py-2 font-medium">{text.species}</th>
                    <th className="px-3 py-2 font-medium">{text.events}</th>
                    <th className="px-3 py-2 font-medium">{text.observedAnimalsCol}</th>
                    <th className="px-3 py-2 font-medium">{text.avgPerEvent}</th>
                    <th className="px-3 py-2 font-medium">{text.max}</th>
                    <th className="px-3 py-2 font-medium">{text.topCameraCol}</th>
                    <th className="px-3 py-2 font-medium">{text.avgRelevance}</th>
                  </tr>
                </thead>
                <tbody>
                  {speciesOverview.map((row) => (
                    <tr
                      key={row.species}
                      className="border-b border-white/8 last:border-b-0"
                    >
                      <td className="px-3 py-2 font-medium text-white">
                        {getSpeciesLabel(row.species, language, speciesMetaMap)}
                      </td>
                      <td className="px-3 py-2 text-white/72">{row.eventCount}</td>
                      <td className="px-3 py-2 text-white/72">{row.observedAnimals}</td>
                      <td className="px-3 py-2 text-white/72">{row.avgAnimals.toFixed(2)}</td>
                      <td className="px-3 py-2 text-white/72">{row.maxAnimals}</td>
                      <td className="px-3 py-2 text-white/72">
                        {row.topCameraId
                          ? cameraLabelById[row.topCameraId] ?? row.topCameraId
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-white/72">
                        {`${Math.round(row.avgRelevance * 100)}%`}
                      </td>
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