export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";

type IngestMetadata = Record<string, any>;

function safeJsonParse(input: string | null): IngestMetadata | null {
  if (!input) return null;
  try {
    const v = JSON.parse(input);
    return v && typeof v === "object" ? (v as IngestMetadata) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();

    // 1) Auth via ingest token
    const token = req.headers.get("x-ingest-token")?.trim();
    if (!token) {
      return NextResponse.json({ error: "x-ingest-token required" }, { status: 401 });
    }

    const { data: camera, error: camError } = await supabase
      .from("cameras")
      .select("id")
      .eq("ingest_token", token)
      .single();

    if (camError || !camera?.id) {
      return NextResponse.json({ error: "invalid ingest token" }, { status: 401 });
    }

    // 2) Parse multipart form
    const formData = await req.formData();

    const single = formData.get("file");
    const multi = formData.getAll("files");
    const multiAlt = formData.getAll("files[]");
    const filesRaw = ([...(single ? [single] : []), ...multi, ...multiAlt] as any[]).filter(Boolean);

    const files = filesRaw.filter((v): v is File => v instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "no files provided (file or files/files[])" },
        { status: 400 }
      );
    }

    const metadata = safeJsonParse(formData.get("metadata") as string | null);
    const capturedAtOverride = (formData.get("capturedAt") as string | null) ?? null;

    // 3) Create batch
    const { data: batch, error: batchError } = await supabase
      .from("ingest_batches")
      .insert({
        camera_id: camera.id,
        source: "token-ingest",
        file_count: files.length,
        status: "processing",
        meta: metadata ?? null,
      })
      .select()
      .single();

    if (batchError || !batch?.id) {
      return NextResponse.json(
        { error: batchError?.message ?? "failed to create batch" },
        { status: 500 }
      );
    }

    let accepted = 0;
    let skippedDuplicates = 0;

    // Sammle Hinweise, ohne am Ende alles zu überschreiben
    const warnings: string[] = [];

    // 4) Process each file
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const hash = crypto.createHash("sha256").update(bytes).digest("hex");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

      // 4a) Dedup check (per camera) by file_hash
      const { data: existing, error: existErr } = await supabase
        .from("assets")
        .select("id")
        .eq("camera_id", camera.id)
        .eq("file_hash", hash)
        .limit(1);

if (!existErr && existing && existing.length > 0) {
  skippedDuplicates++;

  // captured_at ggf. nachtragen (wenn wir jetzt eine bessere Zeit haben)
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

      const storagePath = `${camera.id}/${Date.now()}-${hash.slice(0, 12)}.${ext}`;

      // 4b) Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("camera-assets")
        .upload(storagePath, bytes, { contentType: file.type || "image/jpeg" });

      if (uploadError) {
        await supabase
          .from("ingest_batches")
          .update({ status: "failed", error_summary: uploadError.message })
          .eq("id", batch.id);

        return NextResponse.json(
          { error: uploadError.message, batchId: batch.id },
          { status: 500 }
        );
      }

      // 4c) Insert asset
      const insertPayload: any = {
        camera_id: camera.id,
        storage_path: storagePath,
        file_hash: hash,
        status: "queued",
        relevant: false,
        ingest_batch_id: batch.id,
      };

      // captured_at Priorität:
      // 1) capturedAt (FormData)
      // 2) metadata.device_time (ISO String)
      // 3) sonst nichts -> DB created_at
      const deviceTime =
        metadata && typeof (metadata as any).device_time === "string"
          ? String((metadata as any).device_time)
          : null;

      const capturedAt = capturedAtOverride ?? deviceTime;

      if (capturedAt) {
        insertPayload.captured_at = capturedAt;
      }

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

        return NextResponse.json(
          { error: dbError?.message ?? "asset insert failed", batchId: batch.id },
          { status: 500 }
        );
      }

      // 4d) Event Clustering (non-fatal, damit Ingest stabil bleibt)
      const { error: eventErr } = await supabase.rpc("upsert_event_for_asset", {
        p_asset_id: insertedAsset.id,
        p_window_minutes: 10,
      });

      if (eventErr) {
        console.warn("Event clustering failed for asset", insertedAsset.id, eventErr.message);
        warnings.push(`event_clustering_failed:${eventErr.message}`);
      }

      // 4e) Fake detection (DEV STUB, non-fatal)  ✅ genau einmal
      const { error: fakeDetErr } = await supabase.from("detections").insert({
        asset_id: insertedAsset.id,
        label: "animal",
        species: "test_species",
        count: 1,
        score: 0.75,
        meta: { stub: true },
      });

      if (fakeDetErr) {
        console.warn("Fake detection insert failed:", fakeDetErr.message);
        warnings.push(`fake_detection_failed:${fakeDetErr.message}`);
      }

      accepted++;
    }

    // 5) Update camera health
    const nowIso = new Date().toISOString();
    await supabase.from("cameras").update({ last_seen_at: nowIso }).eq("id", camera.id);

    // 6) Batch final status + summary
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

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      accepted,
      skippedDuplicates,
    });
  } catch (err: any) {
    console.error("INGEST crashed:", err);
    return NextResponse.json(
      { error: "ingest crashed", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}