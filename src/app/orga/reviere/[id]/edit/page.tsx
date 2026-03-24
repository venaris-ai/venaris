// src/app/orga/reviere/[id]/edit/page.tsx #2
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrganizationRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import SubmitButton from "@/components/SubmitButton";

type RevierRow = {
  id: string;
  name: string;
  area_ha: number;
  region: string | null;
  country: string | null;
  notes: string | null;
  status: string;
  organization_id: string;
};

async function updateRevier(revierId: string, formData: FormData) {
  "use server";

  const { activeMembership } = await requireOrganizationRole(["owner", "admin"]);
  const organization = activeMembership.organizations;

  const name = String(formData.get("name") ?? "").trim();
  const areaHaRaw = String(formData.get("area_ha") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const country = String(formData.get("country") ?? "DE").trim() || "DE";
  const status = String(formData.get("status") ?? "active").trim() || "active";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    throw new Error("Reviername ist erforderlich.");
  }

  if (!areaHaRaw) {
    throw new Error("Fläche in ha ist erforderlich.");
  }

  const parsed = Number(areaHaRaw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Fläche in ha muss eine gültige positive Zahl sein.");
  }

  const areaHa = Math.round(parsed);

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("reviers")
    .update({
      name,
      area_ha: areaHa,
      region: region || null,
      country,
      status,
      notes: notes || null,
    })
    .eq("id", revierId)
    .eq("organization_id", organization.id);

  if (error) {
    throw new Error(`Failed to update revier: ${error.message}`);
  }

  revalidatePath("/orga/reviere");
  revalidatePath("/", "layout");

  redirect("/orga/reviere?updated=1");
}

export default async function EditRevierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { activeMembership } = await requireOrganizationRole(["owner", "admin"]);
  const organization = activeMembership.organizations;

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("reviers")
    .select("id,name,area_ha,region,country,notes,status,organization_id")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .single();

  if (error) {
    throw new Error(`Failed to load revier: ${error.message}`);
  }

  const revier = data as RevierRow;

  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Revier bearbeiten</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Bearbeite hier die Stammdaten und den Status des ausgewählten Reviers.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <form action={updateRevier.bind(null, revier.id)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                Reviername *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={revier.name}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
              />
            </div>

            <div>
              <label
                htmlFor="area_ha"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                Fläche in ha *
              </label>
              <input
                id="area_ha"
                name="area_ha"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={revier.area_ha}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
              />
            </div>

            <div>
              <label
                htmlFor="region"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                Region
              </label>
              <input
                id="region"
                name="region"
                type="text"
                defaultValue={revier.region ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
              />
            </div>

            <div>
              <label
                htmlFor="country"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                Land
              </label>
              <input
                id="country"
                name="country"
                type="text"
                defaultValue={revier.country ?? "DE"}
                className="w-full rounded-md border px-3 py-2 text-sm uppercase outline-none ring-0"
              />
            </div>

            <div>
              <label
                htmlFor="status"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={revier.status}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="notes"
              className="mb-2 block text-sm font-medium text-gray-900"
            >
              Notizen
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={5}
              defaultValue={revier.notes ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              idleLabel="Änderungen speichern"
              pendingLabel="Speichert..."
            />

            <Link
              href="/orga/reviere"
              className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Abbrechen
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}