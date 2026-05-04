// src/app/wildlife/activity/page.tsx #6
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
  DEFAULT_APP_TIME_ZONE,
  getAppHour,
} from "@/lib/dateTime";

type PeriodKey = "30d" | "90d" | "365d";

type SearchParams = {
  period?: string;
  revier?: string;
  camera?: string;
};

type EventFeedRow = {
  id: string;
  camera_id: string;
  start_at: string | null;
  top_species: string | null;
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

function fmtHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function buildHref(
  period: PeriodKey,
  revierValue: string,
  cameraValue?: string | null
) {
  const params = new URLSearchParams();
  params.set("period", period);
  params.set("revier", revierValue);
  if (cameraValue && cameraValue !== "all") params.set("camera", cameraValue);
  return `/wildlife/activity?${params.toString()}`;
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Activity",
      title: "Activity",
      intro: "When and at which cameras events occur in the current ground scope.",
      activeOrganizationNotFound: "Active organization not found.",
      reviersLoadFailed: "Failed to load grounds:",
      noActiveGrounds:
        "There are currently no active grounds for the active organization.",
      camerasLoadFailed: "Failed to load cameras:",
      noCamerasInScope:
        "There are no cameras for the current ground scope.",
      eventsLoadFailed: "Failed to load events:",
      events: "Events",
      inPeriod: "in period",
      mostActiveCamera: "Most Active Camera",
      noEvents: "No events",
      peakActivity: "Peak Activity",
      activeCameras: "Active Cameras",
      ofCameras: (count: number) => `of ${count} cameras`,
      currentGroundScope: "current ground scope",
      cameraFilter: "Camera Filter",
      cameraFilterText:
        "Limit the activity view to one camera or keep the full ground scope.",
      camera: "Camera",
      allCameras: "All cameras",
      update: "Update",
      activityByHour: "Activity by Hour",
      activityByHourText:
        "Hourly distribution of all events in the selected period.",
      noActivityData: "No activity data in the selected period.",
    };
  }

  return {
    eyebrow: "Aktivität",
    title: "Aktivität",
    intro: "Wann und an welchen Kameras Ereignisse im aktuellen Revier-Scope auftreten.",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden.",
    reviersLoadFailed: "Fehler beim Laden der Reviere:",
    noActiveGrounds:
      "Für die aktive Organisation sind derzeit keine aktiven Reviere vorhanden.",
    camerasLoadFailed: "Fehler beim Laden der Kameras:",
    noCamerasInScope:
      "Für den aktuellen Revier-Scope sind keine Kameras vorhanden.",
    eventsLoadFailed: "Fehler beim Laden der Ereignisse:",
    events: "Ereignisse",
    inPeriod: "im Zeitraum",
    mostActiveCamera: "Aktivste Kamera",
    noEvents: "Keine Ereignisse",
    peakActivity: "Aktivste Zeit",
    activeCameras: "Aktive Kameras",
    ofCameras: (count: number) => `von ${count} Kameras`,
    currentGroundScope: "aktueller Revier-Scope",
    cameraFilter: "Kamera-Filter",
    cameraFilterText:
      "Aktivität auf eine Kamera eingrenzen oder den gesamten Revier-Scope betrachten.",
    camera: "Kamera",
    allCameras: "Alle Kameras",
    update: "Aktualisieren",
    activityByHour: "Aktivität nach Uhrzeit",
    activityByHourText:
      "Stündliche Verteilung aller Ereignisse im gewählten Zeitraum.",
    noActivityData: "Keine Aktivitätsdaten im gewählten Zeitraum.",
  };
}

function ActivityPageHeader({
  period,
  revierValue,
  cameraValue,
  language,
}: {
  period: PeriodKey;
  revierValue: string;
  cameraValue: string;
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
              href={buildHref(p, revierValue, cameraValue)}
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

function CameraFilter({
  period,
  revierValue,
  selectedCameraId,
  cameras,
  language,
}: {
  period: PeriodKey;
  revierValue: string;
  selectedCameraId: string;
  cameras: CameraRow[];
  language: AppLanguage;
}) {
  const text = t(language);

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-medium text-white">{text.cameraFilter}</h2>
          <p className="text-sm text-white/65">{text.cameraFilterText}</p>
        </div>

        <form
          method="get"
          action="/wildlife/activity"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="revier" value={revierValue} />

          <div className="flex flex-col gap-1">
            <label htmlFor="camera" className="text-sm font-medium text-white">
              {text.camera}
            </label>
            <select
              id="camera"
              name="camera"
              defaultValue={selectedCameraId}
              className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            >
              <option value="all" className="bg-[#102018] text-white">
                {text.allCameras}
              </option>
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id} className="bg-[#102018] text-white">
                  {camera.location_name ? `${camera.name} (${camera.location_name})` : camera.name}
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

  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  const rawPeriod = searchParams?.period;
  const rawRevier = searchParams?.revier;
  const rawCamera = searchParams?.camera;

  const period: PeriodKey =
    rawPeriod === "30d" || rawPeriod === "90d" || rawPeriod === "365d"
      ? rawPeriod
      : "30d";

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <ActivityPageHeader
          period={period}
          revierValue="all"
          cameraValue="all"
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
        <ActivityPageHeader
          period={period}
          revierValue="all"
          cameraValue="all"
          language={language}
        />
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
        <ActivityPageHeader
          period={period}
          revierValue="all"
          cameraValue="all"
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
        <ActivityPageHeader
          period={period}
          revierValue={currentRevierValue}
          cameraValue="all"
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
  const selectedCameraId =
    typeof rawCamera === "string" && cameraIds.includes(rawCamera)
      ? rawCamera
      : "all";
  const eventCameraIds = selectedCameraId === "all" ? cameraIds : [selectedCameraId];

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
          cameraValue="all"
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
    .in("camera_id", eventCameraIds)
    .gte("start_at", startAt)
    .lt("start_at", endAt)
    .order("start_at", { ascending: false });

  if (eventsError) {
    return (
      <main className="space-y-8">
        <ActivityPageHeader
          period={period}
          revierValue={currentRevierValue}
          cameraValue={selectedCameraId}
          language={language}
        />
        <CameraFilter
          period={period}
          revierValue={currentRevierValue}
          selectedCameraId={selectedCameraId}
          cameras={cameraList}
          language={language}
        />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.eventsLoadFailed} {eventsError.message}
        </div>
      </main>
    );
  }

  const events = ((eventsData ?? []) as EventFeedRow[]).filter((e) => e.top_species);

  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));
  const cameraEventCounts = new Map<string, number>();

  for (const evt of events) {
    cameraEventCounts.set(evt.camera_id, (cameraEventCounts.get(evt.camera_id) ?? 0) + 1);

    const timeZone = timeZoneByCameraId.get(evt.camera_id) ?? DEFAULT_APP_TIME_ZONE;
    const hour = getAppHour(evt.start_at, timeZone);
    if (hour !== null) hourlyActivity[hour].count += 1;
  }

  const maxHourlyActivity = Math.max(1, ...hourlyActivity.map((row) => row.count));
  const peakHour = hourlyActivity.slice().sort((a, b) => b.count - a.count)[0] ?? {
    hour: 0,
    count: 0,
  };
  const activeCameraCount = Array.from(cameraEventCounts.values()).filter(
    (count) => count > 0
  ).length;
  const mostActiveCamera = Array.from(cameraEventCounts.entries())
    .map(([cameraId, count]) => ({ cameraId, count }))
    .sort((a, b) => b.count - a.count)[0] ?? null;

  return (
    <main className="space-y-8">
      <ActivityPageHeader
        period={period}
        revierValue={currentRevierValue}
        cameraValue={selectedCameraId}
        language={language}
      />

      <CameraFilter
        period={period}
        revierValue={currentRevierValue}
        selectedCameraId={selectedCameraId}
        cameras={cameraList}
        language={language}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title={text.events} value={events.length} subline={text.inPeriod} />
        <StatCard
          title={text.mostActiveCamera}
          value={
            mostActiveCamera
              ? cameraLabelById[mostActiveCamera.cameraId] ?? mostActiveCamera.cameraId
              : "—"
          }
          subline={mostActiveCamera ? `${mostActiveCamera.count} ${text.events}` : text.noEvents}
        />
        <StatCard
          title={text.peakActivity}
          value={events.length > 0 ? fmtHour(peakHour.hour) : "—"}
          subline={events.length > 0 ? `${peakHour.count} ${text.events}` : text.noEvents}
        />
        <StatCard
          title={text.activeCameras}
          value={activeCameraCount}
          subline={text.ofCameras(selectedCameraId === "all" ? cameraList.length : 1)}
        />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="mb-5">
          <h2 className="text-lg font-medium text-white">{text.activityByHour}</h2>
          <p className="text-sm text-white/65">{text.activityByHourText}</p>
        </div>

        {events.length === 0 ? (
          <div className="rounded-[14px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            {text.noActivityData}
          </div>
        ) : (
          <div className="space-y-2">
            {hourlyActivity.map((row) => (
              <div key={row.hour} className="grid grid-cols-[56px_1fr_48px] items-center gap-3 text-sm">
                <div className="tabular-nums text-white/55">{fmtHour(row.hour)}</div>
                <div className="h-3 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-[#c9952e]"
                    style={{ width: `${Math.max(2, (row.count / maxHourlyActivity) * 100)}%` }}
                  />
                </div>
                <div className="text-right tabular-nums text-white/65">{row.count}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
