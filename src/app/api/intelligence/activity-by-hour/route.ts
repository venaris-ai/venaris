import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePeriodRange, type PeriodKey } from "@/lib/intelligence/period";

export async function GET(req: NextRequest) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    period,
    startAt,
    endAt,
    rows: data || [],
  });
}