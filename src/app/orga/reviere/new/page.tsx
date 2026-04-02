// src/app/orga/reviere/new/page.tsx #7
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { redirectIfDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import SubmitButton from "@/components/SubmitButton";

async function createRevier(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/reviere/new");
  redirectIfDemoWrite(ctx, "/orga/reviere/new?demo_read_only=1");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const name = String(formData.get("name") ?? "").trim();
  const areaHaRaw = String(formData.get("area_ha") ?? "").trim();
  const status = String(formData.get("status") ?? "active").trim() || "active";

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

  if (!["active", "paused", "archived"].includes(status)) {
    throw new Error("Ungültiger Revierstatus.");
  }

  const areaHa = Math.round(parsed);

  const supabase = supabaseServer();

  const { error } = await supabase.from("reviers").insert({
    name,
    area_ha: areaHa,
    status,
    organization_id: organization.id,
    is_default: false,
  });

  if (error) {
    throw new Error(`Failed to create revier: ${error.message}`);
  }

  revalidatePath("/orga/reviere");
  revalidatePath("/", "layout");

  redirect("/orga/reviere?created=1");
}

export default async function NewRevierPage({
  searchParams,
}: {
  searchParams?: Promise<{ demo_read_only?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const demoReadOnly = params.demo_read_only === "1";

  const ctx = await requirePathAccess("/orga/reviere/new");
  const isDemo = ctx.isDemo;

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Revier anlegen
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Revier anlegen
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            Lege hier ein neues Revier für die aktive Organisation an. Das Revier
            wird anschließend als fachlicher Scope für Kameras und Auswertungen
            verfügbar.
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
        <form action={createRevier} className="space-y-6">
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
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                placeholder="z. B. Demo-Nord"
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
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                placeholder="z. B. 250"
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
                defaultValue="active"
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

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              idleLabel={isDemo ? "Demo-Modus" : "Revier speichern"}
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