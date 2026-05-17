// src/app/cameras/health/page.tsx #15
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirectIfDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import { canCreateCamera } from "@/lib/billing/subscriptionPolicy";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import CameraTableRow from "./CameraTableRow";
import CameraHealthMap from "./CameraHealthMap";
import type { BoundaryGeoJson } from "../CameraMap";

type SearchParams = {
  revier?: string;
  changed?: string;
  removed?: string;
  demo_read_only?: string;
};

type RevierRow = {
  id: string;
  name: string;
};

type CameraIngestConfigRow = {
  method: string | null;
  is_active: boolean | null;
  smtp_alias: string | null;
  ftp_username: string | null;
  ftp_password: string | null;
  ftp_inbox_path: string | null;
  manual_label: string | null;
  notes: string | null;
  ingest_token: string | null;
  vendor: string | null;
  external_key: string | null;
  provisioning_status: string | null;
  ftp_host: string | null;
  ftp_port: number | null;
  provisioned_at: string | null;
  deprovisioned_at: string | null;
  last_provisioning_error: string | null;
};

type CameraBaseRow = {
  id: string;
  name: string;
  revier_id: string;
  import_method: string | null;
  technical_name: string | null;
  is_active: boolean;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  direction_deg: number | null;
  notes: string | null;
  reviers: { name: string } | { name: string }[] | null;
  camera_ingest_configs: CameraIngestConfigRow[] | null;
};

type CameraHealthRow = {
  id: string;
  last_seen_at: string | null;
  stale_after_minutes: number;
  offline_after_minutes: number;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
};

type CameraHealthListRow = {
  id: string;
  name: string;
  revier_id: string;
  revier_name: string;
  import_method: string | null;
  technical_name: string | null;
  is_active: boolean;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  direction_deg: number | null;
  notes: string | null;
  last_seen_at: string | null;
  stale_after_minutes: number;
  offline_after_minutes: number;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
  config_method: string | null;
  config_is_active: boolean | null;
  config_smtp_alias: string | null;
  config_ftp_username: string | null;
  config_ftp_password: string | null;
  config_ftp_inbox_path: string | null;
  config_manual_label: string | null;
  config_notes: string | null;
  config_ingest_token: string | null;
  config_vendor: string | null;
  config_external_key: string | null;
  config_provisioning_status: string | null;
  config_ftp_host: string | null;
  config_ftp_port: number | null;
  config_provisioned_at: string | null;
  config_deprovisioned_at: string | null;
  config_last_provisioning_error: string | null;
};

type HealthRuleRow = {
  methodKey: string;
  methodLabel: string;
  staleAfterMinutes: number;
  offlineAfterMinutes: number;
};

type RevierBoundaryRow = {
  geometry: unknown;
};

type CameraMutationRow = {
  id: string;
  organization_id: string;
  is_active: boolean;
};

type SubscriptionPolicyRow = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
  max_cameras: number;
  max_members: number;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Camera status",
      title: "Camera status",
      intro:
        "Monitor the cameras of the active organization within the current ground scope.",
      activeOrganizationNotFound: "Active organization not found.",
      loadGroundsFailed: "Failed to load grounds:",
      loadCamerasFailed: "Failed to load cameras:",
      loadHealthFailed: "Failed to load camera status:",
      noActiveGrounds:
        "There are currently no active grounds for the active organization.",
      demoReadOnly: "Demo mode: changes are disabled.",
      statusSaved: "Camera was saved.",
      cameraRemoved: "Camera was permanently removed.",
      cameraListTitle: "Camera list",
      cameraListText:
        "Visible cameras of the active organization within the valid ground scope.",
      addCamera: "Add camera",
      noCamerasInScopeTitle: "No cameras in current scope",
      noCamerasInScopeText:
        "There are no cameras in the current ground scope.",
      online: "Online",
      stale: "Stale",
      offline: "Offline",
      unknown: "Unknown",
      onlineText: "Cameras with a recent signal inside the online window.",
      staleText: "Cameras with a delayed but not yet critical status.",
      offlineText: "Cameras without signal beyond the offline window.",
      unknownText: "Cameras without a usable last signal.",
      cameraCol: "Camera",
      groundCol: "Ground",
      methodCol: "Method",
      healthCol: "Health",
      statusCol: "Status",
      lastFeedCol: "Ingest",
      configCol: "Config",
      locationCol: "Location",
      actionsCol: "Actions",
      healthRulesPrefix: "* Health rules in current scope:",
      staleFrom: "stale from",
      offlineFrom: "offline from",
      min: "min",
      justNow: "just now",
      agoMin: "min ago",
      agoHour: "h ago",
      agoDay: "d ago",
      active: "Active",
      disabled: "Disabled",
      manual: "Manual",
      allMethods: "All methods",
      targetCameraMissing: "Missing target camera.",
      invalidTargetStatus: "Invalid target status.",
      targetCameraNotFound: "Target camera not found.",
      actorNotAllowed: "Only owner or admin can manage cameras.",
      activeOrganizationRequired: "Active organization context required",
      activeOrganizationMissing: "Active organization not found",
      loadTargetCameraFailed: "Failed to load target camera:",
      saveCameraStatusFailed: "Failed to save camera status:",
      removeCameraFailed: "Failed to remove camera:",
      noSubscriptionFound: "No subscription found for active organization",
      loadSubscriptionPolicyFailed: "Failed to load subscription camera policy:",
      loadActiveCameraUsageFailed: "Failed to load active camera usage:",
    };
  }

  return {
    eyebrow: "Kamerastatus",
    title: "Kamerastatus",
    intro:
      "Überwache hier die Kameras der aktiven Organisation im aktuellen Revier-Scope.",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden.",
    loadGroundsFailed: "Fehler beim Laden der Reviere:",
    loadCamerasFailed: "Fehler beim Laden der Kameras:",
    loadHealthFailed: "Fehler beim Laden des Kamerastatus:",
    noActiveGrounds:
      "Für die aktive Organisation sind derzeit keine aktiven Reviere vorhanden.",
    demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
    statusSaved: "Kamera wurde gespeichert.",
    cameraRemoved: "Kamera wurde dauerhaft entfernt.",
    cameraListTitle: "Kameraliste",
    cameraListText:
      "Sichtbare Kameras der aktiven Organisation im gültigen Revier-Scope.",
    addCamera: "Kamera hinzufügen",
    noCamerasInScopeTitle: "Keine Kameras im aktuellen Scope",
    noCamerasInScopeText:
      "Für den aktuellen Revier-Scope sind keine Kameras vorhanden.",
    online: "Online",
    stale: "Veraltet",
    offline: "Offline",
    unknown: "Unbekannt",
    onlineText:
      "Kameras mit aktuellem Lebenszeichen innerhalb des Online-Fensters.",
    staleText:
      "Kameras mit verspätetem, aber noch nicht kritischem Status.",
    offlineText:
      "Kameras ohne Lebenszeichen jenseits des Offline-Fensters.",
    unknownText:
      "Kameras ohne verwertbares letztes Lebenszeichen.",
    cameraCol: "Kamera",
    groundCol: "Revier",
    methodCol: "Methode",
    healthCol: "Leben",
    statusCol: "Status",
    lastFeedCol: "Ingest",
    configCol: "Config",
    locationCol: "Ort",
    actionsCol: "Aktionen",
    healthRulesPrefix: "* Lebenszeichen-Regeln im aktuellen Scope:",
    staleFrom: "veraltet ab",
    offlineFrom: "offline ab",
    min: "min",
    justNow: "gerade eben",
    agoMin: "vor {n} min",
    agoHour: "vor {n} h",
    agoDay: "vor {n} d",
    active: "Aktiv",
    disabled: "Deaktiviert",
    manual: "Manuell",
    allMethods: "Alle Methoden",
    targetCameraMissing: "Fehlende Ziel-Kamera.",
    invalidTargetStatus: "Ungültiger Ziel-Status.",
    targetCameraNotFound: "Ziel-Kamera nicht gefunden.",
    actorNotAllowed: "Nur Owner oder Admin dürfen Kameras verwalten.",
    activeOrganizationRequired: "Aktiver Organisationskontext erforderlich",
    activeOrganizationMissing: "Aktive Organisation nicht gefunden",
    loadTargetCameraFailed: "Fehler beim Laden der Ziel-Kamera:",
    saveCameraStatusFailed: "Fehler beim Speichern des Kamera-Status:",
    removeCameraFailed: "Fehler beim Entfernen der Kamera:",
    noSubscriptionFound: "Kein Abo für die aktive Organisation gefunden",
    loadSubscriptionPolicyFailed: "Fehler beim Laden der Abo-Kameraregeln:",
    loadActiveCameraUsageFailed:
      "Fehler beim Laden der aktiven Kamera-Nutzung:",
  };
}

const HEALTH_STALE_AFTER_MINUTES = 12 * 60;
const HEALTH_OFFLINE_AFTER_MINUTES = 24 * 60;

function deriveHealthStatus(lastSeenAt: string | null): CameraHealthRow["health_status"] {
  if (!lastSeenAt) return "unknown";

  const lastSeenTime = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenTime)) return "unknown";

  const diffMinutes = Math.floor((Date.now() - lastSeenTime) / 60000);

  if (diffMinutes >= HEALTH_OFFLINE_AFTER_MINUTES) return "offline";
  if (diffMinutes >= HEALTH_STALE_AFTER_MINUTES) return "stale";
  return "online";
}

function formatRuleDuration(minutes: number, language: AppLanguage) {
  const text = t(language);

  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} ${text.min}`;
}


function extractRevierName(
  value: { name: string } | { name: string }[] | null
): string {
  if (!value) return "—";
  if (Array.isArray(value)) return value[0]?.name ?? "—";
  return value.name ?? "—";
}

function firstConfig(
  value: CameraIngestConfigRow[] | null | undefined
): CameraIngestConfigRow | null {
  if (!value || value.length === 0) return null;
  return value[0] ?? null;
}

function buildHealthRules(
  rows: CameraHealthListRow[],
  language: AppLanguage
): HealthRuleRow[] {
  if (rows.length === 0) return [];

  const text = t(language);

  return [
    {
      methodKey: "all",
      methodLabel: text.allMethods,
      staleAfterMinutes: HEALTH_STALE_AFTER_MINUTES,
      offlineAfterMinutes: HEALTH_OFFLINE_AFTER_MINUTES,
    },
  ];
}

function extractGeoJsonFeatures(geometry: unknown): unknown[] {
  if (
    typeof geometry !== "object" ||
    geometry === null ||
    !("type" in geometry)
  ) {
    return [];
  }

  const type = (geometry as { type?: unknown }).type;

  if (type === "FeatureCollection") {
    const features = (geometry as { features?: unknown }).features;
    return Array.isArray(features) ? features : [];
  }

  if (type === "Feature") {
    return [geometry];
  }

  return [];
}

function buildBoundaryGeoJson(boundaries: RevierBoundaryRow[]): BoundaryGeoJson {
  return {
    type: "FeatureCollection" as const,
    features: boundaries.flatMap((boundary) =>
      extractGeoJsonFeatures(boundary.geometry)
    ),
  } as BoundaryGeoJson;
}

function buildReturnUrl(params: {
  revier?: string | null;
  changed?: boolean;
  removed?: boolean;
  demoReadOnly?: boolean;
}) {
  const search = new URLSearchParams();

  if (params.revier) search.set("revier", params.revier);
  if (params.changed) search.set("changed", "1");
  if (params.removed) search.set("removed", "1");
  if (params.demoReadOnly) search.set("demo_read_only", "1");

  const query = search.toString();
  return query ? `/cameras/health?${query}` : "/cameras/health";
}

async function loadCameraForMutation(params: {
  organizationId: string;
  cameraId: string;
}) {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("cameras")
    .select("id,organization_id,is_active")
    .eq("organization_id", params.organizationId)
    .eq("id", params.cameraId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load target camera: ${error.message}`);
  }

  return (data as CameraMutationRow | null) ?? null;
}

async function saveCameraStatus(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/cameras/health");
  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const cookieStore = await cookies();
  const supabase = supabaseServer();

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

  redirectIfDemoWrite(ctx, buildReturnUrl({ demoReadOnly: true }));

  if (!ctx.activeMembership) {
    throw new Error(text.activeOrganizationRequired);
  }

  const actorRole = ctx.activeMembership.role;
  const activeOrganization = ctx.activeMembership.organizations;
  const cameraId = String(formData.get("camera_id") ?? "").trim();
  const nextStatus = String(formData.get("status") ?? "").trim();
  const returnRevier = String(formData.get("return_revier") ?? "").trim();

  if (!activeOrganization) {
    throw new Error(text.activeOrganizationMissing);
  }

  if (!(actorRole === "owner" || actorRole === "admin")) {
    throw new Error(text.actorNotAllowed);
  }

  if (!cameraId) {
    throw new Error(text.targetCameraMissing);
  }

  if (!["active", "disabled"].includes(nextStatus)) {
    throw new Error(text.invalidTargetStatus);
  }

  const targetCamera = await loadCameraForMutation({
    organizationId: activeOrganization.id,
    cameraId,
  });

  if (!targetCamera) {
    throw new Error(text.targetCameraNotFound);
  }

  const nextIsActive = nextStatus === "active";

  if (targetCamera.is_active === nextIsActive) {
    revalidatePath("/cameras/health");
    redirect(buildReturnUrl({ revier: returnRevier || null }));
  }

  if (!targetCamera.is_active && nextIsActive) {
    const [subscriptionResult, activeCameraCountResult] = await Promise.all([
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
      throw new Error(
        `${text.loadSubscriptionPolicyFailed} ${subscriptionResult.error.message}`
      );
    }

    if (!subscriptionResult.data) {
      throw new Error(text.noSubscriptionFound);
    }

    if (activeCameraCountResult.error) {
      throw new Error(
        `${text.loadActiveCameraUsageFailed} ${activeCameraCountResult.error.message}`
      );
    }

    const cameraPolicy = canCreateCamera({
      status: subscriptionResult.data.status,
      trialEndsAt: subscriptionResult.data.trial_ends_at,
      currentPeriodEnd: subscriptionResult.data.current_period_end,
      maxCameras: subscriptionResult.data.max_cameras,
      maxMembers: subscriptionResult.data.max_members,
      currentCameraCount: activeCameraCountResult.count ?? 0,
      activeMemberCount: 0,
      openInviteCount: 0,
    });

    if (!cameraPolicy.allowed) {
      throw new Error(cameraPolicy.message);
    }
  }

  const { error } = await supabase
    .from("cameras")
    .update({ is_active: nextIsActive })
    .eq("organization_id", activeOrganization.id)
    .eq("id", cameraId);

  if (error) {
    throw new Error(`${text.saveCameraStatusFailed} ${error.message}`);
  }

  revalidatePath("/cameras/health");
  revalidatePath("/cameras/new");
  redirect(
    buildReturnUrl({
      revier: returnRevier || null,
      changed: true,
    })
  );
}

async function removeCamera(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/cameras/health");
  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const cookieStore = await cookies();
  const supabase = supabaseServer();

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

  redirectIfDemoWrite(ctx, buildReturnUrl({ demoReadOnly: true }));

  if (!ctx.activeMembership) {
    throw new Error(text.activeOrganizationRequired);
  }

  const actorRole = ctx.activeMembership.role;
  const activeOrganization = ctx.activeMembership.organizations;
  const cameraId = String(formData.get("camera_id") ?? "").trim();
  const returnRevier = String(formData.get("return_revier") ?? "").trim();

  if (!activeOrganization) {
    throw new Error(text.activeOrganizationMissing);
  }

  if (!(actorRole === "owner" || actorRole === "admin")) {
    throw new Error(text.actorNotAllowed);
  }

  if (!cameraId) {
    throw new Error(text.targetCameraMissing);
  }

  const targetCamera = await loadCameraForMutation({
    organizationId: activeOrganization.id,
    cameraId,
  });

  if (!targetCamera) {
    throw new Error(text.targetCameraNotFound);
  }

  const { error } = await supabase
    .from("cameras")
    .delete()
    .eq("organization_id", activeOrganization.id)
    .eq("id", cameraId);

  if (error) {
    throw new Error(`${text.removeCameraFailed} ${error.message}`);
  }

  revalidatePath("/cameras/health");
  revalidatePath("/cameras/new");
  redirect(
    buildReturnUrl({
      revier: returnRevier || null,
      removed: true,
    })
  );
}

function PageHeader({
  text,
}: {
  text: ReturnType<typeof t>;
}) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
        {text.eyebrow}
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        {text.title}
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-white/68">{text.intro}</p>
    </section>
  );
}

function StatCard({
  title,
  value,
  text,
}: {
  title: string;
  value: number;
  text: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="text-sm text-white/50">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <p className="mt-2 text-sm text-white/68">{text}</p>
    </div>
  );
}

export default async function CamerasHealthPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/cameras/health");

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const cookieStore = await cookies();
  const supabase = supabaseServer();

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

  if (!ctx.activeMembership) {
    throw new Error(text.activeOrganizationRequired);
  }

  const activeOrganization = ctx.activeMembership.organizations;
  const actorRole = ctx.activeMembership.role;
  const canManageCameras = actorRole === "owner" || actorRole === "admin";
  const isDemo = ctx.isDemo;

  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  const rawRevier = searchParams?.revier;
  const changed = searchParams?.changed === "1";
  const removed = searchParams?.removed === "1";
  const demoReadOnly = searchParams?.demo_read_only === "1";

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <PageHeader text={text} />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.activeOrganizationNotFound}
        </div>
      </main>
    );
  }

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-8">
        <PageHeader text={text} />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.loadGroundsFailed} {reviersError.message}
        </div>
      </main>
    );
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const allowedReviers: RevierOption[] = reviers.map((revier) => ({
    id: revier.id,
    name: revier.name,
  }));
  const revierScope = resolveRevierScope(rawRevier, allowedReviers);
  const allowedRevierIds = allowedReviers.map((revier) => revier.id);

  if (allowedRevierIds.length === 0) {
    return (
      <main className="space-y-8">
        <PageHeader text={text} />

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          {text.noActiveGrounds}
        </div>
      </main>
    );
  }

  let camerasQuery = supabase
    .from("cameras")
    .select(`
      id,
      name,
      revier_id,
      import_method,
      technical_name,
      is_active,
      location_name,
      latitude,
      longitude,
      direction_deg,
      notes,
      reviers(name),
      camera_ingest_configs(
        method,
        is_active,
        smtp_alias,
        ftp_username,
        ftp_password,
        ftp_inbox_path,
        manual_label,
        notes,
        ingest_token,
        vendor,
        external_key,
        provisioning_status,
        ftp_host,
        ftp_port,
        provisioned_at,
        deprovisioned_at,
        last_provisioning_error
      )
    `)
    .eq("organization_id", activeOrganization.id)
    .order("name", { ascending: true });

  camerasQuery =
    revierScope.type === "single"
      ? camerasQuery.eq("revier_id", revierScope.revierId)
      : camerasQuery.in("revier_id", allowedRevierIds);

  const { data: camerasData, error: camerasError } = await camerasQuery;

  if (camerasError) {
    return (
      <main className="space-y-8">
        <PageHeader text={text} />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.loadCamerasFailed} {camerasError.message}
        </div>
      </main>
    );
  }

  const cameraBaseRows = (camerasData ?? []) as CameraBaseRow[];
  const cameraIds = cameraBaseRows.map((camera) => camera.id);

  if (cameraIds.length === 0) {
    return (
      <main className="space-y-8">
        <PageHeader text={text} />

        {demoReadOnly ? (
          <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
            <p className="text-sm text-amber-100">{text.demoReadOnly}</p>
          </section>
        ) : null}

        {changed ? (
          <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="text-sm text-emerald-100">{text.statusSaved}</p>
          </section>
        ) : null}

        {removed ? (
          <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="text-sm text-emerald-100">{text.cameraRemoved}</p>
          </section>
        ) : null}

        <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
            <div>
              <h2 className="text-lg font-medium text-white">
                {text.cameraListTitle}
              </h2>
              <p className="mt-1 text-sm text-white/65">
                {text.cameraListText}
              </p>
            </div>
            <Link
              href="/cameras/new"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              {text.addCamera}
            </Link>
          </div>

          <div className="px-6 py-10">
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 p-8">
              <h3 className="text-base font-medium text-white">
                {text.noCamerasInScopeTitle}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
                {text.noCamerasInScopeText}
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const { data: healthData, error: healthError } = await supabase
    .from("camera_health")
    .select(
      "id,last_seen_at,stale_after_minutes,offline_after_minutes,health_status"
    )
    .in("id", cameraIds);

  if (healthError) {
    return (
      <main className="space-y-8">
        <PageHeader text={text} />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.loadHealthFailed} {healthError.message}
        </div>
      </main>
    );
  }

  const healthRows = (healthData ?? []) as CameraHealthRow[];
  const healthById = new Map(healthRows.map((row) => [row.id, row]));

  const rows: CameraHealthListRow[] = cameraBaseRows.map((camera) => {
    const health = healthById.get(camera.id);
    const config = firstConfig(camera.camera_ingest_configs);

    return {
      id: camera.id,
      name: camera.name,
      revier_id: camera.revier_id,
      revier_name: extractRevierName(camera.reviers),
      import_method: camera.import_method,
      technical_name: camera.technical_name ?? null,
      is_active: camera.is_active,
      location_name: camera.location_name ?? null,
      latitude: camera.latitude ?? null,
      longitude: camera.longitude ?? null,
      direction_deg: camera.direction_deg ?? null,
      notes: camera.notes ?? null,
      last_seen_at: health?.last_seen_at ?? null,
      stale_after_minutes: HEALTH_STALE_AFTER_MINUTES,
      offline_after_minutes: HEALTH_OFFLINE_AFTER_MINUTES,
      health_status: deriveHealthStatus(health?.last_seen_at ?? null),
      config_method: config?.method ?? null,
      config_is_active: config?.is_active ?? null,
      config_smtp_alias: config?.smtp_alias ?? null,
      config_ftp_username: config?.ftp_username ?? null,
      config_ftp_password: config?.ftp_password ?? null,
      config_ftp_inbox_path: config?.ftp_inbox_path ?? null,
      config_manual_label: config?.manual_label ?? null,
      config_notes: config?.notes ?? null,
      config_ingest_token: config?.ingest_token ?? null,
      config_vendor: config?.vendor ?? null,
      config_external_key: config?.external_key ?? null,
      config_provisioning_status: config?.provisioning_status ?? null,
      config_ftp_host: config?.ftp_host ?? null,
      config_ftp_port: config?.ftp_port ?? null,
      config_provisioned_at: config?.provisioned_at ?? null,
      config_deprovisioned_at: config?.deprovisioned_at ?? null,
      config_last_provisioning_error: config?.last_provisioning_error ?? null,
    };
  });

  const scopedRevierIds =
    revierScope.type === "single" ? [revierScope.revierId] : allowedRevierIds;

  const { data: boundariesData, error: boundariesError } = await supabase
    .from("revier_boundaries")
    .select("geometry")
    .eq("organization_id", activeOrganization.id)
    .in("revier_id", scopedRevierIds);

  if (boundariesError) {
    return (
      <main className="space-y-8">
        <PageHeader text={text} />
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {boundariesError.message}
        </div>
      </main>
    );
  }

  const boundaryGeoJson = buildBoundaryGeoJson(
    (boundariesData ?? []) as RevierBoundaryRow[]
  );

  const onlineCount = rows.filter((row) => row.health_status === "online").length;
  const staleCount = rows.filter((row) => row.health_status === "stale").length;
  const offlineCount = rows.filter((row) => row.health_status === "offline").length;
  const unknownCount = rows.filter((row) => row.health_status === "unknown").length;

  const healthRules = buildHealthRules(rows, language);
  const healthRuleHint =
    healthRules.length > 0
      ? healthRules
          .map(
            (rule) =>
              `${rule.methodLabel}: ${text.staleFrom} ${formatRuleDuration(rule.staleAfterMinutes, language)}, ${text.offlineFrom} ${formatRuleDuration(rule.offlineAfterMinutes, language)}`
          )
          .join(" · ")
      : null;

  return (
    <main className="space-y-8">
      <PageHeader text={text} />

      {demoReadOnly ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">{text.demoReadOnly}</p>
        </section>
      ) : null}

      {changed ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">{text.statusSaved}</p>
        </section>
      ) : null}

      {removed ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">{text.cameraRemoved}</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title={text.online} value={onlineCount} text={text.onlineText} />
        <StatCard title={text.stale} value={staleCount} text={text.staleText} />
        <StatCard title={text.offline} value={offlineCount} text={text.offlineText} />
        <StatCard title={text.unknown} value={unknownCount} text={text.unknownText} />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <div>
            <h2 className="text-lg font-medium text-white">
              {text.cameraListTitle}
            </h2>
            <p className="mt-1 text-sm text-white/65">{text.cameraListText}</p>
          </div>

          <Link
            href="/cameras/new"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            {text.addCamera}
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-white/55">
              <tr>
                <th className="px-6 py-3 font-medium whitespace-nowrap">
                  {text.cameraCol}
                </th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">
                  {text.groundCol}
                </th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">
                  {text.methodCol}
                </th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">
                  {text.statusCol}
                </th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">
                  {text.healthCol}
                </th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">
                  {text.lastFeedCol}
                </th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">
                  {text.configCol}
                </th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">
                  {text.locationCol}
                </th>
                <th className="px-6 py-3 font-medium whitespace-nowrap text-right">
                  {text.actionsCol}
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <CameraTableRow
                  key={row.id}
                  row={row}
                  canManageCameras={canManageCameras}
                  returnRevier={rawRevier ?? ""}
                  saveAction={saveCameraStatus}
                  removeAction={removeCamera}
                  isDemo={isDemo}
                  language={language}
                />
              ))}
            </tbody>
          </table>
        </div>

        {healthRuleHint ? (
          <div className="border-t border-white/8 px-6 py-3 text-xs text-white/45">
            {text.healthRulesPrefix} {healthRuleHint}
          </div>
        ) : null}
      </section>

      <CameraHealthMap
        cameras={rows}
        language={language}
        boundaryGeoJson={boundaryGeoJson}
      />
    </main>
  );
}