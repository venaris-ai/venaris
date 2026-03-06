// scripts/smtp-bridge.mjs
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

/**
 * Diagnostics: show when/why the process exits.
 * If the process is killed hard (native crash), you may still not see these.
 */
process.on("beforeExit", (code) => {
  console.error(`[smtp-bridge] beforeExit code=${code} (event loop empty)`);
});
process.on("exit", (code) => {
  console.error(`[smtp-bridge] exit code=${code}`);
});
process.on("unhandledRejection", (reason) => {
  console.error("[smtp-bridge] UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[smtp-bridge] UNCAUGHT EXCEPTION:", err);
  // do not exit; keep running
});

// ---- tiny .env loader (dev convenience; production should use systemd EnvironmentFile) ----
function loadDotEnv(file = ".env.local") {
  try {
    if (!fs.existsSync(file)) return;
    const txt = fs.readFileSync(file, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2] ?? "";
      val = val.replace(/^['"]|['"]$/g, "");
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    console.error("[smtp-bridge] dotenv load error:", e?.message ?? e);
  }
}
loadDotEnv();

function must(v, name) {
  if (!v || !String(v).trim()) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
}

function asBool(v, def = false) {
  if (v === undefined || v === null || String(v).trim() === "") return def;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function asNum(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const cfg = {
  imapHost: process.env.IMAP_HOST,
  imapPort: asNum(process.env.IMAP_PORT, 993),
  imapSecure: asBool(process.env.IMAP_SECURE, true),
  imapUser: process.env.IMAP_USER,
  imapPass: process.env.IMAP_PASS,

  mailbox: process.env.IMAP_MAILBOX || "INBOX",
  pollSeconds: asNum(process.env.IMAP_POLL_SECONDS, 15),
  markSeen: asBool(process.env.IMAP_MARK_SEEN, true),
  processAll: asBool(process.env.IMAP_PROCESS_ALL, false),

  // Base URL ONLY (no /api/ingest)
  baseUrl: process.env.VENARIS_BASE_URL || "http://127.0.0.1:3000",

  // Vercel protection bypass (optional, but needed in prod when protection is active)
  vercelBypassToken: process.env.VERCEL_BYPASS_TOKEN
    ? String(process.env.VERCEL_BYPASS_TOKEN).trim()
    : "",

  // Backward compatible naming
  cameraId: process.env.SMTP_CAMERA_ID || process.env.XVIEW_CAMERA_ID,
  ingestToken: process.env.SMTP_INGEST_TOKEN || process.env.XVIEW_INGEST_TOKEN,
  vendor: process.env.SMTP_VENDOR || "unknown",
};

must(cfg.imapHost, "IMAP_HOST");
must(cfg.imapUser, "IMAP_USER");
must(cfg.imapPass, "IMAP_PASS");
must(cfg.ingestToken, "SMTP_INGEST_TOKEN (or XVIEW_INGEST_TOKEN)");
// cameraId is not required for unified ingest (token identifies camera), but keep it optional:
if (!cfg.cameraId) {
  console.warn("[smtp-bridge] WARNING: SMTP_CAMERA_ID not set (ok for unified ingest)");
}

// --- state (UID dedupe) ---
const STATE_FILE = path.join(process.cwd(), ".smtp-bridge-state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { processedUidsByMailbox: {} };
  }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}
function isProcessed(state, mailbox, uid) {
  const list = state.processedUidsByMailbox[mailbox] || [];
  return list.includes(uid);
}
function rememberProcessed(state, mailbox, uid) {
  if (!state.processedUidsByMailbox[mailbox]) state.processedUidsByMailbox[mailbox] = [];
  const list = state.processedUidsByMailbox[mailbox];
  list.push(uid);
  if (list.length > 2000) state.processedUidsByMailbox[mailbox] = list.slice(-2000);
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// derive capturedAt from filename, else email date
function parseCapturedAt({ attachmentName, mailDate }) {
  const name = attachmentName || "";

  // 20260225_153045 or 20260225-153045
  let m = name.match(/(\d{8})[_-](\d{6})/);
  if (m) {
    const d = m[1];
    const t = m[2];
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(
      2,
      4
    )}:${t.slice(4, 6)}`;
  }

  // 2026-02-25 15.30.45
  m = name.match(/(\d{4}-\d{2}-\d{2})[ _-](\d{2})[.:](\d{2})[.:](\d{2})/);
  if (m) return `${m[1]}T${m[2]}:${m[3]}:${m[4]}`;

  if (mailDate) {
    const d = new Date(mailDate);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19);
  }
  return null;
}

async function withTimeout(promise, ms, label) {
  return await Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ]);
}

function normalizeBaseUrl(u) {
  return String(u || "").trim().replace(/\/+$/, "");
}

function buildIngestUrl() {
  const base = normalizeBaseUrl(cfg.baseUrl);
  must(base, "VENARIS_BASE_URL");

  const u = new URL(`${base}/api/ingest`);
  if (cfg.vercelBypassToken) {
    // same as ftp-worker
    u.searchParams.set("x-vercel-protection-bypass", cfg.vercelBypassToken);
  }
  return u.toString();
}

function guessContentType(filename, fallback = "application/octet-stream") {
  const n = String(filename || "").toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return fallback;
}

async function postToIngest({ fileBuffer, filename, meta }) {
  const ingestUrl = buildIngestUrl();

  const headers = {
    "x-ingest-token": cfg.ingestToken,
  };
  // Add bypass token as header as well (Vercel supports this for automation)
  if (cfg.vercelBypassToken) {
    headers["x-vercel-protection-bypass"] = cfg.vercelBypassToken;
  }

  const makeForm = () => {
    const form = new FormData();
    const contentType = guessContentType(filename);

    // unified contract: field name MUST be "file"
    form.append("file", new Blob([fileBuffer], { type: contentType }), filename || "image.jpg");

    // unified contract: metadata MUST be JSON string
    form.append("metadata", JSON.stringify(meta));

    return form;
  };

  const doPost = async (url) => {
    // IMPORTANT: fresh FormData per request, otherwise redirect retry can lose body
    return fetch(url, {
      method: "POST",
      headers,
      body: makeForm(),
      redirect: "manual", // IMPORTANT: do not auto-follow 307/308 with multipart body
      signal: AbortSignal.timeout(20_000),
    });
  };

  let resp = await doPost(ingestUrl);

  // Handle 307/308 redirect MANUALLY so the multipart body stays correct (same as ftp-worker)
  if (resp.status === 307 || resp.status === 308) {
    const loc = resp.headers.get("location");
    if (!loc) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Redirect ${resp.status} but no Location. Body: ${txt.slice(0, 300)}`);
    }
    const redirectedUrl = new URL(loc, ingestUrl).toString();
    resp = await doPost(redirectedUrl);
  }

  const text = await resp.text().catch(() => "");
  if (!resp.ok) throw new Error(`Ingest failed ${resp.status}: ${text.slice(0, 800)}`);

  // Try parse json response, fallback to raw text
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function pickImageAttachments(parsed) {
  const out = [];
  const list = parsed.attachments || [];

  for (const a of list) {
    const ct = String(a.contentType || "").toLowerCase();
    const fn = String(a.filename || "");
    const disp = String(a.contentDisposition || "").toLowerCase();

    const hasImageExt = /\.(jpg|jpeg|png|gif|webp)$/i.test(fn);
    const looksLikeImage =
      ct.startsWith("image/") ||
      hasImageExt ||
      // some senders label images as octet-stream but keep a .jpg filename
      (ct === "application/octet-stream" && hasImageExt) ||
      // inline images sometimes have disposition=inline + cid but still are the image
      (disp === "inline" && (ct.startsWith("image/") || hasImageExt));

    if (looksLikeImage) out.push(a);
  }

  return out;
}

/**
 * Some cameras (e.g., Reolink) embed the image inline in HTML (data:image/...;base64,...)
 * instead of sending it as a classic attachment.
 */
function pickInlineBase64Image(parsed) {
  const html = parsed?.html || parsed?.textAsHtml || "";
  if (!html || typeof html !== "string") return null;

  // Match: data:image/jpeg;base64,AAAA...
  const m = html.match(/data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)/i);
  if (!m) return null;

  const ext = (m[1] || "jpg").toLowerCase().replace("jpeg", "jpg");
  const b64 = m[2];

  try {
    const buf = Buffer.from(b64, "base64");
    if (!buf?.length) return null;

    return {
      filename: `inline-${Date.now()}.${ext}`,
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      content: buf,
    };
  } catch {
    return null;
  }
}

async function processMailsOnce() {
  const state = loadState();

  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapSecure,
    auth: { user: cfg.imapUser, pass: cfg.imapPass },
    logger: false,

    // hardening for flaky servers
    socketTimeout: 120000,
    disableAutoIdle: true,
  });

  client.on("error", (err) => {
    console.error("[smtp-bridge] IMAP error event:", err?.message || err);
  });

  let lock = null;

  try {
    await withTimeout(client.connect(), 20000, "IMAP connect");
    lock = await withTimeout(client.getMailboxLock(cfg.mailbox), 20000, "IMAP mailbox lock");

    const searchQuery = cfg.processAll ? { all: true } : { seen: false };
    const uids = await withTimeout(client.search(searchQuery), 20000, "IMAP search");

    if (!uids.length) {
      console.log(`[smtp-bridge] no ${cfg.processAll ? "mails" : "unseen mails"}`);
      return;
    }

    uids.sort((a, b) => a - b);
    console.log(`[smtp-bridge] ${cfg.processAll ? "mails" : "unseen mails"}: ${uids.length}`);

    for (const uid of uids) {
      if (isProcessed(state, cfg.mailbox, uid)) {
        if (!cfg.processAll && cfg.markSeen) {
          try {
            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          } catch {}
        }
        continue;
      }

      try {
        const msg = await withTimeout(
          client.fetchOne(uid, { source: true, envelope: true }, { uid: true }),
          20000,
          "IMAP fetchOne"
        );

        if (!msg || !msg.source) throw new Error("IMAP fetchOne returned empty source");

        const parsed = await simpleParser(msg.source);

        const mailDate = parsed.date || msg.envelope?.date || null;
        const from = parsed.from?.text || "";
        const subject = parsed.subject || "";
        const receivedAt = new Date().toISOString();

        let attachments = pickImageAttachments(parsed);

        if (!attachments.length) {
          const all = parsed.attachments || [];
          console.log(
            `[smtp-bridge] uid=${uid} attachment-scan: total=${all.length} :: ` +
              all
                .map(
                  (a) =>
                    `${a.filename || "NO_NAME"}|${a.contentType || "NO_CT"}|disp=${
                      a.contentDisposition || "?"
                    }|cid=${a.cid || a.contentId || "?"}|bytes=${a.size || a.content?.length || 0}`
                )
                .join(" ; ")
          );
        }

        if (!attachments.length) {
          const inline = pickInlineBase64Image(parsed);
          if (inline) {
            attachments = [inline];
            console.log(`[smtp-bridge] uid=${uid} found inline base64 image subject="${subject}"`);
          }
        }

        if (!attachments.length) {
          console.log(`[smtp-bridge] uid=${uid} no image attachments subject="${subject}"`);
          rememberProcessed(state, cfg.mailbox, uid);
          saveState(state);
          if (!cfg.processAll && cfg.markSeen) {
            try {
              await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
            } catch {}
          }
          continue;
        }

        console.log(`[smtp-bridge] uid=${uid} images=${attachments.length} subject="${subject}"`);

        for (const a of attachments) {
          const buf = a?.content; // Buffer
          if (!buf) throw new Error("Image content is empty");

          const filename = a.filename || "camera.jpg";
          const capturedAt = parseCapturedAt({ attachmentName: filename, mailDate });

          // Unified ingest metadata contract
          const meta = {
            source: "smtp",
            vendor: cfg.vendor,
            camera_id: cfg.cameraId || null, // optional
            captured_at: capturedAt || null,

            mail_from: from || null,
            mail_subject: subject || null,
            mail_date: mailDate ? new Date(mailDate).toISOString() : null,
            received_time: receivedAt,

            original_filename: filename || null,
            content_type: a.contentType || null,
            size_bytes: buf?.length || null,
            sha256: sha256(buf),
            // NOTE: uid is useful for debugging; dedup is handled server-side via SHA256 per camera
            imap_uid: uid,
            mailbox: cfg.mailbox,
          };

          const resp = await postToIngest({
            fileBuffer: buf,
            filename,
            meta,
          });

          console.log(
            `[smtp-bridge] ingest OK uid=${uid} file="${filename}" capturedAt=${
              capturedAt ?? "null"
            } batchId=${resp?.batchId ?? "?"} accepted=${resp?.accepted ?? "?"} skippedDup=${
              resp?.skippedDuplicates ?? "?"
            } source=${resp?.source ?? "?"}`
          );
        }

        rememberProcessed(state, cfg.mailbox, uid);
        saveState(state);

        if (!cfg.processAll && cfg.markSeen) {
          try {
            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          } catch {}
        }
      } catch (uidErr) {
        console.error(`[smtp-bridge] uid=${uid} processing error:`, uidErr?.message || uidErr);
        // keep UID unremembered -> retry next tick
      }
    }
  } catch (e) {
    console.error("[smtp-bridge] cycle error:", e?.message || e);
  } finally {
    try {
      if (lock) lock.release();
    } catch {}

    try {
      await Promise.race([
        client.logout(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("IMAP logout timeout")), 5000)),
      ]);
    } catch (e) {
      try {
        client.close();
      } catch {}
      console.error("[smtp-bridge] logout/close issue:", e?.message || e);
    }
  }
}

async function main() {
  const ingestUrlForLog = buildIngestUrl();

  console.log(
    `[smtp-bridge] start poll=${cfg.pollSeconds}s mailbox=${cfg.mailbox} processAll=${cfg.processAll} markSeen=${cfg.markSeen} vendor=${cfg.vendor} ingest=${ingestUrlForLog}`
  );

  // keep-alive so the event loop doesn't go empty
  setInterval(() => {}, 60_000);

  while (true) {
    try {
      console.log(`[smtp-bridge] tick ${new Date().toISOString()}`);
      await processMailsOnce();
    } catch (e) {
      console.error("[smtp-bridge] loop error:", e?.message || e);
    }
    await new Promise((r) => setTimeout(r, cfg.pollSeconds * 1000));
  }
}

main().catch((err) => {
  console.error("[smtp-bridge] fatal:", err);
  process.exit(1);
});