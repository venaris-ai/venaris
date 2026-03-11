import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type Vendor =
  | "berger&schröter"
  | "blazevideo"
  | "braun"
  | "bushnell"
  | "gardepro"
  | "hikmicro"
  | "maginon"
  | "minox"
  | "reconyx"
  | "reolink"
  | "seissiger"
  | "spypoint"
  | "xview"
  | "zeiss"
  | "other";

type Method = "smtp" | "ftp" | "manual";

type Payload = {
  organizationId: string;
  cameraName: string;
  method: Method;
  vendor: Vendor;
  revierId?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  directionDeg?: number | null;
  notes?: string | null;
};

const METHODS = new Set<Method>(["smtp", "ftp", "manual"]);
const VENDORS = new Set<Vendor>([
  "berger&schröter",
  "blazevideo",
  "braun",
  "bushnell",
  "gardepro",
  "hikmicro",
  "maginon",
  "minox",
  "reconyx",
  "reolink",
  "seissiger",
  "spypoint",
  "xview",
  "zeiss",
  "other",
]);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Payload>;

    if (!body.organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    if (!body.cameraName || !body.cameraName.trim()) {
      return NextResponse.json({ error: "cameraName required" }, { status: 400 });
    }

    if (!body.method || !METHODS.has(body.method)) {
      return NextResponse.json({ error: "invalid method" }, { status: 400 });
    }

    if (!body.vendor || !VENDORS.has(body.vendor)) {
      return NextResponse.json({ error: "invalid vendor" }, { status: 400 });
    }

    if (
      body.directionDeg != null &&
      (!Number.isInteger(body.directionDeg) ||
        body.directionDeg < 0 ||
        body.directionDeg >= 360)
    ) {
      return NextResponse.json({ error: "directionDeg must be 0-359" }, { status: 400 });
    }

    const supabase = supabaseServer();

    const { data, error } = await supabase.rpc("create_camera_with_provisioning", {
      p_organization_id: body.organizationId,
      p_camera_name: body.cameraName.trim(),
      p_method: body.method,
      p_vendor: body.vendor,
      p_revier_id: body.revierId ?? null,
      p_location_name: body.locationName ?? null,
      p_latitude: body.latitude ?? null,
      p_longitude: body.longitude ?? null,
      p_direction_deg: body.directionDeg ?? null,
      p_notes: body.notes ?? null,
      p_brand: null,
      p_model: null,
      p_installed_at: null,
    });

    if (error) {
      return NextResponse.json(
        { error: "provisioning failed", details: error.message },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      return NextResponse.json({ error: "no provisioning result" }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        camera: {
          id: row.camera_id,
          name: body.cameraName,
          technicalName: row.technical_name,
          ingestToken: row.ingest_token,
          routing: {
            smtpAlias: row.smtp_alias,
            ftpUsername: row.ftp_username,
            ftpInboxPath: row.ftp_inbox_path,
            manualLabel: row.manual_label,
          },
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: "unexpected error",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}