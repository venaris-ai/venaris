// scripts/cleanup-empty-assets-last-24h.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TARGET_EMAIL = process.env.CLEANUP_EMAIL || "laurent@hbw.com";
const HOURS = Number(process.env.CLEANUP_HOURS || "24");
const BUCKET = process.env.CLEANUP_BUCKET || "camera-assets";
const EXECUTE = process.argv.includes("--execute");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env vars: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function main() {
  console.log("Cleanup empty assets");
  console.log({
    targetEmail: TARGET_EMAIL,
    hours: HOURS,
    bucket: BUCKET,
    execute: EXECUTE,
  });

  const sinceIso = new Date(Date.now() - HOURS * 60 * 60 * 1000).toISOString();

  const { data: users, error: userError } = await supabase.auth.admin.listUsers();

  if (userError) {
    throw new Error(`user_lookup_failed: ${userError.message}`);
  }

  const user = users.users.find(
    (row) => String(row.email || "").toLowerCase() === TARGET_EMAIL.toLowerCase()
  );

  if (!user?.id) {
    throw new Error(`user_not_found: ${TARGET_EMAIL}`);
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id,status,role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    throw new Error(`membership_lookup_failed: ${membershipError.message}`);
  }

  const organizationIds = uniq((memberships || []).map((row) => row.organization_id));

  if (organizationIds.length === 0) {
    throw new Error(`no_active_organizations_for_user: ${TARGET_EMAIL}`);
  }

  const { data: cameras, error: cameraError } = await supabase
    .from("cameras")
    .select("id,name,organization_id")
    .in("organization_id", organizationIds);

  if (cameraError) {
    throw new Error(`camera_lookup_failed: ${cameraError.message}`);
  }

  const cameraIds = uniq((cameras || []).map((row) => row.id));

  if (cameraIds.length === 0) {
    console.log("No cameras in active organizations. Nothing to clean.");
    return;
  }

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id,camera_id,storage_path,created_at,captured_at,empty,empty_confidence,relevant")
    .in("camera_id", cameraIds)
    .eq("empty", true)
    .gte("created_at", sinceIso)
    .not("storage_path", "is", null)
    .order("created_at", { ascending: true });

  if (assetsError) {
    throw new Error(`assets_lookup_failed: ${assetsError.message}`);
  }

  const targetAssets = assets || [];
  const assetIds = targetAssets.map((asset) => asset.id);
  const storagePaths = uniq(targetAssets.map((asset) => asset.storage_path));

  console.log({
    targetAssets: targetAssets.length,
    storagePaths: storagePaths.length,
    sinceIso,
  });

  if (targetAssets.length === 0) {
    console.log("Nothing to clean.");
    return;
  }

  const { data: eventLinks, error: eventLinksError } = await supabase
    .from("event_assets")
    .select("event_id,asset_id")
    .in("asset_id", assetIds);

  if (eventLinksError) {
    throw new Error(`event_links_lookup_failed: ${eventLinksError.message}`);
  }

  const affectedEventIds = uniq((eventLinks || []).map((row) => row.event_id));

  console.log({
    linkedEventAssets: eventLinks?.length || 0,
    affectedEvents: affectedEventIds.length,
  });

  if (!EXECUTE) {
    console.log("Dry run only. Re-run with --execute to delete.");
    console.log("First 10 storage paths:");
    console.log(storagePaths.slice(0, 10));
    return;
  }

  console.log("Deleting storage objects...");

  for (let i = 0; i < storagePaths.length; i += 100) {
    const chunk = storagePaths.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(chunk);

    if (error) {
      throw new Error(`storage_delete_failed: ${error.message}`);
    }

    console.log(`Deleted storage objects ${i + 1}-${i + chunk.length}/${storagePaths.length}`);
  }

  console.log("Deleting detections...");

  for (let i = 0; i < assetIds.length; i += 500) {
    const chunk = assetIds.slice(i, i + 500);
    const { error } = await supabase.from("detections").delete().in("asset_id", chunk);

    if (error) {
      throw new Error(`detections_delete_failed: ${error.message}`);
    }
  }

  console.log("Deleting event_assets...");

  for (let i = 0; i < assetIds.length; i += 500) {
    const chunk = assetIds.slice(i, i + 500);
    const { error } = await supabase.from("event_assets").delete().in("asset_id", chunk);

    if (error) {
      throw new Error(`event_assets_delete_failed: ${error.message}`);
    }
  }

  console.log("Deleting assets...");

  for (let i = 0; i < assetIds.length; i += 500) {
    const chunk = assetIds.slice(i, i + 500);
    const { error } = await supabase.from("assets").delete().in("id", chunk);

    if (error) {
      throw new Error(`assets_delete_failed: ${error.message}`);
    }
  }

  console.log("Repairing affected events...");

  let deletedEvents = 0;
  let updatedEvents = 0;

  for (const eventId of affectedEventIds) {
    const { data: remainingLinks, error: remainingLinksError } = await supabase
      .from("event_assets")
      .select("asset_id")
      .eq("event_id", eventId);

    if (remainingLinksError) {
      throw new Error(`remaining_links_lookup_failed:${eventId}:${remainingLinksError.message}`);
    }

    const remainingAssetIds = (remainingLinks || []).map((row) => row.asset_id).filter(Boolean);

    if (remainingAssetIds.length === 0) {
      const { error: deleteEventError } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (deleteEventError) {
        throw new Error(`event_delete_failed:${eventId}:${deleteEventError.message}`);
      }

      deletedEvents++;
      continue;
    }

    const { data: remainingAssets, error: remainingAssetsError } = await supabase
      .from("assets")
      .select("id,captured_at,created_at")
      .in("id", remainingAssetIds);

    if (remainingAssetsError) {
      throw new Error(`remaining_assets_lookup_failed:${eventId}:${remainingAssetsError.message}`);
    }

    const times = (remainingAssets || [])
      .map((asset) => asset.captured_at || asset.created_at)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (times.length === 0) {
      continue;
    }

    const startAt = new Date(times[0]).toISOString();
    const endAt = new Date(times[times.length - 1]).toISOString();

    const { error: eventUpdateError } = await supabase
      .from("events")
      .update({
        start_at: startAt,
        end_at: endAt,
      })
      .eq("id", eventId);

    if (eventUpdateError) {
      throw new Error(`event_time_update_failed:${eventId}:${eventUpdateError.message}`);
    }

    const { error: aggregationError } = await supabase.rpc("update_event_aggregation", {
      p_event_id: eventId,
    });

    if (aggregationError) {
      throw new Error(`event_aggregation_failed:${eventId}:${aggregationError.message}`);
    }

    updatedEvents++;
  }

  console.log("Cleanup completed.");
  console.log({
    deletedAssets: assetIds.length,
    deletedStorageObjects: storagePaths.length,
    affectedEvents: affectedEventIds.length,
    deletedEvents,
    updatedEvents,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});