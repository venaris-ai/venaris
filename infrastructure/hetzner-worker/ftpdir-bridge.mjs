import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function env(name, required = true) {
  const v = process.env[name];
  if (required && (!v || !String(v).trim())) {
    throw new Error(`Missing env: ${name}`);
  }
  return String(v || "").trim();
}

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const INGEST_URL_RAW = env("VENARIS_INGEST_URL");

const VERCEL_BYPASS_TOKEN = process.env.VERCEL_BYPASS_TOKEN
  ? String(process.env.VERCEL_BYPASS_TOKEN).trim()
  : "";

const POLL_SECONDS = Number(process.env.POLL_SECONDS || "60");
const CLEANUP_EVERY_LOOPS = Number(process.env.CLEANUP_EVERY_LOOPS || "10");

const PROCESSED_RETENTION_HOURS = Number(
  process.env.PROCESSED_RETENTION_HOURS || "48"
);
const INVALID_RETENTION_HOURS = Number(
  process.env.INVALID_RETENTION_HOURS || "168"
);
const ERROR_RETENTION_HOURS = Number(
  process.env.ERROR_RETENTION_HOURS || "336"
);

const ROOT = "/data/ftp-ingest";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnedStates = new Set();

function warnOnce(key, message) {
  if (warnedStates.has(key)) return;
  warnedStates.add(key);
  console.log(message);
}

function clearWarn(key) {
  warnedStates.delete(key);
}

function isImageFile(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png") ||
    n.endsWith(".webp") ||
    n.endsWith(".gif")
  );
}

function guessContentType(filename) {
  const n = String(filename || "").toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);

  await new Promise((resolve, reject) => {
    stream.on("data", (d) => hash.update(d));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function isStableFile(filePath, waitMs = 700) {
  const s1 = fs.statSync(filePath).size;
  await sleep(waitMs);
  const s2 = fs.statSync(filePath).size;
  return s1 === s2 && s2 > 0;
}

function buildIngestUrl() {
  if (!VERCEL_BYPASS_TOKEN) return INGEST_URL_RAW;

  const u = new URL(INGEST_URL_RAW);
  u.searchParams.set("x-vercel-protection-bypass", VERCEL_BYPASS_TOKEN);
  return u.toString();
}

async function loadReadyFtpConfigs() {
  const { data, error } = await supabase
    .from("camera_ingest_configs")
    .select(
      [
        "camera_id",
        "method",
        "is_active",
        "provisioning_status",
        "ftp_host",
        "ftp_port",
        "ftp_username",
        "ftp_inbox_path",
        "ingest_token",
        "vendor",
        "last_provisioning_error",
      ].join(", ")
    )
    .eq("method", "ftp")
    .eq("is_active", true)
    .eq("provisioning_status", "ready")
    .not("ftp_username", "is", null)
    .not("ftp_inbox_path", "is", null);

  if (error) {
    throw new Error(`Failed to load ready ftp configs: ${error.message}`);
  }

  return data || [];
}

async function ingestFile({ config, filePath, sha256 }) {
  const filename = path.basename(filePath);
  const buf = fs.readFileSync(filePath);

  const makeForm = () => {
    const form = new FormData();

    form.append(
      "file",
      new Blob([buf], { type: guessContentType(filename) }),
      filename
    );

    form.append(
      "metadata",
      JSON.stringify({
        source: "ftp",
        vendor: config.vendor,
        camera_id: config.camera_id,
        ftp_username: config.ftp_username,
        ftp_host: config.ftp_host,
        ftp_port: config.ftp_port,
        filename,
        size_bytes: buf.length,
        sha256,
        received_time: new Date().toISOString(),
      })
    );

    return form;
  };

  const headers = {
    "x-ingest-token": config.ingest_token,
  };

  if (VERCEL_BYPASS_TOKEN) {
    headers["x-vercel-protection-bypass"] = VERCEL_BYPASS_TOKEN;
  }

  const doPost = async (url) => {
    return fetch(url, {
      method: "POST",
      headers,
      body: makeForm(),
      redirect: "manual",
    });
  };

  const ingestUrl = buildIngestUrl();
  let resp = await doPost(ingestUrl);

  if (resp.status === 307 || resp.status === 308) {
    const loc = resp.headers.get("location");
    if (!loc) {
      const txt = await resp.text().catch(() => "");
      throw new Error(
        `Redirect ${resp.status} but no Location. Body: ${txt.slice(0, 300)}`
      );
    }

    const redirectedUrl = new URL(loc, ingestUrl).toString();
    resp = await doPost(redirectedUrl);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Ingest failed ${resp.status}: ${text.slice(0, 600)}`);
  }

  return resp.json().catch(() => ({}));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getSiblingDir(inbox, folderName) {
  return path.join(path.dirname(inbox), folderName);
}

function moveFile(filePath, targetDir) {
  ensureDir(targetDir);
  const targetPath = path.join(targetDir, path.basename(filePath));
  fs.renameSync(filePath, targetPath);
  return targetPath;
}

function cleanupFolder(dir, maxAgeHours, label) {
  if (!fs.existsSync(dir)) return;

  const now = Date.now();
  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    const full = path.join(dir, entry);

    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;

      const ageHours = (now - stat.mtimeMs) / 1000 / 3600;
      if (ageHours <= maxAgeHours) continue;

      fs.unlinkSync(full);
      console.log(`[cleanup:${label}] deleted ${full}`);
    } catch (e) {
      console.error(
        `[cleanup:${label}] ERROR deleting ${full}: ${e?.message ?? e}`
      );
    }
  }
}

function cleanupFtpDirs(configs) {
  for (const config of configs) {
    const inbox = config.ftp_inbox_path;
    const label = config.ftp_username || config.camera_id || "unknown";

    if (!inbox) continue;
    if (!fs.existsSync(path.dirname(inbox))) continue;

    cleanupFolder(
      getSiblingDir(inbox, "processed"),
      PROCESSED_RETENTION_HOURS,
      `${label}:processed`
    );
    cleanupFolder(
      getSiblingDir(inbox, "invalid"),
      INVALID_RETENTION_HOURS,
      `${label}:invalid`
    );
    cleanupFolder(
      getSiblingDir(inbox, "error"),
      ERROR_RETENTION_HOURS,
      `${label}:error`
    );
  }
}

async function scanFtpInbox(config) {
  const label = config.ftp_username || config.camera_id || "unknown-ftp-camera";
  const inbox = config.ftp_inbox_path;

  if (!config.ingest_token) {
    warnOnce(
      `missing-token:${label}`,
      `[${label}] skip: missing ingest_token on ready ftp config`
    );
    return;
  }
  clearWarn(`missing-token:${label}`);

  if (!inbox) {
    warnOnce(
      `missing-inbox:${label}`,
      `[${label}] skip: missing ftp_inbox_path on ready ftp config`
    );
    return;
  }
  clearWarn(`missing-inbox:${label}`);

  if (!fs.existsSync(inbox)) {
    warnOnce(
      `missing-dir:${inbox}`,
      `[${label}] skip: ready ftp inbox does not exist: ${inbox}`
    );
    return;
  }
  clearWarn(`missing-dir:${inbox}`);

  const processedDir = getSiblingDir(inbox, "processed");
  const invalidDir = getSiblingDir(inbox, "invalid");
  const errorDir = getSiblingDir(inbox, "error");

  ensureDir(processedDir);
  ensureDir(invalidDir);
  ensureDir(errorDir);

  const entries = fs.readdirSync(inbox);
  const files = entries
    .filter((f) => {
      if (!isImageFile(f)) {
        const full = path.join(inbox, f);
        try {
          if (fs.statSync(full).isFile()) {
            moveFile(full, invalidDir);
            console.log(`[${label}] invalid moved non-image file ${f}`);
          }
        } catch (e) {
          console.error(`[${label}] ERROR inspecting non-image ${f}: ${e?.message ?? e}`);
        }
        return false;
      }
      return true;
    })
    .map((f) => path.join(inbox, f))
    .sort();

  if (files.length === 0) return;

  for (const filePath of files) {
    try {
      if (!(await isStableFile(filePath))) continue;

      const filename = path.basename(filePath);
      const stat = fs.statSync(filePath);
      const sha = await sha256File(filePath);

      console.log(
        `[${label}] ingest ${filename} size=${stat.size} sha=${sha.slice(0, 12)}`
      );

      const res = await ingestFile({ config, filePath, sha256: sha });

      console.log(
        `[${label}] ok batchId=${res.batchId ?? "?"} accepted=${res.accepted ?? "?"} skippedDup=${res.skippedDuplicates ?? "?"} source=${res.source ?? "?"}`
      );

      moveFile(filePath, processedDir);
      console.log(`[${label}] moved to processed ${filename}`);
    } catch (e) {
      const filename = path.basename(filePath);
      console.error(`[${label}] ERROR: ${e?.message ?? e}`);
      try {
        moveFile(filePath, errorDir);
        console.log(`[${label}] moved to error ${filename}`);
      } catch (moveErr) {
        console.error(
          `[${label}] ERROR moving to error ${filename}: ${moveErr?.message ?? moveErr}`
        );
      }
    }
  }
}

async function scanOnce() {
  const configs = await loadReadyFtpConfigs();

  for (const config of configs) {
    await scanFtpInbox(config);
  }

  return configs;
}

async function main() {
  const ingestUrlForLog = buildIngestUrl();
  let loopCount = 0;

  console.log(
    `Venaris FTPDIR Bridge started. poll=${POLL_SECONDS}s ingest=${ingestUrlForLog}`
  );

  while (true) {
    try {
      const configs = await scanOnce();

      loopCount += 1;
      if (loopCount % CLEANUP_EVERY_LOOPS === 0) {
        cleanupFtpDirs(configs);
      }
    } catch (e) {
      console.error(`scan error: ${e?.message ?? e}`);
    }

    await sleep(POLL_SECONDS * 1000);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});