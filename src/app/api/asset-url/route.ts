// src/app/api/asset-url/route.ts #3
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";
import { resolveAssetPreviewUrl } from "@/lib/demoAssetResolver";

function isStorageObjectMissing(message: string | undefined) {
  const value = (message ?? "").toLowerCase();

  return (
    value.includes("not found") ||
    value.includes("object not found") ||
    value.includes("no such object") ||
    value.includes("does not exist")
  );
}

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
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("id, storage_path, camera_id")
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

    const url = await resolveAssetPreviewUrl({
      asset: {
        id: asset.id,
        camera_id: asset.camera_id,
        storage_path: asset.storage_path,
      },
      isDemo: Boolean(activeOrganization.is_demo),
    });

    if (!url) {
      return NextResponse.json(
        { error: "storage object not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ url });
  } catch (e: any) {
    const message = e?.message ?? String(e);

    if (isStorageObjectMissing(message)) {
      return NextResponse.json(
        { error: "storage object not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "asset_url_failed", details: message },
      { status: 500 }
    );
  }
}