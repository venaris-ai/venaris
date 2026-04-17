// src/app/api/register/route.ts #2
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAuthServer } from "@/lib/supabaseAuthServer";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

type Payload = {
  organizationName: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        notAuthenticated: "not authenticated",
        organizationNameRequired: "organizationName required",
        organizationNameTooShort: "organizationName too short",
        membershipCheckFailed: "membership check failed",
        userAlreadyBelongsToOrganization: "user already belongs to an organization",
        organizationOwnershipCheckFailed: "organization ownership check failed",
        userAlreadyOwnsOrganization: "user already owns an organization",
        organizationCreationFailed: "organization creation failed",
        noOrganizationReturned: "no organization returned",
        ownerMembershipCreationFailed: "owner membership creation failed",
        unexpectedError: "unexpected error",
      }
    : {
        notAuthenticated: "nicht authentifiziert",
        organizationNameRequired: "organizationName erforderlich",
        organizationNameTooShort: "organizationName zu kurz",
        membershipCheckFailed: "Prüfung der Mitgliedschaft fehlgeschlagen",
        userAlreadyBelongsToOrganization: "Benutzer gehört bereits zu einer Organisation",
        organizationOwnershipCheckFailed: "Prüfung der Organisationsinhaberschaft fehlgeschlagen",
        userAlreadyOwnsOrganization: "Benutzer besitzt bereits eine Organisation",
        organizationCreationFailed: "Anlage der Organisation fehlgeschlagen",
        noOrganizationReturned: "keine Organisation zurückgegeben",
        ownerMembershipCreationFailed: "Anlage der Owner-Mitgliedschaft fehlgeschlagen",
        unexpectedError: "unerwarteter Fehler",
      };
}

function slugifyOrganizationName(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return base || "org";
}

async function findAvailableOrganizationSlug(
  supabase: ReturnType<typeof supabaseServer>,
  desiredBase: string
): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? desiredBase : `${desiredBase}-${i + 1}`;

    const { data, error } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      throw new Error(`slug check failed: ${error.message}`);
    }

    if (!data) {
      return candidate;
    }
  }

  throw new Error("could not find available organization slug");
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
      return NextResponse.json({ error: text.notAuthenticated }, { status: 401 });
    }

    const body = (await req.json()) as Partial<Payload>;

    if (!body.organizationName || !body.organizationName.trim()) {
      return NextResponse.json(
        { error: text.organizationNameRequired },
        { status: 400 }
      );
    }

    const organizationName = body.organizationName.trim();

    if (organizationName.length < 2) {
      return NextResponse.json(
        { error: text.organizationNameTooShort },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const membershipCheck = await supabase
      .from("organization_members")
      .select("organization_id", { head: true, count: "exact" })
      .eq("user_id", user.id);

    if (membershipCheck.error) {
      return NextResponse.json(
        {
          error: text.membershipCheckFailed,
          details: membershipCheck.error.message,
        },
        { status: 500 }
      );
    }

    if ((membershipCheck.count ?? 0) > 0) {
      return NextResponse.json(
        { error: text.userAlreadyBelongsToOrganization },
        { status: 409 }
      );
    }

    const ownedOrgCheck = await supabase
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .eq("owner_user_id", user.id);

    if (ownedOrgCheck.error) {
      return NextResponse.json(
        {
          error: text.organizationOwnershipCheckFailed,
          details: ownedOrgCheck.error.message,
        },
        { status: 500 }
      );
    }

    if ((ownedOrgCheck.count ?? 0) > 0) {
      return NextResponse.json(
        { error: text.userAlreadyOwnsOrganization },
        { status: 409 }
      );
    }

    const slugBase = slugifyOrganizationName(organizationName);
    const organizationSlug = await findAvailableOrganizationSlug(
      supabase,
      slugBase
    );

    const insertOrganization = await supabase
      .from("organizations")
      .insert({
        name: organizationName,
        slug: organizationSlug,
        kind: "customer",
        status: "active",
        owner_user_id: user.id,
      })
      .select("id,name,slug")
      .single<OrganizationRow>();

    if (insertOrganization.error || !insertOrganization.data) {
      return NextResponse.json(
        {
          error: text.organizationCreationFailed,
          details: insertOrganization.error?.message ?? text.noOrganizationReturned,
        },
        { status: 500 }
      );
    }

    const organization = insertOrganization.data;

    const insertMembership = await supabase.from("organization_members").insert({
      organization_id: organization.id,
      user_id: user.id,
      role: "owner",
      status: "active",
      accepted_at: new Date().toISOString(),
    });

    if (insertMembership.error) {
      await supabase.from("organizations").delete().eq("id", organization.id);

      return NextResponse.json(
        {
          error: text.ownerMembershipCreationFailed,
          details: insertMembership.error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
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