// src/app/cameras/CamerasPageClient.tsx #6
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AppLanguage } from "@/lib/i18n";
import type { BoundaryGeoJson, CameraMapItem } from "./CameraMap";

const CameraMap = dynamic(() => import("./CameraMap"), {
  ssr: false,
  loading: () => (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="h-[520px] animate-pulse rounded-[24px] border border-white/10 bg-white/[0.03]" />
    </section>
  ),
});

type CameraRow = CameraMapItem;

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      demoReadOnly: "Demo mode: changes are disabled.",
      camerasEyebrow: "Cameras",
      camerasTitle: "Cameras",
      intro:
        "Operational overview of camera status, positions and viewing directions.",
      currentScope: "Cameras in current scope",
      recentlySeen: "recently seen",
      needsAttention: "needs attention",
      criticalCameras: "critical cameras",
      online: "Online",
      stale: "Stale",
      offline: "Offline",
    };
  }

  return {
    demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
    camerasEyebrow: "Kameras",
    camerasTitle: "Kameras",
    intro:
      "Operative Übersicht über Kamerastatus, Positionen und Blickrichtungen.",
    currentScope: "Kameras im aktuellen Scope",
    recentlySeen: "zuletzt gesehen",
    needsAttention: "Aufmerksamkeit nötig",
    criticalCameras: "kritische Kameras",
    online: "Online",
    stale: "Veraltet",
    offline: "Offline",
  };
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
      <div className="text-xs uppercase tracking-wide text-white/45">
        {title}
      </div>
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
  const [boundaryGeoJson, setBoundaryGeoJson] =
    useState<BoundaryGeoJson | null>(null);
  const [msg, setMsg] = useState("");

  const text = t(language);

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
      setBoundaryGeoJson(null);
      return;
    }

    setCameras((json.items ?? []) as CameraRow[]);
    setBoundaryGeoJson((json.boundaryGeoJson ?? null) as BoundaryGeoJson | null);
  }

  async function loadOverview() {
    setMsg("");
    await loadCameras();
  }

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revierParam, language]);

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

      <CameraMap
        cameras={cameras}
        language={language}
        boundaryGeoJson={boundaryGeoJson}
      />
    </main>
  );
}