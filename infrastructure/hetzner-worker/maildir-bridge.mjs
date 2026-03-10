import fs from "fs";
import path from "path";
import crypto from "crypto";
import { simpleParser } from "mailparser";
import { createClient } from "@supabase/supabase-js";

const MAILDIR = "/home/venaris/Maildir";

const NEW_DIR = path.join(MAILDIR, "new");
const PROCESSED_DIR = path.join(MAILDIR, "processed");
const INVALID_DIR = path.join(MAILDIR, "invalid");
const ERROR_DIR = path.join(MAILDIR, "error");

for (const d of [PROCESSED_DIR, INVALID_DIR, ERROR_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function extractRecipient(headers) {
  const original = headers.get("x-original-to");
  if (original) return original.toLowerCase().trim();

  const to = headers.get("to");
  if (!to) return null;

  const m = to.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase();

  return to.toLowerCase();
}

async function lookupCamera(alias) {
  const { data, error } = await supabase
    .from("camera_ingest_configs")
    .select("*")
    .eq("smtp_alias", alias)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) return null;

  return data;
}

function isImage(mimetype, filename) {
  if (!mimetype && !filename) return false;

  if (mimetype && mimetype.startsWith("image/")) return true;

  if (!filename) return false;

  const n = filename.toLowerCase();

  return (
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png") ||
    n.endsWith(".webp") ||
    n.endsWith(".gif")
  );
}

function guessContentType(filename) {
  const n = filename.toLowerCase();

  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";

  return "application/octet-stream";
}

async function sendToIngest(file, filename, config) {

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
      original_filename: filename,
      size_bytes: file.length,
      sha256: sha256(file),
      received_time: new Date().toISOString()
    })
  );

  const resp = await fetch(process.env.VENARIS_INGEST_URL, {
    method: "POST",
    headers: {
      "x-ingest-token": config.ingest_token
    },
    body: form
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`ingest failed ${resp.status} ${txt}`);
  }
}

async function processMail(filePath) {

  const raw = fs.readFileSync(filePath);

  const parsed = await simpleParser(raw);

  const recipient = extractRecipient(parsed.headers);

  if (!recipient) {

    console.log("no recipient found");

    fs.renameSync(
      filePath,
      path.join(INVALID_DIR, path.basename(filePath))
    );

    return;
  }

  console.log("mail for", recipient);

  const config = await lookupCamera(recipient);

  if (!config) {

    console.log("unknown camera alias:", recipient);

    fs.renameSync(
      filePath,
      path.join(INVALID_DIR, path.basename(filePath))
    );

    return;
  }

  const attachments = parsed.attachments || [];

  if (!attachments.length) {

    console.log("no attachments");

    fs.renameSync(
      filePath,
      path.join(INVALID_DIR, path.basename(filePath))
    );

    return;
  }

  const images = attachments.filter(a =>
    isImage(a.contentType, a.filename)
  );

  if (!images.length) {

    console.log("no image attachments");

    fs.renameSync(
      filePath,
      path.join(INVALID_DIR, path.basename(filePath))
    );

    return;
  }

  try {

    for (const img of images) {

      const buf = img.content;

      const filename = img.filename || `image-${Date.now()}.jpg`;

      await sendToIngest(buf, filename, config);

      console.log("ingested", filename, sha256(buf));
    }

    fs.renameSync(
      filePath,
      path.join(PROCESSED_DIR, path.basename(filePath))
    );

  } catch (err) {

    console.error("ingest failed:", err.message);

    fs.renameSync(
      filePath,
      path.join(ERROR_DIR, path.basename(filePath))
    );
  }
}

async function main() {

  console.log("venaris maildir bridge started");

  while (true) {

    try {

      const files = fs.readdirSync(NEW_DIR);

      for (const f of files) {

        const full = path.join(NEW_DIR, f);

        try {

          await processMail(full);

        } catch (err) {

          console.error("mail processing failed", err);

        }
      }

    } catch (err) {

      console.error("scan error", err);

    }

    await new Promise(r => setTimeout(r, 5000));
  }
}

main();