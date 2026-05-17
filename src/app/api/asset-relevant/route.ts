// src/app/api/asset-relevant/route.ts #7
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "active organization not found",
        assetIdAndRelevantRequired: "assetId and relevant required",
        relevantMustBeBooleanOrNull: "relevant must be boolean or null",
        assetNotFound: "asset not found",
        notAllowed: "not allowed",
        assetAlreadyDeleted:
          "The image file has already been deleted and cannot be restored.",
      }
    : {
        activeOrganizationNotFound: "aktive Organisation nicht gefunden",
        assetIdAndRelevantRequired: "assetId und relevant sind erforderlich",
        relevantMustBeBooleanOrNull: "relevant muss boolean oder null sein",
        assetNotFound: "Asset nicht gefunden",
        notAllowed: "nicht erlaubt",
        assetAlreadyDeleted:
          "Die Bilddatei wurde bereits gelöscht und kann nicht wiederhergestellt werden.",
      };
}

function getStorageDeleteAfterIso() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const ctx = await requireOrganizationRole(["owner", "admin", "member"]);
    assertNotDemoWrite(ctx);

    const activeOrganization = ctx.activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: text.activeOrganizationNotFound },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const body = await req.json().catch(() => null);

    const assetId = body?.assetId as string | undefined;
    const relevant = body?.relevant as boolean | null | undefined;

    if (!assetId || relevant === undefined) {
      return NextResponse.json(
        { error: text.assetIdAndRelevantRequired },
        { status: 400 }
      );
    }

    if (relevant !== null && typeof relevant !== "boolean") {
      return NextResponse.json(
        { error: text.relevantMustBeBooleanOrNull },
        { status: 400 }
      );
    }

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("id, camera_id, storage_deleted_at")
      .eq("id", assetId)
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

    if (relevant !== false && asset.storage_deleted_at) {
      return NextResponse.json(
        { error: text.assetAlreadyDeleted },
        { status: 409 }
      );
    }

    const assetUpdate =
      relevant === false
        ? {
            relevant_user: relevant,
            storage_delete_after: getStorageDeleteAfterIso(),
            storage_delete_reason: "manual_irrelevant",
            storage_delete_error: null,
          }
        : {
            relevant_user: relevant,
            storage_delete_after: null,
            storage_delete_reason: null,
            storage_delete_error: null,
          };

    const { error: updateAssetError } = await supabase
      .from("assets")
      .update(assetUpdate)
      .eq("id", assetId);

    if (updateAssetError) {
      return NextResponse.json(
        { error: updateAssetError.message },
        { status: 500 }
      );
    }

    if (relevant === false) {
      const { error: clearSpeciesError } = await supabase
        .from("detections")
        .update({ species_user: null })
        .eq("asset_id", assetId)
        .eq("label", "animal");

      if (clearSpeciesError) {
        return NextResponse.json(
          { error: clearSpeciesError.message },
          { status: 500 }
        );
      }
    }

    const { data: reclusterEventId, error: reclusterError } = await supabase.rpc(
      "recluster_asset_event",
      {
        p_asset_id: assetId,
      }
    );

    if (reclusterError) {
      return NextResponse.json(
        { error: reclusterError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      eventId: reclusterEventId ?? null,
      storageDeleteAfter:
        relevant === false ? assetUpdate.storage_delete_after : null,
      storageDeleteReason:
        relevant === false ? assetUpdate.storage_delete_reason : null,
    });

  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "asset_relevant_api_crashed",
        details: getErrorMessage(error),
      },
      { status: 500 }
    );
  }




}