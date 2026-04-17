// src/app/api/intelligence/species-activity/route.ts #2
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePeriodRange, type PeriodKey } from "@/lib/intelligence/period";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        queryFailed: "species activity query failed",
      }
    : {
        queryFailed: "Abfrage für Artenaktivität fehlgeschlagen",
      };
}

export async function GET(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  const { searchParams } = new URL(req.url);

  const period = (searchParams.get("period") || "7d") as PeriodKey;
  const cameraId = searchParams.get("cameraId");
  const relevantOnly = searchParams.get("relevantOnly") === "true";

  const { startAt, endAt } = resolvePeriodRange(period);

  const supabase = supabaseServer();

  const { data, error } = await supabase.rpc("get_species_activity", {
    p_start_at: startAt,
    p_end_at: endAt,
    p_camera_id: cameraId || null,
    p_relevant_only: relevantOnly,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message || text.queryFailed },
      { status: 500 }
    );
  }

  return NextResponse.json({
    period,
    startAt,
    endAt,
    rows: data || [],
  });
}