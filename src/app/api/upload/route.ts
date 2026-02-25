export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const cameraId = formData.get("cameraId") as string | null;

    if (!file || !cameraId) {
      return NextResponse.json({ error: "file and cameraId required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

    // 1) Dedup (per camera) by file_hash
    const { data: existing, error: existErr } = await supabase
      .from("assets")
      .select("id")
      .eq("camera_id", cameraId)
      .eq("file_hash", hash)
      .limit(1);

    if (!existErr && existing && existing.length > 0) {
      // trotzdem last_seen_at updaten (manuelle Aktivität zählt)
      await supabase
        .from("cameras")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", cameraId);

      return NextResponse.json({
        ok: true,
        skippedDuplicate: true,
        existingAssetId: existing[0].id,
      });
    }

    const storagePath = `${cameraId}/${Date.now()}-${hash.slice(0, 12)}.${ext}`;

    // 2) Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("camera-assets")
      .upload(storagePath, bytes, { contentType: file.type || "image/jpeg" });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 3) Insert asset (return id)
    const { data: asset, error: dbError } = await supabase
      .from("assets")
      .insert({
        camera_id: cameraId,
        storage_path: storagePath,
        file_hash: hash,
        status: "queued",
        relevant: false, // keep consistent with ingest default
      })
      .select("id, camera_id, storage_path, file_hash, status, relevant, created_at")
      .single();

    if (dbError || !asset?.id) {
      // Cleanup storage object
      await supabase.storage.from("camera-assets").remove([storagePath]);
      return NextResponse.json({ error: dbError?.message ?? "asset insert failed" }, { status: 500 });
    }

    // 4) Fake detection (DEV STUB) - non-fatal
    const { error: detErr } = await supabase.from("detections").insert({
      asset_id: asset.id,
      label: "animal",
      species: "test_species",
      count: 1,
      score: 0.75,
      meta: { stub: true },
    });

    if (detErr) {
      console.warn("Fake detection insert failed (upload):", detErr.message);
    }

    // 5) Update camera health
    await supabase
      .from("cameras")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", cameraId);

    // 6) Event clustering (non-fatal)
    const { error: eventErr } = await supabase.rpc("upsert_event_for_asset", {
      p_asset_id: asset.id,
      p_window_minutes: 10,
    });

    if (eventErr) {
      console.warn("Event clustering failed for upload asset", asset.id, eventErr.message);
      // Upload soll nicht failen, nur weil Event Layer zickt
    }

    return NextResponse.json({ ok: true, asset });
  } catch (err: any) {
    console.error("UPLOAD crashed:", err);
    return NextResponse.json(
      { error: "upload route crashed", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}