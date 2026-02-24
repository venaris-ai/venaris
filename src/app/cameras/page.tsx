"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type CameraRow = {
  id: string;
  name: string;
  location_name: string | null;
  import_method: string | null;
  ingest_token: string | null;
  last_seen_at: string | null;
  created_at: string;
};

type BatchRow = {
  id: string;
  camera_id: string;
  received_at: string;
  source: string | null;
  file_count: number | null;
  status: string | null;
  error_summary: string | null;
};

type AssetRow = {
  id: string;
  camera_id: string;
  storage_path: string;
  created_at: string;
};

function formatAgo(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 2) return "gerade eben";
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} h`;
  const days = Math.floor(h / 24);
  return `vor ${days} d`;
}

function health(ts: string | null) {
  if (!ts) return { label: "unknown", hint: "noch keine Daten", level: "neutral" as const };
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const minutes = diffMs / 60000;
  if (minutes <= 60) return { label: "online", hint: "letztes Signal < 1h", level: "good" as const };
  if (minutes <= 24 * 60) return { label: "warn", hint: "letztes Signal < 24h", level: "warn" as const };
  return { label: "offline", hint: "letztes Signal ≥ 24h", level: "bad" as const };
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  const selected = useMemo(
    () => cameras.find((c) => c.id === cameraId) ?? null,
    [cameras, cameraId]
  );

  async function loadCameras() {
    setMsg("");
    const { data, error } = await supabase
      .from("cameras")
      .select("id, name, location_name, import_method, ingest_token, last_seen_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      return;
    }

    const list = (data ?? []) as CameraRow[];
    setCameras(list);
    if (!cameraId && list.length > 0) setCameraId(list[0].id);
  }

  async function loadBatches(camId: string) {
    const { data, error } = await supabase
      .from("ingest_batches")
      .select("id, camera_id, received_at, source, file_count, status, error_summary")
      .eq("camera_id", camId)
      .order("received_at", { ascending: false })
      .limit(10);

    if (error) {
      setMsg(error.message);
      return;
    }
    setBatches((data ?? []) as BatchRow[]);
  }

  async function loadAssets(camId: string) {
    const { data, error } = await supabase
      .from("assets")
      .select("id, camera_id, storage_path, created_at")
      .eq("camera_id", camId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      setMsg(error.message);
      return;
    }
    const list = (data ?? []) as AssetRow[];
    setAssets(list);

    const urls: Record<string, string> = {};
    for (const a of list) {
      try {
        const res = await fetch(`/api/asset-url?path=${encodeURIComponent(a.storage_path)}`);
        const json = await res.json();
        if (json.url) urls[a.id] = json.url;
      } catch {
        // ignore
      }
    }
    setAssetUrls(urls);
  }

  useEffect(() => {
    loadCameras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cameraId) return;
    loadBatches(cameraId);
    loadAssets(cameraId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  async function regenerateToken() {
    if (!selected) return;
    setMsg("");
    const res = await fetch("/api/camera-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraId: selected.id }),
    });

    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }

    if (!res.ok || !json?.ok) {
      setMsg(json?.error || `HTTP ${res.status}`);
      return;
    }

    // update local state
    const newTok = json.camera.ingest_token as string;
    setCameras((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, ingest_token: newTok } : c))
    );

    setMsg("✅ Token aktualisiert");
  }

  const ingestHeader = selected?.ingest_token ? `x-ingest-token: ${selected.ingest_token}` : "";
  const curlSingle = selected?.ingest_token
    ? `curl -X POST "http://localhost:3000/api/ingest" -H "${ingestHeader}" -F "file=@/c/dev/test.jpg"`
    : "";
  const curlMulti = selected?.ingest_token
    ? `curl -X POST "http://localhost:3000/api/ingest" -H "${ingestHeader}" -F "files=@/c/dev/a.jpg" -F "files=@/c/dev/b.jpg"`
    : "";

  const h = health(selected?.last_seen_at ?? null);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Cameras</h1>
            <p className="text-sm text-gray-600">Onboarding, Tokens, Health, letzte Ingest-Batches</p>
          </div>
          <a href="/" className="rounded-md border px-3 py-2 text-sm">← Home</a>
        </div>

        {/* Camera picker */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Kamera auswählen</label>
            <select
              className="w-full rounded-md border p-2"
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
            >
              {cameras.length === 0 && <option value="">(keine Kameras)</option>}
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.location_name ? `– ${c.location_name}` : ""}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Health</div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                      h.level === "good" ? "border-green-300" : "",
                      h.level === "warn" ? "border-yellow-300" : "",
                      h.level === "bad" ? "border-red-300" : "",
                      h.level === "neutral" ? "border-gray-300" : "",
                    ].join(" ")}
                  >
                    {h.label}
                  </span>
                  <span className="text-sm text-gray-700">{h.hint}</span>
                </div>
                <div className="mt-2 text-sm text-gray-700">
                  Last seen: <span className="font-medium">{formatAgo(selected.last_seen_at)}</span>
                  {selected.last_seen_at ? ` (${new Date(selected.last_seen_at).toLocaleString()})` : ""}
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Token</div>
                <div className="mt-1 font-mono text-xs break-all">{selected.ingest_token ?? "—"}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      if (!selected.ingest_token) return;
                      const ok = await copy(selected.ingest_token);
                      setMsg(ok ? "✅ Token kopiert" : "❌ Copy nicht möglich");
                    }}
                    className="rounded-md border px-3 py-1.5 text-sm"
                  >
                    Copy token
                  </button>

                  <button
                    onClick={regenerateToken}
                    className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
                  >
                    Regenerate token
                  </button>
                </div>
              </div>
            </div>
          )}

          {msg && <div className="text-sm">{msg}</div>}
        </div>

        {/* curl snippets */}
        <div className="rounded-xl border p-4 space-y-3">
          <h2 className="text-xl font-medium">Ingestion examples (curl)</h2>

          <div className="space-y-2">
            <div className="text-xs text-gray-500">Single file</div>
            <pre className="overflow-auto rounded-md border p-3 text-xs">{curlSingle || "—"}</pre>
            <button
              onClick={async () => {
                if (!curlSingle) return;
                const ok = await copy(curlSingle);
                setMsg(ok ? "✅ curl (single) kopiert" : "❌ Copy nicht möglich");
              }}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Copy curl (single)
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-gray-500">Multiple files</div>
            <pre className="overflow-auto rounded-md border p-3 text-xs">{curlMulti || "—"}</pre>
            <button
              onClick={async () => {
                if (!curlMulti) return;
                const ok = await copy(curlMulti);
                setMsg(ok ? "✅ curl (multi) kopiert" : "❌ Copy nicht möglich");
              }}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Copy curl (multi)
            </button>
          </div>

          <div className="text-xs text-gray-600">
            Hinweis: Pfade sind Git-Bash Syntax (z.B. <span className="font-mono">/c/dev/test.jpg</span>).
          </div>
        </div>

        {/* Recent batches + assets */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h2 className="text-xl font-medium mb-3">Letzte Batches</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Zeit</th>
                    <th className="py-2 pr-3">Files</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(b.received_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">{b.file_count ?? "—"}</td>
                      <td className="py-2 pr-3">{b.status ?? "—"}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600 break-all">
                        {b.error_summary ?? ""}
                      </td>
                    </tr>
                  ))}
                  {batches.length === 0 && (
                    <tr>
                      <td className="py-2 text-gray-600" colSpan={4}>
                        Keine Batches.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <h2 className="text-xl font-medium mb-3">Letzte Assets</h2>

            <div className="space-y-3">
              {assets.map((a) => (
                <div key={a.id} className="rounded-md border p-3">
                  <div className="text-xs text-gray-500 font-mono break-all">{a.id}</div>
                  <div className="text-xs text-gray-600">{new Date(a.created_at).toLocaleString()}</div>

                  {assetUrls[a.id] && (
                    <img
                      src={assetUrls[a.id]}
                      alt="asset"
                      className="mt-2 w-full max-w-md rounded-md border"
                    />
                  )}
                </div>
              ))}

              {assets.length === 0 && (
                <div className="text-sm text-gray-600">Keine Assets.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}