// src/app/wildlife/popsim/page.tsx #12
export const runtime = "nodejs";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { requirePathAccess } from "@/lib/authz";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";
import {
  DEFAULT_APP_TIME_ZONE,
  formatAppDate,
} from "@/lib/dateTime";
import PopSimSpeciesEstimatesPanel, {
  type PopSimSpeciesEstimateRow,
  type PopSimSpeciesEstimatesPanelLabels,
} from "./PopSimSpeciesEstimatesPanel";

type SearchParams = {
  revier?: string;
};

type RevierRow = {
  id: string;
  name: string;
  area_ha: number | null;
  organization_id: string | null;
  status: string;
  timezone: string | null;
  is_default: boolean | null;
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

function locale(language: AppLanguage) {
  return language === "en" ? "en-GB" : "de-DE";
}

function fmtInt(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString(locale(language));
}

function getRoundedHarvestSurplus(row: PopulationEstimateRow) {
  return Math.round(row.harvest_surplus_v0 ?? 0);
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "PopSim",
      title: "PopSim",
      intro:
        "Model-based population estimate for stock, target values and potential harvest recommendation.",
      activeOrganizationNotFound: "Active organization not found.",
      reviersLoadFailed: "Failed to load grounds:",
      noActiveGroundForPopSim:
        "There is currently no active ground enabled for PopSim for the active organization.",
      singleGroundRequired: "Single ground required",
      singleGroundRequiredText:
        "PopSim is defined as a modeled ground snapshot. Please select a single ground in the global ground dropdown.",
      availableActiveGrounds: "Available active grounds",
      unresolvedGround: "Ground could not be resolved.",
      latestSnapshotLoadFailed: "Failed to load latest PopSim snapshot:",
      snapshotLoadFailed: "Failed to load PopSim data:",
      selectedGround: "Selected Ground",
      areaOpen: "Area open",
      snapshotDate: "Snapshot Date",
      latestCalculation: "latest calculation",
      speciesInModel: "Species in Ground",
      withCurrentSnapshot: "with current snapshot",
      estimatedTotal: "Estimated Total",
      acrossAllSpecies: "across all species",
      harvestSurplus: "Harvest Recommendation",
      speciesGreaterThanZero: (count: string) => `Sum across ${count} species`,
      noSnapshotTitle: "No PopSim snapshot available",
      noSnapshotTextA: "No PopSim results were found in",
      noSnapshotTextB: "for the selected ground yet.",
      speciesEstimates: "Species Estimates",
      speciesEstimatesText:
        "Rounded UI view of the newest modeled snapshot of the selected ground.",
      currentState: "Current State",
      targetState: "Target State",
      species: "Species",
      estimatedTotalCol: "Estimated Total",
      per100ha: "Per 100 ha",
      targetTotal: "Target Total",
      targetPer100ha: "Per 100 ha",
      harvestSurplusCol: "Harvest Recommendation",
      noSpeciesRows: "No species rows are available for the newest snapshot.",
      classification: "Classification",
      classificationText:
        "PopSim is not an exact census, but a model-based approximation based on the available ground, camera and species signals.",
      classificationHint:
        "Missing species usually mean no robust output for the newest snapshot in the current state, not necessarily absence in the ground.",
      classificationTargetHint:
        "Venaris loads initial target values for each ground. These values can be adjusted per ground directly.",
    };
  }

  return {
    eyebrow: "PopSim",
    title: "PopSim",
    intro:
      "Modellgestützte Populationsschätzung für Bestand, Zielwerte und potenziellen Entnahmevorschlag.",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden.",
    reviersLoadFailed: "Fehler beim Laden der Reviere:",
    noActiveGroundForPopSim:
      "Für die aktive Organisation ist derzeit kein aktives Revier für PopSim freigeschaltet.",
    singleGroundRequired: "Einzelrevier erforderlich",
    singleGroundRequiredText:
      "PopSim ist als modellierter Revier-Snapshot definiert. Bitte im globalen Revier-Dropdown ein einzelnes Revier auswählen.",
    availableActiveGrounds: "Verfügbare aktive Reviere",
    unresolvedGround: "Revier konnte nicht aufgelöst werden.",
    latestSnapshotLoadFailed:
      "Fehler beim Laden des letzten PopSim-Snapshots:",
    snapshotLoadFailed: "Fehler beim Laden der PopSim-Daten:",
    selectedGround: "Ausgewähltes Revier",
    areaOpen: "Fläche",
    snapshotDate: "Snapshot-Datum",
    latestCalculation: "Letzte Berechnung",
    speciesInModel: "Arten im Revier",
    withCurrentSnapshot: "mit aktuellem Snapshot",
    estimatedTotal: "Geschätzter Bestand",
    acrossAllSpecies: "über alle Arten",
    harvestSurplus: "Entnahmevorschlag",
    speciesGreaterThanZero: (count: string) => `Summe über ${count} Arten`,
    noSnapshotTitle: "Kein PopSim-Snapshot vorhanden",
    noSnapshotTextA:
      "Für das ausgewählte Revier wurden noch keine PopSim-Ergebnisse in",
    noSnapshotTextB: "gefunden.",
    speciesEstimates: "Artenschätzungen",
    speciesEstimatesText:
      "Gerundete UI-Sicht auf den neuesten modellierten Snapshot des ausgewählten Reviers.",
    currentState: "Ist-Zustand",
    targetState: "Soll-Zustand",
    species: "Art",
    estimatedTotalCol: "Geschätzter Bestand",
    per100ha: "Pro 100 ha",
    targetTotal: "Zielbestand",
    targetPer100ha: "Pro 100 ha",
    harvestSurplusCol: "Entnahmevorschlag",
    noSpeciesRows:
      "Für den neuesten Snapshot sind keine Artenschätzungen vorhanden.",
    classification: "Einordnung",
    classificationText:
      "PopSim ist kein exakter Zensus, sondern eine modellgestützte Näherung auf Basis der verfügbaren Revier-, Kamera- und Artensignale.",
    classificationHint:
      "Fehlende Arten bedeuten im aktuellen Stand in der Regel: kein belastbarer Output für den neuesten Snapshot, nicht zwingend Abwesenheit im Revier.",
    classificationTargetHint:
      "Venaris lädt für jedes Revier Startwerte für Zielbestände. Diese Werte können revierbezogen angepasst werden.",
  };
}

function PageHeader({ language }: { language: AppLanguage }) {
  const text = t(language);

  return (
    <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
        {text.eyebrow}
      </div>
      <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
      <p className="mt-2 text-sm text-white/68">{text.intro}</p>
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

  const ctx = await requirePathAccess("/wildlife/popsim");

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const cookieStore = await cookies();
  const supabase = supabaseServer();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  const text = t(language);
  const activeOrganization = ctx.activeMembership?.organizations;
  const speciesMetaRows = await loadSpeciesMeta();
  const speciesMetaMap = buildSpeciesMetaMap(speciesMetaRows);

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <PageHeader language={language} />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.activeOrganizationNotFound}
        </div>
      </main>
    );
  }

  const activeOrganizationSlug =
    (activeOrganization as { slug?: string | null }).slug ?? null;
  const activeRole =
    (ctx.activeMembership as { role?: string | null } | null | undefined)
      ?.role ?? null;
  const isDemo = activeOrganizationSlug === "demo";
  const canEditTargets =
    !isDemo && (activeRole === "owner" || activeRole === "admin");

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,area_ha,organization_id,status,timezone,is_default")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-8">
        <PageHeader language={language} />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.reviersLoadFailed} {reviersError.message}
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
        <PageHeader language={language} />

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
          {text.noActiveGroundForPopSim}
        </div>
      </main>
    );
  }

  const defaultRevier =
    reviers.find((revier) => revier.is_default) ?? reviers[0];

  if (!resolvedSearchParams.revier || resolvedSearchParams.revier === "all") {
    redirect(`/wildlife/popsim?revier=${defaultRevier.id}`);
  }

  const revierScope = resolveRevierScope(
    resolvedSearchParams.revier,
    allowedReviers
  );

  if (revierScope.type === "all") {
    redirect(`/wildlife/popsim?revier=${defaultRevier.id}`);
  }

  const selectedRevier = reviers.find((r) => r.id === revierScope.revierId);

  if (!selectedRevier) {
    return (
      <main className="space-y-8">
        <PageHeader language={language} />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.unresolvedGround}
        </div>
      </main>
    );
  }

  const selectedTimeZone =
    selectedRevier.timezone ?? DEFAULT_APP_TIME_ZONE;

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
        <PageHeader language={language} />

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.latestSnapshotLoadFailed} {latestEstimateError.message}
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
          <PageHeader language={language} />

          <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
            {text.snapshotLoadFailed} {snapshotError.message}
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
    (sum, row) => sum + getRoundedHarvestSurplus(row),
    0
  );
  const speciesWithSurplus = snapshotRows.filter(
    (row) => getRoundedHarvestSurplus(row) > 0
  ).length;

  const speciesEstimateRows: PopSimSpeciesEstimateRow[] = snapshotRows.map(
    (row) => ({
      species: row.species,
      speciesLabel: getSpeciesLabel(row.species, language, speciesMetaMap),
      estimatedPopulationTotal: row.estimated_population_total,
      estimatedPopulationPer100ha: row.estimated_population_per_100ha,
      targetTotal: row.target_total,
      targetPer100ha: row.target_per_100ha,
      harvestSurplus: row.harvest_surplus_v0,
    })
  );

  const speciesEstimateLabels: PopSimSpeciesEstimatesPanelLabels = {
    speciesEstimates: text.speciesEstimates,
    speciesEstimatesText: text.speciesEstimatesText,
    currentState: text.currentState,
    targetState: text.targetState,
    species: text.species,
    estimatedTotalCol: text.estimatedTotalCol,
    per100ha: text.per100ha,
    targetTotal: text.targetTotal,
    targetPer100ha: text.targetPer100ha,
    harvestSurplusCol: text.harvestSurplusCol,
    noSpeciesRows: text.noSpeciesRows,
  };

  return (
    <main className="space-y-8">
      <PageHeader language={language} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title={text.selectedGround}
          value={selectedRevier.name}
          subline={
            selectedRevier.area_ha
              ? `${fmtInt(selectedRevier.area_ha, language)} ha`
              : text.areaOpen
          }
        />
        <StatCard
          title={text.snapshotDate}
          value={formatAppDate(latestEstimateDate, language, selectedTimeZone)}
          subline={text.latestCalculation}
        />
        <StatCard
          title={text.speciesInModel}
          value={fmtInt(speciesCount, language)}
          subline={text.withCurrentSnapshot}
        />
        <StatCard
          title={text.estimatedTotal}
          value={fmtInt(totalEstimatedPopulation, language)}
          subline={text.acrossAllSpecies}
        />
        <StatCard
          title={text.harvestSurplus}
          value={fmtInt(totalHarvestSurplus, language)}
          subline={text.speciesGreaterThanZero(
            fmtInt(speciesWithSurplus, language)
          )}
        />
      </section>

      {!latestEstimateDate ? (
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white">{text.noSnapshotTitle}</h2>
          <p className="mt-2 text-sm text-white/65">
            {text.noSnapshotTextA}
            <code className="mx-1 rounded bg-white/8 px-1 py-0.5 text-xs text-white">
              population_estimates
            </code>
            {text.noSnapshotTextB}
          </p>
        </section>
      ) : (
        <>
          <PopSimSpeciesEstimatesPanel
            revierId={selectedRevier.id}
            rows={speciesEstimateRows}
            isDemo={isDemo}
            canEditTargets={canEditTargets}
            language={language}
            labels={speciesEstimateLabels}
          />

<section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
  <h2 className="text-lg font-medium text-white">{text.classification}</h2>
  <div className="mt-3 space-y-2 text-sm text-white/72">
    <div>{text.classificationText}</div>
    <div>{text.classificationHint}</div>
    <div>{text.classificationTargetHint}</div>
  </div>
</section>
        </>
      )}
    </main>
  );
}
