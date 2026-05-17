// src/app/cameras/events/[id]/AssetGrid.tsx #8
"use client";

import { type AppLanguage } from "@/lib/i18n";

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

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      previewMissing: "No preview",
      selected: "Selected",
      selectImage: "Select image",
      previewAlt: "Event capture",
    };
  }

  return {
    previewMissing: "Kein Preview",
    selected: "Ausgewählt",
    selectImage: "Bild auswählen",
    previewAlt: "Event-Aufnahme",
  };
}

export default function AssetGrid({
  assets,
  selectedAssetId,
  onSelectAsset,
  language,
}: {
  assets: AssetItem[];
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  language: AppLanguage;
}) {
  const text = t(language);

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => {
        const isSelected = asset.id === selectedAssetId;

        return (
          <button
            key={asset.id}
            type="button"
            onClick={() => onSelectAsset(asset.id)}
            className={[
              "rounded-[24px] border bg-white/5 p-3 text-left backdrop-blur-sm transition",
              isSelected
                ? "border-amber-300/45 ring-1 ring-amber-300/25"
                : "border-white/10 hover:border-amber-300/25 hover:bg-white/8",
            ].join(" ")}
            aria-label={text.selectImage}
            aria-current={isSelected ? "true" : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-white/55">
                <div>{asset.timestampLabel}</div>
              </div>

              {isSelected ? (
                <span className="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs whitespace-nowrap text-amber-200">
                  {text.selected}
                </span>
              ) : null}
            </div>

<div className="mt-2 aspect-video w-full overflow-hidden rounded-[16px] bg-white/5">
  {asset.previewUrl ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.previewUrl}
        alt={text.previewAlt}
        className="h-full w-full object-cover"
      />
    </>
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-white/45">
      {text.previewMissing}
    </div>
  )}
</div>


          </button>
        );
      })}
    </div>
  );
}
