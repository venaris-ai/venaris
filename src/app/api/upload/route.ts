// src/app/api/upload/route.ts #4
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  MANUAL_IMPORT_MAX_BYTES,
  MANUAL_IMPORT_MAX_FILES,
  MANUAL_IMPORT_MAX_LABEL,
  isManualImportAllowedFileLike,
} from "@/lib/manualImportLimits";
import { supabaseServer } from "@/lib/supabaseServer";
import { ingestFiles, safeJsonParse } from "@/lib/ingestCore";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "active organization not found",
        cameraIdRequired: "cameraId required",
        cameraNotFound: "camera not found",
        notAllowed: "not allowed",
        fileOrFilesRequired: "file or files required",
        noImageFilesFound: "no image files found (jpg/png/webp)",
        tooManyFiles: `too many files; maximum is ${MANUAL_IMPORT_MAX_FILES}`,
        importTooLarge: `import is larger than ${MANUAL_IMPORT_MAX_LABEL}`,
        unsupportedFileType:
          "unsupported file type; supported formats are JPG, PNG and WEBP",
        uploadRouteCrashed: "upload route crashed",
      }
    : {
        activeOrganizationNotFound: "aktive Organisation nicht gefunden",
        cameraIdRequired: "cameraId erforderlich",
        cameraNotFound: "Kamera nicht gefunden",
        notAllowed: "nicht erlaubt",
        fileOrFilesRequired: "file oder files erforderlich",
        noImageFilesFound: "keine Bilddateien gefunden (jpg/png/webp)",
        tooManyFiles: `zu viele Dateien; maximal erlaubt sind ${MANUAL_IMPORT_MAX_FILES}`,
        importTooLarge: `Import ist größer als ${MANUAL_IMPORT_MAX_LABEL}`,
        unsupportedFileType:
          "nicht unterstützter Dateityp; unterstützt werden JPG, PNG und WEBP",
        uploadRouteCrashed: "Upload-Route abgestürzt",
      };
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

    const { activeMembership } = ctx;
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: text.activeOrganizationNotFound },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const formData = await req.formData();

    const cameraId = (formData.get("cameraId") as string | null)?.trim() ?? null;
    if (!cameraId) {
      return NextResponse.json({ error: text.cameraIdRequired }, { status: 400 });
    }

    const { data: camera, error: cameraError } = await supabase
      .from("cameras")
      .select("id, organization_id")
      .eq("id", cameraId)
      .maybeSingle();

    if (cameraError) {
      return NextResponse.json({ error: cameraError.message }, { status: 500 });
    }

    if (!camera) {
      return NextResponse.json({ error: text.cameraNotFound }, { status: 404 });
    }

    if (camera.organization_id !== activeOrganization.id) {
      return NextResponse.json({ error: text.notAllowed }, { status: 403 });
    }

    // Backward compatible: accept single + multi
    const single = formData.get("file");
    const multi = formData.getAll("files");
    const multiAlt = formData.getAll("files[]");

    const raw = [
      ...(single ? [single] : []),
      ...multi,
      ...multiAlt,
    ].filter(Boolean);

    const incomingFiles = raw.filter(
      (value): value is File => value instanceof File
    );

    if (incomingFiles.length === 0) {
      return NextResponse.json(
        { error: text.fileOrFilesRequired },
        { status: 400 }
      );
    }

    if (incomingFiles.length > MANUAL_IMPORT_MAX_FILES) {
      return NextResponse.json({ error: text.tooManyFiles }, { status: 400 });
    }

    const totalBytes = incomingFiles.reduce((sum, file) => sum + file.size, 0);

    if (totalBytes > MANUAL_IMPORT_MAX_BYTES) {
      return NextResponse.json({ error: text.importTooLarge }, { status: 413 });
    }

    const unsupported = incomingFiles.filter(
      (file) => !isManualImportAllowedFileLike(file)
    );

    if (unsupported.length > 0) {
      return NextResponse.json(
        {
          error: text.unsupportedFileType,
          rejected: unsupported.map((file) => file.name),
        },
        { status: 400 }
      );
    }

    const files = incomingFiles.filter(isManualImportAllowedFileLike);

    if (files.length === 0) {
      return NextResponse.json(
        { error: text.noImageFilesFound },
        { status: 400 }
      );
    }

    const clientMeta =
      safeJsonParse(formData.get("metadata") as string | null) ?? {};
    const channel = (formData.get("channel") as string | null) ?? "upload";
    const capturedAtOverride =
      (formData.get("capturedAt") as string | null) ?? null;

    const metadata = {
      ...clientMeta,
      source: "manual",
      channel,
      file_count: files.length,
      adapter: "upload",
      max_import_bytes: MANUAL_IMPORT_MAX_BYTES,
    };

    const result = await ingestFiles({
      supabase,
      cameraId,
      files,
      metadata,
      capturedAtOverride,
    });

    return NextResponse.json({
      ...result,
      file_count: files.length,
      channel,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);

    if (message === "Demo mode is read-only") {
      return NextResponse.json(
        { error: "Demo mode is read-only" },
        { status: 403 }
      );
    }

    console.error("UPLOAD crashed:", error);
    return NextResponse.json(
      {
        error: text.uploadRouteCrashed,
        details: message,
      },
      { status: 500 }
    );
  }
}