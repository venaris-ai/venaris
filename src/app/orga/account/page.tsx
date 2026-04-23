// src/app/orga/account/page.tsx #10
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { redirectIfDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import SubmitButton from "@/components/SubmitButton";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  camera_code: string;
  kind: string;
  status: string;
  owner_user_id: string | null;
  created_at: string;
  notes: string | null;
  legal_name: string | null;
  contact_person: string | null;
  billing_email: string | null;
  billing_street: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  logo_url: string | null;
  customer_reference: string | null;
};

function formatKind(kind: string) {
  if (kind === "customer") return "Customer";
  if (kind === "demo") return "Demo";
  if (kind === "test") return "Test";
  return kind;
}

function formatStatus(status: string) {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  if (status === "archived") return "Archived";
  return status;
}

function formatDate(value: string, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function show(value: string | null) {
  return value?.trim() ? value : "—";
}

function normalizeNextPath(value: string | null | undefined) {
  const next = (value ?? "").trim();
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  return next;
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        accountRequired: "Organization name is required.",
        billingEmailInvalid: "Billing email is invalid.",
        saveFailedPrefix: "Failed to save organization account:",
        eyebrow: "Account",
        title: "My Account",
        intro:
          "Maintain your organization master data here. Operational organization and billing fields are editable, while technical system fields remain read-only.",
        demoReadOnly: "Demo mode: changes are disabled.",
        saved: "Changes were saved successfully.",
        statName: "Name",
        statNameText: "Display name of the active organization.",
        statSlug: "Camera code",
        statSlugText: "Technical organization code for camera provisioning.",
        statKind: "Kind",
        statKindText: "Tenant classification in Venaris.",
        statStatus: "Status",
        statStatusText: "Lifecycle of the organization, currently read-only.",
        editTitle: "Edit organization data",
        nameLabel: "Organization name *",
        legalNameLabel: "Name on invoice",
        contactPersonLabel: "Contact person",
        billingEmailLabel: "Billing email",
        customerReferenceLabel: "Customer reference",
        streetLabel: "Street / house number",
        postalCodeLabel: "Postal code",
        cityLabel: "City",
        countryLabel: "Country",
        notesLabel: "Notes",
        saveIdle: "Save changes",
        savePending: "Saving...",
        demoMode: "Demo mode",
        readOnlyTitle: "Read-only system data",
        organizationId: "Organization ID",
        slugLabel: "Camera code",
        kindLabel: "Kind",
        statusLabel: "Status",
        ownerUserId: "Owner user ID",
        createdAt: "Created at",
        logoUrl: "Logo URL",
      }
    : {
        accountRequired: "Organisationsname ist erforderlich.",
        billingEmailInvalid: "Rechnungs-E-Mail ist ungültig.",
        saveFailedPrefix: "Failed to save organization account:",
        eyebrow: "Mein Konto",
        title: "Mein Konto",
        intro:
          "Pflege hier die Stammdaten Deiner Organisation. Editierbar sind die fachlichen Organisations- und Rechnungsfelder, während technische Systemfelder bewusst schreibgeschützt bleiben.",
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        saved: "Änderungen wurden erfolgreich gespeichert.",
        statName: "Name",
        statNameText: "Anzeigename der aktiven Organisation.",
        statSlug: "Kamera-Code",
        statSlugText: "Technischer Organisationscode für Kamera-Provisioning.",
        statKind: "Kind",
        statKindText: "Typisierung des Tenants in Venaris.",
        statStatus: "Status",
        statStatusText: "Lebenszyklus der Organisation, aktuell schreibgeschützt.",
        editTitle: "Organisationsdaten bearbeiten",
        nameLabel: "Organisationsname *",
        legalNameLabel: "Name auf der Rechnung",
        contactPersonLabel: "Ansprechpartner",
        billingEmailLabel: "Rechnungs-E-Mail",
        customerReferenceLabel: "Kundenreferenz",
        streetLabel: "Straße / Hausnummer",
        postalCodeLabel: "PLZ",
        cityLabel: "Ort",
        countryLabel: "Land",
        notesLabel: "Notizen",
        saveIdle: "Änderungen speichern",
        savePending: "Speichert...",
        demoMode: "Demo-Modus",
        readOnlyTitle: "Systemdaten (schreibgeschützt)",
        organizationId: "Organisation ID",
        slugLabel: "Kamera-Code",
        kindLabel: "Kind",
        statusLabel: "Status",
        ownerUserId: "Owner-User-ID",
        createdAt: "Angelegt am",
        logoUrl: "Logo URL",
      };
}

async function saveOrganizationAccount(formData: FormData) {
  "use server";

  const requestedNext = normalizeNextPath(String(formData.get("next") ?? ""));
  const demoRedirectUrl = requestedNext
    ? `/orga/account?demo_read_only=1&next=${encodeURIComponent(requestedNext)}`
    : "/orga/account?demo_read_only=1";

  const ctx = await requirePathAccess("/orga/account");
  redirectIfDemoWrite(ctx, demoRedirectUrl);

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
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

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const name = String(formData.get("name") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const contactPerson = String(formData.get("contact_person") ?? "").trim();
  const billingEmail = String(formData.get("billing_email") ?? "").trim();
  const billingStreet = String(formData.get("billing_street") ?? "").trim();
  const billingPostalCode = String(formData.get("billing_postal_code") ?? "").trim();
  const billingCity = String(formData.get("billing_city") ?? "").trim();
  const billingCountry =
    String(formData.get("billing_country") ?? "").trim().toUpperCase() || "DE";
  const customerReference = String(formData.get("customer_reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    throw new Error(text.accountRequired);
  }

  if (billingEmail && !billingEmail.includes("@")) {
    throw new Error(text.billingEmailInvalid);
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      legal_name: legalName || null,
      contact_person: contactPerson || null,
      billing_email: billingEmail || null,
      billing_street: billingStreet || null,
      billing_postal_code: billingPostalCode || null,
      billing_city: billingCity || null,
      billing_country: billingCountry || null,
      customer_reference: customerReference || null,
      notes: notes || null,
    })
    .eq("id", organization.id);

  if (error) {
    throw new Error(`${text.saveFailedPrefix} ${error.message}`);
  }

  if (requestedNext) {
    redirect(requestedNext);
  }

  redirect("/orga/account?saved=1");
}

function StatCard({
  title,
  value,
  text,
}: {
  title: string;
  value: string;
  text: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="text-sm text-white/50">{title}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <p className="mt-2 text-sm text-white/68">{text}</p>
    </div>
  );
}

export default async function OrgaAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{
    saved?: string;
    demo_read_only?: string;
    next?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const saved = params.saved === "1";
  const demoReadOnly = params.demo_read_only === "1";
  const nextPath = normalizeNextPath(params.next);

  const ctx = await requirePathAccess("/orga/account");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const isDemo = ctx.isDemo;

  if (!organization) {
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

  const { data, error } = await supabase
    .from("organizations")
    .select(
      `
      id,
      name,
      slug,
      camera_code,
      kind,
      status,
      owner_user_id,
      created_at,
      notes,
      legal_name,
      contact_person,
      billing_email,
      billing_street,
      billing_postal_code,
      billing_city,
      billing_country,
      logo_url,
      customer_reference
    `
    )
    .eq("id", organization.id)
    .single();

  if (error) {
    throw new Error(`Failed to load organization: ${error.message}`);
  }

  const org = data as OrganizationRow;

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

      {saved ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">{text.saved}</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title={text.statName} value={org.name} text={text.statNameText} />
        <StatCard title={text.statSlug} value={org.camera_code} text={text.statSlugText} />
        <StatCard
          title={text.statKind}
          value={formatKind(org.kind)}
          text={text.statKindText}
        />
        <StatCard
          title={text.statStatus}
          value={formatStatus(org.status)}
          text={text.statStatusText}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm xl:col-span-2">
          <h2 className="text-lg font-medium text-white">{text.editTitle}</h2>

          <form action={saveOrganizationAccount} className="mt-6 space-y-6">
            <input type="hidden" name="next" value={nextPath ?? ""} />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-white">
                  {text.nameLabel}
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  defaultValue={org.name}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="legal_name"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.legalNameLabel}
                </label>
                <input
                  id="legal_name"
                  name="legal_name"
                  type="text"
                  defaultValue={org.legal_name ?? ""}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="contact_person"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.contactPersonLabel}
                </label>
                <input
                  id="contact_person"
                  name="contact_person"
                  type="text"
                  defaultValue={org.contact_person ?? ""}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="billing_email"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.billingEmailLabel}
                </label>
                <input
                  id="billing_email"
                  name="billing_email"
                  type="email"
                  defaultValue={org.billing_email ?? ""}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="customer_reference"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.customerReferenceLabel}
                </label>
                <input
                  id="customer_reference"
                  name="customer_reference"
                  type="text"
                  defaultValue={org.customer_reference ?? ""}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="billing_street"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.streetLabel}
                </label>
                <input
                  id="billing_street"
                  name="billing_street"
                  type="text"
                  defaultValue={org.billing_street ?? ""}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="billing_postal_code"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.postalCodeLabel}
                </label>
                <input
                  id="billing_postal_code"
                  name="billing_postal_code"
                  type="text"
                  defaultValue={org.billing_postal_code ?? ""}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="billing_city"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.cityLabel}
                </label>
                <input
                  id="billing_city"
                  name="billing_city"
                  type="text"
                  defaultValue={org.billing_city ?? ""}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="billing_country"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.countryLabel}
                </label>
                <input
                  id="billing_country"
                  name="billing_country"
                  type="text"
                  defaultValue={org.billing_country ?? "DE"}
                  disabled={isDemo}
                  title={isDemo ? text.demoReadOnly : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm uppercase text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="mb-2 block text-sm font-medium text-white">
                {text.notesLabel}
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={5}
                defaultValue={org.notes ?? ""}
                disabled={isDemo}
                title={isDemo ? text.demoReadOnly : ""}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton
                idleLabel={isDemo ? text.demoMode : text.saveIdle}
                pendingLabel={text.savePending}
              />
            </div>
          </form>
        </section>

        <aside className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white">{text.readOnlyTitle}</h2>

          <dl className="mt-4 divide-y divide-white/8">
            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">{text.organizationId}</dt>
              <dd className="text-sm break-all text-white">{org.id}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">{text.slugLabel}</dt>
              <dd className="text-sm text-white">{org.camera_code}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">{text.kindLabel}</dt>
              <dd className="text-sm text-white">{formatKind(org.kind)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">{text.statusLabel}</dt>
              <dd className="text-sm text-white">{formatStatus(org.status)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">{text.ownerUserId}</dt>
              <dd className="text-sm break-all text-white">
                {show(org.owner_user_id)}
              </dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">{text.createdAt}</dt>
              <dd className="text-sm text-white">{formatDate(org.created_at, language)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">{text.logoUrl}</dt>
              <dd className="text-sm break-all text-white">
                {show(org.logo_url)}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}