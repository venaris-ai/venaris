// src/app/api/subscription/change-request/route.ts #1
import { NextRequest, NextResponse } from "next/server";
import { requireActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";

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

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireActiveOrganization();
    const { user, activeMembership } = ctx;

    if (!["owner", "admin"].includes(activeMembership.role)) {
      return NextResponse.json(
        { error: "insufficient permissions" },
        { status: 403 }
      );
    }

    const organization = activeMembership.organizations;

    if (!organization) {
      return NextResponse.json(
        { error: "active organization not found" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as Partial<Payload>;
    const requestedPlanKey = body.requestedPlanKey;
    const message =
      typeof body.message === "string" ? body.message.trim() : null;

    if (!isPlanKey(requestedPlanKey)) {
      return NextResponse.json(
        { error: "invalid requestedPlanKey" },
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
          error: "failed to load subscription",
          details: subscriptionResult.error.message,
        },
        { status: 500 }
      );
    }

    const subscription = subscriptionResult.data;

    if (!subscription) {
      return NextResponse.json(
        { error: "subscription not found" },
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
          error: "failed to check open requests",
          details: existingOpenRequestResult.error.message,
        },
        { status: 500 }
      );
    }

    if (existingOpenRequestResult.data) {
      return NextResponse.json(
        {
          error: "Es gibt bereits eine offene Plananfrage für diese Organization.",
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
      .single();

    if (insertResult.error || !insertResult.data) {
      return NextResponse.json(
        {
          error: "failed to create change request",
          details: insertResult.error?.message ?? "no row returned",
        },
        { status: 500 }
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
        error: "unexpected error",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}