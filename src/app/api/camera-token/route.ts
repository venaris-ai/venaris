// src/app/api/camera-token/route.ts #2
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { activeMembership } = await requireOrganizationRole(["owner", "admin"]);
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
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
      .select("ingest_token, organization_id")
      .eq("id", cameraId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "camera_lookup_failed", details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "camera_not_found" },
        { status: 404 }
      );
    }

    if (data.organization_id !== activeOrganization.id) {
      return NextResponse.json(
        { error: "not_allowed" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      ingest_token: data.ingest_token ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "camera_token_api_crashed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}


export async function POST(req: Request) {
  try {
    const ctx = await requireOrganizationRole(["owner", "admin"]);
    assertNotDemoWrite(ctx);

    const { activeMembership } = ctx;
    const activeOrganization = activeMembership.organizations;





    if (!activeOrganization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const body = await req.json().catch(() => null);
    const cameraId = body?.cameraId as string | undefined;

    if (!cameraId) {
      return NextResponse.json(
        { error: "cameraId_required" },
        { status: 400 }
      );
    }

    const { data: camera, error: cameraError } = await supabase
      .from("cameras")
      .select("id, organization_id")
      .eq("id", cameraId)
      .maybeSingle();

    if (cameraError) {
      return NextResponse.json(
        { error: "camera_lookup_failed", details: cameraError.message },
        { status: 500 }
      );
    }

    if (!camera) {
      return NextResponse.json(
        { error: "camera_not_found" },
        { status: 404 }
      );
    }

    if (camera.organization_id !== activeOrganization.id) {
      return NextResponse.json(
        { error: "not_allowed" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase.rpc(
      "regenerate_camera_ingest_token",
      { p_camera_id: cameraId }
    );

    if (error) {
      return NextResponse.json(
        { error: "token_regeneration_failed", details: error.message },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      ok: true,
      ingest_token: row?.ingest_token ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "camera_token_post_crashed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}