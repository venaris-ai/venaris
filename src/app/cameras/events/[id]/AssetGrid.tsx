// src/app/cameras/events/[id]/AssetGrid.tsx
"use client";

import { useState } from "react";

type AssetItem = {
  id: string;
  previewUrl?: string;
  timestampLabel: string;
  storagePath?: string;
  relevant: boolean | null;
  empty?: boolean | null;
  emptyConfidence?: number | null;
};

function effectiveRelevant(a: AssetItem) {
  if (typeof a.relevant === "boolean") return a.relevant;
  if (a.empty === true) return false;
  return true;
}

function badgeLabel(a: AssetItem) {
  const eff = effectiveRelevant(a);

  if (typeof a.relevant === "boolean") {
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
  if (typeof a.relevant === "boolean") {
    return eff
      ? "bg-black text-white border-black"
      : "bg-white text-gray-800 border-gray-300";
  }

  if (a.empty === true) return "bg-white text-gray-800 border-gray-300";
  return "bg-black text-white border-black";
}

export default function AssetGrid({ initialAssets }: { initialAssets: AssetItem[] }) {
  const [assets, setAssets] = useState<AssetItem[]>(initialAssets);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setOverride(assetId: string, next: boolean | null) {
    const prev = assets;
    setAssets((p) => p.map((a) => (a.id === assetId ? { ...a, relevant: next } : a)));
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
        const isOverride = typeof a.relevant === "boolean";

        return (
          <div key={a.id} className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-gray-600">
                <div>{a.timestampLabel}</div>
              </div>

              <span
                className={[
                  "inline-flex items-center rounded-full px-3 py-1 text-xs border whitespace-nowrap",
                  badgeClasses(a),
                ].join(" ")}
                title={isOverride ? "User Override" : "Auto (Empty Filter)"}
              >
                {badgeLabel(a)}
              </span>
            </div>

            <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg bg-gray-100">
              {a.previewUrl ? (
                <img src={a.previewUrl} alt="asset" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  Kein Preview
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!isOverride ? (
                <>
                  <button
                    className={[
                      "rounded-md border px-3 py-1 text-xs",
                      isBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50",
                    ].join(" ")}
                    disabled={isBusy}
                    onClick={() => setOverride(a.id, true)}
                  >
                    Mark relevant
                  </button>

                  <button
                    className={[
                      "rounded-md border px-3 py-1 text-xs",
                      isBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50",
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
                    "rounded-md border px-3 py-1 text-xs",
                    isBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50",
                  ].join(" ")}
                  disabled={isBusy}
                  onClick={() => setOverride(a.id, null)}
                  title="Override entfernen, zurück zu Auto"
                >
                  Reset (Auto)
                </button>
              )}

              <span className="ml-auto text-xs text-gray-600">
                Effective: <span className="font-medium">{eff ? "relevant" : "irrelevant"}</span>
              </span>
            </div>

            {a.storagePath && (
              <div className="mt-2 break-all text-xs text-gray-600">{a.storagePath}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}