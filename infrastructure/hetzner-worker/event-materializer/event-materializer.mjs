// infrastructure/hetzner-worker/event-materializer/event-materializer.mjs #6
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 75;
const DEFAULT_MAX_PENDING_ASSETS = 300;
const DEFAULT_CLAIM_BATCH_SIZE = 300;
const DEFAULT_CLAIM_LEASE_MINUTES = 30;
const DEFAULT_CLAIM_RETRY_AFTER_MINUTES = 10;
const DEFAULT_CONTEXT_MINUTES = 60;
const DEFAULT_MAX_CONTEXT_ASSETS = 3000;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const rawArgs = process.argv.slice(2);
const argSet = new Set(rawArgs);

function argValue(name) {
  const prefix = `${name}=`;
  const found = rawArgs.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDateArg(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date.toISOString();
}

function parseCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeScopeMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized || normalized === "dynamic" || normalized === "all" || normalized === "auto") {
    return "dynamic";
  }

  if (normalized === "explicit" || normalized === "manual") {
    return "explicit";
  }

  throw new Error(`Invalid MATERIALIZER_SCOPE: ${value}`);
}

function chunk(items, size) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function readSpeciesMeta(meta) {
  if (!meta || typeof meta !== "object") return null;

  const species = meta.species;
  if (!species || typeof species !== "object") return null;

  return species;
}

function readSpeciesScore(meta) {
  const speciesMeta = readSpeciesMeta(meta);
  if (!speciesMeta) return null;

  const value = speciesMeta.score;
  const numericValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  return Number.isFinite(numericValue) ? clamp01(numericValue) : null;
}

function uniqueNonEmpty(values, limit = 8) {
  const result = [];

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    if (result.includes(normalized)) continue;

    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function percentile(values, p) {
  const clean = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!clean.length) return 0;
  if (clean.length === 1) return clean[0];

  const pos = (clean.length - 1) * p;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);

  if (lower === upper) return clean[lower];

  const weight = pos - lower;
  return clean[lower] * (1 - weight) + clean[upper] * weight;
}

async function fetchAll(factory, label) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await factory().range(from, to);

    if (error) {
      throw new Error(`${label}_failed: ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function buildSupabaseClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url) {
    throw new Error("Missing env: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isRelevantEffective(asset) {
  return (asset.relevant_user ?? asset.relevant) === true;
}

function assetAnchorIso(asset) {
  return asset.anchor_at ?? asset.captured_at ?? asset.created_at;
}

function buildImageObservation(asset, detectionsForAsset) {
  const animalDetections = detectionsForAsset.filter((detection) => detection.label === "animal");

  const speciesGroups = new Map();
  let suppressedOrUnmappedCount = 0;

  for (const detection of animalDetections) {
    const effectiveSpecies = detection.species_user ?? detection.species ?? null;
    const speciesMeta = readSpeciesMeta(detection.meta);
    const speciesScore = readSpeciesScore(detection.meta);
    const mdScore = Number.isFinite(Number(detection.score)) ? clamp01(Number(detection.score)) : null;
    const usableScore = speciesScore ?? mdScore ?? 0;

    if (!effectiveSpecies) {
      suppressedOrUnmappedCount++;
      continue;
    }

    const existing = speciesGroups.get(effectiveSpecies) ?? {
      species: effectiveSpecies,
      bbox_count: 0,
      manual_bbox_count: 0,
      max_score: 0,
      scores: [],
      detection_ids: [],
      raw_common_names: [],
      mapping_reasons: [],
    };

    existing.bbox_count += 1;
    existing.manual_bbox_count += detection.species_user ? 1 : 0;
    existing.max_score = Math.max(existing.max_score, usableScore);
    existing.scores.push(usableScore);
    existing.detection_ids.push(detection.id);

    if (speciesMeta?.raw_common_name) {
      existing.raw_common_names.push(speciesMeta.raw_common_name);
    }

    if (speciesMeta?.mapping_reason) {
      existing.mapping_reasons.push(speciesMeta.mapping_reason);
    }

    speciesGroups.set(effectiveSpecies, existing);
  }

  const speciesCandidates = [...speciesGroups.values()].map((group) => {
    const bboxShare = animalDetections.length
      ? group.bbox_count / animalDetections.length
      : 0;

    const bboxCountFactor = Math.min(1, group.bbox_count / 3);
    const manualBonus = group.manual_bbox_count > 0 ? 0.05 : 0;

    const imageRank = clamp01(
      manualBonus +
        0.65 * clamp01(group.max_score) +
        0.25 * bboxShare +
        0.10 * bboxCountFactor
    );

    return {
      ...group,
      bbox_share: bboxShare,
      image_rank: imageRank,
      p75_score: percentile(group.scores, 0.75),
      raw_common_names: uniqueNonEmpty(group.raw_common_names),
      mapping_reasons: uniqueNonEmpty(group.mapping_reasons),
    };
  });

  speciesCandidates.sort((a, b) => {
    if (b.image_rank !== a.image_rank) return b.image_rank - a.image_rank;
    if (b.max_score !== a.max_score) return b.max_score - a.max_score;
    if (b.bbox_count !== a.bbox_count) return b.bbox_count - a.bbox_count;
    return String(a.species).localeCompare(String(b.species));
  });

  const selected = speciesCandidates[0] ?? null;

  return {
    asset_id: asset.id,
    camera_id: asset.camera_id,
    asset_captured_at: assetAnchorIso(asset),

    image_species_used: selected?.species ?? null,
    image_species_score: selected ? clamp01(selected.max_score) : null,
    image_animal_count: selected ? selected.bbox_count : null,

    image_pick_reason: selected
      ? "persisted_mapper_species_group_rank_v1"
      : "no_persisted_mapper_species_for_asset",

    image_evidence: {
      policy: "persisted_mapper_species_group_rank_v1",
      animal_detection_count: animalDetections.length,
      suppressed_or_unmapped_detection_count: suppressedOrUnmappedCount,
      selected_species: selected?.species ?? null,
      selected_species_bbox_count: selected?.bbox_count ?? null,
      selected_species_max_score: selected?.max_score ?? null,
      species_candidates: speciesCandidates.map((candidate) => ({
        species: candidate.species,
        bbox_count: candidate.bbox_count,
        bbox_share: candidate.bbox_share,
        max_score: candidate.max_score,
        p75_score: candidate.p75_score,
        image_rank: candidate.image_rank,
        manual_bbox_count: candidate.manual_bbox_count,
        raw_common_names: candidate.raw_common_names,
        mapping_reasons: candidate.mapping_reasons,
      })),
    },
  };
}

function buildClusters(observations, windowMinutes, now) {
  const windowMs = windowMinutes * 60 * 1000;
  const byCamera = new Map();

  for (const observation of observations) {
    const existing = byCamera.get(observation.camera_id) ?? [];
    existing.push(observation);
    byCamera.set(observation.camera_id, existing);
  }

  const clusters = [];

  for (const [cameraId, cameraObservations] of byCamera.entries()) {
    cameraObservations.sort((a, b) => {
      const aTime = new Date(a.asset_captured_at).getTime();
      const bTime = new Date(b.asset_captured_at).getTime();
      return aTime - bTime;
    });

    let current = null;

    for (const observation of cameraObservations) {
      const observationTime = new Date(observation.asset_captured_at).getTime();

      if (!Number.isFinite(observationTime)) continue;

      if (!current) {
        current = {
          camera_id: cameraId,
          observations: [observation],
          start_at: observation.asset_captured_at,
          end_at: observation.asset_captured_at,
        };
        continue;
      }

      const previousEndMs = new Date(current.end_at).getTime();
      const gapMs = observationTime - previousEndMs;

      if (gapMs > windowMs) {
        clusters.push(current);
        current = {
          camera_id: cameraId,
          observations: [observation],
          start_at: observation.asset_captured_at,
          end_at: observation.asset_captured_at,
        };
      } else {
        current.observations.push(observation);
        current.end_at = observation.asset_captured_at;
      }
    }

    if (current) {
      clusters.push(current);
    }
  }

  return clusters
    .map((cluster) => {
      const endMs = new Date(cluster.end_at).getTime();
      const closedAt = new Date(endMs + windowMs);

      return {
        ...cluster,
        closed_at: closedAt.toISOString(),
        is_closed: closedAt.getTime() <= now.getTime(),
      };
    })
    .filter((cluster) => cluster.is_closed);
}

function calculateEventSpecies(cluster) {
  const totalAssets = cluster.observations.length;
  const groups = new Map();

  for (const observation of cluster.observations) {
    const species = observation.image_species_used;
    if (!species) continue;

    const score = clamp01(observation.image_species_score ?? 0);
    const existing = groups.get(species) ?? {
      species,
      image_count: 0,
      scores: [],
      max_image_animal_count: 0,
      image_animal_counts: [],
    };

    existing.image_count += 1;
    existing.scores.push(score);

    const imageCount = Number.isFinite(Number(observation.image_animal_count))
      ? Number(observation.image_animal_count)
      : 0;

    existing.max_image_animal_count = Math.max(
      existing.max_image_animal_count,
      imageCount
    );
    existing.image_animal_counts.push(imageCount);

    groups.set(species, existing);
  }

  const candidates = [...groups.values()].map((group) => {
    const maxScore = Math.max(...group.scores, 0);
    const p75Score = percentile(group.scores, 0.75);
    const medianScore = percentile(group.scores, 0.5);
    const imageSupportShare = totalAssets ? group.image_count / totalAssets : 0;

    const rankMaxHeavy = clamp01(
      0.70 * maxScore +
        0.20 * p75Score +
        0.10 * imageSupportShare
    );

    const rankBalanced = clamp01(
      0.55 * maxScore +
        0.25 * p75Score +
        0.20 * imageSupportShare
    );

    const rankSupportHeavy = clamp01(
      0.45 * maxScore +
        0.25 * p75Score +
        0.30 * imageSupportShare
    );

    return {
      species: group.species,
      image_count: group.image_count,
      image_support_share: imageSupportShare,
      max_score: maxScore,
      p75_score: p75Score,
      median_score: medianScore,
      rank_max_heavy: rankMaxHeavy,
      rank_balanced: rankBalanced,
      rank_support_heavy: rankSupportHeavy,
      max_image_animal_count: group.max_image_animal_count,
      image_animal_counts: group.image_animal_counts,
    };
  });

  candidates.sort((a, b) => {
    if (b.rank_balanced !== a.rank_balanced) return b.rank_balanced - a.rank_balanced;
    if (b.max_score !== a.max_score) return b.max_score - a.max_score;
    if (b.image_count !== a.image_count) return b.image_count - a.image_count;
    return String(a.species).localeCompare(String(b.species));
  });

  const winner = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  const margin = winner && runnerUp
    ? clamp01(winner.rank_balanced - runnerUp.rank_balanced)
    : winner
      ? 1
      : null;

  const animalCountConfidence = winner
    ? clamp01(0.65 * winner.p75_score + 0.35 * winner.image_support_share)
    : null;

  return {
    winner,
    runnerUp,
    candidates,
    event_species_auto: winner?.species ?? null,
    event_species_score: winner ? winner.rank_balanced : 0,
    event_species_margin: margin,
    event_animal_count_auto: winner ? winner.max_image_animal_count : null,
    event_animal_count_confidence: animalCountConfidence,
  };
}

function buildMaterializedEvent(cluster, legacyEventIds, options) {
  const speciesResult = calculateEventSpecies(cluster);

  const speciesEvidence = {
    materializer_version: options.materializerVersion,
    mode: options.execute ? "shadow" : "dry_run",
    window_minutes: options.windowMinutes,
    cluster_policy: "camera_gap_gt_window_minutes",
    source: "assets + detections.meta.species",
    image_pick_policy: "persisted_mapper_species_group_rank_v1",
    event_formula_primary: "balanced",
    formulas: {
      max_heavy: {
        max_score: 0.70,
        p75_score: 0.20,
        image_support_share: 0.10,
      },
      balanced: {
        max_score: 0.55,
        p75_score: 0.25,
        image_support_share: 0.20,
      },
      support_heavy: {
        max_score: 0.45,
        p75_score: 0.25,
        image_support_share: 0.30,
      },
    },
    total_assets: cluster.observations.length,
    winner: speciesResult.winner,
    runner_up: speciesResult.runnerUp,
    candidates: speciesResult.candidates,
  };

  const animalCountEvidence = {
    policy: "max_image_animal_count_for_event_species",
    event_species_auto: speciesResult.event_species_auto,
    event_animal_count_auto: speciesResult.event_animal_count_auto,
    confidence: speciesResult.event_animal_count_confidence,
    note: "This is the maximum image-level count for the winning event species, not a sum across all event images.",
  };

  return {
    camera_id: cluster.camera_id,
    start_at: toIso(cluster.start_at),
    end_at: toIso(cluster.end_at),
    closed_at: toIso(cluster.closed_at),
    window_minutes: options.windowMinutes,
    asset_count: cluster.observations.length,

    event_species_auto: speciesResult.event_species_auto,
    event_species_score: speciesResult.event_species_score,
    event_species_margin: speciesResult.event_species_margin,
    event_species_evidence: speciesEvidence,

    event_animal_count_auto: speciesResult.event_animal_count_auto,
    event_animal_count_confidence: speciesResult.event_animal_count_confidence,
    event_animal_count_evidence: animalCountEvidence,

    event_relevant_auto: true,

    materializer_version: options.materializerVersion,
    mode: "shadow",
    materialized_at: new Date().toISOString(),
    legacy_event_ids: legacyEventIds,
  };
}

function assertNoExcludedOrgSlugs(orgSlugs, excludedOrgSlugs) {
  const excluded = new Set(excludedOrgSlugs);
  const blocked = orgSlugs.filter((slug) => excluded.has(slug));

  if (blocked.length > 0) {
    throw new Error(`Materializer scope includes excluded org slugs: ${blocked.join(", ")}`);
  }
}

function assertNoDemoOrganizations(organizations) {
  const demoRows = organizations.filter((org) => org.is_demo === true);

  if (demoRows.length > 0) {
    const slugs = demoRows.map((org) => org.slug).filter(Boolean).join(", ");
    throw new Error(`Materializer scope includes demo organizations: ${slugs || demoRows.length}`);
  }
}

async function fetchOrganizations(supabase, orgSlugs, excludedOrgSlugs) {
  assertNoExcludedOrgSlugs(orgSlugs, excludedOrgSlugs);

  const { data, error } = await supabase
    .from("organizations")
    .select("id,slug,name,is_demo")
    .in("slug", orgSlugs);

  if (error) throw new Error(`organizations_failed: ${error.message}`);

  const organizations = data ?? [];
  assertNoDemoOrganizations(organizations);

  return organizations;
}

async function fetchMaterializerOrganizations(supabase, excludedOrgSlugs) {
  const excluded = new Set(excludedOrgSlugs);

  const organizations = await fetchAll(
    () =>
      supabase
        .from("organizations")
        .select("id,slug,name,is_demo")
        .order("slug", { ascending: true }),
    "organizations_dynamic"
  );

  return organizations.filter((org) => {
    const slug = String(org.slug ?? "").trim();

    return Boolean(slug) && org.is_demo !== true && !excluded.has(slug);
  });
}

async function fetchPendingAssetsPreview(supabase, options) {
  const { data, error } = await supabase.rpc(
    "get_materializer_pending_assets_dynamic",
    {
      p_materializer_version: options.materializerVersion,
      p_limit: options.claimBatchSize,
      p_window_minutes: options.windowMinutes,
      p_since: options.sinceIso,
      p_excluded_org_slugs: options.excludedOrgSlugs,
    }
  );

  if (error) {
    throw new Error(`get_materializer_pending_assets_dynamic_failed: ${error.message}`);
  }

  return data ?? [];
}

async function claimMaterializerPendingAssets(supabase, options, runId) {
  const { data, error } = await supabase.rpc(
    "claim_materializer_pending_assets",
    {
      p_materializer_version: options.materializerVersion,
      p_limit: options.claimBatchSize,
      p_window_minutes: options.windowMinutes,
      p_since: options.sinceIso,
      p_excluded_org_slugs: options.excludedOrgSlugs,
      p_claimed_by: options.claimedBy,
      p_run_id: runId,
      p_lease_minutes: options.claimLeaseMinutes,
    }
  );

  if (error) {
    throw new Error(`claim_materializer_pending_assets_failed: ${error.message}`);
  }

  return data ?? [];
}

async function completeMaterializerClaims(supabase, options, runId, assetIds) {
  if (!assetIds.length) return 0;

  let completed = 0;

  for (const assetIdChunk of chunk(assetIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase.rpc(
      "complete_materializer_asset_claims",
      {
        p_materializer_version: options.materializerVersion,
        p_asset_ids: assetIdChunk,
        p_run_id: runId,
      }
    );

    if (error) {
      throw new Error(`complete_materializer_asset_claims_failed: ${error.message}`);
    }

    completed += Number(data ?? 0);
  }

  return completed;
}

async function releaseMaterializerClaims(supabase, options, runId, assetIds, reason) {
  if (!assetIds.length) return 0;

  let released = 0;

  for (const assetIdChunk of chunk(assetIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase.rpc(
      "release_materializer_asset_claims",
      {
        p_materializer_version: options.materializerVersion,
        p_asset_ids: assetIdChunk,
        p_run_id: runId,
        p_reason: reason,
      }
    );

    if (error) {
      throw new Error(`release_materializer_asset_claims_failed: ${error.message}`);
    }

    released += Number(data ?? 0);
  }

  return released;
}

async function failMaterializerClaims(supabase, options, runId, assetIds, error) {
  if (!assetIds.length) return 0;

  let failed = 0;
  const message = error instanceof Error ? error.message : String(error);

  for (const assetIdChunk of chunk(assetIds, IN_CHUNK_SIZE)) {
    const { data, error: rpcError } = await supabase.rpc(
      "fail_materializer_asset_claims",
      {
        p_materializer_version: options.materializerVersion,
        p_asset_ids: assetIdChunk,
        p_run_id: runId,
        p_error: message,
        p_retry_after_minutes: options.claimRetryAfterMinutes,
      }
    );

    if (rpcError) {
      throw new Error(`fail_materializer_asset_claims_failed: ${rpcError.message}`);
    }

    failed += Number(data ?? 0);
  }

  return failed;
}

function buildContextRanges(pendingAssets, options) {
  const contextMinutes = Math.max(
    options.contextMinutes,
    options.windowMinutes * 2
  );
  const contextMs = contextMinutes * 60 * 1000;
  const byCamera = new Map();

  for (const asset of pendingAssets) {
    const anchor = assetAnchorIso(asset);
    const anchorMs = new Date(anchor).getTime();

    if (!Number.isFinite(anchorMs)) continue;

    const range = {
      camera_id: asset.camera_id,
      start_at: new Date(anchorMs - contextMs).toISOString(),
      end_at: new Date(anchorMs + contextMs).toISOString(),
    };

    const existing = byCamera.get(asset.camera_id) ?? [];
    existing.push(range);
    byCamera.set(asset.camera_id, existing);
  }

  const merged = [];

  for (const [cameraId, ranges] of byCamera.entries()) {
    ranges.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    let current = null;

    for (const range of ranges) {
      if (!current) {
        current = { ...range, camera_id: cameraId };
        continue;
      }

      if (new Date(range.start_at).getTime() <= new Date(current.end_at).getTime()) {
        if (new Date(range.end_at).getTime() > new Date(current.end_at).getTime()) {
          current.end_at = range.end_at;
        }
      } else {
        merged.push(current);
        current = { ...range, camera_id: cameraId };
      }
    }

    if (current) {
      merged.push(current);
    }
  }

  return merged;
}

async function fetchContextAssetsForRange(supabase, range) {
  const commonSelect =
    "id,camera_id,captured_at,created_at,relevant,relevant_user,empty,status,processed_at";

  const capturedRows = await fetchAll(
    () =>
      supabase
        .from("assets")
        .select(commonSelect)
        .eq("camera_id", range.camera_id)
        .eq("status", "processed")
        .eq("empty", false)
        .not("captured_at", "is", null)
        .gte("captured_at", range.start_at)
        .lte("captured_at", range.end_at)
        .order("captured_at", { ascending: true })
        .order("created_at", { ascending: true }),
    "context_assets_captured_at"
  );

  const createdRows = await fetchAll(
    () =>
      supabase
        .from("assets")
        .select(commonSelect)
        .eq("camera_id", range.camera_id)
        .eq("status", "processed")
        .eq("empty", false)
        .is("captured_at", null)
        .gte("created_at", range.start_at)
        .lte("created_at", range.end_at)
        .order("created_at", { ascending: true }),
    "context_assets_created_at"
  );

  return [...capturedRows, ...createdRows];
}

async function fetchContextAssets(supabase, pendingAssets, options) {
  const ranges = buildContextRanges(pendingAssets, options);
  const byId = new Map();

  for (const range of ranges) {
    const rows = await fetchContextAssetsForRange(supabase, range);

    for (const asset of rows) {
      if (!isRelevantEffective(asset)) continue;

      const anchor = assetAnchorIso(asset);
      if (!anchor) continue;

      byId.set(asset.id, {
        ...asset,
        anchor_at: anchor,
      });
    }

    if (byId.size > options.maxContextAssets) {
      throw new Error(
        `context_asset_limit_exceeded: ${byId.size} > ${options.maxContextAssets}. Reduce MATERIALIZER_MAX_PENDING_ASSETS or increase MATERIALIZER_MAX_CONTEXT_ASSETS deliberately.`
      );
    }
  }

  return {
    ranges,
    assets: [...byId.values()],
  };
}

async function fetchDetections(supabase, assetIds) {
  const rows = [];

  for (const assetChunk of chunk(assetIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("detections")
      .select("id,asset_id,label,species,species_user,score,meta")
      .in("asset_id", assetChunk)
      .eq("label", "animal");

    if (error) throw new Error(`detections_failed: ${error.message}`);

    rows.push(...(data ?? []));
  }

  return rows;
}

async function fetchLegacyEventAssets(supabase, assetIds) {
  const rows = [];

  for (const assetChunk of chunk(assetIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("event_assets")
      .select("event_id,asset_id")
      .in("asset_id", assetChunk);

    if (error) throw new Error(`event_assets_failed: ${error.message}`);

    rows.push(...(data ?? []));
  }

  return rows;
}

async function processPendingAssetBatch(supabase, pendingAssets, options) {
  const pendingAssetIds = new Set(pendingAssets.map((asset) => asset.id));

  const { ranges, assets } = await fetchContextAssets(
    supabase,
    pendingAssets,
    options
  );

  const assetIds = assets.map((asset) => asset.id);

  const detections = await fetchDetections(supabase, assetIds);
  const legacyEventAssets = await fetchLegacyEventAssets(supabase, assetIds);

  const detectionsByAsset = groupDetectionsByAsset(detections);
  const legacyEventsByAsset = groupLegacyEventsByAsset(legacyEventAssets);

  const observations = assets
    .map((asset) => buildImageObservation(asset, detectionsByAsset.get(asset.id) ?? []))
    .filter((observation) => {
      return observation.image_evidence.animal_detection_count > 0;
    });

  const now = new Date();
  const clusters = buildClusters(observations, options.windowMinutes, now).filter(
    (cluster) =>
      cluster.observations.some((observation) =>
        pendingAssetIds.has(observation.asset_id)
      )
  );

  const materializedEvents = clusters.map((cluster) => {
    const legacyEventIds = uniqueNonEmpty(
      cluster.observations.flatMap(
        (observation) => legacyEventsByAsset.get(observation.asset_id) ?? []
      ),
      100
    );

    const row = buildMaterializedEvent(cluster, legacyEventIds, options);

    return {
      row,
      observations: cluster.observations,
    };
  });

  const writeResults = [];

  if (options.execute) {
    for (const event of materializedEvents) {
      writeResults.push(
        await upsertMaterializedEvent(
          supabase,
          event.row,
          event.observations,
          options
        )
      );
    }
  }

  const materializedAssetIds = uniqueNonEmpty(
    materializedEvents.flatMap((event) =>
      event.observations.map((observation) => observation.asset_id)
    ),
    100000
  );

  const materializedClaimedAssetIds = materializedAssetIds.filter((assetId) =>
    pendingAssetIds.has(assetId)
  );

  const summaryRows = materializedEvents.slice(0, 50).map((event, index) => ({
    camera_id: event.row.camera_id,
    start_at: event.row.start_at,
    end_at: event.row.end_at,
    assets: event.row.asset_count,
    species: event.row.event_species_auto,
    score: Number(event.row.event_species_score.toFixed(4)),
    margin: event.row.event_species_margin === null
      ? null
      : Number(event.row.event_species_margin.toFixed(4)),
    animals: event.row.event_animal_count_auto,
    pending_assets: event.observations.filter((observation) =>
      pendingAssetIds.has(observation.asset_id)
    ).length,
    replaced_events: options.execute
      ? writeResults[index]?.replacedEventIds?.length ?? 0
      : 0,
    legacy_events: event.row.legacy_event_ids.length,
  }));

  const summary = {
    pending_assets: pendingAssets.length,
    context_ranges: ranges.length,
    context_assets: assets.length,
    animal_observations: observations.length,
    closed_clusters: clusters.length,
    materialized_events: materializedEvents.length,
    materialized_claimed_assets: materializedClaimedAssetIds.length,
    written: options.execute ? materializedEvents.length : 0,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (summaryRows.length) {
    console.table(summaryRows);
  }

  return {
    ...summary,
    materializedClaimedAssetIds,
  };
}

function groupDetectionsByAsset(detections) {
  const byAsset = new Map();

  for (const detection of detections) {
    const existing = byAsset.get(detection.asset_id) ?? [];
    existing.push(detection);
    byAsset.set(detection.asset_id, existing);
  }

  return byAsset;
}

function groupLegacyEventsByAsset(eventAssets) {
  const byAsset = new Map();

  for (const row of eventAssets) {
    const existing = byAsset.get(row.asset_id) ?? [];
    existing.push(row.event_id);
    byAsset.set(row.asset_id, existing);
  }

  return byAsset;
}

async function createRun(supabase, options) {
  if (!options.execute) return null;

  const { data, error } = await supabase
    .from("event_materializer_runs")
    .insert({
      materializer_version: options.materializerVersion,
      mode: "shadow",
      status: "running",
    })
    .select("id")
    .single();

  if (error) throw new Error(`event_materializer_runs_insert_failed: ${error.message}`);

  return data.id;
}

async function finishRun(supabase, runId, patch) {
  if (!runId) return;

  const { error } = await supabase
    .from("event_materializer_runs")
    .update({
      ...patch,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) throw new Error(`event_materializer_runs_update_failed: ${error.message}`);
}

async function fetchOverlappingMaterializedEvents(supabase, materializedEvent, options) {
  const { data, error } = await supabase
    .from("materialized_events")
    .select("id,start_at,end_at,event_species_user,event_animal_count_user,event_relevant_user")
    .eq("camera_id", materializedEvent.camera_id)
    .eq("materializer_version", options.materializerVersion)
    .lte("start_at", materializedEvent.end_at)
    .gte("end_at", materializedEvent.start_at);

  if (error) {
    throw new Error(`materialized_events_overlap_failed: ${error.message}`);
  }

  return data ?? [];
}

function consistentNonNullValue(rows, key) {
  const values = uniqueNonEmpty(
    rows
      .map((row) => row[key])
      .filter((value) => value !== null && value !== undefined),
    20
  );

  if (values.length !== 1) return undefined;

  const raw = values[0];

  if (key === "event_animal_count_user") {
    const numeric = Number(raw);
    return Number.isInteger(numeric) ? numeric : undefined;
  }

  if (key === "event_relevant_user") {
    if (raw === "true" || raw === true) return true;
    if (raw === "false" || raw === false) return false;
    return undefined;
  }

  return raw;
}

function preserveUserOverrides(materializedEvent, overlappingEvents) {
  const patch = {};

  const speciesUser = consistentNonNullValue(
    overlappingEvents,
    "event_species_user"
  );
  const animalCountUser = consistentNonNullValue(
    overlappingEvents,
    "event_animal_count_user"
  );
  const relevantUser = consistentNonNullValue(
    overlappingEvents,
    "event_relevant_user"
  );

  if (speciesUser !== undefined) patch.event_species_user = speciesUser;
  if (animalCountUser !== undefined) patch.event_animal_count_user = animalCountUser;
  if (relevantUser !== undefined) patch.event_relevant_user = relevantUser;

  return {
    ...materializedEvent,
    ...patch,
  };
}

async function deleteMaterializedEvents(supabase, materializedEventIds) {
  if (!materializedEventIds.length) return;

  for (const eventIdChunk of chunk(materializedEventIds, 500)) {
    const { error: deleteLinksError } = await supabase
      .from("materialized_event_assets")
      .delete()
      .in("materialized_event_id", eventIdChunk);

    if (deleteLinksError) {
      throw new Error(`materialized_event_assets_delete_overlap_failed: ${deleteLinksError.message}`);
    }

    const { error: deleteEventsError } = await supabase
      .from("materialized_events")
      .delete()
      .in("id", eventIdChunk);

    if (deleteEventsError) {
      throw new Error(`materialized_events_delete_overlap_failed: ${deleteEventsError.message}`);
    }
  }
}

async function upsertMaterializedEvent(supabase, materializedEvent, observations, options) {
  const overlappingEvents = await fetchOverlappingMaterializedEvents(
    supabase,
    materializedEvent,
    options
  );
  const overlapIds = overlappingEvents.map((event) => event.id);
  const row = preserveUserOverrides(materializedEvent, overlappingEvents);

  await deleteMaterializedEvents(supabase, overlapIds);

  const { data, error } = await supabase
    .from("materialized_events")
    .upsert(row, {
      onConflict: "camera_id,start_at,end_at,materializer_version",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`materialized_events_upsert_failed: ${error.message}`);
  }

  const materializedEventId = data.id;

  const rows = observations.map((observation) => ({
    materialized_event_id: materializedEventId,
    asset_id: observation.asset_id,
    asset_captured_at: toIso(observation.asset_captured_at),
    image_species_used: observation.image_species_used,
    image_species_score: observation.image_species_score,
    image_animal_count: observation.image_animal_count,
    image_pick_reason: observation.image_pick_reason,
    image_evidence: observation.image_evidence,
  }));

  for (const rowChunk of chunk(rows, 500)) {
    const { error: insertError } = await supabase
      .from("materialized_event_assets")
      .insert(rowChunk);

    if (insertError) {
      throw new Error(`materialized_event_assets_insert_failed: ${insertError.message}`);
    }
  }

  return {
    materializedEventId,
    replacedEventIds: overlapIds,
  };
}

async function main() {
  const execute = argSet.has("--execute");
  const dryRun = !execute;

  const orgSlugsArg = argValue("--org-slugs");

  const scopeMode = normalizeScopeMode(
    argValue("--scope") ||
      process.env.MATERIALIZER_SCOPE ||
      "dynamic"
  );

  const excludedOrgSlugs = uniqueNonEmpty(
    parseCsv(
      argValue("--exclude-org-slugs") ||
        process.env.MATERIALIZER_EXCLUDED_ORG_SLUGS ||
        "demo"
    ),
    1000
  );

  const configuredOrgSlugs = uniqueNonEmpty(
    parseCsv(orgSlugsArg || process.env.MATERIALIZER_ORG_SLUGS || ""),
    1000
  );

  const useExplicitOrgScope = scopeMode === "explicit" || orgSlugsArg !== null;

  if (useExplicitOrgScope && configuredOrgSlugs.length === 0) {
    throw new Error("Explicit materializer scope selected but no org slugs were provided.");
  }

  const materializerVersion =
    argValue("--version") ||
    process.env.MATERIALIZER_VERSION ||
    "event-materializer-v1";

  const windowMinutes = parseInteger(
    argValue("--window-minutes") || process.env.MATERIALIZER_WINDOW_MINUTES,
    20
  );

  const contextMinutes = parseInteger(
    argValue("--context-minutes") || process.env.MATERIALIZER_CONTEXT_MINUTES,
    DEFAULT_CONTEXT_MINUTES
  );

  const claimBatchSize = parseInteger(
    argValue("--claim-batch-size") ||
      argValue("--max-pending-assets") ||
      argValue("--max-assets") ||
      process.env.MATERIALIZER_CLAIM_BATCH_SIZE ||
      process.env.MATERIALIZER_MAX_PENDING_ASSETS ||
      process.env.MATERIALIZER_MAX_ASSETS,
    DEFAULT_CLAIM_BATCH_SIZE
  );

  const claimLeaseMinutes = parseInteger(
    argValue("--claim-lease-minutes") ||
      process.env.MATERIALIZER_CLAIM_LEASE_MINUTES,
    DEFAULT_CLAIM_LEASE_MINUTES
  );

  const claimRetryAfterMinutes = parseInteger(
    argValue("--claim-retry-after-minutes") ||
      process.env.MATERIALIZER_CLAIM_RETRY_AFTER_MINUTES,
    DEFAULT_CLAIM_RETRY_AFTER_MINUTES
  );

  const maxContextAssets = parseInteger(
    argValue("--max-context-assets") ||
      process.env.MATERIALIZER_MAX_CONTEXT_ASSETS,
    DEFAULT_MAX_CONTEXT_ASSETS
  );

  const sinceIso = parseDateArg(
    argValue("--since") || process.env.MATERIALIZER_SINCE || null
  );

  const claimedBy =
    argValue("--claimed-by") ||
    process.env.MATERIALIZER_INSTANCE_ID ||
    `${os.hostname()}:${process.pid}`;

  const supabase = buildSupabaseClient();
  let runId = null;

  try {
    const organizations = useExplicitOrgScope
      ? await fetchOrganizations(supabase, configuredOrgSlugs, excludedOrgSlugs)
      : await fetchMaterializerOrganizations(supabase, excludedOrgSlugs);

    if (organizations.length === 0) {
      throw new Error("No organizations found for event materializer scope.");
    }

    if (useExplicitOrgScope && organizations.length !== configuredOrgSlugs.length) {
      const found = new Set(organizations.map((org) => org.slug));
      const missing = configuredOrgSlugs.filter((slug) => !found.has(slug));
      throw new Error(`Missing organizations for slugs: ${missing.join(", ")}`);
    }

    const orgSlugs = organizations.map((org) => org.slug);

    const options = {
      execute,
      dryRun,
      orgSlugs,
      scopeMode: useExplicitOrgScope ? "explicit" : "dynamic",
      configuredOrgSlugs: useExplicitOrgScope ? configuredOrgSlugs : [],
      excludedOrgSlugs,
      materializerVersion,
      windowMinutes,
      contextMinutes,
      claimBatchSize,
      claimLeaseMinutes,
      claimRetryAfterMinutes,
      maxContextAssets,
      sinceIso,
      claimedBy,
    };

    runId = await createRun(supabase, options);

    console.log(
      JSON.stringify(
        {
          tool: "event-materializer",
          mode: execute ? "shadow_execute" : "dry_run",
          scanMode: execute ? "claiming" : "claiming_preview",
          scopeMode: options.scopeMode,
          configuredOrgSlugs: useExplicitOrgScope ? configuredOrgSlugs : null,
          excludedOrgSlugs,
          resolvedOrgSlugs: orgSlugs,
          organizationCount: organizations.length,
          materializerVersion,
          windowMinutes,
          contextMinutes,
          claimBatchSize,
          claimLeaseMinutes,
          claimRetryAfterMinutes,
          maxContextAssets,
          sinceIso,
          claimedBy,
        },
        null,
        2
      )
    );

    const totals = {
      claim_batches: 0,
      claimed_assets: 0,
      completed_claims: 0,
      released_claims: 0,
      context_ranges: 0,
      context_assets: 0,
      animal_observations: 0,
      closed_clusters: 0,
      materialized_events: 0,
      materialized_claimed_assets: 0,
      written: 0,
    };

    while (true) {
      const pendingAssets = execute
        ? await claimMaterializerPendingAssets(supabase, options, runId)
        : await fetchPendingAssetsPreview(supabase, options);

      if (pendingAssets.length === 0) {
        break;
      }

      totals.claim_batches += 1;
      totals.claimed_assets += pendingAssets.length;

      const pendingAssetIds = pendingAssets.map((asset) => asset.id);

      try {
        const batchResult = await processPendingAssetBatch(
          supabase,
          pendingAssets,
          options
        );

        totals.context_ranges += batchResult.context_ranges;
        totals.context_assets += batchResult.context_assets;
        totals.animal_observations += batchResult.animal_observations;
        totals.closed_clusters += batchResult.closed_clusters;
        totals.materialized_events += batchResult.materialized_events;
        totals.materialized_claimed_assets += batchResult.materialized_claimed_assets;
        totals.written += batchResult.written;

        if (execute) {
          const completedIds = batchResult.materializedClaimedAssetIds;
          const completedSet = new Set(completedIds);
          const releasedIds = pendingAssetIds.filter((assetId) => !completedSet.has(assetId));

          totals.completed_claims += await completeMaterializerClaims(
            supabase,
            options,
            runId,
            completedIds
          );

          totals.released_claims += await releaseMaterializerClaims(
            supabase,
            options,
            runId,
            releasedIds,
            "no_closed_materialized_cluster_in_batch"
          );

          if (completedIds.length === 0 && releasedIds.length > 0) {
            console.warn(
              JSON.stringify(
                {
                  warning: "claimed assets produced no closed materialized cluster; released claims and stopped this run to avoid hot-looping",
                  released_claims: releasedIds.length,
                },
                null,
                2
              )
            );
            break;
          }
        } else {
          break;
        }
      } catch (error) {
        if (execute) {
          await failMaterializerClaims(supabase, options, runId, pendingAssetIds, error);
        }

        throw error;
      }
    }

    console.log(JSON.stringify(totals, null, 2));

    await finishRun(supabase, runId, {
      status: "success",
      scanned_assets: totals.context_assets,
      materialized_events: totals.written,
    });
  } catch (error) {
    await finishRun(supabase, runId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
