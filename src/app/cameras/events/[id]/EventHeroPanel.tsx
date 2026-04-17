// src/app/cameras/events/[id]/EventHeroPanel.tsx #6
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
      bestImageA: "Best image from",
      bestImageB: "capture",
      bestImagePlural: "s",
      previewAlt: "Event preview",
    };
  }

  return {
    noPreview: "Kein Preview",
    bestImageA: "Bestes Bild aus",
    bestImageB: "Aufnahme",
    bestImagePlural: "n",
    previewAlt: "Event preview",
  };
}

export default function EventHeroPanel({
  asset,
  totalCount,
  language,
}: {
  asset: AssetItem | null;
  totalCount: number;
  language: AppLanguage;
}) {
  const text = t(language);

  if (!asset) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-white/5">
          <div className="flex h-full items-center justify-center text-sm text-white/45">
            {text.noPreview}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-white/5">
        {asset.previewUrl ? (
          <img
            src={asset.previewUrl}
            alt={text.previewAlt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/45">
            {text.noPreview}
          </div>
        )}
      </div>

      <div className="mt-3 text-sm text-white/68">
        {text.bestImageA}{" "}
        <span className="font-medium text-white">{totalCount}</span> {text.bestImageB}
        {totalCount === 1 ? "" : text.bestImagePlural}
      </div>
    </div>
  );
}