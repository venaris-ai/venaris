// src/app/orga/account/page.tsx #2
import { redirect } from "next/navigation";
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

export default async function OrgaAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const saved = params.saved === "1";

  const ctx = await requirePathAccess("/orga/account");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;

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
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Mein Konto</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Pflege hier die Stammdaten Deiner Organisation. Editierbar sind die
          fachlichen Organisations- und Rechnungsfelder, während technische
          Systemfelder bewusst read-only bleiben.
        </p>
      </section>

      {saved ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Änderungen wurden erfolgreich gespeichert.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Name</div>
          <div className="mt-2 text-xl font-semibold">{org.name}</div>
          <p className="mt-2 text-sm text-gray-600">
            Anzeigename der aktiven Organisation.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Slug</div>
          <div className="mt-2 text-xl font-semibold">{org.slug}</div>
          <p className="mt-2 text-sm text-gray-600">
            Technischer Kurzname, aktuell read-only.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Kind</div>
          <div className="mt-2 text-xl font-semibold">{formatKind(org.kind)}</div>
          <p className="mt-2 text-sm text-gray-600">
            Typisierung des Tenants in Venaris.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Status</div>
          <div className="mt-2 text-xl font-semibold">{formatStatus(org.status)}</div>
          <p className="mt-2 text-sm text-gray-600">
            Lebenszyklus der Organisation, aktuell read-only.
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border bg-white p-6 shadow-sm xl:col-span-2">
          <h2 className="text-lg font-medium">Organisationsdaten bearbeiten</h2>

          <form action={saveOrganizationAccount} className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-900">
                  Organisationsname *
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  defaultValue={org.name}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label htmlFor="legal_name" className="mb-2 block text-sm font-medium text-gray-900">
                  Legal Name
                </label>
                <input
                  id="legal_name"
                  name="legal_name"
                  type="text"
                  defaultValue={org.legal_name ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label htmlFor="legal_form" className="mb-2 block text-sm font-medium text-gray-900">
                  Rechtsform
                </label>
                <input
                  id="legal_form"
                  name="legal_form"
                  type="text"
                  defaultValue={org.legal_form ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                  placeholder="z. B. GmbH"
                />
              </div>

              <div>
                <label htmlFor="contact_person" className="mb-2 block text-sm font-medium text-gray-900">
                  Ansprechpartner
                </label>
                <input
                  id="contact_person"
                  name="contact_person"
                  type="text"
                  defaultValue={org.contact_person ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label htmlFor="billing_email" className="mb-2 block text-sm font-medium text-gray-900">
                  Billing E-Mail
                </label>
                <input
                  id="billing_email"
                  name="billing_email"
                  type="email"
                  defaultValue={org.billing_email ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label htmlFor="customer_reference" className="mb-2 block text-sm font-medium text-gray-900">
                  Kundenreferenz
                </label>
                <input
                  id="customer_reference"
                  name="customer_reference"
                  type="text"
                  defaultValue={org.customer_reference ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="billing_street" className="mb-2 block text-sm font-medium text-gray-900">
                  Straße / Hausnummer
                </label>
                <input
                  id="billing_street"
                  name="billing_street"
                  type="text"
                  defaultValue={org.billing_street ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label htmlFor="billing_postal_code" className="mb-2 block text-sm font-medium text-gray-900">
                  PLZ
                </label>
                <input
                  id="billing_postal_code"
                  name="billing_postal_code"
                  type="text"
                  defaultValue={org.billing_postal_code ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label htmlFor="billing_city" className="mb-2 block text-sm font-medium text-gray-900">
                  Ort
                </label>
                <input
                  id="billing_city"
                  name="billing_city"
                  type="text"
                  defaultValue={org.billing_city ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label htmlFor="billing_country" className="mb-2 block text-sm font-medium text-gray-900">
                  Land
                </label>
                <input
                  id="billing_country"
                  name="billing_country"
                  type="text"
                  defaultValue={org.billing_country ?? "DE"}
                  className="w-full rounded-md border px-3 py-2 text-sm uppercase outline-none"
                />
              </div>

              <div>
                <label htmlFor="vat_id" className="mb-2 block text-sm font-medium text-gray-900">
                  USt-ID / Steuer-ID
                </label>
                <input
                  id="vat_id"
                  name="vat_id"
                  type="text"
                  defaultValue={org.vat_id ?? ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="mb-2 block text-sm font-medium text-gray-900">
                Notizen
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={5}
                defaultValue={org.notes ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton
                idleLabel="Änderungen speichern"
                pendingLabel="Speichert..."
              />
            </div>
          </form>
        </section>

        <aside className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium">Read-only Systemdaten</h2>

          <dl className="mt-4 divide-y">
            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-gray-500">Organisation ID</dt>
              <dd className="text-sm break-all text-gray-900">{org.id}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-gray-500">Slug</dt>
              <dd className="text-sm text-gray-900">{org.slug}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-gray-500">Kind</dt>
              <dd className="text-sm text-gray-900">{formatKind(org.kind)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="text-sm text-gray-900">{formatStatus(org.status)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-gray-500">Owner User ID</dt>
              <dd className="text-sm break-all text-gray-900">
                {show(org.owner_user_id)}
              </dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-gray-500">Angelegt am</dt>
              <dd className="text-sm text-gray-900">{formatDate(org.created_at)}</dd>
            </div>

            <div className="grid gap-2 py-3">
              <dt className="text-sm font-medium text-gray-500">Logo URL</dt>
              <dd className="text-sm break-all text-gray-900">
                {show(org.logo_url)}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}