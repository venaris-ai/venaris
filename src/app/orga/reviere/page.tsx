// src/app/orga/reviere/page.tsx #4
import Link from "next/link";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";

type RevierRow = {
  id: string;
  name: string;
  area_ha: number | null;
  region: string | null;
  country: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

function formatArea(areaHa: number | null) {
  if (areaHa == null) return "—";
  return `${areaHa} ha`;
}

function formatLocation(region: string | null, country: string | null) {
  if (region && country) return `${region}, ${country}`;
  if (region) return region;
  if (country) return country;
  return "—";
}

function formatStatus(status: string) {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  if (status === "archived") return "Archived";
  return status;
}

export default async function OrgaRevierePage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string; updated?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const created = params.created === "1";
  const updated = params.updated === "1";

  const ctx = await requirePathAccess("/orga/reviere");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("reviers")
    .select("id,name,area_ha,region,country,notes,status,created_at")
    .eq("organization_id", organization.id)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load reviers: ${error.message}`);
  }

  const reviers = (data ?? []) as RevierRow[];

  const activeCount = reviers.filter((revier) => revier.status === "active").length;
  const pausedCount = reviers.filter((revier) => revier.status === "paused").length;
  const archivedCount = reviers.filter((revier) => revier.status === "archived").length;

  return (
    <main className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Reviere</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Reviere sind der fachliche Flächenscope Deiner Organisation. Sie
          strukturieren Kamerazuordnung, Wildlife-Auswertungen und spätere
          populationsbezogene Berechnungen innerhalb von Venaris.
        </p>
      </section>

      {created ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Revier wurde erfolgreich angelegt.
          </p>
        </section>
      ) : null}

      {updated ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Revier wurde erfolgreich aktualisiert.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Active</div>
          <div className="mt-2 text-3xl font-semibold">{activeCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Produktiv genutzte Reviere im aktuellen Organizationskontext.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Paused</div>
          <div className="mt-2 text-3xl font-semibold">{pausedCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Vorübergehend aus dem aktiven Fokus genommene Reviere.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Archived</div>
          <div className="mt-2 text-3xl font-semibold">{archivedCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Historisch erhaltene, aber nicht mehr aktiv genutzte Reviere.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-medium">Revierliste</h2>
            <p className="mt-1 text-sm text-gray-600">
              Aktuelle Reviere der aktiven Organisation.
            </p>
          </div>

          <Link
            href="/orga/reviere/new"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Revier anlegen
          </Link>
        </div>

        {reviers.length === 0 ? (
          <div className="px-6 py-10">
            <div className="rounded-2xl border border-dashed bg-gray-50 p-8">
              <h3 className="text-base font-medium">Noch keine Reviere angelegt</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Für die aktive Organisation sind aktuell noch keine Reviere
                vorhanden. Reviere bilden den fachlichen Scope für Kameras,
                Wildlife-Auswertungen und spätere Population Estimates.
              </p>
              <div className="mt-5">
                <Link
                  href="/orga/reviere/new"
                  className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Erstes Revier anlegen
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Fläche</th>
                  <th className="px-6 py-3 font-medium">Region / Land</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Notizen</th>
                  <th className="px-6 py-3 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {reviers.map((revier) => (
                  <tr key={revier.id} className="border-t align-top">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {revier.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatArea(revier.area_ha)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatLocation(revier.region, revier.country)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatStatus(revier.status)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {revier.notes?.trim() ? revier.notes : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/orga/reviere/${revier.id}/edit`}
                        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-medium text-amber-900">Hinweis</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900/80">
          Boundary-Import, Kartenlogik und Geometrien folgen später. Für den MVP
          erfassen und pflegen wir hier zunächst die operativ wichtigen
          Stammdaten der Reviere.
        </p>
      </section>
    </main>
  );
}