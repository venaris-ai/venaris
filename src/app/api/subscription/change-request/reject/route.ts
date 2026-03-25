// src/app/api/subscription/change-request/reject/route.ts #1
import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthServer } from "@/lib/supabaseAuthServer";
import { supabaseServer } from "@/lib/supabaseServer";

type RequestStatus = "open" | "approved" | "rejected" | "canceled";

type Payload = {
  requestId: string;
  resolutionNote?: string;
};

type ChangeRequestRow = {
  id: string;
  organization_id: string;
  current_plan_key: "starter" | "pro" | "enterprise";
  requested_plan_key: "starter" | "pro" | "enterprise";
  status: RequestStatus;
  request_type: "upgrade" | "downgrade" | "change";
};

const VENARIS_ADMIN_EMAIL = "dev@venaris.io";

export async function POST(req: NextRequest) {
  try {
    const auth = await supabaseAuthServer();
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "not authenticated" }, { status: 401 });
    }

    const userEmail = (user.email ?? "").toLowerCase().trim();

    if (userEmail !== VENARIS_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "forbidden: venaris admin only" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Partial<Payload>;
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const resolutionNote =
      typeof body.resolutionNote === "string" && body.resolutionNote.trim()
        ? body.resolutionNote.trim()
        : "Rejected manually by Venaris admin";

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId required" },
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
          error: "failed to load change request",
          details: requestResult.error.message,
        },
        { status: 500 }
      );
    }

    const changeRequest = requestResult.data;

    if (!changeRequest) {
      return NextResponse.json(
        { error: "change request not found" },
        { status: 404 }
      );
    }

    if (changeRequest.status !== "open") {
      return NextResponse.json(
        { error: "only open change requests can be rejected" },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();

    const rejectRequestResult = await supabase
      .from("organization_subscription_change_requests")
      .update({
        status: "rejected",
        processed_at: nowIso,
        processed_by_user_id: user.id,
        resolution_note: resolutionNote,
      })
      .eq("id", changeRequest.id)
      .select(
        "id,organization_id,current_plan_key,requested_plan_key,status,request_type,processed_at,processed_by_user_id,resolution_note"
      )
      .single();

    if (rejectRequestResult.error || !rejectRequestResult.data) {
      return NextResponse.json(
        {
          error: "failed to reject change request",
          details:
            rejectRequestResult.error?.message ?? "no rejected request returned",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        request: rejectRequestResult.data,
      },
      { status: 200 }
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