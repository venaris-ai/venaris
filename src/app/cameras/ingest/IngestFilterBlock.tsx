// src/app/cameras/ingest/IngestFilterBlock.tsx #1
import Link from "next/link";

type CameraOption = {
  id: string;
  name: string | null;
};

type IngestFilterText = {
  filterTitle: string;
  camera: string;
  allCameras: string;
  unnamedCamera: string;
  fromDate: string;
  toDate: string;
  applyFilters: string;
  resetFilters: string;
};

type IngestFilterBlockProps = {
  text: IngestFilterText;
  rawRevier?: string;
  selectedCameraId?: string;
  fromDate?: string;
  toDate?: string;
  oldestEventDate?: string;
  defaultToDate?: string;
  cameraOptions: CameraOption[];
  resetHref: string;
};

export default function IngestFilterBlock({
  text,
  rawRevier,
  selectedCameraId,
  fromDate,
  toDate,
  oldestEventDate,
  defaultToDate,
  cameraOptions,
  resetHref,
}: IngestFilterBlockProps) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:p-4">
      <h2 className="mb-4 text-sm font-semibold text-white">{text.filterTitle}</h2>

      <form
        key={`${selectedCameraId ?? "all"}-${fromDate ?? ""}-${toDate ?? ""}`}
        className="flex flex-wrap items-end gap-2"
      >
        {rawRevier ? <input type="hidden" name="revier" value={rawRevier} /> : null}

        <label className="min-w-[15rem] flex-[1_1_18rem]">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">
            {text.camera}
          </span>
          <select
            name="camera"
            defaultValue={selectedCameraId ?? ""}
            className="h-10 w-full rounded-xl border border-white/10 bg-[#12251d] px-3 py-0 text-sm text-white outline-none focus:border-amber-300/40"
          >
            <option value="">{text.allCameras}</option>
            {cameraOptions.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name?.trim() || text.unnamedCamera}
              </option>
            ))}
          </select>
        </label>

        <label className="w-[9rem] flex-none">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">
            {text.fromDate}
          </span>
          <input
            type="date"
            name="from"
            defaultValue={fromDate ?? ""}
            min={oldestEventDate}
            max={toDate}
            className="h-10 w-full rounded-xl border border-white/10 bg-[#12251d] px-3 py-0 text-sm text-white outline-none focus:border-amber-300/40"
          />
        </label>

        <label className="w-[9rem] flex-none">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">
            {text.toDate}
          </span>
          <input
            type="date"
            name="to"
            defaultValue={toDate ?? ""}
            min={fromDate}
            max={defaultToDate}
            className="h-10 w-full rounded-xl border border-white/10 bg-[#12251d] px-3 py-0 text-sm text-white outline-none focus:border-amber-300/40"
          />
        </label>

        <div className="flex flex-none flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full border border-amber-300/30 bg-amber-300/15 px-3 text-sm font-medium text-amber-100 hover:bg-amber-300/20"
          >
            {text.applyFilters}
          </button>
          <Link
            href={resetHref}
            className="inline-flex h-10 items-center rounded-full border border-white/10 px-3 text-sm font-medium text-white/65 hover:border-amber-300/30 hover:text-amber-100"
          >
            {text.resetFilters}
          </Link>
        </div>
      </form>
    </section>
  );
}
