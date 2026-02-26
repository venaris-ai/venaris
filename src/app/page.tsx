"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AssetRow = {
  id: string;
  storage_path: string;
  status: string;
  created_at: string;
  relevant: boolean;
};

type CameraRow = {
  id: string;
  name: string;
  import_method: string | null;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
  stale_after_minutes: number;
};

function healthEmoji(status?: string) {
  if (status === "online") return "🟢";
  if (status === "stale") return "🟡";
  if (status === "offline") return "🔴";
  return "⚪";
}

export default function Home() {
  const [cameraId, setCameraId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [onlyRelevant, setOnlyRelevant] = useState(false);
  const [cameras, setCameras] = useState<CameraRow[]>([]);

  async function loadUrls(items: AssetRow[]) {
    const next: Record<string, string> = {};

    for (const a of items) {
      try {
        const res = await fetch(
          `/api/asset-url?path=${encodeURIComponent(a.storage_path)}`
        );
        const json = await res.json();
        if (json.url) next[a.id] = json.url;
      } catch {
        // ignore
      }
    }

    setUrls(next);
  }

  async function loadCameras() {
    const res = await fetch("/api/camera-health", { cache: "no-store" });
    const json = await res.json();

    if (!res.ok) {
      setMsg(json.error || `HTTP ${res.status}`);
      return;
    }

    const list = (json.items ?? []) as CameraRow[];
    setCameras(list);

    if (!cameraId && list.length > 0) {
      setCameraId(list[0].id);
    }
  }

  async function loadAssets() {
    const res = await fetch(
      `/api/assets?onlyRelevant=${onlyRelevant ? "true" : "false"}`
    );
    const json = await res.json();

    if (!res.ok) {
      setMsg(json.error || `HTTP ${res.status}`);
      return;
    }

    const list = (json.assets ?? []) as AssetRow[];
    setAssets(list);
    await loadUrls(list);
  }

  useEffect(() => {
    loadCameras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyRelevant]);

  async function upload() {
    setMsg("");

    if (!file || !cameraId) {
      setMsg("Bitte file + Camera auswählen.");
      return;
    }

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("cameraId", cameraId);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      const text = await res.text();
      const json = JSON.parse(text);

      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setFile(null);
      setMsg("✅ Upload ok");
      await loadAssets();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    }
  }

  async function toggleRelevant(asset: AssetRow) {
    await fetch("/api/asset-relevant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: asset.id,
        relevant: !asset.relevant,
      }),
    });

    await loadAssets();
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Venaris</h1>
            <p className="text-sm text-gray-600">
              Debug Upload & Recent Assets
            </p>
          </div>

          <Link
            href="/cameras"
            className="rounded-md border px-3 py-2 text-sm"
          >
            Cameras →
          </Link>
        </div>

        <div className="rounded-xl border p-4 space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Camera</label>
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
          </div>

          <label className="inline-block cursor-pointer rounded-md border px-4 py-2">
            JPG auswählen
            <input
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {file && (
            <div className="text-sm text-gray-700">Ausgewählt: {file.name}</div>
          )}

          <button
            onClick={upload}
            className="rounded-md bg-black px-4 py-2 text-white"
          >
            Upload
          </button>

          {msg && <div className="text-sm">{msg}</div>}
        </div>

        <div className="rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-medium">Assets</h2>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyRelevant}
                  onChange={(e) => setOnlyRelevant(e.target.checked)}
                />
                Nur relevante anzeigen
              </label>

              <button
                onClick={loadAssets}
                className="rounded-md border px-3 py-1 text-sm"
              >
                Refresh
              </button>
            </div>
          </div>

          <ul className="space-y-4 text-sm">
            {assets.map((a) => (
              <li key={a.id} className="rounded-md border p-3">
                <div className="font-mono text-xs text-gray-500">{a.id}</div>

                <div className="break-all">{a.storage_path}</div>

                <div className="text-gray-600">
                  {a.status} · {new Date(a.created_at).toLocaleString()}
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs">
                    {a.relevant ? "✅ relevant" : "🚫 irrelevant"}
                  </span>

                  <button
                    onClick={() => toggleRelevant(a)}
                    className="rounded-md border px-3 py-1 text-xs"
                  >
                    {a.relevant ? "Irrelevant" : "Relevant"}
                  </button>
                </div>

                {urls[a.id] && (
                  <img
                    src={urls[a.id]}
                    alt="asset"
                    className="mt-3 w-full max-w-md rounded-md border"
                  />
                )}
              </li>
            ))}

            {assets.length === 0 && (
              <li className="text-gray-600">Noch keine Uploads.</li>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}