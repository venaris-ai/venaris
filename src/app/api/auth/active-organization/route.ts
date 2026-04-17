// src/app/api/auth/active-organization/route.ts #2
import { NextRequest, NextResponse } from "next/server";
import { requireUser, getMembershipsForUser } from "@/lib/auth";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

const ACTIVE_ORG_COOKIE = "venaris_active_org";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        organizationIdRequired: "organizationId required",
        organizationNotAllowed: "organization not allowed",
        unexpectedError: "unexpected error",
      }
    : {
        organizationIdRequired: "organizationId erforderlich",
        organizationNotAllowed: "Organisation nicht erlaubt",
        unexpectedError: "unerwarteter Fehler",
      };
}

export async function POST(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const user = await requireUser();
    const body = (await req.json()) as { organizationId?: string };

    if (!body.organizationId) {
      return NextResponse.json(
        { error: text.organizationIdRequired },
        { status: 400 }
      );
    }

    const memberships = await getMembershipsForUser(user.id);
    const isMember = memberships.some(
      (membership) => membership.organization_id === body.organizationId
    );

    if (!isMember) {
      return NextResponse.json(
        { error: text.organizationNotAllowed },
        { status: 403 }
      );
    }

    const res = NextResponse.json({ ok: true });

    res.cookies.set(ACTIVE_ORG_COOKIE, body.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
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