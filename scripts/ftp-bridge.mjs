import fs from "fs";
import path from "path";

const INBOX = process.env.FTP_INBOX || "C:\\dev\\venaris_ftp_inbox";
const API_URL = process.env.INGEST_URL || "http://localhost:3000/api/ingest";
const TOKEN = process.env.INGEST_TOKEN;

if (!TOKEN) {
  console.error("Missing INGEST_TOKEN env var");
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
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

async function postFile(fullPath) {
  const filename = path.basename(fullPath);
  const buf = fs.readFileSync(fullPath);

  const fd = new FormData();
  fd.append("file", new Blob([buf]), filename);

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
  console.log("Ingest OK:", filename, text);
}

async function main() {
  console.log("FTP Bridge watching:", INBOX);
  const processed = new Set();

  while (true) {
    const files = fs
      .readdirSync(INBOX)
      .filter((f) => /\.(jpe?g|png)$/i.test(f))
      .map((f) => path.join(INBOX, f));

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
        console.error("Bridge error:", path.basename(f), e.message);
      }
    }

    await sleep(1000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});