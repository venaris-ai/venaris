// src/app/cameras/events/[id]/AssetGrid.tsx #7
"use client";

import { useState } from "react";
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

function effectiveRelevant(asset: AssetItem) {
  if (typeof asset.relevantUser === "boolean") return asset.relevantUser;
  return asset.relevant;
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      overrideRelevant: "OVERRIDE · relevant",
      overrideIrrelevant: "OVERRIDE · irrelevant",
      autoEmpty: "AUTO · empty",
      autoRelevant: "AUTO · relevant",
      previewMissing: "No preview",
      markRelevant: "Mark relevant",
      markIrrelevant: "Mark irrelevant",
      resetAuto: "Reset (Auto)",
      effective: "Effective",
      relevant: "relevant",
      irrelevant: "irrelevant",
      userOverride: "User override",
      autoEmptyFilter: "Auto (empty filter)",
      demoTitle: "Demo mode: changes are disabled.",
      demoAlert:
        "This is a demo account. Records cannot be deleted, added, or changed.",
      saveFailedPrefix: "Could not save relevance:",
      resetToAuto: "Remove override and return to auto",
    };
  }

  return {
    overrideRelevant: "OVERRIDE · relevant",
    overrideIrrelevant: "OVERRIDE · irrelevant",
    autoEmpty: "AUTO · leer",
    autoRelevant: "AUTO · relevant",
    previewMissing: "Kein Preview",
    markRelevant: "Als relevant markieren",
    markIrrelevant: "Als irrelevant markieren",
    resetAuto: "Reset (Auto)",
    effective: "Effektiv",
    relevant: "relevant",
    irrelevant: "irrelevant",
    userOverride: "User Override",
    autoEmptyFilter: "Auto (Empty Filter)",
    demoTitle: "Demo-Modus: Änderungen sind deaktiviert.",
    demoAlert:
      "Das ist ein Demo-Account. Datensätze können weder entfernt noch hinzugefügt oder geändert werden.",
    saveFailedPrefix: "Konnte Relevanz nicht speichern:",
    resetToAuto: "Override entfernen, zurück zu Auto",
  };
}

function badgeLabel(asset: AssetItem, language: AppLanguage) {
  const text = t(language);
  const effective = effectiveRelevant(asset);

  if (typeof asset.relevantUser === "boolean") {
    return effective ? text.overrideRelevant : text.overrideIrrelevant;
  }

  if (asset.empty === true) {
    const confidence =
      typeof asset.emptyConfidence === "number"
        ? ` (${Math.round(asset.emptyConfidence * 100)}%)`
        : "";
    return `${text.autoEmpty}${confidence}`;
  }

  return text.autoRelevant;
}

function badgeClasses(asset: AssetItem) {
  const effective = effectiveRelevant(asset);

  if (typeof asset.relevantUser === "boolean") {
    return effective
      ? "border-amber-300/20 bg-amber-300/10 text-amber-200"
      : "border-white/10 bg-white/5 text-white/72";
  }

  if (asset.empty === true) {
    return "border-white/10 bg-white/5 text-white/72";
  }

  return "border-amber-300/20 bg-amber-300/10 text-amber-200";
}

export default function AssetGrid({
  initialAssets,
  isDemo = false,
  language,
}: {
  initialAssets: AssetItem[];
  isDemo?: boolean;
  language: AppLanguage;
}) {
  const text = t(language);
  const [assets, setAssets] = useState<AssetItem[]>(initialAssets);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setOverride(assetId: string, next: boolean | null) {
    if (isDemo) {
      alert(text.demoAlert);
      return;
    }

    const previousAssets = assets;
    setAssets((current) =>
      current.map((asset) =>
        asset.id === assetId ? { ...asset, relevantUser: next } : asset
      )
    );
    setBusyId(assetId);

    try {
      const res = await fetch("/api/asset-relevant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, relevant: next }),
      });

      if (!res.ok) {
        const rawText = await res.text();
        throw new Error(rawText || `HTTP ${res.status}`);
      }
    } catch (error) {
      setAssets(previousAssets);
      const message = String((error as { message?: string })?.message ?? error);
      alert(`${text.saveFailedPrefix} ${message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => {
        const isBusy = busyId === asset.id;
        const effective = effectiveRelevant(asset);
        const isOverride = typeof asset.relevantUser === "boolean";

        return (
          <div
            key={asset.id}
            className="rounded-[24px] border border-white/10 bg-white/5 p-3 backdrop-blur-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-white/55">
                <div>{asset.timestampLabel}</div>
              </div>

              <span
                className={[
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs whitespace-nowrap",
                  badgeClasses(asset),
                ].join(" ")}
                title={isOverride ? text.userOverride : text.autoEmptyFilter}
              >
                {badgeLabel(asset, language)}
              </span>
            </div>

            <div className="mt-2 aspect-video w-full overflow-hidden rounded-[16px] bg-white/5">
              {asset.previewUrl ? (
                <img
                  src={asset.previewUrl}
                  alt="asset"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/45">
                  {text.previewMissing}
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!isOverride ? (
                <>
                  <button
                    className={[
                      "rounded-[10px] border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/78",
                      isBusy
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-amber-300/20 hover:bg-white/8 hover:text-white",
                    ].join(" ")}
                    disabled={isBusy}
                    onClick={() => setOverride(asset.id, true)}
                    title={isDemo ? text.demoTitle : ""}
                  >
                    {text.markRelevant}
                  </button>

                  <button
                    className={[
                      "rounded-[10px] border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/78",
                      isBusy
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-amber-300/20 hover:bg-white/8 hover:text-white",
                    ].join(" ")}
                    disabled={isBusy}
                    onClick={() => setOverride(asset.id, false)}
                    title={isDemo ? text.demoTitle : ""}
                  >
                    {text.markIrrelevant}
                  </button>
                </>
              ) : (
                <button
                  className={[
                    "rounded-[10px] border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/78",
                    isBusy
                      ? "cursor-not-allowed opacity-60"
                      : "hover:border-amber-300/20 hover:bg-white/8 hover:text-white",
                  ].join(" ")}
                  disabled={isBusy}
                  onClick={() => setOverride(asset.id, null)}
                  title={isDemo ? text.demoTitle : text.resetToAuto}
                >
                  {text.resetAuto}
                </button>
              )}

              <span className="ml-auto text-xs text-white/55">
                {text.effective}:{" "}
                <span className="font-medium text-white">
                  {effective ? text.relevant : text.irrelevant}
                </span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}