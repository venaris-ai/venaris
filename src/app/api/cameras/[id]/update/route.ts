// src/app/api/cameras/[id]/update/route.ts #1
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { assertNotDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";

type RouteParams = {
  id: string;
};

type UpdateCameraBody = {
  cameraName?: string;
  revierId?: string;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  directionDeg?: number | null;
  notes?: string | null;
  isActive?: boolean;
  vendor?: string;
};

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidOptionalNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> | RouteParams }
) {
  const params = await context.params;
  const ctx = await requirePathAccess(`/cameras/${params.id}/edit`);

  if (!ctx.user) {
    return NextResponse.json({ error: "Authenticated user required" }, { status: 401 });
  }

  assertNotDemoWrite(ctx);

  if (!ctx.activeMembership) {
    return NextResponse.json(
      { error: "Active organization context required" },
      { status: 400 }
    );
  }

  const actorRole = ctx.activeMembership.role;
  const activeOrganization = ctx.activeMembership.organizations;

  if (!activeOrganization) {
    return NextResponse.json({ error: "Active organization not found" }, { status: 400 });
  }

  if (!(actorRole === "owner" || actorRole === "admin")) {
    return NextResponse.json(
      { error: "Only owner or admin can manage cameras" },
      { status: 403 }
    );
  }

  const id = String(params.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing camera id" }, { status: 400 });
  }

  const body = (await request.json()) as UpdateCameraBody;
  const cameraName = normalizeOptionalText(body.cameraName);
  const revierId = normalizeOptionalText(body.revierId);
  const vendor = normalizeOptionalText(body.vendor);

  if (!cameraName) {
    return NextResponse.json({ error: "cameraName is required" }, { status: 400 });
  }

  if (!revierId) {
    return NextResponse.json({ error: "revierId is required" }, { status: 400 });
  }

  if (!vendor) {
    return NextResponse.json({ error: "vendor is required" }, { status: 400 });
  }

  if (!isValidOptionalNumber(body.latitude)) {
    return NextResponse.json({ error: "latitude must be a number or null" }, { status: 400 });
  }

  if (!isValidOptionalNumber(body.longitude)) {
    return NextResponse.json({ error: "longitude must be a number or null" }, { status: 400 });
  }

  if (
    body.directionDeg !== null &&
    body.directionDeg !== undefined &&
    (!Number.isInteger(body.directionDeg) || body.directionDeg < 0 || body.directionDeg >= 360)
  ) {
    return NextResponse.json(
      { error: "directionDeg must be 0-359" },
      { status: 400 }
    );
  }

  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be boolean" }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data: targetCamera, error: targetCameraError } = await supabase
    .from("cameras")
    .select("id,organization_id")
    .eq("organization_id", activeOrganization.id)
    .eq("id", id)
    .maybeSingle();

  if (targetCameraError) {
    return NextResponse.json(
      { error: "Failed to load target camera", details: targetCameraError.message },
      { status: 500 }
    );
  }

  if (!targetCamera) {
    return NextResponse.json({ error: "Target camera not found" }, { status: 404 });
  }

  const { data: targetRevier, error: targetRevierError } = await supabase
    .from("reviers")
    .select("id")
    .eq("organization_id", activeOrganization.id)
    .eq("id", revierId)
    .eq("status", "active")
    .maybeSingle();

  if (targetRevierError) {
    return NextResponse.json(
      { error: "Failed to load target ground", details: targetRevierError.message },
      { status: 500 }
    );
  }

  if (!targetRevier) {
    return NextResponse.json({ error: "Target ground not found" }, { status: 404 });
  }

  const { data: targetVendor, error: targetVendorError } = await supabase
    .from("camera_vendors")
    .select("key")
    .eq("key", vendor)
    .eq("active", true)
    .maybeSingle();

  if (targetVendorError) {
    return NextResponse.json(
      { error: "Failed to load target vendor", details: targetVendorError.message },
      { status: 500 }
    );
  }

  if (!targetVendor) {
    return NextResponse.json({ error: "Target vendor not found" }, { status: 404 });
  }

  const { data: updatedCamera, error: updateError } = await supabase
    .from("cameras")
    .update({
      name: cameraName,
      revier_id: revierId,
      location_name: normalizeOptionalText(body.locationName),
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      direction_deg: body.directionDeg ?? null,
      notes: normalizeOptionalText(body.notes),
      is_active: body.isActive,
    })
    .eq("organization_id", activeOrganization.id)
    .eq("id", id)
    .select("id,name")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update camera", details: updateError.message },
      { status: 500 }
    );
  }

  const { data: updatedConfig, error: configUpdateError } = await supabase
    .from("camera_ingest_configs")
    .update({ vendor })
    .eq("camera_id", id)
    .eq("is_active", true)
    .select("camera_id,vendor")
    .maybeSingle();

  if (configUpdateError) {
    return NextResponse.json(
      { error: "Failed to update camera vendor", details: configUpdateError.message },
      { status: 500 }
    );
  }

  if (!updatedConfig) {
    return NextResponse.json(
      { error: "Active camera configuration not found" },
      { status: 404 }
    );
  }

  revalidatePath("/cameras/health");
  revalidatePath(`/cameras/${id}/edit`);

  return NextResponse.json({ ok: true, camera: updatedCamera });
}
