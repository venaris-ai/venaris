import { createClient } from "@supabase/supabase-js";
import exifrDefault, * as exifrNS from "exifr";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const WORKER_ID = process.env.WORKER_ID || `det-worker-${process.pid}`;
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 5);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 10);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 5);
const STUCK_MINUTES = Number(process.env.STUCK_MINUTES || 30);

const STORAGE_DOWNLOAD_ENABLED =
  (process.env.STORAGE_DOWNLOAD_ENABLED ?? "1") !== "0";

// EXIF safety caps (soft)
const EXIF_MAX_BYTES = Number(process.env.EXIF_MAX_BYTES || 6_000_000);
const EXIF_TIMEOUT_MS = Number(process.env.EXIF_TIMEOUT_MS || 4_000);

const EXIF_ONLY_FOR_IMPORT_METHODS = new Set(
  (process.env.EXIF_ONLY_FOR_IMPORT_METHODS || "ftp,manual,token-ingest")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

// MegaDetector runner
const MD_PYTHON = process.env.MD_PYTHON;
const MD_RUNNER = process.env.MD_RUNNER;
const MD_MODEL = process.env.MEGADETECTOR_MODEL_PATH;

// Empty decision threshold (based on best animal conf)
const EMPTY_THRESHOLD = Number(process.env.MD_ANIMAL_THRESHOLD ?? "0.2");

// MD thresholds (used inside md/runner.py normalize())
const MD_MIN_CONF = process.env.MD_MIN_CONF;
const MD_MAX_DETECTIONS = process.env.MD_MAX_DETECTIONS;

if (!MD_PYTHON || !MD_RUNNER || !MD_MODEL) {
  throw new Error(
    "Missing MegaDetector env vars: MD_PYTHON, MD_RUNNER, MEGADETECTOR_MODEL_PATH"
  );
}

// Species runner
const SPECIES_PYTHON = process.env.SPECIES_PYTHON;
const SPECIES_RUNNER = process.env.SPECIES_RUNNER;
const SPECIES_SIM_THRESHOLD = process.env.SPECIES_SIM_THRESHOLD;
const SPECIES_BBOX_PAD = process.env.SPECIES_BBOX_PAD;
const SPECIES_SPECIES_SOFTMAX = process.env.SPECIES_SPECIES_SOFTMAX;

const SPECIES_ENABLED =
  Boolean(SPECIES_PYTHON) &&
  Boolean(SPECIES_RUNNER) &&
  (process.env.SPECIES_ENABLED ?? "1") !== "0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function exifrParse() {
  return exifrNS?.parse || exifrDefault?.parse || exifrNS?.default?.parse || null;
}

function toIso(dt) {
  if (!dt) return null;
  if (dt instanceof Date && !isNaN(dt.getTime())) return dt.toISOString();
  const parsed = new Date(dt);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label}_timeout:${ms}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

function pickExifDate(exif) {
  return (
    exif?.DateTimeOriginal ||
    exif?.CreateDate ||
    exif?.ModifyDate ||
    exif?.DateTime ||
    null
  );
}

async function claimBatch() {
  const { data, error } = await supabase.rpc("claim_queued_assets", {
    p_batch_size: BATCH_SIZE,
    p_worker_id: WORKER_ID,
    p_stuck_minutes: STUCK_MINUTES,
  });
  if (error) throw new Error(`claim_rpc_failed:${error.message}`);
  return data || [];
}

async function fetchAssetCore(assetId) {
  const { data, error } = await supabase
    .from("assets")
    .select("id,storage_path,captured_at,created_at,attempts,camera_id")
    .eq("id", assetId)
    .single();

  if (error) throw new Error(`asset_fetch_failed:${error.message}`);
  return data;
}

async function fetchCameraImportMethod(cameraId) {
  const { data, error } = await supabase
    .from("cameras")
    .select("id,import_method,name")
    .eq("id", cameraId)
    .single();

  if (error) throw new Error(`camera_fetch_failed:${error.message}`);
  return data;
}

async function markProcessed(assetId, patch = {}) {
  const { error } = await supabase
    .from("assets")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
      ...patch,
    })
    .eq("id", assetId);

  if (error) throw new Error(`mark_processed_failed:${error.message}`);
}

async function retryOrFail(asset, errMsg) {
  const attempts = asset.attempts ?? 1;
  const shouldFail = attempts >= MAX_ATTEMPTS;

  const patch = shouldFail
    ? { status: "failed", last_error: errMsg }
    : {
        status: "queued",
        last_error: errMsg,
        worker_id: null,
        processing_started_at: null,
      };

  const { error } = await supabase.from("assets").update(patch).eq("id", asset.id);
  if (error) throw new Error(`retry_or_fail_update_failed:${error.message}`);
}

async function downloadAssetBytes(storagePath) {
  if (!STORAGE_DOWNLOAD_ENABLED) throw new Error("storage_download_disabled");

  const { data, error } = await supabase.storage
    .from("camera-assets")
    .download(storagePath);

  if (error || !data) {
    throw new Error(`storage_download_failed:${error?.message || "no data"}`);
  }

  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

function extractLastJsonLine(stdout) {
  const lines = String(stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.startsWith("{") || l.startsWith("[")) return l;
  }
  return null;
}

async function runMegaDetector(localImagePath) {
  return await new Promise((resolve, reject) => {
    const p = spawn(MD_PYTHON, [MD_RUNNER, localImagePath], {
      env: { ...process.env, MEGADETECTOR_MODEL_PATH: MD_MODEL },
    });

    let stdout = "";
    let stderr = "";

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`md_runner_failed code=${code} ${stderr}`.trim()));
        return;
      }

      const jsonLine = extractLastJsonLine(stdout);
      if (!jsonLine) {
        reject(
          new Error(
            `md_runner_no_json stdout="${stdout.slice(-500)}" stderr="${stderr.slice(-500)}"`
          )
        );
        return;
      }

      try {
        const payload = JSON.parse(jsonLine);
        const dets = payload?.detections || [];
        resolve({ payload, detections: Array.isArray(dets) ? dets : [] });
      } catch {
        reject(new Error(`md_runner_bad_json ${jsonLine}`));
      }
    });
  });
}

async function runSpecies(localImagePath, animalBboxes) {
  if (!SPECIES_ENABLED) {
    return { payload: null, results: [] };
  }
  if (!SPECIES_PYTHON || !SPECIES_RUNNER) {
    return { payload: null, results: [] };
  }
  if (!Array.isArray(animalBboxes) || animalBboxes.length === 0) {
    return { payload: null, results: [] };
  }

  const tmpBboxes = path.join(
    os.tmpdir(),
    `venaris_species_bboxes_${process.pid}_${Date.now()}.json`
  );

  fs.writeFileSync(tmpBboxes, JSON.stringify({ bboxes: animalBboxes }), "utf-8");

  try {
    const { payload, results } = await new Promise((resolve, reject) => {
      const p = spawn(SPECIES_PYTHON, [SPECIES_RUNNER, localImagePath, tmpBboxes], {
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      p.stdout.on("data", (d) => (stdout += d.toString()));
      p.stderr.on("data", (d) => (stderr += d.toString()));

      p.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`species_runner_failed code=${code} ${stderr}`.trim()));
          return;
        }

        const jsonLine = extractLastJsonLine(stdout);
        if (!jsonLine) {
          reject(
            new Error(
              `species_runner_no_json stdout="${stdout.slice(-500)}" stderr="${stderr.slice(-500)}"`
            )
          );
          return;
        }

        try {
          const pl = JSON.parse(jsonLine);
          const r = Array.isArray(pl?.results) ? pl.results : [];
          resolve({ payload: pl, results: r });
        } catch {
          reject(new Error(`species_runner_bad_json ${jsonLine}`));
        }
      });
    });

    return { payload, results };
  } finally {
    try {
      fs.unlinkSync(tmpBboxes);
    } catch {}
  }
}

function summarizeDetections(dets) {
  const counts = { animal: 0, human: 0, vehicle: 0, other: 0 };
  let bestAnimal = 0;
  let bestHuman = 0;
  let bestVehicle = 0;

  for (const d of dets || []) {
    const label = String(d?.label || "");
    const score = Number(d?.score || 0);

    if (label === "animal") {
      counts.animal++;
      bestAnimal = Math.max(bestAnimal, score);
    } else if (label === "human") {
      counts.human++;
      bestHuman = Math.max(bestHuman, score);
    } else if (label === "vehicle") {
      counts.vehicle++;
      bestVehicle = Math.max(bestVehicle, score);
    } else {
      counts.other++;
    }
  }

  return { counts, bestAnimal, bestHuman, bestVehicle };
}

function computeEmptyFromBestAnimal(bestAnimal) {
  const empty = bestAnimal < EMPTY_THRESHOLD;
  return {
    empty,
    empty_confidence: Math.max(0, 1 - bestAnimal),
    best_animal_score: bestAnimal,
  };
}

async function resolveCapturedAt(core, cam, buf) {
  if (core.captured_at) return { captured_at: core.captured_at, source: "existing" };

  const importMethod = cam?.import_method || "unknown";
  const mayTryExif =
    buf &&
    Buffer.isBuffer(buf) &&
    buf.length > 0 &&
    buf.length <= EXIF_MAX_BYTES &&
    EXIF_ONLY_FOR_IMPORT_METHODS.has(importMethod);

  if (mayTryExif) {
    const parseFn = exifrParse();
    if (parseFn) {
      try {
        const exif = await withTimeout(
          parseFn(buf, { tiff: true, exif: true, gps: false, ifd0: true }),
          EXIF_TIMEOUT_MS,
          "exif"
        );
        const dt = pickExifDate(exif);
        const iso = toIso(dt);
        if (iso) return { captured_at: iso, source: "exif" };
      } catch {
        // ignore EXIF failures -> fallback below
      }
    }
  }

  if (core.created_at) return { captured_at: core.created_at, source: "created_at_fallback" };
  return { captured_at: new Date().toISOString(), source: "now_fallback" };
}

async function processAsset(assetFromBatch) {
  const asset =
    assetFromBatch.created_at ||
    assetFromBatch.captured_at ||
    assetFromBatch.storage_path ||
    assetFromBatch.camera_id
      ? assetFromBatch
      : await fetchAssetCore(assetFromBatch.id);

  const core = asset.camera_id ? asset : await fetchAssetCore(asset.id);
  const cam = await fetchCameraImportMethod(core.camera_id);

  if (!core.storage_path) throw new Error("asset_missing_storage_path");

  const patch = {};

  // download once; reuse buffer for EXIF + write tmp file for MD/species
  const buf = await downloadAssetBytes(core.storage_path);

  // captured_at patch if missing
  const resolved = await resolveCapturedAt(core, cam, buf);
  if (!core.captured_at && resolved.captured_at) {
    patch.captured_at = resolved.captured_at;
  }

  // keep extension (jpg/webp/...)
  const ext = path.extname(core.storage_path || "") || ".jpg";
  const tmpFile = path.join(os.tmpdir(), `venaris_${core.id}${ext}`);
  fs.writeFileSync(tmpFile, buf);

  // 1) MegaDetector
  let md;
  try {
    md = await runMegaDetector(tmpFile);
  } finally {
    // do NOT delete yet if species needs it; we delete after species
  }

  const mdDets = md?.detections || [];
  const mdSummary = summarizeDetections(mdDets);
  const emptyInfo = computeEmptyFromBestAnimal(mdSummary.bestAnimal);

  // 2) Insert MD detections (with md_idx)
  let inserted = [];
  if (mdDets.length) {
    const rows = mdDets.map((d, idx) => ({
      asset_id: core.id,
      label: d.label,
      score: d.score,
      species: null,
      count: null,
      meta: {
        bbox: d.bbox,
        model: "megadetector_v1000",
        md_idx: idx,
      },
    }));

    const { data, error } = await supabase
      .from("detections")
      .insert(rows)
      .select("id,label,score,meta,species");

    if (error) throw new Error(`detections_insert_failed ${error.message}`);
    inserted = data || [];
  }

  // 3) Species classification (only animals) -> update those inserted rows (Option A)
  let speciesUpdated = 0;
  let speciesFailures = 0;

  if (SPECIES_ENABLED && inserted.length && mdSummary.counts.animal > 0) {
    // map animal detections in insertion order by md_idx
    const animalInserted = inserted
      .map((r) => {
        const idx = Number(r?.meta?.md_idx);
        return Number.isFinite(idx) ? { row: r, md_idx: idx } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.md_idx - b.md_idx)
      .map((x) => x.row)
      .filter((r) => r?.label === "animal");

    // corresponding bboxes
    const animalBboxes = animalInserted
      .map((r) => r?.meta?.bbox)
      .filter((bb) => Array.isArray(bb) && bb.length === 4);

    if (animalInserted.length && animalBboxes.length === animalInserted.length) {
      try {
        const species = await runSpecies(tmpFile, animalBboxes);

        // results: [{i, species, score, sim, bbox, ...}]
        const results = Array.isArray(species?.results) ? species.results : [];
        const modelName = species?.payload?.model || null;

        // update per bbox-index i
        for (const r of results) {
          const i = Number(r?.i);
          if (!Number.isFinite(i) || i < 0 || i >= animalInserted.length) continue;

          const target = animalInserted[i];
          const sp = r?.species || null;
          const spScore = Number(r?.score ?? 0);
          const spSim = Number(r?.sim ?? 0);

          // only write taxonomy enum values; runner already outputs your enum values
          if (!sp) continue;

          const mergedMeta = {
            ...(target.meta || {}),
            species: {
              model: modelName,
              sim_threshold: species?.payload?.sim_threshold ?? null,
              bbox_pad: species?.payload?.bbox_pad ?? null,
              prompt_mode: species?.payload?.prompt_mode ?? null,
              softmax: species?.payload?.prompt_mode === "softmax" ? 1 : 0,
              sim: Number.isFinite(spSim) ? spSim : null,
              score: Number.isFinite(spScore) ? spScore : null,
            },
          };

          const { error: upErr } = await supabase
            .from("detections")
            .update({
              species: sp,
              meta: mergedMeta,
            })
            .eq("id", target.id);

          if (upErr) {
            speciesFailures++;
          } else {
            speciesUpdated++;
          }
        }
      } catch (e) {
        // species failure should not fail the whole asset; we still mark processed
        speciesFailures++;
      }
    }
  }

  // remove tmp file now
  try {
    fs.unlinkSync(tmpFile);
  } catch {}

  // 4) Empty/relevance patch (system decision)
  patch.empty = emptyInfo.empty;
  patch.empty_confidence = emptyInfo.empty_confidence;
  patch.relevant = !emptyInfo.empty;

  await markProcessed(core.id, patch);

  // 5) event layer
  await supabase.rpc("upsert_event_for_asset", {
    p_asset_id: core.id,
    p_window_minutes: 10,
  });

  return {
    cameraName: cam.name,
    capturedSource: resolved.source,

    md_total: mdDets.length,
    md_counts: mdSummary.counts,
    best_animal: mdSummary.bestAnimal,
    best_human: mdSummary.bestHuman,
    best_vehicle: mdSummary.bestVehicle,

    empty: emptyInfo.empty,
    empty_confidence: emptyInfo.empty_confidence,

    inserted: inserted.length,
    species_enabled: SPECIES_ENABLED,
    species_updated: speciesUpdated,
    species_failures: speciesFailures,
  };
}

async function main() {
  console.log(`[${WORKER_ID}] started`, {
    POLL_SECONDS,
    BATCH_SIZE,
    MAX_ATTEMPTS,
    STUCK_MINUTES,
    STORAGE_DOWNLOAD_ENABLED,
    EXIF_MAX_BYTES,
    EXIF_TIMEOUT_MS,
    EXIF_ONLY_FOR_IMPORT_METHODS: [...EXIF_ONLY_FOR_IMPORT_METHODS],

    MEGADETECTOR_MODEL_PATH: MD_MODEL,
    MD_RUNNER,
    MD_PYTHON,
    EMPTY_THRESHOLD,
    MD_MIN_CONF,
    MD_MAX_DETECTIONS,

    SPECIES_ENABLED,
    SPECIES_PYTHON: SPECIES_PYTHON ? "[set]" : null,
    SPECIES_RUNNER: SPECIES_RUNNER ? "[set]" : null,
    SPECIES_SIM_THRESHOLD,
    SPECIES_BBOX_PAD,
    SPECIES_SPECIES_SOFTMAX,
  });

  while (true) {
    let batch = [];

    try {
      batch = await claimBatch();
    } catch (e) {
      console.error(`[${WORKER_ID}] claim error`, e?.message || e);
      await sleep(POLL_SECONDS * 1000);
      continue;
    }

    if (!batch.length) {
      await sleep(POLL_SECONDS * 1000);
      continue;
    }

    for (const a of batch) {
      const t0 = Date.now();

      try {
        const res = await processAsset(a);

        // Why empty?
        // empty is based on best_animal; if only humans/vehicles exist, empty can be true even with detections.
        const emptyReason = res.md_counts?.animal > 0
          ? `best_animal=${res.best_animal.toFixed(3)} < thr=${Number(EMPTY_THRESHOLD).toFixed(3)}`
          : `no_animal_detections (humans=${res.md_counts?.human || 0}, vehicles=${res.md_counts?.vehicle || 0})`;

        console.log(
          `[${WORKER_ID}] processed asset=${a.id} cam="${res.cameraName}" ` +
            `md_total=${res.md_total} animals=${res.md_counts.animal} humans=${res.md_counts.human} vehicles=${res.md_counts.vehicle} ` +
            `best_animal=${res.best_animal.toFixed(3)} empty=${res.empty} (${emptyReason}) ` +
            `inserted=${res.inserted} species_updated=${res.species_updated} species_failures=${res.species_failures} ` +
            `captured=${res.capturedSource} dt_ms=${Date.now() - t0}`
        );
      } catch (e) {
        const msg = e?.message || String(e);
        console.warn(`[${WORKER_ID}] error asset=${a.id}: ${msg}`);

        try {
          await retryOrFail(a, msg);
        } catch (inner) {
          console.error(`[${WORKER_ID}] retry failed`, inner?.message || inner);
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(`[${WORKER_ID}] fatal`, e);
  process.exit(1);
});