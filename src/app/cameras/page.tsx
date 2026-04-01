// src/app/cameras/page.tsx #6
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type AssetRow = {
  id: string;
  camera_id: string;
  storage_path: string;
  status: string;
  created_at: string;
  relevant: boolean;
  relevant_user: boolean | null;
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

type BatchRow = {
  id: string;
  camera_id: string;
  received_at: string;
  source: string | null;
  file_count: number | null;
  status: string | null;
  error_summary: string | null;
  cameras?: { id: string; name: string } | null;
};

function healthEmoji(status?: string) {
  if (status === "online") return "🟢";
  if (status === "stale") return "🟡";
  if (status === "offline") return "🔴";
  return "⚪";
}

function relevanceLabel(a: AssetRow) {
  if (a.relevant_user === true) return { text: "✅ relevant (manuell)" };
  if (a.relevant_user === false) return { text: "🚫 irrelevant (manuell)" };

  if (a.empty === true) {
    const pct =
      typeof a.empty_confidence === "number"
        ? ` (${Math.round(a.empty_confidence * 100)}%)`
        : "";
    return { text: `🚫 leer erkannt${pct}` };
  }

  return { text: "✅ relevant" };
}

function formatAgo(ts: string | null | undefined) {
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

function formatDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function statusBadgeTone(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "ok" || s === "success" || s === "done") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  }
  if (s === "error" || s === "failed") {
    return "border-rose-300/25 bg-rose-300/10 text-rose-200";
  }
  if (s === "processing" || s === "running") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  }
  return "border-white/10 bg-white/5 text-white/72";
}

function StatCard({
  title,
  value,
  subline,
}: {
  title: string;
  value: string | number;
  subline: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      <div className="mt-1 text-sm text-white/65">{subline}</div>
    </div>
  );
}

export default function CamerasPage() {
  const searchParams = useSearchParams();
  const revierParam = searchParams.get("revier");

  const [cameraId, setCameraId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const [onlyRelevant, setOnlyRelevant] = useState(true);
  const [msg, setMsg] = useState("");

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [uploading, setUploading] = useState(false);

  const assetLimit = 8;
  const batchLimit = 8;

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
    const params = new URLSearchParams();
    if (revierParam) params.set("revier", revierParam);

    const url = params.toString()
      ? `/api/camera-health?${params.toString()}`
      : "/api/camera-health";

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (!res.ok) {
      setMsg(json.error || `HTTP ${res.status}`);
      return;
    }

    const list = (json.items ?? []) as CameraRow[];
    setCameras(list);

    setCameraId((current) => {
      if (list.length === 0) return "";
      if (!current) return list[0].id;
      if (!list.some((camera) => camera.id === current)) return list[0].id;
      return current;
    });
  }

  async function loadAssets() {
    setLoadingAssets(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(assetLimit));
      if (cameraId) params.set("cameraId", cameraId);
      if (onlyRelevant) params.set("onlyRelevant", "true");
      if (revierParam) params.set("revier", revierParam);

      const res = await fetch(`/api/assets?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        setMsg(json.error || `HTTP ${res.status}`);
        setAssets([]);
        setUrls({});
        return;
      }

      const list = (json.assets ?? []) as AssetRow[];
      setAssets(list);
      await loadUrls(list);
    } finally {
      setLoadingAssets(false);
    }
  }

  async function loadBatches() {
    setLoadingBatches(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(batchLimit));
      if (cameraId) params.set("cameraId", cameraId);
      if (revierParam) params.set("revier", revierParam);

      const res = await fetch(`/api/ingest-batches?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        setMsg(json.error || `HTTP ${res.status}`);
        setBatches([]);
        return;
      }

      setBatches((json.items ?? []) as BatchRow[]);
    } finally {
      setLoadingBatches(false);
    }
  }

  async function loadOverview() {
    setMsg("");
    setLoadingInitial(true);
    try {
      await loadCameras();
      await Promise.all([loadAssets(), loadBatches()]);
    } finally {
      setLoadingInitial(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revierParam]);

  useEffect(() => {
    loadAssets();
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, onlyRelevant, revierParam]);

  async function upload() {
    setMsg("");

    if (!file) {
      setMsg("Bitte Bild auswählen.");
      return;
    }

    if (!cameraId) {
      setMsg("Bitte Kamera auswählen.");
      return;
    }

    setUploading(true);

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
      setMsg(
        `✅ Upload ok · accepted=${json.accepted ?? "?"} · skippedDup=${
          json.skippedDuplicates ?? "?"
        }`
      );
      await Promise.all([loadAssets(), loadBatches(), loadCameras()]);
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function setRelevant(assetId: string, nextRelevant: boolean) {
    setMsg("");
    const res = await fetch("/api/asset-relevant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, relevant: nextRelevant }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMsg(json?.error || `HTTP ${res.status}`);
      return;
    }

    await loadAssets();
  }

  const cameraOptions = useMemo(() => {
    return [
      { id: "", label: "Alle Kameras" },
      ...cameras.map((c) => ({
        id: c.id,
        label: `${healthEmoji(c.health_status)} ${c.name}${
          c.import_method ? ` · ${c.import_method}` : ""
        }`,
      })),
    ];
  }, [cameras]);

  const selectedCamera = useMemo(
    () => cameras.find((c) => c.id === cameraId) ?? null,
    [cameras, cameraId]
  );

  const healthCounts = useMemo(() => {
    return cameras.reduce(
      (acc, c) => {
        const key = c.health_status || "unknown";
        if (key === "online") acc.online += 1;
        else if (key === "stale") acc.stale += 1;
        else if (key === "offline") acc.offline += 1;
        else acc.unknown += 1;
        return acc;
      },
      { online: 0, stale: 0, offline: 0, unknown: 0 }
    );
  }, [cameras]);

  const relevantAssetsCount = useMemo(
    () => assets.filter((a) => a.relevant_effective === true).length,
    [assets]
  );

  const attentionCount = healthCounts.stale + healthCounts.offline;

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Cameras
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Cameras
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            Operative Übersicht über Kamera-Health, aktuelle Assets, Ingest und
            Quick Upload.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Cameras"
          value={cameras.length}
          subline="Kameras im aktuellen Scope"
        />
        <StatCard
          title="Online"
          value={healthCounts.online}
          subline="zuletzt gesehen"
        />
        <StatCard
          title="Stale"
          value={healthCounts.stale}
          subline="Aufmerksamkeit nötig"
        />
        <StatCard
          title="Offline"
          value={healthCounts.offline}
          subline="kritische Kameras"
        />
        <StatCard
          title="Relevante Assets"
          value={relevantAssetsCount}
          subline="in aktueller Ansicht"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-medium text-white">Arbeitskontext</h2>
            <p className="mt-1 text-sm text-white/65">
              Steuere hier den Scope für Assets und Ingest-Batches.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Kamera</label>
              <select
                className="w-full rounded-full border border-white/10 bg-white/5 p-2 text-white outline-none backdrop-blur-sm"
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
              >
                {cameraOptions.map((o) => (
                  <option
                    key={o.id || "all"}
                    value={o.id}
                    className="bg-[#102018] text-white"
                  >
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-white/45">
                {selectedCamera
                  ? `Aktuell ausgewählt: ${selectedCamera.name}`
                  : "Aktuell: alle Kameras"}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-white/78">
              <input
                type="checkbox"
                checked={onlyRelevant}
                onChange={(e) => setOnlyRelevant(e.target.checked)}
                className="rounded border-white/10 bg-white/5"
              />
              Nur relevante Assets
            </label>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-medium text-white">Quick Upload</h2>
            <p className="mt-1 text-sm text-white/65">
              Einzelbild direkt an die ausgewählte Kamera senden.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="inline-block cursor-pointer rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 backdrop-blur-sm hover:border-amber-300/20 hover:bg-white/8 hover:text-white">
              Bild auswählen
              <input
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <button
              onClick={upload}
              disabled={uploading || !cameraId || !file}
              className="rounded-full bg-[#c9952e] px-4 py-2 text-sm text-[#102018] disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>

          <div className="mt-3 text-xs text-white/45">
            Upload funktioniert nur mit ausgewählter Kamera.
          </div>

          {file ? (
            <div className="mt-3 text-sm text-white/72">
              Ausgewählt: <span className="font-medium text-white">{file.name}</span>
            </div>
          ) : null}
        </section>
      </section>

      {attentionCount > 0 ? (
        <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-amber-100">Attention</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/85">
            {healthCounts.stale} stale und {healthCounts.offline} offline Kameras
            benötigen Aufmerksamkeit.
          </p>
        </section>
      ) : null}

      {msg ? (
        <div className="rounded-[28px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/78 backdrop-blur-sm">
          {msg}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Letzte Ingest-Batches</h2>
              <p className="text-sm text-white/65">
                Jüngste Import- und Ingest-Aktivität.
              </p>
            </div>
            {loadingInitial || loadingBatches ? (
              <div className="text-xs text-white/45">lädt…</div>
            ) : null}
          </div>

          <div className="space-y-3">
            {batches.map((b) => (
              <div
                key={b.id}
                className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">
                      {b.cameras?.name || b.camera_id || "—"}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {formatDateTime(b.received_at)} · {b.source ?? "?"} · files:{" "}
                      {b.file_count ?? "?"}
                    </div>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeTone(
                      b.status
                    )}`}
                  >
                    {b.status ?? "-"}
                  </span>
                </div>

                {b.error_summary ? (
                  <div className="mt-2 text-xs text-rose-200">{b.error_summary}</div>
                ) : null}
              </div>
            ))}

            {batches.length === 0 ? (
              <div className="text-sm text-white/68">Noch keine Ingest-Batches.</div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Letzte Assets</h2>
              <p className="text-sm text-white/65">
                Schnelle operative Sicht auf neue Bilder.
              </p>
            </div>
            {loadingInitial || loadingAssets ? (
              <div className="text-xs text-white/45">lädt…</div>
            ) : null}
          </div>

          <div className="space-y-4">
            {assets.map((a) => {
              const rel = relevanceLabel(a);
              const showRelevant = a.relevant_effective === true;

              return (
                <div
                  key={a.id}
                  className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm"
                >
                  <div className="font-mono text-xs text-white/45">{a.id}</div>
                  <div className="mt-1 break-all text-xs text-white/60">
                    {a.storage_path}
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    {a.status} · {formatAgo(a.created_at)}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-xs text-white/78">{rel.text}</span>
                    <button
                      onClick={() => setRelevant(a.id, !showRelevant)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
                    >
                      {showRelevant
                        ? "Als irrelevant markieren"
                        : "Als relevant markieren"}
                    </button>
                  </div>

                  {urls[a.id] ? (
                    <img
                      src={urls[a.id]}
                      alt="asset"
                      className="mt-3 w-full max-w-md rounded-[16px] border border-white/10"
                    />
                  ) : null}
                </div>
              );
            })}

            {assets.length === 0 ? (
              <div className="text-sm text-white/68">
                Noch keine Assets in der aktuellen Ansicht.
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}