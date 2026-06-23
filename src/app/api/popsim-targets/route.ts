// src/app/api/popsim-targets/route.ts #1
export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";

const MAX_TARGET_PER_100HA = 1000;

type TargetInput = {
  species?: unknown;
  targetPer100ha?: unknown;
};

type RevierRow = {
  id: string;
  organization_id: string;
  status: string | null;
};

type LatestEstimateRow = {
  estimate_date: string | null;
};

type SnapshotSpeciesRow = {
  species: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function parseSpecies(value: unknown) {
  if (typeof value !== "string") return null;

  const species = value.trim();

  if (!/^[a-z][a-z0-9_]*$/.test(species)) return null;

  return species;
}

function parseTargetPer100ha(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value < 0 || value > MAX_TARGET_PER_100HA) return null;
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");

    if (!normalized) return null;

    const parsed = Number(normalized);

    if (!Number.isFinite(parsed)) return null;
    if (parsed < 0 || parsed > MAX_TARGET_PER_100HA) return null;

    return parsed;
  }

  return null;
}

function parseTargets(value: unknown) {
  if (!Array.isArray(value)) return null;

  const bySpecies = new Map<string, number>();

  for (const item of value) {
    const target = item as TargetInput;
    const species = parseSpecies(target.species);
    const targetPer100ha = parseTargetPer100ha(target.targetPer100ha);

    if (!species || targetPer100ha == null) {
      return null;
    }

    bySpecies.set(species, targetPer100ha);
  }

  return Array.from(bySpecies.entries()).map(([species, targetPer100ha]) => ({
    species,
    targetPer100ha,
  }));
}

export async function POST(request: Request) {
  const ctx = await requirePathAccess("/wildlife/popsim");

  if (!ctx.user) {
    return jsonError("Authenticated user required.", 401);
  }

  const activeOrganization = ctx.activeMembership?.organizations as
    | { id?: string; slug?: string | null }
    | undefined;

  const activeRole = (ctx.activeMembership as { role?: string | null } | null)
    ?.role;

  if (!activeOrganization?.id) {
    return jsonError("Active organization not found.", 403);
  }

  if (activeOrganization.slug === "demo") {
    return jsonError("Demo mode: changes are disabled.", 403);
  }

  if (activeRole !== "owner" && activeRole !== "admin") {
    return jsonError("Only organization owners and admins can change PopSim targets.", 403);
  }

  const payload = (await request.json().catch(() => null)) as
    | { revierId?: unknown; targets?: unknown }
    | null;

  if (!payload || !isUuid(payload.revierId)) {
    return jsonError("Invalid revierId.", 400);
  }

  const targets = parseTargets(payload.targets);

  if (!targets || targets.length === 0) {
    return jsonError("No valid targets provided.", 400);
  }

  if (targets.length > 100) {
    return jsonError("Too many targets provided.", 400);
  }

  const supabase = supabaseServer();

  const { data: revierData, error: revierError } = await supabase
    .from("reviers")
    .select("id,organization_id,status")
    .eq("id", payload.revierId)
    .eq("organization_id", activeOrganization.id)
    .maybeSingle();

  if (revierError) {
    return jsonError(`Failed to load ground: ${revierError.message}`, 500);
  }

  const revier = revierData as RevierRow | null;

  if (!revier || revier.status !== "active") {
    return jsonError("Ground not found or inactive.", 404);
  }

  const { data: latestEstimateData, error: latestEstimateError } =
    await supabase
      .from("population_estimates")
      .select("estimate_date")
      .eq("organization_id", activeOrganization.id)
      .eq("revier_id", revier.id)
      .order("estimate_date", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestEstimateError) {
    return jsonError(
      `Failed to load latest PopSim snapshot: ${latestEstimateError.message}`,
      500
    );
  }

  const latestEstimate = latestEstimateData as LatestEstimateRow | null;

  if (!latestEstimate?.estimate_date) {
    return jsonError("No PopSim snapshot available for this ground.", 409);
  }

  const requestedSpecies = targets.map((target) => target.species);

  const { data: snapshotSpeciesData, error: snapshotSpeciesError } =
    await supabase
      .from("population_estimates")
      .select("species")
      .eq("organization_id", activeOrganization.id)
      .eq("revier_id", revier.id)
      .eq("estimate_date", latestEstimate.estimate_date)
      .in("species", requestedSpecies);

  if (snapshotSpeciesError) {
    return jsonError(`Invalid species in target update.`, 400);
  }

  const snapshotSpecies = new Set(
    ((snapshotSpeciesData ?? []) as SnapshotSpeciesRow[]).map((row) => row.species)
  );

  const missingSpecies = requestedSpecies.filter(
    (species) => !snapshotSpecies.has(species)
  );

  if (missingSpecies.length > 0) {
    return jsonError(
      `Target update contains species without current PopSim row: ${missingSpecies.join(
        ", "
      )}`,
      400
    );
  }

  const now = new Date().toISOString();

  const updates = targets.map((target) => ({
    organization_id: activeOrganization.id,
    revier_id: revier.id,
    species: target.species,
    target_per_100ha: target.targetPer100ha,
    updated_at: now,
    updated_by: ctx.user.id,
  }));

  const { error: updateError } = await supabase
    .from("revier_species_targets")
    .upsert(updates, { onConflict: "revier_id,species" });

  if (updateError) {
    return jsonError(`Failed to save PopSim targets: ${updateError.message}`, 500);
  }

  const { error: refreshError } = await supabase.rpc(
    "refresh_population_estimates_for_revier",
    {
      p_revier_id: revier.id,
    }
  );

  if (refreshError) {
    return jsonError(
      `Failed to refresh PopSim snapshot: ${refreshError.message}`,
      500
    );
  }

  revalidatePath("/wildlife/popsim");

  return NextResponse.json({
    ok: true,
    updatedCount: updates.length,
  });
}
