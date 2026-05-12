// infrastructure/hetzner-worker/detection-benchmark/download_images.mjs #1

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const ALL_MANIFEST = path.join(ROOT, "benchmark_heubachwiesen_all_manifest.csv");

const OUT_DIR = path.join(
  ROOT,
  "infrastructure",
  "hetzner-worker",
  "detection-benchmark",
  "data",
  "images"
);

const CACHE_INDEX_PATH = path.join(
  ROOT,
  "infrastructure",
  "hetzner-worker",
  "detection-benchmark",
  "data",
  "image_cache_index.json"
);

const BUCKET = "camera-assets";

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf-8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}


function loadEnv() {
  loadEnvFile(path.join(ROOT, "env.local"));
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, "infrastructure", "hetzner-worker", "detection-worker", ".env"));
}


function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  values.push(current);
  return values;
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing manifest file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    fail(`CSV has no data rows: ${filePath}`);
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });

    row.__line = index + 2;
    return row;
  });
}

function safeFileName(value) {
  return String(value)
    .replaceAll("\\", "/")
    .split("/")
    .join("__")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function localImagePathFor(row) {
  const ext = path.extname(row.storage_path || "") || ".jpg";
  const base = safeFileName(`${row.asset_id}__${row.storage_path}`);
  return path.join(OUT_DIR, base.endsWith(ext) ? base : `${base}${ext}`);
}

function uniqueRowsByAsset(rows) {
  const byAsset = new Map();

  for (const row of rows) {
    if (!row.asset_id || !row.storage_path) {
      fail(`Manifest line ${row.__line} missing asset_id or storage_path`);
    }

    if (!byAsset.has(row.asset_id)) {
      byAsset.set(row.asset_id, row);
    }
  }

  return [...byAsset.values()];
}

async function blobToBuffer(blob) {
  const ab = await blob.arrayBuffer();
  return Buffer.from(ab);
}

async function main() {
  console.log("Venaris detection benchmark image downloader");
  console.log("============================================");
  console.log(`Root: ${ROOT}`);
  console.log(`Manifest: ${ALL_MANIFEST}`);
  console.log(`Output: ${OUT_DIR}`);

  loadEnv();

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    fail(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set env vars or provide .env.local / .env."
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(CACHE_INDEX_PATH), { recursive: true });

  const rows = readCsv(ALL_MANIFEST);
  const uniqueAssets = uniqueRowsByAsset(rows);

  console.log(`Manifest rows: ${rows.length}`);
  console.log(`Unique assets: ${uniqueAssets.length}`);
  console.log(`Bucket: ${BUCKET}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const cacheIndex = [];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < uniqueAssets.length; i++) {
    const row = uniqueAssets[i];
    const outPath = localImagePathFor(row);
    const relOutPath = path.relative(ROOT, outPath);

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      skipped++;
      cacheIndex.push({
        asset_id: row.asset_id,
        storage_path: row.storage_path,
        local_path: relOutPath,
        status: "cached",
        bytes: fs.statSync(outPath).size,
      });

      continue;
    }

    const label = `[${i + 1}/${uniqueAssets.length}] ${row.asset_id}`;

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(row.storage_path);

      if (error || !data) {
        throw new Error(error?.message || "no data returned");
      }

      const buf = await blobToBuffer(data);
      fs.writeFileSync(outPath, buf);

      downloaded++;
      cacheIndex.push({
        asset_id: row.asset_id,
        storage_path: row.storage_path,
        local_path: relOutPath,
        status: "downloaded",
        bytes: buf.length,
      });

      console.log(`${label} downloaded ${buf.length} bytes`);


} catch (error) {
  failed++;

  const errorDetails = {
    message: error?.message ?? null,
    name: error?.name ?? null,
    status: error?.status ?? null,
    statusCode: error?.statusCode ?? null,
    code: error?.code ?? null,
    cause: error?.cause ?? null,
    raw: error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : null,
  };

  cacheIndex.push({
    asset_id: row.asset_id,
    storage_path: row.storage_path,
    local_path: relOutPath,
    status: "failed",
    error: errorDetails,
  });

  console.warn(`${label} failed: ${JSON.stringify(errorDetails)}`);
}









  }

  fs.writeFileSync(
    CACHE_INDEX_PATH,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        bucket: BUCKET,
        manifest: path.relative(ROOT, ALL_MANIFEST),
        image_dir: path.relative(ROOT, OUT_DIR),
        total_manifest_rows: rows.length,
        unique_assets: uniqueAssets.length,
        downloaded,
        skipped,
        failed,
        items: cacheIndex,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("\nSummary");
  console.log("-------");
  console.log(`downloaded: ${downloaded}`);
  console.log(`skipped:    ${skipped}`);
  console.log(`failed:     ${failed}`);
  console.log(`index:      ${path.relative(ROOT, CACHE_INDEX_PATH)}`);

  if (failed > 0) {
    fail("Some images failed to download. See image_cache_index.json.");
  }

  console.log("\n✅ Image cache ready.");
}

main().catch((error) => {
  fail(error?.message ?? String(error));
});