// src/app/orga/reviere/[id]/edit/page.tsx #6
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { redirectIfDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
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

  const ctx = await requirePathAccess(`/orga/reviere/${revierId}/edit`);
  redirectIfDemoWrite(ctx, `/orga/reviere/${revierId}/edit?demo_read_only=1`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;

  if (!organization) {
    throw new Error("Active organization not found");
  }

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ demo_read_only?: string }>;
}) {
  const { id } = await params;
  const search = (await searchParams) ?? {};
  const demoReadOnly = search.demo_read_only === "1";

  const ctx = await requirePathAccess(`/orga/reviere/${id}/edit`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const isDemo = ctx.isDemo;

  if (!organization) {
    throw new Error("Active organization not found");
  }

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
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Revier bearbeiten
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Revier bearbeiten
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            Bearbeite hier die Stammdaten und den Status des ausgewählten Reviers.
          </p>
        </div>
      </section>

      {demoReadOnly ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">
            Demo-Modus: Änderungen sind deaktiviert.
          </p>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <form action={updateRevier.bind(null, revier.id)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-white"
              >
                Reviername *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={revier.name}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
              />
            </div>

            <div>
              <label
                htmlFor="area_ha"
                className="mb-2 block text-sm font-medium text-white"
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
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
              />
            </div>

            <div>
              <label
                htmlFor="region"
                className="mb-2 block text-sm font-medium text-white"
              >
                Region
              </label>
              <input
                id="region"
                name="region"
                type="text"
                defaultValue={revier.region ?? ""}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
              />
            </div>

            <div>
              <label
                htmlFor="country"
                className="mb-2 block text-sm font-medium text-white"
              >
                Land
              </label>
              <input
                id="country"
                name="country"
                type="text"
                defaultValue={revier.country ?? "DE"}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm uppercase text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
              />
            </div>

            <div>
              <label
                htmlFor="status"
                className="mb-2 block text-sm font-medium text-white"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={revier.status}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
              >
                <option value="active" className="bg-[#102018] text-white">
                  Active
                </option>
                <option value="paused" className="bg-[#102018] text-white">
                  Paused
                </option>
                <option value="archived" className="bg-[#102018] text-white">
                  Archived
                </option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="notes"
              className="mb-2 block text-sm font-medium text-white"
            >
              Notizen
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={5}
              defaultValue={revier.notes ?? ""}
              disabled={isDemo}
              className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              idleLabel={isDemo ? "Demo-Modus" : "Änderungen speichern"}
              pendingLabel="Speichert..."
            />

            <Link
              href="/orga/reviere"
              className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              Abbrechen
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}