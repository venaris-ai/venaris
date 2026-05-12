# infrastructure/hetzner-worker/detection-worker/species/speciesnet_venaris_map.py #1

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


def _contains_any(text: str, needles: tuple[str, ...]) -> bool:
    return any(needle in text for needle in needles)


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

    # Deer / cervids.
    if genus == "capreolus" and species == "capreolus":
        return "roe_deer", "exact_taxon:capreolus_capreolus"
    if "european roe deer" in common or common == "roe deer":
        return "roe_deer", "common_name:roe_deer"

    if genus == "cervus" and species == "elaphus":
        return "red_deer", "exact_taxon:cervus_elaphus"
    if common == "red deer" or "european red deer" in common:
        return "red_deer", "common_name:red_deer"

    if genus == "dama" and species == "dama":
        return "fallow_deer", "exact_taxon:dama_dama"
    if "fallow deer" in common:
        return "fallow_deer", "common_name:fallow_deer"

    if genus == "alces" or "moose" in common or "elk" == common:
        return "moose", "taxon_or_common:moose"

    # Bovids / mountain game.
    if "mouflon" in common:
        return "mouflon", "common_name:mouflon"

    if genus == "rupicapra" or "chamois" in common:
        return "chamois", "taxon_or_common:chamois"

    # Suidae.
    if genus == "sus" and species == "scrofa":
        return "wild_boar", "exact_taxon:sus_scrofa"
    if "wild boar" in common or "feral hog" in common or "feral pig" in common:
        return "wild_boar", "common_name:wild_boar"

    # Canids.
    if genus == "vulpes" and species == "vulpes":
        return "fox", "exact_taxon:vulpes_vulpes"
    if "red fox" in common or common == "fox":
        return "fox", "common_name:fox"

    if genus == "canis" and species == "lupus":
        return "wolf", "exact_taxon:canis_lupus"
    if common == "wolf" or "gray wolf" in common or "grey wolf" in common:
        return "wolf", "common_name:wolf"

    if genus == "canis" and species == "aureus":
        return "golden_jackal", "exact_taxon:canis_aureus"
    if "golden jackal" in common:
        return "golden_jackal", "common_name:golden_jackal"

    if genus == "nyctereutes" and species == "procyonoides":
        return "raccoon_dog", "exact_taxon:nyctereutes_procyonoides"
    if "raccoon dog" in common:
        return "raccoon_dog", "common_name:raccoon_dog"

    # Mustelids.
    if genus == "meles" and species == "meles":
        return "badger", "exact_taxon:meles_meles"
    if "european badger" in common or common == "badger":
        return "badger", "common_name:badger"

    if genus == "martes" and species == "martes":
        return "pine_marten", "exact_taxon:martes_martes"
    if "pine marten" in common:
        return "pine_marten", "common_name:pine_marten"

    if genus == "martes" and species == "foina":
        return "stone_marten", "exact_taxon:martes_foina"
    if "stone marten" in common or "beech marten" in common:
        return "stone_marten", "common_name:stone_marten"

    if genus == "mustela" and species == "erminea":
        return "stoat", "exact_taxon:mustela_erminea"
    if common in {"stoat", "ermine"} or "short-tailed weasel" in common:
        return "stoat", "common_name:stoat"

    if (genus == "neogale" and species == "vison") or (
        genus == "mustela" and species == "lutreola"
    ):
        return "mink", "exact_taxon:mink"
    if "american mink" in common or "european mink" in common or common == "mink":
        return "mink", "common_name:mink"

    # Procyonids / rodents.
    if genus == "procyon" and species == "lotor":
        return "raccoon", "exact_taxon:procyon_lotor"
    if common == "raccoon" or "northern raccoon" in common:
        return "raccoon", "common_name:raccoon"

    if genus == "myocastor" and species == "coypus":
        return "nutria", "exact_taxon:myocastor_coypus"
    if common in {"nutria", "coypu"} or "myocastor" in common:
        return "nutria", "common_name:nutria"

    # Lagomorphs.
    if genus == "lepus" and species == "europaeus":
        return "hare", "exact_taxon:lepus_europaeus"
    if "european hare" in common or common == "hare":
        return "hare", "common_name:hare"

    # SpeciesNet sometimes predicts other Lepus species for European hare-like crops.
    if genus == "lepus" and order == "lagomorpha":
        return "hare", "genus_fallback:lepus"

    if genus == "oryctolagus" and species == "cuniculus":
        return "rabbit", "exact_taxon:oryctolagus_cuniculus"
    if "european rabbit" in common or common == "rabbit":
        return "rabbit", "common_name:rabbit"

    # Birds.
    if "common pheasant" in common or common == "pheasant":
        return "pheasant", "common_name:pheasant"

    if "carrion crow" in common or common == "crow":
        return "crow", "common_name:crow"

    if "eurasian magpie" in common or common == "magpie":
        return "magpie", "common_name:magpie"

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
    if common == "bird" or (order == "" and family == "" and genus == "" and species == "" and common == "bird"):
        return "other", "generic_common:bird"

    # Large predators / cats.
    if family == "ursidae" or " bear" in f" {common}" or common.endswith("bear"):
        return "bear", "family_or_common:bear"

    if genus == "lynx" and species == "rufus":
        return "bobcat", "exact_taxon:lynx_rufus"
    if "bobcat" in common:
        return "bobcat", "common_name:bobcat"

    return "other", "no_venaris_target_mapping"


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

    best_other: Optional[VenarisSpeciesPrediction] = None

    for raw_label, raw_score in zip(classes, scores):
        try:
            score = float(raw_score)
        except Exception:
            score = 0.0

        mapped_species, reason = map_speciesnet_label_to_venaris(raw_label)
        parsed = parse_speciesnet_label(raw_label)

        prediction = VenarisSpeciesPrediction(
            species=mapped_species,
            score=score,
            raw_label=parsed.raw,
            raw_common_name=parsed.common_name,
            raw_taxon_id=parsed.taxon_id,
            reason=reason,
        )

        if mapped_species != "other":
            if mapped_species not in VENARIS_SPECIES:
                raise ValueError(f"Mapped species is not in VENARIS_SPECIES: {mapped_species}")
            return prediction

        if best_other is None:
            best_other = prediction

    return best_other or VenarisSpeciesPrediction(
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
        "d106b2ea-7474-4da0-bb65-3345d07fdc1f;mammalia;carnivora;mustelidae;martes;martes;pine marten",
        "ac0e8ba7-7261-4d17-8645-11ed3d02165a;mammalia;carnivora;canidae;vulpes;vulpes;red fox",
        "b1352069-a39c-4a84-a949-60044271c0c1;aves;;;;;bird",
    ]

    for raw in examples:
        mapped, reason = map_speciesnet_label_to_venaris(raw)
        print(f"{mapped:14} {reason:36} {parse_speciesnet_label(raw).common_name}")