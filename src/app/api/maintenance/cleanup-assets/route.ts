// src/app/api/maintenance/cleanup-assets/route.ts #1
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const STORAGE_BUCKET = "camera-assets";
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

type CleanupAssetRow = {
  id: string;
  storage_path: string;
  storage_delete_after: string | null;
  storage_delete_reason: string | null;
  camera_id: string;
};

function parseBatchSize(req: NextRequest) {
  const rawLimit = req.nextUrl.searchParams.get("limit");
  if (!rawLimit) return DEFAULT_BATCH_SIZE;

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;

  return Math.min(parsed, MAX_BATCH_SIZE);
}

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function handleCleanup(req: NextRequest) {
  if (!isAuthorized(req)) {
    return jsonError("unauthorized", 401);
  }

  const supabase = supabaseServer();
  const limit = parseBatchSize(req);
  const nowIso = new Date().toISOString();

  const { data: dueAssets, error: dueAssetsError } = await supabase
    .from("assets")
    .select(
      `
        id,
        storage_path,
        storage_delete_after,
        storage_delete_reason,
        camera_id,
        cameras!inner (
          id,
          organization_id,
          organizations!inner (
            id,
            is_demo
          )
        )
      `
    )
    .not("storage_delete_after", "is", null)
    .lte("storage_delete_after", nowIso)
    .is("storage_deleted_at", null)
    .not("storage_path", "is", null)
    .eq("cameras.organizations.is_demo", false)
    .order("storage_delete_after", { ascending: true })
    .limit(limit)
    .returns<CleanupAssetRow[]>();

  if (dueAssetsError) {
    return jsonError(dueAssetsError.message, 500);
  }

  const assets = dueAssets ?? [];

  if (assets.length === 0) {
    return NextResponse.json({
      ok: true,
      scannedAt: nowIso,
      bucket: STORAGE_BUCKET,
      limit,
      found: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
      results: [],
    });
  }

  const results: Array<{
    assetId: string;
    storagePath: string;
    status: "deleted" | "failed" | "skipped";
    error?: string;
  }> = [];

  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  for (const asset of assets) {
    if (!asset.storage_path) {
      skipped += 1;
      results.push({
        assetId: asset.id,
        storagePath: "",
        status: "skipped",
        error: "missing_storage_path",
      });
      continue;
    }

    const { error: removeError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([asset.storage_path]);

    if (removeError) {
      failed += 1;
      const message = removeError.message || "storage_remove_failed";

      await supabase
        .from("assets")
        .update({
          storage_delete_error: message,
        })
        .eq("id", asset.id)
        .is("storage_deleted_at", null);

      results.push({
        assetId: asset.id,
        storagePath: asset.storage_path,
        status: "failed",
        error: message,
      });

      continue;
    }

    const deletedAtIso = new Date().toISOString();

    const { error: markDeletedError } = await supabase
      .from("assets")
      .update({
        storage_deleted_at: deletedAtIso,
        storage_delete_error: null,
      })
      .eq("id", asset.id)
      .is("storage_deleted_at", null);

    if (markDeletedError) {
      failed += 1;

      results.push({
        assetId: asset.id,
        storagePath: asset.storage_path,
        status: "failed",
        error: `storage deleted but DB update failed: ${markDeletedError.message}`,
      });

      continue;
    }

    deleted += 1;
    results.push({
      assetId: asset.id,
      storagePath: asset.storage_path,
      status: "deleted",
    });
  }

  return NextResponse.json({
    ok: failed === 0,
    scannedAt: nowIso,
    bucket: STORAGE_BUCKET,
    limit,
    found: assets.length,
    deleted,
    failed,
    skipped,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}