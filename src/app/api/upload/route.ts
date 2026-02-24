export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    console.log("UPLOAD called");
    console.log("ENV url?", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("ENV service key?", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    const supabase = supabaseServer();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const cameraId = formData.get("cameraId") as string | null;

    if (!file || !cameraId) {
      return NextResponse.json(
        { error: "file and cameraId required" },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

    const storagePath = `${cameraId}/${Date.now()}-${hash.slice(0, 12)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("camera-assets")
      .upload(storagePath, bytes, { contentType: file.type || "image/jpeg" });

    if (uploadError) {
      console.error("UPLOAD storage error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: asset, error: dbError } = await supabase
      .from("assets")
      .insert({
        camera_id: cameraId,
        storage_path: storagePath,
        file_hash: hash,
        status: "queued",
      })
      .select()
      .single();

    if (dbError) {
      console.error("UPLOAD db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, asset });
  } catch (err: any) {
    console.error("UPLOAD crashed:", err);
    return NextResponse.json(
      {
        error: "upload route crashed",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}