import fs from "fs";
import path from "path";
import crypto from "crypto";
import { inflateSync } from "node:zlib";
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
const PROCESSED_RETENTION_HOURS = Number(process.env.PROCESSED_RETENTION_HOURS || "48");
const INVALID_RETENTION_HOURS = Number(process.env.INVALID_RETENTION_HOURS || "168");
const ERROR_RETENTION_HOURS = Number(process.env.ERROR_RETENTION_HOURS || "336");
const ZEISS_SHARED_ALIAS = String(process.env.ZEISS_SHARED_ALIAS || "zeiss@cams.venaris.io")
  .toLowerCase()
  .trim();
const REMOTE_IMAGE_TIMEOUT_MS = Number(process.env.REMOTE_IMAGE_TIMEOUT_MS || "15000");
const REMOTE_IMAGE_MAX_BYTES = Number(process.env.REMOTE_IMAGE_MAX_BYTES || "10000000");

const MAILDIR = "/home/venaris/Maildir";
const NEW_DIR = path.join(MAILDIR, "new");
const PROCESSED_DIR = path.join(MAILDIR, "processed");
const INVALID_DIR = path.join(MAILDIR, "invalid");
const ERROR_DIR = path.join(MAILDIR, "error");

for (const d of [PROCESSED_DIR, INVALID_DIR, ERROR_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function buildIngestUrl() {
  if (!VERCEL_BYPASS_TOKEN) return INGEST_URL_RAW;
  const url = new URL(INGEST_URL_RAW);
  url.searchParams.set("x-vercel-protection-bypass", VERCEL_BYPASS_TOKEN);
  return url.toString();
}

function extractRecipient(headers) {
  const original = headers.get("x-original-to");
  if (original) return String(original).toLowerCase().trim();

  const to = headers.get("to");
  if (!to) return null;

  const match = String(to).match(/<([^>]+)>/);
  return (match?.[1] || String(to)).toLowerCase().trim();
}

function configColumns() {
  return [
    "camera_id",
    "method",
    "is_active",
    "provisioning_status",
    "smtp_alias",
    "ingest_token",
    "vendor",
    "external_key",
    "last_provisioning_error",
  ].join(", ");
}

async function lookupCameraByAlias(alias) {
  const { data, error } = await supabase
    .from("camera_ingest_configs")
    .select(configColumns())
    .eq("method", "smtp")
    .eq("is_active", true)
    .eq("provisioning_status", "ready")
    .eq("smtp_alias", alias)
    .limit(1)
    .maybeSingle();

  return error || !data ? null : data;
}

async function lookupCameraByExternalKey(vendor, externalKey) {
  const { data, error } = await supabase
    .from("camera_ingest_configs")
    .select(configColumns())
    .eq("method", "smtp")
    .eq("is_active", true)
    .eq("provisioning_status", "ready")
    .eq("vendor", vendor)
    .eq("external_key", externalKey)
    .limit(1)
    .maybeSingle();

  return error || !data ? null : data;
}

function isImage(mimetype, filename) {
  if (mimetype?.startsWith("image/")) return true;
  const lower = String(filename || "").toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) => lower.endsWith(ext));
}

function guessContentType(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function safeFilename(filename, fallback = `image-${Date.now()}.jpg`) {
  const base = path.basename(String(filename || "").replaceAll("\0", "").trim());
  return base || fallback;
}

function decodeRepeatedly(value, maxRounds = 3) {
  let current = String(value || "");
  for (let i = 0; i < maxRounds; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function phpSerializedString(payload, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`s:\\d+:"${escapedKey}";s:\\d+:"([^"]*)"`);
  return String(payload || "").match(regex)?.[1] ?? null;
}

function decodeZeissImageParam(encodedParam) {
  const decoded = decodeRepeatedly(encodedParam);
  const payload = inflateSync(Buffer.from(decoded, "base64")).toString("utf8");
  const imei = phpSerializedString(payload, "imei");

  if (!imei || !/^\d{15}$/.test(imei)) {
    throw new Error("invalid ZEISS image parameter: missing 15-digit IMEI");
  }

  return {
    imei,
    imageName: phpSerializedString(payload, "imagename"),
    deviceDate: phpSerializedString(payload, "date"),
  };
}

function extractZeissRemoteImage(html) {
  if (typeof html !== "string" || !html) return null;

  const matches = html.match(/https:\/\/media\.secacam\.com\/getImage\/param\/[^"'<>\s]+/gi);
  if (!matches?.length) return null;

  for (const raw of matches) {
    try {
      const url = new URL(raw.replaceAll("&amp;", "&"));
      if (url.protocol !== "https:") continue;
      if (url.hostname.toLowerCase() !== "media.secacam.com") continue;
      if (!url.pathname.startsWith("/getImage/param/")) continue;

      const encodedParam = url.pathname.slice("/getImage/param/".length);
      const decoded = decodeZeissImageParam(encodedParam);
      return { url: url.toString(), ...decoded };
    } catch {
      // Ignore unrelated or malformed URLs and continue with the next match.
    }
  }

  return null;
}

async function downloadRemoteImage(remoteUrl) {
  const url = new URL(remoteUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "media.secacam.com" ||
    !url.pathname.startsWith("/getImage/param/")
  ) {
    throw new Error("remote image URL is not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "image/*", "user-agent": "Venaris-Maildir-Bridge/1.0" },
    });

    if (!response.ok) throw new Error(`remote image download failed ${response.status}`);

    const contentType = String(response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw new Error(`remote response is not an image: ${contentType || "unknown"}`);
    }

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (declaredLength > REMOTE_IMAGE_MAX_BYTES) {
      throw new Error(`remote image too large: ${declaredLength} bytes`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("remote image is empty");
    if (buffer.length > REMOTE_IMAGE_MAX_BYTES) {
      throw new Error(`remote image too large: ${buffer.length} bytes`);
    }

    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendToIngest(file, filename, config, extraMetadata = {}) {
  if (!config.ingest_token) throw new Error("missing ingest_token on ready smtp config");

  const makeForm = () => {
    const form = new FormData();
    form.append("file", new Blob([file], { type: guessContentType(filename) }), filename);
    form.append(
      "metadata",
      JSON.stringify({
        ...extraMetadata,
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

  const headers = { "x-ingest-token": config.ingest_token };
  if (VERCEL_BYPASS_TOKEN) headers["x-vercel-protection-bypass"] = VERCEL_BYPASS_TOKEN;

  const doPost = (url) =>
    fetch(url, { method: "POST", headers, body: makeForm(), redirect: "manual" });

  const ingestUrl = buildIngestUrl();
  let response = await doPost(ingestUrl);

  if (response.status === 307 || response.status === 308) {
    const location = response.headers.get("location");
    if (!location) throw new Error(`Redirect ${response.status} without Location`);
    response = await doPost(new URL(location, ingestUrl).toString());
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ingest failed ${response.status}: ${body.slice(0, 600)}`);
  }

  return response.json().catch(() => ({}));
}

function moveTo(dir, filePath) {
  const target = path.join(dir, path.basename(filePath));
  fs.renameSync(filePath, target);
  return target;
}

function cleanupFolder(dir, maxAgeHours, label) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();

  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      if ((now - stat.mtimeMs) / 3_600_000 <= maxAgeHours) continue;
      fs.unlinkSync(full);
      console.log(`[cleanup:${label}] deleted ${full}`);
    } catch (error) {
      console.error(`[cleanup:${label}] ERROR deleting ${full}: ${error?.message ?? error}`);
    }
  }
}

function cleanupMaildir() {
  cleanupFolder(PROCESSED_DIR, PROCESSED_RETENTION_HOURS, "processed");
  cleanupFolder(INVALID_DIR, INVALID_RETENTION_HOURS, "invalid");
  cleanupFolder(ERROR_DIR, ERROR_RETENTION_HOURS, "error");
}

async function ingestAttachmentImages(recipient, images, config) {
  for (const image of images) {
    const buffer = image.content;
    const filename = safeFilename(image.filename);
    const result = await sendToIngest(buffer, filename, config, {
      mail_recipient: recipient,
      transport: "mime_attachment",
    });
    console.log(
      `[${recipient}] ok batchId=${result.batchId ?? "?"} accepted=${result.accepted ?? "?"} skippedDup=${result.skippedDuplicates ?? "?"} transport=attachment file=${filename} sha=${sha256(buffer).slice(0, 12)}`
    );
  }
}

async function ingestZeissRemoteImage(recipient, zeissImage) {
  const config = await lookupCameraByExternalKey("ZEISS", zeissImage.imei);
  if (!config) throw new Error(`no active ZEISS SMTP config for IMEI ${zeissImage.imei}`);

  const buffer = await downloadRemoteImage(zeissImage.url);
  const filename = safeFilename(zeissImage.imageName);
  const result = await sendToIngest(buffer, filename, config, {
    mail_recipient: recipient,
    transport: "html_remote_image",
    external_key: zeissImage.imei,
    zeiss_device_time: zeissImage.deviceDate,
    remote_image_host: "media.secacam.com",
  });

  console.log(
    `[${recipient}] ZEISS ok imei=${zeissImage.imei} camera=${config.camera_id} batchId=${result.batchId ?? "?"} accepted=${result.accepted ?? "?"} skippedDup=${result.skippedDuplicates ?? "?"} file=${filename} sha=${sha256(buffer).slice(0, 12)}`
  );
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

  const images = (parsed.attachments || []).filter((item) =>
    isImage(item.contentType, item.filename)
  );
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const zeissImage = extractZeissRemoteImage(html);

  try {
    if (recipient === ZEISS_SHARED_ALIAS) {
      if (!zeissImage) {
        console.log(`invalid ZEISS mail without supported image URL: ${recipient}`);
        moveTo(INVALID_DIR, filePath);
        return;
      }
      await ingestZeissRemoteImage(recipient, zeissImage);
      moveTo(PROCESSED_DIR, filePath);
      return;
    }

    const config = await lookupCameraByAlias(recipient);
    if (!config) {
      console.log(`unknown or not-ready smtp alias: ${recipient}`);
      moveTo(INVALID_DIR, filePath);
      return;
    }

    if (images.length > 0) {
      await ingestAttachmentImages(recipient, images, config);
      moveTo(PROCESSED_DIR, filePath);
      return;
    }

    // Backward-compatible remote-image fallback for an individually addressed
    // ZEISS camera email. Routing remains by the camera-specific SMTP alias.
    if (zeissImage) {
      const buffer = await downloadRemoteImage(zeissImage.url);
      const filename = safeFilename(zeissImage.imageName);
      const result = await sendToIngest(buffer, filename, config, {
        mail_recipient: recipient,
        transport: "html_remote_image",
        external_key: zeissImage.imei,
        zeiss_device_time: zeissImage.deviceDate,
        remote_image_host: "media.secacam.com",
      });
      console.log(
        `[${recipient}] ok batchId=${result.batchId ?? "?"} accepted=${result.accepted ?? "?"} skippedDup=${result.skippedDuplicates ?? "?"} transport=remote file=${filename} sha=${sha256(buffer).slice(0, 12)}`
      );
      moveTo(PROCESSED_DIR, filePath);
      return;
    }

    console.log(`invalid mail without supported image content: ${recipient}`);
    moveTo(INVALID_DIR, filePath);
  } catch (error) {
    console.error(`[${recipient}] ingest failed: ${error?.message ?? error}`);
    moveTo(ERROR_DIR, filePath);
  }
}

async function main() {
  let loopCount = 0;
  console.log(
    `Venaris Maildir Bridge started. poll=${POLL_SECONDS}s ingest=${buildIngestUrl()} zeissAlias=${ZEISS_SHARED_ALIAS}`
  );

  while (true) {
    try {
      for (const entry of fs.readdirSync(NEW_DIR).sort()) {
        const full = path.join(NEW_DIR, entry);
        try {
          await processMail(full);
        } catch (error) {
          console.error(`mail processing failed for ${entry}: ${error?.message ?? error}`);
          try {
            moveTo(ERROR_DIR, full);
          } catch {
            // ignore secondary move failures
          }
        }
      }

      loopCount += 1;
      if (loopCount % CLEANUP_EVERY_LOOPS === 0) cleanupMaildir();
    } catch (error) {
      console.error(`scan error: ${error?.message ?? error}`);
    }

    await sleep(POLL_SECONDS * 1000);
  }
}

main().catch((error) => {
  console.error("FATAL", error);
  process.exit(1);
});
