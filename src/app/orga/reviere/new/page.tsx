// src/app/orga/reviere/new/page.tsx #2
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import SubmitButton from "@/components/SubmitButton";

async function createRevier(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/reviere/new");

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

  const { error } = await supabase.from("reviers").insert({
    name,
    area_ha: areaHa,
    region: region || null,
    country,
    status,
    notes: notes || null,
    organization_id: organization.id,
  });

  if (error) {
    throw new Error(`Failed to create revier: ${error.message}`);
  }

  redirect("/orga/reviere?created=1");
}

export default async function NewRevierPage() {
  await requirePathAccess("/orga/reviere/new");

  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Revier anlegen</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Lege hier ein neues Revier für die aktive Organisation an. Das Revier
            wird anschließend als fachlicher Scope für Kameras und Auswertungen
            verfügbar.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <form action={createRevier} className="space-y-6">
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
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
                placeholder="z. B. Demo-Nord"
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
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
                placeholder="z. B. 250"
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
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
                placeholder="z. B. Ostwestfalen"
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
                defaultValue="DE"
                className="w-full rounded-md border px-3 py-2 text-sm uppercase outline-none ring-0"
                placeholder="DE"
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
                defaultValue="active"
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
              className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-0"
              placeholder="Optionale Beschreibung oder interne Hinweise"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              idleLabel="Revier speichern"
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

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-medium text-amber-900">Hinweis</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900/80">
          Boundary-Import, Kartenlogik und Geometrien folgen später. Für den MVP
          erfassen wir hier zunächst die operativ wichtigen Stammdaten des
          Reviers.
        </p>
      </section>
    </main>
  );
}