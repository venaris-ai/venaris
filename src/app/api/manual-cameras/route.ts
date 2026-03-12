export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("cameras")
      .select(`
        id,
        name,
        technical_name,
        camera_ingest_configs!inner (
          method,
          is_active,
          provisioning_status,
          manual_label
        )
      `)
      .eq("camera_ingest_configs.method", "manual")
      .eq("camera_ingest_configs.is_active", true)
      .eq("camera_ingest_configs.provisioning_status", "ready")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      technicalName: row.technical_name,
      manualLabel: row.camera_ingest_configs?.[0]?.manual_label ?? null,
    }));

    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "manual cameras failed" },
      { status: 500 }
    );
  }
}