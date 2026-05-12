# infrastructure/hetzner-worker/detection-benchmark/run_clip_baseline.py #1

import csv
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

from PIL import Image
import torch
from transformers import CLIPModel, CLIPProcessor


ROOT = Path.cwd()

MANIFEST_PATH = ROOT / "benchmark_heubachwiesen_available_manifest.csv"
CACHE_INDEX_PATH = (
    ROOT
    / "infrastructure"
    / "hetzner-worker"
    / "detection-benchmark"
    / "data"
    / "image_cache_index.json"
)
OUT_DIR = (
    ROOT
    / "infrastructure"
    / "hetzner-worker"
    / "detection-benchmark"
    / "results"
)
OUT_PATH = OUT_DIR / "clip_baseline_results.csv"

MODEL_NAME = os.environ.get("SPECIES_CLIP_MODEL", "openai/clip-vit-base-patch32")
SIM_THRESHOLD = float(os.environ.get("SPECIES_SIM_THRESHOLD", "0.22"))

# Use 0.10 because the DB rows we inspected show species_bbox_pad = 0.1.
BBOX_PAD = float(os.environ.get("SPECIES_BBOX_PAD", "0.10"))

# Keep raw similarity as primary score because current stored DB rows have
# species_score == species_sim.
DO_SOFTMAX = os.environ.get("SPECIES_SPECIES_SOFTMAX", "0") != "0"

TAXONOMY = [
    "roe_deer",
    "wild_boar",
    "red_deer",
    "fallow_deer",
    "mouflon",
    "fox",
    "wolf",
    "badger",
    "raccoon",
    "raccoon_dog",
    "hare",
    "rabbit",
    "pheasant",
    "crow",
    "other",
]

PROMPTS: Dict[str, List[str]] = {
    "roe_deer": [
        "a photo of a roe deer",
        "a photo of a roe buck",
        "a photo of a deer",
    ],
    "wild_boar": ["a photo of a wild boar", "a photo of a boar"],
    "red_deer": ["a photo of a red deer", "a photo of a stag"],
    "fallow_deer": ["a photo of a fallow deer"],
    "mouflon": ["a photo of a mouflon", "a photo of a wild sheep"],
    "fox": ["a photo of a fox"],
    "wolf": ["a photo of a wolf"],
    "badger": ["a photo of a badger"],
    "raccoon": ["a photo of a raccoon"],
    "raccoon_dog": ["a photo of a raccoon dog", "a photo of a tanuki"],
    "hare": ["a photo of a hare"],
    "rabbit": ["a photo of a rabbit"],
    "pheasant": ["a photo of a pheasant"],
    "crow": ["a photo of a crow", "a photo of a raven"],
    # other is not a competing class; it is only a fallback.
    "other": ["a photo of a wild animal"],
}


def fail(message: str) -> None:
    raise SystemExit(f"\n❌ {message}")


def normalize_null(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "null":
        return None
    return text


def parse_bbox(value: str) -> List[float]:
    parsed = json.loads(value)
    if not isinstance(parsed, list) or len(parsed) != 4:
        raise ValueError(f"Invalid bbox: {value}")
    values = [float(v) for v in parsed]
    if not all(0 <= v <= 1 for v in values):
        # MegaDetector relative boxes should be 0..1. Keep this strict for benchmark hygiene.
        raise ValueError(f"BBox values outside 0..1: {value}")
    return values


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def pad_bbox(bb: List[float], pad: float) -> List[float]:
    x, y, w, h = [float(v) for v in bb]
    x2 = x + w
    y2 = y + h
    x = clamp(x - pad, 0, 1)
    y = clamp(y - pad, 0, 1)
    x2 = clamp(x2 + pad, 0, 1)
    y2 = clamp(y2 + pad, 0, 1)
    return [x, y, max(0.0, x2 - x), max(0.0, y2 - y)]


def crop_rel(img: Image.Image, bbox: List[float]) -> Image.Image:
    width, height = img.size
    x, y, w, h = [float(v) for v in bbox]

    x1 = int(clamp(x, 0, 1) * width)
    y1 = int(clamp(y, 0, 1) * height)
    x2 = int(clamp(x + w, 0, 1) * width)
    y2 = int(clamp(y + h, 0, 1) * height)

    if x2 <= x1 or y2 <= y1:
        return img.copy()

    return img.crop((x1, y1, x2, y2))


def pick_device() -> str:
    pref = (os.environ.get("SPECIES_DEVICE") or "auto").lower().strip()
    if pref == "cuda" and not torch.cuda.is_available():
        return "cpu"
    if pref in ("cpu", "cuda"):
        return pref
    return "cuda" if torch.cuda.is_available() else "cpu"


def to_tensor_features(x) -> torch.Tensor:
    if isinstance(x, torch.Tensor):
        return x
    for attr in ("text_embeds", "image_embeds"):
        if hasattr(x, attr) and isinstance(getattr(x, attr), torch.Tensor):
            return getattr(x, attr)
    if hasattr(x, "pooler_output") and isinstance(x.pooler_output, torch.Tensor):
        return x.pooler_output
    if hasattr(x, "last_hidden_state") and isinstance(x.last_hidden_state, torch.Tensor):
        return x.last_hidden_state[:, 0, :]
    raise TypeError(f"Cannot unwrap features tensor from type={type(x)}")


def l2_normalize(feats: torch.Tensor) -> torch.Tensor:
    if feats.dim() == 1:
        feats = feats.unsqueeze(0)
    denom = feats.norm(dim=-1, keepdim=True).clamp(min=1e-12)
    return feats / denom


def build_prompt_index() -> Tuple[List[str], List[str], Dict[str, List[int]]]:
    all_texts: List[str] = []
    prompt_species: List[str] = []
    species_to_idxs: Dict[str, List[int]] = {}

    for species in TAXONOMY:
        if species == "other":
            continue

        prompts = PROMPTS.get(species) or [f"a photo of {species.replace('_', ' ')}"]

        for prompt in prompts:
            idx = len(all_texts)
            all_texts.append(prompt)
            prompt_species.append(species)
            species_to_idxs.setdefault(species, []).append(idx)

    return prompt_species, all_texts, species_to_idxs


def get_text_feats(
    model: CLIPModel,
    processor: CLIPProcessor,
    texts: List[str],
    device: str,
) -> torch.Tensor:
    inputs = processor(text=texts, return_tensors="pt", padding=True, truncation=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        try:
            out = model.get_text_features(**inputs)
        except Exception:
            out = model(**inputs)

    return l2_normalize(to_tensor_features(out))


def get_image_feats(
    model: CLIPModel,
    processor: CLIPProcessor,
    image: Image.Image,
    device: str,
) -> torch.Tensor:
    inputs = processor(images=image, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        try:
            out = model.get_image_features(**inputs)
        except Exception:
            out = model(**inputs)

    return l2_normalize(to_tensor_features(out))


def load_cache_index() -> Dict[str, Path]:
    if not CACHE_INDEX_PATH.exists():
        fail(f"Missing image cache index: {CACHE_INDEX_PATH}")

    data = json.loads(CACHE_INDEX_PATH.read_text(encoding="utf-8"))

    result: Dict[str, Path] = {}

    for item in data.get("items", []):
        status = item.get("status")
        asset_id = item.get("asset_id")
        local_path = item.get("local_path")

        if status not in ("downloaded", "cached"):
            continue
        if not asset_id or not local_path:
            continue

        path = ROOT / local_path

        if path.exists() and path.stat().st_size > 0:
            result[asset_id] = path

    return result


def classify_crop(
    model: CLIPModel,
    processor: CLIPProcessor,
    text_feats: torch.Tensor,
    species_to_idxs: Dict[str, List[int]],
    img: Image.Image,
    bbox: List[float],
    device: str,
) -> Dict[str, object]:
    padded = pad_bbox(bbox, BBOX_PAD)
    crop = crop_rel(img, padded)

    img_feats = get_image_feats(model, processor, crop, device)
    sims = (img_feats @ text_feats.T).squeeze(0)

    species_sims: Dict[str, float] = {}
    for species, idxs in species_to_idxs.items():
        species_sims[species] = float(sims[idxs].max().item())

    ranked = sorted(species_sims.items(), key=lambda kv: kv[1], reverse=True)
    best_species, best_sim = ranked[0]

    softmax_prob = None
    if DO_SOFTMAX:
        species_list = list(species_sims.keys())
        vals = torch.tensor([species_sims[s] for s in species_list], dtype=torch.float32)
        probs = torch.softmax(vals, dim=0)
        softmax_prob = float(probs[species_list.index(best_species)].item())

    final_species = best_species if best_sim >= SIM_THRESHOLD else "other"

    return {
        "pred_species": final_species,
        "best_raw_species": best_species,
        "score": softmax_prob if softmax_prob is not None else best_sim,
        "sim": best_sim,
        "softmax_prob": softmax_prob,
        "bbox_padded": padded,
        "top1_species": ranked[0][0] if len(ranked) > 0 else None,
        "top1_sim": ranked[0][1] if len(ranked) > 0 else None,
        "top2_species": ranked[1][0] if len(ranked) > 1 else None,
        "top2_sim": ranked[1][1] if len(ranked) > 1 else None,
        "top3_species": ranked[2][0] if len(ranked) > 2 else None,
        "top3_sim": ranked[2][1] if len(ranked) > 2 else None,
        "top5_json": json.dumps(
            [{"species": species, "sim": sim} for species, sim in ranked[:5]],
            ensure_ascii=False,
        ),
    }


def main() -> None:
    print("Venaris CLIP baseline benchmark")
    print("===============================")
    print(f"Root:      {ROOT}")
    print(f"Manifest:  {MANIFEST_PATH}")
    print(f"Cache:     {CACHE_INDEX_PATH}")
    print(f"Output:    {OUT_PATH}")
    print(f"Model:     {MODEL_NAME}")
    print(f"Threshold: {SIM_THRESHOLD}")
    print(f"BBox pad:  {BBOX_PAD}")
    print(f"Softmax:   {1 if DO_SOFTMAX else 0}")

    if not MANIFEST_PATH.exists():
        fail(f"Missing manifest: {MANIFEST_PATH}")

    cache = load_cache_index()

    with MANIFEST_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    rows = [row for row in rows if row.get("asset_id") in cache]

    if not rows:
        fail("No manifest rows have cached images.")

    device = pick_device()
    print(f"Device:    {device}")
    print(f"Rows:      {len(rows)}")

    prompt_species, texts, species_to_idxs = build_prompt_index()

    print(f"Prompts:   {len(texts)}")
    print(f"Species:   {len(species_to_idxs)} competing classes")

    model = CLIPModel.from_pretrained(MODEL_NAME).to(device)
    processor = CLIPProcessor.from_pretrained(MODEL_NAME)
    model.eval()

    text_feats = get_text_feats(model, processor, texts, device)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    out_fields = [
        "asset_id",
        "detection_id",
        "storage_path",
        "local_path",
        "camera_name",
        "benchmark_bucket",
        "current_auto_species",
        "corrected_species",
        "effective_species",
        "md_animal_score",
        "clip_species_score_db",
        "md_bbox",
        "bbox_padded",
        "model",
        "sim_threshold",
        "bbox_pad",
        "pred_species",
        "best_raw_species",
        "score",
        "sim",
        "softmax_prob",
        "top1_species",
        "top1_sim",
        "top2_species",
        "top2_sim",
        "top3_species",
        "top3_sim",
        "top5_json",
        "matches_effective_species",
        "matches_corrected_species_if_present",
        "error",
    ]

    written = 0
    errors = 0

    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields)
        writer.writeheader()

        for index, row in enumerate(rows, start=1):
            asset_id = row.get("asset_id", "")
            image_path = cache.get(asset_id)

            base_out = {
                "asset_id": asset_id,
                "detection_id": row.get("detection_id", ""),
                "storage_path": row.get("storage_path", ""),
                "local_path": str(image_path.relative_to(ROOT)) if image_path else "",
                "camera_name": row.get("camera_name", ""),
                "benchmark_bucket": row.get("benchmark_bucket", ""),
                "current_auto_species": row.get("current_auto_species", ""),
                "corrected_species": normalize_null(row.get("corrected_species")) or "",
                "effective_species": row.get("effective_species", ""),
                "md_animal_score": row.get("md_animal_score", ""),
                "clip_species_score_db": row.get("clip_species_score", ""),
                "md_bbox": row.get("md_bbox", ""),
                "model": MODEL_NAME,
                "sim_threshold": SIM_THRESHOLD,
                "bbox_pad": BBOX_PAD,
            }

            try:
                if not image_path or not image_path.exists():
                    raise FileNotFoundError(f"Missing cached image for asset_id={asset_id}")

                bbox = parse_bbox(row.get("md_bbox", ""))
                img = Image.open(image_path).convert("RGB")

                result = classify_crop(
                    model=model,
                    processor=processor,
                    text_feats=text_feats,
                    species_to_idxs=species_to_idxs,
                    img=img,
                    bbox=bbox,
                    device=device,
                )

                corrected = normalize_null(row.get("corrected_species"))
                effective = row.get("effective_species", "")
                pred = str(result["pred_species"])

                writer.writerow(
                    {
                        **base_out,
                        **result,
                        "bbox_padded": json.dumps(result["bbox_padded"]),
                        "matches_effective_species": "1" if pred == effective else "0",
                        "matches_corrected_species_if_present": (
                            "" if corrected is None else ("1" if pred == corrected else "0")
                        ),
                        "error": "",
                    }
                )

                written += 1

                if index % 25 == 0:
                    print(f"Processed {index}/{len(rows)} rows...")

            except Exception as e:
                errors += 1
                writer.writerow(
                    {
                        **base_out,
                        "bbox_padded": "",
                        "pred_species": "",
                        "best_raw_species": "",
                        "score": "",
                        "sim": "",
                        "softmax_prob": "",
                        "top1_species": "",
                        "top1_sim": "",
                        "top2_species": "",
                        "top2_sim": "",
                        "top3_species": "",
                        "top3_sim": "",
                        "top5_json": "",
                        "matches_effective_species": "",
                        "matches_corrected_species_if_present": "",
                        "error": str(e),
                    }
                )

    print("\nSummary")
    print("-------")
    print(f"written: {written}")
    print(f"errors:  {errors}")
    print(f"output:  {OUT_PATH}")

    if errors:
        fail("CLIP baseline completed with row errors. Inspect output CSV.")

    print("\n✅ CLIP baseline finished.")


if __name__ == "__main__":
    main()