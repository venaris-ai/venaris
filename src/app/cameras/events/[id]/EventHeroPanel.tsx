// src/app/cameras/events/[id]/EventHeroPanel.tsx #8
"use client";

import { useEffect, useRef, useState } from "react";
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

function EventHeroImage({
  src,
  alt,
  loadingLabel,
  errorLabel,
}: {
  src: string;
  alt: string;
  loadingLabel: string;
  errorLabel: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A cached image can finish downloading before React hydrates.
    // In that case there is no onLoad event left to handle.
    const image = imageRef.current;
    if (!image?.complete) return;
    if (image.naturalWidth > 0) setLoaded(true);
    else setFailed(true);
  }, [src]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-white/5">
      {!loaded && !failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/5">
          <div className="h-2/3 w-4/5 animate-pulse rounded-2xl bg-white/8" />
          <span className="absolute bottom-3 text-xs text-white/50">{loadingLabel}</span>
        </div>
      ) : null}

      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/55">
          {errorLabel}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
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
        <div className="flex aspect-[4/3] items-center justify-center rounded-[22px] bg-white/5 text-sm text-white/45">
          {text.noPreview}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      {asset.previewUrl ? (
        <EventHeroImage
          key={asset.id}
          src={asset.previewUrl}
          alt={text.previewAlt}
          loadingLabel={language === "en" ? "Loading image …" : "Bild wird geladen …"}
          errorLabel={language === "en" ? "Image could not be loaded" : "Bild konnte nicht geladen werden"}
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-[22px] bg-white/5 text-sm text-white/45">
          {text.noPreview}
        </div>
      )}

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
