// src/app/api/camera-token/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(req.url);

    const cameraId = searchParams.get("cameraId");
    if (!cameraId) {
      return NextResponse.json(
        { error: "cameraId_required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("cameras")
      .select("ingest_token")
      .eq("id", cameraId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "camera_not_found", details: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      ingest_token: data?.ingest_token ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "camera_token_api_crashed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}