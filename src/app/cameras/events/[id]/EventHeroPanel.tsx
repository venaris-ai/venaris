// src/app/cameras/events/[id]/EventHeroPanel.tsx #4
"use client";

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

export default function EventHeroPanel({
  asset,
  totalCount,
}: {
  asset: AssetItem | null;
  totalCount: number;
}) {
  if (!asset) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-white/5">
          <div className="flex h-full items-center justify-center text-sm text-white/45">
            Kein Preview
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
            alt="Event preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/45">
            Kein Preview
          </div>
        )}
      </div>

      <div className="mt-3 text-sm text-white/68">
        Bestes Bild aus{" "}
        <span className="font-medium text-white">{totalCount}</span> Aufnahme
        {totalCount === 1 ? "" : "n"}
      </div>
    </div>
  );
}