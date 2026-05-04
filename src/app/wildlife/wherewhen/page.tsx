// src/app/wildlife/wherewhen/page.tsx #6
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
import {
  DEFAULT_APP_TIME_ZONE,
  getAppHour,
} from "@/lib/dateTime";

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

type SpeciesOption = {
  species: string;
  count: number;
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

function sortSpeciesOptions(
  a: SpeciesOption,
  b: SpeciesOption,
  language: AppLanguage,
  speciesMetaMap: ReturnType<typeof buildSpeciesMetaMap>
) {
  const aIsOther = isOtherSpecies(a.species, language, speciesMetaMap);
  const bIsOther = isOtherSpecies(b.species, language, speciesMetaMap);

  if (aIsOther && !bIsOther) return 1;
  if (!aIsOther && bIsOther) return -1;

  return b.count - a.count;
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

function fmtWindow(startHour: number, spanHours = 2) {
  const endHour = (startHour + spanHours) % 24;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(
    2,
    "0"
  )}:00`;
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

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Where & When",
      title: "Where & When",
      intro: "Where and when a selected species occurs in the current ground scope.",
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
      speciesSelection: "Species Filter",
      speciesSelectionText:
        "Select one species for the camera-by-time matrix.",
      species: "Species",
      update: "Update",
      noWhereWhenData:
        "No where-and-when data available for the selected period.",
      currentSelection: "current selection",
      events: "Events",
      inPeriod: "in period",
      focalCamera: "Focal Camera",
      activeTime: "Most Active Time",
      noEvents: "No events",
      matrix: "Where & When Matrix",
      matrixText:
        "Bright cells show the strongest combinations of camera and time window.",
      camera: "Camera",
      timeWindow: "Time Window",
    };
  }

  return {
    eyebrow: "Wo & Wann",
    title: "Wo & Wann",
    intro: "Wo und wann eine ausgewählte Art im aktuellen Revier-Scope auftritt.",
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
    speciesSelection: "Art-Filter",
    speciesSelectionText:
      "Eine Art für die Kamera-Zeit-Matrix auswählen.",
    species: "Art",
    update: "Aktualisieren",
    noWhereWhenData:
      "Keine Wo-und-Wann-Daten für den gewählten Zeitraum verfügbar.",
    currentSelection: "aktuelle Auswahl",
    events: "Ereignisse",
    inPeriod: "im Zeitraum",
    focalCamera: "Schwerpunkt",
    activeTime: "Aktivste Zeit",
    noEvents: "Keine Ereignisse",
    matrix: "Wo-&-Wann-Matrix",
    matrixText:
      "Helle Felder zeigen die stärksten Kombinationen aus Kamera und Zeitfenster.",
    camera: "Kamera",
    timeWindow: "Zeitfenster",
  };
}

function WhereWhenPageHeader({
  period,
  revierValue,
  selectedSpecies,
  language,
}: {
  period: PeriodKey;
  revierValue: string;
  selectedSpecies?: string | null;
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
              href={buildHref(p, revierValue, selectedSpecies)}
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

export default async function WildlifeWhereWhenPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/wildlife/wherewhen");

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
        <WhereWhenPageHeader
          period={period}
          revierValue="all"
          language={language}
        />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.activeOrganizationNotFound}
        </div>
      </main>
    );
  }

  const { startAt, endAt } = resolvePeriodRange(period);

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,timezone")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-8">
        <WhereWhenPageHeader
          period={period}
          revierValue="all"
          language={language}
        />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.reviersLoadFailed} {reviersError.message}
        </div>
      </main>
    );
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const revierTimeZoneById = Object.fromEntries(
    reviers.map((r) => [r.id, r.timezone ?? DEFAULT_APP_TIME_ZONE])
  );
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
        <WhereWhenPageHeader
          period={period}
          revierValue="all"
          language={language}
        />
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
        <WhereWhenPageHeader
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
  const cameraRevierIdById = Object.fromEntries(
    cameraList.map((c) => [c.id, c.revier_id])
  );

  if (cameraIds.length === 0) {
    return (
      <main className="space-y-8">
        <WhereWhenPageHeader
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
    .select("id,camera_id,start_at,top_species")
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
          <WhereWhenPageHeader
            period={period}
            revierValue={currentRevierValue}
            language={language}
          />
          <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
            {text.speciesSummaryLoadFailed} {" "}
            {err instanceof Error ? err.message : text.unknownError}
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

  const speciesOptions: SpeciesOption[] = Array.from(speciesCounts.entries())
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => sortSpeciesOptions(a, b, language, speciesMetaMap));

  const selectedSpecies =
    typeof searchParams?.species === "string" && speciesCounts.has(searchParams.species)
      ? searchParams.species
      : speciesOptions[0]?.species ?? null;

  const selectedSpeciesRows = selectedSpecies
    ? summaryRows.filter((row) => row.species === selectedSpecies)
    : [];

  const selectedEvents = selectedSpeciesRows
    .map((row) => eventById.get(row.event_id) ?? null)
    .filter((row): row is EventFeedRow => Boolean(row));

  const cameraCounts = new Map<string, number>();
  const windowCounts = new Map<number, number>();
  const comboCounts = new Map<string, number>();

  for (const evt of selectedEvents) {
    const revierId = cameraRevierIdById[evt.camera_id];
    const timeZone = revierId
      ? revierTimeZoneById[revierId] ?? DEFAULT_APP_TIME_ZONE
      : DEFAULT_APP_TIME_ZONE;
    const hour = getAppHour(evt.start_at, timeZone);
    if (hour === null) continue;

    const window2h = bucket2h(hour);
    cameraCounts.set(evt.camera_id, (cameraCounts.get(evt.camera_id) ?? 0) + 1);
    windowCounts.set(window2h, (windowCounts.get(window2h) ?? 0) + 1);
    comboCounts.set(
      `${evt.camera_id}__${window2h}`,
      (comboCounts.get(`${evt.camera_id}__${window2h}`) ?? 0) + 1
    );
  }

  const totalSelectedSpeciesEvents = selectedEvents.length;
  const topCamera = Array.from(cameraCounts.entries())
    .map(([cameraId, count]) => ({ cameraId, count }))
    .sort((a, b) => b.count - a.count)[0] ?? null;
  const topWindow = Array.from(windowCounts.entries())
    .map(([window2h, count]) => ({ window2h, count }))
    .sort((a, b) => b.count - a.count)[0] ?? null;

  const timeWindows = Array.from({ length: 12 }, (_, index) => index * 2);
  const heatmapRows = timeWindows.map((window2h) => ({
    window2h,
    cells: cameraList.map((camera) => {
      const count = comboCounts.get(`${camera.id}__${window2h}`) ?? 0;
      return {
        cameraId: camera.id,
        count,
      };
    }),
  }));
  const maxCellCount = Math.max(
    1,
    ...heatmapRows.flatMap((row) => row.cells.map((cell) => cell.count))
  );
  const selectedSpeciesLabel = selectedSpecies
    ? getSpeciesLabel(selectedSpecies, language, speciesMetaMap)
    : "—";

  return (
    <main className="space-y-8">
      <WhereWhenPageHeader
        period={period}
        revierValue={currentRevierValue}
        selectedSpecies={selectedSpecies}
        language={language}
      />

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">{text.speciesSelection}</h2>
            <p className="text-sm text-white/65">{text.speciesSelectionText}</p>
          </div>

          <form
            method="get"
            action="/wildlife/wherewhen"
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="revier" value={currentRevierValue} />

            <div className="flex flex-col gap-1">
              <label htmlFor="species" className="text-sm font-medium text-white">
                {text.species}
              </label>
              <select
                id="species"
                name="species"
                defaultValue={selectedSpecies ?? ""}
                className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                {speciesOptions.map((row) => (
                  <option key={row.species} value={row.species} className="bg-[#102018] text-white">
                    {getSpeciesLabel(row.species, language, speciesMetaMap)} ({row.count})
                  </option>
                ))}
              </select>
            </div>

            <button className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white">
              {text.update}
            </button>
          </form>
        </div>
      </section>

      {!selectedSpecies || totalSelectedSpeciesEvents === 0 ? (
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          {text.noWhereWhenData}
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title={text.species}
              value={selectedSpeciesLabel}
              subline={text.currentSelection}
            />
            <StatCard
              title={text.events}
              value={totalSelectedSpeciesEvents}
              subline={text.inPeriod}
            />
            <StatCard
              title={text.focalCamera}
              value={topCamera ? cameraLabelById[topCamera.cameraId] ?? topCamera.cameraId : "—"}
              subline={topCamera ? `${topCamera.count} ${text.events}` : text.noEvents}
            />
            <StatCard
              title={text.activeTime}
              value={topWindow ? fmtWindow(topWindow.window2h) : "—"}
              subline={topWindow ? `${topWindow.count} ${text.events}` : text.noEvents}
            />
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="mb-5">
              <h2 className="text-lg font-medium text-white">{text.matrix}</h2>
              <p className="text-sm text-white/65">{text.matrixText}</p>
            </div>

            <div className="overflow-x-auto">
              <div
                className="grid min-w-[760px] gap-2"
                style={{ gridTemplateColumns: `96px repeat(${cameraList.length}, minmax(88px, 1fr))` }}
              >
                <div className="text-xs uppercase tracking-wide text-white/45">
                  {text.timeWindow}
                </div>
                {cameraList.map((camera) => (
                  <div key={camera.id} className="truncate text-xs uppercase tracking-wide text-white/45">
                    {camera.location_name ? `${camera.name} (${camera.location_name})` : camera.name}
                  </div>
                ))}

                {heatmapRows.map((row) => (
                  <div key={row.window2h} className="contents">
                    <div className="flex h-11 items-center text-sm tabular-nums text-white/60">
                      {fmtWindow(row.window2h)}
                    </div>
                    {row.cells.map((cell) => {
                      const intensity = cell.count / maxCellCount;
                      return (
                        <div
                          key={`${row.window2h}-${cell.cameraId}`}
                          className="flex h-11 items-center justify-center rounded-[14px] border border-white/10 text-sm tabular-nums text-white"
                          style={{
                            backgroundColor:
                              cell.count > 0
                                ? `rgba(201, 149, 46, ${0.16 + intensity * 0.54})`
                                : "rgba(255, 255, 255, 0.04)",
                          }}
                          title={`${cameraLabelById[cell.cameraId] ?? cell.cameraId} · ${fmtWindow(row.window2h)} · ${cell.count}`}
                        >
                          {cell.count > 0 ? cell.count : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
