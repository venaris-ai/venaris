// src/lib/ingestCore.ts
import crypto from "crypto";

export type IngestMetadata = Record<string, any>;

export function safeJsonParse(input: string | null): IngestMetadata | null {
  if (!input) return null;
  try {
    const v = JSON.parse(input);
    return v && typeof v === "object" ? (v as IngestMetadata) : null;
  } catch {
    return null;
  }
}

export function normalizeSource(metadata: IngestMetadata | null): string {
  const raw =
    metadata && typeof metadata.source === "string"
      ? metadata.source.toLowerCase().trim()
      : "";

  if (raw === "ftp") return "ftp";
  if (raw === "smtp") return "smtp";
  if (raw === "manual") return "manual";
  if (raw === "token" || raw === "token-ingest") return "token";

  // fallback
  return "token";
}

/**
 * Core ingest pipeline used by BOTH:
 * - /api/ingest (token-auth, workers)
 * - /api/upload (manual/import proxy)
 *
 * Guarantees:
 * - ingest_batches record created (source derived from metadata.source)
 * - per-camera SHA256 dedup
 * - storage upload
 * - assets insert
 * - event clustering (non-fatal)
 * - cameras.last_seen_at updated
 * - batch status completed/failed + summary
 */
export async function ingestFiles(params: {
  supabase: any;
  cameraId: string;
  files: File[];
  metadata: IngestMetadata | null;
  capturedAtOverride?: string | null;
}) {
  const { supabase, cameraId, files } = params;
  const metadata = params.metadata ?? null;
  const capturedAtOverride = params.capturedAtOverride ?? null;

  const batchSource = normalizeSource(metadata);

  // 1) Create batch
  const { data: batch, error: batchError } = await supabase
    .from("ingest_batches")
    .insert({
      camera_id: cameraId,
      source: batchSource,
      file_count: files.length,
      status: "processing",
      meta: metadata ?? null,
    })
    .select()
    .single();

  if (batchError || !batch?.id) {
    throw new Error(batchError?.message ?? "failed to create batch");
  }

  let accepted = 0;
  let skippedDuplicates = 0;

  // collect warnings without overwriting summary at the end
  const warnings: string[] = [];

  // 2) Process each file
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

    // 2a) Dedup check (per camera) by file_hash
    const { data: existing, error: existErr } = await supabase
      .from("assets")
      .select("id")
      .eq("camera_id", cameraId)
      .eq("file_hash", hash)
      .limit(1);

    if (!existErr && existing && existing.length > 0) {
      skippedDuplicates++;

      // captured_at backfill if we now have a better time
      const deviceTime =
        metadata && typeof (metadata as any).device_time === "string"
          ? String((metadata as any).device_time)
          : null;

      const capturedAt = capturedAtOverride ?? deviceTime;

      if (capturedAt) {
        await supabase
          .from("assets")
          .update({ captured_at: capturedAt })
          .eq("id", existing[0].id)
          .is("captured_at", null);
      }

      continue;
    }

    const storagePath = `${cameraId}/${Date.now()}-${hash.slice(0, 12)}.${ext}`;

    // 2b) Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("camera-assets")
      .upload(storagePath, bytes, { contentType: file.type || "image/jpeg" });

    if (uploadError) {
      await supabase
        .from("ingest_batches")
        .update({ status: "failed", error_summary: uploadError.message })
        .eq("id", batch.id);

      throw new Error(uploadError.message);
    }

    // 2c) Insert asset
    const insertPayload: any = {
      camera_id: cameraId,
      storage_path: storagePath,
      file_hash: hash,
      status: "queued",
      relevant: false,
      ingest_batch_id: batch.id,
    };

    // captured_at priority:
    // 1) capturedAt (FormData)
    // 2) metadata.device_time (ISO string)
    // 3) else none -> DB created_at
    const deviceTime =
      metadata && typeof (metadata as any).device_time === "string"
        ? String((metadata as any).device_time)
        : null;

    const capturedAt = capturedAtOverride ?? deviceTime;
    if (capturedAt) insertPayload.captured_at = capturedAt;

    const { data: insertedAsset, error: dbError } = await supabase
      .from("assets")
      .insert(insertPayload)
      .select("id")
      .single();

    if (dbError || !insertedAsset?.id) {
      await supabase.storage.from("camera-assets").remove([storagePath]);

      await supabase
        .from("ingest_batches")
        .update({
          status: "failed",
          error_summary: dbError?.message ?? "asset insert failed",
        })
        .eq("id", batch.id);

      throw new Error(dbError?.message ?? "asset insert failed");
    }

    // 2d) Event clustering (non-fatal to keep ingest stable)
    const { error: eventErr } = await supabase.rpc("upsert_event_for_asset", {
      p_asset_id: insertedAsset.id,
      p_window_minutes: 10,
    });

    if (eventErr) {
      console.warn("Event clustering failed for asset", insertedAsset.id, eventErr.message);
      warnings.push(`event_clustering_failed:${eventErr.message}`);
    }

    accepted++;
  }

  // 3) Update camera health
  await supabase
    .from("cameras")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", cameraId);

  // 4) Batch final status + summary
  const summaryParts: string[] = [];
  if (skippedDuplicates > 0) summaryParts.push(`skipped duplicates: ${skippedDuplicates}`);
  summaryParts.push(...warnings);

  await supabase
    .from("ingest_batches")
    .update({
      status: "completed",
      error_summary: summaryParts.length > 0 ? summaryParts.join(" | ") : null,
    })
    .eq("id", batch.id);

  return {
    ok: true,
    batchId: batch.id,
    accepted,
    skippedDuplicates,
    source: batchSource,
  };
}