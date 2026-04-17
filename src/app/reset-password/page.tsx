// src/app/reset-password/page.tsx #11
import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  normalizeLanguage,
} from "@/lib/i18n";
import ResetPasswordClient from "./ResetPasswordClient";

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get(LOCALE_COOKIE)?.value);

  return <ResetPasswordClient initialLanguage={language} />;
}