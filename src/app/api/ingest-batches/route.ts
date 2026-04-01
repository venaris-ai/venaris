// src/app/api/ingest-batches/route.ts #2b

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

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
const rawRevier = searchParams.get("revier") ?? undefined;

const { data: reviersData, error: reviersError } = await supabase
  .from("reviers")
  .select("id,name")
  .eq("organization_id", activeOrganization.id)
  .eq("status", "active")
  .order("name", { ascending: true });

if (reviersError) {
  return NextResponse.json(
    { error: "revier_lookup_failed", details: reviersError.message },
    { status: 500 }
  );
}

const allowedReviers: RevierOption[] = (reviersData ?? []).map((revier) => ({
  id: revier.id,
  name: revier.name,
}));
const revierScope = resolveRevierScope(rawRevier, allowedReviers);
const allowedRevierIds = allowedReviers.map((revier) => revier.id);

if (allowedRevierIds.length === 0) {
  return NextResponse.json({ ok: true, items: [] });
}

let camerasQuery = supabase
  .from("cameras")
  .select("id")
  .eq("organization_id", activeOrganization.id);

camerasQuery =
  revierScope.type === "single"
    ? camerasQuery.eq("revier_id", revierScope.revierId)
    : camerasQuery.in("revier_id", allowedRevierIds);

const { data: cameras, error: camerasError } = await camerasQuery;








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