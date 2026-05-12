// scripts/repair-and-upload-one-demo-asset.mjs
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const ROOT_DIR = "C:\\dev\\demo-upload_2";
const BUCKET = "camera-assets";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const folder = "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98";
const filename = "demo-source-roe_deer-count-3.webp";

const localPath = path.join(ROOT_DIR, folder, filename);
const repairedPath = path.join(ROOT_DIR, folder, "demo-source-roe_deer-count-3.repaired.webp");
const storagePath = `${folder}/${filename}`;

console.log("Reading original...");
const originalMeta = await sharp(localPath).metadata();
const originalStat = await fs.stat(localPath);

console.log({
  originalWidth: originalMeta.width,
  originalHeight: originalMeta.height,
  originalFormat: originalMeta.format,
  originalSizeKb: Math.round(originalStat.size / 1024),
});

console.log("Re-encoding to lightweight WebP...");

await sharp(localPath)
  .rotate()
  .resize({
    width: 1536,
    height: 1024,
    fit: "cover",
    withoutEnlargement: true,
  })
  .webp({
    quality: 72,
    effort: 4,
  })
  .toFile(repairedPath);

const repairedMeta = await sharp(repairedPath).metadata();
const repairedStat = await fs.stat(repairedPath);

console.log({
  repairedWidth: repairedMeta.width,
  repairedHeight: repairedMeta.height,
  repairedFormat: repairedMeta.format,
  repairedSizeKb: Math.round(repairedStat.size / 1024),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log(`Uploading repaired file as ${storagePath} ...`);

const buffer = await fs.readFile(repairedPath);

const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
  contentType: "image/webp",
  cacheControl: "3600",
  upsert: true,
});

if (error) {
  console.error(`FAIL ${storagePath} :: ${error.message}`);
  process.exit(1);
}

console.log(`OK   ${storagePath}`);