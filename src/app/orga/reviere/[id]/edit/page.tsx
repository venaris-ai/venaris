// src/app/orga/reviere/[id]/edit/page.tsx #10
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { redirectIfDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import SubmitButton from "@/components/SubmitButton";
import TimeZoneSelect from "@/components/TimeZoneSelect";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";

const DEFAULT_TIME_ZONE = "Europe/Berlin";

type RevierRow = {
  id: string;
  name: string;
  area_ha: number;
  region: string | null;
  country: string | null;
  notes: string | null;
  status: string;
  organization_id: string;
  timezone: string;
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
        nameRequired: "Ground name is required.",
        areaRequired: "Area in ha is required.",
        areaInvalid: "Area in ha must be a valid positive number.",
        timezoneInvalid: "Invalid time zone.",
        updateFailedPrefix: "Failed to update ground:",
        eyebrow: "Edit ground",
        title: "Edit ground",
        intro: "Edit the master data and status of the selected ground here.",
        demoReadOnly: "Demo mode: changes are disabled.",
        nameLabel: "Ground name *",
        areaLabel: "Area in ha *",
        regionLabel: "Region",
        countryLabel: "Country",
        timezoneLabel: "Time zone",
        timezoneHelp:
          "Used for wildlife, image and event times in this ground.",
        statusLabel: "Status",
        notesLabel: "Notes",
        active: "Active",
        paused: "Paused",
        archived: "Archived",
        saveIdle: "Save changes",
        savePending: "Saving...",
        demoMode: "Demo mode",
        cancel: "Cancel",
      }
    : {
        nameRequired: "Reviername ist erforderlich.",
        areaRequired: "Fläche in ha ist erforderlich.",
        areaInvalid: "Fläche in ha muss eine gültige positive Zahl sein.",
        timezoneInvalid: "Ungültige Zeitzone.",
        updateFailedPrefix: "Failed to update revier:",
        eyebrow: "Revier bearbeiten",
        title: "Revier bearbeiten",
        intro:
          "Bearbeite hier die Stammdaten und den Status des ausgewählten Reviers.",
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        nameLabel: "Reviername *",
        areaLabel: "Fläche in ha *",
        regionLabel: "Region",
        countryLabel: "Land",
        timezoneLabel: "Zeitzone",
        timezoneHelp:
          "Wird für Wildlife-, Bild- und Eventzeiten in diesem Revier verwendet.",
        statusLabel: "Status",
        notesLabel: "Notizen",
        active: "Active",
        paused: "Paused",
        archived: "Archived",
        saveIdle: "Änderungen speichern",
        savePending: "Speichert...",
        demoMode: "Demo-Modus",
        cancel: "Abbrechen",
      };
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeTimeZone(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return DEFAULT_TIME_ZONE;

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 100) return DEFAULT_TIME_ZONE;

  return isValidTimeZone(trimmed) ? trimmed : DEFAULT_TIME_ZONE;
}

async function updateRevier(revierId: string, formData: FormData) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${revierId}/edit`
  );
  redirectIfDemoWrite(ctx, `/orga/reviere/${revierId}/edit?demo_read_only=1`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const text = t(language);

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const name = String(formData.get("name") ?? "").trim();
  const areaHaRaw = String(formData.get("area_ha") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const country = String(formData.get("country") ?? "DE").trim() || "DE";
  const timezone = normalizeTimeZone(formData.get("timezone"));
  const status = String(formData.get("status") ?? "active").trim() || "active";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    throw new Error(text.nameRequired);
  }

  if (!areaHaRaw) {
    throw new Error(text.areaRequired);
  }

  const parsed = Number(areaHaRaw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(text.areaInvalid);
  }

  if (!isValidTimeZone(timezone)) {
    throw new Error(text.timezoneInvalid);
  }

  const areaHa = Math.round(parsed);

  const { error } = await supabase
    .from("reviers")
    .update({
      name,
      area_ha: areaHa,
      region: region || null,
      country,
      timezone,
      status,
      notes: notes || null,
    })
    .eq("id", revierId)
    .eq("organization_id", organization.id);

  if (error) {
    throw new Error(`${text.updateFailedPrefix} ${error.message}`);
  }

  revalidatePath("/orga/reviere");
  revalidatePath("/", "layout");
  redirect("/orga/reviere?updated=1");
}

export default async function EditRevierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ demo_read_only?: string }>;
}) {
  const { id } = await params;
  const search = (await searchParams) ?? {};
  const demoReadOnly = search.demo_read_only === "1";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${id}/edit`
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
    .select("id,name,area_ha,region,country,notes,status,organization_id,timezone")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .single();

  if (error) {
    throw new Error(`Failed to load revier: ${error.message}`);
  }

  const revier = data as RevierRow;

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

      {demoReadOnly ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">{text.demoReadOnly}</p>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <form action={updateRevier.bind(null, revier.id)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.nameLabel}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={revier.name}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              />
            </div>

            <div>
              <label
                htmlFor="area_ha"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.areaLabel}
              </label>
              <input
                id="area_ha"
                name="area_ha"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={revier.area_ha}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              />
            </div>

            <div>
              <label
                htmlFor="region"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.regionLabel}
              </label>
              <input
                id="region"
                name="region"
                type="text"
                defaultValue={revier.region ?? ""}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              />
            </div>

            <div>
              <label
                htmlFor="country"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.countryLabel}
              </label>
              <input
                id="country"
                name="country"
                type="text"
                defaultValue={revier.country ?? "DE"}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm uppercase text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              />
            </div>

            <TimeZoneSelect
              label={text.timezoneLabel}
              helpText={text.timezoneHelp}
              disabled={isDemo}
              title={isDemo ? text.demoReadOnly : ""}
              initialValue={revier.timezone}
            />

            <div>
              <label
                htmlFor="status"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.statusLabel}
              </label>
              <select
                id="status"
                name="status"
                defaultValue={revier.status}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              >
                <option value="active" className="bg-[#102018] text-white">
                  {text.active}
                </option>
                <option value="paused" className="bg-[#102018] text-white">
                  {text.paused}
                </option>
                <option value="archived" className="bg-[#102018] text-white">
                  {text.archived}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="notes"
              className="mb-2 block text-sm font-medium text-white"
            >
              {text.notesLabel}
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={5}
              defaultValue={revier.notes ?? ""}
              disabled={isDemo}
              className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              idleLabel={isDemo ? text.demoMode : text.saveIdle}
              pendingLabel={text.savePending}
            />

            <Link
              href="/orga/reviere"
              className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              {text.cancel}
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}