import fs from "fs";
import path from "path";
import { simpleParser } from "mailparser";

const ZEISS_SHARED_ALIAS = String(
  process.env.ZEISS_SHARED_ALIAS || "zeiss@cams.venaris.io"
)
  .toLowerCase()
  .trim();

const MAILDIR = String(process.env.MAILDIR || "/home/venaris/Maildir").trim();
const SOURCE_DIR = path.join(MAILDIR, "invalid");
const PROCESSED_DIR = path.join(MAILDIR, "processed");
const ERROR_DIR = path.join(MAILDIR, "error");

const ZEISS_VERIFICATION_HOST = "blue.prod.secaapps.de";
const ZEISS_VERIFICATION_PATH_PREFIX =
  "/api/v1/notification-settings/emails/validate/";
const ZEISS_SUCCESS_PATH_PREFIX = "/page/success";
const ZEISS_ERROR_PATH_PREFIX = "/page/error";
const ZEISS_VERIFICATION_TIMEOUT_MS = Number(
  process.env.ZEISS_VERIFICATION_TIMEOUT_MS || "10000"
);
const ZEISS_VERIFICATION_MAX_REDIRECTS = Number(
  process.env.ZEISS_VERIFICATION_MAX_REDIRECTS || "5"
);
const ZEISS_VERIFICATION_MAX_AGE_MINUTES = Number(
  process.env.ZEISS_VERIFICATION_MAX_AGE_MINUTES || "70"
);

for (const dir of [SOURCE_DIR, PROCESSED_DIR, ERROR_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function extractEmailAddresses(value) {
  if (!value) return [];
  return (
    String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  ).map((address) => address.toLowerCase());
}

function extractParsedAddressObject(value) {
  if (!value || !Array.isArray(value.value)) return [];

  return value.value
    .map((entry) => String(entry?.address || "").toLowerCase().trim())
    .filter(Boolean);
}

function hasSharedRecipient(parsed) {
  const headerValues = [
    parsed.headers.get("x-original-to"),
    parsed.headers.get("delivered-to"),
    parsed.headers.get("x-envelope-to"),
    parsed.headers.get("to"),
  ];

  const recipients = [
    ...headerValues.flatMap((value) => extractEmailAddresses(value)),
    ...extractParsedAddressObject(parsed.to),
  ];

  return recipients.includes(ZEISS_SHARED_ALIAS);
}

function isZeissVerificationMail(parsed) {
  if (!hasSharedRecipient(parsed)) return false;

  const senders = [
    ...extractEmailAddresses(parsed.headers.get("from")),
    ...extractParsedAddressObject(parsed.from),
  ];
  if (!senders.includes("info@secacam.email")) return false;

  const subject = String(parsed.subject || "").trim().toLowerCase();
  return subject === "email verification";
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&#38;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"');
}

function decodeRepeatedly(value, maxRounds = 5) {
  let current = decodeHtmlEntities(value);

  for (let i = 0; i < maxRounds; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = decodeHtmlEntities(next);
    } catch {
      break;
    }
  }

  return current;
}

function isZeissValidationUrl(url) {
  return (
    url.protocol === "https:" &&
    url.hostname.toLowerCase() === ZEISS_VERIFICATION_HOST &&
    url.pathname.startsWith(ZEISS_VERIFICATION_PATH_PREFIX)
  );
}

function isZeissResultUrl(url) {
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== ZEISS_VERIFICATION_HOST
  ) {
    return false;
  }

  return (
    url.pathname.startsWith(ZEISS_SUCCESS_PATH_PREFIX) ||
    url.pathname.startsWith(ZEISS_ERROR_PATH_PREFIX)
  );
}

function isAllowedTrackingUrl(url) {
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  const trustedHost =
    host === "mailjet.com" ||
    host.endsWith(".mailjet.com") ||
    host === "secacam.email" ||
    host.endsWith(".secacam.email");

  if (!trustedHost) return false;

  return url.pathname.includes("/lnk/") || url.pathname.includes("/links/");
}

function extractUrls(value) {
  const text = decodeRepeatedly(value);
  const urls = new Set();

  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  for (const match of text.matchAll(hrefRegex)) {
    urls.add(decodeRepeatedly(match[1]));
  }

  const plainUrls = text.match(/https:\/\/[^\s"'<>]+/gi) || [];
  for (const item of plainUrls) {
    urls.add(decodeRepeatedly(item));
  }

  return [...urls];
}

function extractZeissVerificationUrl(parsed) {
  const parts = [parsed.html, parsed.text, parsed.textAsHtml].filter(Boolean);
  const candidates = new Set();

  for (const part of parts) {
    const decoded = decodeRepeatedly(part);

    const directMatches =
      decoded.match(
        /https:\/\/blue\.prod\.secaapps\.de\/api\/v1\/notification-settings\/emails\/validate\/[^\s"'<>]+/gi
      ) || [];

    for (const direct of directMatches) candidates.add(direct);
    for (const found of extractUrls(decoded)) candidates.add(found);
  }

  const trackingCandidates = [];

  for (const candidate of candidates) {
    try {
      const url = new URL(decodeHtmlEntities(candidate));
      if (isZeissValidationUrl(url)) return url.toString();
      if (isAllowedTrackingUrl(url)) trackingCandidates.push(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }

  return trackingCandidates[0] || null;
}

function assertAllowedVerificationHop(url, sawValidationEndpoint) {
  if (isZeissValidationUrl(url)) return;
  if (isAllowedTrackingUrl(url) && !sawValidationEndpoint) return;
  if (isZeissResultUrl(url) && sawValidationEndpoint) return;

  throw new Error(`blocked verification redirect host/path: ${url.hostname}`);
}

async function verifyZeissEmailAddress(initialUrl) {
  let current = new URL(initialUrl);
  let sawValidationEndpoint = false;

  for (let hop = 0; hop <= ZEISS_VERIFICATION_MAX_REDIRECTS; hop += 1) {
    assertAllowedVerificationHop(current, sawValidationEndpoint);

    if (isZeissValidationUrl(current)) sawValidationEndpoint = true;

    if (
      sawValidationEndpoint &&
      current.hostname.toLowerCase() === ZEISS_VERIFICATION_HOST &&
      current.pathname.startsWith(ZEISS_SUCCESS_PATH_PREFIX)
    ) {
      return;
    }

    if (
      current.hostname.toLowerCase() === ZEISS_VERIFICATION_HOST &&
      current.pathname.startsWith(ZEISS_ERROR_PATH_PREFIX)
    ) {
      throw new Error("ZEISS returned verification error page");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ZEISS_VERIFICATION_TIMEOUT_MS
    );

    let response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          "user-agent": "Venaris-ZEISS-Verification/1.0",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`verification redirect ${response.status} without Location`);
      }

      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new Error(`ZEISS verification failed with HTTP ${response.status}`);
    }

    if (!sawValidationEndpoint) {
      throw new Error("tracking link ended before ZEISS validation endpoint");
    }

    const body = (await response.text()).slice(0, 8000).toLowerCase();
    if (
      body.includes("email verified successfully") ||
      body.includes("successfully verified") ||
      body.includes('"success":true') ||
      body.includes('"status":"success"')
    ) {
      return;
    }

    throw new Error("ZEISS verification response was successful but ambiguous");
  }

  throw new Error("too many ZEISS verification redirects");
}

function moveTo(dir, filePath) {
  const target = path.join(dir, path.basename(filePath));
  fs.renameSync(filePath, target);
  return target;
}

function isRecentEnough(filePath) {
  if (!Number.isFinite(ZEISS_VERIFICATION_MAX_AGE_MINUTES)) return true;
  if (ZEISS_VERIFICATION_MAX_AGE_MINUTES <= 0) return true;

  const ageMs = Date.now() - fs.statSync(filePath).mtimeMs;
  return ageMs <= ZEISS_VERIFICATION_MAX_AGE_MINUTES * 60_000;
}

async function processVerificationMail(filePath) {
  let parsed;

  try {
    const raw = fs.readFileSync(filePath);
    parsed = await simpleParser(raw);
  } catch (error) {
    console.warn(
      `ZEISS verification helper skipped unreadable invalid mail ${path.basename(filePath)}: ${error?.message ?? error}`
    );
    return { matched: false, verified: false, failed: false };
  }

  if (!isZeissVerificationMail(parsed)) {
    return { matched: false, verified: false, failed: false };
  }

  if (!isRecentEnough(filePath)) {
    console.log(
      `[${ZEISS_SHARED_ALIAS}] ZEISS verification expired: invitation is older than ${ZEISS_VERIFICATION_MAX_AGE_MINUTES} minutes`
    );
    moveTo(ERROR_DIR, filePath);
    return { matched: true, verified: false, failed: false };
  }

  try {
    const verificationUrl = extractZeissVerificationUrl(parsed);
    if (!verificationUrl) {
      throw new Error("ZEISS verification mail has no supported verification link");
    }

    await verifyZeissEmailAddress(verificationUrl);
    console.log(`[${ZEISS_SHARED_ALIAS}] ZEISS email verification ok`);
    moveTo(PROCESSED_DIR, filePath);
    return { matched: true, verified: true, failed: false };
  } catch (error) {
    console.error(
      `[${ZEISS_SHARED_ALIAS}] ZEISS verification failed: ${error?.message ?? error}`
    );
    moveTo(ERROR_DIR, filePath);
    return { matched: true, verified: false, failed: true };
  }
}

async function main() {
  let matched = 0;
  let verified = 0;
  let failed = 0;

  for (const entry of fs.readdirSync(SOURCE_DIR).sort()) {
    const full = path.join(SOURCE_DIR, entry);
    if (!fs.statSync(full).isFile()) continue;

    const result = await processVerificationMail(full);
    if (result.matched) matched += 1;
    if (result.verified) verified += 1;
    if (result.failed) failed += 1;
  }

  if (matched > 0) {
    console.log(
      `ZEISS verification helper finished. matched=${matched} verified=${verified} failed=${failed}`
    );
  }
}

main().catch((error) => {
  console.error("FATAL", error);
  process.exit(1);
});
