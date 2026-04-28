// src/lib/dateTime.ts #2
import { getIntlLocale, type AppLanguage } from "@/lib/i18n";

export const DEFAULT_APP_TIME_ZONE = "Europe/Berlin";

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeAppTimeZone(
  value: string | null | undefined
): string {
  if (typeof value !== "string") return DEFAULT_APP_TIME_ZONE;

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 100) return DEFAULT_APP_TIME_ZONE;

  return isValidTimeZone(trimmed) ? trimmed : DEFAULT_APP_TIME_ZONE;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

export function formatAppDateTime(
  value: string | null | undefined,
  language: AppLanguage,
  timeZone?: string | null
): string {
  const date = parseDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat(getIntlLocale(language), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: normalizeAppTimeZone(timeZone),
  }).format(date);
}

export function formatAppDate(
  value: string | null | undefined,
  language: AppLanguage,
  timeZone?: string | null
): string {
  const date = parseDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat(getIntlLocale(language), {
    dateStyle: "short",
    timeZone: normalizeAppTimeZone(timeZone),
  }).format(date);
}

export function formatAppTime(
  value: string | null | undefined,
  language: AppLanguage,
  timeZone?: string | null
): string {
  const date = parseDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat(getIntlLocale(language), {
    timeStyle: "short",
    timeZone: normalizeAppTimeZone(timeZone),
  }).format(date);
}

export function getAppHour(
  value: string | null | undefined,
  timeZone?: string | null
): number | null {
  const date = parseDate(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: normalizeAppTimeZone(timeZone),
  }).formatToParts(date);

  const hourPart = parts.find((part) => part.type === "hour")?.value;

  if (!hourPart) return null;

  const hour = Number(hourPart);

  if (!Number.isFinite(hour)) return null;

  return hour === 24 ? 0 : hour;
}

export function getAppDateKey(
  value: string | null | undefined,
  timeZone?: string | null
): string | null {
  const date = parseDate(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: normalizeAppTimeZone(timeZone),
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
}