// src/app/api/asset-url/route.ts #4
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";
import { resolveAssetPreviewUrl } from "@/lib/demoAssetResolver";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

function isStorageObjectMissing(message: string | undefined) {
  const value = (message ?? "").toLowerCase();

  return (
    value.includes("not found") ||
    value.includes("object not found") ||
    value.includes("no such object") ||
    value.includes("does not exist")
  );
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "active organization not found",
        pathRequired: "path required",
        assetNotFound: "asset not found",
        notAllowed: "not allowed",
        storageObjectNotFound: "storage object not found",
      }
    : {
        activeOrganizationNotFound: "aktive Organisation nicht gefunden",
        pathRequired: "path ist erforderlich",
        assetNotFound: "Asset nicht gefunden",
        notAllowed: "nicht erlaubt",
        storageObjectNotFound: "Storage-Objekt nicht gefunden",
      };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const { activeMembership } = await requireOrganizationRole([
      "owner",
      "admin",
      "member",
    ]);
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: text.activeOrganizationNotFound },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json({ error: text.pathRequired }, { status: 400 });
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
      return NextResponse.json({ error: text.assetNotFound }, { status: 404 });
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
      return NextResponse.json({ error: text.notAllowed }, { status: 403 });
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
        { error: text.storageObjectNotFound },
        { status: 404 }
      );
    }

    return NextResponse.json({ url });

  } catch (error: unknown) {
    const message = getErrorMessage(error);

    if (isStorageObjectMissing(message)) {
      return NextResponse.json(
        { error: text.storageObjectNotFound },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "asset_url_failed", details: message },
      { status: 500 }
    );
  }



}