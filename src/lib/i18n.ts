// src/lib/i18n.ts #4
import type { NextRequest } from "next/server";

export const LOCALE_COOKIE = "venaris_locale";

export const APP_LANGUAGES = ["de", "en"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "de" || value === "en";
}

export function normalizeLanguage(value: unknown): AppLanguage {
  if (typeof value !== "string") return "de";

  const normalized = value.trim().toLowerCase();

  if (normalized === "en") return "en";
  if (normalized === "de") return "de";

  return "de";
}

export function resolveLanguage(params?: {
  cookieLanguage?: unknown;
  profileLanguage?: unknown;
}): AppLanguage {
  if (isAppLanguage(params?.profileLanguage)) {
    return normalizeLanguage(params?.profileLanguage);
  }

  if (isAppLanguage(params?.cookieLanguage)) {
    return normalizeLanguage(params?.cookieLanguage);
  }

  return "de";
}

export function getLanguageFromRequest(request: NextRequest): AppLanguage {
  return normalizeLanguage(request.cookies.get(LOCALE_COOKIE)?.value);
}

/**
 * Backward-compatible alias for older imports.
 * Prefer getLanguageFromRequest going forward.
 */
export function getRequestLanguage(request: NextRequest): AppLanguage {
  return getLanguageFromRequest(request);
}

/**
 * Client-side cookie read.
 * Do not use this for initial page rendering when a server-side solution is possible.
 * Keep only as a compatibility helper for purely client-side flows.
 */
export function getLanguageFromDocumentCookie(): AppLanguage {
  if (typeof document === "undefined") return "de";

  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));

  if (!raw) return "de";

  const value = raw.slice(`${LOCALE_COOKIE}=`.length);

  try {
    return normalizeLanguage(decodeURIComponent(value));
  } catch {
    return normalizeLanguage(value);
  }
}

export function getIntlLocale(language: AppLanguage): "de-DE" | "en-GB" {
  return language === "en" ? "en-GB" : "de-DE";
}

export function buildLocaleCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  };
}