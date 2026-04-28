// src/app/cameras/CamerasPageClient.tsx #3
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AppLanguage } from "@/lib/i18n";
import {
  DEFAULT_APP_TIME_ZONE,
  formatAppDateTime,
} from "@/lib/dateTime";

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

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      demoReadOnly: "Demo mode: changes are disabled.",
      justNow: "just now",
      agoMin: "{n} min ago",
      agoHour: "{n} h ago",
      agoDay: "{n} d ago",
      camerasEyebrow: "Cameras",
      camerasTitle: "Cameras",
      intro: "Operational overview of camera status, recent images and ingest.",
      currentScope: "Cameras in current scope",
      recentlySeen: "recently seen",
      needsAttention: "needs attention",
      criticalCameras: "critical cameras",
      latestIngestBatches: "Latest ingest batches",
      ingestText: "Recent import and ingest activity.",
      loading: "loading…",
      latestAssets: "Latest assets",
      latestAssetsText: "Quick operational view of new images.",
      cameraFallback: "Camera",
      relevant: "Relevant",
      notRelevant: "Not relevant",
      noIngestBatches: "No ingest batches yet.",
      noAssets: "No assets in the current scope yet.",
      unknown: "?",
      sourceFiles: (count: number | null) => `files: ${count ?? "?"}`,
      online: "Online",
      stale: "Stale",
      offline: "Offline",
    };
  }

  return {
    demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
    justNow: "gerade eben",
    agoMin: "vor {n} min",
    agoHour: "vor {n} h",
    agoDay: "vor {n} d",
    camerasEyebrow: "Kameras",
    camerasTitle: "Kameras",
    intro: "Operative Übersicht über Kamerastatus, aktuelle Bilder und Ingest.",
    currentScope: "Kameras im aktuellen Scope",
    recentlySeen: "zuletzt gesehen",
    needsAttention: "Aufmerksamkeit nötig",
    criticalCameras: "kritische Kameras",
    latestIngestBatches: "Letzte Ingest-Batches",
    ingestText: "Jüngste Import- und Ingest-Aktivität.",
    loading: "lädt…",
    latestAssets: "Letzte Assets",
    latestAssetsText: "Schnelle operative Sicht auf neue Bilder.",
    cameraFallback: "Kamera",
    relevant: "Relevant",
    notRelevant: "Nicht relevant",
    noIngestBatches: "Noch keine Ingest-Batches.",
    noAssets: "Noch keine Assets im aktuellen Scope.",
    unknown: "?",
    sourceFiles: (count: number | null) => `Dateien: ${count ?? "?"}`,
    online: "Online",
    stale: "Veraltet",
    offline: "Offline",
  };
}

function formatAgo(ts: string | null | undefined, language: AppLanguage) {
  const text = t(language);

  if (!ts) return "—";

  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 2) return text.justNow;
  if (minutes < 60) return text.agoMin.replace("{n}", String(minutes));

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return text.agoHour.replace("{n}", String(hours));

  const days = Math.floor(hours / 24);
  return text.agoDay.replace("{n}", String(days));
}

function formatDateTime(ts: string | null | undefined, language: AppLanguage) {
  return formatAppDateTime(ts, language, DEFAULT_APP_TIME_ZONE);
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

function normalizeApiErrorMessage(message: string, language: AppLanguage) {
  const text = t(language);

  if (message.includes("Demo mode is read-only")) {
    return text.demoReadOnly;
  }

  return message;
}

async function parseApiResponse(res: Response) {
  const rawText = await res.text();

  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
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

export default function CamerasPageClient({
  language,
}: {
  language: AppLanguage;
}) {
  const searchParams = useSearchParams();
  const revierParam = searchParams.get("revier");

  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const assetLimit = 8;
  const batchLimit = 8;
  const text = t(language);

  async function loadUrls(items: AssetRow[]) {
    const next: Record<string, string> = {};

    for (const asset of items) {
      try {
        const res = await fetch(
          `/api/asset-url?path=${encodeURIComponent(asset.storage_path)}`
        );
        const json = await res.json();

        if (json.url) {
          next[asset.id] = json.url;
        }
      } catch {
        // ignore individual preview failures
      }
    }

    setUrls(next);
  }

  async function loadCameras() {
    const params = new URLSearchParams();

    if (revierParam) {
      params.set("revier", revierParam);
    }

    const url = params.toString()
      ? `/api/camera-health?${params.toString()}`
      : "/api/camera-health";

    const res = await fetch(url, { cache: "no-store" });
    const json = await parseApiResponse(res);

    if (!res.ok) {
      setMsg(
        normalizeApiErrorMessage(
          json.error || json.rawText || `HTTP ${res.status}`,
          language
        )
      );
      setCameras([]);
      return;
    }

    setCameras((json.items ?? []) as CameraRow[]);
  }

  async function loadAssets() {
    setLoadingAssets(true);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(assetLimit));

      if (revierParam) params.set("revier", revierParam);

      const res = await fetch(`/api/assets?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await parseApiResponse(res);

      if (!res.ok) {
        setMsg(
          normalizeApiErrorMessage(
            json.error || json.rawText || `HTTP ${res.status}`,
            language
          )
        );
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

      if (revierParam) params.set("revier", revierParam);

      const res = await fetch(`/api/ingest-batches?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await parseApiResponse(res);

      if (!res.ok) {
        setMsg(
          normalizeApiErrorMessage(
            json.error || json.rawText || `HTTP ${res.status}`,
            language
          )
        );
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
      await Promise.all([loadCameras(), loadAssets(), loadBatches()]);
    } finally {
      setLoadingInitial(false);
    }
  }

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revierParam, language]);

  const cameraNameById = useMemo(() => {
    return Object.fromEntries(cameras.map((camera) => [camera.id, camera.name]));
  }, [cameras]);

  const healthCounts = useMemo(() => {
    return cameras.reduce(
      (acc, camera) => {
        const key = camera.health_status || "unknown";

        if (key === "online") acc.online += 1;
        else if (key === "stale") acc.stale += 1;
        else if (key === "offline") acc.offline += 1;
        else acc.unknown += 1;

        return acc;
      },
      { online: 0, stale: 0, offline: 0, unknown: 0 }
    );
  }, [cameras]);

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.camerasEyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.camerasTitle}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">{text.intro}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={text.camerasTitle}
          value={cameras.length}
          subline={text.currentScope}
        />
        <StatCard
          title={text.online}
          value={healthCounts.online}
          subline={text.recentlySeen}
        />
        <StatCard
          title={text.stale}
          value={healthCounts.stale}
          subline={text.needsAttention}
        />
        <StatCard
          title={text.offline}
          value={healthCounts.offline}
          subline={text.criticalCameras}
        />
      </section>

      {msg ? (
        <div className="rounded-[28px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/78 backdrop-blur-sm">
          {msg}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">
                {text.latestIngestBatches}
              </h2>
              <p className="text-sm text-white/65">{text.ingestText}</p>
            </div>
            {loadingInitial || loadingBatches ? (
              <div className="text-xs text-white/45">{text.loading}</div>
            ) : null}
          </div>

          <div className="space-y-3">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">
                      {batch.cameras?.name || batch.camera_id || "—"}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {formatDateTime(batch.received_at, language)} ·{" "}
                      {batch.source ?? text.unknown} ·{" "}
                      {text.sourceFiles(batch.file_count)}
                    </div>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeTone(
                      batch.status
                    )}`}
                  >
                    {batch.status ?? "-"}
                  </span>
                </div>

                {batch.error_summary ? (
                  <div className="mt-2 text-xs text-rose-200">
                    {batch.error_summary}
                  </div>
                ) : null}
              </div>
            ))}

            {batches.length === 0 ? (
              <div className="text-sm text-white/68">{text.noIngestBatches}</div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">
                {text.latestAssets}
              </h2>
              <p className="text-sm text-white/65">{text.latestAssetsText}</p>
            </div>
            {loadingInitial || loadingAssets ? (
              <div className="text-xs text-white/45">{text.loading}</div>
            ) : null}
          </div>

          <div className="space-y-4">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">
                      {cameraNameById[asset.camera_id] ?? text.cameraFallback}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {formatDateTime(asset.created_at, language)} ·{" "}
                      {formatAgo(asset.created_at, language)}
                    </div>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      asset.relevant_effective
                        ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                        : "border-white/10 bg-white/5 text-white/72"
                    }`}
                  >
                    {asset.relevant_effective ? text.relevant : text.notRelevant}
                  </span>
                </div>

                {urls[asset.id] ? (
                  <img
                    src={urls[asset.id]}
                    alt="asset"
                    className="mt-3 w-full max-w-md rounded-[16px] border border-white/10"
                  />
                ) : null}
              </div>
            ))}

            {assets.length === 0 ? (
              <div className="text-sm text-white/68">{text.noAssets}</div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}