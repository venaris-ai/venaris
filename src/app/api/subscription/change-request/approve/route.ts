// src/app/api/subscription/change-request/approve/route.ts #6
import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthServer } from "@/lib/supabaseAuthServer";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  BILLING_PLANS,
  getBillingPlanPriceCents,
  isSelfServeBillingPlanKey,
  type BillingCycle,
} from "@/lib/billing/plans";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

type PlanKey = "starter" | "pro" | "enterprise";
type RequestStatus = "open" | "approved" | "rejected" | "canceled";

type Payload = {
  requestId: string;
  resolutionNote?: string;
};

type ChangeRequestRow = {
  id: string;
  organization_id: string;
  current_plan_key: PlanKey;
  requested_plan_key: PlanKey;
  status: RequestStatus;
  request_type: "upgrade" | "downgrade" | "change";
};

type SubscriptionRow = {
  id: string;
  organization_id: string;
  billing_cycle: BillingCycle;
};

const VENARIS_ADMIN_EMAIL = "dev@venaris.io";

function isPlanKey(value: unknown): value is PlanKey {
  return value === "starter" || value === "pro" || value === "enterprise";
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        notAuthenticated: "Not authenticated.",
        forbidden: "Forbidden: Venaris admin only.",
        requestIdRequired: "requestId required.",
        approvedManually: "Approved manually by Venaris admin",
        failedToLoadChangeRequest: "Failed to load change request.",
        changeRequestNotFound: "Change request not found.",
        onlyOpenCanBeApproved:
          "Only open change requests can be approved.",
        invalidRequestedPlanKey: "Invalid requested plan key.",
        selfServePlanUsesStripe:
          "Starter and Pro are managed via self-service billing and cannot be approved manually.",
        failedToLoadSubscription: "Failed to load subscription.",
        subscriptionNotFound: "Subscription not found.",
        failedToUpdateSubscription: "Failed to update subscription.",
        approvalUpdateFailed:
          "Subscription updated, but request approval update failed.",
        unexpectedError: "Unexpected error.",
      }
    : {
        notAuthenticated: "Nicht authentifiziert.",
        forbidden: "Verboten: nur Venaris-Admin.",
        requestIdRequired: "requestId erforderlich.",
        approvedManually: "Manuell durch Venaris-Admin genehmigt",
        failedToLoadChangeRequest:
          "Plananfrage konnte nicht geladen werden.",
        changeRequestNotFound: "Plananfrage nicht gefunden.",
        onlyOpenCanBeApproved:
          "Nur offene Plananfragen können genehmigt werden.",
        invalidRequestedPlanKey: "Ungültiger angefragter Plan-Key.",
        selfServePlanUsesStripe:
          "Starter und Pro werden über Self-Service-Billing verwaltet und können nicht manuell genehmigt werden.",
        failedToLoadSubscription:
          "Abo konnte nicht geladen werden.",
        subscriptionNotFound: "Abo nicht gefunden.",
        failedToUpdateSubscription:
          "Abo konnte nicht aktualisiert werden.",
        approvalUpdateFailed:
          "Abo wurde aktualisiert, aber die Genehmigung der Anfrage konnte nicht gespeichert werden.",
        unexpectedError: "Unerwarteter Fehler.",
      };
}

export async function POST(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const auth = await supabaseAuthServer();
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: text.notAuthenticated },
        { status: 401 }
      );
    }

    const userEmail = (user.email ?? "").toLowerCase().trim();

    if (userEmail !== VENARIS_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: text.forbidden },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Partial<Payload>;
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const resolutionNote =
      typeof body.resolutionNote === "string" && body.resolutionNote.trim()
        ? body.resolutionNote.trim()
        : text.approvedManually;

    if (!requestId) {
      return NextResponse.json(
        { error: text.requestIdRequired },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const requestResult = await supabase
      .from("organization_subscription_change_requests")
      .select(
        "id,organization_id,current_plan_key,requested_plan_key,status,request_type"
      )
      .eq("id", requestId)
      .maybeSingle<ChangeRequestRow>();

    if (requestResult.error) {
      return NextResponse.json(
        {
          error: text.failedToLoadChangeRequest,
          details: requestResult.error.message,
        },
        { status: 500 }
      );
    }

    const changeRequest = requestResult.data;

    if (!changeRequest) {
      return NextResponse.json(
        { error: text.changeRequestNotFound },
        { status: 404 }
      );
    }

    if (changeRequest.status !== "open") {
      return NextResponse.json(
        { error: text.onlyOpenCanBeApproved },
        { status: 409 }
      );
    }

    if (!isPlanKey(changeRequest.requested_plan_key)) {
      return NextResponse.json(
        { error: text.invalidRequestedPlanKey },
        { status: 400 }
      );
    }

    if (isSelfServeBillingPlanKey(changeRequest.requested_plan_key)) {
      return NextResponse.json(
        { error: text.selfServePlanUsesStripe },
        { status: 400 }
      );
    }

    const targetPlan = BILLING_PLANS[changeRequest.requested_plan_key];

    const subscriptionResult = await supabase
      .from("organization_subscriptions")
      .select("id,organization_id,billing_cycle")
      .eq("organization_id", changeRequest.organization_id)
      .maybeSingle<SubscriptionRow>();

    if (subscriptionResult.error) {
      return NextResponse.json(
        {
          error: text.failedToLoadSubscription,
          details: subscriptionResult.error.message,
        },
        { status: 500 }
      );
    }

    const subscription = subscriptionResult.data;

    if (!subscription) {
      return NextResponse.json(
        { error: text.subscriptionNotFound },
        { status: 404 }
      );
    }

    const billingCycle = subscription.billing_cycle ?? "monthly";
    const targetPriceCents =
      getBillingPlanPriceCents(changeRequest.requested_plan_key, billingCycle) ?? 0;

    const nowIso = new Date().toISOString();

    const updateSubscriptionResult = await supabase
      .from("organization_subscriptions")
      .update({
        plan_key: changeRequest.requested_plan_key,
        status: "active",
        billing_cycle: billingCycle,
        current_period_start: nowIso,
        current_period_end: null,
        trial_ends_at: null,
        cancel_at_period_end: false,
        canceled_at: null,
        price_amount_cents: targetPriceCents,
        price_currency: "EUR",
        max_cameras: targetPlan.maxCameras ?? 999999,
        max_members: targetPlan.maxMembers ?? 999999,
        billing_provider: "manual",
        updated_at: nowIso,
        notes: `Activated manually from change request ${changeRequest.id}`,
      })
      .eq("organization_id", changeRequest.organization_id)
      .select(
        "organization_id,plan_key,status,billing_cycle,price_amount_cents,price_currency,max_cameras,max_members,billing_provider"
      )
      .single();

    if (updateSubscriptionResult.error || !updateSubscriptionResult.data) {
      return NextResponse.json(
        {
          error: text.failedToUpdateSubscription,
          details:
            updateSubscriptionResult.error?.message ?? "no subscription returned",
        },
        { status: 500 }
      );
    }

    const approveRequestResult = await supabase
      .from("organization_subscription_change_requests")
      .update({
        status: "approved",
        processed_at: nowIso,
        processed_by_user_id: user.id,
        resolution_note: resolutionNote,
      })
      .eq("id", changeRequest.id)
      .select(
        "id,organization_id,current_plan_key,requested_plan_key,status,request_type,processed_at,processed_by_user_id,resolution_note"
      )
      .single();

    if (approveRequestResult.error || !approveRequestResult.data) {
      return NextResponse.json(
        {
          error: text.approvalUpdateFailed,
          details:
            approveRequestResult.error?.message ?? "no approved request returned",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        subscription: updateSubscriptionResult.data,
        request: approveRequestResult.data,
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: text.unexpectedError,
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}