// src/lib/demoAssetResolver.ts #1
import { supabaseServer } from "@/lib/supabaseServer";

type AssetRow = {
  id: string;
  camera_id: string;
  storage_path: string | null;
};

type DetectionRow = {
  species: string | null;
  score: number | null;
};

const DEMO_SOURCE_BY_SPECIES: Record<string, string[]> = {
roe_deer: [
  "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/seed-39d86afb-3fce-4db4-a685-72b3c94b69b9-bd0e88b51314.webp",
  "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/seed-c7a973c9-204f-4c38-b1a1-3a3a4a21a2bf-2c48624579b8.webp",
  "9d71e823-e15a-4134-8281-642e8dd8195b/seed-2f0de4f8-4ef0-4d4e-86ac-2d83039198d4-381c1688ba78.webp",
],

wild_boar: [
  "9d71e823-e15a-4134-8281-642e8dd8195b/seed-28a420cd-9bb5-44e2-88b9-7486707fc8df-5e5614515451.webp",
  "9d71e823-e15a-4134-8281-642e8dd8195b/seed-40558db5-b5fd-4758-8ffb-948c6602ed49-4f0844f70f71.webp",
  "9d71e823-e15a-4134-8281-642e8dd8195b/seed-9c2af8bd-03b0-426b-9d9f-dafcc23bae21-dc1748f03013.webp",
  "9d71e823-e15a-4134-8281-642e8dd8195b/seed-bb67f86b-262e-4d11-a265-6aa48a3c7d1c-b870936f4daa.webp",
],

red_deer: [
  "9d71e823-e15a-4134-8281-642e8dd8195b/seed-029b0f9c-33c3-4445-af5d-0d2be5caacb9-4dc01f158b8b.webp",
  "9d71e823-e15a-4134-8281-642e8dd8195b/seed-57b29fb4-bd75-4c5a-a64b-8b2815b40b39-e979526ec6a3.webp",
  "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-e2b8401f-65e1-4a49-8f30-43315fef618b-1b9265a3f85c.webp",
],

fallow_deer: [
  "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-2a819af1-7676-44a7-b645-7067d8acf975-e3315e963362.webp",
  "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-90a83c5a-c339-45ee-a049-664e98cc8e58-95759d6f1fa2.webp",
  "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-d468a077-e5df-4432-b92a-f7d70d8a7fd9-5b61fe56339b.webp",
],

fox: [
  "f96a6440-dba1-42e7-9063-55b9a9906213/seed-632e8d32-9dce-4f4b-991b-1feecd2ed7d0-a6ba3f19e639.webp",
],
  badger: [
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-01.webp",
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-02.webp",
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-03.webp",
  ],
  hare: [
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-01.webp",
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-02.webp",
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-03.webp",
  ],
  crow: [
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-01.webp",
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-02.webp",
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-03.webp",
  ],
  rabbit: [
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-01.webp",
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-02.webp",
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-03.webp",
  ],
  pheasant: [
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-01.webp",
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-02.webp",
    "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-03.webp",
  ],
  raccoon: [
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon-01.webp",
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon-02.webp",
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon-03.webp",
  ],
  raccoon_dog: [
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon_dog-01.webp",
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon_dog-02.webp",
    "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon_dog-03.webp",
  ],
  other: [
    "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-other-01.webp",
    "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-other-02.webp",
    "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-other-03.webp",
  ],
  mouflon: [
    "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-mouflon-01.webp",
    "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-mouflon-02.webp",
    "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-mouflon-03.webp",
  ],
  wolf: [
    "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-wolf-01.webp",
    "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-wolf-02.webp",
    "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-wolf-03.webp",
  ],
};

function pickDeterministicIndex(seed: string, modulo: number) {
  let acc = 0;
  for (let i = 0; i < seed.length; i += 1) {
    acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return modulo <= 1 ? 0 : acc % modulo;
}

async function createSignedUrl(path: string, expiresInSeconds = 60 * 20) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.storage
    .from("camera-assets")
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

async function storageObjectExists(path: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.storage
    .from("camera-assets")
    .list(path.split("/").slice(0, -1).join("/"), {
      limit: 100,
      search: path.split("/").pop(),
    });

  if (error) return false;
  return (data ?? []).some((item) => item.name === path.split("/").pop());
}

async function resolveTopSpecies(assetId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("detections")
    .select("species,score")
    .eq("asset_id", assetId)
    .eq("label", "animal")
    .not("species", "is", null)
    .order("score", { ascending: false })
    .limit(1)
    .returns<DetectionRow[]>();

  if (error) return null;
  return data?.[0]?.species ?? null;
}

export async function resolveAssetPreviewUrl(args: {
  asset: AssetRow;
  isDemo: boolean;
}) {
  const { asset, isDemo } = args;

  if (!asset.storage_path) return null;

  const originalExists = await storageObjectExists(asset.storage_path);
  if (originalExists) {
    return createSignedUrl(asset.storage_path);
  }

  if (!isDemo) {
    return null;
  }

  const species = await resolveTopSpecies(asset.id);
  if (!species) {
    return null;
  }

  const candidates = DEMO_SOURCE_BY_SPECIES[species];
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const index = pickDeterministicIndex(asset.id || asset.storage_path, candidates.length);
  return createSignedUrl(candidates[index]);
}