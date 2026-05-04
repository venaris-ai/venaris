// src/app/api/asset-species/route.ts #4
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

const ALLOWED_SPECIES = [
  "roe_deer",
  "wild_boar",
  "red_deer",
  "fallow_deer",
  "mouflon",
  "fox",
  "wolf",
  "badger",
  "raccoon",
  "raccoon_dog",
  "hare",
  "rabbit",
  "pheasant",
  "crow",
  "other",
] as const;

type SpeciesValue = (typeof ALLOWED_SPECIES)[number];

function isAllowedSpecies(value: unknown): value is SpeciesValue {
  return typeof value === "string" && ALLOWED_SPECIES.includes(value as SpeciesValue);
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "active organization not found",
        assetIdAndSpeciesRequired: "assetId and species required",
        speciesMustBeValid:
          "species must be null or a valid taxonomy species",
        assetNotFound: "asset not found",
        notAllowed: "not allowed",
        assetAlreadyDeleted:
          "The image file has already been deleted and cannot be changed.",
      }
    : {
        activeOrganizationNotFound: "aktive Organisation nicht gefunden",
        assetIdAndSpeciesRequired: "assetId und species sind erforderlich",
        speciesMustBeValid:
          "species muss null oder eine gültige taxonomy species sein",
        assetNotFound: "Asset nicht gefunden",
        notAllowed: "nicht erlaubt",
        assetAlreadyDeleted:
          "Die Bilddatei wurde bereits gelöscht und kann nicht mehr geändert werden.",
      };
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
    const species = body?.species as string | null | undefined;

    if (!assetId || species === undefined) {
      return NextResponse.json(
        { error: text.assetIdAndSpeciesRequired },
        { status: 400 }
      );
    }

    if (species !== null && !isAllowedSpecies(species)) {
      return NextResponse.json(
        { error: text.speciesMustBeValid },
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

    if (asset.storage_deleted_at) {
      return NextResponse.json(
        { error: text.assetAlreadyDeleted },
        { status: 409 }
      );
    }

    const { data: animalDetections, error: detectionsError } = await supabase
      .from("detections")
      .select("id")
      .eq("asset_id", assetId)
      .eq("label", "animal");

    if (detectionsError) {
      return NextResponse.json({ error: detectionsError.message }, { status: 500 });
    }

    const detectionIds = (animalDetections ?? []).map((row) => row.id);

    if (detectionIds.length > 0) {
      const { error: updateError } = await supabase
        .from("detections")
        .update({ species_user: species })
        .in("id", detectionIds);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else if (species !== null) {
      const { error: insertDetectionError } = await supabase
        .from("detections")
        .insert({
          asset_id: assetId,
          label: "animal",
          species_user: species,
          count: 1,
          score: 1,
          meta: {
            source: "manual_review",
            created_by: "asset_species_api",
          },
        });

      if (insertDetectionError) {
        return NextResponse.json(
          { error: insertDetectionError.message },
          { status: 500 }
        );
      }
    }

    if (species !== null) {
      const { error: updateAssetError } = await supabase
        .from("assets")
        .update({
          empty: false,
          relevant_user: true,
          storage_delete_after: null,
          storage_delete_reason: null,
          storage_delete_error: null,
        })
        .eq("id", assetId);

      if (updateAssetError) {
        return NextResponse.json(
          { error: updateAssetError.message },
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
      manualDetectionCreated: detectionIds.length === 0 && species !== null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "asset_species_api_crashed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}