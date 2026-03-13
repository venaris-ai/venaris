// src/app/api/asset-url/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireActiveOrganization } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { activeMembership } = await requireActiveOrganization();
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("storage_path, camera_id")
      .eq("storage_path", path)
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

    const { data, error } = await supabase.storage
      .from("camera-assets")
      .createSignedUrl(path, 60 * 10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: "asset_url_failed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}