// src/app/admin/subscriptions/page.tsx #4
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import AdminSubscriptionRequestActions from "./AdminSubscriptionRequestActions";

type RequestStatus = "open" | "approved" | "rejected" | "canceled";
type PlanKey = "starter" | "pro" | "enterprise";

type OrganizationRef = {
  name: string;
  slug: string;
};

type RequestRowDb = {
  id: string;
  organization_id: string;
  requested_by_user_id: string;
  current_plan_key: PlanKey;
  requested_plan_key: PlanKey;
  status: RequestStatus;
  request_type: "upgrade" | "downgrade" | "change";
  message: string | null;
  created_at: string;
  processed_at: string | null;
  resolution_note: string | null;
  organizations: OrganizationRef | OrganizationRef[] | null;
};

type RequestRow = {
  id: string;
  organization_id: string;
  requested_by_user_id: string;
  current_plan_key: PlanKey;
  requested_plan_key: PlanKey;
  status: RequestStatus;
  request_type: "upgrade" | "downgrade" | "change";
  message: string | null;
  created_at: string;
  processed_at: string | null;
  resolution_note: string | null;
  organization: OrganizationRef | null;
};

const VENARIS_ADMIN_EMAIL = "dev@venaris.io";

function normalizeOrganization(
  organizations: RequestRowDb["organizations"]
): OrganizationRef | null {
  if (!organizations) return null;
  if (Array.isArray(organizations)) return organizations[0] ?? null;
  return organizations;
}

function normalizeRequestRow(row: RequestRowDb): RequestRow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    requested_by_user_id: row.requested_by_user_id,
    current_plan_key: row.current_plan_key,
    requested_plan_key: row.requested_plan_key,
    status: row.status,
    request_type: row.request_type,
    message: row.message,
    created_at: row.created_at,
    processed_at: row.processed_at,
    resolution_note: row.resolution_note,
    organization: normalizeOrganization(row.organizations),
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function planLabel(planKey: PlanKey) {
  switch (planKey) {
    case "starter":
      return "Starter";
    case "pro":
      return "Pro";
    case "enterprise":
      return "Enterprise";
    default:
      return planKey;
  }
}

function statusBadge(status: RequestStatus) {
  switch (status) {
    case "open":
      return "border-amber-300/20 bg-amber-300/10 text-amber-100";
    case "approved":
      return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
    case "rejected":
      return "border-rose-300/20 bg-rose-300/10 text-rose-100";
    case "canceled":
      return "border-white/10 bg-white/5 text-white/68";
    default:
      return "border-white/10 bg-white/5 text-white/68";
  }
}

function StatCard({
  title,
  value,
  subline,
}: {
  title: string;
  value: string | number;
  subline: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-white/60">{subline}</div>
    </div>
  );
}

export default async function AdminSubscriptionsPage() {
  await requirePathAccess("/admin/subscriptions");

  const supabase = supabaseServer();

  const [openRequestsResult, recentRequestsResult] = await Promise.all([
    supabase
      .from("organization_subscription_change_requests")
      .select(
        `
        id,
        organization_id,
        requested_by_user_id,
        current_plan_key,
        requested_plan_key,
        status,
        request_type,
        message,
        created_at,
        processed_at,
        resolution_note,
        organizations (
          name,
          slug
        )
        `
      )
      .eq("status", "open")
      .order("created_at", { ascending: true }),

    supabase
      .from("organization_subscription_change_requests")
      .select(
        `
        id,
        organization_id,
        requested_by_user_id,
        current_plan_key,
        requested_plan_key,
        status,
        request_type,
        message,
        created_at,
        processed_at,
        resolution_note,
        organizations (
          name,
          slug
        )
        `
      )
      .in("status", ["approved", "rejected"])
      .order("processed_at", { ascending: false })
      .limit(10),
  ]);

  if (openRequestsResult.error) {
    throw new Error(
      `Failed to load open subscription requests: ${openRequestsResult.error.message}`
    );
  }

  if (recentRequestsResult.error) {
    throw new Error(
      `Failed to load recent subscription requests: ${recentRequestsResult.error.message}`
    );
  }

  const openRequests = ((openRequestsResult.data ?? []) as RequestRowDb[]).map(
    normalizeRequestRow
  );

  const recentRequests = (
    (recentRequestsResult.data ?? []) as RequestRowDb[]
  ).map(normalizeRequestRow);

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          Admin
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Subscription Requests
        </h1>
        <p className="mt-2 text-sm text-white/68">
          Interne Venaris-Ansicht für offene Plananfragen. Zugriff nur für{" "}
          {VENARIS_ADMIN_EMAIL}.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Open Requests"
          value={openRequests.length}
          subline="aktuell offen"
        />
        <StatCard
          title="Recent Decisions"
          value={recentRequests.length}
          subline="letzte Bearbeitungen"
        />
        <StatCard
          title="Admin Access"
          value="Restricted"
          subline="nur definierter Venaris-Admin"
        />
        <StatCard
          title="Scope"
          value="Commercial"
          subline="Planwechsel und Freigaben"
        />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-white">Offene Anfragen</h2>
            <p className="mt-1 text-sm text-white/65">
              Diese Anfragen können genehmigt oder abgelehnt werden.
            </p>
          </div>
          <div className="text-sm text-white/50">{openRequests.length} offen</div>
        </div>

        <div className="mt-6 space-y-4">
          {openRequests.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
              Aktuell gibt es keine offenen Plananfragen.
            </div>
          ) : (
            openRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-[24px] border border-white/10 bg-white/5 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">
                      {request.organization?.name ?? "Unbekannte Organization"}
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                      {request.organization?.slug ?? "—"} ·{" "}
                      {planLabel(request.current_plan_key)} →{" "}
                      {planLabel(request.requested_plan_key)} ·{" "}
                      {request.request_type}
                    </div>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(
                      request.status
                    )}`}
                  >
                    {request.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="text-sm text-white/72">
                    <div>
                      <span className="font-medium text-white">Angelegt:</span>{" "}
                      {formatDateTime(request.created_at)}
                    </div>
                    <div className="mt-1 break-all">
                      <span className="font-medium text-white">Request ID:</span>{" "}
                      {request.id}
                    </div>
                    <div className="mt-1 break-all">
                      <span className="font-medium text-white">Anfragender User:</span>{" "}
                      {request.requested_by_user_id}
                    </div>
                  </div>

                  <div className="text-sm text-white/72">
                    <div>
                      <span className="font-medium text-white">Nachricht:</span>{" "}
                      {request.message?.trim() || "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <AdminSubscriptionRequestActions requestId={request.id} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-medium text-white">Zuletzt bearbeitet</h2>
          <p className="mt-1 text-sm text-white/65">
            Die letzten genehmigten oder abgelehnten Anfragen.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {recentRequests.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/68">
              Noch keine bearbeiteten Plananfragen vorhanden.
            </div>
          ) : (
            recentRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-[24px] border border-white/10 bg-white/5 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">
                      {request.organization?.name ?? "Unbekannte Organization"}
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                      {request.organization?.slug ?? "—"} ·{" "}
                      {planLabel(request.current_plan_key)} →{" "}
                      {planLabel(request.requested_plan_key)} ·{" "}
                      {request.request_type}
                    </div>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(
                      request.status
                    )}`}
                  >
                    {request.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-white/72 md:grid-cols-2">
                  <div>
                    <div>
                      <span className="font-medium text-white">Angelegt:</span>{" "}
                      {formatDateTime(request.created_at)}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium text-white">Bearbeitet:</span>{" "}
                      {formatDateTime(request.processed_at)}
                    </div>
                  </div>

                  <div>
                    <div>
                      <span className="font-medium text-white">Nachricht:</span>{" "}
                      {request.message?.trim() || "—"}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium text-white">Notiz:</span>{" "}
                      {request.resolution_note?.trim() || "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}