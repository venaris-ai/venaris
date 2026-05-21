// src/lib/demoAssetResolver.ts #4
import { supabaseServer } from "@/lib/supabaseServer";

type AssetRow = {
  id: string;
  camera_id: string;
  storage_path: string | null;
};

type DetectionRow = {
  species: string | null;
  species_user: string | null;
  score: number | null;
};

type EventRow = {
  id: string;
  top_species: string | null;
  top_count: number | null;
};

type EventAssetJoinRow = {
  event_id: string | null;
  events: EventRow | EventRow[] | null;
};

type DemoEventContext = {
  eventId: string | null;
  species: string | null;
  count: number | null;
};

/**
 * Legacy fallback:
 * species -> generic demo image candidates.
 *
 * This stays in place so the demo does not break while new
 * species+count images are uploaded step by step.
 */
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

/**
 * Count-aware demo source mapping:
 * species -> top_count -> image candidates.
 *
 * One image per species+count is sufficient. Multiple candidates are supported,
 * but the same event will always resolve to the same candidate because event_id
 * is used as deterministic seed.
 */
const DEMO_SOURCE_BY_SPECIES_AND_COUNT: Record<string, Record<number, string[]>> = {
  roe_deer: {
    1: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/seed-2f0de4f8-4ef0-4d4e-86ac-2d83039198d4-381c1688ba78.webp",
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/seed-39d86afb-3fce-4db4-a685-72b3c94b69b9-bd0e88b51314.webp",
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/seed-c7a973c9-204f-4c38-b1a1-3a3a4a21a2bf-2c48624579b8.webp",
    ],
    2: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/seed-aed75332-9828-4b99-8ae4-ad8532db5f3d-d26eee66d6b3.webp",
    ],
    3: [
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-roe_deer-count-3.webp",
    ],
    4: [
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-roe_deer-count-4.webp",
    ],
  },

  wild_boar: {
    1: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/seed-28a420cd-9bb5-44e2-88b9-7486707fc8df-5e5614515451.webp",
      "9d71e823-e15a-4134-8281-642e8dd8195b/seed-40558db5-b5fd-4758-8ffb-948c6602ed49-4f0844f70f71.webp",
      "9d71e823-e15a-4134-8281-642e8dd8195b/seed-bb67f86b-262e-4d11-a265-6aa48a3c7d1c-b870936f4daa.webp",
    ],
    2: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-wild_boar-count-2.webp",
    ],
    3: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-wild_boar-count-3.webp",
    ],
    4: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/seed-9c2af8bd-03b0-426b-9d9f-dafcc23bae21-dc1748f03013.webp",
    ],
    5: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-wild_boar-count-5.webp",
    ],
    6: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-wild_boar-count-6.webp",
    ],
    7: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-wild_boar-count-7.webp",
    ],
    8: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-wild_boar-count-8.webp",
    ],
  },

  red_deer: {
    1: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/seed-029b0f9c-33c3-4445-af5d-0d2be5caacb9-4dc01f158b8b.webp",
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-e2b8401f-65e1-4a49-8f30-43315fef618b-1b9265a3f85c.webp",
    ],
    2: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/seed-57b29fb4-bd75-4c5a-a64b-8b2815b40b39-e979526ec6a3.webp",
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-f649ebab-f0e2-4f14-869a-c4ff9b125d72-ee81bd34a874.webp",
    ],
    3: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-red_deer-count-3.webp",
    ],
    4: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-red_deer-count-4.webp",
    ],
    5: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-red_deer-count-5.webp",
    ],
    6: [
      "9d71e823-e15a-4134-8281-642e8dd8195b/demo-source-red_deer-count-6.webp",
    ],
  },

  fallow_deer: {
    1: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-2a819af1-7676-44a7-b645-7067d8acf975-e3315e963362.webp",
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-d468a077-e5df-4432-b92a-f7d70d8a7fd9-5b61fe56339b.webp",
    ],
    2: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/seed-90a83c5a-c339-45ee-a049-664e98cc8e58-95759d6f1fa2.webp",
    ],
    3: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-fallow_deer-count-3.webp",
    ],
    4: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-fallow_deer-count-4.webp",
    ],
    5: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-fallow_deer-count-5.webp",
    ],
    6: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-fallow_deer-count-6.webp",
    ],
  },

  mouflon: {
    1: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-mouflon-01.webp",
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-mouflon-02.webp",
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-mouflon-03.webp",
    ],
    2: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-mouflon-count-2.webp",
    ],
    4: [
      "e8f434c4-e8b6-416f-8ac4-319d9943653e/demo-source-mouflon-count-4.webp",
    ],
  },

  fox: {
    1: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/seed-632e8d32-9dce-4f4b-991b-1feecd2ed7d0-a6ba3f19e639.webp",
    ],
    2: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-fox-count-2.webp",
    ],
    3: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-fox-count-3.webp",
    ],
  },

  wolf: {
    1: [
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-wolf-01.webp",
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-wolf-02.webp",
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-wolf-03.webp",
    ],
    2: [
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-wolf-count-2.webp",
    ],
    3: [
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-wolf-count-3.webp",
    ],
  },

  badger: {
    1: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-01.webp",
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-02.webp",
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-03.webp",
    ],
    2: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-count-2.webp",
    ],
    3: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-count-3.webp",
    ],
    4: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-badger-count-4.webp",
    ],
  },

  raccoon: {
    1: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon-01.webp",
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon-02.webp",
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon-03.webp",
    ],
    2: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon-count-2.webp",
    ],
    3: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon-count-3.webp",
    ],
  },

  raccoon_dog: {
    1: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon_dog-01.webp",
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon_dog-02.webp",
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon_dog-03.webp",
    ],
    2: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon_dog-count-2.webp",
    ],
    3: [
      "f96a6440-dba1-42e7-9063-55b9a9906213/demo-source-raccoon_dog-count-3.webp",
    ],
  },

  hare: {
    1: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-01.webp",
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-02.webp",
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-03.webp",
    ],
    2: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-count-2.webp",
    ],
    3: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-count-3.webp",
    ],
    4: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-hare-count-4.webp",
    ],
  },

  rabbit: {
    1: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-01.webp",
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-02.webp",
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-03.webp",
    ],
    2: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-count-2.webp",
    ],
    3: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-count-3.webp",
    ],
    4: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-rabbit-count-4.webp",
    ],
  },

  pheasant: {
    1: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-01.webp",
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-02.webp",
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-03.webp",
    ],
    2: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-count-2.webp",
    ],
    3: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-count-3.webp",
    ],
    4: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-count-4.webp",
    ],
    5: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-pheasant-count-5.webp",
    ],
  },

  crow: {
    1: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-01.webp",
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-02.webp",
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-03.webp",
    ],
    2: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-count-2.webp",
    ],
    3: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-count-3.webp",
    ],
    4: [
      "5ac19296-9e94-41a5-95b5-763626cf3ac5/demo-source-crow-count-4.webp",
    ],
  },

  other: {
    1: [
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-other-01.webp",
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-other-02.webp",
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-other-03.webp",
    ],
    2: [
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-other-count-2.webp",
    ],
    3: [
      "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98/demo-source-other-count-3.webp",
    ],
  },
};

function pickDeterministicIndex(seed: string, modulo: number) {
  let acc = 0;
  for (let i = 0; i < seed.length; i += 1) {
    acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return modulo <= 1 ? 0 : acc % modulo;
}

function normalizeCount(value: number | null | undefined) {
  if (!Number.isFinite(value)) return null;
  if (!value || value < 1) return null;
  return Math.trunc(value);
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
  const folder = path.split("/").slice(0, -1).join("/");
  const filename = path.split("/").pop();

  if (!folder || !filename) return false;

  const { data, error } = await supabase.storage.from("camera-assets").list(folder, {
    limit: 100,
    search: filename,
  });

  if (error) return false;
  return (data ?? []).some((item) => item.name === filename);
}

async function createSignedUrlIfExists(path: string) {
  const exists = await storageObjectExists(path);
  if (!exists) return null;

  return createSignedUrl(path);
}

async function createSignedUrlFromCandidates(candidates: string[], seed: string) {
  if (candidates.length === 0) return null;

  const startIndex = pickDeterministicIndex(seed, candidates.length);

  for (let offset = 0; offset < candidates.length; offset += 1) {
    const index = (startIndex + offset) % candidates.length;
    const url = await createSignedUrlIfExists(candidates[index]);
    if (url) return url;
  }

  return null;
}

async function createSignedUrlFromTrustedCandidates(candidates: string[], seed: string) {
  if (candidates.length === 0) return null;

  const startIndex = pickDeterministicIndex(seed, candidates.length);

  for (let offset = 0; offset < candidates.length; offset += 1) {
    const index = (startIndex + offset) % candidates.length;
    const url = await createSignedUrl(candidates[index]);
    if (url) return url;
  }

  return null;
}

async function resolveTopSpecies(assetId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("detections")
    .select("species,species_user,score")
    .eq("asset_id", assetId)
    .eq("label", "animal")
    .not("species", "is", null)
    .order("score", { ascending: false })
    .limit(1)
    .returns<DetectionRow[]>();

  if (error) return null;

  const top = data?.[0];
  if (!top) return null;

  return top.species_user ?? top.species ?? null;
}

async function resolveDemoEventContext(assetId: string): Promise<DemoEventContext | null> {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("event_assets")
    .select(
      `
        event_id,
        events (
          id,
          top_species,
          top_count
        )
      `,
    )
    .eq("asset_id", assetId)
    .limit(1)
    .returns<EventAssetJoinRow[]>();

  if (error) return null;

  const row = data?.[0];
  if (!row) return null;

  const eventRow = Array.isArray(row.events) ? row.events[0] : row.events;

  return {
    eventId: row.event_id ?? eventRow?.id ?? null,
    species: eventRow?.top_species ?? null,
    count: normalizeCount(eventRow?.top_count),
  };
}

function getCountAwareCandidates(species: string, count: number | null) {
  if (!count) return null;
  return DEMO_SOURCE_BY_SPECIES_AND_COUNT[species]?.[count] ?? null;
}

function getSpeciesFallbackCandidates(species: string) {
  return DEMO_SOURCE_BY_SPECIES[species] ?? null;
}

export async function resolveAssetPreviewUrl(args: {
  asset: AssetRow;
  isDemo: boolean;
}) {
  const { asset, isDemo } = args;

  if (!isDemo) {
    if (!asset.storage_path) return null;
    return createSignedUrlIfExists(asset.storage_path);
  }

  const eventContext = await resolveDemoEventContext(asset.id);
  const species = eventContext?.species ?? (await resolveTopSpecies(asset.id));

  if (!species) {
    return null;
  }

  const seed = eventContext?.eventId ?? asset.id ?? asset.storage_path ?? species;

  const countAwareCandidates = getCountAwareCandidates(
    species,
    eventContext?.count ?? null,
  );

  if (countAwareCandidates?.length) {
    // Robust demo rule:
    // If species + top_count is explicitly mapped, use only that mapping.
    // Do not check Storage via list(), because list() can lag/cached after upload.
    // Do not fall back to generic species images, because that creates wrong counts.
    return createSignedUrlFromTrustedCandidates(countAwareCandidates, seed);
  }

  // Only if no explicit species+count mapping exists:
  // 1) Try the asset's original storage path.
  // 2) Then use old species fallback.
  if (asset.storage_path) {
    const originalUrl = await createSignedUrlIfExists(asset.storage_path);
    if (originalUrl) {
      return originalUrl;
    }
  }

  const speciesFallbackCandidates = getSpeciesFallbackCandidates(species);
  if (!speciesFallbackCandidates?.length) {
    return null;
  }

  return createSignedUrlFromCandidates(speciesFallbackCandidates, seed);
}