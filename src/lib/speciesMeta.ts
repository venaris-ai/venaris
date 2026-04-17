// src/lib/speciesMeta.ts #1
import type { AppLanguage } from "@/lib/i18n";
import { supabaseServer } from "@/lib/supabaseServer";

export type SpeciesMetaRow = {
  species: string;
  label_de: string;
  label_en: string;
};

export type SpeciesOption = {
  value: string;
  label: string;
};

export type SpeciesMetaMap = Record<string, SpeciesMetaRow>;

function fallbackSpeciesLabel(species: string): string {
  return species
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function loadSpeciesMeta(): Promise<SpeciesMetaRow[]> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("taxonomy_species_meta")
    .select("species,label_de,label_en")
    .order("species", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load taxonomy_species_meta");
  }

  return ((data ?? []) as SpeciesMetaRow[]).map((row) => ({
    species: row.species,
    label_de: row.label_de,
    label_en: row.label_en,
  }));
}

export function buildSpeciesMetaMap(rows: SpeciesMetaRow[]): SpeciesMetaMap {
  return rows.reduce<SpeciesMetaMap>((acc, row) => {
    acc[row.species] = row;
    return acc;
  }, {});
}

export function getSpeciesLabel(
  species: string | null | undefined,
  language: AppLanguage,
  speciesMetaMap: SpeciesMetaMap
): string {
  if (!species) return "—";

  const meta = speciesMetaMap[species];
  if (!meta) return fallbackSpeciesLabel(species);

  return language === "de" ? meta.label_de : meta.label_en;
}

export function getSpeciesOptions(
  rows: SpeciesMetaRow[],
  language: AppLanguage
): SpeciesOption[] {
  return rows.map((row) => ({
    value: row.species,
    label: language === "de" ? row.label_de : row.label_en,
  }));
}