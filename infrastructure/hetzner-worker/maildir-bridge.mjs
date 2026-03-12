import fs from "fs";
import path from "path";
import crypto from "crypto";
import { simpleParser } from "mailparser";
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

const MAILDIR = "/home/venaris/Maildir";

const NEW_DIR = path.join(MAILDIR, "new");
const PROCESSED_DIR = path.join(MAILDIR, "processed");
const INVALID_DIR = path.join(MAILDIR, "invalid");
const ERROR_DIR = path.join(MAILDIR, "error");

for (const d of [PROCESSED_DIR, INVALID_DIR, ERROR_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function buildIngestUrl() {
  if (!VERCEL_BYPASS_TOKEN) return INGEST_URL_RAW;

  const u = new URL(INGEST_URL_RAW);
  u.searchParams.set("x-vercel-protection-bypass", VERCEL_BYPASS_TOKEN);
  return u.toString();
}

function extractRecipient(headers) {
  const original = headers.get("x-original-to");
  if (original) return original.toLowerCase().trim();

  const to = headers.get("to");
  if (!to) return null;

  const m = to.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase().trim();

  return String(to).toLowerCase().trim();
}

async function lookupCamera(alias) {
  const { data, error } = await supabase
    .from("camera_ingest_configs")
    .select(
      [
        "camera_id",
        "method",
        "is_active",
        "provisioning_status",
        "smtp_alias",
        "ingest_token",
        "vendor",
        "last_provisioning_error",
      ].join(", ")
    )
    .eq("method", "smtp")
    .eq("is_active", true)
    .eq("provisioning_status", "ready")
    .eq("smtp_alias", alias)
    .limit(1)
    .single();

  if (error || !data) return null;

  return data;
}

function isImage(mimetype, filename) {
  if (!mimetype && !filename) return false;

  if (mimetype && mimetype.startsWith("image/")) return true;
  if (!filename) return false;

  const n = String(filename).toLowerCase();
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

async function sendToIngest(file, filename, config) {
  if (!config.ingest_token) {
    throw new Error("missing ingest_token on ready smtp config");
  }

  const makeForm = () => {
    const form = new FormData();

    form.append(
      "file",
      new Blob([file], { type: guessContentType(filename) }),
      filename
    );

    form.append(
      "metadata",
      JSON.stringify({
        source: "smtp",
        vendor: config.vendor,
        camera_id: config.camera_id,
        smtp_alias: config.smtp_alias,
        original_filename: filename,
        size_bytes: file.length,
        sha256: sha256(file),
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
    const txt = await resp.text().catch(() => "");
    throw new Error(`ingest failed ${resp.status}: ${txt.slice(0, 600)}`);
  }

  return resp.json().catch(() => ({}));
}

function moveTo(dir, filePath) {
  const target = path.join(dir, path.basename(filePath));
  fs.renameSync(filePath, target);
  return target;
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

function cleanupMaildir() {
  cleanupFolder(PROCESSED_DIR, PROCESSED_RETENTION_HOURS, "processed");
  cleanupFolder(INVALID_DIR, INVALID_RETENTION_HOURS, "invalid");
  cleanupFolder(ERROR_DIR, ERROR_RETENTION_HOURS, "error");
}

async function processMail(filePath) {
  const raw = fs.readFileSync(filePath);
  const parsed = await simpleParser(raw);

  const recipient = extractRecipient(parsed.headers);

  if (!recipient) {
    console.log("invalid mail: no recipient found");
    moveTo(INVALID_DIR, filePath);
    return;
  }

  console.log(`mail for ${recipient}`);

  const config = await lookupCamera(recipient);

  if (!config) {
    console.log(`unknown or not-ready smtp alias: ${recipient}`);
    moveTo(INVALID_DIR, filePath);
    return;
  }

  if (!config.ingest_token) {
    console.log(`invalid smtp config without ingest_token: ${recipient}`);
    moveTo(ERROR_DIR, filePath);
    return;
  }

  const attachments = parsed.attachments || [];
  if (!attachments.length) {
    console.log(`invalid mail without attachments: ${recipient}`);
    moveTo(INVALID_DIR, filePath);
    return;
  }

  const images = attachments.filter((a) => isImage(a.contentType, a.filename));
  if (!images.length) {
    console.log(`invalid mail without image attachments: ${recipient}`);
    moveTo(INVALID_DIR, filePath);
    return;
  }

  try {
    for (const img of images) {
      const buf = img.content;
      const filename = img.filename || `image-${Date.now()}.jpg`;

      const res = await sendToIngest(buf, filename, config);

      console.log(
        `[${recipient}] ok batchId=${res.batchId ?? "?"} accepted=${res.accepted ?? "?"} skippedDup=${res.skippedDuplicates ?? "?"} source=${res.source ?? "?"} file=${filename} sha=${sha256(buf).slice(0, 12)}`
      );
    }

    moveTo(PROCESSED_DIR, filePath);
  } catch (err) {
    console.error(`[${recipient}] ingest failed: ${err?.message ?? err}`);
    moveTo(ERROR_DIR, filePath);
  }
}

async function main() {
  const ingestUrlForLog = buildIngestUrl();
  let loopCount = 0;

  console.log(
    `Venaris Maildir Bridge started. poll=${POLL_SECONDS}s ingest=${ingestUrlForLog}`
  );

  while (true) {
    try {
      const files = fs.readdirSync(NEW_DIR).sort();

      for (const f of files) {
        const full = path.join(NEW_DIR, f);

        try {
          await processMail(full);
        } catch (err) {
          console.error(`mail processing failed for ${f}: ${err?.message ?? err}`);

          try {
            moveTo(ERROR_DIR, full);
          } catch {
            // ignore
          }
        }
      }

      loopCount += 1;
      if (loopCount % CLEANUP_EVERY_LOOPS === 0) {
        cleanupMaildir();
      }
    } catch (err) {
      console.error(`scan error: ${err?.message ?? err}`);
    }

    await sleep(POLL_SECONDS * 1000);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});