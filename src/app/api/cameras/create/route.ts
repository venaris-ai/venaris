// src/app/api/cameras/create/route.ts #5
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";
import { canCreateCamera } from "@/lib/billing/subscriptionPolicy";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

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

type ProvisioningRow = {
  camera_id: string;
  technical_name: string;
  ingest_token: string;
  smtp_alias: string | null;
  ftp_username: string | null;
  ftp_inbox_path: string | null;
  manual_label: string | null;
};

type SubscriptionPolicyRow = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
  max_cameras: number;
  max_members: number;
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

const FTP_PUBLIC_HOST = process.env.FTP_PUBLIC_HOST || "159.69.109.128";
const FTP_PUBLIC_PORT = Number(process.env.FTP_PUBLIC_PORT || "21");

const HETZNER_PROVISIONER_URL = process.env.HETZNER_PROVISIONER_URL || "";
const HETZNER_PROVISIONER_TOKEN = process.env.HETZNER_PROVISIONER_TOKEN || "";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "active organization not found",
        cameraNameRequired: "cameraName required",
        invalidMethod: "invalid method",
        invalidVendor: "invalid vendor",
        invalidDirectionDeg: "directionDeg must be 0-359",
        subscriptionCheckFailed: "subscription check failed",
        noSubscriptionFound: "no subscription found for active organization",
        cameraUsageCheckFailed: "camera usage check failed",
        cameraCreationBlocked: "camera creation blocked",
        provisioningFailed: "provisioning failed",
        noProvisioningResult: "no provisioning result",
        ftpProvisioningFailed: "ftp provisioning failed",
        missingFtpRoutingValues: "missing ftp routing values",
        unexpectedError: "unexpected error",
      }
    : {
        activeOrganizationNotFound: "aktive Organisation nicht gefunden",
        cameraNameRequired: "cameraName erforderlich",
        invalidMethod: "ungültige Methode",
        invalidVendor: "ungültiger Hersteller",
        invalidDirectionDeg: "directionDeg muss zwischen 0 und 359 liegen",
        subscriptionCheckFailed: "Prüfung des Abos fehlgeschlagen",
        noSubscriptionFound: "kein Abo für die aktive Organisation gefunden",
        cameraUsageCheckFailed: "Prüfung der Kamera-Nutzung fehlgeschlagen",
        cameraCreationBlocked: "Kameraanlage gesperrt",
        provisioningFailed: "Provisioning fehlgeschlagen",
        noProvisioningResult: "kein Provisioning-Ergebnis",
        ftpProvisioningFailed: "FTP-Provisioning fehlgeschlagen",
        missingFtpRoutingValues: "fehlende FTP-Routing-Werte",
        unexpectedError: "unerwarteter Fehler",
      };
}

function generateFtpPassword(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";

  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, alphabet.length);
    out += alphabet[idx];
  }

  return out;
}

async function updateProvisioningStatus(params: {
  cameraId: string;
  method: Method;
  provisioningStatus: "pending" | "ready" | "failed" | "disabled" | "deprovisioned";
  ftpHost?: string | null;
  ftpPort?: number | null;
  ftpPassword?: string | null;
  provisionedAt?: string | null;
  deprovisionedAt?: string | null;
  lastProvisioningError?: string | null;
}) {
  const supabase = supabaseServer();

  const update: Record<string, unknown> = {
    provisioning_status: params.provisioningStatus,
    last_provisioning_error: params.lastProvisioningError ?? null,
  };

  if (params.method === "ftp") {
    update.ftp_host = params.ftpHost ?? null;
    update.ftp_port = params.ftpPort ?? null;
    update.ftp_password = params.ftpPassword ?? null;
    update.provisioned_at = params.provisionedAt ?? null;
    update.deprovisioned_at = params.deprovisionedAt ?? null;
  }

  const { error } = await supabase
    .from("camera_ingest_configs")
    .update(update)
    .eq("camera_id", params.cameraId)
    .eq("method", params.method)
    .eq("is_active", true);

  if (error) {
    throw new Error(`failed to update provisioning status: ${error.message}`);
  }
}

async function provisionFtpOnHetzner(params: {
  technicalName: string;
  ftpUsername: string;
  ftpPassword: string;
  ftpInboxPath: string;
}) {
  if (!HETZNER_PROVISIONER_URL || !HETZNER_PROVISIONER_TOKEN) {
    throw new Error(
      "missing HETZNER_PROVISIONER_URL or HETZNER_PROVISIONER_TOKEN"
    );
  }

  const resp = await fetch(HETZNER_PROVISIONER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${HETZNER_PROVISIONER_TOKEN}`,
    },
    body: JSON.stringify({
      action: "provision_ftp_camera",
      technicalName: params.technicalName,
      ftpUsername: params.ftpUsername,
      ftpPassword: params.ftpPassword,
      ftpInboxPath: params.ftpInboxPath,
    }),
    cache: "no-store",
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `hetzner ftp provisioning failed ${resp.status}: ${text.slice(0, 800)}`
    );
  }

  return resp.json().catch(() => ({}));
}

export async function POST(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const body = (await req.json()) as Partial<Payload>;

    const ctx = await requireOrganizationRole(["owner", "admin"]);
    assertNotDemoWrite(ctx);

    const { activeMembership } = ctx;
    const activeOrganization = activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: text.activeOrganizationNotFound },
        { status: 400 }
      );
    }

    if (!body.cameraName || !body.cameraName.trim()) {
      return NextResponse.json(
        { error: text.cameraNameRequired },
        { status: 400 }
      );
    }

    if (!body.method || !METHODS.has(body.method)) {
      return NextResponse.json(
        { error: text.invalidMethod },
        { status: 400 }
      );
    }

    if (!body.vendor || !VENDORS.has(body.vendor)) {
      return NextResponse.json(
        { error: text.invalidVendor },
        { status: 400 }
      );
    }

    if (
      body.directionDeg != null &&
      (!Number.isInteger(body.directionDeg) ||
        body.directionDeg < 0 ||
        body.directionDeg >= 360)
    ) {
      return NextResponse.json(
        { error: text.invalidDirectionDeg },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const [subscriptionResult, cameraCountResult] = await Promise.all([
      supabase
        .from("organization_subscriptions")
        .select("status,trial_ends_at,current_period_end,max_cameras,max_members")
        .eq("organization_id", activeOrganization.id)
        .maybeSingle<SubscriptionPolicyRow>(),

      supabase
        .from("cameras")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", activeOrganization.id)
        .eq("is_active", true),
    ]);

    if (subscriptionResult.error) {
      return NextResponse.json(
        {
          error: text.subscriptionCheckFailed,
          details: subscriptionResult.error.message,
        },
        { status: 500 }
      );
    }

    if (!subscriptionResult.data) {
      return NextResponse.json(
        { error: text.noSubscriptionFound },
        { status: 403 }
      );
    }

    if (cameraCountResult.error) {
      return NextResponse.json(
        {
          error: text.cameraUsageCheckFailed,
          details: cameraCountResult.error.message,
        },
        { status: 500 }
      );
    }

    const cameraPolicy = canCreateCamera({
      status: subscriptionResult.data.status,
      trialEndsAt: subscriptionResult.data.trial_ends_at,
      currentPeriodEnd: subscriptionResult.data.current_period_end,
      maxCameras: subscriptionResult.data.max_cameras,
      maxMembers: subscriptionResult.data.max_members,
      currentCameraCount: cameraCountResult.count ?? 0,
      activeMemberCount: 0,
      openInviteCount: 0,
      language,
    });

    if (!cameraPolicy.allowed) {
      return NextResponse.json(
        {
          error: text.cameraCreationBlocked,
          details: cameraPolicy.message,
          reason: cameraPolicy.reason,
        },
        { status: 403 }
      );
    }

    const { data, error } = await supabase.rpc("create_camera_with_provisioning", {
      p_organization_id: activeOrganization.id,
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
        { error: text.provisioningFailed, details: error.message },
        { status: 500 }
      );
    }

    const row = (Array.isArray(data) ? data[0] : data) as ProvisioningRow | null;

    if (!row) {
      return NextResponse.json(
        { error: text.noProvisioningResult },
        { status: 500 }
      );
    }

    if (body.method === "ftp") {
      if (!row.ftp_username || !row.ftp_inbox_path) {
        await updateProvisioningStatus({
          cameraId: row.camera_id,
          method: "ftp",
          provisioningStatus: "failed",
          ftpHost: FTP_PUBLIC_HOST,
          ftpPort: FTP_PUBLIC_PORT,
          lastProvisioningError:
            "missing ftp_username or ftp_inbox_path in provisioning result",
        });

        return NextResponse.json(
          {
            error: text.ftpProvisioningFailed,
            details: text.missingFtpRoutingValues,
          },
          { status: 500 }
        );
      }

      const ftpPassword = generateFtpPassword();

      try {
        await provisionFtpOnHetzner({
          technicalName: row.technical_name,
          ftpUsername: row.ftp_username,
          ftpPassword,
          ftpInboxPath: row.ftp_inbox_path,
        });

        await updateProvisioningStatus({
          cameraId: row.camera_id,
          method: "ftp",
          provisioningStatus: "ready",
          ftpHost: FTP_PUBLIC_HOST,
          ftpPort: FTP_PUBLIC_PORT,
          ftpPassword,
          provisionedAt: new Date().toISOString(),
          lastProvisioningError: null,
        });

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
            ftpProvisioning: {
              host: FTP_PUBLIC_HOST,
              port: FTP_PUBLIC_PORT,
              username: row.ftp_username,
              password: ftpPassword,
              path: "/",
              passiveMode: true,
            },
          },
          { status: 201 }
        );
      } catch (e) {
        const details = e instanceof Error ? e.message : String(e);

        await updateProvisioningStatus({
          cameraId: row.camera_id,
          method: "ftp",
          provisioningStatus: "failed",
          ftpHost: FTP_PUBLIC_HOST,
          ftpPort: FTP_PUBLIC_PORT,
          lastProvisioningError: details,
        });

        return NextResponse.json(
          {
            error: text.ftpProvisioningFailed,
            details,
            camera: {
              id: row.camera_id,
              technicalName: row.technical_name,
            },
          },
          { status: 500 }
        );
      }
    }

    if (body.method === "smtp") {
      await updateProvisioningStatus({
        cameraId: row.camera_id,
        method: "smtp",
        provisioningStatus: "ready",
        lastProvisioningError: null,
      });
    }

    if (body.method === "manual") {
      await updateProvisioningStatus({
        cameraId: row.camera_id,
        method: "manual",
        provisioningStatus: "ready",
        lastProvisioningError: null,
      });
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
        error: text.unexpectedError,
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}