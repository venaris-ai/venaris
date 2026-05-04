// src/app/api/camera-health/route.ts #3
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOrganizationRole } from "@/lib/auth";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

type CameraGeoRow = {
  id: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  direction_deg: number | null;
};

type CameraHealthStatus = "online" | "stale" | "offline" | "unknown";

const HEALTH_STALE_AFTER_MINUTES = 12 * 60;
const HEALTH_OFFLINE_AFTER_MINUTES = 24 * 60;

function deriveHealthStatus(lastSeenAt: string | null): CameraHealthStatus {
  if (!lastSeenAt) return "unknown";

  const lastSeenTime = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenTime)) return "unknown";

  const diffMinutes = Math.floor((Date.now() - lastSeenTime) / 60000);

  if (diffMinutes >= HEALTH_OFFLINE_AFTER_MINUTES) return "offline";
  if (diffMinutes >= HEALTH_STALE_AFTER_MINUTES) return "stale";
  return "online";
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

    const allowedReviers: RevierOption[] = (reviersData ?? []).map(
      (revier) => ({
        id: revier.id,
        name: revier.name,
      })
    );
    const revierScope = resolveRevierScope(rawRevier, allowedReviers);
    const allowedRevierIds = allowedReviers.map((revier) => revier.id);

    if (allowedRevierIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    let camerasQuery = supabase
      .from("cameras")
      .select("id,location_name,latitude,longitude,direction_deg")
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

    const cameraRows = (cameras ?? []) as CameraGeoRow[];
    const allowedCameraIds = cameraRows.map((camera) => camera.id);

    if (allowedCameraIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const cameraGeoById = new Map(
      cameraRows.map((camera) => [camera.id, camera])
    );

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

    const items = (data ?? []).map((row: any) => {
      const geo = cameraGeoById.get(row.id);

      return {
        ...row,
        location_name: geo?.location_name ?? null,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        direction_deg: geo?.direction_deg ?? null,
        stale_after_minutes: HEALTH_STALE_AFTER_MINUTES,
        offline_after_minutes: HEALTH_OFFLINE_AFTER_MINUTES,
        health_status: deriveHealthStatus(row.last_seen_at ?? null),
      };
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "camera health failed" },
      { status: 500 }
    );
  }
}