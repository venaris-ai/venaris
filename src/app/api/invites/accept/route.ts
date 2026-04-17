// src/app/api/invites/accept/route.ts #5
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAuthServer } from "@/lib/supabaseAuthServer";
import {
  LOCALE_COOKIE,
  normalizeLanguage,
  type AppLanguage,
} from "@/lib/i18n";

type InviteRow = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string;
  expires_at: string | null;
  accepted_at: string | null;
  organization_id: string;
  language: AppLanguage;
};

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let token = "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      token = String(body?.token ?? "").trim();
    } else {
      const formData = await request.formData();
      token = String(formData.get("token") ?? "").trim();
    }

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing invite token." },
        { status: 400 }
      );
    }

    const authClient = await supabaseAuthServer();
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "No authenticated user found." },
        { status: 401 }
      );
    }

    const supabase = supabaseServer();

    const inviteResult = await supabase
      .from("organization_invites")
      .select(
        "id,email,role,status,token,expires_at,accepted_at,organization_id,language"
      )
      .eq("token", token)
      .maybeSingle();

    if (inviteResult.error) {
      return NextResponse.json(
        { ok: false, error: `Failed to load invite: ${inviteResult.error.message}` },
        { status: 500 }
      );
    }

    const invite = (inviteResult.data ?? null) as InviteRow | null;

    if (!invite) {
      return NextResponse.json(
        { ok: false, error: "Invite not found." },
        { status: 404 }
      );
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: `Invite is not pending. Current status: ${invite.status}` },
        { status: 400 }
      );
    }

    if (isExpired(invite.expires_at)) {
      await supabase
        .from("organization_invites")
        .update({ status: "expired" })
        .eq("id", invite.id)
        .eq("status", "pending");

      return NextResponse.json(
        { ok: false, error: "Invite has expired." },
        { status: 400 }
      );
    }

    const authResult = await supabase.auth.admin.getUserById(user.id);

    if (authResult.error || !authResult.data.user) {
      return NextResponse.json(
        { ok: false, error: "Failed to load current auth user." },
        { status: 500 }
      );
    }

    const currentEmail = (authResult.data.user.email ?? "").trim().toLowerCase();
    const invitedEmail = invite.email.trim().toLowerCase();

    if (!currentEmail || currentEmail !== invitedEmail) {
      return NextResponse.json(
        {
          ok: false,
          error: `Diese Einladung ist für ${invitedEmail}, aber aktuell bist Du als ${currentEmail || "unbekannt"} eingeloggt.`,
        },
        { status: 403 }
      );
    }

    const existingMembershipResult = await supabase
      .from("organization_members")
      .select("organization_id,user_id")
      .eq("organization_id", invite.organization_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingMembershipResult.error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to check existing membership: ${existingMembershipResult.error.message}`,
        },
        { status: 500 }
      );
    }

    if (!existingMembershipResult.data) {
      const insertMembershipResult = await supabase
        .from("organization_members")
        .insert({
          organization_id: invite.organization_id,
          user_id: user.id,
          role: invite.role,
          status: "active",
          accepted_at: new Date().toISOString(),
        });

      if (insertMembershipResult.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `Failed to create membership: ${insertMembershipResult.error.message}`,
          },
          { status: 500 }
        );
      }
    }

    const upsertProfileResult = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          preferred_language: normalizeLanguage(invite.language),
        },
        { onConflict: "id" }
      );

    if (upsertProfileResult.error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to update profile language: ${upsertProfileResult.error.message}`,
        },
        { status: 500 }
      );
    }

    const updateInviteResult = await supabase
      .from("organization_invites")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id)
      .eq("status", "pending");

    if (updateInviteResult.error) {
      return NextResponse.json(
        { ok: false, error: `Failed to update invite: ${updateInviteResult.error.message}` },
        { status: 500 }
      );
    }

    revalidatePath("/orga/members");
    revalidatePath("/", "layout");

    const response = NextResponse.json({ ok: true });

    response.cookies.set(LOCALE_COOKIE, normalizeLanguage(invite.language), {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      domain: ".venaris.io",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown invite accept error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}