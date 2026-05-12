#!/usr/bin/env python3
# species/speciesnet_runner.py #1

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

from speciesnet_venaris_map import (
    best_venaris_species_from_speciesnet_classifications,
)


MODEL_NAME = os.environ.get(
    "SPECIESNET_MODEL",
    "kaggle:google/speciesnet/pyTorch/v4.0.2a/1",
)

COUNTRY = os.environ.get("SPECIESNET_COUNTRY", "DEU")
ADMIN1_REGION = os.environ.get("SPECIESNET_ADMIN1_REGION", "DE-NW")
BBOX_PAD = float(os.environ.get("SPECIES_BBOX_PAD", "0.10"))
BATCH_SIZE = os.environ.get("SPECIESNET_BATCH_SIZE", "8")


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def load_bboxes(path: str) -> list[list[float]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    bboxes = data.get("bboxes")
    if not isinstance(bboxes, list):
        raise ValueError('bboxes.json must contain {"bboxes":[[x,y,w,h],...]}')

    out: list[list[float]] = []
    for bb in bboxes:
        if not isinstance(bb, list) or len(bb) != 4:
            raise ValueError(f"Invalid bbox: {bb}")
        out.append([float(x) for x in bb])

    return out


def pad_bbox(bb: list[float], pad: float) -> list[float]:
    x, y, w, h = bb
    x2 = x + w
    y2 = y + h

    x = clamp(x - pad, 0.0, 1.0)
    y = clamp(y - pad, 0.0, 1.0)
    x2 = clamp(x2 + pad, 0.0, 1.0)
    y2 = clamp(y2 + pad, 0.0, 1.0)

    return [x, y, max(0.0, x2 - x), max(0.0, y2 - y)]


def crop_rel(img: Image.Image, bbox: list[float]) -> Image.Image:
    width, height = img.size
    x, y, w, h = bbox

    x1 = int(clamp(x, 0.0, 1.0) * width)
    y1 = int(clamp(y, 0.0, 1.0) * height)
    x2 = int(clamp(x + w, 0.0, 1.0) * width)
    y2 = int(clamp(y + h, 0.0, 1.0) * height)

    if x2 <= x1 or y2 <= y1:
        return img.copy()

    return img.crop((x1, y1, x2, y2))


def read_predictions(path: Path) -> dict[str, dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, dict[str, Any]] = {}

    for pred in data.get("predictions", []):
        filepath = pred.get("filepath")
        if filepath:
            out[str(filepath)] = pred

    return out


def run_speciesnet(filepaths_txt: Path, predictions_json: Path) -> None:
    cmd = [
        sys.executable,
        "-m",
        "speciesnet.scripts.run_model",
        "--classifier_only",
        "--filepaths_txt",
        str(filepaths_txt),
        "--predictions_json",
        str(predictions_json),
        "--country",
        COUNTRY,
        "--admin1_region",
        ADMIN1_REGION,
        "--batch_size",
        str(BATCH_SIZE),
        "--model",
        MODEL_NAME,
        "--bypass_prompts",
        "--ignore_existing_predictions",
        "--noprogress_bars",
    ]

    completed = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )

    if completed.returncode != 0:
        raise RuntimeError(
            "speciesnet_failed "
            f"code={completed.returncode} "
            f"stdout={completed.stdout[-1000:]} "
            f"stderr={completed.stderr[-1000:]}"
        )


def main() -> None:
    if len(sys.argv) != 3:
        print(
            json.dumps(
                {
                    "failure": "usage: speciesnet_runner.py <image_path> <bboxes_json_path>",
                    "results": [],
                },
                ensure_ascii=False,
            )
        )
        sys.exit(2)

    image_path = sys.argv[1]
    bboxes_path = sys.argv[2]

    try:
        bboxes = load_bboxes(bboxes_path)
        img = Image.open(image_path)
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception as e:
        print(
            json.dumps(
                {
                    "file": image_path,
                    "failure": f"input_load_failed:{e}",
                    "results": [],
                },
                ensure_ascii=False,
            )
        )
        return

    results: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix="venaris_speciesnet_") as tmp:
        tmpdir = Path(tmp)
        crop_paths: list[Path] = []

        try:
            for i, bb in enumerate(bboxes):
                padded = pad_bbox(bb, BBOX_PAD)
                crop = crop_rel(img, padded)

                crop_path = tmpdir / f"crop_{i:03d}.jpg"
                crop.save(crop_path, format="JPEG", quality=92)

                crop_paths.append(crop_path)

            filepaths_txt = tmpdir / "filepaths.txt"
            predictions_json = tmpdir / "predictions.json"

            filepaths_txt.write_text(
                "\n".join(str(p.resolve()) for p in crop_paths) + "\n",
                encoding="utf-8",
            )

            run_speciesnet(filepaths_txt, predictions_json)
            predictions_by_path = read_predictions(predictions_json)

            for i, crop_path in enumerate(crop_paths):
                pred = predictions_by_path.get(str(crop_path.resolve())) or {}
                classifications = pred.get("classifications") or {}

                classes = classifications.get("classes") or []
                scores = classifications.get("scores") or []

                mapped = best_venaris_species_from_speciesnet_classifications(
                    classes=classes,
                    scores=scores,
                )

                results.append(
                    {
                        "i": i,
                        "species": mapped.species,
                        "score": mapped.score,
                        "sim": mapped.score,
                        "bbox": bboxes[i],
                        "bbox_padded": pad_bbox(bboxes[i], BBOX_PAD),
                        "raw_label": mapped.raw_label,
                        "raw_common_name": mapped.raw_common_name,
                        "raw_taxon_id": mapped.raw_taxon_id,
                        "mapping_reason": mapped.reason,
                    }
                )

            print(
                json.dumps(
                    {
                        "file": image_path,
                        "failure": None,
                        "device": "cpu",
                        "model": "google/speciesnet/v4.0.2a/classifier_crop",
                        "sim_threshold": None,
                        "bbox_pad": BBOX_PAD,
                        "results": results,
                    },
                    ensure_ascii=False,
                )
            )

        except Exception as e:
            print(
                json.dumps(
                    {
                        "file": image_path,
                        "failure": f"speciesnet_runner_failed:{e}",
                        "model": "google/speciesnet/v4.0.2a/classifier_crop",
                        "sim_threshold": None,
                        "bbox_pad": BBOX_PAD,
                        "results": results,
                    },
                    ensure_ascii=False,
                )
            )


if __name__ == "__main__":
    main()