// infrastructure/hetzner-worker/detection-worker/detection-worker.mjs #15
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

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const WORKER_ID = process.env.WORKER_ID || `det-worker-${process.pid}`;
const POLL_SECONDS = positiveNumber(process.env.POLL_SECONDS || 5, 5);
const IDLE_BACKOFF_ENABLED = process.env.IDLE_BACKOFF_ENABLED !== "0";
const MAX_IDLE_POLL_SECONDS = positiveNumber(
  process.env.MAX_IDLE_POLL_SECONDS || 60,
  60
);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 10);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 5);
const STUCK_MINUTES = Number(process.env.STUCK_MINUTES || 30);
const STORAGE_DELETE_AFTER_HOURS = Number(
  process.env.STORAGE_DELETE_AFTER_HOURS || 24
);
const SECURITY_DELETE_AFTER_DAYS = Number(
  process.env.SECURITY_DELETE_AFTER_DAYS || 30
);

const STORAGE_DOWNLOAD_ENABLED =
  (process.env.STORAGE_DOWNLOAD_ENABLED ?? "1") !== "0";

const LEGACY_EVENT_UPSERT_ENABLED =
  (process.env.LEGACY_EVENT_UPSERT_ENABLED ?? "1") !== "0";

// EXIF safety caps (soft)
const EXIF_MAX_BYTES = Number(process.env.EXIF_MAX_BYTES || 6_000_000);
const EXIF_TIMEOUT_MS = Number(process.env.EXIF_TIMEOUT_MS || 4_000);
const EXIF_MAX_FUTURE_MINUTES = Number(
  process.env.EXIF_MAX_FUTURE_MINUTES || 30
);
const EXIF_MAX_PAST_YEARS = Number(process.env.EXIF_MAX_PAST_YEARS || 5);
const DEFAULT_TIME_ZONE = process.env.DEFAULT_TIME_ZONE || "Europe/Berlin";

const EXIF_ONLY_FOR_IMPORT_METHODS = new Set(
  (process.env.EXIF_ONLY_FOR_IMPORT_METHODS || "ftp,manual,smtp,token-ingest")
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
const SPECIES_BLANK_GUARD_BLANK_MIN = Number(
  process.env.SPECIES_BLANK_GUARD_BLANK_MIN ?? "0.90"
);
const SPECIES_BLANK_GUARD_SPECIES_MAX = Number(
  process.env.SPECIES_BLANK_GUARD_SPECIES_MAX ?? "0.01"
);

const SPECIES_ENABLED =
  Boolean(SPECIES_PYTHON) &&
  Boolean(SPECIES_RUNNER) &&
  (process.env.SPECIES_ENABLED ?? "1") !== "0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getNextIdlePollSeconds(currentSeconds) {
  if (!IDLE_BACKOFF_ENABLED) {
    return POLL_SECONDS;
  }

  const base = Math.max(1, POLL_SECONDS);
  const max = Math.max(base, MAX_IDLE_POLL_SECONDS);
  const current = Math.max(base, positiveNumber(currentSeconds, base));

  return Math.min(current * 2, max);
}

function exifrParse() {
  return exifrNS?.parse || exifrDefault?.parse || exifrNS?.default?.parse || null;
}

const EXPLICIT_OFFSET_RE = /(?:z|[+-]\d{2}:?\d{2})$/i;

function isValidTimeZone(value) {
  if (!value || typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeTimeZone(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return isValidTimeZone(trimmed) ? trimmed : DEFAULT_TIME_ZONE;
}

function getStorageDeleteAfterIso() {
  return new Date(
    Date.now() + STORAGE_DELETE_AFTER_HOURS * 60 * 60 * 1000
  ).toISOString();
}

function getSecurityDeleteAfterIso() {
  return new Date(
    Date.now() + SECURITY_DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
}

function parseNaiveExifString(value) {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();

  const m = trimmed.match(
    /^(\d{4})[-:](\d{2})[-:](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
  );

  if (!m) return null;

  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
    millisecond: Number((m[7] ?? "0").padEnd(3, "0")),
  };
}

function dateObjectAsWallTimeParts(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;

  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
    millisecond: value.getUTCMilliseconds(),
  };
}

function getTimeZoneOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const valueByType = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const asUtcMs = Date.UTC(
    Number(valueByType.get("year")),
    Number(valueByType.get("month")) - 1,
    Number(valueByType.get("day")),
    Number(valueByType.get("hour")),
    Number(valueByType.get("minute")),
    Number(valueByType.get("second")),
    0
  );

  return asUtcMs - utcMs;
}

function addMinutesToParts(parts, minutes) {
  const ms = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );

  const shifted = new Date(ms + Number(minutes || 0) * 60_000);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

function wallTimePartsToUtcIso(parts, timeZone) {
  const wallAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );

  let utcMs = wallAsUtcMs;

  for (let i = 0; i < 3; i++) {
    const offsetMs = getTimeZoneOffsetMs(utcMs, timeZone);
    const nextUtcMs = wallAsUtcMs - offsetMs;

    if (Math.abs(nextUtcMs - utcMs) < 1) {
      utcMs = nextUtcMs;
      break;
    }

    utcMs = nextUtcMs;
  }

  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validateCapturedAtIso(iso, now = new Date()) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return { ok: false, warning: "exif_parse_failed" };

  const futureLimit = now.getTime() + EXIF_MAX_FUTURE_MINUTES * 60 * 1000;
  const pastLimit = new Date(now);
  pastLimit.setFullYear(pastLimit.getFullYear() - EXIF_MAX_PAST_YEARS);

  if (ts > futureLimit) {
    return { ok: false, warning: "exif_future" };
  }

  if (ts < pastLimit.getTime()) {
    return { ok: false, warning: "exif_before_min_date" };
  }

  return { ok: true, warning: null };
}

function normalizeExifDate(dt, cam) {
  const timeZone = normalizeTimeZone(cam?.timezone);
  const clockOffsetMinutes = Number(cam?.clock_offset_minutes || 0);

  if (!dt) {
    return {
      captured_at: null,
      source: "exif",
      confidence: "rejected",
      timezone: timeZone,
      warning: "exif_missing",
    };
  }

  let iso = null;

  if (typeof dt === "string") {
    const trimmed = dt.trim();

    if (EXPLICIT_OFFSET_RE.test(trimmed)) {
      const parsed = new Date(trimmed);
      iso = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    } else {
      const parts = parseNaiveExifString(trimmed);
      const shiftedParts = parts
        ? addMinutesToParts(parts, clockOffsetMinutes)
        : null;
      iso = shiftedParts ? wallTimePartsToUtcIso(shiftedParts, timeZone) : null;
    }
  } else if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
    const parts = dateObjectAsWallTimeParts(dt);
    const shiftedParts = parts
      ? addMinutesToParts(parts, clockOffsetMinutes)
      : null;
    iso = shiftedParts ? wallTimePartsToUtcIso(shiftedParts, timeZone) : null;
  }

  if (!iso) {
    return {
      captured_at: null,
      source: "exif",
      confidence: "rejected",
      timezone: timeZone,
      warning: "exif_parse_failed",
    };
  }

  const validation = validateCapturedAtIso(iso);

  if (!validation.ok) {
    return {
      captured_at: null,
      source: "exif",
      confidence: "rejected",
      timezone: timeZone,
      warning: validation.warning,
    };
  }

  return {
    captured_at: iso,
    source: "exif",
    confidence: "high",
    timezone: timeZone,
    warning: clockOffsetMinutes !== 0 ? "clock_offset_applied" : null,
  };
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

async function fetchCameraContext(cameraId) {
  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id,organization_id,import_method,name,revier_id,clock_offset_minutes")
    .eq("id", cameraId)
    .single();

  if (error) throw new Error(`camera_fetch_failed:${error.message}`);

  let timezone = DEFAULT_TIME_ZONE;

  if (camera?.revier_id) {
    const { data: revier, error: revierError } = await supabase
      .from("reviers")
      .select("timezone")
      .eq("id", camera.revier_id)
      .maybeSingle();

    if (revierError) {
      throw new Error(`revier_fetch_failed:${revierError.message}`);
    }

    timezone = normalizeTimeZone(revier?.timezone);
  }

  let securityDetectionsEnabled = false;

  if (camera?.organization_id) {
    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .select("security_detections_enabled")
      .eq("id", camera.organization_id)
      .maybeSingle();

    if (organizationError) {
      throw new Error(`organization_fetch_failed:${organizationError.message}`);
    }

    securityDetectionsEnabled =
      organization?.security_detections_enabled === true;
  }

  return {
    ...camera,
    timezone,
    security_detections_enabled: securityDetectionsEnabled,
    clock_offset_minutes: Number(camera?.clock_offset_minutes || 0),
  };
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

async function upsertSecurityDetections({ core, cam, mdSummary, capturedAt, deleteAfter }) {
  if (!cam?.security_detections_enabled) return 0;

  const rows = [];

  if (mdSummary.counts.human > 0) {
    rows.push({
      organization_id: cam.organization_id,
      revier_id: cam.revier_id ?? null,
      camera_id: core.camera_id,
      asset_id: core.id,
      detected_class: "human",
      score: mdSummary.bestHuman,
      captured_at: capturedAt,
      delete_after: deleteAfter,
    });
  }

  if (mdSummary.counts.vehicle > 0) {
    rows.push({
      organization_id: cam.organization_id,
      revier_id: cam.revier_id ?? null,
      camera_id: core.camera_id,
      asset_id: core.id,
      detected_class: "vehicle",
      score: mdSummary.bestVehicle,
      captured_at: capturedAt,
      delete_after: deleteAfter,
    });
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("security_detections")
    .upsert(rows, { onConflict: "asset_id,detected_class" });

  if (error) throw new Error(`security_detections_upsert_failed ${error.message}`);

  return rows.length;
}


async function resolveCapturedAt(core, cam, buf) {
  if (core.captured_at) {
    return {
      captured_at: core.captured_at,
      source: "existing",
      confidence: null,
      timezone: normalizeTimeZone(cam?.timezone),
      warning: null,
    };
  }

  const importMethod = cam?.import_method || "unknown";
  const mayTryExif =
    buf &&
    Buffer.isBuffer(buf) &&
    buf.length > 0 &&
    buf.length <= EXIF_MAX_BYTES &&
    EXIF_ONLY_FOR_IMPORT_METHODS.has(importMethod);

  let exifWarning = null;
  let exifTimezone = normalizeTimeZone(cam?.timezone);

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
        const resolved = normalizeExifDate(dt, cam);

        exifWarning = resolved.warning;
        exifTimezone = resolved.timezone;

        if (resolved.captured_at) {
          return resolved;
        }
      } catch {
        exifWarning = "exif_parse_failed";
      }
    } else {
      exifWarning = "exif_unavailable";
    }
  } else {
    exifWarning = "exif_unavailable";
  }

  if (core.created_at) {
    return {
      captured_at: core.created_at,
      source: "created_at_fallback",
      confidence: "fallback",
      timezone: exifTimezone,
      warning: exifWarning ?? "exif_unavailable",
    };
  }

  return {
    captured_at: new Date().toISOString(),
    source: "now_fallback",
    confidence: "fallback",
    timezone: exifTimezone,
    warning: exifWarning ?? "exif_unavailable",
  };
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
  const cam = await fetchCameraContext(core.camera_id);

  if (!core.storage_path) throw new Error("asset_missing_storage_path");

  const patch = {};

  // download once; reuse buffer for EXIF + write tmp file for MD/species
  const buf = await downloadAssetBytes(core.storage_path);

  // captured_at patch if missing
  const resolved = await resolveCapturedAt(core, cam, buf);
  if (!core.captured_at && resolved.captured_at) {
    patch.captured_at = resolved.captured_at;
    patch.captured_at_source = resolved.source;
    patch.captured_at_timezone = resolved.timezone ?? null;
    patch.captured_at_confidence = resolved.confidence ?? null;
    patch.captured_at_warning = resolved.warning ?? null;
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
  const hasSecurityDetection =
    mdSummary.counts.human > 0 || mdSummary.counts.vehicle > 0;
  const emptyInfo = hasSecurityDetection
    ? {
        empty: false,
        empty_confidence: 0,
        best_animal_score: mdSummary.bestAnimal,
      }
    : computeEmptyFromBestAnimal(mdSummary.bestAnimal);
  const hasWildlifeDetection =
    !hasSecurityDetection &&
    mdSummary.counts.animal > 0 &&
    emptyInfo.empty === false;


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
  let speciesCompleted = false;
  let wildlifeDetectionsSuppressed = 0;
  let validWildlifeDetectionsAfterSpecies = 0;


  if (SPECIES_ENABLED && inserted.length && hasWildlifeDetection) {
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
        speciesCompleted = true;

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

          const topK = Array.isArray(r?.top_k) ? r.top_k : [];
          const rank1 =
            topK.find((item) => Number(item?.rank) === 1) || topK[0] || null;
          const rank1CommonName = String(
            rank1?.raw_common_name || ""
          ).toLowerCase();
          const rank1Score = Number(rank1?.score ?? 0);

          const blankDominant =
            rank1CommonName === "blank" &&
            rank1Score >= SPECIES_BLANK_GUARD_BLANK_MIN;

          const blankGuarded =
            blankDominant &&
            sp !== "other" &&
            Number.isFinite(spScore) &&
            spScore < SPECIES_BLANK_GUARD_SPECIES_MAX;

          const blankOtherSuppressed =
            blankDominant &&
            sp === "other";

          if (blankGuarded || blankOtherSuppressed) {
            wildlifeDetectionsSuppressed++;
          } else {
            validWildlifeDetectionsAfterSpecies++;
          }

          const speciesMeta = {
            model: modelName,
            sim_threshold: species?.payload?.sim_threshold ?? null,
            bbox_pad: species?.payload?.bbox_pad ?? null,
            prompt_mode: species?.payload?.prompt_mode ?? null,
            softmax: species?.payload?.prompt_mode === "softmax" ? 1 : 0,
            sim: Number.isFinite(spSim) ? spSim : null,
            score: Number.isFinite(spScore) ? spScore : null,
            raw_label: r?.raw_label ?? null,
            raw_common_name: r?.raw_common_name ?? null,
            raw_taxon_id: r?.raw_taxon_id ?? null,
            mapping_reason: r?.mapping_reason ?? null,
            top_k: topK,
          };

          if (blankGuarded || blankOtherSuppressed) {
            speciesMeta.quality_gate = {
              decision: "suppress_wildlife_detection",
              reason: blankOtherSuppressed
                ? "blank_dominant_other_guard"
                : "blank_dominant_speciesnet_guard",
              blank_score: rank1Score,
              species_score: Number.isFinite(spScore) ? spScore : null,
            };
          }

          const mergedMeta = {
            ...(target.meta || {}),
            species: speciesMeta,
          };

          const { error: upErr } = await supabase
            .from("detections")
            .update({
              species: blankGuarded || blankOtherSuppressed ? null : sp,
              meta: mergedMeta,
            })
            .eq("id", target.id);

          if (upErr) {
            speciesFailures++;
          } else {
            speciesUpdated++;
          }
        }
      } catch {
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
const blankGuardSuppressedAllWildlife =
  SPECIES_ENABLED &&
  speciesCompleted &&
  wildlifeDetectionsSuppressed > 0 &&
  validWildlifeDetectionsAfterSpecies === 0;

const hasFinalWildlifeDetection =
  hasWildlifeDetection && !blankGuardSuppressedAllWildlife;

patch.empty = blankGuardSuppressedAllWildlife ? true : emptyInfo.empty;
patch.empty_confidence = blankGuardSuppressedAllWildlife
  ? 1
  : emptyInfo.empty_confidence;
patch.relevant = hasFinalWildlifeDetection;

let securityRowsInserted = 0;

if (hasSecurityDetection) {
  const securityDeleteAfter = getSecurityDeleteAfterIso();

  if (cam.security_detections_enabled) {
    securityRowsInserted = await upsertSecurityDetections({
      core,
      cam,
      mdSummary,
      capturedAt: patch.captured_at ?? core.captured_at ?? core.created_at,
      deleteAfter: securityDeleteAfter,
    });

    patch.storage_delete_after = securityDeleteAfter;
    patch.storage_delete_reason = "security_detection";
  } else {
    patch.storage_delete_after = getStorageDeleteAfterIso();
    patch.storage_delete_reason = "security_detection_disabled";
  }

  patch.storage_delete_error = null;
} else if (patch.empty === true || patch.relevant === false) {
  patch.storage_delete_after = getStorageDeleteAfterIso();
  patch.storage_delete_reason =
    patch.empty === true ? "auto_empty" : "auto_irrelevant";
  patch.storage_delete_error = null;
}

await markProcessed(core.id, patch);

  // 5) legacy event layer
  // Materialized events are now the fachliche event truth.
  // Keep this legacy path feature-flagged during rollout because older routes
  // and demo/preview helpers can still depend on legacy event IDs.
  let legacyEventUpserted = false;
  let legacyEventUpsertSkipped = false;

  if (hasFinalWildlifeDetection) {
    if (LEGACY_EVENT_UPSERT_ENABLED) {
      await supabase.rpc("upsert_event_for_asset", {
        p_asset_id: core.id,
        p_window_minutes: 20,
      });
      legacyEventUpserted = true;
    } else {
      legacyEventUpsertSkipped = true;
    }
  }

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
    security_detection: hasSecurityDetection,
    security_enabled: cam.security_detections_enabled,
    security_rows_inserted: securityRowsInserted,

    species_enabled: SPECIES_ENABLED,
    species_updated: speciesUpdated,
    species_failures: speciesFailures,

    wildlife_suppressed: wildlifeDetectionsSuppressed,
    final_wildlife_detection: hasFinalWildlifeDetection,

    legacy_event_upsert_enabled: LEGACY_EVENT_UPSERT_ENABLED,
    legacy_event_upserted: legacyEventUpserted,
    legacy_event_upsert_skipped: legacyEventUpsertSkipped,
  };
}

async function main() {
  console.log(`[${WORKER_ID}] started`, {
    POLL_SECONDS,
    IDLE_BACKOFF_ENABLED,
    MAX_IDLE_POLL_SECONDS,
    BATCH_SIZE,  
    MAX_ATTEMPTS,
    STUCK_MINUTES,
    STORAGE_DOWNLOAD_ENABLED,
    LEGACY_EVENT_UPSERT_ENABLED,
    EXIF_MAX_BYTES,
    EXIF_TIMEOUT_MS,
    EXIF_MAX_FUTURE_MINUTES,
    EXIF_MAX_PAST_YEARS,
    DEFAULT_TIME_ZONE,
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

  let idlePollSeconds = POLL_SECONDS;

  while (true) {
    let batch = [];

    try {
      batch = await claimBatch();
    } catch (e) {
      console.error(`[${WORKER_ID}] claim error`, e?.message || e);
      await sleep(idlePollSeconds * 1000);
      idlePollSeconds = getNextIdlePollSeconds(idlePollSeconds);
      continue;
    }

    if (!batch.length) {
      await sleep(idlePollSeconds * 1000);
      idlePollSeconds = getNextIdlePollSeconds(idlePollSeconds);
      continue;
    }

    idlePollSeconds = POLL_SECONDS;

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
            `legacy_event_upserted=${res.legacy_event_upserted} legacy_event_skipped=${res.legacy_event_upsert_skipped} ` +
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
