// src/app/orga/reviere/page.tsx #15
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { redirectIfDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import RevierRowActions from "./RevierRowActions";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";

type RevierStatus = "active" | "paused" | "archived";

type RevierRow = {
  id: string;
  name: string;
  area_ha: number | null;
  region: string | null;
  country: string | null;
  notes: string | null;
  status: RevierStatus;
  created_at: string;
  is_default: boolean;
  timezone: string;
};

type RevierBoundaryRow = {
  revier_id: string;
};

async function resolveUiLanguageForProtectedPath(pathname: string) {
  const ctx = await requirePathAccess(pathname);

  if (!ctx.user) {
    throw new Error("Authenticated user required");
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

  return { ctx, supabase, language };
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        missingTarget: "Missing target ground.",
        targetNotFound: "Target ground not found.",
        defaultDeleteBlocked: "The default ground cannot be deleted.",
        deleteFailedPrefix: "Failed to delete ground:",
        eyebrow: "Grounds",
        title: "Grounds",
        intro:
          "Grounds are the operational area scope of your organization. They structure camera assignments, wildlife analytics and later population-related calculations within Venaris.",
        demoReadOnly: "Demo mode: changes are disabled.",
        created: "Ground was created successfully.",
        updated: "Ground was updated successfully.",
        deleted: "Ground was deleted successfully.",
        activeTitle: "Active",
        activeText:
          "Productively used grounds in the current organization context.",
        pausedTitle: "Paused",
        pausedText: "Grounds temporarily taken out of active focus.",
        archivedTitle: "Archived",
        archivedText:
          "Historically retained but no longer actively used grounds.",
        listTitle: "Ground list",
        listText: "Current grounds of the active organization.",
        createGround: "Create ground",
        emptyTitle: "No grounds created yet",
        emptyText:
          "There are currently no grounds for the active organization. Grounds define the operational scope for cameras, wildlife analytics and later population estimates.",
        firstGround: "Create first ground",
        nameCol: "Name",
        areaCol: "Area",
        timezoneCol: "Time zone",
        statusCol: "Status",
        boundaryCol: "Boundary",
        actionsCol: "Actions",
        defaultBadge: "Default",
        active: "Active",
        paused: "Paused",
        archived: "Archived",
        unknown: "Unknown",
        boundaryCaptured: "Captured",
        boundaryMissing: "Not captured",
      }
    : {
        missingTarget: "Ziel-Revier fehlt.",
        targetNotFound: "Ziel-Revier wurde nicht gefunden.",
        defaultDeleteBlocked: "Das Standard-Revier kann nicht gelöscht werden.",
        deleteFailedPrefix: "Fehler beim Löschen des Reviers:",
        eyebrow: "Reviere",
        title: "Reviere",
        intro:
          "Reviere sind der fachliche Flächenscope Deiner Organisation. Sie strukturieren Kamerazuordnung, Wildlife-Auswertungen und spätere populationsbezogene Berechnungen innerhalb von Venaris.",
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        created: "Revier wurde erfolgreich angelegt.",
        updated: "Revier wurde erfolgreich aktualisiert.",
        deleted: "Revier wurde erfolgreich gelöscht.",
        activeTitle: "Aktiv",
        activeText:
          "Produktiv genutzte Reviere im aktuellen Organisationskontext.",
        pausedTitle: "Pausiert",
        pausedText: "Vorübergehend aus dem aktiven Fokus genommene Reviere.",
        archivedTitle: "Archiviert",
        archivedText:
          "Historisch erhaltene, aber nicht mehr aktiv genutzte Reviere.",
        listTitle: "Revierliste",
        listText: "Aktuelle Reviere der aktiven Organisation.",
        createGround: "Revier anlegen",
        emptyTitle: "Noch keine Reviere angelegt",
        emptyText:
          "Für die aktive Organisation sind aktuell noch keine Reviere vorhanden. Reviere bilden den fachlichen Scope für Kameras, Wildlife-Auswertungen und spätere Populationsschätzungen.",
        firstGround: "Erstes Revier anlegen",
        nameCol: "Name",
        areaCol: "Fläche",
        timezoneCol: "Zeitzone",
        statusCol: "Status",
        boundaryCol: "Kontur",
        actionsCol: "Aktionen",
        defaultBadge: "Standard",
        active: "Aktiv",
        paused: "Pausiert",
        archived: "Archiviert",
        unknown: "Unbekannt",
        boundaryCaptured: "Erfasst",
        boundaryMissing: "Nicht erfasst",
      };
}

function StatusBadge({
  status,
  language,
}: {
  status: RevierStatus;
  language: AppLanguage;
}) {
  const labels =
    language === "en"
      ? {
          active: "Active",
          paused: "Paused",
          archived: "Archived",
        }
      : {
          active: "Aktiv",
          paused: "Pausiert",
          archived: "Archiviert",
        };

  const className =
    status === "active"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "paused"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-white/10 bg-white/8 text-white/60";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {labels[status]}
    </span>
  );
}

function BoundaryBadge({
  hasBoundary,
  language,
}: {
  hasBoundary: boolean;
  language: AppLanguage;
}) {
  const text = t(language);
  const className = hasBoundary
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : "border-white/10 bg-white/8 text-white/55";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {hasBoundary ? text.boundaryCaptured : text.boundaryMissing}
    </span>
  );
}

async function loadRevierForMutation(params: {
  organizationId: string;
  revierId: string;
}) {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("reviers")
    .select(
      "id,name,area_ha,region,country,notes,status,created_at,is_default,timezone"
    )
    .eq("organization_id", params.organizationId)
    .eq("id", params.revierId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load target revier: ${error.message}`);
  }

  return (data as RevierRow | null) ?? null;
}

async function deleteRevier(formData: FormData) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    "/orga/reviere"
  );
  redirectIfDemoWrite(ctx, "/orga/reviere?demo_read_only=1");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const text = t(language);
  const revierId = String(formData.get("revier_id") ?? "").trim();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  if (!revierId) {
    throw new Error(text.missingTarget);
  }

  const targetRevier = await loadRevierForMutation({
    organizationId: organization.id,
    revierId,
  });

  if (!targetRevier) {
    throw new Error(text.targetNotFound);
  }

  if (targetRevier.is_default) {
    throw new Error(text.defaultDeleteBlocked);
  }

  const { error } = await supabase
    .from("reviers")
    .delete()
    .eq("id", revierId)
    .eq("organization_id", organization.id);

  if (error) {
    throw new Error(`${text.deleteFailedPrefix} ${error.message}`);
  }

  revalidatePath("/orga/reviere");
  revalidatePath("/", "layout");
  redirect("/orga/reviere?deleted=1");
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

export default async function OrgaRevierePage({
  searchParams,
}: {
  searchParams?: Promise<{
    created?: string;
    updated?: string;
    deleted?: string;
    demo_read_only?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const created = params.created === "1";
  const updated = params.updated === "1";
  const deleted = params.deleted === "1";
  const demoReadOnly = params.demo_read_only === "1";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    "/orga/reviere"
  );

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const isDemo = ctx.isDemo;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const text = t(language);

  const { data, error } = await supabase
    .from("reviers")
    .select(
      "id,name,area_ha,region,country,notes,status,created_at,is_default,timezone"
    )
    .eq("organization_id", organization.id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load reviers: ${error.message}`);
  }

  const { data: boundariesData, error: boundariesError } = await supabase
    .from("revier_boundaries")
    .select("revier_id")
    .eq("organization_id", organization.id);

  if (boundariesError) {
    throw new Error(
      `Failed to load revier boundaries: ${boundariesError.message}`
    );
  }

  const reviers = (data ?? []) as RevierRow[];
  const boundaryRows = (boundariesData ?? []) as RevierBoundaryRow[];
  const boundaryRevierIds = new Set(
    boundaryRows.map((boundary) => boundary.revier_id)
  );

  const activeCount = reviers.filter(
    (revier) => revier.status === "active"
  ).length;
  const pausedCount = reviers.filter(
    (revier) => revier.status === "paused"
  ).length;
  const archivedCount = reviers.filter(
    (revier) => revier.status === "archived"
  ).length;

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
          <p className="mt-2 max-w-3xl text-sm text-white/68">{text.intro}</p>
        </div>
      </section>

      {demoReadOnly ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">{text.demoReadOnly}</p>
        </section>
      ) : null}

      {created ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">{text.created}</p>
        </section>
      ) : null}

      {updated ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">{text.updated}</p>
        </section>
      ) : null}

      {deleted ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">{text.deleted}</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={text.activeTitle}
          value={activeCount}
          text={text.activeText}
        />
        <StatCard
          title={text.pausedTitle}
          value={pausedCount}
          text={text.pausedText}
        />
        <StatCard
          title={text.archivedTitle}
          value={archivedCount}
          text={text.archivedText}
        />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <div>
            <h2 className="text-lg font-medium text-white">{text.listTitle}</h2>
            <p className="mt-1 text-sm text-white/65">{text.listText}</p>
          </div>

          <Link
            href="/orga/reviere/new"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            {text.createGround}
          </Link>
        </div>

        {reviers.length === 0 ? (
          <div className="px-6 py-10">
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 p-8">
              <h3 className="text-base font-medium text-white">
                {text.emptyTitle}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
                {text.emptyText}
              </p>
              <div className="mt-5">
                <Link
                  href="/orga/reviere/new"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
                >
                  {text.firstGround}
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-white/55">
                <tr>
                  <th className="whitespace-nowrap px-6 py-3 font-medium">
                    {text.nameCol}
                  </th>
                  <th className="whitespace-nowrap px-6 py-3 font-medium">
                    {text.areaCol}
                  </th>
                  <th className="whitespace-nowrap px-6 py-3 font-medium">
                    {text.timezoneCol}
                  </th>
                  <th className="whitespace-nowrap px-6 py-3 font-medium">
                    {text.statusCol}
                  </th>
                  <th className="whitespace-nowrap px-6 py-3 font-medium">
                    {text.boundaryCol}
                  </th>
                  <th className="whitespace-nowrap px-6 py-3 text-right font-medium">
                    {text.actionsCol}
                  </th>
                </tr>
              </thead>
              <tbody>
                {reviers.map((revier) => (
                  <tr
                    key={revier.id}
                    className="border-t border-white/8 align-middle"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium text-white">
                          {revier.name}
                        </div>
                        {revier.is_default ? (
                          <div className="text-xs text-amber-100/75">
                            {text.defaultBadge}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-white/72">
                      {revier.area_ha ?? "—"} ha
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-white/72">
                      {revier.timezone}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={revier.status} language={language} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <BoundaryBadge
                        hasBoundary={boundaryRevierIds.has(revier.id)}
                        language={language}
                      />
                    </td>

                    <RevierRowActions
                      revierId={revier.id}
                      editHref={`/orga/reviere/${revier.id}/edit`}
                      canDelete={!revier.is_default}
                      deleteAction={deleteRevier}
                      isDemo={isDemo}
                      language={language}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}