"use client";

import { useState } from "react";

type AssetItem = {
  id: string;
  previewUrl?: string;
  timestampLabel: string;
  storagePath?: string;
  relevant: boolean;
};

export default function AssetGrid({ initialAssets }: { initialAssets: AssetItem[] }) {
  const [assets, setAssets] = useState<AssetItem[]>(initialAssets);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setRelevant(assetId: string, next: boolean) {
    // Optimistic update
    setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, relevant: next } : a)));
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
      // rollback
      setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, relevant: !next } : a)));
      alert(`Konnte Relevant nicht speichern: ${(e as any)?.message ?? String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {assets.map((a) => {
        const isBusy = busyId === a.id;

        return (
          <div key={a.id} className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
              <div>{a.timestampLabel}</div>

              <button
                className={[
                  "rounded-full px-3 py-1 text-xs border transition",
                  a.relevant ? "bg-black text-white border-black" : "bg-white text-gray-800 border-gray-300",
                  isBusy ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
                ].join(" ")}
                disabled={isBusy}
                onClick={() => setRelevant(a.id, !a.relevant)}
                title="Klicken zum Umschalten"
              >
                {a.relevant ? "Relevant" : "Irrelevant"}
              </button>
            </div>

            <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg bg-gray-100">
              {a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.previewUrl} alt="asset" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  Kein Preview
                </div>
              )}
            </div>

            <div className="mt-2 text-xs text-gray-600 break-all">{a.storagePath}</div>
          </div>
        );
      })}
    </div>
  );
}