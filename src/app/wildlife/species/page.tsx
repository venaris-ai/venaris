// src/app/wildlife/species/page.tsx #7
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
  top_species: string | null;
  top_count: number | null;
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

type SpeciesOverviewRow = {
  species: string;
  eventCount: number;
  wildCount: number;
  share: number;
};

function isOtherSpeciesLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "other" ||
    normalized === "others" ||
    normalized === "sonstiges" ||
    normalized === "sonstige"
  );
}

function isOtherSpecies(
  species: string,
  language: AppLanguage,
  speciesMetaMap: ReturnType<typeof buildSpeciesMetaMap>
) {
  return (
    isOtherSpeciesLabel(species) ||
    isOtherSpeciesLabel(getSpeciesLabel(species, language, speciesMetaMap))
  );
}

function sortSpeciesOverview(
  a: SpeciesOverviewRow,
  b: SpeciesOverviewRow,
  language: AppLanguage,
  speciesMetaMap: ReturnType<typeof buildSpeciesMetaMap>
) {
  const aIsOther = isOtherSpecies(a.species, language, speciesMetaMap);
  const bIsOther = isOtherSpecies(b.species, language, speciesMetaMap);

  if (aIsOther && !bIsOther) return 1;
  if (!aIsOther && bIsOther) return -1;

  return b.eventCount - a.eventCount;
}

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

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Species",
      title: "Species",
      intro: "Which species were recorded in the current ground scope.",
      activeOrganizationNotFound: "Active organization not found.",
      reviersLoadFailed: "Failed to load grounds:",
      noActiveGrounds:
        "There are currently no active grounds for the active organization.",
      camerasLoadFailed: "Failed to load cameras:",
      noCamerasInScope:
        "There are no cameras for the current ground scope.",
      eventsLoadFailed: "Failed to load events:",
      species: "Species",
      events: "Wildlife Events",
      inPeriod: "in period",
      withSpeciesAssignment: "with species assignment",
      mostFrequentSpecies: "Most Frequent Species",
      recordedWildlife: "Counted Wildlife",
      fromEvents: "animals counted from primary event species",
      eventsBySpecies: "Events by Species",
      eventsBySpeciesText:
        "Only the primary species of each event is counted.",
      countedWildlifeBySpecies: "Counted Wildlife by Species",
      countedWildlifeBySpeciesText:
        "Sum of counted animals from the primary event species in the selected period.",
      noSpeciesData: "No species data in the selected period yet.",
    };
  }

  return {
    eyebrow: "Arten",
    title: "Arten",
    intro: "Welche Arten im aktuellen Revier-Scope erfasst wurden.",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden.",
    reviersLoadFailed: "Fehler beim Laden der Reviere:",
    noActiveGrounds:
      "Für die aktive Organisation sind derzeit keine aktiven Reviere vorhanden.",
    camerasLoadFailed: "Fehler beim Laden der Kameras:",
    noCamerasInScope:
      "Für den aktuellen Revier-Scope sind keine Kameras vorhanden.",
    eventsLoadFailed: "Fehler beim Laden der Ereignisse:",
    species: "Arten",
    events: "Wildtier-Ereignisse",
    inPeriod: "im Zeitraum",
    withSpeciesAssignment: "mit Artzuordnung",
    mostFrequentSpecies: "Häufigste Art",
    recordedWildlife: "Gezähltes Wild",
    fromEvents: "Tiere aus Hauptarten der Ereignisse",
    eventsBySpecies: "Ereignisse nach Art",
    eventsBySpeciesText:
      "Gezählt wird ausschließlich die Hauptart eines Ereignisses.",
    countedWildlifeBySpecies: "Gezähltes Wild nach Art",
    countedWildlifeBySpeciesText:
      "Summe der gezählten Tiere aus der Hauptart der Ereignisse im gewählten Zeitraum.",
    noSpeciesData: "Noch keine Artdaten im gewählten Zeitraum.",
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
    .select("id,camera_id,start_at,top_species,top_count")
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

  const speciesStats = new Map<
    string,
    { species: string; eventCount: number; wildCount: number }
  >();

  for (const event of events) {
    if (!event.top_species) continue;

    const existing =
      speciesStats.get(event.top_species) ?? {
        species: event.top_species,
        eventCount: 0,
        wildCount: 0,
      };

    existing.eventCount += 1;
    existing.wildCount += event.top_count ?? 1;
    speciesStats.set(event.top_species, existing);
  }

  const totalSpeciesEvents = Array.from(speciesStats.values()).reduce(
    (sum, row) => sum + row.eventCount,
    0
  );
  const totalWildCount = Array.from(speciesStats.values()).reduce(
    (sum, row) => sum + row.wildCount,
    0
  );
  const speciesOverview: SpeciesOverviewRow[] = Array.from(speciesStats.values())
    .map((row) => ({
      ...row,
      share: totalSpeciesEvents > 0 ? (row.eventCount / totalSpeciesEvents) * 100 : 0,
    }))
    .sort((a, b) => sortSpeciesOverview(a, b, language, speciesMetaMap));
  const topSpecies = speciesOverview[0] ?? null;
  const maxSpeciesEvents = Math.max(1, ...speciesOverview.map((row) => row.eventCount));
  const maxWildCount = Math.max(1, ...speciesOverview.map((row) => row.wildCount));

  return (
    <main className="space-y-8">
      <SpeciesPageHeader
        period={period}
        revierValue={currentRevierValue}
        language={language}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title={text.species} value={speciesOverview.length} subline={text.inPeriod} />
        <StatCard
          title={text.events}
          value={events.length}
          subline={text.withSpeciesAssignment}
        />
        <StatCard
          title={text.mostFrequentSpecies}
          value={topSpecies ? getSpeciesLabel(topSpecies.species, language, speciesMetaMap) : "—"}
          subline={topSpecies ? `${topSpecies.eventCount} ${text.events}` : text.noSpeciesData}
        />
        <StatCard
          title={text.recordedWildlife}
          value={totalWildCount}
          subline={text.fromEvents}
        />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="mb-5">
          <h2 className="text-lg font-medium text-white">{text.eventsBySpecies}</h2>
          <p className="mt-1 text-sm text-white/65">{text.eventsBySpeciesText}</p>
        </div>

        {speciesOverview.length === 0 ? (
          <div className="rounded-[14px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            {text.noSpeciesData}
          </div>
        ) : (
          <div className="space-y-3">
            {speciesOverview.map((row) => (
              <div key={row.species} className="grid grid-cols-[140px_1fr_64px] items-center gap-3 text-sm md:grid-cols-[220px_1fr_80px]">
                <div className="truncate font-medium text-white">
                  {getSpeciesLabel(row.species, language, speciesMetaMap)}
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-[#c9952e]"
                    style={{ width: `${Math.max(2, (row.eventCount / maxSpeciesEvents) * 100)}%` }}
                  />
                </div>
                <div className="text-right tabular-nums text-white/68">
                  {row.eventCount}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="mb-5">
          <h2 className="text-lg font-medium text-white">
            {text.countedWildlifeBySpecies}
          </h2>
          <p className="mt-1 text-sm text-white/65">
            {text.countedWildlifeBySpeciesText}
          </p>
        </div>

        {speciesOverview.length === 0 ? (
          <div className="rounded-[14px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            {text.noSpeciesData}
          </div>
        ) : (
          <div className="space-y-3">
            {speciesOverview.map((row) => (
              <div key={row.species} className="grid grid-cols-[140px_1fr_64px] items-center gap-3 text-sm md:grid-cols-[220px_1fr_80px]">
                <div className="truncate font-medium text-white">
                  {getSpeciesLabel(row.species, language, speciesMetaMap)}
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-[#c9952e]"
                    style={{ width: `${Math.max(2, (row.wildCount / maxWildCount) * 100)}%` }}
                  />
                </div>
                <div className="text-right tabular-nums text-white/68">
                  {row.wildCount}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}