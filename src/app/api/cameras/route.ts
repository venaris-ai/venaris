// src/app/api/cameras/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireActiveOrganization } from "@/lib/auth";

export async function GET() {
  try {
    const { activeMembership } = await requireActiveOrganization();
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("cameras")
      .select("id,name,location_name,created_at")
      .eq("organization_id", activeOrganization.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ cameras: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "cameras_api_failed" },
      { status: 500 }
    );
  }
}