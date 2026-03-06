#!/usr/bin/env python3
import os, sys, json, argparse, tempfile, contextlib

def add_paths():
    base = os.path.dirname(__file__)
    md_repo = os.path.join(base, "MegaDetector")
    yolov5 = os.path.join(base, "yolov5")
    # YOLOv5 root VOR MegaDetector
    sys.path.insert(0, yolov5)
    sys.path.insert(0, md_repo)

def load_detector(model_path: str):
    import megadetector.detection.run_detector as rd
    return rd.load_detector(model_path)

def detect_one(det, image_path: str):
    import cv2
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        return {"file": image_path, "detections": [], "failure": "cv2.imread returned None"}

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    fn = getattr(det, "generate_detections_one_image", None)
    if fn is None:
        return {"file": image_path, "detections": [], "failure": "detector has no generate_detections_one_image"}

    last_err = None

    # try numpy-first variants
    try:
        res = fn(img_rgb)
        if isinstance(res, dict) and res.get("detections") is not None:
            if not res.get("file") or res.get("file") == "unknown":
                res["file"] = image_path
            return res
    except Exception as e:
        last_err = e

    for kwargs in (
        {"image": img_rgb, "image_id": image_path},
        {"image": img_rgb, "file": image_path},
        {"im": img_rgb, "image_id": image_path},
    ):
        try:
            res = fn(**kwargs)
            if isinstance(res, dict) and res.get("detections") is not None:
                if not res.get("file") or res.get("file") == "unknown":
                    res["file"] = image_path
                return res
        except Exception as e:
            last_err = e

    # last resort: path
    try:
        res = fn(image_path)
        if isinstance(res, dict) and res.get("detections") is not None:
            if not res.get("file") or res.get("file") == "unknown":
                res["file"] = image_path
            return res
    except Exception as e:
        last_err = e

    return {"file": image_path, "detections": [], "failure": f"{type(last_err).__name__}: {last_err}" if last_err else "unknown failure"}

def normalize(res: dict):
    label_map = {"1": "animal", "2": "human", "3": "vehicle"}
    min_conf = float(os.environ.get("MD_MIN_CONF", "0.2"))
    max_keep = int(os.environ.get("MD_MAX_DETECTIONS", "50"))

    dets = res.get("detections") or []
    out = []
    for d in dets:
        try:
            cat = str(d.get("category", ""))
            conf = float(d.get("conf", 0.0))
            bbox = d.get("bbox")
        except Exception:
            continue

        if conf < min_conf:
            continue

        label = label_map.get(cat)
        if not label:
            continue

        out.append({"label": label, "score": conf, "bbox": bbox})

    out.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    return out[:max_keep]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--model", default=os.environ.get("MEGADETECTOR_MODEL_PATH"))
    ap.add_argument("--outdir", default=None)
    args = ap.parse_args()

    if not args.model:
        print("ERROR: missing --model or MEGADETECTOR_MODEL_PATH", file=sys.stderr)
        sys.exit(2)

    add_paths()

    import megadetector.detection.run_detector as rd

    # Alles was MegaDetector/YOLO so erzählt -> STDERR umleiten
    with contextlib.redirect_stdout(sys.stderr):
        det = load_detector(args.model)
        res = detect_one(det, args.image)

        if args.outdir:
            try:
                os.makedirs(args.outdir, exist_ok=True)
                rd.load_and_run_detector(args.model, [args.image], args.outdir)
            except Exception as e:
                res.setdefault("warnings", []).append(f"render_failed:{type(e).__name__}:{e}")

    payload = {
        "file": res.get("file", args.image),
        "failure": res.get("failure"),
        "raw": res.get("detections"),
        "detections": normalize(res),
        "warnings": res.get("warnings", []),
    }

    # stdout: NUR JSON
    try:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    except BrokenPipeError:
        # z.B. wenn jq abbricht -> still beenden
        try:
            sys.stderr.flush()
        except Exception:
            pass
        sys.exit(0)

if __name__ == "__main__":
    main()
