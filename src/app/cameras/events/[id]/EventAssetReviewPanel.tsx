// src/app/cameras/events/[id]/EventAssetReviewPanel.tsx #2
"use client";

import { useMemo, useState } from "react";
import { type AppLanguage } from "@/lib/i18n";
import AssetGrid from "./AssetGrid";
import EventDetailControls from "./EventDetailControls";
import EventHeroPanel from "./EventHeroPanel";
import type { SpeciesOption } from "@/lib/speciesMeta";

type AssetItem = {
  id: string;
  previewUrl?: string;
  timestampLabel: string;
  storagePath?: string;
  relevant: boolean;
  relevantUser: boolean | null;
  empty?: boolean | null;
  emptyConfidence?: number | null;
};

type DetectionTopRow = {
  asset_id: string | null;
  species: string | null;
  species_user: string | null;
  score: number | null;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      capturesTitle: "Event captures",
      capturesText:
        "Images from this event. Select an image to review its details.",
      noAssets: "No assets found (event_assets empty or asset IDs missing).",
    };
  }

  return {
    capturesTitle: "Event-Aufnahmen",
    capturesText:
      "Bilder dieses Events. Wähle ein Bild aus, um die Details zu prüfen.",
    noAssets: "Keine Assets gefunden (event_assets leer oder Asset-IDs fehlen).",
  };
}

export default function EventAssetReviewPanel({
  assets,
  detectionsByAssetId,
  initialSelectedAssetId,
  isDemo = false,
  language,
  speciesOptions,
  speciesLabelByCode,
  topSpeciesLabel,
  eventCount,
  cameraLabel,
  currentEventId,
  afterRemoveHref,
  eventQuerySuffix,
}: {
  assets: AssetItem[];
  detectionsByAssetId: Record<string, DetectionTopRow>;
  initialSelectedAssetId: string | null;
  isDemo?: boolean;
  language: AppLanguage;
  speciesOptions: SpeciesOption[];
  speciesLabelByCode: Record<string, string>;
  topSpeciesLabel?: string;
  eventCount?: number | null;
  cameraLabel: string;
  currentEventId: string;
  afterRemoveHref: string;
  eventQuerySuffix: string;
}) {
  const text = t(language);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(
    initialSelectedAssetId
  );

  const selectedAsset = useMemo(() => {
    return (
      assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null
    );
  }, [assets, selectedAssetId]);

  const selectedIndex = selectedAsset
    ? assets.findIndex((asset) => asset.id === selectedAsset.id)
    : -1;
  const selectedDetection = selectedAsset
    ? detectionsByAssetId[selectedAsset.id] ?? null
    : null;

  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_380px]">
        <div>
          <EventHeroPanel
            asset={selectedAsset}
            selectedIndex={selectedIndex >= 0 ? selectedIndex : 0}
            totalCount={assets.length}
            language={language}
          />
        </div>

        <aside className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <EventDetailControls
            key={selectedAsset?.id ?? "none"}
            assetId={selectedAsset?.id ?? null}
            initialRelevantAuto={selectedAsset?.relevant ?? null}
            initialRelevantUser={selectedAsset?.relevantUser ?? null}
            initialSpeciesAuto={selectedDetection?.species ?? null}
            initialSpeciesUser={selectedDetection?.species_user ?? null}
            probabilityScore={selectedDetection?.score ?? null}
            cameraLabel={cameraLabel}
            timestampLabel={selectedAsset?.timestampLabel ?? null}
            isDemo={isDemo}
            language={language}
            speciesOptions={speciesOptions}
            speciesLabelByCode={speciesLabelByCode}
            topSpeciesLabel={topSpeciesLabel}
            eventCount={eventCount}
            assetCount={assets.length}
            currentEventId={currentEventId}
            afterRemoveHref={afterRemoveHref}
            eventQuerySuffix={eventQuerySuffix}
          />
        </aside>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-medium text-white">
              {text.capturesTitle}
            </h2>
            <p className="mt-1 text-sm text-white/62">{text.capturesText}</p>
          </div>
        </div>

        {assets.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            {text.noAssets}
          </div>
        ) : (
          <AssetGrid
            assets={assets}
            selectedAssetId={selectedAsset?.id ?? null}
            onSelectAsset={setSelectedAssetId}
            language={language}
          />
        )}
      </section>
    </>
  );
}