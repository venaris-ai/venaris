// src/app/admin/subscriptions/page.tsx #2
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import AdminSubscriptionRequestActions from "./AdminSubscriptionRequestActions";

type RequestStatus = "open" | "approved" | "rejected" | "canceled";
type PlanKey = "starter" | "pro" | "enterprise";

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
  organizations:
    | {
        name: string;
        slug: string;
      }[]
    | null;
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
  organization: {
    name: string;
    slug: string;
  } | null;
};

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
    organization: row.organizations?.[0] ?? null,
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
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "canceled":
      return "border-gray-200 bg-gray-50 text-gray-700";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
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
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Admin · Subscription Requests
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Interne Venaris-Ansicht für offene Plananfragen. Zugriff nur für
          dev@venaris.io.
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Offene Anfragen</h2>
            <p className="mt-1 text-sm text-gray-600">
              Diese Anfragen können genehmigt oder abgelehnt werden.
            </p>
          </div>
          <div className="text-sm text-gray-500">{openRequests.length} offen</div>
        </div>

        <div className="mt-6 space-y-4">
          {openRequests.length === 0 ? (
            <div className="rounded-2xl border bg-gray-50 p-5 text-sm text-gray-600">
              Aktuell gibt es keine offenen Plananfragen.
            </div>
          ) : (
            openRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl border bg-gray-50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      {request.organization?.name ?? "Unbekannte Organization"}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
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
                  <div className="text-sm text-gray-700">
                    <div>
                      <span className="font-medium">Angelegt:</span>{" "}
                      {formatDateTime(request.created_at)}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Requested by:</span>{" "}
                      {request.requested_by_user_id}
                    </div>
                  </div>

                  <div className="text-sm text-gray-700">
                    <div>
                      <span className="font-medium">Nachricht:</span>{" "}
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

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-medium">Zuletzt bearbeitet</h2>
          <p className="mt-1 text-sm text-gray-600">
            Die letzten genehmigten oder abgelehnten Anfragen.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {recentRequests.length === 0 ? (
            <div className="rounded-2xl border bg-gray-50 p-5 text-sm text-gray-600">
              Noch keine bearbeiteten Plananfragen vorhanden.
            </div>
          ) : (
            recentRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl border bg-gray-50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      {request.organization?.name ?? "Unbekannte Organization"}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
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

                <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-gray-700">
                  <div>
                    <div>
                      <span className="font-medium">Angelegt:</span>{" "}
                      {formatDateTime(request.created_at)}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Bearbeitet:</span>{" "}
                      {formatDateTime(request.processed_at)}
                    </div>
                  </div>

                  <div>
                    <div>
                      <span className="font-medium">Nachricht:</span>{" "}
                      {request.message?.trim() || "—"}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Resolution:</span>{" "}
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