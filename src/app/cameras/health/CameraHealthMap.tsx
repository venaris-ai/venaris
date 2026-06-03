// src/app/cameras/health/CameraHealthMap.tsx #1
"use client";

import dynamic from "next/dynamic";
import type { AppLanguage } from "@/lib/i18n";
import type {
  BoundaryGeoJson,
  CameraMapItem,
  CameraMapObjectItem,
} from "../CameraMap";

const CameraMap = dynamic(() => import("../CameraMap"), {
  ssr: false,
  loading: () => (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="h-[520px] animate-pulse rounded-[24px] border border-white/10 bg-white/[0.03]" />
    </section>
  ),
});

export default function CameraHealthMap({
  cameras,
  language,
  boundaryGeoJson,
  mapObjects = [],
}: {
  cameras: CameraMapItem[];
  language: AppLanguage;
  boundaryGeoJson?: BoundaryGeoJson | null;
  mapObjects?: CameraMapObjectItem[];
}) {

  return (
    <CameraMap
      cameras={cameras}
      language={language}
      boundaryGeoJson={boundaryGeoJson}
      mapObjects={mapObjects}
    />
  );
}
