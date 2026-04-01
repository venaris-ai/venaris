// src/app/api/camera-health/route.ts #2b
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

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
const rawRevier = searchParams.get("revier") ?? undefined;

const { data: reviersData, error: reviersError } = await supabase
  .from("reviers")
  .select("id,name")
  .eq("organization_id", activeOrganization.id)
  .eq("status", "active")
  .order("name", { ascending: true });

if (reviersError) {
  return NextResponse.json(
    { error: reviersError.message },
    { status: 500 }
  );
}

const allowedReviers: RevierOption[] = (reviersData ?? []).map((revier) => ({
  id: revier.id,
  name: revier.name,
}));
const revierScope = resolveRevierScope(rawRevier, allowedReviers);
const allowedRevierIds = allowedReviers.map((revier) => revier.id);

if (allowedRevierIds.length === 0) {
  return NextResponse.json({ items: [] });
}

let camerasQuery = supabase
  .from("cameras")
  .select("id")
  .eq("organization_id", activeOrganization.id);

camerasQuery =
  revierScope.type === "single"
    ? camerasQuery.eq("revier_id", revierScope.revierId)
    : camerasQuery.in("revier_id", allowedRevierIds);

const { data: cameras, error: camerasError } = await camerasQuery;







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