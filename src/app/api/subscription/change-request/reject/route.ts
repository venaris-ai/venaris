// src/app/api/subscription/change-request/reject/route.ts #3
import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthServer } from "@/lib/supabaseAuthServer";
import { supabaseServer } from "@/lib/supabaseServer";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

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

function t(language: AppLanguage) {
  return language === "en"
    ? {
        notAuthenticated: "Not authenticated.",
        forbidden: "Forbidden: Venaris admin only.",
        requestIdRequired: "requestId required.",
        rejectedManually: "Rejected manually by Venaris admin",
        failedToLoadChangeRequest: "Failed to load change request.",
        changeRequestNotFound: "Change request not found.",
        onlyOpenCanBeRejected:
          "Only open change requests can be rejected.",
        failedToRejectChangeRequest: "Failed to reject change request.",
        unexpectedError: "Unexpected error.",
      }
    : {
        notAuthenticated: "Nicht authentifiziert.",
        forbidden: "Verboten: nur Venaris-Admin.",
        requestIdRequired: "requestId erforderlich.",
        rejectedManually: "Manuell durch Venaris-Admin abgelehnt",
        failedToLoadChangeRequest:
          "Plananfrage konnte nicht geladen werden.",
        changeRequestNotFound: "Plananfrage nicht gefunden.",
        onlyOpenCanBeRejected:
          "Nur offene Plananfragen können abgelehnt werden.",
        failedToRejectChangeRequest:
          "Plananfrage konnte nicht abgelehnt werden.",
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
        : text.rejectedManually;

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
        { error: text.onlyOpenCanBeRejected },
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
          error: text.failedToRejectChangeRequest,
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
        error: text.unexpectedError,
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}