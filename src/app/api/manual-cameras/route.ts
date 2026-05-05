// src/app/api/manual-cameras/route.ts #2
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { activeMembership } = await requireOrganizationRole(["owner", "admin", "member"]);
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const { searchParams } = new URL(req.url);
    const revier = searchParams.get("revier");

    let query = supabase
      .from("cameras")
      .select(`
        id,
        name,
location_name,
        technical_name,
        camera_ingest_configs!inner (
          method,
          is_active,
          provisioning_status,
          manual_label
        )
      `)
      .eq("organization_id", activeOrganization.id)
      .eq("camera_ingest_configs.method", "manual")
      .eq("camera_ingest_configs.is_active", true)
      .eq("camera_ingest_configs.provisioning_status", "ready")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (revier && revier !== "all") {
      query = query.eq("revier_id", revier);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }


const items = (data ?? []).map((row: any) => ({
  id: row.id,
  name: row.name,
  locationName: row.location_name ?? null,
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