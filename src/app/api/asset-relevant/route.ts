// src/app/api/asset-relevant/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { activeMembership } = await requireOrganizationRole(["owner", "admin", "member"]);

    const activeOrganization = activeMembership.organizations;

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

    const patch: Record<string, unknown> = { relevant };

    if (relevant === true) {
      patch.empty = false;
      patch.empty_confidence = null;
    }

    const { error } = await supabase
      .from("assets")
      .update(patch)
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