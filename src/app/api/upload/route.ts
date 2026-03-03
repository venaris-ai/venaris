// src/app/api/upload/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseServer } from "@/lib/supabaseServer";
import { ingestFiles, safeJsonParse } from "@/lib/ingestCore";

const MAX_FILES = 500; // MVP Guard
const MAX_ZIP_BYTES = 150 * 1024 * 1024; // 150MB Guard (anpassen wenn nötig)

function isImageName(name: string) {
  const n = name.toLowerCase();
  return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp");
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

async function extractImagesFromZip(zipFile: File): Promise<File[]> {
  const ab = await zipFile.arrayBuffer();
  if (ab.byteLength > MAX_ZIP_BYTES) {
    throw new Error(`zip too large (${Math.round(ab.byteLength / 1024 / 1024)}MB)`);
  }

  const zip = await JSZip.loadAsync(ab);
  const out: File[] = [];

  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const entry of entries) {
    if (!isImageName(entry.name)) continue;

    // JSZip returns Uint8Array via nodebuffer
    const buf = await entry.async("uint8array");
    const filename = entry.name.split("/").pop() || `image-${Date.now()}.jpg`;
    const ct = guessContentType(filename);

    // Node 20 has File global
    out.push(new File([buf], filename, { type: ct }));
    if (out.length >= MAX_FILES) break;
  }

  return out;
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();
    const formData = await req.formData();

    const cameraId = (formData.get("cameraId") as string | null)?.trim() ?? null;
    if (!cameraId) {
      return NextResponse.json({ error: "cameraId required" }, { status: 400 });
    }

    // Backward compatible: accept single + multi
    const single = formData.get("file");
    const multi = formData.getAll("files");
    const multiAlt = formData.getAll("files[]");

    const raw = ([...(single ? [single] : []), ...multi, ...multiAlt] as any[]).filter(Boolean);
    const incomingFiles = raw.filter((v): v is File => v instanceof File);

    if (incomingFiles.length === 0) {
      return NextResponse.json({ error: "file or files required" }, { status: 400 });
    }

    const clientMeta = safeJsonParse(formData.get("metadata") as string | null) ?? {};
    const channel = (formData.get("channel") as string | null) ?? "upload";
    const capturedAtOverride = (formData.get("capturedAt") as string | null) ?? null;

    // Expand ZIPs + keep direct images
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

    // Filter to images only (safety)
    const files = expanded.filter((f) => isImageName(f.name)).slice(0, MAX_FILES);

    if (files.length === 0) {
      return NextResponse.json({ error: "no image files found (jpg/png/webp)" }, { status: 400 });
    }

    // Enforce manual source here
    const metadata = {
      ...clientMeta,
      source: "manual",
      channel, // "import" oder "upload"
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