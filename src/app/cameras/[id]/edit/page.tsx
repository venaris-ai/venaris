// src/app/cameras/[id]/edit/page.tsx #1
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import EditCameraForm from "./EditCameraForm";

type PageParams = {
  id: string;
};

type SearchParams = {
  return_revier?: string;
};

type RevierRow = {
  id: string;
  name: string;
  organization_id: string | null;
  status: "active" | "paused" | "archived";
  is_default: boolean;
};

type CameraVendorRow = {
  key: string;
  label: string;
};

type CameraIngestConfigRow = {
  vendor: string | null;
};

type CameraRow = {
  id: string;
  organization_id: string;
  revier_id: string;
  name: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  direction_deg: number | null;
  notes: string | null;
  is_active: boolean;
  technical_name: string | null;
  import_method: string | null;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Camera edit",
      title: "Edit camera",
      intro:
        "Update camera master data, status, ground assignment, and location information. Provisioning data remains unchanged.",
      back: "Back to camera status",
      loadVendorsFailed: "Failed to load camera vendors:",
      loadCameraConfigFailed: "Failed to load camera configuration:",
      activeOrganizationRequired: "Active organization context required.",
      activeOrganizationMissing: "Active organization not found.",
      actorNotAllowed: "Only owner or admin can manage cameras.",
      loadCameraFailed: "Failed to load camera:",
      loadGroundsFailed: "Failed to load grounds:",
      noActiveGrounds: "There are currently no active grounds for this organization.",
    };
  }

  return {
    eyebrow: "Kamera bearbeiten",
    title: "Kamera bearbeiten",
    intro:
      "Ändere hier Kamera-Stammdaten, Status, Revier-Zuordnung und Standortinformationen. Provisioning-Daten bleiben unverändert.",
    back: "Zurück zum Kamerastatus",
    loadVendorsFailed: "Fehler beim Laden der Kamera-Hersteller:",
    loadCameraConfigFailed: "Fehler beim Laden der Kamera-Konfiguration:",
    activeOrganizationRequired: "Aktiver Organisationskontext erforderlich.",
    activeOrganizationMissing: "Aktive Organisation nicht gefunden.",
    actorNotAllowed: "Nur Owner oder Admin dürfen Kameras verwalten.",
    loadCameraFailed: "Fehler beim Laden der Kamera:",
    loadGroundsFailed: "Fehler beim Laden der Reviere:",
    noActiveGrounds: "Für diese Organisation sind derzeit keine aktiven Reviere vorhanden.",
  };
}

function buildBackHref(returnRevier: string) {
  return returnRevier
    ? `/cameras/health?revier=${encodeURIComponent(returnRevier)}`
    : "/cameras/health";
}

export default async function EditCameraPage(props: {
  params: Promise<PageParams> | PageParams;
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const returnRevier = String(searchParams.return_revier ?? "").trim();

  const ctx = await requirePathAccess(`/cameras/${params.id}/edit`);
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

  const actorRole = ctx.activeMembership.role;
  const activeOrganization = ctx.activeMembership.organizations;

  if (!activeOrganization) {
    throw new Error(text.activeOrganizationMissing);
  }

  if (!(actorRole === "owner" || actorRole === "admin")) {
    throw new Error(text.actorNotAllowed);
  }

  const [
    { data: cameraData, error: cameraError },
    { data: revierData, error: revierError },
    { data: vendorData, error: vendorError },
    { data: configData, error: configError },
  ] = await Promise.all([
    supabase
      .from("cameras")
      .select(
        "id,organization_id,revier_id,name,location_name,latitude,longitude,direction_deg,notes,is_active,technical_name,import_method"
      )
      .eq("organization_id", activeOrganization.id)
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("reviers")
      .select("id,name,organization_id,status,is_default")
      .eq("organization_id", activeOrganization.id)
      .eq("status", "active")
      .order("name", { ascending: true }),
    supabase
      .from("camera_vendors")
      .select("key,label")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("camera_ingest_configs")
      .select("vendor")
      .eq("camera_id", params.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  if (cameraError) {
    throw new Error(`${text.loadCameraFailed} ${cameraError.message}`);
  }

  if (!cameraData) {
    notFound();
  }

  if (revierError) {
    throw new Error(`${text.loadGroundsFailed} ${revierError.message}`);
  }

  if (vendorError) {
    throw new Error(`${text.loadVendorsFailed} ${vendorError.message}`);
  }

  if (configError) {
    throw new Error(`${text.loadCameraConfigFailed} ${configError.message}`);
  }

  const reviers = (revierData ?? []) as RevierRow[];
  const vendors = (vendorData ?? []) as CameraVendorRow[];
  const currentVendor = ((configData as CameraIngestConfigRow | null)?.vendor ?? "").trim();

  if (reviers.length === 0) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">{text.intro}</p>
        </section>

        <section className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4">
          <p className="text-sm text-rose-100">{text.noActiveGrounds}</p>
        </section>

        <Link
          href={buildBackHref(returnRevier)}
          className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
        >
          {text.back}
        </Link>
      </main>
    );
  }

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              {text.eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {text.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-white/68">{text.intro}</p>
          </div>

        </div>
      </section>

      <EditCameraForm
        camera={cameraData as CameraRow}
        reviers={reviers}
        returnRevier={returnRevier}
        vendors={vendors}
        currentVendor={currentVendor}
        isDemo={ctx.isDemo}
        language={language}
      />
    </main>
  );
}
