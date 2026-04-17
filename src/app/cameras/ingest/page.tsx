// src/app/cameras/ingest/page.tsx #10
export const dynamic = "force-dynamic";

import Link from "next/link";
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
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      activeOrganizationContextRequired: "Active organization context required",
      activeOrganizationNotFound: "Active organization not found",
      allActiveGrounds: "All active grounds",
      oneGround: "One ground",
      eyebrow: "Ingest",
      title: "Ingest",
      intro: "Clean overview of processed inputs in the current scope.",
      time: "Time",
      camera: "Camera",
      channel: "Channel",
      result: "Result",
      truth: "Truth",
      status: "Status",
      details: "Details",
      noEntries: "No processed inputs with event available yet.",
      until: "until",
      unnamedCamera: "Unnamed camera",
      showDetails: "Show details",
      apiError: "API error",
      prettyUnknown: "—",
      completed: "completed",
      processing: "processing",
      failed: "failed",
    };
  }

  return {
    activeOrganizationContextRequired: "Aktiver Organisationskontext erforderlich",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden",
    allActiveGrounds: "Alle aktiven Reviere",
    oneGround: "Ein Revier",
    eyebrow: "Ingest",
    title: "Ingest",
    intro: "Bereinigte Übersicht der verarbeiteten Eingänge im aktuellen Scope.",
    time: "Zeit",
    camera: "Kamera",
    channel: "Kanal",
    result: "Ergebnis",
    truth: "Wahr",
    status: "Status",
    details: "Details",
    noEntries: "Noch keine verarbeiteten Eingänge mit Event vorhanden.",
    until: "bis",
    unnamedCamera: "Unbenannte Kamera",
    showDetails: "Details anzeigen",
    apiError: "API Fehler",
    prettyUnknown: "—",
    completed: "abgeschlossen",
    processing: "in Bearbeitung",
    failed: "fehlgeschlagen",
  };
}

type SearchParams = {
  revier?: string;
};

type RevierRow = {
  id: string;
  name: string;
};

type BatchDb = {
  id: string;
  camera_id: string;
  received_at: string;
  source: string | null;
  file_count: number | null;
  status: string | null;
  error_summary: string | null;
  cameras:
    | {
        id: string;
        name: string | null;
      }[]
    | null;
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

type EventAssetRow = {
  event_id: string;
  asset_id: string;
};

type EventFeedRow = {
  id: string;
  camera_id: string;
  start_at: string | null;
  end_at: string | null;
  asset_count: number | null;
  top_species: string | null;
  top_count: number | null;
  relevance_score: number | null;
};

type IngestEventRow = {
  eventId: string;
  batchId: string;
  cameraName: string | null;
  receivedAt: string;
  source: string | null;
  ingestStatus: string | null;
  errorSummary: string | null;
  fileCount: number | null;
  startAt: string | null;
  endAt: string | null;
  assetCount: number;
  topSpecies: string | null;
  topCount: number | null;
  relevanceScore: number | null;
};

function normalizeBatch(row: BatchDb): Batch {
  return {
    id: row.id,
    cameraId: row.camera_id,
    cameraName: row.cameras?.[0]?.name ?? null,
    receivedAt: row.received_at,
    source: row.source,
    fileCount: row.file_count,
    status: row.status,
    errorSummary: row.error_summary,
  };
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

function errorTone(status?: string | null, error?: string | null) {
  if (!error) return "muted" as const;
  if (statusTone(status) === "err") return "err" as const;
  return "warn" as const;
}

function formatDateTime(value: string | null | undefined, language: AppLanguage) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString(language === "en" ? "en-GB" : "de-DE");
}

function formatProbability(value?: number | null) {
  if (typeof value !== "number") return "—";
  return `${Math.round(value * 100)}%`;
}

function sortRows(rows: IngestEventRow[]) {
  return [...rows].sort((a, b) => {
    const aTs = new Date(a.endAt ?? a.startAt ?? a.receivedAt).getTime();
    const bTs = new Date(b.endAt ?? b.startAt ?? b.receivedAt).getTime();
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

  let items: IngestEventRow[] = [];
  let apiError: string | null = null;
  let scopeLabel = text.allActiveGrounds;

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    apiError = reviersError.message;
  } else {
    const reviers = (reviersData ?? []) as RevierRow[];
    const allowedReviers: RevierOption[] = reviers.map((revier) => ({
      id: revier.id,
      name: revier.name,
    }));
    const revierScope = resolveRevierScope(rawRevier, allowedReviers);
    const allowedRevierIds = allowedReviers.map((revier) => revier.id);

    if (revierScope.type === "single") {
      scopeLabel =
        reviers.find((revier) => revier.id === revierScope.revierId)?.name ??
        text.oneGround;
    }

    if (allowedRevierIds.length > 0) {
      let camerasQuery = supabase
        .from("cameras")
        .select("id")
        .eq("organization_id", activeOrganization.id);

      camerasQuery =
        revierScope.type === "single"
          ? camerasQuery.eq("revier_id", revierScope.revierId)
          : camerasQuery.in("revier_id", allowedRevierIds);

      const { data: cameras, error: camerasError } = await camerasQuery;

      if (camerasError) {
        apiError = camerasError.message;
      } else {
        const allowedCameraIds = (cameras ?? []).map((camera) => camera.id);

        if (allowedCameraIds.length > 0) {
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
            .in("camera_id", allowedCameraIds)
            .order("received_at", { ascending: false })
            .limit(50);

          if (batchError) {
            apiError = batchError.message;
          } else {
            const batches = ((batchData ?? []) as BatchDb[]).map(normalizeBatch);
            const batchIds = batches.map((batch) => batch.id);

            if (batchIds.length > 0) {
              const { data: assetsData, error: assetsError } = await supabase
                .from("assets")
                .select("id,ingest_batch_id")
                .in("ingest_batch_id", batchIds);

              if (assetsError) {
                apiError = assetsError.message;
              } else {
                const assets = (assetsData ?? []) as AssetRow[];
                const assetIds = assets.map((asset) => asset.id);

                if (assetIds.length > 0) {
                  const { data: eventAssetsData, error: eventAssetsError } =
                    await supabase
                      .from("event_assets")
                      .select("event_id,asset_id")
                      .in("asset_id", assetIds);

                  if (eventAssetsError) {
                    apiError = eventAssetsError.message;
                  } else {
                    const eventAssets = (eventAssetsData ?? []) as EventAssetRow[];
                    const eventIds = Array.from(
                      new Set(eventAssets.map((row) => row.event_id).filter(Boolean))
                    );

                    if (eventIds.length > 0) {
                      const { data: eventsData, error: eventsError } = await supabase
                        .from("event_feed")
                        .select(
                          "id,camera_id,start_at,end_at,asset_count,top_species,top_count,relevance_score"
                        )
                        .in("id", eventIds);

                      if (eventsError) {
                        apiError = eventsError.message;
                      } else {
                        const events = (eventsData ?? []) as EventFeedRow[];

                        const batchById = new Map(
                          batches.map((batch) => [batch.id, batch] as const)
                        );
                        const batchIdByAssetId = new Map<string, string>();
                        const eventIdsByBatchId = new Map<string, Set<string>>();
                        const eventById = new Map(
                          events.map((event) => [event.id, event] as const)
                        );

                        for (const asset of assets) {
                          if (!asset.ingest_batch_id) continue;
                          batchIdByAssetId.set(asset.id, asset.ingest_batch_id);
                        }

                        for (const row of eventAssets) {
                          const batchId = batchIdByAssetId.get(row.asset_id);
                          if (!batchId) continue;

                          if (!eventIdsByBatchId.has(batchId)) {
                            eventIdsByBatchId.set(batchId, new Set<string>());
                          }

                          eventIdsByBatchId.get(batchId)?.add(row.event_id);
                        }

                        const resolvedRows: IngestEventRow[] = [];

                        for (const [batchId, ids] of eventIdsByBatchId.entries()) {
                          const batch = batchById.get(batchId);
                          if (!batch) continue;

                          for (const eventId of ids) {
                            const event = eventById.get(eventId);
                            if (!event) continue;

                            resolvedRows.push({
                              eventId: event.id,
                              batchId: batch.id,
                              cameraName: batch.cameraName,
                              receivedAt: batch.receivedAt,
                              source: batch.source,
                              ingestStatus: batch.status,
                              errorSummary: batch.errorSummary,
                              fileCount: batch.fileCount,
                              startAt: event.start_at,
                              endAt: event.end_at,
                              assetCount: event.asset_count ?? 0,
                              topSpecies: event.top_species,
                              topCount: event.top_count,
                              relevanceScore: event.relevance_score,
                            });
                          }
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
  }

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              {text.eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {text.title}
            </h1>
            <p className="mt-2 text-sm text-white/68">{text.intro}</p>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
            {scopeLabel}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-white/8 bg-white/5 text-left text-white/55">
            <tr>
              <th className="px-3 py-2">{text.time}</th>
              <th className="px-3 py-2">{text.camera}</th>
              <th className="px-3 py-2">{text.channel}</th>
              <th className="px-3 py-2">{text.result}</th>
              <th className="px-3 py-2">{text.truth}</th>
              <th className="px-3 py-2">{text.status}</th>
              <th className="px-3 py-2">{text.details}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-white/45" colSpan={7}>
                  {text.noEntries}
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const stTone = statusTone(row.ingestStatus);
                const srcTone = sourceTone(row.source);
                const errTone = errorTone(row.ingestStatus, row.errorSummary);

                const errorClass =
                  errTone === "err"
                    ? "text-rose-200"
                    : errTone === "warn"
                      ? "text-amber-200"
                      : "text-white/72";

                return (
                  <tr
                    key={`${row.batchId}:${row.eventId}`}
                    className="border-b border-white/8 last:border-b-0"
                  >
                    <td className="px-3 py-3 text-white/72 whitespace-nowrap">
                      <div>{formatDateTime(row.startAt ?? row.receivedAt, language)}</div>
                      {row.endAt && row.endAt !== row.startAt ? (
                        <div className="text-xs text-white/45">
                          {text.until} {formatDateTime(row.endAt, language)}
                        </div>
                      ) : null}
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
                      {row.errorSummary ? (
                        <div className={`mt-1 text-xs ${errorClass}`}>{row.errorSummary}</div>
                      ) : null}
                    </td>

                    <td className="px-3 py-3 text-white/72 whitespace-nowrap">
                      {formatProbability(row.relevanceScore)}
                    </td>

                    <td className="px-3 py-3">
                      <Badge tone={stTone}>{row.ingestStatus || "—"}</Badge>
                    </td>

                    <td className="px-3 py-3">
                      <Link
                        href={`/cameras/events/${row.eventId}`}
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
      </section>

      {apiError ? (
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.apiError}: {apiError}
        </div>
      ) : null}
    </main>
  );
}