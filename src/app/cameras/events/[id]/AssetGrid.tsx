// src/app/cameras/events/[id]/AssetGrid.tsx #3
"use client";

import { useState } from "react";

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

function effectiveRelevant(a: AssetItem) {
  if (typeof a.relevantUser === "boolean") return a.relevantUser;
  return a.relevant;
}

function badgeLabel(a: AssetItem) {
  const eff = effectiveRelevant(a);

  if (typeof a.relevantUser === "boolean") {
    return `OVERRIDE · ${eff ? "relevant" : "irrelevant"}`;
  }

  if (a.empty === true) {
    const c =
      typeof a.emptyConfidence === "number"
        ? ` (${Math.round(a.emptyConfidence * 100)}%)`
        : "";
    return `AUTO · empty${c}`;
  }

  return `AUTO · relevant`;
}

function badgeClasses(a: AssetItem) {
  const eff = effectiveRelevant(a);
  if (typeof a.relevantUser === "boolean") {
    return eff
      ? "border-amber-300/20 bg-amber-300/10 text-amber-200"
      : "border-white/10 bg-white/5 text-white/72";
  }

  if (a.empty === true) return "border-white/10 bg-white/5 text-white/72";
  return "border-amber-300/20 bg-amber-300/10 text-amber-200";
}

export default function AssetGrid({ initialAssets }: { initialAssets: AssetItem[] }) {
  const [assets, setAssets] = useState<AssetItem[]>(initialAssets);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setOverride(assetId: string, next: boolean | null) {
    const prev = assets;
    setAssets((p) =>
      p.map((a) => (a.id === assetId ? { ...a, relevantUser: next } : a))
    );
    setBusyId(assetId);

    try {
      const res = await fetch("/api/asset-relevant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, relevant: next }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
    } catch (e) {
      setAssets(prev);
      alert(`Konnte Relevanz nicht speichern: ${(e as any)?.message ?? String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {assets.map((a) => {
        const isBusy = busyId === a.id;
        const eff = effectiveRelevant(a);
        const isOverride = typeof a.relevantUser === "boolean";

        return (
          <div
            key={a.id}
            className="rounded-[24px] border border-white/10 bg-white/5 p-3 backdrop-blur-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-white/55">
                <div>{a.timestampLabel}</div>
              </div>

              <span
                className={[
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs whitespace-nowrap",
                  badgeClasses(a),
                ].join(" ")}
                title={isOverride ? "User Override" : "Auto (Empty Filter)"}
              >
                {badgeLabel(a)}
              </span>
            </div>

            <div className="mt-2 aspect-video w-full overflow-hidden rounded-[16px] bg-white/5">
              {a.previewUrl ? (
                <img src={a.previewUrl} alt="asset" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/45">
                  Kein Preview
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
                    onClick={() => setOverride(a.id, true)}
                  >
                    Mark relevant
                  </button>

                  <button
                    className={[
                      "rounded-[10px] border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/78",
                      isBusy
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-amber-300/20 hover:bg-white/8 hover:text-white",
                    ].join(" ")}
                    disabled={isBusy}
                    onClick={() => setOverride(a.id, false)}
                  >
                    Mark irrelevant
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
                  onClick={() => setOverride(a.id, null)}
                  title="Override entfernen, zurück zu Auto"
                >
                  Reset (Auto)
                </button>
              )}

              <span className="ml-auto text-xs text-white/55">
                Effective: <span className="font-medium text-white">{eff ? "relevant" : "irrelevant"}</span>
              </span>
            </div>

            {a.storagePath && (
              <div className="mt-2 break-all text-xs text-white/55">{a.storagePath}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}