// src/app/api/upload/prepare/route.ts #3
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
import { MANUAL_IMPORT_CHUNK_SIZE } from "@/lib/manualImportFlow";

const BUCKET = "camera-assets";
const CHUNK_SIZE = MANUAL_IMPORT_CHUNK_SIZE;

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
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireOrganizationRole(["owner", "admin", "member"]);
    assertNotDemoWrite(ctx);
    const org = ctx.activeMembership.organizations;
    const body = await req.json().catch(() => null);
    const requestId = String(body?.requestId ?? "");
    if (!org || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      return NextResponse.json({ error: "Invalid import request" }, { status: 400 });
    }
    const { data, error } = await supabaseServer().rpc("renew_manual_import_lease", {
      p_org: org.id, p_request: requestId,
    });
    if (error) throw new Error(error.message);
    if (data?.state === "ok") return NextResponse.json({ ok: true });
    if (data?.state === "busy") return NextResponse.json({ error: "MANUAL_IMPORT_BUSY" }, { status: 409 });
    return NextResponse.json({ error: "MANUAL_IMPORT_EXPIRED" }, { status: 409 });
  } catch (error) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: message === "Demo mode is read-only" ? 403 : 500 });
  }
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

    const requestId = String(body?.requestId ?? "").trim();
    const offset = Number(body?.offset ?? 0);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) || !Number.isSafeInteger(offset) || offset < 0) {
      return NextResponse.json({ error: "Invalid import request" }, { status: 400 });
    }
    const cameraId = String(body?.cameraId ?? "").trim();
    if (!cameraId) {
      return NextResponse.json({ error: text.cameraIdRequired }, { status: 400 });
    }

    const inputFiles = Array.isArray(body?.files)
      ? (body.files as PrepareFileInput[])
      : [];

    if (inputFiles.length === 0 || offset >= inputFiles.length) {
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

    if (files.some((file) => !file.name || !file.size) || new Set(files.map(f => f.clientId)).size !== files.length) {
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

    // The full manifest is bound to one durable request; signing is limited
    // to a small chunk so no request performs hundreds of storage calls.
    const manifest = files.map((file) => ({
      ...file,
      ext: getManualImportFileExtension(file.name),
    }));
    const hash = crypto.createHash("sha256")
      .update(JSON.stringify({ cameraId, manifest })).digest("hex");
    const { data: session, error: sessionError } = await supabase.rpc(
      "prepare_manual_import_chunk", {
        p_org: activeOrganization.id, p_camera: cameraId,
        p_request: requestId, p_hash: hash, p_files: manifest,
        p_offset: offset, p_limit: CHUNK_SIZE,
      }
    );
    if (sessionError) throw new Error(sessionError.message);
    if (session?.state !== "ok") {
      const busy = session?.state === "busy";
      const expired = session?.state === "expired";
      return NextResponse.json({
        error: busy ? "MANUAL_IMPORT_BUSY" : expired ? "MANUAL_IMPORT_EXPIRED" : "MANUAL_IMPORT_CONFLICT",
      }, { status: 409, ...(busy ? { headers: { "Retry-After": "10" } } : {}) });
    }
    const preparedFiles = [];
    for (const row of session.rows as Array<{
      id: string; index: number; status: string; uploaded_at: string | null;
      storage_path: string; content_type: string; expected_size_bytes: number;
    }>) {
      const original = files[row.index];
      if (!original) throw new Error("invalid import row index");
      if (row.status !== "prepared") {
        if (!row.uploaded_at) {
          return NextResponse.json({ error: "MANUAL_IMPORT_EXPIRED" }, { status: 409 });
        }
        preparedFiles.push({ clientId: original.clientId, uploadId: row.id, status: "already_uploaded" });
        continue;
      }
      const { data: signed, error: signedError } = await supabase.storage
        .from(BUCKET).createSignedUploadUrl(row.storage_path, { upsert: false });
      const token = extractSignedUploadToken(signed);
      if (signedError || !token) {
        // Do not fail the manifest: the next request uses the same batch and paths.
        const diagnostics = getSignedUploadDiagnostics(signed);
        console.error("SIGNED_UPLOAD_TOKEN_DIAGNOSTICS", {
          uploadId: row.id, diagnostics, signedError: signedError?.message ?? null,
        });
        throw new Error(signedError?.message ?? text.signedUploadUrlFailed);
      }
      preparedFiles.push({
        clientId: original.clientId, uploadId: row.id, status: "upload_required",
        uploadStrategy: "signed_standard", bucket: BUCKET,
        storagePath: row.storage_path, token,
        contentType: row.content_type, expectedSizeBytes: row.expected_size_bytes,
      });
    }
    return NextResponse.json({
      ok: true, batchId: session.batchId, bucket: BUCKET,
      uploadStrategy: "signed_standard", maxBytes: MANUAL_IMPORT_MAX_BYTES,
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

