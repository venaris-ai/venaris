// src/app/api/ingest-batches/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {

const { activeMembership } = await requireOrganizationRole([
  "owner",
  "admin",
  "member",
]);

    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const { searchParams } = new URL(req.url);

    const limitRaw = Number(searchParams.get("limit") || 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;

    const source = searchParams.get("source");
    const status = searchParams.get("status");
    const cameraId = searchParams.get("cameraId");

    const { data: cameras, error: camerasError } = await supabase
      .from("cameras")
      .select("id")
      .eq("organization_id", activeOrganization.id);

    if (camerasError) {
      return NextResponse.json(
        { error: "camera_lookup_failed", details: camerasError.message },
        { status: 500 }
      );
    }

    const allowedCameraIds = (cameras ?? []).map((c) => c.id);

    if (allowedCameraIds.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    if (cameraId && !allowedCameraIds.includes(cameraId)) {
      return NextResponse.json({ ok: true, items: [] });
    }

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
      .in("camera_id", cameraId ? [cameraId] : allowedCameraIds)
      .order("received_at", { ascending: false })
      .limit(limit);

    if (source) q = q.eq("source", source);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json(
        { error: "query_failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: "ingest_batches_api_crashed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}