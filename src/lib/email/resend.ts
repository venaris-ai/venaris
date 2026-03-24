// src/lib/email/resend.ts #1
import { Resend } from "resend";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function getResendClient() {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  return new Resend(apiKey);
}

export function getResendFromEmail() {
  return getRequiredEnv("RESEND_FROM_EMAIL");
}

export function getResendFromName() {
  return process.env.RESEND_FROM_NAME?.trim() || "Venaris";
}

export function getAppBaseUrl() {
  return getRequiredEnv("APP_BASE_URL").replace(/\/+$/, "");
}