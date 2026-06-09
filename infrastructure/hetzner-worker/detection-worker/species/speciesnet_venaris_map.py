# infrastructure/hetzner-worker/detection-worker/species/speciesnet_venaris_map.py #3

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


VENARIS_SPECIES = {
    "badger",
    "bear",
    "bobcat",
    "canada_goose",
    "chamois",
    "crow",
    "egyptian_goose",
    "fallow_deer",
    "fox",
    "golden_jackal",
    "greylag_goose",
    "hare",
    "magpie",
    "mallard",
    "mink",
    "moose",
    "mouflon",
    "nutria",
    "other",
    "pheasant",
    "pine_marten",
    "rabbit",
    "raccoon",
    "raccoon_dog",
    "red_deer",
    "roe_deer",
    "stoat",
    "stone_marten",
    "wild_boar",
    "wolf",
    "woodcock",
}


# Primary, deterministic mapping based on SpeciesNet taxonomy fields:
# taxon_id;kingdom;order;family;genus;species;common_name
#
# This must stay conservative: only exact genus/species pairs that map cleanly
# to a Venaris target species belong here.
EXACT_TAXON_TO_VENARIS = {
    # Deer / cervids.
    ("capreolus", "capreolus"): "roe_deer",
    ("cervus", "elaphus"): "red_deer",
    ("dama", "dama"): "fallow_deer",
    ("alces", "alces"): "moose",

    # Suidae.
    ("sus", "scrofa"): "wild_boar",

    # Canids.
    ("vulpes", "vulpes"): "fox",
    ("canis", "lupus"): "wolf",
    ("canis", "aureus"): "golden_jackal",
    ("nyctereutes", "procyonoides"): "raccoon_dog",

    # Mustelids.
    ("meles", "meles"): "badger",
    ("martes", "martes"): "pine_marten",
    ("martes", "foina"): "stone_marten",
    ("mustela", "erminea"): "stoat",
    ("neogale", "vison"): "mink",
    ("mustela", "lutreola"): "mink",

    # Procyonids / rodents.
    ("procyon", "lotor"): "raccoon",
    ("myocastor", "coypus"): "nutria",

    # Lagomorphs.
    ("lepus", "europaeus"): "hare",
    ("oryctolagus", "cuniculus"): "rabbit",

    # Birds.
    ("phasianus", "colchicus"): "pheasant",
    ("corvus", "corone"): "crow",
    ("pica", "pica"): "magpie",
    ("anser", "anser"): "greylag_goose",
    ("branta", "canadensis"): "canada_goose",
    ("alopochen", "aegyptiaca"): "egyptian_goose",
    ("anas", "platyrhynchos"): "mallard",
    ("scolopax", "rusticola"): "woodcock",

    # Large predators / cats.
    ("lynx", "rufus"): "bobcat",
}


@dataclass(frozen=True)
class SpeciesNetLabel:
    raw: str
    taxon_id: str
    kingdom: str
    order: str
    family: str
    genus: str
    species: str
    common_name: str


@dataclass(frozen=True)
class VenarisSpeciesPrediction:
    species: str
    score: float
    raw_label: str
    raw_common_name: str
    raw_taxon_id: str
    reason: str


def _norm(value: Any) -> str:
    return str(value or "").strip().lower()


def parse_speciesnet_label(raw_label: Any) -> SpeciesNetLabel:
    raw = str(raw_label or "").strip()
    parts = raw.split(";")

    while len(parts) < 7:
        parts.append("")

    return SpeciesNetLabel(
        raw=raw,
        taxon_id=parts[0].strip(),
        kingdom=_norm(parts[1]),
        order=_norm(parts[2]),
        family=_norm(parts[3]),
        genus=_norm(parts[4]),
        species=_norm(parts[5]),
        common_name=_norm(parts[6]),
    )


def _score_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _assert_venaris_species(species: str) -> None:
    if species not in VENARIS_SPECIES:
        raise ValueError(f"Mapped species is not in VENARIS_SPECIES: {species}")


def _common_has_word(common: str, word: str) -> bool:
    return word in common.replace("-", " ").split()


def map_speciesnet_label_to_venaris(raw_label: Any) -> tuple[str, str]:
    label = parse_speciesnet_label(raw_label)

    common = label.common_name
    genus = label.genus
    species = label.species
    family = label.family
    order = label.order

    # Explicit non-animal / unknown SpeciesNet categories.
    if common in {"blank", "unknown", "vehicle", "human"}:
        return "other", f"non_target_common:{common}"

    exact_taxon = EXACT_TAXON_TO_VENARIS.get((genus, species))
    if exact_taxon:
        return exact_taxon, f"exact_taxon:{genus}_{species}"

    # Deer / cervids.
    if "european roe deer" in common or common == "roe deer":
        return "roe_deer", "common_name:roe_deer"

    if common == "red deer" or "european red deer" in common:
        return "red_deer", "common_name:red_deer"

    if "fallow deer" in common:
        return "fallow_deer", "common_name:fallow_deer"

    # Keep this intentionally narrow:
    # SpeciesNet uses "elk" for cervus canadensis, which must not map to Venaris moose.
    if genus == "alces" or common == "moose":
        return "moose", "taxon_or_common:moose"

    # Bovids / mountain game.
    if "mouflon" in common:
        return "mouflon", "common_name:mouflon"

    if genus == "rupicapra" or "chamois" in common:
        return "chamois", "taxon_or_common:chamois"

    # Suidae.
    if "wild boar" in common or "feral hog" in common or "feral pig" in common:
        return "wild_boar", "common_name:wild_boar"

    # Canids.
    if "red fox" in common or common == "fox":
        return "fox", "common_name:fox"

    if common == "wolf" or "gray wolf" in common or "grey wolf" in common:
        return "wolf", "common_name:wolf"

    if "golden jackal" in common:
        return "golden_jackal", "common_name:golden_jackal"

    if "raccoon dog" in common:
        return "raccoon_dog", "common_name:raccoon_dog"

    # Mustelids.
    # Pragmatic Venaris grouping: clear badger species route to badger,
    # but do not map all Mustelidae broadly.
    if common in {
        "badger",
        "eurasian badger",
        "greater hog badger",
        "american badger",
        "honey badger",
    } or common.endswith(" badger"):
        return "badger", "pragmatic_badger_group"

    if "pine marten" in common:
        return "pine_marten", "common_name:pine_marten"

    if "stone marten" in common or "beech marten" in common:
        return "stone_marten", "common_name:stone_marten"

    if common in {"stoat", "ermine"} or "short-tailed weasel" in common:
        return "stoat", "common_name:stoat"

    if "american mink" in common or "european mink" in common or common == "mink":
        return "mink", "common_name:mink"

    # Procyonids / rodents.
    if common == "raccoon" or "northern raccoon" in common:
        return "raccoon", "common_name:raccoon"

    if common in {"nutria", "coypu"} or "myocastor" in common:
        return "nutria", "common_name:nutria"

    # Lagomorphs.
    if "european hare" in common or common == "hare":
        return "hare", "common_name:hare"

    # SpeciesNet sometimes predicts other Lepus species for European hare-like crops.
    if genus == "lepus" and order == "lagomorpha":
        return "hare", "genus_fallback:lepus"

    if "european rabbit" in common or common == "rabbit":
        return "rabbit", "common_name:rabbit"

    # Product decision: Venaris rabbit is pragmatic "Kaninchen/rabbit".
    # Sylvilagus rabbits/cottontails should not fall to other.
    if genus == "sylvilagus" and order == "lagomorpha":
        return "rabbit", "pragmatic_sylvilagus_rabbit_group"

    if "cottontail" in common:
        return "rabbit", "pragmatic_cottontail_rabbit_group"

    # Birds.
    # Keep pheasant narrow. The earlier broad "* pheasant" fallback created
    # false concrete hits for non-pheasant bird crops such as woodcock tests.
    if common in {"pheasant", "common pheasant", "ring-necked pheasant"}:
        return "pheasant", "common_name:pheasant"

    # Pica/magpie must be checked before Corvus/crow so magpies never drift to crow.
    if genus == "pica" and family == "corvidae":
        return "magpie", "pragmatic_pica_group"

    if common in {"magpie", "common magpie", "eurasian magpie", "black-billed magpie"}:
        return "magpie", "pragmatic_pica_group"

    # Product decision: for Venaris, clear Corvus candidates are more useful as crow
    # than as other. Do not map generic bird or generic Corvidae family here.
    if genus == "corvus" and family == "corvidae":
        return "crow", "pragmatic_corvus_group"

    if common in {
        "crow",
        "carrion crow",
        "hooded crow",
        "american crow",
        "torresian crow",
        "common raven",
        "corvus species",
    }:
        return "crow", "pragmatic_corvus_group"

    if "greylag goose" in common:
        return "greylag_goose", "common_name:greylag_goose"

    if "canada goose" in common:
        return "canada_goose", "common_name:canada_goose"

    if "egyptian goose" in common:
        return "egyptian_goose", "common_name:egyptian_goose"

    if "mallard" in common:
        return "mallard", "common_name:mallard"

    if "eurasian woodcock" in common or common == "woodcock":
        return "woodcock", "common_name:woodcock"

    # Generic SpeciesNet bird class: too broad for a concrete Venaris bird species.
    # Concrete bird species above still map to crow, pheasant, geese, mallard, magpie, woodcock.
    if (
        common == "bird"
        or (
            order == ""
            and family == ""
            and genus == ""
            and species == ""
            and common == "bird"
        )
    ):
        return "other", "generic_common:bird"

    # Large predators / cats.
    # Keep bear word matching token-based to avoid substring false positives:
    # "bearded pig" must not map to bear.
    if family == "ursidae" or _common_has_word(common, "bear"):
        return "bear", "pragmatic_bear_group"

    if "bobcat" in common:
        return "bobcat", "common_name:bobcat"

    return "other", "no_venaris_target_mapping"


def explain_venaris_species_candidates(
    classes: list[Any],
    scores: list[Any],
    limit: Optional[int] = 5,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []

    for rank, (raw_label, raw_score) in enumerate(zip(classes, scores), start=1):
        if limit is not None and rank > limit:
            break

        score = _score_float(raw_score)
        mapped_species, reason = map_speciesnet_label_to_venaris(raw_label)
        parsed = parse_speciesnet_label(raw_label)

        if mapped_species != "other":
            _assert_venaris_species(mapped_species)

        candidates.append(
            {
                "rank": rank,
                "score": score,
                "raw_label": parsed.raw,
                "raw_taxon_id": parsed.taxon_id,
                "kingdom": parsed.kingdom,
                "order": parsed.order,
                "family": parsed.family,
                "genus": parsed.genus,
                "species": parsed.species,
                "raw_common_name": parsed.common_name,
                "mapped_species": mapped_species,
                "mapping_reason": reason,
            }
        )

    return candidates


def best_venaris_species_from_speciesnet_classifications(
    classes: list[Any],
    scores: list[Any],
) -> VenarisSpeciesPrediction:
    if not classes or not scores:
        return VenarisSpeciesPrediction(
            species="other",
            score=0.0,
            raw_label="",
            raw_common_name="",
            raw_taxon_id="",
            reason="empty_classifications",
        )

    # Selection policy: keep Venaris product behavior unchanged.
    # We accept the first SpeciesNet candidate, in SpeciesNet rank order,
    # that maps to a concrete Venaris species. Low scores remain allowed
    # and are surfaced to the user as low probability.
    candidates = explain_venaris_species_candidates(
        classes=classes,
        scores=scores,
        limit=None,
    )

    best_other: Optional[dict[str, Any]] = None

    for candidate in candidates:
        mapped_species = str(candidate["mapped_species"])

        if mapped_species != "other":
            _assert_venaris_species(mapped_species)
            return VenarisSpeciesPrediction(
                species=mapped_species,
                score=float(candidate["score"]),
                raw_label=str(candidate["raw_label"]),
                raw_common_name=str(candidate["raw_common_name"]),
                raw_taxon_id=str(candidate["raw_taxon_id"]),
                reason=str(candidate["mapping_reason"]),
            )

        if best_other is None:
            best_other = candidate

    if best_other is not None:
        return VenarisSpeciesPrediction(
            species="other",
            score=float(best_other["score"]),
            raw_label=str(best_other["raw_label"]),
            raw_common_name=str(best_other["raw_common_name"]),
            raw_taxon_id=str(best_other["raw_taxon_id"]),
            reason=str(best_other["mapping_reason"]),
        )

    return VenarisSpeciesPrediction(
        species="other",
        score=0.0,
        raw_label="",
        raw_common_name="",
        raw_taxon_id="",
        reason="no_predictions",
    )


if __name__ == "__main__":
    examples = [
        "ce9a5481-b3f7-4e42-8b8b-382f601fded0;mammalia;lagomorpha;leporidae;lepus;europaeus;european hare",
        "317171d7-d306-4e71-9a4a-33e62012076b;mammalia;artiodactyla;cervidae;capreolus;capreolus;european roe deer",
        "f1856211-cfb7-4a5b-9158-c0f72fd09ee6;;;;;;blank",
        "eb3829b0-772e-4088-ae90-f11b9fe38284;mammalia;artiodactyla;cervidae;cervus;elaphus;red deer",
        "5a565886-156e-4b19-a017-6a5bbae4df0f;mammalia;lagomorpha;leporidae;oryctolagus;cuniculus;european rabbit",
        "dummy;mammalia;lagomorpha;leporidae;sylvilagus;floridanus;eastern cottontail",
        "d106b2ea-7474-4da0-bb65-3345d07fdc1f;mammalia;carnivora;mustelidae;martes;martes;pine marten",
        "ac0e8ba7-7261-4d17-8645-11ed3d02165a;mammalia;carnivora;canidae;vulpes;vulpes;red fox",
        "dummy;mammalia;artiodactyla;suidae;sus;barbatus;bearded pig",
        "dummy;mammalia;artiodactyla;cervidae;cervus;canadensis;elk",
        "dummy;mammalia;carnivora;ursidae;ursus;arctos;brown bear",
        "b1352069-a39c-4a84-a949-60044271c0c1;aves;;;;;bird",
        "9ba3565d-9934-4e74-8ef4-d110ad587014;aves;galliformes;phasianidae;phasianus;colchicus;ring-necked pheasant",
        "dummy;aves;galliformes;phasianidae;pucrasia;macrolopha;koklass pheasant",
        "427cd520-9264-420e-b1d1-6c9e6495b461;aves;anseriformes;anatidae;branta;canadensis;canada goose",
        "dummy;aves;anseriformes;anatidae;alopochen;aegyptiaca;egyptian goose",
        "dummy;aves;anseriformes;anatidae;anser;anser;greylag goose",
        "dummy;aves;anseriformes;anatidae;anas;platyrhynchos;mallard",
        "dummy;aves;charadriiformes;scolopacidae;scolopax;rusticola;eurasian woodcock",
        "dummy;aves;passeriformes;corvidae;corvus;corax;common raven",
        "dummy;aves;passeriformes;corvidae;corvus;;corvus species",
        "dummy;aves;passeriformes;corvidae;pica;hudsonia;black-billed magpie",
        "dummy;aves;passeriformes;corvidae;;;corvidae family",
    ]

    print("Example mappings:")
    for raw in examples:
        mapped, reason = map_speciesnet_label_to_venaris(raw)
        print(f"{mapped:16} {reason:42} {parse_speciesnet_label(raw).common_name}")

    invalid_exact_targets = sorted(
        {
            mapped_species
            for mapped_species in EXACT_TAXON_TO_VENARIS.values()
            if mapped_species not in VENARIS_SPECIES
        }
    )

    if invalid_exact_targets:
        raise SystemExit(
            "Invalid exact-taxonomy targets: " + ", ".join(invalid_exact_targets)
        )

    exact_species = set(EXACT_TAXON_TO_VENARIS.values())
    venaris_without_exact_taxon = sorted(
        VENARIS_SPECIES - exact_species - {"other"}
    )

    print()
    print(f"VENARIS_SPECIES count: {len(VENARIS_SPECIES)}")
    print(f"EXACT_TAXON_TO_VENARIS entries: {len(EXACT_TAXON_TO_VENARIS)}")
    print(f"Species covered by exact taxonomy: {len(exact_species)}")

    print()
    print("Venaris species without exact taxonomy mapping:")
    for species in venaris_without_exact_taxon:
        print(f"- {species}")