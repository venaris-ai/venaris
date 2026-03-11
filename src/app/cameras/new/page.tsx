import { requireOrganizationRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import CreateCameraForm from "./CreateCameraForm";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type Revier = {
  id: string;
  name: string;
  organization_id: string | null;
};

export default async function NewCameraPage() {
  const { activeMembership } = await requireOrganizationRole(["owner", "admin"]);
  const supabase = supabaseServer();

  const activeOrganization = activeMembership.organizations;

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  const { data: reviers, error: revierError } = await supabase
    .from("reviers")
    .select("id, name, organization_id")
    .eq("organization_id", activeOrganization.id)
    .order("name", { ascending: true });

  if (revierError) {
    throw new Error(`Failed to load reviers: ${revierError.message}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Create Camera</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Add a new camera and generate its provisioning data.
        </p>
      </div>

      <CreateCameraForm
        organizations={[activeOrganization as Organization]}
        reviers={(reviers ?? []) as Revier[]}
      />
    </main>
  );
}