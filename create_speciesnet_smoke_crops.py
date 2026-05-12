import csv
import json
import ast
from pathlib import Path
from PIL import Image, ImageOps

root = Path("/opt/venaris-worker/detection-worker")
manifest = root / "benchmark_heubachwiesen_available_manifest.csv"
idx_path = root / "infrastructure/hetzner-worker/detection-benchmark/data/image_cache_index.json"
out_dir = root / "infrastructure/hetzner-worker/detection-benchmark/data/speciesnet_smoke_crops"
filelist = root / "infrastructure/hetzner-worker/detection-benchmark/data/speciesnet_smoke_filepaths.txt"

out_dir.mkdir(parents=True, exist_ok=True)

idx = json.loads(idx_path.read_text(encoding="utf-8"))
asset_to_path = {
    item["asset_id"]: item["local_path"]
    for item in idx["items"]
    if item.get("status") in ("downloaded", "cached") and item.get("local_path")
}

def parse_bbox(value):
    if not value or value == "null":
        return None
    return ast.literal_eval(value)

def pad_bbox(bb, pad=0.10):
    x, y, w, h = map(float, bb)
    x2 = max(0.0, x - pad * w)
    y2 = max(0.0, y - pad * h)
    w2 = min(1.0 - x2, w * (1 + 2 * pad))
    h2 = min(1.0 - y2, h * (1 + 2 * pad))
    return [x2, y2, w2, h2]

def crop_rel(img, bb):
    width, height = img.size
    x, y, w, h = bb
    left = max(0, min(width, round(x * width)))
    top = max(0, min(height, round(y * height)))
    right = max(left + 1, min(width, round((x + w) * width)))
    bottom = max(top + 1, min(height, round((y + h) * height)))
    return img.crop((left, top, right, bottom))

rows = []
with manifest.open("r", encoding="utf-8-sig", newline="") as f:
    for row in csv.DictReader(f):
        if row.get("benchmark_bucket") == "hard_case_corrected":
            rows.append(row)

selected = rows[:5]
paths = []

for row in selected:
    bbox = parse_bbox(row.get("md_bbox"))
    if not bbox:
        print("skip missing bbox", row.get("asset_id"), row.get("detection_id"))
        continue

    local_rel = asset_to_path.get(row["asset_id"])
    if not local_rel:
        print("skip missing image", row["asset_id"])
        continue

    img_path = root / local_rel
    img = Image.open(img_path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    crop = crop_rel(img, pad_bbox(bbox, 0.10))

    out_name = (
        f'{row["detection_id"]}'
        f'__auto-{row["current_auto_species"]}'
        f'__corrected-{row["corrected_species"]}.jpg'
    )
    out_path = out_dir / out_name
    crop.save(out_path, quality=92)
    paths.append(str(out_path))
    print("crop", out_path.name, crop.size)

filelist.write_text("\n".join(paths) + "\n", encoding="utf-8")
print("filelist:", filelist)
print("count:", len(paths))
