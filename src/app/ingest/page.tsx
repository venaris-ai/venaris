// src/app/ingest/page.tsx
export const dynamic = "force-dynamic";

import { supabaseServer } from "@/lib/supabaseServer";
import { requireActiveOrganization } from "@/lib/auth";

type Batch = {
  id: string;
  camera_id: string;
  received_at: string;
  source: string | null;
  file_count: number | null;
  status: string | null;
  error_summary: string | null;
  meta: any;
  cameras?: { id: string; name: string } | null;
};

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
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
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
  if (s === "completed" || s === "ok" || s === "success" || s === "done") return "ok" as const;
  if (s === "error" || s === "failed") return "err" as const;
  if (s === "processing" || s === "running") return "warn" as const;
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

export default async function IngestPage() {
  const { activeMembership } = await requireActiveOrganization();
  const activeOrganization = activeMembership.organizations;

  let items: Batch[] = [];
  let apiError: string | null = null;

  if (!activeOrganization) {
    apiError = "active organization not found";
  } else {
    const supabase = supabaseServer();

    const { data: cameras, error: camerasError } = await supabase
      .from("cameras")
      .select("id")
      .eq("organization_id", activeOrganization.id);

    if (camerasError) {
      apiError = camerasError.message;
    } else {
      const allowedCameraIds = (cameras ?? []).map((c) => c.id);

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
          items = (data ?? []) as Batch[];
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ingest Monitoring</h1>
        <a
          href="/ingest"
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          title="Reload page"
        >
          Refresh
        </a>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
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
              items.map((b) => {
                const stTone = statusTone(b.status);
                const srcTone = sourceTone(b.source);
                const errTone = errorTone(b.status, b.error_summary);

                const errClass =
                  errTone === "err"
                    ? "text-red-700 font-medium"
                    : errTone === "warn"
                    ? "text-yellow-700 font-medium"
                    : "text-gray-400";

                return (
                  <tr key={b.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                      {formatUtcTimestamp(b.received_at)}
                    </td>

                    <td className="px-3 py-2">
                      <Badge tone={srcTone}>{b.source || "-"}</Badge>
                    </td>

                    <td className="px-3 py-2">{b.cameras?.name || b.camera_id || "-"}</td>

                    <td className="px-3 py-2">{b.file_count ?? "-"}</td>

                    <td className="px-3 py-2">
                      <Badge tone={stTone}>{b.status || "-"}</Badge>
                    </td>

                    <td className={`px-3 py-2 ${errClass}`}>
                      {b.error_summary ? b.error_summary : <span className="text-gray-400">-</span>}
                    </td>

                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {b.id.slice(0, 8)}…
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {apiError && (
        <p className="mt-3 text-sm text-red-700">API error: {apiError}</p>
      )}
    </div>
  );
}