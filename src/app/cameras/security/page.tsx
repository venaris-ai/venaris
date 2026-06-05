// src/app/cameras/security/page.tsx #2
export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import { formatAppDateTime } from "@/lib/dateTime";
import { resolveAssetPreviewUrl } from "@/lib/demoAssetResolver";

type SearchParams = {
  revier?: string;
  camera?: string;
  from?: string;
  to?: string;
};

type OrganizationSecurityRow = {
  id: string;
  is_demo: boolean;
  security_detections_enabled: boolean;
};

type RevierRow = {
  id: string;
  name: string;
  timezone: string | null;
};

type CameraScopeRow = {
  id: string;
  name: string | null;
  revier_id: string | null;
};

type SecurityDetectionRow = {
  id: string;
  organization_id: string;
  revier_id: string | null;
  camera_id: string;
  asset_id: string;
  detected_class: "human" | "vehicle";
  score: number | null;
  captured_at: string | null;
  created_at: string;
  delete_after: string;
};

type SecurityAssetRow = {
  id: string;
  camera_id: string;
  storage_path: string | null;
  captured_at: string | null;
  created_at: string;
  storage_deleted_at: string | null;
};

type SecurityListItem = {
  id: string;
  assetId: string;
  cameraId: string;
  cameraName: string | null;
  revierId: string | null;
  detectedClass: "human" | "vehicle";
  score: number | null;
  capturedAt: string | null;
  createdAt: string;
  deleteAfter: string;
  previewUrl: string | null;
  timeZone: string | null;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      activeOrganizationContextRequired: "Active organization context required",
      activeOrganizationNotFound: "Active organization not found",
      eyebrow: "Security",
      title: "Security",
      intro:
        "Person and vehicle detections from your cameras. These captures are separate from wildlife events and are not used for species identification, wildlife analytics, or PopSim.",
      inactiveTitle: "Security detections are not enabled",
      inactiveText:
        "Enable person and vehicle detections in your organization account settings before security detections can appear here.",
      accountLink: "Open account settings",
      emptyTitle: "No person or vehicle detections yet",
      emptyText:
        "Future camera images with people or vehicles will appear here for 30 days.",
      time: "Time",
      camera: "Camera",
      type: "Type",
      probability: "Confidence",
      image: "Image",
      person: "Person",
      vehicle: "Vehicle",
      unnamedCamera: "Unnamed camera",
      noPreview: "No image",
      apiError: "API error",
    };
  }

  return {
    activeOrganizationContextRequired: "Aktiver Organisationskontext erforderlich",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden",
    eyebrow: "Sicherheit",
    title: "Sicherheit",
    intro:
      "Personen- und Fahrzeugerkennungen Deiner Kameras. Diese Aufnahmen sind von Wildlife-Ereignissen getrennt und werden nicht für Wildartenbestimmung, Wildlife-Auswertungen oder PopSim verwendet.",
    inactiveTitle: "Sicherheitserkennungen sind nicht aktiviert",
    inactiveText:
      "Aktiviere Personen- und Fahrzeugerkennungen in den Kontoeinstellungen Deiner Organisation, bevor hier Sicherheitserkennungen erscheinen können.",
    accountLink: "Kontoeinstellungen öffnen",
    emptyTitle: "Noch keine Personen- oder Fahrzeugerkennungen",
    emptyText:
      "Zukünftige Kamerabilder mit Personen oder Fahrzeugen erscheinen hier für 30 Tage.",
    time: "Zeit",
    camera: "Kamera",
    type: "Typ",
    probability: "Sicherheit",
    image: "Bild",
    person: "Person",
    vehicle: "Fahrzeug",
    unnamedCamera: "Unbenannte Kamera",
    noPreview: "Kein Bild",
    apiError: "API Fehler",
  };
}

function parseDateParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

function formatProbability(value?: number | null) {
  if (typeof value !== "number") return "—";
  return `${Math.round(value * 100)}%`;
}

function formatType(
  value: "human" | "vehicle",
  text: ReturnType<typeof t>
) {
  return value === "human" ? text.person : text.vehicle;
}

function sortItems(items: SecurityListItem[]) {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.capturedAt ?? a.createdAt ?? 0).getTime();
    const bTs = new Date(b.capturedAt ?? b.createdAt ?? 0).getTime();
    return bTs - aTs;
  });
}

export default async function CamerasSecurityPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/cameras/security");

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const activeOrganization = ctx.activeMembership.organizations;

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  const supabase = supabaseServer();
  const cookieStore = await cookies();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  const text = t(language);
  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;
  const rawRevier = searchParams?.revier;
  const rawCamera = searchParams?.camera;
  const fromDate = parseDateParam(searchParams?.from);
  const toDate = parseDateParam(searchParams?.to);

  let items: SecurityListItem[] = [];
  let apiError: string | null = null;

  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("id,is_demo,security_detections_enabled")
    .eq("id", activeOrganization.id)
    .single();

  if (organizationError) {
    throw new Error(`Failed to load organization: ${organizationError.message}`);
  }

  const organization = organizationData as OrganizationSecurityRow;

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,timezone")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    apiError = reviersError.message;
  }

  if (!apiError && organization.security_detections_enabled) {
    const reviers = (reviersData ?? []) as RevierRow[];
    const allowedReviers: RevierOption[] = reviers.map((revier) => ({
      id: revier.id,
      name: revier.name,
    }));
    const revierScope = resolveRevierScope(rawRevier, allowedReviers);
    const allowedRevierIds = allowedReviers.map((revier) => revier.id);
    const timeZoneByRevierId = new Map(
      reviers.map((revier) => [revier.id, revier.timezone] as const)
    );

    if (allowedRevierIds.length > 0) {
      let camerasQuery = supabase
        .from("cameras")
        .select("id,name,revier_id")
        .eq("organization_id", activeOrganization.id);

      camerasQuery =
        revierScope.type === "single"
          ? camerasQuery.eq("revier_id", revierScope.revierId)
          : camerasQuery.in("revier_id", allowedRevierIds);

      const { data: camerasData, error: camerasError } = await camerasQuery;

      if (camerasError) {
        apiError = camerasError.message;
      } else {
        const cameras = (camerasData ?? []) as CameraScopeRow[];
        const allowedCameraIds = cameras.map((camera) => camera.id);
        const selectedCameraId =
          rawCamera && allowedCameraIds.includes(rawCamera) ? rawCamera : undefined;
        const filteredCameraIds = selectedCameraId
          ? [selectedCameraId]
          : allowedCameraIds;

        if (filteredCameraIds.length > 0) {
          const cameraNameById = new Map(
            cameras.map((camera) => [camera.id, camera.name] as const)
          );
          const revierIdByCameraId = new Map(
            cameras.map((camera) => [camera.id, camera.revier_id] as const)
          );

          let securityQuery = supabase
            .from("security_detections")
            .select(
              "id,organization_id,revier_id,camera_id,asset_id,detected_class,score,captured_at,created_at,delete_after"
            )
            .eq("organization_id", activeOrganization.id)
            .in("camera_id", filteredCameraIds)
            .gt("delete_after", new Date().toISOString())
            .order("captured_at", { ascending: false, nullsFirst: false })
            .limit(60);

          if (fromDate) {
            securityQuery = securityQuery.gte("captured_at", `${fromDate}T00:00:00`);
          }

          if (toDate) {
            securityQuery = securityQuery.lte("captured_at", `${toDate}T23:59:59.999`);
          }

          const { data: securityData, error: securityError } =
            await securityQuery.returns<SecurityDetectionRow[]>();

          if (securityError) {
            apiError = securityError.message;
          } else {
            const detections = securityData ?? [];
            const assetIds = Array.from(
              new Set(detections.map((item) => item.asset_id).filter(Boolean))
            );

            let assets: SecurityAssetRow[] = [];
            if (assetIds.length > 0) {
              const { data: assetsData, error: assetsError } = await supabase
                .from("assets")
                .select("id,camera_id,storage_path,captured_at,created_at,storage_deleted_at")
                .in("id", assetIds)
                .is("storage_deleted_at", null)
                .returns<SecurityAssetRow[]>();

              if (assetsError) {
                apiError = assetsError.message;
              } else {
                assets = assetsData ?? [];
              }
            }

            if (!apiError) {
              const assetById = new Map(assets.map((asset) => [asset.id, asset]));

              const resolvedItems: SecurityListItem[] = [];

              for (const detection of detections) {
                const asset = assetById.get(detection.asset_id);
                if (!asset) continue;

                const revierId =
                  detection.revier_id ?? revierIdByCameraId.get(detection.camera_id) ?? null;

                const previewUrl = await resolveAssetPreviewUrl({
                  asset: {
                    id: asset.id,
                    camera_id: asset.camera_id,
                    storage_path: asset.storage_path,
                  },
                  isDemo: organization.is_demo,
                });

                resolvedItems.push({
                  id: detection.id,
                  assetId: detection.asset_id,
                  cameraId: detection.camera_id,
                  cameraName: cameraNameById.get(detection.camera_id) ?? null,
                  revierId,
                  detectedClass: detection.detected_class,
                  score: detection.score,
                  capturedAt: detection.captured_at ?? asset.captured_at,
                  createdAt: detection.created_at,
                  deleteAfter: detection.delete_after,
                  previewUrl,
                  timeZone: revierId ? timeZoneByRevierId.get(revierId) ?? null : null,
                });
              }

              items = sortItems(resolvedItems);
            }
          }
        }
      }
    }
  }

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            {text.intro}
          </p>
        </div>
      </section>

      {!organization.security_detections_enabled ? (
        <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6">
          <h2 className="text-lg font-medium text-white">
            {text.inactiveTitle}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            {text.inactiveText}
          </p>
          <Link
            href="/orga/account"
            className="mt-5 inline-flex rounded-full border border-amber-300/30 bg-amber-300/15 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-300/20"
          >
            {text.accountLink}
          </Link>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-white/8 bg-white/5 text-left text-white/55">
              <tr>
                <th className="px-3 py-2">{text.image}</th>
                <th className="px-3 py-2">{text.time}</th>
                <th className="px-3 py-2">{text.camera}</th>
                <th className="px-3 py-2">{text.type}</th>
                <th className="px-3 py-2">{text.probability}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-white/45" colSpan={5}>
                    <div className="font-medium text-white/72">{text.emptyTitle}</div>
                    <div className="mt-1 text-white/45">{text.emptyText}</div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-white/8 last:border-b-0"
                  >
                    <td className="px-3 py-3">
                      {item.previewUrl ? (
                        <div className="relative h-20 w-28 overflow-hidden rounded-[14px] border border-white/10 bg-black/20">
                          <Image
                            src={item.previewUrl}
                            alt=""
                            fill
                            sizes="112px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-20 w-28 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-xs text-white/38">
                          {text.noPreview}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-white/72 whitespace-nowrap">
                      {formatAppDateTime(
                        item.capturedAt ?? item.createdAt,
                        language,
                        item.timeZone
                      )}
                    </td>
                    <td className="px-3 py-3 text-white">
                      {item.cameraName?.trim() || text.unnamedCamera}
                    </td>
                    <td className="px-3 py-3 text-white/72">
                      {formatType(item.detectedClass, text)}
                    </td>
                    <td className="px-3 py-3 text-white/72">
                      {formatProbability(item.score)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {apiError ? (
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.apiError}: {apiError}
        </div>
      ) : null}
    </main>
  );
}
