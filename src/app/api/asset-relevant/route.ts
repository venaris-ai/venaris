// src/app/api/asset-relevant/route.ts #3
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const ctx = await requireOrganizationRole([
      "owner",
      "admin",
      "member",
    ]);
    assertNotDemoWrite(ctx);

    const activeOrganization = ctx.activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const body = await req.json().catch(() => null);

    const assetId = body?.assetId as string | undefined;
    const relevant = body?.relevant as boolean | null | undefined;

    if (!assetId || relevant === undefined) {
      return NextResponse.json(
        { error: "assetId and relevant required" },
        { status: 400 }
      );
    }

    if (relevant !== null && typeof relevant !== "boolean") {
      return NextResponse.json(
        { error: "relevant must be boolean or null" },
        { status: 400 }
      );
    }

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("id, camera_id")
      .eq("id", assetId)
      .maybeSingle();

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 500 });
    }

    if (!asset) {
      return NextResponse.json({ error: "asset not found" }, { status: 404 });
    }

    const { data: camera, error: cameraError } = await supabase
      .from("cameras")
      .select("organization_id")
      .eq("id", asset.camera_id)
      .maybeSingle();

    if (cameraError) {
      return NextResponse.json({ error: cameraError.message }, { status: 500 });
    }

    if (!camera || camera.organization_id !== activeOrganization.id) {
      return NextResponse.json({ error: "not allowed" }, { status: 403 });
    }

    const { error } = await supabase
      .from("assets")
      .update({ relevant_user: relevant })
      .eq("id", assetId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "asset_relevant_api_crashed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}