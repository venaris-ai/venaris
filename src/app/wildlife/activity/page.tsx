// src/app/wildlife/activity/page.tsx #2c
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

function ActivityPageHeader({
  period,
  revierValue,
}: {
  period: PeriodKey;
  revierValue: string;
}) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          Activity
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">Activity</h1>
        <p className="mt-2 text-sm text-white/68">
          Aktivitätsmuster im aktuellen Revier-Scope nach Stunde und Kamera.
        </p>
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
        <ActivityPageHeader period={period} revierValue="all" />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
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
        <ActivityPageHeader period={period} revierValue="all" />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
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
        <ActivityPageHeader period={period} revierValue="all" />

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
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
        <ActivityPageHeader
          period={period}
          revierValue={currentRevierValue}
        />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
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
        <ActivityPageHeader
          period={period}
          revierValue={currentRevierValue}
        />

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          Für den aktuellen Revier-Scope sind keine Kameras vorhanden.
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
        />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
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
          <ActivityPageHeader
            period={period}
            revierValue={currentRevierValue}
          />

          <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
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
    overallHourly.slice().sort((a, b) => b.count - a.count)[0] ?? {
      hour: 0,
      count: 0,
    };

  return (
    <main className="space-y-8">
      <ActivityPageHeader period={period} revierValue={currentRevierValue} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Wildlife Events"
          value={events.length}
          subline="im Zeitraum"
        />
        <StatCard
          title="Cameras In Scope"
          value={cameraList.length}
          subline="aktueller Revier-Scope"
        />
        <StatCard
          title="Peak Activity"
          value={fmtHour(peakHour.hour)}
          subline={`${peakHour.count} Events`}
        />
        <StatCard
          title="Species In Activity"
          value={speciesOverview.length}
          subline="mit Activity-Signal"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-white">
              Overall Wildlife Activity by Hour
            </h2>
            <p className="text-sm text-white/65">
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
            <h2 className="text-lg font-medium text-white">Camera Activity</h2>
            <p className="text-sm text-white/65">
              Aktivität je Kamera, inklusive Relevanz und führender Art.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-white/55">
                  <th className="px-3 py-2 font-medium">Camera</th>
                  <th className="px-3 py-2 font-medium">Wildlife Events</th>
                  <th className="px-3 py-2 font-medium">Avg Relevance</th>
                  <th className="px-3 py-2 font-medium">Leading Species</th>
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
                    <td className="px-3 py-2 text-white/72">{row.avgRelevance.toFixed(3)}</td>
                    <td className="px-3 py-2 text-white/72">{titleCase(row.leadingSpecies)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cameraActivity.length === 0 && (
            <div className="mt-3 text-sm text-white/68">
              Keine Kamera-Aktivität im gewählten Zeitraum.
            </div>
          )}
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

<Link
  href="/cameras/ingest"
  className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
>
  Zu Ingest
</Link>


        </div>

        <div className="space-y-3">
          {latestEvents.map((evt) => (
            <Link
              key={evt.id}
              href={`/cameras/events/${evt.id}`}
              className="block rounded-[20px] border border-white/10 bg-white/5 p-3 text-sm hover:bg-white/8"
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