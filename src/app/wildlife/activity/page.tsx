// src/app/wildlife/activity/page.tsx #5
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
  formatAppDateTime,
  getAppHour,
} from "@/lib/dateTime";

type PeriodKey = "30d" | "90d" | "365d";

type SearchParams = {
  period?: string;
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
  timezone: string | null;
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

function fmtTs(
  ts: string | null,
  language: AppLanguage,
  timeZone: string
) {
  return formatAppDateTime(ts, language, timeZone);
}

function fmtHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function buildHref(period: PeriodKey, revierValue: string) {
  const params = new URLSearchParams();
  params.set("period", period);
  params.set("revier", revierValue);
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

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Activity",
      title: "Activity",
      intro: "Activity patterns in the current ground scope by hour and camera.",
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
      wildlifeEvents: "Wildlife Events",
      inPeriod: "in period",
      camerasInScope: "Cameras In Scope",
      currentGroundScope: "current ground scope",
      peakActivity: "Peak Activity",
      events: "events",
      speciesInActivity: "Species In Activity",
      withActivitySignal: "with activity signal",
      overallWildlifeActivityByHour: "Overall Wildlife Activity by Hour",
      overallWildlifeActivityByHourText:
        "Hourly distribution of all wildlife events in the selected period.",
      cameraActivity: "Camera Activity",
      cameraActivityText:
        "Activity per camera, including relevance and leading species.",
      camera: "Camera",
      avgRelevance: "Avg Relevance",
      leadingSpecies: "Leading Species",
      noCameraActivity: "No camera activity in the selected period.",
      latestWildlifeEvents: "Latest Wildlife Events",
      latestWildlifeEventsText:
        "Most recent wildlife events in the current ground scope.",
      toIngest: "To ingest",
      assets: "Assets",
      noWildlifeEventsYet: "No wildlife events yet.",
    };
  }

  return {
    eyebrow: "Aktivität",
    title: "Aktivität",
    intro: "Aktivitätsmuster im aktuellen Revier-Scope nach Stunde und Kamera.",
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
    wildlifeEvents: "Wildtier-Ereignisse",
    inPeriod: "im Zeitraum",
    camerasInScope: "Kameras im Scope",
    currentGroundScope: "Aktueller Revier-Scope",
    peakActivity: "Aktivitätsspitze",
    events: "Ereignisse",
    speciesInActivity: "Arten in der Aktivität",
    withActivitySignal: "mit Aktivitätssignal",
    overallWildlifeActivityByHour: "Gesamte Wildtieraktivität nach Stunde",
    overallWildlifeActivityByHourText:
      "Stündliche Verteilung aller Wildtier-Ereignisse im gewählten Zeitraum.",
    cameraActivity: "Kamera-Aktivität",
    cameraActivityText:
      "Aktivität je Kamera, inklusive Relevanz und führender Art.",
    camera: "Kamera",
    avgRelevance: "Ø Relevanz",
    leadingSpecies: "Führende Art",
    noCameraActivity: "Keine Kamera-Aktivität im gewählten Zeitraum.",
    latestWildlifeEvents: "Neueste Wildtier-Ereignisse",
    latestWildlifeEventsText:
      "Jüngste Wildtier-Ereignisse im aktuellen Revier-Scope.",
    toIngest: "Zum Ingest",
    assets: "Assets",
    noWildlifeEventsYet: "Noch keine Wildtier-Ereignisse vorhanden.",
  };
}

function ActivityPageHeader({
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

export default async function WildlifeActivityPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/wildlife/activity");

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
        <ActivityPageHeader period={period} revierValue="all" language={language} />
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
        <ActivityPageHeader period={period} revierValue="all" language={language} />
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

  const timezoneByRevierId = new Map(
    reviers.map((r) => [r.id, r.timezone ?? DEFAULT_APP_TIME_ZONE])
  );

  const revierScope = resolveRevierScope(rawRevier, allowedReviers);
  const currentRevierValue =
    revierScope.type === "single" ? revierScope.revierId : "all";

  const allowedRevierIds = allowedReviers.map((r) => r.id);

  if (allowedRevierIds.length === 0) {
    return (
      <main className="space-y-8">
        <ActivityPageHeader period={period} revierValue="all" language={language} />
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
        <ActivityPageHeader
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
  const timeZoneByCameraId = new Map(
    cameraList.map((c) => [
      c.id,
      timezoneByRevierId.get(c.revier_id) ?? DEFAULT_APP_TIME_ZONE,
    ])
  );

  if (cameraIds.length === 0) {
    return (
      <main className="space-y-8">
        <ActivityPageHeader
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
        <ActivityPageHeader
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
          <ActivityPageHeader
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
    const timeZone = timeZoneByCameraId.get(evt.camera_id) ?? DEFAULT_APP_TIME_ZONE;
    const h = getAppHour(evt.start_at, timeZone);
    if (h === null) continue;
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
    overallHourly.slice().sort((a, b) => b.count - a.count)[0] ?? {
      hour: 0,
      count: 0,
    };

  return (
    <main className="space-y-8">
      <ActivityPageHeader
        period={period}
        revierValue={currentRevierValue}
        language={language}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={text.wildlifeEvents}
          value={events.length}
          subline={text.inPeriod}
        />
        <StatCard
          title={text.camerasInScope}
          value={cameraList.length}
          subline={text.currentGroundScope}
        />
        <StatCard
          title={text.peakActivity}
          value={fmtHour(peakHour.hour)}
          subline={`${peakHour.count} ${text.events}`}
        />
        <StatCard
          title={text.speciesInActivity}
          value={speciesOverview.length}
          subline={text.withActivitySignal}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-white">
              {text.overallWildlifeActivityByHour}
            </h2>
            <p className="text-sm text-white/65">
              {text.overallWildlifeActivityByHourText}
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
          <div className="mb-4">
            <h2 className="text-lg font-medium text-white">{text.cameraActivity}</h2>
            <p className="text-sm text-white/65">{text.cameraActivityText}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-white/55">
                  <th className="px-3 py-2 font-medium">{text.camera}</th>
                  <th className="px-3 py-2 font-medium">{text.wildlifeEvents}</th>
                  <th className="px-3 py-2 font-medium">{text.avgRelevance}</th>
                  <th className="px-3 py-2 font-medium">{text.leadingSpecies}</th>
                </tr>
              </thead>
              <tbody>
                {cameraActivity.map((row) => (
                  <tr
                    key={row.cameraId}
                    className="border-b border-white/8 last:border-b-0"
                  >
                    <td className="px-3 py-2 text-white/72">{row.cameraLabel}</td>
                    <td className="px-3 py-2 text-white/72">{row.wildlifeEvents}</td>
                    <td className="px-3 py-2 text-white/72">
                      {`${Math.round(row.avgRelevance * 100)}%`}
                    </td>
                    <td className="px-3 py-2 text-white/72">
                      {getSpeciesLabel(row.leadingSpecies, language, speciesMetaMap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cameraActivity.length === 0 && (
            <div className="mt-3 text-sm text-white/68">{text.noCameraActivity}</div>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">{text.latestWildlifeEvents}</h2>
            <p className="text-sm text-white/65">{text.latestWildlifeEventsText}</p>
          </div>

          <Link
            href="/cameras/ingest"
            className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            {text.toIngest}
          </Link>
        </div>

        <div className="space-y-3">
          {latestEvents.map((evt) => {
            const timeZone =
              timeZoneByCameraId.get(evt.camera_id) ?? DEFAULT_APP_TIME_ZONE;

            return (
              <Link
                key={evt.id}
                href={`/cameras/events/${evt.id}`}
                className="block rounded-[20px] border border-white/10 bg-white/5 p-3 text-sm hover:bg-white/8"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-white">
                    {getSpeciesLabel(evt.top_species, language, speciesMetaMap)}
                    {typeof evt.top_count === "number" ? ` (${evt.top_count})` : ""}
                  </div>
                  <div className="text-white/72">
                    {typeof evt.relevance_score === "number"
                      ? evt.relevance_score.toFixed(3)
                      : "—"}
                  </div>
                </div>

                <div className="mt-1 text-xs text-white/45">
                  {cameraLabelById[evt.camera_id] ?? evt.camera_id} ·{" "}
                  {fmtTs(evt.start_at, language, timeZone)} · {text.assets}{" "}
                  {evt.asset_count ?? 0}
                </div>
              </Link>
            );
          })}

          {latestEvents.length === 0 && (
            <div className="text-sm text-white/68">{text.noWildlifeEventsYet}</div>
          )}
        </div>
      </section>
    </main>
  );
}