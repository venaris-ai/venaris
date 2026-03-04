"use client";

import { useEffect, useMemo, useState } from "react";

type AssetRow = {
  id: string;
  camera_id: string;
  storage_path: string;
  status: string;
  created_at: string;

  relevant: boolean | null;
  relevant_effective: boolean;
  empty: boolean | null;
  empty_confidence: number | null;
};

type CameraRow = {
  id: string;
  name: string;
  import_method: string | null;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
};

function healthEmoji(status?: string) {
  if (status === "online") return "🟢";
  if (status === "stale") return "🟡";
  if (status === "offline") return "🔴";
  return "⚪";
}

function relevanceLabel(a: AssetRow) {
  // User-Override dominiert (relevant=true/false)
  if (a.relevant === true) return { text: "✅ relevant (manuell)", kind: "ok" as const };
  if (a.relevant === false) return { text: "🚫 irrelevant (manuell)", kind: "bad" as const };

  // sonst AI/Default
  if (a.empty === true) {
    const pct =
      typeof a.empty_confidence === "number"
        ? ` (${Math.round(a.empty_confidence * 100)}%)`
        : "";
    return { text: `🚫 leer erkannt${pct}`, kind: "bad" as const };
  }

  return { text: "✅ relevant", kind: "ok" as const };
}

export default function Home() {
  const [cameraId, setCameraId] = useState<string>(""); // "" => alle
  const [file, setFile] = useState<File | null>(null);

  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const [onlyRelevant, setOnlyRelevant] = useState(false);
  const [msg, setMsg] = useState("");

  const limit = 30;

  async function loadUrls(items: AssetRow[]) {
    const next: Record<string, string> = {};
    for (const a of items) {
      try {
        const res = await fetch(`/api/asset-url?path=${encodeURIComponent(a.storage_path)}`);
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

    setCameras((json.items ?? []) as CameraRow[]);
  }

  async function loadAssets() {
    setMsg("");

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (cameraId) params.set("cameraId", cameraId);
    if (onlyRelevant) params.set("onlyRelevant", "true");

    const res = await fetch(`/api/assets?${params.toString()}`, { cache: "no-store" });
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
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyRelevant, cameraId]);

  async function upload() {
    setMsg("");

    if (!file) {
      setMsg("Bitte JPG auswählen.");
      return;
    }

    // Upload braucht eine Kamera: wir erlauben Upload nur wenn ausgewählt
    if (!cameraId) {
      setMsg("Bitte Kamera auswählen (für Upload).");
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

  async function setRelevant(assetId: string, nextRelevant: boolean) {
    await fetch("/api/asset-relevant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, relevant: nextRelevant }),
    });
    await loadAssets();
  }

  const cameraOptions = useMemo(() => {
    return [
      { id: "", label: "Alle Kameras" },
      ...cameras.map((c) => ({
        id: c.id,
        label: `${healthEmoji(c.health_status)} ${c.name}${c.import_method ? ` · ${c.import_method}` : ""}`,
      })),
    ];
  }, [cameras]);

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Venaris</h1>
        <p className="text-sm text-gray-600">Debug Upload & Recent Assets</p>
      </div>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Camera</label>
          <select
            className="w-full rounded-md border p-2"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
          >
            {cameraOptions.map((o) => (
              <option key={o.id || "all"} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500">
            Hinweis: Upload funktioniert nur mit ausgewählter Kamera (nicht “Alle Kameras”).
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-block cursor-pointer rounded-md border px-4 py-2">
            JPG auswählen
            <input
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <button
            onClick={upload}
            className="rounded-md bg-black px-4 py-2 text-white"
          >
            Upload
          </button>
        </div>

        {file && <div className="text-sm text-gray-700">Ausgewählt: {file.name}</div>}
        {msg && <div className="text-sm">{msg}</div>}
      </section>

      <section className="rounded-xl border p-4">
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
          {assets.map((a) => {
            const rel = relevanceLabel(a);
            const showRelevant = a.relevant_effective === true;

            return (
              <li key={a.id} className="rounded-md border p-3">
                <div className="font-mono text-xs text-gray-500">{a.id}</div>
                <div className="break-all">{a.storage_path}</div>
                <div className="text-gray-600">
                  {a.status} · {new Date(a.created_at).toLocaleString()}
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs">{rel.text}</span>

                  <button
                    onClick={() => setRelevant(a.id, !showRelevant)}
                    className="rounded-md border px-3 py-1 text-xs"
                  >
                    {showRelevant ? "Als irrelevant markieren" : "Als relevant markieren"}
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
            );
          })}

          {assets.length === 0 && (
            <li className="text-gray-600">Noch keine Assets.</li>
          )}
        </ul>
      </section>
    </main>
  );
}