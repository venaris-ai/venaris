// scripts/upload-demo-count-assets.mjs
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });


import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = "C:\\dev\\demo-upload_2";
const BUCKET = "camera-assets";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const EXPECTED = [
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-roe_deer-count-3.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-roe_deer-count-4.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-wolf-count-2.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-wolf-count-3.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-other-count-2.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-other-count-3.webp"],

  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-wild_boar-count-2.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-wild_boar-count-3.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-wild_boar-count-5.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-wild_boar-count-6.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-wild_boar-count-7.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-wild_boar-count-8.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-red_deer-count-3.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-red_deer-count-4.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-red_deer-count-5.webp"],
  ["9d71e823-e15a-4134-8281-642e8dd8195b", "demo-source-red_deer-count-6.webp"],

  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-fallow_deer-count-3.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-fallow_deer-count-4.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-fallow_deer-count-5.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-fallow_deer-count-6.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-mouflon-count-2.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-mouflon-count-4.webp"],

  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-fox-count-2.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-fox-count-3.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-badger-count-2.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-badger-count-3.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-badger-count-4.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-raccoon-count-2.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-raccoon-count-3.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-raccoon_dog-count-2.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-raccoon_dog-count-3.webp"],

  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-hare-count-2.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-hare-count-3.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-hare-count-4.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-rabbit-count-2.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-rabbit-count-3.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-rabbit-count-4.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-pheasant-count-2.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-pheasant-count-3.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-pheasant-count-4.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-pheasant-count-5.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-crow-count-2.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-crow-count-3.webp"],
  ["5ac19296-9e94-41a5-95b5-763626cf3ac5", "demo-source-crow-count-4.webp"],
];

let uploaded = 0;
let failed = 0;

for (const [folder, filename] of EXPECTED) {
  const localPath = path.join(ROOT_DIR, folder, filename);
  const storagePath = `${folder}/${filename}`;

  try {
    const buffer = await fs.readFile(localPath);

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      failed += 1;
      console.error(`FAIL  ${storagePath} :: ${error.message}`);
      continue;
    }

    uploaded += 1;
    console.log(`OK    ${storagePath}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${storagePath} :: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log("");
console.log("Summary");
console.log("-------");
console.log(`Expected: ${EXPECTED.length}`);
console.log(`Uploaded: ${uploaded}`);
console.log(`Failed:   ${failed}`);

if (failed > 0) {
  process.exit(1);
}