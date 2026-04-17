// src/app/cameras/page.tsx #14
import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import CamerasPageClient from "./CamerasPageClient";

export default async function CamerasPage() {
  const ctx = await requirePathAccess("/cameras");

if (!ctx.user) {
  throw new Error("Authenticated user required");
}


  const cookieStore = await cookies();
  const supabase = supabaseServer();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language: AppLanguage = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  return <CamerasPageClient language={language} />;
}