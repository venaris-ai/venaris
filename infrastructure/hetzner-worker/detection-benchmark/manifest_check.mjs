// infrastructure/hetzner-worker/detection-benchmark/manifest_check.mjs #1

import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const ALL_MANIFEST = path.join(ROOT, "benchmark_heubachwiesen_all_manifest.csv");
const HARD_MANIFEST = path.join(
  ROOT,
  "benchmark_heubachwiesen_hard_cases_manifest.csv"
);

const REQUIRED_COLUMNS = [
  "asset_id",
  "storage_path",
  "camera_id",
  "camera_name",
  "revier_id",
  "revier_name",
  "captured_at",
  "detection_id",
  "current_auto_species",
  "corrected_species",
  "effective_species",
  "md_animal_score",
  "clip_species_score",
  "md_bbox",
  "benchmark_bucket",
];

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
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
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });

    row.__line = index + 2;
    return row;
  });

  return { headers, rows };
}

function assertRequiredColumns(name, headers) {
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));

  if (missing.length) {
    fail(`${name} is missing required columns: ${missing.join(", ")}`);
  }
}

function normalizeNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function parseNumber(value) {
  const normalized = normalizeNull(value);
  if (normalized === null) return null;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function parseBbox(value) {
  const normalized = normalizeNull(value);
  if (normalized === null) return null;

  try {
    const parsed = JSON.parse(normalized);
    if (
      Array.isArray(parsed) &&
      parsed.length === 4 &&
      parsed.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }

  return NaN;
}

function groupCount(rows, keyFn) {
  const counts = new Map();

  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function printGroup(title, entries, limit = 30) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));

  for (const [key, count] of entries.slice(0, limit)) {
    console.log(`${String(key).padEnd(36)} ${String(count).padStart(5)}`);
  }

  if (entries.length > limit) {
    console.log(`... ${entries.length - limit} more`);
  }
}

function uniqueCount(rows, field) {
  return new Set(rows.map((row) => row[field]).filter(Boolean)).size;
}

function validateRows(name, rows) {
  const errors = [];

  for (const row of rows) {
    const bbox = parseBbox(row.md_bbox);
    if (Number.isNaN(bbox)) {
      errors.push(`line ${row.__line}: invalid md_bbox "${row.md_bbox}"`);
    }

    const mdScore = parseNumber(row.md_animal_score);
    if (Number.isNaN(mdScore)) {
      errors.push(`line ${row.__line}: invalid md_animal_score "${row.md_animal_score}"`);
    }

    const clipScore = parseNumber(row.clip_species_score);
    if (Number.isNaN(clipScore)) {
      errors.push(`line ${row.__line}: invalid clip_species_score "${row.clip_species_score}"`);
    }

    for (const column of REQUIRED_COLUMNS) {
      if (!(column in row)) {
        errors.push(`line ${row.__line}: missing column "${column}"`);
      }
    }
  }

  if (errors.length) {
    console.error(`\n❌ ${name} validation errors:`);
    for (const error of errors.slice(0, 25)) {
      console.error(`- ${error}`);
    }
    if (errors.length > 25) {
      console.error(`... ${errors.length - 25} more`);
    }
    process.exit(1);
  }
}

function detectionKey(row) {
  return row.detection_id;
}

function main() {
  console.log("Venaris detection benchmark manifest check");
  console.log("==========================================");
  console.log(`Root: ${ROOT}`);
  console.log(`All manifest:  ${ALL_MANIFEST}`);
  console.log(`Hard manifest: ${HARD_MANIFEST}`);

  const all = readCsv(ALL_MANIFEST);
  const hard = readCsv(HARD_MANIFEST);

  assertRequiredColumns("All manifest", all.headers);
  assertRequiredColumns("Hard manifest", hard.headers);

  validateRows("All manifest", all.rows);
  validateRows("Hard manifest", hard.rows);

  const allDetectionIds = new Set(all.rows.map(detectionKey));
  const missingHardInAll = hard.rows.filter((row) => !allDetectionIds.has(detectionKey(row)));

  if (missingHardInAll.length) {
    console.error("\n❌ Hard-case rows missing from all manifest:");
    for (const row of missingHardInAll.slice(0, 25)) {
      console.error(`- detection_id=${row.detection_id} asset_id=${row.asset_id}`);
    }
    if (missingHardInAll.length > 25) {
      console.error(`... ${missingHardInAll.length - 25} more`);
    }
    process.exit(1);
  }

  console.log("\nSummary");
  console.log("-------");
  console.log(`ALL rows:             ${all.rows.length}`);
  console.log(`ALL unique assets:    ${uniqueCount(all.rows, "asset_id")}`);
  console.log(`ALL unique cameras:   ${uniqueCount(all.rows, "camera_id")}`);
  console.log(`HARD rows:            ${hard.rows.length}`);
  console.log(`HARD unique assets:   ${uniqueCount(hard.rows, "asset_id")}`);
  console.log(`HARD included in ALL: yes`);

  printGroup(
    "ALL by benchmark_bucket",
    groupCount(all.rows, (row) => row.benchmark_bucket)
  );

  printGroup(
    "ALL by effective_species",
    groupCount(all.rows, (row) => row.effective_species)
  );

  printGroup(
    "ALL by camera_name",
    groupCount(all.rows, (row) => row.camera_name)
  );

  printGroup(
    "HARD confusions: current_auto_species → corrected_species",
    groupCount(
      hard.rows,
      (row) => `${row.current_auto_species} → ${row.corrected_species}`
    )
  );

  const bboxAreas = all.rows
    .map((row) => {
      const bbox = parseBbox(row.md_bbox);
      if (!Array.isArray(bbox)) return null;
      return bbox[2] * bbox[3];
    })
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);

  const percentile = (p) => {
    if (!bboxAreas.length) return null;
    const idx = Math.min(
      bboxAreas.length - 1,
      Math.max(0, Math.floor((bboxAreas.length - 1) * p))
    );
    return bboxAreas[idx];
  };

  console.log("\nBBox relative area distribution");
  console.log("-------------------------------");
  console.log(`p10: ${percentile(0.1)?.toFixed(6) ?? "n/a"}`);
  console.log(`p50: ${percentile(0.5)?.toFixed(6) ?? "n/a"}`);
  console.log(`p90: ${percentile(0.9)?.toFixed(6) ?? "n/a"}`);

  console.log("\n✅ Manifest check passed.");
}

main();