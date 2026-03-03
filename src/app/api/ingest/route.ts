// src/app/api/ingest/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { ingestFiles, safeJsonParse } from "@/lib/ingestCore";

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

    const filesRaw = ([...(single ? [single] : []), ...multi, ...multiAlt] as any[]).filter(
      Boolean
    );
    const files = filesRaw.filter((v): v is File => v instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "no files provided (file or files/files[])" },
        { status: 400 }
      );
    }

    const metadata = safeJsonParse(formData.get("metadata") as string | null);
    const capturedAtOverride = (formData.get("capturedAt") as string | null) ?? null;

    const result = await ingestFiles({
      supabase,
      cameraId: camera.id,
      files,
      metadata,
      capturedAtOverride,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("INGEST crashed:", err);
    return NextResponse.json(
      { error: "ingest crashed", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}