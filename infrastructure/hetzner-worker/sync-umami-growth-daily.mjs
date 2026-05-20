// infrastructure/hetzner-worker/sync-umami-growth-daily.mjs

import { createClient } from "@supabase/supabase-js";

function env(name, required = true) {
  const value = process.env[name];

  if (required && (!value || !String(value).trim())) {
    throw new Error(`Missing env: ${name}`);
  }

  return String(value || "").trim();
}

function asInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim();

if (!SUPABASE_URL) {
  throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
}

const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const UMAMI_BASE_URL = env("UMAMI_BASE_URL").replace(/\/$/, "");
const UMAMI_USERNAME = env("UMAMI_USERNAME");
const UMAMI_PASSWORD = env("UMAMI_PASSWORD");
const UMAMI_WEBSITE_ID = env("UMAMI_WEBSITE_ID");

const TIME_ZONE = process.env.GROWTH_SYNC_TIMEZONE?.trim() || "Europe/Berlin";
const DEMO_EVENT_NAME = process.env.GROWTH_SYNC_DEMO_EVENT?.trim() || "demo_start";
const DAYS_BACK = asInteger(process.env.GROWTH_SYNC_DAYS_BACK || "1", 1);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

function formatDateParts(parts) {
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return formatDateParts(formatter.formatToParts(date));
}

function getTodayDateStringInZone(timeZone) {
  const parts = getZonedParts(new Date(), timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days, 12, 0, 0);
  const date = new Date(utc);

  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getTimeZoneOffsetMs(utcMs, timeZone) {
  const parts = getZonedParts(new Date(utcMs), timeZone);

  const localAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return localAsUtcMs - utcMs;
}

function zonedMidnightToUtcMs(dateString, timeZone) {
  const [year, month, day] = dateString.split("-").map(Number);

  const localMidnightAsUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);

  const firstOffset = getTimeZoneOffsetMs(localMidnightAsUtcMs, timeZone);
  let utcMs = localMidnightAsUtcMs - firstOffset;

  const secondOffset = getTimeZoneOffsetMs(utcMs, timeZone);
  if (secondOffset !== firstOffset) {
    utcMs = localMidnightAsUtcMs - secondOffset;
  }

  return utcMs;
}

function getSyncDay() {
  const explicitDay = getArgValue("day") || process.env.GROWTH_SYNC_DAY?.trim();

  if (explicitDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(explicitDay)) {
      throw new Error(`Invalid day format: ${explicitDay}. Expected YYYY-MM-DD.`);
    }

    return explicitDay;
  }

  const today = getTodayDateStringInZone(TIME_ZONE);
  return addDays(today, -DAYS_BACK);
}

async function readJsonResponse(response, label) {
  const text = await response.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned non-JSON response: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(
      `${label} failed: ${response.status} ${response.statusText} ${JSON.stringify(json).slice(0, 500)}`
    );
  }

  return json;
}

async function loginToUmami() {
  const response = await fetch(`${UMAMI_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: UMAMI_USERNAME,
      password: UMAMI_PASSWORD,
    }),
  });

  const json = await readJsonResponse(response, "umami_login");

  const token =
    json.token ||
    json.jwt ||
    json.accessToken ||
    json.data?.token ||
    json.data?.jwt ||
    json.data?.accessToken;

  if (!token) {
    throw new Error(
      `umami_login succeeded but no token found in response keys: ${Object.keys(json).join(", ")}`
    );
  }

  return token;
}

async function getUmamiStats(token, path, label) {
  const response = await fetch(`${UMAMI_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  return readJsonResponse(response, label);
}

function getVisitors(stats) {
  const value = stats.visitors ?? stats.data?.visitors ?? 0;
  const number = Number(value);

  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.trunc(number));
}

async function main() {
  const day = getSyncDay();
  const nextDay = addDays(day, 1);

  const startAt = zonedMidnightToUtcMs(day, TIME_ZONE);
  const endAt = zonedMidnightToUtcMs(nextDay, TIME_ZONE);

  if (!(endAt > startAt)) {
    throw new Error(`Invalid sync window: startAt=${startAt}, endAt=${endAt}`);
  }

  console.log("[growth-sync] start", {
    day,
    timeZone: TIME_ZONE,
    startAt,
    endAt,
    umamiBaseUrl: UMAMI_BASE_URL,
    websiteId: UMAMI_WEBSITE_ID,
    demoEventName: DEMO_EVENT_NAME,
  });

  const token = await loginToUmami();

  const statsPath =
    `/api/websites/${encodeURIComponent(UMAMI_WEBSITE_ID)}` +
    `/stats?startAt=${encodeURIComponent(startAt)}` +
    `&endAt=${encodeURIComponent(endAt)}`;

  const demoStatsPath =
    `/api/websites/${encodeURIComponent(UMAMI_WEBSITE_ID)}` +
    `/events/stats?startAt=${encodeURIComponent(startAt)}` +
    `&endAt=${encodeURIComponent(endAt)}` +
    `&event=${encodeURIComponent(DEMO_EVENT_NAME)}`;

  const websiteStats = await getUmamiStats(token, statsPath, "umami_website_stats");
  const demoStats = await getUmamiStats(token, demoStatsPath, "umami_demo_event_stats");

  const uniqueVisitors = getVisitors(websiteStats);
  const demoUniqueVisitors = getVisitors(demoStats);

  const row = {
    day,
    unique_visitors: uniqueVisitors,
    demo_unique_visitors: demoUniqueVisitors,
    provider: "umami",
    timezone: TIME_ZONE,
    synced_at: new Date().toISOString(),
    raw: {
      source: "sync-umami-growth-daily.mjs",
      website_id: UMAMI_WEBSITE_ID,
      demo_event_name: DEMO_EVENT_NAME,
      start_at: startAt,
      end_at: endAt,
      website_stats: websiteStats,
      demo_event_stats: demoStats,
    },
  };

  const { error } = await supabase
    .from("growth_web_analytics_daily")
    .upsert(row, { onConflict: "day" });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log("[growth-sync] upserted", {
    day,
    uniqueVisitors,
    demoUniqueVisitors,
  });
}

main().catch((error) => {
  console.error("[growth-sync] failed", error);
  process.exit(1);
});