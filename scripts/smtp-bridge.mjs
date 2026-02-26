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

// ---- tiny .env loader ----
function loadDotEnv(file = ".env.local") {
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
}
loadDotEnv();

const cfg = {
  imapHost: process.env.IMAP_HOST,
  imapPort: Number(process.env.IMAP_PORT || 993),
  imapSecure: String(process.env.IMAP_SECURE || "true") === "true",
  imapUser: process.env.IMAP_USER,
  imapPass: process.env.IMAP_PASS,

  mailbox: process.env.IMAP_MAILBOX || "INBOX",
  pollSeconds: Number(process.env.IMAP_POLL_SECONDS || 15),
  markSeen: String(process.env.IMAP_MARK_SEEN || "true") === "true",
  processAll: String(process.env.IMAP_PROCESS_ALL || "false") === "true",

  baseUrl: process.env.VENARIS_BASE_URL || "http://127.0.0.1:3000",
  cameraId: process.env.XVIEW_CAMERA_ID,
  ingestToken: process.env.XVIEW_INGEST_TOKEN,
};

function must(v, name) {
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
}
must(cfg.imapHost, "IMAP_HOST");
must(cfg.imapUser, "IMAP_USER");
must(cfg.imapPass, "IMAP_PASS");
must(cfg.cameraId, "XVIEW_CAMERA_ID");
must(cfg.ingestToken, "XVIEW_INGEST_TOKEN");

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
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
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

async function postToIngest({ fileBuffer, filename, meta, capturedAt }) {
  const url = `${cfg.baseUrl}/api/ingest`;

  const form = new FormData();
  form.append("cameraId", cfg.cameraId);
  if (capturedAt) form.append("capturedAt", capturedAt);
  form.append("metadata", JSON.stringify(meta));

  const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
  form.append("files", blob, filename || "image.jpg");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-ingest-token": cfg.ingestToken },
      body: form,
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Ingest failed ${res.status}: ${text}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

function pickImageAttachments(parsed) {
  const out = [];
  const list = parsed.attachments || [];
  for (const a of list) {
    const ct = (a.contentType || "").toLowerCase();
    const fn = a.filename || "";
    if (ct.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(fn)) out.push(a);
  }
  return out;
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
          try { await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }); } catch {}
        }
        continue;
      }

      try {
        // fetchOne is more reliable than streaming fetch/download on some IMAP servers
        const msg = await withTimeout(
          client.fetchOne(uid, { source: true, envelope: true }, { uid: true }),
          20000,
          "IMAP fetchOne"
        );

        if (!msg || !msg.source) {
          throw new Error("IMAP fetchOne returned empty source");
        }

        const parsed = await simpleParser(msg.source);

        const mailDate = parsed.date || msg.envelope?.date || null;
        const from = parsed.from?.text || "";
        const subject = parsed.subject || "";
        const receivedAt = new Date().toISOString();

        const attachments = pickImageAttachments(parsed);

        if (!attachments.length) {
          console.log(`[smtp-bridge] uid=${uid} no image attachments subject="${subject}"`);
          rememberProcessed(state, cfg.mailbox, uid);
          saveState(state);
          if (!cfg.processAll && cfg.markSeen) {
            try { await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }); } catch {}
          }
          continue;
        }

        console.log(`[smtp-bridge] uid=${uid} attachments=${attachments.length} subject="${subject}"`);

        for (const a of attachments) {
          const buf = a.content;
          if (!buf) throw new Error("Attachment content is empty");

          const capturedAt = parseCapturedAt({ attachmentName: a.filename, mailDate });

          const meta = {
            source: "smtp",
            vendor: "x-view",
            mail_from: from || null,
            mail_subject: subject || null,
            mail_date: mailDate ? new Date(mailDate).toISOString() : null,
            received_time: receivedAt,
            original_filename: a.filename || null,
            content_type: a.contentType || null,
            size_bytes: buf?.length || null,
            sha256: sha256(buf),
          };

          const resp = await postToIngest({
            fileBuffer: buf,
            filename: a.filename || "xview.jpg",
            meta,
            capturedAt,
          });

          console.log(
            `[smtp-bridge] ingest OK uid=${uid} file="${a.filename}" capturedAt=${capturedAt ?? "null"} :: ${resp}`
          );
        }

        rememberProcessed(state, cfg.mailbox, uid);
        saveState(state);

        if (!cfg.processAll && cfg.markSeen) {
          try { await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }); } catch {}
        }
      } catch (uidErr) {
        console.error(`[smtp-bridge] uid=${uid} processing error:`, uidErr?.message || uidErr);
        // retry next tick
      }
    }
  } catch (e) {
    console.error("[smtp-bridge] cycle error:", e?.message || e);
  } finally {
    try { if (lock) lock.release(); } catch {}

    try {
      await Promise.race([
        client.logout(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("IMAP logout timeout")), 5000)),
      ]);
    } catch (e) {
      try { client.close(); } catch {}
      console.error("[smtp-bridge] logout/close issue:", e?.message || e);
    }
  }
}

async function main() {
  console.log(
    `[smtp-bridge] start poll=${cfg.pollSeconds}s baseUrl=${cfg.baseUrl} mailbox=${cfg.mailbox} processAll=${cfg.processAll}`
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