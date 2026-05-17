// src/app/api/ingest/route.ts #2
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { ingestFiles, safeJsonParse } from "@/lib/ingestCore";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        ingestTokenRequired: "x-ingest-token required",
        invalidIngestToken: "invalid ingest token",
        noFilesProvided: "no files provided (file or files/files[])",
        ingestCrashed: "ingest crashed",
      }
    : {
        ingestTokenRequired: "x-ingest-token erforderlich",
        invalidIngestToken: "ungültiger ingest token",
        noFilesProvided: "keine Dateien übergeben (file oder files/files[])",
        ingestCrashed: "ingest abgestürzt",
      };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const supabase = supabaseServer();

    // 1) Auth via ingest token
    const token = req.headers.get("x-ingest-token")?.trim();
    if (!token) {
      return NextResponse.json({ error: text.ingestTokenRequired }, { status: 401 });
    }

    const { data: camera, error: camError } = await supabase
      .from("cameras")
      .select("id")
      .eq("ingest_token", token)
      .single();

    if (camError || !camera?.id) {
      return NextResponse.json({ error: text.invalidIngestToken }, { status: 401 });
    }

    // 2) Parse multipart form
    const formData = await req.formData();

    const single = formData.get("file");
    const multi = formData.getAll("files");
    const multiAlt = formData.getAll("files[]");


const filesRaw = [
  ...(single ? [single] : []),
  ...multi,
  ...multiAlt,
].filter(Boolean);

const files = filesRaw.filter((value): value is File => value instanceof File);



    if (files.length === 0) {
      return NextResponse.json(
        { error: text.noFilesProvided },
        { status: 400 }
      );
    }

    const metadata = safeJsonParse(formData.get("metadata") as string | null);
    const capturedAtOverride = (formData.get("capturedAt") as string | null) ?? null;

    const result = await ingestFiles({
      supabase,
      cameraId: camera.id,
      files,
      metadata,
      capturedAtOverride,
    });

    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error("INGEST crashed:", error);
    return NextResponse.json(
      {
        error: text.ingestCrashed,
        details: getErrorMessage(error),
      },
      { status: 500 }
    );
  }

}