// src/components/HeaderRevierScope.tsx #1
import { getOptionalActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import ClientRevierScopeField from "@/components/ClientRevierScopeField";
import type { AppLanguage } from "@/lib/i18n";

type RevierRow = {
  id: string;
  name: string;
};

export default async function HeaderRevierScope({
  language,
}: {
  language: AppLanguage;
}) {
  const ctx = await getOptionalActiveOrganization();

  if (!ctx) {
    return null;
  }

  const activeOrganization = ctx.activeMembership.organizations;

  if (!activeOrganization) {
    return null;
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("reviers")
    .select("id,name")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  const reviers: RevierRow[] = error ? [] : ((data ?? []) as RevierRow[]);

  return <ClientRevierScopeField reviers={reviers} language={language} />;
}