export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";

export async function GET() {
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

    const { data: cameras, error: camerasError } = await supabase
      .from("cameras")
      .select("id")
      .eq("organization_id", activeOrganization.id);

    if (camerasError) {
      return NextResponse.json(
        { error: camerasError.message },
        { status: 500 }
      );
    }

    const allowedCameraIds = (cameras ?? []).map((c) => c.id);

    if (allowedCameraIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const { data, error } = await supabase
      .from("camera_health")
      .select("*")
      .in("id", allowedCameraIds)
      .order("name", { ascending: true });





    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "camera health failed" },
      { status: 500 }
    );
  }
}