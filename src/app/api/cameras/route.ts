// src/app/api/cameras/route.ts #2
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";

type CameraRow = {
  id: string;
  name: string;
  location_name: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(req: Request) {
  try {
    const { activeMembership } = await requireOrganizationRole([
      "owner",
      "admin",
      "member",
    ]);
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
      .select("id,name,location_name")
      .eq("organization_id", activeOrganization.id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (revier && revier !== "all") {
      query = query.eq("revier_id", revier);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cameras = ((data ?? []) as CameraRow[]).map((camera) => ({
      id: camera.id,
      name: camera.name,
      locationName: camera.location_name ?? null,
    }));

    return NextResponse.json({ cameras });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) || "cameras_api_failed" },
      { status: 500 }
    );
  }
}