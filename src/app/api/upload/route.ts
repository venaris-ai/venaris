// src/app/api/upload/route.ts #2
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseServer } from "@/lib/supabaseServer";
import { ingestFiles, safeJsonParse } from "@/lib/ingestCore";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";

const MAX_FILES = 500; // MVP Guard
const MAX_ZIP_BYTES = 150 * 1024 * 1024; // 150MB Guard

function isImageName(name: string) {
  const n = name.toLowerCase();
  return (
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png") ||
    n.endsWith(".webp")
  );
}

function guessContentType(filename: string) {
  const n = filename.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function isZipFile(f: File) {
  const n = (f.name || "").toLowerCase();
  const ct = (f.type || "").toLowerCase();
  return n.endsWith(".zip") || ct.includes("zip");
}

/**
 * IMPORTANT:
 * - JSZip returns Buffer/Uint8Array depending on output mode.
 * - Next/Vercel TypeScript sometimes treats Buffer/Uint8Array as ArrayBufferLike
 *   (potential SharedArrayBuffer) and rejects it as BlobPart.
 *
 * Fix: copy into a fresh Uint8Array backed by a real ArrayBuffer via Uint8Array.from(buf).
 */
async function extractImagesFromZip(zipFile: File): Promise<File[]> {
  const ab = await zipFile.arrayBuffer();
  if (ab.byteLength > MAX_ZIP_BYTES) {
    throw new Error(
      `zip too large (${Math.round(ab.byteLength / 1024 / 1024)}MB)`
    );
  }

  const zip = await JSZip.loadAsync(ab);
  const out: File[] = [];

  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const entry of entries) {
    if (!isImageName(entry.name)) continue;

    const filename =
      entry.name.split("/").pop() || `image-${Date.now()}.jpg`;
    const ct = guessContentType(filename);

    const buf = await entry.async("nodebuffer");
    const u8 = Uint8Array.from(buf);
    out.push(new File([u8], filename, { type: ct }));

    if (out.length >= MAX_FILES) break;
  }

  return out;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireOrganizationRole(["owner", "admin", "member"]);
    assertNotDemoWrite(ctx);

    const { activeMembership } = ctx;
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const formData = await req.formData();

    const cameraId = (formData.get("cameraId") as string | null)?.trim() ?? null;
    if (!cameraId) {
      return NextResponse.json({ error: "cameraId required" }, { status: 400 });
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
      return NextResponse.json({ error: "camera not found" }, { status: 404 });
    }

    if (camera.organization_id !== activeOrganization.id) {
      return NextResponse.json({ error: "not allowed" }, { status: 403 });
    }

    // Backward compatible: accept single + multi
    const single = formData.get("file");
    const multi = formData.getAll("files");
    const multiAlt = formData.getAll("files[]");

    const raw = ([...(single ? [single] : []), ...multi, ...multiAlt] as any[]).filter(
      Boolean
    );
    const incomingFiles = raw.filter((v): v is File => v instanceof File);

    if (incomingFiles.length === 0) {
      return NextResponse.json({ error: "file or files required" }, { status: 400 });
    }

    const clientMeta = safeJsonParse(formData.get("metadata") as string | null) ?? {};
    const channel = (formData.get("channel") as string | null) ?? "upload";
    const capturedAtOverride = (formData.get("capturedAt") as string | null) ?? null;

    const expanded: File[] = [];
    for (const f of incomingFiles) {
      if (isZipFile(f)) {
        const imgs = await extractImagesFromZip(f);
        expanded.push(...imgs);
      } else {
        expanded.push(f);
      }
      if (expanded.length >= MAX_FILES) break;
    }

    const files = expanded.filter((f) => isImageName(f.name)).slice(0, MAX_FILES);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "no image files found (jpg/png/webp)" },
        { status: 400 }
      );
    }

    const metadata = {
      ...clientMeta,
      source: "manual",
      channel,
      file_count: files.length,
      adapter: "upload",
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
  } catch (err: any) {
    console.error("UPLOAD crashed:", err);
    return NextResponse.json(
      { error: "upload route crashed", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}