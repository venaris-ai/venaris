// src/app/orga/account/page.tsx #4
import { redirect } from "next/navigation";
import { redirectIfDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import SubmitButton from "@/components/SubmitButton";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  status: string;
  owner_user_id: string | null;
  created_at: string;
  notes: string | null;
  legal_name: string | null;
  legal_form: string | null;
  contact_person: string | null;
  billing_email: string | null;
  billing_street: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  vat_id: string | null;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function show(value: string | null) {
  return value?.trim() ? value : "—";
}

async function saveOrganizationAccount(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/account");
  redirectIfDemoWrite(ctx, "/orga/account?demo_read_only=1");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const name = String(formData.get("name") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const legalForm = String(formData.get("legal_form") ?? "").trim();
  const contactPerson = String(formData.get("contact_person") ?? "").trim();
  const billingEmail = String(formData.get("billing_email") ?? "").trim();
  const billingStreet = String(formData.get("billing_street") ?? "").trim();
  const billingPostalCode = String(formData.get("billing_postal_code") ?? "").trim();
  const billingCity = String(formData.get("billing_city") ?? "").trim();
  const billingCountry =
    String(formData.get("billing_country") ?? "").trim().toUpperCase() || "DE";
  const vatId = String(formData.get("vat_id") ?? "").trim();
  const customerReference = String(formData.get("customer_reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    throw new Error("Organisationsname ist erforderlich.");
  }

  if (billingEmail && !billingEmail.includes("@")) {
    throw new Error("Billing E-Mail ist ungültig.");
  }

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      legal_name: legalName || null,
      legal_form: legalForm || null,
      contact_person: contactPerson || null,
      billing_email: billingEmail || null,
      billing_street: billingStreet || null,
      billing_postal_code: billingPostalCode || null,
      billing_city: billingCity || null,
      billing_country: billingCountry || null,
      vat_id: vatId || null,
      customer_reference: customerReference || null,
      notes: notes || null,
    })
    .eq("id", organization.id);

  if (error) {
    throw new Error(`Failed to save organization account: ${error.message}`);
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
  searchParams?: Promise<{ saved?: string; demo_read_only?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const saved = params.saved === "1";
  const demoReadOnly = params.demo_read_only === "1";

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

  const { data, error } = await supabase
    .from("organizations")
    .select(
      `
      id,
      name,
      slug,
      kind,
      status,
      owner_user_id,
      created_at,
      notes,
      legal_name,
      legal_form,
      contact_person,
      billing_email,
      billing_street,
      billing_postal_code,
      billing_city,
      billing_country,
      vat_id,
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
            Account
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Mein Konto
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            Pflege hier die Stammdaten Deiner Organisation. Editierbar sind die
            fachlichen Organisations- und Rechnungsfelder, während technische
            Systemfelder bewusst read-only bleiben.
          </p>
        </div>
      </section>

      {demoReadOnly ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">
            Demo-Modus: Änderungen sind deaktiviert.
          </p>
        </section>
      ) : null}

      {saved ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">
            Änderungen wurden erfolgreich gespeichert.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Name"
          value={org.name}
          text="Anzeigename der aktiven Organisation."
        />

        <StatCard
          title="Slug"
          value={org.slug}
          text="Technischer Kurzname, aktuell read-only."
        />

        <StatCard
          title="Kind"
          value={formatKind(org.kind)}
          text="Typisierung des Tenants in Venaris."
        />

        <StatCard
          title="Status"
          value={formatStatus(org.status)}
          text="Lebenszyklus der Organisation, aktuell read-only."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm xl:col-span-2">
          <h2 className="text-lg font-medium text-white">Organisationsdaten bearbeiten</h2>

          <form action={saveOrganizationAccount} className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-white">
                  Organisationsname *
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  defaultValue={org.name}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="legal_name"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Legal Name
                </label>
                <input
                  id="legal_name"
                  name="legal_name"
                  type="text"
                  defaultValue={org.legal_name ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="legal_form"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Rechtsform
                </label>
                <input
                  id="legal_form"
                  name="legal_form"
                  type="text"
                  defaultValue={org.legal_form ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                  placeholder="z. B. GmbH"
                />
              </div>

              <div>
                <label
                  htmlFor="contact_person"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Ansprechpartner
                </label>
                <input
                  id="contact_person"
                  name="contact_person"
                  type="text"
                  defaultValue={org.contact_person ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="billing_email"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Billing E-Mail
                </label>
                <input
                  id="billing_email"
                  name="billing_email"
                  type="email"
                  defaultValue={org.billing_email ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="customer_reference"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Kundenreferenz
                </label>
                <input
                  id="customer_reference"
                  name="customer_reference"
                  type="text"
                  defaultValue={org.customer_reference ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="billing_street"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Straße / Hausnummer
                </label>
                <input
                  id="billing_street"
                  name="billing_street"
                  type="text"
                  defaultValue={org.billing_street ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="billing_postal_code"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  PLZ
                </label>
                <input
                  id="billing_postal_code"
                  name="billing_postal_code"
                  type="text"
                  defaultValue={org.billing_postal_code ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="billing_city"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Ort
                </label>
                <input
                  id="billing_city"
                  name="billing_city"
                  type="text"
                  defaultValue={org.billing_city ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label
                  htmlFor="billing_country"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Land
                </label>
                <input
                  id="billing_country"
                  name="billing_country"
                  type="text"
                  defaultValue={org.billing_country ?? "DE"}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm uppercase text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>

              <div>
                <label htmlFor="vat_id" className="mb-2 block text-sm font-medium text-white">
                  USt-ID / Steuer-ID
                </label>
                <input
                  id="vat_id"
                  name="vat_id"
                  type="text"
                  defaultValue={org.vat_id ?? ""}
                  disabled={isDemo}
                  title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="mb-2 block text-sm font-medium text-white">
                Notizen
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={5}
                defaultValue={org.notes ?? ""}
                disabled={isDemo}
                title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton
                idleLabel={isDemo ? "Demo-Modus" : "Änderungen speichern"}
                pendingLabel="Speichert..."
              />
            </div>
          </form>
        </section>

        <aside className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white">Read-only Systemdaten</h2>

          <dl className="mt-4 divide-y divide-white/8">
            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">Organisation ID</dt>
              <dd className="text-sm break-all text-white">{org.id}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">Slug</dt>
              <dd className="text-sm text-white">{org.slug}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">Kind</dt>
              <dd className="text-sm text-white">{formatKind(org.kind)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">Status</dt>
              <dd className="text-sm text-white">{formatStatus(org.status)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">Owner User ID</dt>
              <dd className="text-sm break-all text-white">
                {show(org.owner_user_id)}
              </dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">Angelegt am</dt>
              <dd className="text-sm text-white">{formatDate(org.created_at)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-white/45">Logo URL</dt>
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