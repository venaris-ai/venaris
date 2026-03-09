import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SEED_REVIER_NAME = "Seed Revier Intelligence";
const SEED_REGION = "NRW";
const SEED_AREA_HA = 450;

const DAYS_BACK = 365;
const EVENTS_PER_CAMERA = 260; // 5 cams -> ~1300 events
const MAX_ASSETS_PER_EVENT = 4;
const RESET = process.argv.includes("--reset");

const SPECIES = [
  "roe_deer",
  "wild_boar",
  "red_deer",
  "fallow_deer",
  "mouflon",
  "fox",
  "wolf",
  "badger",
  "raccoon",
  "raccoon_dog",
  "hare",
  "rabbit",
  "pheasant",
  "crow",
  "other",
];

const CAMERA_PROFILES = [
  {
    name: "Seed Camera 1",
    location_name: "Kirrung Wald",
    import_method: "seed",
    baseWeights: {
      wild_boar: 32,
      fox: 14,
      badger: 12,
      roe_deer: 18,
      raccoon: 6,
      raccoon_dog: 5,
      crow: 2,
      pheasant: 1,
      red_deer: 3,
      fallow_deer: 2,
      hare: 2,
      rabbit: 1,
      wolf: 1,
      mouflon: 0.5,
      other: 1.5,
    },
  },
  {
    name: "Seed Camera 2",
    location_name: "Waldkante Wechsel",
    import_method: "seed",
    baseWeights: {
      roe_deer: 34,
      wild_boar: 18,
      fox: 12,
      badger: 8,
      red_deer: 7,
      fallow_deer: 5,
      hare: 4,
      pheasant: 3,
      crow: 2,
      rabbit: 2,
      raccoon: 2,
      raccoon_dog: 1.5,
      wolf: 0.8,
      mouflon: 0.5,
      other: 1.2,
    },
  },
  {
    name: "Seed Camera 3",
    location_name: "Feldrand",
    import_method: "seed",
    baseWeights: {
      roe_deer: 28,
      hare: 14,
      pheasant: 12,
      fox: 10,
      crow: 8,
      rabbit: 7,
      wild_boar: 8,
      badger: 3,
      red_deer: 2,
      fallow_deer: 2,
      raccoon: 1,
      raccoon_dog: 1,
      wolf: 0.5,
      mouflon: 0.2,
      other: 3.3,
    },
  },
  {
    name: "Seed Camera 4",
    location_name: "Dichter Wald",
    import_method: "seed",
    baseWeights: {
      red_deer: 18,
      fallow_deer: 16,
      roe_deer: 18,
      wild_boar: 14,
      badger: 8,
      fox: 6,
      wolf: 2.2,
      mouflon: 2,
      raccoon: 2,
      raccoon_dog: 2,
      hare: 1,
      pheasant: 1,
      crow: 1,
      rabbit: 1,
      other: 2.8,
    },
  },
  {
    name: "Seed Camera 5",
    location_name: "Offenfläche / Störung",
    import_method: "seed",
    baseWeights: {
      roe_deer: 18,
      crow: 12,
      rabbit: 10,
      fox: 9,
      hare: 9,
      pheasant: 7,
      wild_boar: 7,
      badger: 4,
      raccoon: 4,
      raccoon_dog: 3,
      red_deer: 3,
      fallow_deer: 3,
      wolf: 0.5,
      mouflon: 0.3,
      other: 9.2,
    },
  },
];

function uuid() {
  return crypto.randomUUID();
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function chance(p) {
  return Math.random() < p;
}

function hash12() {
  return crypto.randomBytes(6).toString("hex");
}

function chooseWeighted(weightsObj) {
  const entries = Object.entries(weightsObj).filter(([, w]) => Number(w) > 0);
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  let r = Math.random() * total;
  for (const [key, weight] of entries) {
    r -= Number(weight);
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function normalish(mean, spread = 1) {
  return mean + (Math.random() - 0.5) * spread * 2;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function toIso(dt) {
  return dt.toISOString();
}

function addMinutes(dt, minutes) {
  return new Date(dt.getTime() + minutes * 60_000);
}

function addSeconds(dt, seconds) {
  return new Date(dt.getTime() + seconds * 1_000);
}

function startOfDay(dt) {
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0));
}

function withHour(dayUtc, hourDecimal) {
  const h = Math.floor(hourDecimal);
  const m = Math.floor((hourDecimal - h) * 60);
  const s = randInt(0, 59);
  return new Date(Date.UTC(dayUtc.getUTCFullYear(), dayUtc.getUTCMonth(), dayUtc.getUTCDate(), h, m, s));
}

// species-specific hour preferences, returned as UTC hour candidates.
// Good enough for synthetic data; UI later uses Europe/Berlin extraction.
function sampleHourForSpecies(species) {
  switch (species) {
    case "wild_boar":
      return chance(0.65) ? rand(20, 23.95) : rand(0, 4.5);
    case "badger":
      return chance(0.6) ? rand(21, 23.95) : rand(0, 4.5);
    case "fox":
      return chance(0.5) ? rand(18, 23.95) : rand(0, 5.5);
    case "wolf":
      return chance(0.6) ? rand(19, 23.95) : rand(0, 6.0);
    case "roe_deer":
      return chance(0.5) ? rand(5, 9.5) : rand(17, 21.5);
    case "red_deer":
    case "fallow_deer":
    case "mouflon":
      return chance(0.45) ? rand(5, 8.5) : rand(18, 23.0);
    case "hare":
    case "rabbit":
      return chance(0.45) ? rand(19, 23.95) : rand(0, 6.0);
    case "pheasant":
      return chance(0.55) ? rand(6, 10.5) : rand(15, 19);
    case "crow":
      return rand(7, 17.5);
    case "raccoon":
    case "raccoon_dog":
      return chance(0.55) ? rand(20, 23.95) : rand(0, 5.0);
    case "other":
    default:
      return rand(6, 22);
  }
}

function groupSizeForSpecies(species) {
  switch (species) {
    case "wild_boar":
      return chooseWeighted({
        1: 6,
        2: 10,
        3: 12,
        4: 12,
        5: 10,
        6: 8,
        7: 6,
        8: 4,
      });
    case "roe_deer":
      return chooseWeighted({ 1: 12, 2: 10, 3: 6, 4: 2 });
    case "red_deer":
    case "fallow_deer":
      return chooseWeighted({ 1: 6, 2: 8, 3: 8, 4: 6, 5: 4, 6: 3 });
    case "mouflon":
      return chooseWeighted({ 1: 5, 2: 5, 3: 3, 4: 2 });
    case "fox":
    case "wolf":
      return chooseWeighted({ 1: 14, 2: 3, 3: 1 });
    case "badger":
      return chooseWeighted({ 1: 9, 2: 4, 3: 2, 4: 1 });
    case "hare":
    case "rabbit":
      return chooseWeighted({ 1: 10, 2: 5, 3: 3, 4: 1 });
    case "pheasant":
    case "crow":
      return chooseWeighted({ 1: 8, 2: 5, 3: 4, 4: 2, 5: 1 });
    case "raccoon":
    case "raccoon_dog":
      return chooseWeighted({ 1: 8, 2: 4, 3: 2 });
    case "other":
    default:
      return chooseWeighted({ 1: 9, 2: 3, 3: 1 });
  }
}

function scoreForSpecies(species) {
  const base = {
    roe_deer: 0.93,
    wild_boar: 0.93,
    red_deer: 0.9,
    fallow_deer: 0.9,
    mouflon: 0.87,
    fox: 0.94,
    wolf: 0.95,
    badger: 0.9,
    raccoon: 0.84,
    raccoon_dog: 0.84,
    hare: 0.82,
    rabbit: 0.8,
    pheasant: 0.78,
    crow: 0.72,
    other: 0.68,
  }[species] ?? 0.8;

  return Number(clamp(normalish(base, 0.06), 0.22, 0.99).toFixed(3));
}

function buildDummyStoragePath(cameraId, assetId) {
  return `${cameraId}/seed-${assetId}-${hash12()}.jpg`;
}

function randomDateInLastYearWithSpecies(species) {
  const now = new Date();
  const offsetDays = randInt(0, DAYS_BACK - 1);
  const day = startOfDay(new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000));
  const hour = sampleHourForSpecies(species);
  return withHour(day, hour);
}

function chooseAssetCountForEvent() {
  return chooseWeighted({ 1: 12, 2: 10, 3: 6, 4: 2 });
}

function maybeSeasonalMultiplier(species, monthIdx) {
  // Very light seasonality. monthIdx: 0..11
  switch (species) {
    case "wild_boar":
      return [1.0, 1.0, 0.95, 0.95, 0.9, 0.9, 0.85, 0.85, 0.95, 1.05, 1.1, 1.1][monthIdx];
    case "roe_deer":
      return [0.95, 0.95, 1.0, 1.05, 1.1, 1.1, 1.0, 0.95, 0.95, 1.0, 1.0, 0.95][monthIdx];
    case "fox":
      return [1.1, 1.05, 1.0, 0.95, 0.95, 0.9, 0.9, 0.9, 0.95, 1.0, 1.05, 1.1][monthIdx];
    case "badger":
      return [1.05, 1.0, 0.95, 0.9, 0.9, 0.85, 0.85, 0.85, 0.9, 0.95, 1.0, 1.05][monthIdx];
    default:
      return 1.0;
  }
}

function speciesWeightsForDate(cameraProfile, dt) {
  const monthIdx = dt.getUTCMonth();
  const adjusted = {};
  for (const [species, w] of Object.entries(cameraProfile.baseWeights)) {
    adjusted[species] = Number(w) * maybeSeasonalMultiplier(species, monthIdx);
  }
  return adjusted;
}

async function fetchMaybeSingle(table, filterKey, filterValue, columns = "*") {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq(filterKey, filterValue)
    .limit(1);

  if (error) throw new Error(`${table}_fetch_failed: ${error.message}`);
  return data?.[0] ?? null;
}

async function ensureSeedRevier() {
  const existing = await fetchMaybeSingle("reviers", "name", SEED_REVIER_NAME, "id,name");
  if (existing) return existing;

  const row = {
    id: uuid(),
    name: SEED_REVIER_NAME,
    area_ha: SEED_AREA_HA,
    region: SEED_REGION,
    created_at: toIso(new Date()),
  };

  const { data, error } = await supabase.from("reviers").insert(row).select("id,name").single();
  if (error) throw new Error(`reviers_insert_failed: ${error.message}`);
  return data;
}

async function ensureSeedCameras(revierId) {
  const result = [];

  for (let i = 0; i < CAMERA_PROFILES.length; i++) {
    const profile = CAMERA_PROFILES[i];
    const existing = await fetchMaybeSingle("cameras", "name", profile.name, "id,name,location_name,revier_id");

    if (existing) {
      result.push({ ...profile, id: existing.id });
      continue;
    }

    const row = {
      id: uuid(),
      revier_id: revierId,
      name: profile.name,
      location_name: profile.location_name,
      import_method: profile.import_method,
      ingest_token: `seed-token-${i + 1}`,
      created_at: toIso(new Date()),
      last_seen_at: toIso(new Date()),
    };

    const { data, error } = await supabase.from("cameras").insert(row).select("id,name").single();
    if (error) throw new Error(`cameras_insert_failed(${profile.name}): ${error.message}`);

    result.push({ ...profile, id: data.id });
  }

  return result;
}

async function resetSeedData() {
  console.log("Resetting old seed data...");

  const { data: seedCameras, error: camErr } = await supabase
    .from("cameras")
    .select("id,name")
    .in("name", CAMERA_PROFILES.map((c) => c.name));

  if (camErr) throw new Error(`seed_camera_fetch_failed: ${camErr.message}`);

  const cameraIds = (seedCameras ?? []).map((c) => c.id);
  if (!cameraIds.length) {
    console.log("No seed cameras found. Nothing to reset.");
    return;
  }

  const { data: seedEvents, error: evErr } = await supabase
    .from("events")
    .select("id,camera_id")
    .in("camera_id", cameraIds);

  if (evErr) throw new Error(`seed_events_fetch_failed: ${evErr.message}`);

  const eventIds = (seedEvents ?? []).map((e) => e.id);

  const { data: seedAssets, error: assetErr } = await supabase
    .from("assets")
    .select("id,camera_id")
    .in("camera_id", cameraIds);

  if (assetErr) throw new Error(`seed_assets_fetch_failed: ${assetErr.message}`);

  const assetIds = (seedAssets ?? []).map((a) => a.id);

  if (eventIds.length) {
    const { error } = await supabase.from("event_assets").delete().in("event_id", eventIds);
    if (error) throw new Error(`event_assets_delete_failed: ${error.message}`);
  }

  if (eventIds.length) {
    const { error } = await supabase.from("events").delete().in("id", eventIds);
    if (error) throw new Error(`events_delete_failed: ${error.message}`);
  }

  if (assetIds.length) {
    const { error } = await supabase.from("detections").delete().in("asset_id", assetIds);
    if (error) throw new Error(`detections_delete_failed: ${error.message}`);
  }

  if (assetIds.length) {
    const { error } = await supabase.from("assets").delete().in("id", assetIds);
    if (error) throw new Error(`assets_delete_failed: ${error.message}`);
  }

  const { error: camDeleteErr } = await supabase.from("cameras").delete().in("id", cameraIds);
  if (camDeleteErr) throw new Error(`cameras_delete_failed: ${camDeleteErr.message}`);

  const existingRevier = await fetchMaybeSingle("reviers", "name", SEED_REVIER_NAME, "id,name");
  if (existingRevier) {
    const { error: revDeleteErr } = await supabase.from("reviers").delete().eq("id", existingRevier.id);
    if (revDeleteErr) {
      console.warn(`Could not delete seed revier: ${revDeleteErr.message}`);
    }
  }

  console.log("Reset complete.");
}

async function insertChunked(table, rows, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      throw new Error(`${table}_insert_failed at chunk ${i / chunkSize}: ${error.message}`);
    }
  }
}

async function rpcUpdateEventAggregation(eventId) {
  const { error } = await supabase.rpc("update_event_aggregation", { p_event_id: eventId });
  if (error) throw new Error(`update_event_aggregation_failed(${eventId}): ${error.message}`);
}

async function seed() {
  console.log("Starting intelligence seed...");
  if (RESET) {
    await resetSeedData();
  }

  const revier = await ensureSeedRevier();
  const cameras = await ensureSeedCameras(revier.id);

  const assets = [];
  const detections = [];
  const events = [];
  const eventAssets = [];

  let totalWildlifeDetections = 0;

  for (const camera of cameras) {
    console.log(`Generating events for ${camera.name}...`);

    for (let i = 0; i < EVENTS_PER_CAMERA; i++) {
      const provisionalDate = randomDateInLastYearWithSpecies("roe_deer");
      const species = chooseWeighted(speciesWeightsForDate(camera, provisionalDate));
      const eventStart = randomDateInLastYearWithSpecies(species);

      const eventId = uuid();
      const eventCreatedAt = toIso(new Date());

      events.push({
        id: eventId,
        camera_id: camera.id,
        start_at: toIso(eventStart),
        end_at: toIso(eventStart),
        top_label: null,
        top_species: null,
        top_count: null,
        relevance_score: 0,
        created_at: eventCreatedAt,
      });

      const trueGroupSize = Number(groupSizeForSpecies(species));
      const assetCount = Number(chooseAssetCountForEvent());

      let maxEventTime = new Date(eventStart);

      for (let a = 0; a < assetCount; a++) {
        const assetId = uuid();

        // One asset in event will show the full group size; others partial/noisy but <= full size.
        const assetAnimalCount =
          a === 0
            ? trueGroupSize
            : clamp(randInt(Math.max(1, trueGroupSize - 2), trueGroupSize), 1, trueGroupSize);

        const assetTime = addSeconds(eventStart, randInt(a * 8, a * 35 + 10));
        if (assetTime > maxEventTime) maxEventTime = assetTime;

        assets.push({
          id: assetId,
          camera_id: camera.id,
          captured_at: toIso(assetTime),
          storage_path: buildDummyStoragePath(camera.id, assetId),
          file_hash: `seed-${assetId}-${hash12()}`,
          status: "processed",
          created_at: toIso(assetTime),
          relevant: true,
          ingest_batch_id: null,
          attempts: 1,
          processing_started_at: toIso(assetTime),
          processed_at: toIso(assetTime),
          last_error: null,
          worker_id: "seed",
          empty: false,
          empty_confidence: 0,
        });

        eventAssets.push({
          event_id: eventId,
          asset_id: assetId,
        });

        for (let mdIdx = 0; mdIdx < assetAnimalCount; mdIdx++) {
          detections.push({
            id: uuid(),
            asset_id: assetId,
            label: "animal",
            species,
            count: null,
            score: scoreForSpecies(species),
            meta: {
              model: "seed_v1",
              md_idx: mdIdx,
              seed: true,
              source: "intelligence_seed",
            },
            created_at: toIso(assetTime),
          });
          totalWildlifeDetections++;
        }
      }

      // update end_at to last asset time
      events[events.length - 1].end_at = toIso(maxEventTime);
    }
  }

  console.log(`Prepared:
  reviers: 1
  cameras: ${cameras.length}
  events: ${events.length}
  assets: ${assets.length}
  detections: ${detections.length}
  event_assets: ${eventAssets.length}
  `);

  await insertChunked("events", events, 400);
  await insertChunked("assets", assets, 500);
  await insertChunked("detections", detections, 1000);
  await insertChunked("event_assets", eventAssets, 1000);

  console.log("Inserted base seed rows. Updating event aggregations...");

  for (let i = 0; i < events.length; i++) {
    await rpcUpdateEventAggregation(events[i].id);
    if ((i + 1) % 100 === 0) {
      console.log(`  Aggregated ${i + 1}/${events.length} events...`);
    }
  }

  console.log("Seed complete.");
  console.log({
    revier: revier.name,
    cameras: cameras.length,
    events: events.length,
    assets: assets.length,
    detections: detections.length,
    wildlife_detections: totalWildlifeDetections,
  });
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});