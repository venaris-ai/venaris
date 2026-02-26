"use client";

import { useEffect, useMemo, useState } from "react";

type CameraHealthRow = {
  id: string;
  name: string;
  import_method: string | null;
  last_seen_at: string | null;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
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

function healthEmoji(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "online") return "🟢";
  if (s === "stale") return "🟡";
  if (s === "offline") return "🔴";
  return "⚪";
}

function healthTone(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "online") return "border-green-300";
  if (s === "stale") return "border-yellow-300";
  if (s === "offline") return "border-red-300";
  return "border-gray-300";
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
  const [cameras, setCameras] = useState<CameraHealthRow[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [tokenByCameraId, setTokenByCameraId] = useState<Record<string, string | null>>({});
  const [loadingCameras, setLoadingCameras] = useState(false);

  const selected = useMemo(
    () => cameras.find((c) => c.id === cameraId) ?? null,
    [cameras, cameraId]
  );

  async function loadCameras() {
    setMsg("");
    setLoadingCameras(true);
    try {
      const res = await fetch("/api/camera-health", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setMsg(json.error || `HTTP ${res.status}`);
        return;
      }

      const list = (json.items ?? []) as CameraHealthRow[];
      setCameras(list);
      if (!cameraId && list.length > 0) setCameraId(list[0].id);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setLoadingCameras(false);
    }
  }

  // Tokens sind in camera-health nicht drin (bewusst). Wir holen token on-demand.
  async function loadToken(camId: string) {
    if (tokenByCameraId[camId] !== undefined) return; // already loaded
    try {
      const res = await fetch(`/api/cameras`); // existing route returns cameras list incl token? if not, we'll use fallback below
      const json = await res.json();
      if (res.ok && Array.isArray(json.cameras)) {
        const found = json.cameras.find((c: any) => c.id === camId);
        setTokenByCameraId((prev) => ({ ...prev, [camId]: found?.ingest_token ?? null }));
        return;
      }
    } catch {
      // ignore
    }
    // fallback: unknown token until regenerate is used
    setTokenByCameraId((prev) => ({ ...prev, [camId]: null }));
  }

  async function loadBatches(camId: string) {
    setMsg("");
    const res = await fetch(`/api/ingest-batches?cameraId=${encodeURIComponent(camId)}&limit=10`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error || `HTTP ${res.status}`);
      setBatches([]);
      return;
    }
    setBatches((json.items ?? []) as BatchRow[]);
  }

  async function loadAssets(camId: string) {
    setMsg("");
    const res = await fetch(`/api/assets?cameraId=${encodeURIComponent(camId)}&limit=3&onlyRelevant=false`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error || `HTTP ${res.status}`);
      setAssets([]);
      setAssetUrls({});
      return;
    }

    const list = (json.assets ?? []) as AssetRow[];
    setAssets(list);

    const urls: Record<string, string> = {};
    for (const a of list) {
      try {
        const ures = await fetch(`/api/asset-url?path=${encodeURIComponent(a.storage_path)}`);
        const ujson = await ures.json();
        if (ujson.url) urls[a.id] = ujson.url;
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
    loadToken(cameraId);
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
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }

    if (!res.ok || !json?.ok) {
      setMsg(json?.error || `HTTP ${res.status}`);
      return;
    }

    const newTok = json.camera.ingest_token as string;
    setTokenByCameraId((prev) => ({ ...prev, [selected.id]: newTok }));
    setMsg("✅ Token aktualisiert");
  }

  const tok = selected ? tokenByCameraId[selected.id] : null;
  const ingestHeader = tok ? `x-ingest-token: ${tok}` : "";
  const curlSingle = tok
    ? `curl -X POST "http://localhost:3000/api/ingest" -H "${ingestHeader}" -F "file=@/c/dev/test.jpg"`
    : "";
  const curlMulti = tok
    ? `curl -X POST "http://localhost:3000/api/ingest" -H "${ingestHeader}" -F "files=@/c/dev/a.jpg" -F "files=@/c/dev/b.jpg"`
    : "";

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Cameras</h1>
            <p className="text-sm text-gray-600">Onboarding, Tokens, Health, letzte Ingest-Batches</p>
          </div>
          <a href="/" className="rounded-md border px-3 py-2 text-sm">
            ← Home
          </a>
        </div>

        {/* Camera picker */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Kamera auswählen</label>
            <button
              onClick={loadCameras}
              className="rounded-md border px-3 py-1.5 text-sm"
              type="button"
              disabled={loadingCameras}
            >
              {loadingCameras ? "Loading…" : "Refresh"}
            </button>
          </div>

          <select
            className="w-full rounded-md border p-2"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
          >
            {cameras.length === 0 && <option value="">(keine Kameras)</option>}
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {healthEmoji(c.health_status)} {c.name}
                {c.import_method ? ` · ${c.import_method}` : ""}
              </option>
            ))}
          </select>

          {selected && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Health</div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                      healthTone(selected.health_status),
                    ].join(" ")}
                  >
                    {selected.health_status}
                  </span>
                  <span className="text-sm text-gray-700">
                    Last seen: <span className="font-medium">{formatAgo(selected.last_seen_at)}</span>
                    {selected.last_seen_at ? ` (${new Date(selected.last_seen_at).toLocaleString()})` : ""}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Token</div>
                <div className="mt-1 font-mono text-xs break-all">{tok ?? "—"}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      if (!tok) return;
                      const ok = await copy(tok);
                      setMsg(ok ? "✅ Token kopiert" : "❌ Copy nicht möglich");
                    }}
                    className="rounded-md border px-3 py-1.5 text-sm"
                    disabled={!tok}
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
              disabled={!curlSingle}
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
              disabled={!curlMulti}
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
                    // eslint-disable-next-line @next/next/no-img-element
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