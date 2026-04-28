// src/app/api/subscription/change-request/route.ts #9
import { NextRequest, NextResponse } from "next/server";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";
import { isSelfServeBillingPlanKey } from "@/lib/billing/plans";
import { sendSubscriptionChangeRequestNotificationEmail } from "@/lib/email/sendSubscriptionChangeRequestNotificationEmail";

type PlanKey = "starter" | "pro" | "enterprise";
type RequestType = "upgrade" | "downgrade" | "change";

type Payload = {
  requestedPlanKey: PlanKey;
  message?: string;
};

type SubscriptionRow = {
  plan_key: PlanKey;
  status: string;
};

type InsertedChangeRequestRow = {
  id: string;
  organization_id: string;
  current_plan_key: PlanKey;
  requested_plan_key: PlanKey;
  status: string;
  request_type: RequestType;
  created_at: string;
};

const PLAN_ORDER: Record<PlanKey, number> = {
  starter: 1,
  pro: 2,
  enterprise: 3,
};

function isPlanKey(value: unknown): value is PlanKey {
  return value === "starter" || value === "pro" || value === "enterprise";
}

function deriveRequestType(
  currentPlanKey: PlanKey,
  requestedPlanKey: PlanKey
): RequestType {
  if (PLAN_ORDER[requestedPlanKey] > PLAN_ORDER[currentPlanKey]) {
    return "upgrade";
  }

  if (PLAN_ORDER[requestedPlanKey] < PLAN_ORDER[currentPlanKey]) {
    return "downgrade";
  }

  return "change";
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "Active organization not found.",
        invalidRequestedPlanKey: "Invalid requestedPlanKey.",
        selfServePlanUsesStripe:
          "Starter and Pro are managed via self-service billing and can no longer be requested manually.",
        failedToLoadSubscription: "Failed to load subscription.",
        subscriptionNotFound: "Subscription not found.",
        failedToCheckOpenRequests: "Failed to check open requests.",
        existingOpenRequest:
          "There is already an open plan request for this organization.",
        failedToCreateChangeRequest: "Failed to create change request.",
        unexpectedError: "Unexpected error.",
      }
    : {
        activeOrganizationNotFound: "Aktive Organization nicht gefunden.",
        invalidRequestedPlanKey: "Ungültiger requestedPlanKey.",
        selfServePlanUsesStripe:
          "Starter und Pro werden über Self-Service-Billing verwaltet und können nicht mehr manuell angefragt werden.",
        failedToLoadSubscription: "Abo konnte nicht geladen werden.",
        subscriptionNotFound: "Abo nicht gefunden.",
        failedToCheckOpenRequests:
          "Offene Plananfragen konnten nicht geprüft werden.",
        existingOpenRequest:
          "Es gibt bereits eine offene Plananfrage für diese Organization.",
        failedToCreateChangeRequest:
          "Plananfrage konnte nicht erstellt werden.",
        unexpectedError: "Unerwarteter Fehler.",
      };
}

export async function POST(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const ctx = await requireOrganizationRole(["owner"]);
    assertNotDemoWrite(ctx);

    const { user, activeMembership } = ctx;
    const organization = activeMembership.organizations;

    if (!organization) {
      return NextResponse.json(
        { error: text.activeOrganizationNotFound },
        { status: 400 }
      );
    }

    const body = (await req.json()) as Partial<Payload>;
    const requestedPlanKey = body.requestedPlanKey;
    const message =
      typeof body.message === "string" ? body.message.trim() : null;

    if (!isPlanKey(requestedPlanKey)) {
      return NextResponse.json(
        { error: text.invalidRequestedPlanKey },
        { status: 400 }
      );
    }

    if (isSelfServeBillingPlanKey(requestedPlanKey)) {
      return NextResponse.json(
        { error: text.selfServePlanUsesStripe },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const subscriptionResult = await supabase
      .from("organization_subscriptions")
      .select("plan_key,status")
      .eq("organization_id", organization.id)
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

    const currentPlanKey = subscription.plan_key;

    const existingOpenRequestResult = await supabase
      .from("organization_subscription_change_requests")
      .select("id,requested_plan_key,request_type,status,created_at")
      .eq("organization_id", organization.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOpenRequestResult.error) {
      return NextResponse.json(
        {
          error: text.failedToCheckOpenRequests,
          details: existingOpenRequestResult.error.message,
        },
        { status: 500 }
      );
    }

    if (existingOpenRequestResult.data) {
      return NextResponse.json(
        {
          error: text.existingOpenRequest,
          existingRequest: existingOpenRequestResult.data,
        },
        { status: 409 }
      );
    }

    const requestType = deriveRequestType(currentPlanKey, requestedPlanKey);

    const insertResult = await supabase
      .from("organization_subscription_change_requests")
      .insert({
        organization_id: organization.id,
        requested_by_user_id: user.id,
        current_plan_key: currentPlanKey,
        requested_plan_key: requestedPlanKey,
        status: "open",
        request_type: requestType,
        message: message || null,
      })
      .select(
        "id,organization_id,current_plan_key,requested_plan_key,status,request_type,created_at"
      )
      .single<InsertedChangeRequestRow>();

    if (insertResult.error || !insertResult.data) {
      return NextResponse.json(
        {
          error: text.failedToCreateChangeRequest,
          details: insertResult.error?.message ?? "no row returned",
        },
        { status: 500 }
      );
    }

    try {
      await sendSubscriptionChangeRequestNotificationEmail({
        requestId: insertResult.data.id,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug:
          typeof organization.slug === "string" ? organization.slug : null,
        requestedByUserId: user.id,
        requestedByEmail: user.email ?? null,
        currentPlanKey,
        requestedPlanKey,
        requestType,
        message: message || null,
        createdAt: insertResult.data.created_at,
      });
    } catch (emailError) {
      console.error(
        "[subscription-change-request:notification-email-failed]",
        emailError
      );
    }

    return NextResponse.json(
      {
        ok: true,
        request: insertResult.data,
      },
      { status: 201 }
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