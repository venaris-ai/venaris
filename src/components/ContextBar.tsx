// src/components/ContextBar.tsx #6
import { getOptionalActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import ClientRevierScopeField from "@/components/ClientRevierScopeField";
import type { AppLanguage } from "@/lib/i18n";

type RevierRow = {
  id: string;
  name: string;
};

function roleLabel(role: string, language: AppLanguage) {
  if (language === "en") {
    if (role === "owner") return "Owner";
    if (role === "admin") return "Admin";
    if (role === "member") return "Member";
    if (role === "viewer") return "Viewer";
    return role;
  }

  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Mitglied";
  if (role === "viewer") return "Viewer";
  return role;
}

export default async function ContextBar({
  language,
}: {
  language: AppLanguage;
}) {
  const ctx = await getOptionalActiveOrganization();

  if (!ctx) {
    return null;
  }

  const { activeMembership } = ctx;
  const activeOrganization = activeMembership.organizations;

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

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-white/68">
      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm">
        <span className="text-white/45">
          {language === "en" ? "Organization:" : "Orga:"}
        </span>{" "}
        <span className="font-medium text-white">{activeOrganization.name}</span>
      </div>

      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm">
        <span className="text-white/45">
          {language === "en" ? "Role:" : "Rolle:"}
        </span>{" "}
        <span className="font-medium text-white">
          {roleLabel(activeMembership.role, language)}
        </span>
      </div>

      <ClientRevierScopeField reviers={reviers} language={language} />
    </div>
  );
}