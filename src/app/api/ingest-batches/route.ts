// src/app/api/ingest-batches/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(req.url);

    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
    const source = searchParams.get("source"); // ftp | smtp | ...
    const status = searchParams.get("status"); // ok | error | processing | ...
    const cameraId = searchParams.get("cameraId");

    let q = supabase
      .from("ingest_batches")
      .select(
        `
        id,
        camera_id,
        received_at,
        source,
        file_count,
        status,
        error_summary,
        meta,
        cameras ( id, name )
      `
      )
      .order("received_at", { ascending: false })
      .limit(limit);

    if (source) q = q.eq("source", source);
    if (status) q = q.eq("status", status);
    if (cameraId) q = q.eq("camera_id", cameraId);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: "query_failed", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: "ingest_batches_api_crashed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}