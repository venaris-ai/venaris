// src/app/wildlife/popsim/page.tsx #2
export const runtime = "nodejs";

import { supabaseServer } from "@/lib/supabaseServer";
import { requireActiveOrganization } from "@/lib/auth";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

type SearchParams = {
  revier?: string;
};

type RevierRow = {
  id: string;
  name: string;
  area_ha: number | null;
  organization_id: string | null;
  status: string;
};

type PopulationEstimateRow = {
  organization_id: string;
  revier_id: string;
  species: string;
  estimate_date: string;
  estimated_population_total: number | null;
  estimated_population_per_100ha: number | null;
  target_total: number | null;
  target_per_100ha: number | null;
  harvest_surplus_v0: number | null;
};

function prettySpecies(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function titleCase(value: string | null | undefined) {
  const s = prettySpecies(value);
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtInt(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString("de-DE");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE");
}

function PageHeader() {
  return (
    <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
        PopSim
      </div>
      <h1 className="mt-3 text-3xl font-semibold text-white">PopSim</h1>
      <p className="mt-2 text-sm text-white/68">
        Modellgestützte Populationsschätzung für Bestand, Zielwerte und potenziellen
        Entnahmeüberschuss.
      </p>
    </section>
  );
}

function StatCard({
  title,
  value,
  subline,
}: {
  title: string;
  value: string | number;
  subline: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-white/45">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-white/60">{subline}</div>
    </div>
  );
}

export default async function PopSimPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const { activeMembership } = await requireActiveOrganization();
  const activeOrganization = activeMembership.organizations;

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <PageHeader />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Active organization not found.
        </div>
      </main>
    );
  }

  const supabase = supabaseServer();

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,area_ha,organization_id,status")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-8">
        <PageHeader />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Fehler beim Laden der Reviere: {reviersError.message}
        </div>
      </main>
    );
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const allowedReviers: RevierOption[] = reviers.map((r) => ({
    id: r.id,
    name: r.name,
  }));

  if (reviers.length === 0) {
    return (
      <main className="space-y-8">
        <PageHeader />

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
          Für die aktive Organisation ist derzeit kein aktives Revier für PopSim
          freigeschaltet.
        </div>
      </main>
    );
  }

  const revierScope = resolveRevierScope(
    resolvedSearchParams.revier,
    allowedReviers
  );

  if (revierScope.type === "all") {
    return (
      <main className="space-y-8">
        <PageHeader />

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white">Einzelrevier erforderlich</h2>
          <p className="mt-2 text-sm text-white/65">
            PopSim ist als modellierter Revier-Snapshot definiert. Bitte im globalen
            Revier-Dropdown ein einzelnes Revier auswählen.
          </p>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white">Verfügbare aktive Reviere</h2>
          <div className="mt-3 space-y-2 text-sm text-white/78">
            {reviers.map((revier) => (
              <div
                key={revier.id}
                className="rounded-[20px] border border-white/10 bg-white/5 p-3"
              >
                <div className="font-medium text-white">{revier.name}</div>
                <div className="mt-1 text-xs text-white/45">
                  {revier.area_ha ? `${fmtInt(revier.area_ha)} ha` : "Fläche offen"}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const selectedRevier = reviers.find((r) => r.id === revierScope.revierId);

  if (!selectedRevier) {
    return (
      <main className="space-y-8">
        <PageHeader />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Revier konnte nicht aufgelöst werden.
        </div>
      </main>
    );
  }

  const { data: latestEstimateRow, error: latestEstimateError } = await supabase
    .from("population_estimates")
    .select("estimate_date")
    .eq("organization_id", activeOrganization.id)
    .eq("revier_id", selectedRevier.id)
    .order("estimate_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestEstimateError) {
    return (
      <main className="space-y-8">
        <PageHeader />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Fehler beim Laden des letzten PopSim-Snapshots:{" "}
          {latestEstimateError.message}
        </div>
      </main>
    );
  }

  const latestEstimateDate = latestEstimateRow?.estimate_date ?? null;

  let snapshotRows: PopulationEstimateRow[] = [];

  if (latestEstimateDate) {
    const { data: snapshotData, error: snapshotError } = await supabase
      .from("population_estimates")
      .select(
        `
        organization_id,
        revier_id,
        species,
        estimate_date,
        estimated_population_total,
        estimated_population_per_100ha,
        target_total,
        target_per_100ha,
        harvest_surplus_v0
      `
      )
      .eq("organization_id", activeOrganization.id)
      .eq("revier_id", selectedRevier.id)
      .eq("estimate_date", latestEstimateDate)
      .order("species", { ascending: true });

    if (snapshotError) {
      return (
        <main className="space-y-8">
          <PageHeader />

          <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
            Fehler beim Laden der PopSim-Daten: {snapshotError.message}
          </div>
        </main>
      );
    }

    snapshotRows = (snapshotData ?? []) as PopulationEstimateRow[];
  }

  const speciesCount = snapshotRows.length;
  const totalEstimatedPopulation = snapshotRows.reduce(
    (sum, row) => sum + (row.estimated_population_total ?? 0),
    0
  );
  const totalHarvestSurplus = snapshotRows.reduce(
    (sum, row) => sum + (row.harvest_surplus_v0 ?? 0),
    0
  );
  const speciesWithSurplus = snapshotRows.filter(
    (row) => (row.harvest_surplus_v0 ?? 0) > 0
  ).length;

  return (
    <main className="space-y-8">
      <PageHeader />

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-medium text-white">Revier-Snapshot</h2>
          <p className="text-sm text-white/65">
            Es wird immer der zuletzt berechnete PopSim-Stand des aktuell gewählten
            aktiven Reviers angezeigt.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Selected Revier"
          value={selectedRevier.name}
          subline={
            selectedRevier.area_ha
              ? `${fmtInt(selectedRevier.area_ha)} ha`
              : "Fläche offen"
          }
        />
        <StatCard
          title="Snapshot Date"
          value={fmtDate(latestEstimateDate)}
          subline="letzte Berechnung"
        />
        <StatCard
          title="Species in Model"
          value={fmtInt(speciesCount)}
          subline="mit aktuellem Snapshot"
        />
        <StatCard
          title="Estimated Total"
          value={fmtInt(totalEstimatedPopulation)}
          subline="über alle Species"
        />
        <StatCard
          title="Harvest Surplus"
          value={fmtInt(totalHarvestSurplus)}
          subline={`${fmtInt(speciesWithSurplus)} Species > 0`}
        />
      </section>

      {!latestEstimateDate ? (
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white">Kein PopSim-Snapshot vorhanden</h2>
          <p className="mt-2 text-sm text-white/65">
            Für das ausgewählte Revier wurden noch keine PopSim-Ergebnisse in
            <code className="mx-1 rounded bg-white/8 px-1 py-0.5 text-xs text-white">
              population_estimates
            </code>
            gefunden.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-white">Species Estimates</h2>
                <p className="text-sm text-white/65">
                  Gerundete UI-Sicht auf den neuesten modellierten Snapshot des
                  ausgewählten Reviers.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left text-white/55">
                    <th className="px-3 py-2 font-medium">Species</th>
                    <th className="px-3 py-2 font-medium">Estimated Total</th>
                    <th className="px-3 py-2 font-medium">Per 100 ha</th>
                    <th className="px-3 py-2 font-medium">Target Total</th>
                    <th className="px-3 py-2 font-medium">Target / 100 ha</th>
                    <th className="px-3 py-2 font-medium">Harvest Surplus</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotRows.map((row) => (
                    <tr
                      key={row.species}
                      className="border-b border-white/8 last:border-0"
                    >
                      <td className="px-3 py-3 font-medium text-white">
                        {titleCase(row.species)}
                      </td>
                      <td className="px-3 py-3 text-white/72">
                        {fmtInt(row.estimated_population_total)}
                      </td>
                      <td className="px-3 py-3 text-white/72">
                        {fmtInt(row.estimated_population_per_100ha)}
                      </td>
                      <td className="px-3 py-3 text-white/72">
                        {fmtInt(row.target_total)}
                      </td>
                      <td className="px-3 py-3 text-white/72">
                        {fmtInt(row.target_per_100ha)}
                      </td>
                      <td className="px-3 py-3 text-white/72">
                        {fmtInt(row.harvest_surplus_v0)}
                      </td>
                    </tr>
                  ))}

                  {snapshotRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-sm text-white/68">
                        Für den neuesten Snapshot sind keine Species-Zeilen vorhanden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <h2 className="text-lg font-medium text-white">Einordnung</h2>
            <div className="mt-3 space-y-3 text-sm text-white/72">
              <div>
                PopSim ist kein exakter Zensus, sondern eine modellgestützte
                Näherung auf Basis der verfügbaren Revier-, Kamera- und
                Species-Signale.
              </div>
              <div className="rounded-[20px] border border-white/10 bg-white/5 p-3 text-white/65">
                Fehlende Arten bedeuten im aktuellen Stand in der Regel:
                kein belastbarer Output für den neuesten Snapshot, nicht
                zwingend Abwesenheit im Revier.
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}