// src/components/ContextBar.tsx
import { requireActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import ClientRevierScopeField from "@/components/ClientRevierScopeField";

type RevierRow = {
  id: string;
  name: string;
};

export default async function ContextBar() {
  const { activeMembership } = await requireActiveOrganization();
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
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
      <div className="rounded-md border bg-white px-2.5 py-1">
        <span className="text-gray-500">Organization:</span>{" "}
        <span className="font-medium text-black">{activeOrganization.name}</span>
      </div>

      <div className="rounded-md border bg-white px-2.5 py-1">
        <span className="text-gray-500">Role:</span>{" "}
        <span className="font-medium text-black">{activeMembership.role}</span>
      </div>

      <ClientRevierScopeField reviers={reviers} />
    </div>
  );
}