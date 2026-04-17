// src/app/api/demo-login/route.ts #6
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseServer } from "@/lib/supabaseServer";
import { LOCALE_COOKIE, getLanguageFromRequest } from "@/lib/i18n";

export const runtime = "nodejs";

const ACTIVE_ORG_COOKIE = "venaris_active_org";

type OrganizationRow = {
  id: string;
  is_demo: boolean;
};

type MembershipRow = {
  organization_id: string;
  organizations: OrganizationRow | OrganizationRow[] | null;
};

function normalizeOrganization(
  organizations: MembershipRow["organizations"]
): OrganizationRow | null {
  if (!organizations) return null;
  if (Array.isArray(organizations)) return organizations[0] ?? null;
  return organizations;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));
  const locale = getLanguageFromRequest(request);

  const demoEmail =
    locale === "en" ? "demo-en@venaris.io" : "demo@venaris.io";
  const demoPassword =
    locale === "en" ? "venaris-demo-en" : "venaris-demo";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword,
  });

  if (signInError) {
    return NextResponse.redirect(new URL("/login?error=demo_login_failed", request.url));
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL("/login?error=demo_login_failed", request.url));
  }

  const admin = supabaseServer();

  const { data: memberships, error: membershipsError } = await admin
    .from("organization_members")
    .select(
      `
      organization_id,
      organizations (
        id,
        is_demo
      )
    `
    )
    .eq("user_id", user.id)
    .returns<MembershipRow[]>();

  if (membershipsError) {
    return NextResponse.redirect(new URL("/login?error=demo_login_failed", request.url));
  }

  const normalizedMemberships = (memberships ?? []).map((membership) => ({
    ...membership,
    organizations: normalizeOrganization(membership.organizations),
  }));

  const demoMembership =
    normalizedMemberships.find((membership) => membership.organizations?.is_demo) ??
    normalizedMemberships[0];

  if (demoMembership?.organization_id) {
    response.cookies.set(ACTIVE_ORG_COOKIE, demoMembership.organization_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  response.cookies.set(LOCALE_COOKIE, locale, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    domain: ".venaris.io",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}