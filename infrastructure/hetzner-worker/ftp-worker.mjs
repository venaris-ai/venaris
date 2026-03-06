import fs from "fs";
import path from "path";
import crypto from "crypto";

function env(name, required = true) {
  const v = process.env[name];
  if (required && (!v || !String(v).trim())) throw new Error(`Missing env: ${name}`);
  return String(v || "");
}

const INGEST_URL_RAW = env("VENARIS_INGEST_URL");
const VERCEL_BYPASS_TOKEN = process.env.VERCEL_BYPASS_TOKEN
  ? String(process.env.VERCEL_BYPASS_TOKEN).trim()
  : "";

const POLL_SECONDS = Number(process.env.POLL_SECONDS || "5");
const ROOT = "/data/ftp-ingest";

// ftp-user -> ingest_token
const CAMERA_MAP = {
  xview01: env("CAMERA_TOKEN_XVIEW01"),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isImageFile(name) {
  const n = name.toLowerCase();
  return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png");
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

// Guard: file size must be stable (prevents ingesting partially uploaded files)
async function isStableFile(filePath, waitMs = 700) {
  const s1 = fs.statSync(filePath).size;
  await sleep(waitMs);
  const s2 = fs.statSync(filePath).size;
  return s1 === s2 && s2 > 0;
}

function buildIngestUrl() {
  if (!VERCEL_BYPASS_TOKEN) return INGEST_URL_RAW;

  const u = new URL(INGEST_URL_RAW);
  // Add bypass token as query param (works even without cookies)
  u.searchParams.set("x-vercel-protection-bypass", VERCEL_BYPASS_TOKEN);
  return u.toString();
}

async function ingestFile({ token, cameraUser, filePath }) {
  const filename = path.basename(filePath);
  const buf = fs.readFileSync(filePath);

  // Create a fresh FormData each request (important for redirects/retries)
  const makeForm = () => {
    const form = new FormData();
    const lower = filename.toLowerCase();
    const contentType = lower.endsWith(".png") ? "image/png" : "image/jpeg";

    form.append("file", new Blob([buf], { type: contentType }), filename);

    const metadata = {
      source: "ftp",
      ftp_user: cameraUser,
      filename,
    };
    form.append("metadata", JSON.stringify(metadata));
    return form;
  };

  const headers = {
    "x-ingest-token": token,
  };

  // Add bypass token as header as well (Vercel supports this for automation)
  if (VERCEL_BYPASS_TOKEN) {
    headers["x-vercel-protection-bypass"] = VERCEL_BYPASS_TOKEN;
  }

  const doPost = async (url) => {
    return fetch(url, {
      method: "POST",
      headers,
      body: makeForm(),
      redirect: "manual", // IMPORTANT: do not auto-follow 307/308 with multipart body
    });
  };

  const ingestUrl = buildIngestUrl();
  let resp = await doPost(ingestUrl);

  // Handle 307/308 redirect MANUALLY so the multipart body stays correct
  if (resp.status === 307 || resp.status === 308) {
    const loc = resp.headers.get("location");
    if (!loc) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Redirect ${resp.status} but no Location. Body: ${txt.slice(0, 300)}`);
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

async function scanCameraInbox(cameraUser, token) {
  const inbox = path.join(ROOT, cameraUser, "inbox");
  if (!fs.existsSync(inbox)) return;

  const entries = fs.readdirSync(inbox);
  const files = entries
    .filter(isImageFile)
    .map((f) => path.join(inbox, f))
    .sort(); // stable order

  for (const filePath of files) {
    try {
      // Skip unstable/actively uploading files
      if (!(await isStableFile(filePath))) continue;

      const filename = path.basename(filePath);
      const stat = fs.statSync(filePath);

      const hash = await sha256File(filePath);
      console.log(
        `[${cameraUser}] ingest ${filename} size=${stat.size} sha=${hash.slice(0, 12)}`
      );

      const res = await ingestFile({ token, cameraUser, filePath });

      console.log(
        `[${cameraUser}] ok batchId=${res.batchId ?? "?"} accepted=${res.accepted ?? "?"} skippedDup=${res.skippedDuplicates ?? "?"} source=${res.source ?? "?"}`
      );

      // Delete only after successful ingest
      fs.unlinkSync(filePath);
      console.log(`[${cameraUser}] deleted ${filename}`);
    } catch (e) {
      console.error(`[${cameraUser}] ERROR: ${e?.message ?? e}`);
      // keep file for retry on next loop
    }
  }
}

async function scanOnce() {
  for (const [cameraUser, token] of Object.entries(CAMERA_MAP)) {
    await scanCameraInbox(cameraUser, token);
  }
}

async function main() {
  const ingestUrlForLog = buildIngestUrl();
  console.log(
    `Venaris FTP Worker started. root=${ROOT} poll=${POLL_SECONDS}s ingest=${ingestUrlForLog}`
  );

  while (true) {
    await scanOnce();
    await sleep(POLL_SECONDS * 1000);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
