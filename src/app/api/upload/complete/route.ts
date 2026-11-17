// src/app/api/upload/complete/route.ts #1
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";
import { supabaseServer } from "@/lib/supabaseServer";

type CompleteUploadInput = {
  uploadId?: unknown;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "active organization not found",
        batchIdRequired: "batchId required",
        uploadedRequired: "uploaded upload IDs required",
        uploadRowsNotFound: "one or more upload rows were not found",
        notAllowed: "not allowed",
        completeCrashed: "upload complete route crashed",
      }
    : {
        activeOrganizationNotFound: "aktive Organisation nicht gefunden",
        batchIdRequired: "batchId erforderlich",
        uploadedRequired: "hochgeladene Upload-IDs erforderlich",
        uploadRowsNotFound:
          "eine oder mehrere Upload-Zeilen wurden nicht gefunden",
        notAllowed: "nicht erlaubt",
        completeCrashed: "Upload-Complete-Route abgestürzt",
      };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? "").trim()))].filter(
    Boolean
  );
}

export async function POST(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const ctx = await requireOrganizationRole(["owner", "admin", "member"]);
    assertNotDemoWrite(ctx);

    const { activeMembership } = ctx;
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: text.activeOrganizationNotFound },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const batchId = String(body?.batchId ?? "").trim();

    if (!batchId) {
      return NextResponse.json({ error: text.batchIdRequired }, { status: 400 });
    }

    const uploaded = Array.isArray(body?.uploaded)
      ? (body.uploaded as CompleteUploadInput[])
      : [];

    const uploadIds = uniqueStrings(
      uploaded.map((item) => item?.uploadId ?? item)
    );

    if (uploadIds.length === 0 || uploadIds.length > 500) {
      return NextResponse.json(
        { error: text.uploadedRequired },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const { data: result, error } = await supabase.rpc("complete_manual_import_chunk", {
      p_org: activeOrganization.id,
      p_batch: batchId,
      p_ids: uploadIds,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (result?.state === "not_found") {
      return NextResponse.json({ error: text.uploadRowsNotFound }, { status: 404 });
    }
    if (result?.state !== "ok") {
      return NextResponse.json({ error: "MANUAL_IMPORT_OBJECT_MISSING" }, { status: 409 });
    }
    return NextResponse.json({
      ok: true, batchId,
      finalizedQueued: result.finalizedQueued,
      alreadyQueued: result.alreadyQueued,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);

    if (message === "Demo mode is read-only") {
      return NextResponse.json(
        { error: "Demo mode is read-only" },
        { status: 403 }
      );
    }

    console.error("UPLOAD COMPLETE crashed:", error);
    return NextResponse.json(
      {
        error: text.completeCrashed,
        details: message,
      },
      { status: 500 }
    );
  }
}
