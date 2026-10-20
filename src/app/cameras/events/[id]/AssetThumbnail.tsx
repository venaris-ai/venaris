"use client";

import { useState } from "react";

export default function AssetThumbnail({
  src,
  alt,
  selected,
  language,
}: {
  src: string;
  alt: string;
  selected: boolean;
  language: "de" | "en";
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative h-full w-full bg-white/5">
      {!loaded && !failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5">
          <div className="h-3/4 w-4/5 animate-pulse rounded-lg bg-white/10" />
        </div>
      ) : null}
      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-white/55">
          {language === "en" ? "Image unavailable" : "Bild nicht verfügbar"}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={selected ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
