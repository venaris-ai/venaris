// src/components/ContextBar.tsx #4
import { getOptionalActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import ClientRevierScopeField from "@/components/ClientRevierScopeField";

type RevierRow = {
  id: string;
  name: string;
};

export default async function ContextBar() {
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
        <span className="text-white/45">Orga:</span>{" "}
        <span className="font-medium text-white">{activeOrganization.name}</span>
      </div>

      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm">
        <span className="text-white/45">Role:</span>{" "}
        <span className="font-medium text-white">{activeMembership.role}</span>
      </div>

      <ClientRevierScopeField reviers={reviers} />
    </div>
  );
}