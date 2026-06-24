// src/app/cameras/events/[id]/EventHeroPanel.tsx #8
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
      noPreview: "No preview",
      selectedImage: "Selected image",
      of: "of",
      captures: "captures",
      previewAlt: "Event preview",
    };
  }

  return {
    noPreview: "Kein Preview",
    selectedImage: "Ausgewähltes Bild",
    of: "von",
    captures: "Aufnahmen",
    previewAlt: "Event preview",
  };
}

export default function EventHeroPanel({
  asset,
  selectedIndex,
  totalCount,
  language,
}: {
  asset: AssetItem | null;
  selectedIndex: number;
  totalCount: number;
  language: AppLanguage;
}) {
  const text = t(language);

  if (!asset) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-black/30">
          <div className="flex h-full items-center justify-center text-sm text-white/45">
            {text.noPreview}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-black/30">
        {asset.previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.previewUrl}
              alt={text.previewAlt}
              className="h-full w-full object-contain"
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/45">
            {text.noPreview}
          </div>
        )}
      </div>

      <div className="mt-3 text-sm text-white/68">
        {text.selectedImage}{" "}
        <span className="font-medium text-white">{selectedIndex + 1}</span>{" "}
        {text.of}{" "}
        <span className="font-medium text-white">{totalCount}</span>{" "}
        {text.captures}
      </div>
    </div>
  );
}
