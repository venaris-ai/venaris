import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path("/opt/venaris-worker/detection-worker")
PREDICTIONS = ROOT / "infrastructure/hetzner-worker/detection-benchmark/results/speciesnet_predictions.json"
CROP_META = ROOT / "infrastructure/hetzner-worker/detection-benchmark/data/speciesnet_crop_manifest.csv"
OUT_CSV = ROOT / "infrastructure/hetzner-worker/detection-benchmark/results/speciesnet_crops_results.csv"

def speciesnet_label_to_venaris(label):
    parts = (label or "").split(";")
    # Expected: id;class;order;family;genus;species;common_name
    tax_class = parts[1] if len(parts) > 1 else ""
    order = parts[2] if len(parts) > 2 else ""
    family = parts[3] if len(parts) > 3 else ""
    genus = parts[4] if len(parts) > 4 else ""
    species = parts[5] if len(parts) > 5 else ""
    common = parts[6].lower() if len(parts) > 6 else ""

    if "european hare" in common or (genus == "lepus" and species == "europaeus"):
        return "hare"
    if "eastern cottontail" in common or "cottontail" in common or species == "floridanus":
        return "rabbit"
    if "red fox" in common or (genus == "vulpes" and species == "vulpes"):
        return "fox"
    if "gray wolf" in common or "grey wolf" in common or (genus == "canis" and species == "lupus"):
        return "wolf"
    if "eurasian badger" in common or (genus == "meles" and species == "meles"):
        return "badger"
    if "raccoon dog" in common or (genus == "nyctereutes" and species == "procyonoides"):
        return "raccoon_dog"
    if common == "raccoon" or (genus == "procyon" and species == "lotor"):
        return "raccoon"
    if "wild boar" in common or (genus == "sus" and species == "scrofa"):
        return "wild_boar"
    if "roe deer" in common or (genus == "capreolus" and species == "capreolus"):
        return "roe_deer"
    if "red deer" in common or (genus == "cervus" and species == "elaphus"):
        return "red_deer"
    if "fallow deer" in common or (genus == "dama" and species == "dama"):
        return "fallow_deer"
    if "mouflon" in common or (genus == "ovis" and species in ("gmelini", "aries")):
        return "mouflon"
    if "pheasant" in common:
        return "pheasant"
    if "crow" in common or "raven" in common or genus == "corvus":
        return "crow"

    # Coarse fallback for Venaris v1 taxonomy.
    if tax_class == "aves":
        return "crow" if "crow" in common or genus == "corvus" else "other"
    return "other"

def top_classification(pred):
    cls = pred.get("classifications") or {}
    classes = cls.get("classes") or []
    scores = cls.get("scores") or []
    if not classes or not scores:
        return "", "", ""
    label = classes[0]
    score = scores[0]
    mapped = speciesnet_label_to_venaris(label)
    return label, score, mapped

def main():
    meta_rows = []
    with CROP_META.open("r", encoding="utf-8-sig", newline="") as f:
        meta_rows = list(csv.DictReader(f))

    meta_by_path = {r["crop_path"]: r for r in meta_rows}
    data = json.loads(PREDICTIONS.read_text(encoding="utf-8"))

    results = []
    for pred in data.get("predictions", []):
        crop_path = pred.get("filepath")
        meta = meta_by_path.get(crop_path)
        if not meta:
            continue

        label, score, mapped = top_classification(pred)
        error = ""
        if "failures" in pred:
            error = json.dumps(pred["failures"], ensure_ascii=False)

        row = {
            **meta,
            "speciesnet_top_label": label,
            "speciesnet_top_score": score,
            "speciesnet_mapped_species": mapped,
            "speciesnet_correct_vs_effective": str(mapped == meta.get("effective_species")).lower(),
            "speciesnet_correct_vs_corrected": str(
                bool(meta.get("corrected_species")) and mapped == meta.get("corrected_species")
            ).lower(),
            "speciesnet_error": error,
        }
        results.append(row)

    fieldnames = list(results[0].keys()) if results else []
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    valid = [r for r in results if not r.get("speciesnet_error")]
    hard = [r for r in valid if r.get("benchmark_bucket") == "hard_case_corrected"]
    auto_only = [r for r in valid if r.get("benchmark_bucket") == "auto_only"]

    print("Venaris SpeciesNet crop benchmark summary")
    print("=========================================")
    print(f"predictions:      {len(data.get('predictions', []))}")
    print(f"joined results:   {len(results)}")
    print(f"valid results:    {len(valid)}")
    print(f"hard valid:       {len(hard)}")
    print(f"auto_only valid:  {len(auto_only)}")
    print(f"output:           {OUT_CSV}")

    if hard:
        old_auto_ok = sum(1 for r in hard if r.get("current_auto_species") == r.get("corrected_species"))
        sn_ok = sum(1 for r in hard if r.get("speciesnet_mapped_species") == r.get("corrected_species"))
        print()
        print("Hard-case accuracy against corrected_species")
        print("--------------------------------------------")
        print(f"current_auto: {old_auto_ok}/{len(hard)} = {old_auto_ok/len(hard):.3f}")
        print(f"speciesnet:   {sn_ok}/{len(hard)} = {sn_ok/len(hard):.3f}")

        print()
        print("Hard confusions: current_auto -> corrected -> speciesnet")
        print("-------------------------------------------------------")
        c = Counter(
            (r.get("current_auto_species"), r.get("corrected_species"), r.get("speciesnet_mapped_species"))
            for r in hard
        )
        for (old, corrected, pred), n in c.most_common(30):
            print(f"{n:>3} {old:>12} -> {corrected:<12} | speciesnet={pred}")

    print()
    print("SpeciesNet mapped predictions")
    print("-----------------------------")
    for sp, n in Counter(r.get("speciesnet_mapped_species") for r in valid).most_common():
        print(f"{sp:>12} {n:>4}")

    print()
    print("Top raw SpeciesNet labels")
    print("-------------------------")
    for label, n in Counter(r.get("speciesnet_top_label") for r in valid).most_common(20):
        print(f"{n:>4} {label}")

if __name__ == "__main__":
    main()
