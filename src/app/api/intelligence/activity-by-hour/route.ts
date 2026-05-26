// src/app/api/intelligence/activity-by-hour/route.ts #2
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePeriodRange, type PeriodKey } from "@/lib/intelligence/period";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";
import { requirePathAccess } from "@/lib/authz";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        queryFailed: "activity by hour query failed",
      }
    : {
        queryFailed: "Abfrage für Aktivität nach Stunde fehlgeschlagen",
      };
}

export async function GET(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

await requirePathAccess("/wildlife");

  const { searchParams } = new URL(req.url);

  const period = (searchParams.get("period") || "7d") as PeriodKey;
  const cameraId = searchParams.get("cameraId");
  const species = searchParams.get("species");
  const relevantOnly = searchParams.get("relevantOnly") === "true";

  const { startAt, endAt } = resolvePeriodRange(period);

  const supabase = supabaseServer();

  const { data, error } = await supabase.rpc("get_activity_by_hour", {
    p_start_at: startAt,
    p_end_at: endAt,
    p_camera_id: cameraId || null,
    p_relevant_only: relevantOnly,
    p_species: species || null,
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