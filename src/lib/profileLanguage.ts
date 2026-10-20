import { cache } from "react";
import { supabaseServer } from "@/lib/supabaseServer";

// Server-render scoped: RootLayout and pages should not query the same
// preferred language separately during the same navigation.
export const getProfilePreferredLanguage = cache(async (userId: string) => {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();

  return data?.preferred_language ?? null;
});
