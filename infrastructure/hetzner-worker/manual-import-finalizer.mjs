// infrastructure/hetzner-worker/manual-import-finalizer.mjs #3
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function env(name, required = true) {
  const v = process.env[name];
  if (required && (!v || !String(v).trim())) {
    throw new Error(`Missing env: ${name}`);
  }
  return String(v || "").trim();
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const WORKER_ID =
  process.env.WORKER_ID || `manual-import-finalizer-${process.pid}`;
const POLL_SECONDS = positiveNumber(process.env.POLL_SECONDS || "5", 5);
const IDLE_BACKOFF_ENABLED = process.env.IDLE_BACKOFF_ENABLED !== "0";
const MAX_IDLE_POLL_SECONDS = positiveNumber(
  process.env.MAX_IDLE_POLL_SECONDS || "60",
  60
);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || "10");
const STUCK_MINUTES = Number(process.env.STUCK_MINUTES || "30");
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || "5");
const DEFAULT_BUCKET = process.env.STORAGE_BUCKET || "camera-assets";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getNextIdlePollSeconds(currentSeconds) {
  if (!IDLE_BACKOFF_ENABLED) {
    return POLL_SECONDS;
  }

  const base = Math.max(1, POLL_SECONDS);
  const max = Math.max(base, MAX_IDLE_POLL_SECONDS);
  const current = Math.max(base, positiveNumber(currentSeconds, base));

  return Math.min(current * 2, max);
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isTransientError(error) {
  return /429|502|503|504|too many connections|max_client_conn|connection pool|timeout|network|failed to fetch|temporarily|service unavailable|bad gateway/i.test(safeMessage(error));
}

async function withRetry(operation) {
  const delays = [1500, 4000, 9000, 15000, 30000];
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!isTransientError(error) || attempt >= delays.length) throw error;
      await sleep(delays[attempt] + Math.random() * 500);
    }
  }
}

async function recoverPreparedRows() {
  const { data, error } = await supabase.rpc("recover_manual_import_uploads");
  if (error) throw new Error(`recover_manual_import_uploads_failed:${error.message}`);
  const expiredBatches = new Set((data || [])
    .filter(row => row.recovered_status === "expired").map(row => row.batch_id));
  for (const batchId of expiredBatches) await updateBatchSummary(batchId);
}

async function claimBatch() {
  const { data, error } = await supabase.rpc("claim_manual_import_files", {
    p_batch_size: BATCH_SIZE,
    p_worker_id: WORKER_ID,
    p_stuck_minutes: STUCK_MINUTES,
  });

  if (error) throw new Error(`claim_manual_import_files_failed:${error.message}`);
  return data || [];
}

async function downloadStorageBytes(bucket, storagePath) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`storage_download_failed:${error?.message || "no data"}`);
  }

  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

async function markRowFailed(row, errorMessage) {
  const attempts = Number(row.attempts || 1);
  const transient = isTransientError(errorMessage);
  const terminal = !transient && attempts >= MAX_ATTEMPTS;

  const patch = terminal
    ? {
        status: "failed",
        error_summary: errorMessage,
        finalized_at: new Date().toISOString(),
      }
    : {
        status: "finalize_pending",
        ...(transient ? { attempts: Math.max(0, attempts - 1) } : {}),
        error_summary: errorMessage,
        worker_id: null,
        finalize_started_at: null,
      };

  const { error } = await supabase
    .from("manual_import_files")
    .update(patch)
    .eq("id", row.id);

  if (error) {
    throw new Error(`manual_import_files_fail_update_failed:${error.message}`);
  }

}

async function updateCameraHealth(cameraId) {
  const { error } = await supabase
    .from("cameras")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", cameraId);

  if (error) {
    console.warn(
      `[${WORKER_ID}] camera last_seen update failed camera=${cameraId}: ${error.message}`
    );
  }
}

async function removeStorageObject(bucket, storagePath) {
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);

  if (error) {
    console.warn(
      `[${WORKER_ID}] storage remove failed bucket=${bucket} path=${storagePath}: ${error.message}`
    );
  }
}

async function fetchAssetStoragePath(assetId) {
  const { data, error } = await supabase
    .from("assets")
    .select("storage_path")
    .eq("id", assetId)
    .maybeSingle();

  if (error) {
    throw new Error(`asset_storage_path_lookup_failed:${error.message}`);
  }

  return data?.storage_path ?? null;
}

async function updateBatchSummary(batchId) {
  const { data: rows, error } = await supabase
    .from("manual_import_files")
    .select("status")
    .eq("ingest_batch_id", batchId);

  if (error) {
    console.warn(
      `[${WORKER_ID}] batch summary rows failed batch=${batchId}: ${error.message}`
    );
    return;
  }

  const counts = new Map();

  for (const row of rows || []) {
    counts.set(row.status, (counts.get(row.status) || 0) + 1);
  }

  const nonTerminal = ["prepared", "finalize_pending", "processing"].some(
    (status) => (counts.get(status) || 0) > 0
  );

  if (nonTerminal) return;

  const inserted = counts.get("asset_created") || 0;
  const duplicate = counts.get("duplicate") || 0;
  const failed = counts.get("failed") || 0;
  const expired = counts.get("expired") || 0;

  const summary = [
    `asset_created: ${inserted}`,
    `duplicates: ${duplicate}`,
    failed > 0 ? `failed: ${failed}` : null,
    expired > 0 ? `expired: ${expired}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const hasAnyAccepted = inserted > 0 || duplicate > 0;

  const { error: updateError } = await supabase
    .from("ingest_batches")
    .update({
      status: hasAnyAccepted ? "completed" : "failed",
      error_summary: summary || null,
    })
    .eq("id", batchId);

  if (updateError) {
    console.warn(
      `[${WORKER_ID}] batch summary update failed batch=${batchId}: ${updateError.message}`
    );
  }
}

async function registerAsset(row, fileHash) {
  const { data, error } = await supabase.rpc("register_ingested_asset", {
    p_camera_id: row.camera_id,
    p_storage_path: row.storage_path,
    p_file_hash: fileHash,
    p_ingest_batch_id: row.ingest_batch_id,
    p_captured_at: null,
    p_relevant: false,
  });

  if (error) {
    throw new Error(`register_ingested_asset_failed:${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result?.asset_id || !result?.action) {
    throw new Error("register_ingested_asset_returned_invalid_payload");
  }

  return result;
}

async function processRow(row) {
  const bucket = row.storage_bucket || DEFAULT_BUCKET;
  const buf = await downloadStorageBytes(bucket, row.storage_path);

  if (Number(row.expected_size_bytes) !== buf.length) {
    throw new Error(
      `size_mismatch upload=${row.id} expected=${row.expected_size_bytes} actual=${buf.length}`
    );
  }

  const fileHash = sha256(buf);
  const registered = await registerAsset(row, fileHash);
  const isDuplicate = registered.action === "duplicate";

  let existingStoragePath = null;
  if (isDuplicate) {
    existingStoragePath = await fetchAssetStoragePath(registered.asset_id);
  }

  const isSameStorageRetry =
    isDuplicate && existingStoragePath === row.storage_path;
  const finalStatus =
    isDuplicate && !isSameStorageRetry ? "duplicate" : "asset_created";

  const { error: updateError } = await supabase
    .from("manual_import_files")
    .update({
      status: finalStatus,
      asset_id: registered.asset_id,
      file_hash: fileHash,
      error_summary: null,
      finalized_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateError) {
    throw new Error(`manual_import_files_update_failed:${updateError.message}`);
  }

  if (
    isDuplicate &&
    existingStoragePath &&
    existingStoragePath !== row.storage_path
  ) {
    await removeStorageObject(bucket, row.storage_path);
  }


  return {
    action: finalStatus,
    assetId: registered.asset_id,
    fileHash,
    bytes: buf.length,
  };
}

async function main() {
  console.log(`[${WORKER_ID}] started`, {
    POLL_SECONDS,
    IDLE_BACKOFF_ENABLED,
    MAX_IDLE_POLL_SECONDS,
    BATCH_SIZE,
    STUCK_MINUTES,
    MAX_ATTEMPTS,
    DEFAULT_BUCKET,
  });

  let idlePollSeconds = POLL_SECONDS;
  let nextRecovery = 0;

  while (true) {
    try {
      if (Date.now() >= nextRecovery) {
        await recoverPreparedRows();
        nextRecovery = Date.now() + 60_000;
      }

      const rows = await claimBatch();

      if (!rows.length) {
        await sleep(idlePollSeconds * 1000);
        idlePollSeconds = getNextIdlePollSeconds(idlePollSeconds);
        continue;
      }

      idlePollSeconds = POLL_SECONDS;

      const successfulCameras = new Set();
      for (const row of rows) {
        const t0 = Date.now();

        try {
          const result = await withRetry(() => processRow(row));
          successfulCameras.add(row.camera_id);

          console.log(
            `[${WORKER_ID}] finalized upload=${row.id} batch=${row.ingest_batch_id} camera=${row.camera_id} action=${result.action} asset=${result.assetId} bytes=${result.bytes} sha=${result.fileHash.slice(
              0,
              12
            )} dt_ms=${Date.now() - t0}`
          );
        } catch (error) {
          const msg = safeMessage(error);

          console.warn(
            `[${WORKER_ID}] error upload=${row.id} batch=${row.ingest_batch_id}: ${msg}`
          );

          try {
            await withRetry(() => markRowFailed(row, msg));
            if (isTransientError(msg)) await sleep(5000);
          } catch (inner) {
            console.error(
              `[${WORKER_ID}] failed to mark upload=${row.id} failed: ${safeMessage(
                inner
              )}`
            );
          }
        }
      }
      for (const cameraId of successfulCameras) await updateCameraHealth(cameraId);
      for (const batchId of new Set(rows.map(row => row.ingest_batch_id))) await updateBatchSummary(batchId);
    } catch (error) {
      console.error(`[${WORKER_ID}] loop error`, safeMessage(error));
      await sleep(idlePollSeconds * 1000);
      idlePollSeconds = getNextIdlePollSeconds(idlePollSeconds);
    }
  }
}

main().catch((error) => {
  console.error(`[${WORKER_ID}] fatal`, error);
  process.exit(1);
});
