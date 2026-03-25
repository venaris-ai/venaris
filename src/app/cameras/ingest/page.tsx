// src/app/cameras/ingest/page.tsx #2
export const dynamic = "force-dynamic";

import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";

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
      ? "bg-green-100 text-green-800"
      : tone === "warn"
      ? "bg-yellow-100 text-yellow-800"
      : tone === "err"
      ? "bg-red-100 text-red-800"
      : "bg-gray-100 text-gray-800";

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
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

export default async function CamerasIngestPage() {
  const ctx = await requirePathAccess("/cameras/ingest");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const activeOrganization = ctx.activeMembership.organizations;

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  const supabase = supabaseServer();

  let items: Batch[] = [];
  let apiError: string | null = null;

  const { data: cameras, error: camerasError } = await supabase
    .from("cameras")
    .select("id")
    .eq("organization_id", activeOrganization.id);

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

  return (
    <main className="space-y-6">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Ingest Monitoring
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Überblick über die letzten Ingest-Batches der aktiven Organisation.
          </p>
        </div>

        <a
          href="/cameras/ingest"
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          title="Reload page"
        >
          Refresh
        </a>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left">
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
                <td className="px-3 py-6 text-gray-500" colSpan={7}>
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
                    ? "font-medium text-red-700"
                    : errTone === "warn"
                    ? "font-medium text-yellow-700"
                    : "text-gray-400";

                return (
                  <tr key={batch.id} className="border-b last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {formatUtcTimestamp(batch.received_at)}
                    </td>

                    <td className="px-3 py-2">
                      <Badge tone={srcTone}>{batch.source || "-"}</Badge>
                    </td>

                    <td className="px-3 py-2">
                      {batch.camera?.name || batch.camera_id || "-"}
                    </td>

                    <td className="px-3 py-2">{batch.file_count ?? "-"}</td>

                    <td className="px-3 py-2">
                      <Badge tone={stTone}>{batch.status || "-"}</Badge>
                    </td>

                    <td className={`px-3 py-2 ${errClass}`}>
                      {batch.error_summary ? (
                        batch.error_summary
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
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
        <p className="text-sm text-red-700">API error: {apiError}</p>
      ) : null}
    </main>
  );
}