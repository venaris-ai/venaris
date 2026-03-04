// src/app/api/assets/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const supabase = supabaseServer();
    const url = new URL(req.url);

    const onlyRelevant = url.searchParams.get("onlyRelevant") === "true";
    const cameraId = url.searchParams.get("cameraId");

    const limitRaw = Number(url.searchParams.get("limit") || 30);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 30;

    let q = supabase
      .from("assets_v")
      .select(
        "id,camera_id,storage_path,status,created_at,relevant,empty,empty_confidence,relevant_effective"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (onlyRelevant) q = q.eq("relevant_effective", true);
    if (cameraId) q = q.eq("camera_id", cameraId);

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assets: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: "assets_api_crashed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}