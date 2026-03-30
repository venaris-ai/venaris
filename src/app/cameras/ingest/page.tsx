// src/app/cameras/ingest/page.tsx #4
export const dynamic = "force-dynamic";

import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

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
  meta: Record<string, unknown> | null;
  cameras:
    | {
        id: string;
        name: string;
      }[]
    | null;
};

type Batch = {
  id: string;
  camera_id: string;
  received_at: string;
  source: string | null;
  file_count: number | null;
  status: string | null;
  error_summary: string | null;
  meta: Record<string, unknown> | null;
  camera:
    | {
        id: string;
        name: string;
      }
    | null;
};

function normalizeBatch(row: BatchDb): Batch {
  return {
    id: row.id,
    camera_id: row.camera_id,
    received_at: row.received_at,
    source: row.source,
    file_count: row.file_count,
    status: row.status,
    error_summary: row.error_summary,
    meta: row.meta,
    camera: row.cameras?.[0] ?? null,
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

function isTerminalErr(status?: string | null) {
  const s = (status || "").toLowerCase();
  return s === "failed" || s === "error";
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
  if (isTerminalErr(status)) return "err" as const;
  return "warn" as const;
}

function formatUtcTimestamp(value?: string | null) {
  if (!value) return "-";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default async function CamerasIngestPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/cameras/ingest");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const activeOrganization = ctx.activeMembership.organizations;
  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;
  const rawRevier = searchParams?.revier;

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  const supabase = supabaseServer();

  let items: Batch[] = [];
  let apiError: string | null = null;
  let scopeLabel = "Alle aktiven Reviere";

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
        "Ein Revier";
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
          const { data, error } = await supabase
            .from("ingest_batches")
            .select(
              `
              id,
              camera_id,
              received_at,
              source,
              file_count,
              status,
              error_summary,
              meta,
              cameras ( id, name )
              `
            )
            .in("camera_id", allowedCameraIds)
            .order("received_at", { ascending: false })
            .limit(50);

          if (error) {
            apiError = error.message;
          } else {
            items = ((data ?? []) as BatchDb[]).map(normalizeBatch);
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
              Ingest Monitoring
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Ingest Monitoring
            </h1>
            <p className="mt-2 text-sm text-white/68">
              Überblick über die letzten Ingest-Batches der aktiven Organisation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
              {scopeLabel}
            </div>
            <a
              href="/cameras/ingest"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
              title="Reload page"
            >
              Refresh
            </a>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-white/8 bg-white/5 text-left text-white/55">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Camera</th>
              <th className="px-3 py-2">Files</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Info / Error</th>
              <th className="px-3 py-2">Batch</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-white/45" colSpan={7}>
                  No ingest batches yet.
                </td>
              </tr>
            ) : (
              items.map((batch) => {
                const stTone = statusTone(batch.status);
                const srcTone = sourceTone(batch.source);
                const errTone = errorTone(batch.status, batch.error_summary);

                const errClass =
                  errTone === "err"
                    ? "font-medium text-rose-200"
                    : errTone === "warn"
                      ? "font-medium text-amber-200"
                      : "text-white/35";

                return (
                  <tr key={batch.id} className="border-b border-white/8 last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-2 text-white/72">
                      {formatUtcTimestamp(batch.received_at)}
                    </td>

                    <td className="px-3 py-2">
                      <Badge tone={srcTone}>{batch.source || "-"}</Badge>
                    </td>

                    <td className="px-3 py-2 text-white">
                      {batch.camera?.name || batch.camera_id || "-"}
                    </td>

                    <td className="px-3 py-2 text-white/72">{batch.file_count ?? "-"}</td>

                    <td className="px-3 py-2">
                      <Badge tone={stTone}>{batch.status || "-"}</Badge>
                    </td>

                    <td className={`px-3 py-2 ${errClass}`}>
                      {batch.error_summary ? (
                        batch.error_summary
                      ) : (
                        <span className="text-white/35">-</span>
                      )}
                    </td>

                    <td className="px-3 py-2 font-mono text-xs text-white/55">
                      {batch.id.slice(0, 8)}…
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
          API error: {apiError}
        </div>
      ) : null}
    </main>
  );
}