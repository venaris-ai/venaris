// src/app/orga/reviere/page.tsx #7
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import RevierRowControls from "./RevierRowControls";
import RevierRowActions from "./RevierRowActions";

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
};

function isRevierStatus(value: string): value is RevierStatus {
  return ["active", "paused", "archived"].includes(value);
}

async function loadRevierForMutation(params: {
  organizationId: string;
  revierId: string;
}) {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("reviers")
    .select("id,name,area_ha,region,country,notes,status,created_at,is_default")
    .eq("organization_id", params.organizationId)
    .eq("id", params.revierId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load target revier: ${error.message}`);
  }

  return (data as RevierRow | null) ?? null;
}

async function saveRevierChanges(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/reviere");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const revierId = String(formData.get("revier_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const areaHaRaw = String(formData.get("area_ha") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "active").trim();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  if (!revierId) {
    throw new Error("Missing target revier.");
  }

  if (!name) {
    throw new Error("Reviername ist erforderlich.");
  }

  if (!areaHaRaw) {
    throw new Error("Fläche in ha ist erforderlich.");
  }

  const parsed = Number(areaHaRaw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Fläche in ha muss eine gültige positive Zahl sein.");
  }

  if (!isRevierStatus(statusRaw)) {
    throw new Error("Ungültiger Revierstatus.");
  }

  const targetRevier = await loadRevierForMutation({
    organizationId: organization.id,
    revierId,
  });

  if (!targetRevier) {
    throw new Error("Target revier not found.");
  }

  const areaHa = Math.round(parsed);

  if (
    targetRevier.name === name &&
    (targetRevier.area_ha ?? null) === areaHa &&
    targetRevier.status === statusRaw
  ) {
    revalidatePath("/orga/reviere");
    redirect("/orga/reviere");
  }

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("reviers")
    .update({
      name,
      area_ha: areaHa,
      status: statusRaw,
    })
    .eq("id", revierId)
    .eq("organization_id", organization.id);

  if (error) {
    throw new Error(`Failed to save revier changes: ${error.message}`);
  }

  revalidatePath("/orga/reviere");
  revalidatePath("/", "layout");
  redirect("/orga/reviere?updated=1");
}

async function deleteRevier(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/reviere");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const revierId = String(formData.get("revier_id") ?? "").trim();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  if (!revierId) {
    throw new Error("Missing target revier.");
  }

  const targetRevier = await loadRevierForMutation({
    organizationId: organization.id,
    revierId,
  });

  if (!targetRevier) {
    throw new Error("Target revier not found.");
  }

  if (targetRevier.is_default) {
    throw new Error("Das Default-Revier kann nicht gelöscht werden.");
  }

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("reviers")
    .delete()
    .eq("id", revierId)
    .eq("organization_id", organization.id);

  if (error) {
    throw new Error(`Failed to delete revier: ${error.message}`);
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
  searchParams?: Promise<{ created?: string; updated?: string; deleted?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const created = params.created === "1";
  const updated = params.updated === "1";
  const deleted = params.deleted === "1";

  const ctx = await requirePathAccess("/orga/reviere");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("reviers")
    .select("id,name,area_ha,region,country,notes,status,created_at,is_default")
    .eq("organization_id", organization.id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load reviers: ${error.message}`);
  }

  const reviers = (data ?? []) as RevierRow[];

  const activeCount = reviers.filter((revier) => revier.status === "active").length;
  const pausedCount = reviers.filter((revier) => revier.status === "paused").length;
  const archivedCount = reviers.filter((revier) => revier.status === "archived").length;

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Reviere
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Reviere
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            Reviere sind der fachliche Flächenscope Deiner Organisation. Sie
            strukturieren Kamerazuordnung, Wildlife-Auswertungen und spätere
            populationsbezogene Berechnungen innerhalb von Venaris.
          </p>
        </div>
      </section>

      {created ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">
            Revier wurde erfolgreich angelegt.
          </p>
        </section>
      ) : null}

      {updated ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">
            Revier wurde erfolgreich aktualisiert.
          </p>
        </section>
      ) : null}

      {deleted ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">
            Revier wurde erfolgreich gelöscht.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Active"
          value={activeCount}
          text="Produktiv genutzte Reviere im aktuellen Organizationskontext."
        />
        <StatCard
          title="Paused"
          value={pausedCount}
          text="Vorübergehend aus dem aktiven Fokus genommene Reviere."
        />
        <StatCard
          title="Archived"
          value={archivedCount}
          text="Historisch erhaltene, aber nicht mehr aktiv genutzte Reviere."
        />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <div>
            <h2 className="text-lg font-medium text-white">Revierliste</h2>
            <p className="mt-1 text-sm text-white/65">
              Aktuelle Reviere der aktiven Organisation.
            </p>
          </div>

          <Link
            href="/orga/reviere/new"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            Revier anlegen
          </Link>
        </div>

        {reviers.length === 0 ? (
          <div className="px-6 py-10">
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 p-8">
              <h3 className="text-base font-medium text-white">
                Noch keine Reviere angelegt
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
                Für die aktive Organisation sind aktuell noch keine Reviere
                vorhanden. Reviere bilden den fachlichen Scope für Kameras,
                Wildlife-Auswertungen und spätere Population Estimates.
              </p>
              <div className="mt-5">
                <Link
                  href="/orga/reviere/new"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
                >
                  Erstes Revier anlegen
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-white/55">
                <tr>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Name</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Fläche</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Status</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap text-right">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody>
                {reviers.map((revier) => (
                  <tr key={revier.id} className="border-t border-white/8 align-middle">
                    <RevierRowControls
                      revierId={revier.id}
                      initialName={revier.name}
                      initialAreaHa={revier.area_ha ?? 1}
                      initialStatus={revier.status}
                      saveAction={saveRevierChanges}
                    />

                    <RevierRowActions
                      revierId={revier.id}
                      canDelete={!revier.is_default}
                      deleteAction={deleteRevier}
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