"use client";

import { useEffect, useMemo, useState } from "react";

type CameraHealthRow = {
  id: string;
  name: string;
  import_method: string | null;
  last_seen_at: string | null;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
  stale_after_minutes: number;
  offline_after_minutes: number;
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

function healthEmoji(status?: string) {
  if (status === "online") return "🟢";
  if (status === "stale") return "🟡";
  if (status === "offline") return "🔴";
  return "⚪";
}

function healthTone(status?: string) {
  if (status === "online") return "border-green-300";
  if (status === "stale") return "border-yellow-300";
  if (status === "offline") return "border-red-300";
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

  async function loadToken(camId: string) {
    if (tokenByCameraId[camId] !== undefined) return;

    try {
      const res = await fetch(
        `/api/camera-token?cameraId=${encodeURIComponent(camId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!res.ok) {
        setTokenByCameraId((prev) => ({ ...prev, [camId]: null }));
        return;
      }

      setTokenByCameraId((prev) => ({
        ...prev,
        [camId]: json.ingest_token ?? null,
      }));
    } catch {
      setTokenByCameraId((prev) => ({ ...prev, [camId]: null }));
    }
  }

  async function loadBatches(camId: string) {
    const res = await fetch(
      `/api/ingest-batches?cameraId=${encodeURIComponent(camId)}&limit=10`,
      { cache: "no-store" }
    );
    const json = await res.json();

    if (!res.ok) {
      setMsg(json.error || `HTTP ${res.status}`);
      setBatches([]);
      return;
    }

    setBatches((json.items ?? []) as BatchRow[]);
  }

  async function loadAssets(camId: string) {
    const res = await fetch(
      `/api/assets?cameraId=${encodeURIComponent(camId)}&limit=3&onlyRelevant=false`,
      { cache: "no-store" }
    );
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
        const ures = await fetch(
          `/api/asset-url?path=${encodeURIComponent(a.storage_path)}`
        );
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
    } catch {}

    if (!res.ok || !json?.ok) {
      setMsg(json?.error || `HTTP ${res.status}`);
      return;
    }

    const newTok = json.ingest_token as string;
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
            <p className="text-sm text-gray-600">
              Onboarding, Tokens, Health, letzte Ingest-Batches
            </p>
          </div>
          <a href="/" className="rounded-md border px-3 py-2 text-sm">
            ← Home
          </a>
        </div>

        <div className="rounded-xl border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              Kamera auswählen
            </label>
            <button
              onClick={loadCameras}
              className="rounded-md border px-3 py-1.5 text-sm"
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-xs text-gray-500">Health</div>

                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs border font-medium",
                      healthTone(selected.health_status),
                    ].join(" ")}
                  >
                    {healthEmoji(selected.health_status)}{" "}
                    {selected.health_status}
                  </span>
                </div>

                <div className="mt-2 text-sm text-gray-700">
                  Last seen:{" "}
                  <span className="font-medium">
                    {formatAgo(selected.last_seen_at)}
                  </span>
                  {selected.last_seen_at
                    ? ` (${new Date(selected.last_seen_at).toLocaleString()})`
                    : ""}
                </div>

                <div className="mt-3 text-xs text-gray-600 space-y-1">
                  <div>
                    Expected every{" "}
                    <span className="font-medium">
                      {selected.stale_after_minutes} min
                    </span>
                  </div>
                  <div>
                    Offline after{" "}
                    <span className="font-medium">
                      {selected.offline_after_minutes} min
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-xs text-gray-500">Token</div>
                <div className="mt-1 font-mono text-xs break-all">
                  {tok ?? "—"}
                </div>

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
      </div>
    </main>
  );
}