#!/usr/bin/env python3
import json
import os
import sys
from typing import Dict, List, Tuple

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

from PIL import Image
import torch
from transformers import CLIPModel, CLIPProcessor

# ---- Taxonomy v1 (enum values) ----
TAXONOMY = [
    "roe_deer", "wild_boar", "red_deer", "fallow_deer", "mouflon",
    "fox", "wolf", "badger",
    "raccoon", "raccoon_dog",
    "hare", "rabbit",
    "pheasant", "crow",
    "other",
]

PROMPTS: Dict[str, List[str]] = {
    "roe_deer": ["a photo of a roe deer", "a photo of a roe buck", "a photo of a deer"],
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
    # "other" is NOT used as a competing class; it's a fallback if confidence is low
    "other": ["a photo of a wild animal"],
}

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

def load_bboxes(bboxes_path: str) -> List[List[float]]:
    with open(bboxes_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    b = data.get("bboxes")
    if not isinstance(b, list):
        raise ValueError('bboxes.json must contain {"bboxes":[[x,y,w,h],...]} with relative coords')
    return b

def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))

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
    W, H = img.size
    x, y, w, h = [float(v) for v in bbox]
    x1 = int(clamp(x, 0, 1) * W)
    y1 = int(clamp(y, 0, 1) * H)
    x2 = int(clamp(x + w, 0, 1) * W)
    y2 = int(clamp(y + h, 0, 1) * H)
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

def build_prompt_index() -> Tuple[List[str], List[str], Dict[str, List[int]]]:
    # We exclude "other" from the competing pool; it's only fallback.
    all_texts: List[str] = []
    prompt_species: List[str] = []
    species_to_idxs: Dict[str, List[int]] = {}

    for sp in TAXONOMY:
        if sp == "other":
            continue
        prompts = PROMPTS.get(sp) or [f"a photo of {sp.replace('_', ' ')}"]
        for t in prompts:
            idx = len(all_texts)
            all_texts.append(t)
            prompt_species.append(sp)
            species_to_idxs.setdefault(sp, []).append(idx)

    return prompt_species, all_texts, species_to_idxs

def get_text_feats(model: CLIPModel, processor: CLIPProcessor, texts: List[str], device: str) -> torch.Tensor:
    inputs = processor(text=texts, return_tensors="pt", padding=True, truncation=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        try:
            out = model.get_text_features(**inputs)
        except Exception:
            out = model(**inputs)
    feats = to_tensor_features(out)
    return l2_normalize(feats)

def get_image_feats(model: CLIPModel, processor: CLIPProcessor, image: Image.Image, device: str) -> torch.Tensor:
    inputs = processor(images=image, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        try:
            out = model.get_image_features(**inputs)
        except Exception:
            out = model(**inputs)
    feats = to_tensor_features(out)
    return l2_normalize(feats)

def main() -> None:
    if len(sys.argv) != 3:
        print(json.dumps({"failure": "usage: runner.py <image_path> <bboxes_json_path>", "results": []}, ensure_ascii=False))
        sys.exit(2)

    image_path = sys.argv[1]
    bboxes_path = sys.argv[2]

    model_name = os.environ.get("SPECIES_CLIP_MODEL", "openai/clip-vit-base-patch32")
    device = pick_device()

    # Two-stage decision:
    # 1) choose species by best cosine similarity
    # 2) if similarity too low => "other"
    sim_threshold = float(os.environ.get("SPECIES_SIM_THRESHOLD", "0.22"))
    bbox_pad = float(os.environ.get("SPECIES_BBOX_PAD", "0.08"))

    # Optional: also compute a species-softmax score (more interpretable)
    # If enabled, we softmax over 15 species (excluding "other") based on their best sim.
    do_species_softmax = (os.environ.get("SPECIES_SPECIES_SOFTMAX", "1") != "0")

    try:
        img = Image.open(image_path).convert("RGB")
        bboxes = load_bboxes(bboxes_path)
    except Exception as e:
        print(json.dumps({"file": image_path, "failure": f"input_load_failed:{e}", "results": []}, ensure_ascii=False))
        return

    try:
        model = CLIPModel.from_pretrained(model_name).to(device)
        processor = CLIPProcessor.from_pretrained(model_name)
        model.eval()
    except Exception as e:
        print(json.dumps({"file": image_path, "failure": f"clip_load_failed:{e}", "results": []}, ensure_ascii=False))
        return

    _, texts, species_to_idxs = build_prompt_index()

    try:
        text_feats = get_text_feats(model, processor, texts, device)  # [P, D]
    except Exception as e:
        print(json.dumps({"file": image_path, "failure": f"text_embed_failed:{e}", "results": []}, ensure_ascii=False))
        return

    results = []
    for i, bb in enumerate(bboxes):
        try:
            bb2 = pad_bbox(bb, bbox_pad)
            crop = crop_rel(img, bb2)
            img_feats = get_image_feats(model, processor, crop, device)  # [1, D]

            sims = (img_feats @ text_feats.T).squeeze(0)  # [P], cosine similarities

            # per-species: best sim among its prompts
            sp_sims: Dict[str, float] = {}
            for sp, idxs in species_to_idxs.items():
                sp_sims[sp] = float(sims[idxs].max().item())

            best_sp, best_sim = max(sp_sims.items(), key=lambda kv: kv[1])

            species_prob = None
            if do_species_softmax:
                # softmax over species similarities (15 classes)
                sp_list = list(sp_sims.keys())
                sp_vals = torch.tensor([sp_sims[s] for s in sp_list], dtype=torch.float32)
                sp_probs = torch.softmax(sp_vals, dim=0)
                species_prob = float(sp_probs[sp_list.index(best_sp)].item())

            final_sp = best_sp if best_sim >= sim_threshold else "other"

            out = {
                "i": i,
                "species": final_sp,
                "score": species_prob if species_prob is not None else best_sim,
                "sim": best_sim,
                "bbox": bb,
                "bbox_padded": bb2,
            }
            results.append(out)

        except Exception as e:
            results.append({"i": i, "species": "other", "score": 0.0, "sim": 0.0, "error": str(e)})

    print(json.dumps({
        "file": image_path,
        "failure": None,
        "device": device,
        "model": model_name,
        "sim_threshold": sim_threshold,
        "bbox_pad": bbox_pad,
        "results": results
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
