// src/app/api/upload/prepare/route.ts #2
export const runtime = "nodejs";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  MANUAL_IMPORT_ALLOWED_MIME_TYPES,
  MANUAL_IMPORT_MAX_BYTES,
  MANUAL_IMPORT_MAX_FILES,
  MANUAL_IMPORT_MAX_LABEL,
  getManualImportFileExtension,
  isManualImportAllowedFileLike,
} from "@/lib/manualImportLimits";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";
import { supabaseServer } from "@/lib/supabaseServer";

const BUCKET = "camera-assets";
const SIGNED_UPLOAD_TTL_HOURS = 2;

type PrepareFileInput = {
  clientId?: unknown;
  name?: unknown;
  size?: unknown;
  type?: unknown;
  lastModified?: unknown;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "active organization not found",
        cameraIdRequired: "cameraId required",
        cameraNotFound: "camera not found",
        notAllowed: "not allowed",
        filesRequired: "files required",
        tooManyFiles: `too many files; maximum is ${MANUAL_IMPORT_MAX_FILES}`,
        importTooLarge: `import is larger than ${MANUAL_IMPORT_MAX_LABEL}`,
        unsupportedFileType:
          "unsupported file type; supported formats are JPG, PNG and WEBP",
        signedUploadUrlFailed: "failed to create signed upload URL",
        prepareCrashed: "upload prepare route crashed",
      }
    : {
        activeOrganizationNotFound: "aktive Organisation nicht gefunden",
        cameraIdRequired: "cameraId erforderlich",
        cameraNotFound: "Kamera nicht gefunden",
        notAllowed: "nicht erlaubt",
        filesRequired: "Dateien erforderlich",
        tooManyFiles: `zu viele Dateien; maximal erlaubt sind ${MANUAL_IMPORT_MAX_FILES}`,
        importTooLarge: `Import ist größer als ${MANUAL_IMPORT_MAX_LABEL}`,
        unsupportedFileType:
          "nicht unterstützter Dateityp; unterstützt werden JPG, PNG und WEBP",
        signedUploadUrlFailed: "signierte Upload-URL konnte nicht erstellt werden",
        prepareCrashed: "Upload-Prepare-Route abgestürzt",
      };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeName(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").slice(0, 180);
}

function normalizeContentType(name: string, type: unknown) {
  const raw = String(type ?? "").toLowerCase().trim();

  if (MANUAL_IMPORT_ALLOWED_MIME_TYPES.includes(raw as never)) {
    return raw;
  }

  const ext = getManualImportFileExtension(name);
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function parsePositiveSize(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function getSupabaseTusEndpoint() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  if (!rawUrl) {
    throw new Error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  }

  const url = new URL(rawUrl);

  if (
    url.hostname.endsWith(".supabase.co") &&
    !url.hostname.endsWith(".storage.supabase.co")
  ) {
    url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  }

  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  url.hash = "";

  return url.toString();
}

function getSignedUploadDiagnostics(data: unknown) {
  const d = data as { token?: string; signedUrl?: string; path?: string } | null;
  const token = typeof d?.token === "string" ? d.token : "";
  let signedUrlHasToken = false;
  let signedUrlTokenDotCount: number | null = null;

  if (typeof d?.signedUrl === "string") {
    try {
      const url = new URL(d.signedUrl);
      const signedUrlToken = url.searchParams.get("token") ?? "";
      signedUrlHasToken = signedUrlToken.length > 0;
      signedUrlTokenDotCount = signedUrlToken
        ? signedUrlToken.split(".").length - 1
        : null;
    } catch {
      signedUrlHasToken = false;
      signedUrlTokenDotCount = null;
    }
  }

  return {
    keys: d ? Object.keys(d).sort() : [],
    hasToken: token.length > 0,
    tokenLength: token.length,
    tokenDotCount: token ? token.split(".").length - 1 : null,
    hasSignedUrl: typeof d?.signedUrl === "string" && d.signedUrl.length > 0,
    signedUrlHasToken,
    signedUrlTokenDotCount,
  };
}

function extractSignedUploadToken(data: unknown) {
  const d = data as { token?: string } | null;
  return typeof d?.token === "string" && d.token.length > 0 ? d.token : null;
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

    const cameraId = String(body?.cameraId ?? "").trim();
    if (!cameraId) {
      return NextResponse.json({ error: text.cameraIdRequired }, { status: 400 });
    }

    const inputFiles = Array.isArray(body?.files)
      ? (body.files as PrepareFileInput[])
      : [];

    if (inputFiles.length === 0) {
      return NextResponse.json({ error: text.filesRequired }, { status: 400 });
    }

    if (inputFiles.length > MANUAL_IMPORT_MAX_FILES) {
      return NextResponse.json({ error: text.tooManyFiles }, { status: 400 });
    }

    const files = inputFiles.map((file, index) => {
      const name = normalizeName(file.name);
      const size = parsePositiveSize(file.size);
      const type = normalizeContentType(name, file.type);
      const clientId = String(file.clientId ?? `file-${index}`).trim();

      return {
        clientId,
        name,
        size,
        type,
        lastModified:
          typeof file.lastModified === "number" ? file.lastModified : null,
      };
    });

    if (files.some((file) => !file.name || !file.size)) {
      return NextResponse.json({ error: text.filesRequired }, { status: 400 });
    }

    const unsupported = files.filter(
      (file) =>
        !isManualImportAllowedFileLike({ name: file.name, type: file.type })
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

    const totalBytes = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
    if (totalBytes > MANUAL_IMPORT_MAX_BYTES) {
      return NextResponse.json({ error: text.importTooLarge }, { status: 413 });
    }

    const supabase = supabaseServer();

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

    const { data: batch, error: batchError } = await supabase
      .from("ingest_batches")
      .insert({
        camera_id: cameraId,
        source: "manual",
        file_count: files.length,
        status: "processing",
        meta: {
          source: "manual",
          channel: "import",
          adapter: "tus",
          file_count: files.length,
          total_bytes: totalBytes,
          max_import_bytes: MANUAL_IMPORT_MAX_BYTES,
        },
      })
      .select("id")
      .single();

    if (batchError || !batch?.id) {
      throw new Error(batchError?.message ?? "failed to create ingest batch");
    }

    const rows = files.map((file, index) => {
      const ext = getManualImportFileExtension(file.name) || ".jpg";
      const objectId = crypto.randomUUID();

      return {
        organization_id: activeOrganization.id,
        camera_id: cameraId,
        ingest_batch_id: batch.id,
        storage_bucket: BUCKET,
        storage_path: `${cameraId}/manual-import/${batch.id}/${String(
          index + 1
        ).padStart(4, "0")}-${objectId}${ext}`,
        original_filename: file.name,
        content_type: file.type,
        expected_size_bytes: file.size,
        status: "prepared",
        expires_at: new Date(
          Date.now() + SIGNED_UPLOAD_TTL_HOURS * 60 * 60 * 1000
        ).toISOString(),
      };
    });

    const { data: insertedRows, error: insertError } = await supabase
      .from("manual_import_files")
      .insert(rows)
      .select(
        "id, storage_path, original_filename, content_type, expected_size_bytes"
      );

    if (insertError || !insertedRows || insertedRows.length !== rows.length) {
      throw new Error(insertError?.message ?? "failed to create import rows");
    }

    const preparedFiles = [];

    try {
      for (let i = 0; i < insertedRows.length; i++) {
        const row = insertedRows[i];
        const original = files[i];

        const { data: signed, error: signedError } = await supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(row.storage_path, { upsert: false });

        const token = extractSignedUploadToken(signed);

    if (signedError || !token) {
      const diagnostics = getSignedUploadDiagnostics(signed);

      console.error("SIGNED_UPLOAD_TOKEN_DIAGNOSTICS", {
        uploadId: row.id,
        storagePath: row.storage_path,
        diagnostics,
        signedError: signedError?.message ?? null,
      });

      throw new Error(
        signedError?.message ??
          `${text.signedUploadUrlFailed}: ${row.id}; token diagnostics=${JSON.stringify(
            diagnostics
          )}`
      );
    }

        preparedFiles.push({
          clientId: original.clientId,
          uploadId: row.id,
          status: "upload_required",
          bucket: BUCKET,
          storagePath: row.storage_path,
          token,
          contentType: row.content_type,
          expectedSizeBytes: row.expected_size_bytes,
        });
      }
    } catch (error) {
      await supabase
        .from("manual_import_files")
        .update({
          status: "failed",
          error_summary: getErrorMessage(error),
        })
        .eq("ingest_batch_id", batch.id);

      await supabase
        .from("ingest_batches")
        .update({
          status: "failed",
          error_summary: getErrorMessage(error),
        })
        .eq("id", batch.id);

      throw error;
    }

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      bucket: BUCKET,
      endpoint: getSupabaseTusEndpoint(),
      chunkSizeBytes: 6 * 1024 * 1024,
      maxBytes: MANUAL_IMPORT_MAX_BYTES,
      files: preparedFiles,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);

    if (message === "Demo mode is read-only") {
      return NextResponse.json(
        { error: "Demo mode is read-only" },
        { status: 403 }
      );
    }

    console.error("UPLOAD PREPARE crashed:", error);
    return NextResponse.json(
      {
        error: text.prepareCrashed,
        details: message,
      },
      { status: 500 }
    );
  }
}