// src/app/cameras/ingest/page.tsx #15
export const dynamic = "force-dynamic";

import Link from "next/link";
import IngestFilterBlock from "./IngestFilterBlock";
import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import { formatAppDateTime } from "@/lib/dateTime";
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";
import {
  applyReviewableMaterializedEventFilters,
  getMaterializedEventDetailId,
  MATERIALIZED_EVENT_NORMAL_SELECT,
  type MaterializedEventFeedRow,
} from "@/lib/materializedEventFeed";

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      activeOrganizationContextRequired: "Active organization context required",
      activeOrganizationNotFound: "Active organization not found",
      eyebrow: "Ingest",
      title: "Ingest",
      intro: "Overview of processed events.",
      time: "Time",
      camera: "Camera",
      channel: "Channel",
      result: "Result",
      truth: "Truth",
      assets: "Assets",
      status: "Status",
      details: "Details",
      noEntries: "No processed events available yet.",
      until: "until",
      unnamedCamera: "Unnamed camera",
      showDetails: "Show details",
      apiError: "API error",
      filterTitle: "Filter events",
      filterIntro: "Find older or imported events by camera and recording date.",
      allCameras: "All cameras",
      fromDate: "From",
      toDate: "To",
      applyFilters: "Apply",
      resetFilters: "Reset",
      page: "Page",
      previousPage: "Previous",
      nextPage: "Next",
      paginationSummary: "Showing {from}–{to} of {total} events",
      paginationSummaryCapped: "Showing {from}–{to} of the latest {total}+ events",
      cappedHint: "The overview is limited to the latest 300 events. Use filters to narrow down older manual imports.",
    };
  }

  return {
    activeOrganizationContextRequired: "Aktiver Organisationskontext erforderlich",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden",
    eyebrow: "Ingest",
    title: "Ingest",
    intro: "Übersicht der verarbeiteten Ereignisse.",
    time: "Zeit",
    camera: "Kamera",
    channel: "Kanal",
    result: "Ergebnis",
    truth: "Wahr",
    assets: "Assets",
    status: "Status",
    details: "Details",
    noEntries: "Noch keine verarbeiteten Ereignisse vorhanden.",
    until: "bis",
    unnamedCamera: "Unbenannte Kamera",
    showDetails: "Details anzeigen",
    apiError: "API Fehler",
    filterTitle: "Ereignisse eingrenzen",
    filterIntro: "Finde ältere oder importierte Ereignisse gezielt nach Kamera und Aufnahmezeitraum.",
    allCameras: "Alle Kameras",
    fromDate: "Von",
    toDate: "Bis",
    applyFilters: "Anwenden",
    resetFilters: "Zurücksetzen",
    page: "Seite",
    previousPage: "Zurück",
    nextPage: "Weiter",
    paginationSummary: "Zeige {from}–{to} von {total} Ereignissen",
    paginationSummaryCapped: "Zeige {from}–{to} der neuesten {total}+ Ereignisse",
    cappedHint: "Die Übersicht ist auf die neuesten 300 Ereignisse begrenzt. Nutze Filter, um ältere manuelle Importe gezielt einzugrenzen.",
  };
}

type SearchParams = {
  revier?: string;
  page?: string;
  camera?: string;
  from?: string;
  to?: string;
};

type RevierRow = {
  id: string;
  name: string;
  timezone: string | null;
};

type CameraScopeRow = {
  id: string;
  name: string | null;
  location_name: string | null;
  revier_id: string | null;
};

type BatchCameraRelation =
  | {
      id: string;
      name: string | null;
    }
  | {
      id: string;
      name: string | null;
    }[]
  | null;

type BatchDb = {
  id: string;
  camera_id: string;
  received_at: string;
  source: string | null;
  file_count: number | null;
  status: string | null;
  error_summary: string | null;
  cameras: BatchCameraRelation;
};

type Batch = {
  id: string;
  cameraId: string;
  cameraName: string | null;
  receivedAt: string;
  source: string | null;
  fileCount: number | null;
  status: string | null;
  errorSummary: string | null;
};

type AssetRow = {
  id: string;
  ingest_batch_id: string | null;
};

type MaterializedEventAssetRow = {
  materialized_event_id: string;
  asset_id: string;
};

type IngestEventRow = {
  eventId: string;
  batchId: string | null;
  cameraName: string | null;
  receivedAt: string | null;
  source: string | null;
  ingestStatus: string | null;
  errorSummary: string | null;
  startAt: string | null;
  endAt: string | null;
  timeZone: string | null;
  assetCount: number;
  topSpecies: string | null;
  topCount: number | null;
  probabilityScore: number | null;
};

function extractCameraName(value: BatchCameraRelation): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value.name ?? null;
}

function normalizeBatch(row: BatchDb): Batch {
  return {
    id: row.id,
    cameraId: row.camera_id,
    cameraName: extractCameraName(row.cameras),
    receivedAt: row.received_at,
    source: row.source,
    fileCount: row.file_count,
    status: row.status,
    errorSummary: row.error_summary,
  };
}

function pickLatestBatch(
  batchById: Map<string, Batch>,
  batchIds: Set<string> | undefined
): Batch | null {
  if (!batchIds || batchIds.size === 0) return null;

  let selected: Batch | null = null;
  let selectedTs = Number.NEGATIVE_INFINITY;

  for (const batchId of batchIds) {
    const batch = batchById.get(batchId);
    if (!batch) continue;

    const ts = new Date(batch.receivedAt).getTime();
    if (ts > selectedTs) {
      selected = batch;
      selectedTs = ts;
    }
  }

  return selected;
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "warn" | "err" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
        : tone === "err"
          ? "border-rose-300/25 bg-rose-300/10 text-rose-200"
          : "border-white/10 bg-white/5 text-white/72";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function statusTone(status?: string | null) {
  const s = (status || "").toLowerCase();

  if (s === "completed" || s === "ok" || s === "success" || s === "done") {
    return "ok" as const;
  }

  if (s === "error" || s === "failed") {
    return "err" as const;
  }

  if (s === "processing" || s === "running") {
    return "warn" as const;
  }

  return "muted" as const;
}

function sourceTone(source?: string | null) {
  const s = (source || "").toLowerCase();

  if (s === "smtp") return "warn" as const;
  if (s === "ftp") return "muted" as const;
  if (s === "manual") return "ok" as const;
  if (s === "token" || s === "token-ingest") return "muted" as const;

  return "muted" as const;
}

function formatProbability(value?: number | null) {
  if (typeof value !== "number") return "—";
  return `${Math.round(value * 100)}%`;
}

const EVENTS_PER_PAGE = 30;
const MAX_PAGINATED_EVENTS = 300;

function parsePageParam(value?: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseDateParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

function formatDateInputValue(value?: string | null) {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toLocaleDateString("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getTodayDateInputValue() {
  return formatDateInputValue(new Date().toISOString());
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function buildIngestPageHref(params: {
  page: number;
  revier?: string;
  camera?: string;
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();

  if (params.revier) search.set("revier", params.revier);
  if (params.camera) search.set("camera", params.camera);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.page > 1) search.set("page", String(params.page));

  const query = search.toString();
  return query ? `/cameras/ingest?${query}` : "/cameras/ingest";
}

function buildResetFilterHref(params: { revier?: string }) {
  if (!params.revier) return "/cameras/ingest";

  const search = new URLSearchParams({ revier: params.revier });
  return `/cameras/ingest?${search.toString()}`;
}

function buildEventDetailHref(params: {
  eventId: string;
  revier?: string;
  camera?: string;
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();

  if (params.revier) search.set("revier", params.revier);
  if (params.camera) search.set("camera", params.camera);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);

  const query = search.toString();
  return query
    ? `/cameras/events/${params.eventId}?${query}`
    : `/cameras/events/${params.eventId}`;
}

function formatPaginationSummary(
  template: string,
  values: { from: number; to: number; total: number }
) {
  return template
    .replace("{from}", String(values.from))
    .replace("{to}", String(values.to))
    .replace("{total}", String(values.total));
}

function sortRows(rows: IngestEventRow[]) {
  return [...rows].sort((a, b) => {
    const aTs = new Date(a.endAt ?? a.startAt ?? a.receivedAt ?? 0).getTime();
    const bTs = new Date(b.endAt ?? b.startAt ?? b.receivedAt ?? 0).getTime();
    return bTs - aTs;
  });
}

export default async function CamerasIngestPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/cameras/ingest");

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const activeOrganization = ctx.activeMembership.organizations;

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  const supabase = supabaseServer();
  const cookieStore = await cookies();

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
  const speciesMetaRows = await loadSpeciesMeta();
  const speciesMetaMap = buildSpeciesMetaMap(speciesMetaRows);

  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;
  const rawRevier = searchParams?.revier;
  const rawCamera = searchParams?.camera;
  const requestedFromDate = parseDateParam(searchParams?.from);
  const requestedToDate = parseDateParam(searchParams?.to);
  const defaultToDate = getTodayDateInputValue();
  const requestedPage = parsePageParam(searchParams?.page);

  let items: IngestEventRow[] = [];
  let apiError: string | null = null;
  let currentPage = 1;
  let totalEvents = 0;
  let totalPages = 1;
  let hasMoreThanMaxEvents = false;
  let cameraOptions: CameraScopeRow[] = [];
  let selectedCameraId: string | undefined;
  let oldestEventDate: string | undefined;
  let fromDate = requestedFromDate;
  let toDate = requestedToDate ?? defaultToDate;

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,timezone")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    apiError = reviersError.message;
  } else {
    const reviers = (reviersData ?? []) as RevierRow[];
    const timeZoneByRevierId = new Map(
      reviers.map((revier) => [revier.id, revier.timezone] as const)
    );

    const allowedReviers: RevierOption[] = reviers.map((revier) => ({
      id: revier.id,
      name: revier.name,
    }));
    const revierScope = resolveRevierScope(rawRevier, allowedReviers);
    const allowedRevierIds = allowedReviers.map((revier) => revier.id);

    if (allowedRevierIds.length > 0) {
      let camerasQuery = supabase
        .from("cameras")
        .select("id,name,location_name,revier_id")
        .eq("organization_id", activeOrganization.id);

      camerasQuery =
        revierScope.type === "single"
          ? camerasQuery.eq("revier_id", revierScope.revierId)
          : camerasQuery.in("revier_id", allowedRevierIds);

      const { data: cameras, error: camerasError } = await camerasQuery;

      if (camerasError) {
        apiError = camerasError.message;
      } else {
        const cameraRows = (cameras ?? []) as CameraScopeRow[];
        cameraOptions = [...cameraRows].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "")
        );
        const allowedCameraIds = cameraRows.map((camera) => camera.id);
        selectedCameraId =
          rawCamera && allowedCameraIds.includes(rawCamera) ? rawCamera : undefined;
        const filteredCameraIds = selectedCameraId
          ? [selectedCameraId]
          : allowedCameraIds;
        const revierIdByCameraId = new Map(
          cameraRows.map((camera) => [camera.id, camera.revier_id] as const)
        );
        const cameraNameById = new Map(
          cameraRows.map((camera) => [camera.id, camera.name] as const)
        );

        if (allowedCameraIds.length > 0) {
          const oldestEventQuery = applyReviewableMaterializedEventFilters(
            supabase
              .from("materialized_events")
              .select("start_at")
              .in("camera_id", filteredCameraIds)
              .not("start_at", "is", null)
          )
            .order("start_at", { ascending: true, nullsFirst: false })
            .limit(1);

          const { data: oldestEventData, error: oldestEventError } =
            await oldestEventQuery;

          if (oldestEventError) {
            apiError = oldestEventError.message;
          } else {
            oldestEventDate = formatDateInputValue(
              ((oldestEventData ?? []) as Pick<MaterializedEventFeedRow, "start_at">[])[0]
                ?.start_at
            );

            fromDate = requestedFromDate ?? oldestEventDate;

            if (fromDate && toDate && fromDate > toDate) {
              const normalizedFromDate = toDate;
              toDate = fromDate;
              fromDate = normalizedFromDate;
            }
          }
        }

        if (!apiError && allowedCameraIds.length > 0) {
         let eventCountQuery = applyReviewableMaterializedEventFilters(
           supabase
             .from("materialized_events")
             .select("id", { count: "exact", head: true })
             .in("camera_id", filteredCameraIds)
         );


          if (fromDate) {
            eventCountQuery = eventCountQuery.gte("start_at", `${fromDate}T00:00:00`);
          }

          if (toDate) {
            eventCountQuery = eventCountQuery.lte("start_at", `${toDate}T23:59:59.999`);
          }

          const { count: eventCount, error: eventCountError } =
            await eventCountQuery;

          if (eventCountError) {
            apiError = eventCountError.message;
          } else {
            hasMoreThanMaxEvents = (eventCount ?? 0) > MAX_PAGINATED_EVENTS;
            totalEvents = Math.min(eventCount ?? 0, MAX_PAGINATED_EVENTS);
            totalPages = Math.max(1, Math.ceil(totalEvents / EVENTS_PER_PAGE));
            currentPage = clampPage(requestedPage, totalPages);

            const from = (currentPage - 1) * EVENTS_PER_PAGE;
            const to = Math.min(
              from + EVENTS_PER_PAGE - 1,
              MAX_PAGINATED_EVENTS - 1
            );

            let eventsQuery = applyReviewableMaterializedEventFilters(
              supabase
                .from("materialized_events")
                .select(MATERIALIZED_EVENT_NORMAL_SELECT)
                .in("camera_id", filteredCameraIds)
            );

            if (fromDate) {
              eventsQuery = eventsQuery.gte("start_at", `${fromDate}T00:00:00`);
            }

            if (toDate) {
              eventsQuery = eventsQuery.lte("start_at", `${toDate}T23:59:59.999`);
            }

            const { data: eventsData, error: eventsError } = await eventsQuery
              .order("start_at", { ascending: false, nullsFirst: false })
              .range(from, to)
              .returns<MaterializedEventFeedRow[]>();

          if (eventsError) {
            apiError = eventsError.message;
          } else {
          const events = eventsData ?? [];
          const eventIds = events.map((event) => event.id);

          if (eventIds.length > 0) {
             const { data: eventAssetsData, error: eventAssetsError } =
               await supabase
                  .from("materialized_event_assets")
                  .select("materialized_event_id,asset_id")
                  .in("materialized_event_id", eventIds)
                  .returns<MaterializedEventAssetRow[]>();

              if (eventAssetsError) {
                apiError = eventAssetsError.message;
              } else {
              const eventAssets = eventAssetsData ?? [];

                const assetIds = Array.from(
                  new Set(eventAssets.map((row) => row.asset_id).filter(Boolean))
                );

                let assets: AssetRow[] = [];
                if (assetIds.length > 0) {
                  const { data: assetsData, error: assetsError } = await supabase
                    .from("assets")
                    .select("id,ingest_batch_id")
                    .in("id", assetIds);

                  if (assetsError) {
                    apiError = assetsError.message;
                  } else {
                    assets = (assetsData ?? []) as AssetRow[];
                  }
                }

                if (!apiError) {
                  const batchIdByAssetId = new Map<string, string>();
                  const batchIdsByEventId = new Map<string, Set<string>>();

                  for (const asset of assets) {
                    if (!asset.ingest_batch_id) continue;
                    batchIdByAssetId.set(asset.id, asset.ingest_batch_id);
                  }

                  for (const row of eventAssets) {
                    const batchId = batchIdByAssetId.get(row.asset_id);
                    if (!batchId) continue;

                    if (!batchIdsByEventId.has(row.materialized_event_id)) {
                     batchIdsByEventId.set(row.materialized_event_id, new Set<string>());
                    }

                    batchIdsByEventId.get(row.materialized_event_id)?.add(batchId);
                  }

                  const batchIds = Array.from(
                    new Set(
                      Array.from(batchIdsByEventId.values()).flatMap((set) =>
                        Array.from(set)
                      )
                    )
                  );

                  let batches: Batch[] = [];
                  if (batchIds.length > 0) {
                    const { data: batchData, error: batchError } = await supabase
                      .from("ingest_batches")
                      .select(`
                        id,
                        camera_id,
                        received_at,
                        source,
                        file_count,
                        status,
                        error_summary,
                        cameras ( id, name )
                      `)
                      .in("id", batchIds);

                    if (batchError) {
                      apiError = batchError.message;
                    } else {
                      batches = ((batchData ?? []) as BatchDb[]).map(normalizeBatch);
                    }
                  }

                  if (!apiError) {
                    const batchById = new Map(
                      batches.map((batch) => [batch.id, batch] as const)
                    );

                    const resolvedRows: IngestEventRow[] = [];

                    for (const event of events) {
                      const batch = pickLatestBatch(
                        batchById,
                        batchIdsByEventId.get(event.id)
                      );
                      const revierId = revierIdByCameraId.get(event.camera_id);

                      resolvedRows.push({
                        eventId: getMaterializedEventDetailId(event),
                        batchId: batch?.id ?? null,
                        cameraName:
                        batch?.cameraName ??
                        cameraNameById.get(event.camera_id) ??
                        null,
                      receivedAt: batch?.receivedAt ?? null,
                      source: batch?.source ?? null,
                      ingestStatus: batch?.status ?? null,
                      errorSummary: batch?.errorSummary ?? null,
                      startAt: event.start_at,
                      endAt: event.end_at,
                      timeZone: revierId
                        ? timeZoneByRevierId.get(revierId) ?? null
                        : null,
                      assetCount: event.asset_count ?? 0,
                      topSpecies: event.event_species_effective,
                      topCount: event.event_animal_count_effective,
                      probabilityScore: event.event_species_score,
                      });
                    }

                    items = sortRows(resolvedRows);
                  }
                }
              }
            }
          }
          }
        }
      }
    }
  }

  const paginationFrom =
    totalEvents === 0 ? 0 : (currentPage - 1) * EVENTS_PER_PAGE + 1;
  const paginationTo = Math.min(currentPage * EVENTS_PER_PAGE, totalEvents);
  const paginationSummary = formatPaginationSummary(
    hasMoreThanMaxEvents
      ? text.paginationSummaryCapped
      : text.paginationSummary,
    {
      from: paginationFrom,
      to: paginationTo,
      total: totalEvents,
    }
  );
  const paginationPages = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  );

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.title}
          </h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </div>
      </section>

      <IngestFilterBlock
        text={text}
        rawRevier={rawRevier}
        selectedCameraId={selectedCameraId}
        fromDate={fromDate}
        toDate={toDate}
        oldestEventDate={oldestEventDate}
        defaultToDate={defaultToDate}
        cameraOptions={cameraOptions}
        resetHref={buildResetFilterHref({ revier: rawRevier })}
      />

      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-white/8 bg-white/5 text-left text-white/55">
            <tr>
              <th className="px-3 py-2">{text.time}</th>
              <th className="px-3 py-2">{text.camera}</th>
              <th className="px-3 py-2">{text.channel}</th>
              <th className="px-3 py-2">{text.result}</th>
              <th className="px-3 py-2">{text.truth}</th>
              <th className="px-3 py-2">{text.assets}</th>
              <th className="px-3 py-2">{text.status}</th>
              <th className="px-3 py-2">{text.details}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-white/45" colSpan={8}>
                  {text.noEntries}
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const stTone = statusTone(row.ingestStatus);
                const srcTone = sourceTone(row.source);

                const eventHref = buildEventDetailHref({
                  eventId: row.eventId,
                  revier: rawRevier,
                  camera: selectedCameraId,
                  from: fromDate,
                  to: toDate,
                });

                return (
                  <tr
                    key={row.eventId}
                    className="border-b border-white/8 last:border-b-0"
                  >
                    <td className="px-3 py-3 text-white/72 whitespace-nowrap">
                      <div>
                        {formatAppDateTime(
                          row.startAt ?? row.receivedAt,
                          language,
                          row.timeZone
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-white">
                      {row.cameraName?.trim() || text.unnamedCamera}
                    </td>

                    <td className="px-3 py-3">
                      <Badge tone={srcTone}>{row.source || "—"}</Badge>
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-medium text-white">
                        {getSpeciesLabel(row.topSpecies, language, speciesMetaMap)}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-white/72 whitespace-nowrap">
                      {formatProbability(row.probabilityScore)}
                    </td>

                    <td className="px-3 py-3 text-white/72 whitespace-nowrap">
                      {row.assetCount}
                    </td>

                    <td className="px-3 py-3">
                      <Badge tone={stTone}>{row.ingestStatus || "—"}</Badge>
                    </td>

                    <td className="px-3 py-3">
                      <Link
                        href={eventHref}
                        className="text-amber-200 underline underline-offset-4 hover:text-amber-100"
                      >
                        {text.showDetails}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {totalEvents > 0 ? (
          <div className="flex flex-col gap-3 border-t border-white/8 px-3 py-3 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div>{paginationSummary}</div>
              {hasMoreThanMaxEvents ? (
                <div className="mt-1 text-xs text-white/45">
                  {text.cappedHint}
                </div>
              ) : null}
            </div>

            <nav
              className="flex flex-wrap items-center gap-1"
              aria-label={text.page}
            >
              {currentPage > 1 ? (
                <Link
                  href={buildIngestPageHref({
                    page: currentPage - 1,
                    revier: rawRevier,
                    camera: selectedCameraId,
                    from: fromDate,
                    to: toDate,
                  })}
                  className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:border-amber-300/30 hover:text-amber-100"
                >
                  {text.previousPage}
                </Link>
              ) : (
                <span className="rounded-full border border-white/8 px-3 py-1 text-white/25">
                  {text.previousPage}
                </span>
              )}

              {paginationPages.map((pageNumber) => {
                const isCurrentPage = pageNumber === currentPage;

                return isCurrentPage ? (
                  <span
                    key={pageNumber}
                    className="rounded-full border border-amber-300/35 bg-amber-300/15 px-3 py-1 font-medium text-amber-100"
                    aria-current="page"
                  >
                    {pageNumber}
                  </span>
                ) : (
                  <Link
                    key={pageNumber}
                    href={buildIngestPageHref({
                      page: pageNumber,
                      revier: rawRevier,
                      camera: selectedCameraId,
                      from: fromDate,
                      to: toDate,
                    })}
                    className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:border-amber-300/30 hover:text-amber-100"
                  >
                    {pageNumber}
                  </Link>
                );
              })}

              {currentPage < totalPages ? (
                <Link
                  href={buildIngestPageHref({
                    page: currentPage + 1,
                    revier: rawRevier,
                    camera: selectedCameraId,
                    from: fromDate,
                    to: toDate,
                  })}
                  className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:border-amber-300/30 hover:text-amber-100"
                >
                  {text.nextPage}
                </Link>
              ) : (
                <span className="rounded-full border border-white/8 px-3 py-1 text-white/25">
                  {text.nextPage}
                </span>
              )}
            </nav>
          </div>
        ) : null}
      </section>

      {apiError ? (
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.apiError}: {apiError}
        </div>
      ) : null}
    </main>
  );
}