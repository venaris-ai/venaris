// src/app/cameras/health/page.tsx #6
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import { canCreateCamera } from "@/lib/billing/subscriptionPolicy";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import CameraRowFields from "./CameraRowFields";
import CameraRowActions from "./CameraRowActions";

type SearchParams = {
  revier?: string;
  changed?: string;
  removed?: string;
};

type RevierRow = {
  id: string;
  name: string;
};

type CameraBaseRow = {
  id: string;
  name: string;
  revier_id: string;
  import_method: string | null;
  is_active: boolean;
  reviers: { name: string } | { name: string }[] | null;
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
  is_active: boolean;
  last_seen_at: string | null;
  stale_after_minutes: number;
  offline_after_minutes: number;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
};

type HealthRuleRow = {
  methodKey: string;
  methodLabel: string;
  staleAfterMinutes: number;
  offlineAfterMinutes: number;
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

function formatAgo(value: string | null) {
  if (!value) return "—";

  const ts = new Date(value).getTime();
  const diffMs = Date.now() - ts;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 2) return "gerade eben";
  if (diffMinutes < 60) return `vor ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `vor ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  return `vor ${diffDays} d`;
}

function formatMethod(value: string | null) {
  if (!value) return "—";
  if (value === "smtp") return "SMTP";
  if (value === "ftp") return "FTP";
  if (value === "manual") return "Manual";
  return value;
}

function formatHealthLabel(value: string) {
  if (value === "online") return "Online";
  if (value === "stale") return "Stale";
  if (value === "offline") return "Offline";
  if (value === "unknown") return "Unknown";
  return value;
}

function extractRevierName(
  value: { name: string } | { name: string }[] | null
): string {
  if (!value) return "—";
  if (Array.isArray(value)) return value[0]?.name ?? "—";
  return value.name ?? "—";
}

function buildHealthRules(rows: CameraHealthListRow[]): HealthRuleRow[] {
  const seen = new Map<string, HealthRuleRow>();

  for (const row of rows) {
    const methodKey = row.import_method ?? "unknown";
    const ruleKey = [
      methodKey,
      row.stale_after_minutes,
      row.offline_after_minutes,
    ].join("|");

    if (seen.has(ruleKey)) continue;

    seen.set(ruleKey, {
      methodKey,
      methodLabel: formatMethod(row.import_method),
      staleAfterMinutes: row.stale_after_minutes,
      offlineAfterMinutes: row.offline_after_minutes,
    });
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.methodLabel.localeCompare(b.methodLabel, "de")
  );
}

function buildReturnUrl(params: {
  revier?: string | null;
  changed?: boolean;
  removed?: boolean;
}) {
  const search = new URLSearchParams();

  if (params.revier) search.set("revier", params.revier);
  if (params.changed) search.set("changed", "1");
  if (params.removed) search.set("removed", "1");

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

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const actorRole = ctx.activeMembership.role;
  const activeOrganization = ctx.activeMembership.organizations;
  const cameraId = String(formData.get("camera_id") ?? "").trim();
  const nextStatus = String(formData.get("status") ?? "").trim();
  const returnRevier = String(formData.get("return_revier") ?? "").trim();

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  if (!(actorRole === "owner" || actorRole === "admin")) {
    throw new Error("Nur Owner oder Admin dürfen Kameras verwalten.");
  }

  if (!cameraId) {
    throw new Error("Missing target camera.");
  }

  if (!["active", "disabled"].includes(nextStatus)) {
    throw new Error("Invalid target status.");
  }

  const targetCamera = await loadCameraForMutation({
    organizationId: activeOrganization.id,
    cameraId,
  });

  if (!targetCamera) {
    throw new Error("Target camera not found.");
  }

  const nextIsActive = nextStatus === "active";

  if (targetCamera.is_active === nextIsActive) {
    revalidatePath("/cameras/health");
    redirect(buildReturnUrl({ revier: returnRevier || null }));
  }

  if (!targetCamera.is_active && nextIsActive) {
    const supabase = supabaseServer();

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
        `Failed to load subscription camera policy: ${subscriptionResult.error.message}`
      );
    }

    if (!subscriptionResult.data) {
      throw new Error("No subscription found for active organization");
    }

    if (activeCameraCountResult.error) {
      throw new Error(
        `Failed to load active camera usage: ${activeCameraCountResult.error.message}`
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

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("cameras")
    .update({ is_active: nextIsActive })
    .eq("organization_id", activeOrganization.id)
    .eq("id", cameraId);

  if (error) {
    throw new Error(`Failed to save camera status: ${error.message}`);
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

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const actorRole = ctx.activeMembership.role;
  const activeOrganization = ctx.activeMembership.organizations;
  const cameraId = String(formData.get("camera_id") ?? "").trim();
  const returnRevier = String(formData.get("return_revier") ?? "").trim();

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  if (!(actorRole === "owner" || actorRole === "admin")) {
    throw new Error("Nur Owner oder Admin dürfen Kameras verwalten.");
  }

  if (!cameraId) {
    throw new Error("Missing target camera.");
  }

  const targetCamera = await loadCameraForMutation({
    organizationId: activeOrganization.id,
    cameraId,
  });

  if (!targetCamera) {
    throw new Error("Target camera not found.");
  }

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("cameras")
    .delete()
    .eq("organization_id", activeOrganization.id)
    .eq("id", cameraId);

  if (error) {
    throw new Error(`Failed to remove camera: ${error.message}`);
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

function HealthBadge({ status }: { status: string }) {
  const className =
    status === "online"
      ? "border-green-200 bg-green-50 text-green-800"
      : status === "stale"
      ? "border-yellow-200 bg-yellow-50 text-yellow-800"
      : status === "offline"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-gray-200 bg-gray-50 text-gray-700";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {formatHealthLabel(status)}
    </span>
  );
}

export default async function CamerasHealthPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/cameras/health");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const activeOrganization = ctx.activeMembership.organizations;
  const actorRole = ctx.activeMembership.role;
  const canManageCameras = actorRole === "owner" || actorRole === "admin";

  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  const rawRevier = searchParams?.revier;
  const changed = searchParams?.changed === "1";
  const removed = searchParams?.removed === "1";

  if (!activeOrganization) {
    return (
      <main className="space-y-8">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">Camera Health</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Überwache hier die Kameras der aktiven Organisation im aktuellen
            Revier-Scope.
          </p>
        </section>
        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Active organization not found.
        </div>
      </main>
    );
  }

  const supabase = supabaseServer();

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-8">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">Camera Health</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Überwache hier die Kameras der aktiven Organisation im aktuellen
            Revier-Scope.
          </p>
        </section>
        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Fehler beim Laden der Reviere: {reviersError.message}
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
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">Camera Health</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Überwache hier die Kameras der aktiven Organisation im aktuellen
            Revier-Scope.
          </p>
        </section>
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          Für die aktive Organisation sind derzeit keine aktiven Reviere vorhanden.
        </div>
      </main>
    );
  }

  let camerasQuery = supabase
    .from("cameras")
    .select("id,name,revier_id,import_method,is_active,reviers(name)")
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
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">Camera Health</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Überwache hier die Kameras der aktiven Organisation im aktuellen
            Revier-Scope.
          </p>
        </section>
        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Fehler beim Laden der Kameras: {camerasError.message}
        </div>
      </main>
    );
  }

  const cameraBaseRows = (camerasData ?? []) as CameraBaseRow[];
  const cameraIds = cameraBaseRows.map((camera) => camera.id);

  if (cameraIds.length === 0) {
    return (
      <main className="space-y-8">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">Camera Health</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Überwache hier die Kameras der aktiven Organisation im aktuellen
            Revier-Scope.
          </p>
        </section>

        {changed ? (
          <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-800">Kamera-Status wurde gespeichert.</p>
          </section>
        ) : null}

        {removed ? (
          <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-800">Kamera wurde dauerhaft entfernt.</p>
          </section>
        ) : null}

        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-lg font-medium">Kameraliste</h2>
              <p className="mt-1 text-sm text-gray-600">
                Sichtbare Kameras der aktiven Organisation im gültigen Revier-Scope.
              </p>
            </div>
            <Link
              href="/cameras/new"
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Kamera hinzufügen
            </Link>
          </div>

          <div className="px-6 py-10">
            <div className="rounded-2xl border border-dashed bg-gray-50 p-8">
              <h3 className="text-base font-medium">Keine Kameras im aktuellen Scope</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Für den aktuellen Revier-Scope sind keine Kameras vorhanden.
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
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">Camera Health</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Überwache hier die Kameras der aktiven Organisation im aktuellen
            Revier-Scope.
          </p>
        </section>
        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          Fehler beim Laden des Kamera-Health-Status: {healthError.message}
        </div>
      </main>
    );
  }

  const healthRows = (healthData ?? []) as CameraHealthRow[];
  const healthById = new Map(healthRows.map((row) => [row.id, row]));

  const rows: CameraHealthListRow[] = cameraBaseRows.map((camera) => {
    const health = healthById.get(camera.id);

    return {
      id: camera.id,
      name: camera.name,
      revier_id: camera.revier_id,
      revier_name: extractRevierName(camera.reviers),
      import_method: camera.import_method,
      is_active: camera.is_active,
      last_seen_at: health?.last_seen_at ?? null,
      stale_after_minutes: health?.stale_after_minutes ?? 0,
      offline_after_minutes: health?.offline_after_minutes ?? 0,
      health_status: health?.health_status ?? "unknown",
    };
  });

  const onlineCount = rows.filter((row) => row.health_status === "online").length;
  const staleCount = rows.filter((row) => row.health_status === "stale").length;
  const offlineCount = rows.filter((row) => row.health_status === "offline").length;
  const unknownCount = rows.filter((row) => row.health_status === "unknown").length;

  const healthRules = buildHealthRules(rows);
  const healthRuleHint =
    healthRules.length > 0
      ? healthRules
          .map(
            (rule) =>
              `${rule.methodLabel}: stale ab ${rule.staleAfterMinutes} min, offline ab ${rule.offlineAfterMinutes} min`
          )
          .join(" · ")
      : null;

  return (
    <main className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Camera Health</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Überwache hier die Kameras der aktiven Organisation im aktuellen
          Revier-Scope.
        </p>
      </section>

      {changed ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">Kamera-Status wurde gespeichert.</p>
        </section>
      ) : null}

      {removed ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">Kamera wurde dauerhaft entfernt.</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Online</div>
          <div className="mt-2 text-3xl font-semibold">{onlineCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Kameras mit aktuellem Lebenszeichen innerhalb des Online-Fensters.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Stale</div>
          <div className="mt-2 text-3xl font-semibold">{staleCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Kameras mit verspätetem, aber noch nicht kritischem Status.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Offline</div>
          <div className="mt-2 text-3xl font-semibold">{offlineCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Kameras ohne Lebenszeichen jenseits des Offline-Fensters.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Unknown</div>
          <div className="mt-2 text-3xl font-semibold">{unknownCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Kameras ohne verwertbares letztes Lebenszeichen.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-medium">Kameraliste</h2>
            <p className="mt-1 text-sm text-gray-600">
              Sichtbare Kameras der aktiven Organisation im gültigen Revier-Scope.
            </p>
          </div>

          <Link
            href="/cameras/new"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Kamera hinzufügen
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-6 py-3 font-medium whitespace-nowrap">Kamera</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">Revier</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">Methode</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">Health</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">Status</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap">Last Feed</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap text-right">
                  Aktionen
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-middle">
                  <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                    {row.name}
                  </td>

                  <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                    {row.revier_name}
                  </td>

                  <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                    {formatMethod(row.import_method)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <HealthBadge status={row.health_status} />
                  </td>

                  <CameraRowFields
                    cameraId={row.id}
                    initialStatus={row.is_active ? "active" : "disabled"}
                    canManage={canManageCameras}
                    returnRevier={rawRevier ?? ""}
                    saveAction={saveCameraStatus}
                  />

                  <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                    {formatAgo(row.last_seen_at)}
                  </td>

<CameraRowActions
  cameraId={row.id}
  canManage={canManageCameras}
  removeAction={removeCamera}
  returnRevier={rawRevier ?? ""}
/>





                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {healthRuleHint ? (
          <div className="border-t px-6 py-3 text-xs text-gray-500">
            * Health-Regeln im aktuellen Scope: {healthRuleHint}
          </div>
        ) : null}
      </section>
    </main>
  );
}