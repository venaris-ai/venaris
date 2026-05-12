import ast
import csv
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path("/opt/venaris-worker/detection-worker")
MANIFEST = ROOT / "benchmark_heubachwiesen_available_manifest.csv"
INDEX = ROOT / "infrastructure/hetzner-worker/detection-benchmark/data/image_cache_index.json"
OUT_DIR = ROOT / "infrastructure/hetzner-worker/detection-benchmark/data/speciesnet_crops"
FILELIST = ROOT / "infrastructure/hetzner-worker/detection-benchmark/data/speciesnet_filepaths.txt"
CROP_META = ROOT / "infrastructure/hetzner-worker/detection-benchmark/data/speciesnet_crop_manifest.csv"
PAD = 0.10

def parse_bbox(value):
    if not value or value == "null":
        return None
    try:
        bbox = ast.literal_eval(value)
    except Exception:
        return None
    if not isinstance(bbox, list) or len(bbox) != 4:
        return None
    try:
        x, y, w, h = [float(v) for v in bbox]
    except Exception:
        return None
    if w <= 0 or h <= 0:
        return None
    return [x, y, w, h]

def pad_bbox(bb, pad=PAD):
    x, y, w, h = bb
    x2 = max(0.0, x - pad * w)
    y2 = max(0.0, y - pad * h)
    w2 = min(1.0 - x2, w * (1.0 + 2.0 * pad))
    h2 = min(1.0 - y2, h * (1.0 + 2.0 * pad))
    return [x2, y2, w2, h2]

def crop_rel(img, bb):
    width, height = img.size
    x, y, w, h = bb
    left = max(0, min(width, round(x * width)))
    top = max(0, min(height, round(y * height)))
    right = max(left + 1, min(width, round((x + w) * width)))
    bottom = max(top + 1, min(height, round((y + h) * height)))
    return img.crop((left, top, right, bottom))

def safe(value):
    return str(value or "").replace("/", "_").replace("\\", "_").replace(" ", "_")

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    FILELIST.parent.mkdir(parents=True, exist_ok=True)
    CROP_META.parent.mkdir(parents=True, exist_ok=True)

    idx = json.loads(INDEX.read_text(encoding="utf-8"))
    asset_to_path = {
        item["asset_id"]: item["local_path"]
        for item in idx.get("items", [])
        if item.get("status") in ("downloaded", "cached") and item.get("local_path")
    }

    rows = []
    with MANIFEST.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    paths = []
    meta_rows = []
    skipped = []

    for row in rows:
        bbox = parse_bbox(row.get("md_bbox"))
        if bbox is None:
            skipped.append((row.get("asset_id"), row.get("detection_id"), "missing_or_invalid_bbox"))
            continue

        local_rel = asset_to_path.get(row.get("asset_id"))
        if not local_rel:
            skipped.append((row.get("asset_id"), row.get("detection_id"), "missing_cached_image"))
            continue

        image_path = ROOT / local_rel
        if not image_path.exists():
            skipped.append((row.get("asset_id"), row.get("detection_id"), "local_image_not_found"))
            continue

        try:
            img = Image.open(image_path)
            img = ImageOps.exif_transpose(img).convert("RGB")
            crop = crop_rel(img, pad_bbox(bbox))
        except Exception as exc:
            skipped.append((row.get("asset_id"), row.get("detection_id"), f"crop_failed:{exc}"))
            continue

        out_name = (
            f'{safe(row.get("detection_id"))}'
            f'__asset-{safe(row.get("asset_id"))}'
            f'__auto-{safe(row.get("current_auto_species"))}'
            f'__corrected-{safe(row.get("corrected_species"))}'
            f'__effective-{safe(row.get("effective_species"))}.jpg'
        )
        out_path = OUT_DIR / out_name

        try:
            crop.save(out_path, quality=92)
        except Exception as exc:
            skipped.append((row.get("asset_id"), row.get("detection_id"), f"save_failed:{exc}"))
            continue

        crop_w, crop_h = crop.size
        path_str = str(out_path)
        paths.append(path_str)
        meta_rows.append({
            **row,
            "crop_path": path_str,
            "crop_width": crop_w,
            "crop_height": crop_h,
            "crop_area_px": crop_w * crop_h,
            "bbox_pad": PAD,
        })

    FILELIST.write_text("\n".join(paths) + ("\n" if paths else ""), encoding="utf-8")

    fieldnames = list(meta_rows[0].keys()) if meta_rows else []
    with CROP_META.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(meta_rows)

    print("Venaris SpeciesNet crop preparation")
    print("===================================")
    print(f"manifest rows:   {len(rows)}")
    print(f"crops written:   {len(meta_rows)}")
    print(f"skipped:         {len(skipped)}")
    print(f"filelist:        {FILELIST}")
    print(f"crop manifest:   {CROP_META}")
    print(f"crop dir:        {OUT_DIR}")

    if skipped:
        print()
        print("Skipped rows:")
        for asset_id, detection_id, reason in skipped[:30]:
            print(f"- asset={asset_id} detection={detection_id} reason={reason}")
        if len(skipped) > 30:
            print(f"... {len(skipped) - 30} more")

if __name__ == "__main__":
    main()
