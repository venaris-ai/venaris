// scripts/ftp-bridge.mjs
import fs from "fs";
import path from "path";

// ---- tiny .env loader (no dependency) ----
function loadDotEnv(file = ".env.local") {
  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  const txt = fs.readFileSync(full, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? "";
    val = val.replace(/^['"]|['"]$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const INBOX = process.env.FTP_INBOX || "C:\\dev\\venaris_ftp_inbox";

// Prefer explicit INGEST_URL, else build from VENARIS_BASE_URL
const baseUrl = process.env.VENARIS_BASE_URL || "http://localhost:3000";
const API_URL = process.env.INGEST_URL || `${baseUrl.replace(/\/$/, "")}/api/ingest`;

// Token: prefer INGEST_TOKEN, fallback to REOLINK_INGEST_TOKEN
const TOKEN = process.env.INGEST_TOKEN || process.env.REOLINK_INGEST_TOKEN;

if (!TOKEN) {
  console.error("Missing INGEST_TOKEN (or REOLINK_INGEST_TOKEN) env var. Check .env.local is present in repo root.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tryParseCapturedAt(filename) {
  // tolerant: YYYYMMDD_HHMMSS or YYYYMMDDHHMMSS
  const m = filename.match(/(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [_, y, mo, d, h, mi, s] = m;
  // keep Z so it is clearly UTC
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

async function postFile(fullPath) {
  const filename = path.basename(fullPath);
  const buf = fs.readFileSync(fullPath);

  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "application/octet-stream" }), filename);

  const capturedAt = tryParseCapturedAt(filename);
  if (capturedAt) fd.append("capturedAt", capturedAt);

  fd.append(
    "metadata",
    JSON.stringify({
      source: "ftp",
      vendor: "reolink",
      original_filename: filename,
      received_time: new Date().toISOString(),
    })
  );

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "x-ingest-token": TOKEN },
    body: fd,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Ingest failed ${res.status}: ${text}`);

  console.log(`[ftp-bridge] Ingest OK file="${filename}" capturedAt=${capturedAt ?? "null"} :: ${text}`);
}

async function main() {
  console.log(
    `[ftp-bridge] watching inbox="${INBOX}" api="${API_URL}" tokenPresent=${TOKEN ? "true" : "false"}`
  );

  const processed = new Set();

  while (true) {
    let files = [];
    try {
      files = fs
        .readdirSync(INBOX)
        .filter((f) => /\.(jpe?g|png)$/i.test(f))
        .map((f) => path.join(INBOX, f));
    } catch (e) {
      console.error(`[ftp-bridge] cannot read inbox "${INBOX}":`, e?.message || e);
      await sleep(2000);
      continue;
    }

    for (const f of files) {
      if (processed.has(f)) continue;

      // wait for file to finish writing
      await sleep(500);

      try {
        await postFile(f);
        processed.add(f);

        // remove after successful ingest
        fs.unlinkSync(f);
      } catch (e) {
        console.error("[ftp-bridge] Bridge error:", path.basename(f), e?.message || e);
      }
    }

    await sleep(1000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});