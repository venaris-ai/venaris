// src/app/api/upload/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { ingestFiles, safeJsonParse } from "@/lib/ingestCore";

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();

    const formData = await req.formData();

    const cameraId = (formData.get("cameraId") as string | null)?.trim() ?? null;
    if (!cameraId) {
      return NextResponse.json({ error: "cameraId required" }, { status: 400 });
    }

    // Backward compatible: accept single + multi uploads
    const single = formData.get("file");
    const multi = formData.getAll("files");
    const multiAlt = formData.getAll("files[]");

    const filesRaw = ([...(single ? [single] : []), ...multi, ...multiAlt] as any[]).filter(
      Boolean
    );
    const files = filesRaw.filter((v): v is File => v instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "file or files required" }, { status: 400 });
    }

    // Optional client metadata; we enforce source=manual here
    const clientMeta = safeJsonParse(formData.get("metadata") as string | null) ?? {};
    const channel = (formData.get("channel") as string | null) ?? "upload";
    const capturedAtOverride = (formData.get("capturedAt") as string | null) ?? null;

    const metadata = {
      ...clientMeta,
      source: "manual",
      channel,
      file_count: files.length,
    };

    const result = await ingestFiles({
      supabase,
      cameraId,
      files,
      metadata,
      capturedAtOverride,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("UPLOAD crashed:", err);
    return NextResponse.json(
      { error: "upload route crashed", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}