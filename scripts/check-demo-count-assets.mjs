// scripts/check-demo-count-assets.mjs
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT_DIR = "C:\\dev\\demo-upload_2";

const MAX_WIDTH = 1800;
const MAX_HEIGHT = 1300;
const MAX_SIZE_BYTES = 450 * 1024; // 450 KB Zielgrenze, bei Bedarf anpassen

const EXPECTED = [
  // 9f5b2da6...
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-roe_deer-count-3.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-roe_deer-count-4.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-wolf-count-2.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-wolf-count-3.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-other-count-2.webp"],
  ["9f5b2da6-6ce4-4f9e-879b-0746d0e81e98", "demo-source-other-count-3.webp"],

  // 9d71e823...
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

  // e8f434c4...
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-fallow_deer-count-3.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-fallow_deer-count-4.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-fallow_deer-count-5.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-fallow_deer-count-6.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-mouflon-count-2.webp"],
  ["e8f434c4-e8b6-416f-8ac4-319d9943653e", "demo-source-mouflon-count-4.webp"],

  // f96a6440...
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-fox-count-2.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-fox-count-3.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-badger-count-2.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-badger-count-3.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-badger-count-4.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-raccoon-count-2.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-raccoon-count-3.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-raccoon_dog-count-2.webp"],
  ["f96a6440-dba1-42e7-9063-55b9a9906213", "demo-source-raccoon_dog-count-3.webp"],

  // 5ac19296...
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

let ok = 0;
let warnings = 0;
let errors = 0;

for (const [folder, filename] of EXPECTED) {
  const filePath = path.join(ROOT_DIR, folder, filename);
  const storagePath = `${folder}/${filename}`;

  try {
    const stat = await fs.stat(filePath);
    const meta = await sharp(filePath).metadata();

    const issues = [];

    if (meta.format !== "webp") {
      issues.push(`format=${meta.format ?? "unknown"}`);
    }

    if (!meta.width || !meta.height) {
      issues.push("missing dimensions");
    } else {
      if (meta.width > MAX_WIDTH || meta.height > MAX_HEIGHT) {
        issues.push(`large dimensions ${meta.width}x${meta.height}`);
      }

      const ratio = meta.width / meta.height;
      const expectedRatio = 3 / 2;
      const ratioDiff = Math.abs(ratio - expectedRatio);

      if (ratioDiff > 0.08) {
        issues.push(`unexpected ratio ${meta.width}x${meta.height}`);
      }
    }

    if (stat.size > MAX_SIZE_BYTES) {
      issues.push(`large file ${(stat.size / 1024).toFixed(0)} KB`);
    }

    if (issues.length > 0) {
      warnings += 1;
      console.log(`WARN  ${storagePath} :: ${issues.join(", ")}`);
    } else {
      ok += 1;
      console.log(`OK    ${storagePath} :: ${meta.width}x${meta.height}, ${(stat.size / 1024).toFixed(0)} KB`);
    }
  } catch (err) {
    errors += 1;
    console.log(`MISS  ${storagePath}`);
  }
}

console.log("");
console.log("Summary");
console.log("-------");
console.log(`Expected: ${EXPECTED.length}`);
console.log(`OK:       ${ok}`);
console.log(`Warnings: ${warnings}`);
console.log(`Missing:  ${errors}`);

if (errors > 0) {
  process.exit(1);
}