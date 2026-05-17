// src/app/api/assets/route.ts #2b
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
const url = new URL(req.url);

const onlyRelevant = url.searchParams.get("onlyRelevant") === "true";
const cameraId = url.searchParams.get("cameraId");
const rawRevier = url.searchParams.get("revier") ?? undefined;

const limitRaw = Number(url.searchParams.get("limit") || 30);
const limit = Number.isFinite(limitRaw)
  ? Math.min(Math.max(limitRaw, 1), 200)
  : 30;

const { data: reviersData, error: reviersError } = await supabase
  .from("reviers")
  .select("id,name")
  .eq("organization_id", activeOrganization.id)
  .eq("status", "active")
  .order("name", { ascending: true });

if (reviersError) {
  return NextResponse.json({ error: reviersError.message }, { status: 500 });
}

const allowedReviers: RevierOption[] = (reviersData ?? []).map((revier) => ({
  id: revier.id,
  name: revier.name,
}));
const revierScope = resolveRevierScope(rawRevier, allowedReviers);
const allowedRevierIds = allowedReviers.map((revier) => revier.id);

if (allowedRevierIds.length === 0) {
  return NextResponse.json({ assets: [] });
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
      return NextResponse.json({ error: camerasError.message }, { status: 500 });
    }

    const allowedCameraIds = (cameras ?? []).map((c) => c.id);

    if (allowedCameraIds.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    if (cameraId && !allowedCameraIds.includes(cameraId)) {
      return NextResponse.json({ assets: [] });
    }

    let q = supabase
      .from("assets_v")
      .select(
        "id,camera_id,storage_path,status,created_at,relevant,relevant_user,empty,empty_confidence,relevant_effective"
      )
      .in("camera_id", cameraId ? [cameraId] : allowedCameraIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (onlyRelevant) q = q.eq("relevant_effective", true);

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assets: data ?? [] });

  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "assets_api_crashed",
        details: getErrorMessage(error),
      },
      { status: 500 }
    );
  }



}