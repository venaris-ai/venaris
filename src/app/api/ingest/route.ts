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

    // Support single: file
    const single = formData.get("file");
    // Support multi: files (can be repeated or files[])
    const multi = formData.getAll("files");
    const multiAlt = formData.getAll("files[]");
    const filesRaw = [
      ...(single ? [single] : []),
      ...multi,
      ...multiAlt,
    ].filter(Boolean);

    const files = filesRaw.filter((v): v is File => v instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "no files provided (file or files/files[])" }, { status: 400 });
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
      })
      .select()
      .single();

    if (batchError || !batch?.id) {
      return NextResponse.json({ error: batchError?.message ?? "failed to create batch" }, { status: 500 });
    }

    let accepted = 0;
    let skippedDuplicates = 0;

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
        continue;
      }

      const storagePath = `${camera.id}/${Date.now()}-${hash.slice(0, 12)}.${ext}`;

      // 4b) Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("camera-assets")
        .upload(storagePath, bytes, { contentType: file.type || "image/jpeg" });

      if (uploadError) {
        // Mark batch failed and stop (strict). Could be changed to partial.
        await supabase
          .from("ingest_batches")
          .update({ status: "failed", error_summary: uploadError.message })
          .eq("id", batch.id);

        return NextResponse.json({ error: uploadError.message, batchId: batch.id }, { status: 500 });
      }

      // 4c) Insert asset
      const insertPayload: any = {
        camera_id: camera.id,
        storage_path: storagePath,
        file_hash: hash,
        status: "queued",
        relevant: false, // default
        ingest_batch_id: batch.id,
      };

      // Optional captured_at if you have that column; otherwise ignore.
      // If your "assets" table DOES have captured_at, uncomment next lines:
      // if (capturedAtOverride) insertPayload.captured_at = capturedAtOverride;

      // Optional: if you have a jsonb 'meta' column, you can store metadata there.
      // If not present, ignore it.
      // if (metadata) insertPayload.meta = metadata;

      const { error: dbError } = await supabase.from("assets").insert(insertPayload);

      if (dbError) {
        // Cleanup storage object
        await supabase.storage.from("camera-assets").remove([storagePath]);

        await supabase
          .from("ingest_batches")
          .update({ status: "failed", error_summary: dbError.message })
          .eq("id", batch.id);

        return NextResponse.json({ error: dbError.message, batchId: batch.id }, { status: 500 });
      }

      accepted++;
    }

    // 5) Update camera health + batch status
    const nowIso = new Date().toISOString();

    await supabase.from("cameras").update({ last_seen_at: nowIso }).eq("id", camera.id);

    await supabase
      .from("ingest_batches")
      .update({
        status: "completed",
        error_summary: skippedDuplicates > 0 ? `skipped duplicates: ${skippedDuplicates}` : null,
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