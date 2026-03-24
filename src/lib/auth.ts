// src/lib/auth.ts
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAuthServer } from "@/lib/supabaseAuthServer";
import { cookies } from "next/headers";

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
};

type MembershipRow = {
  organization_id: string;
  role: OrganizationRole;
  organizations: OrganizationRow | OrganizationRow[] | null;
};

const ACTIVE_ORG_COOKIE = "venaris_active_org";

export async function requireUser() {
  const supabase = await supabaseAuthServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return user;
}

export async function getOptionalUser() {
  const supabase = await supabaseAuthServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getMembershipsForUser(userId: string) {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("organization_members")
    .select(
      `
      organization_id,
      role,
      organizations (
        id,
        name,
        slug
      )
    `
    )
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to load memberships: ${error.message}`);
  }

  return (data ?? []) as unknown as MembershipRow[];
}

function normalizeOrganization(
  organizations: MembershipRow["organizations"]
): OrganizationRow | null {
  if (!organizations) return null;
  if (Array.isArray(organizations)) return organizations[0] ?? null;
  return organizations;
}

export async function requireActiveOrganization() {
  const user = await requireUser();
  const memberships = await getMembershipsForUser(user.id);

  if (memberships.length === 0) {
    throw new Error("User has no organization membership");
  }

  const cookieStore = await cookies();
  const requestedOrganizationId =
    cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;

  const activeMembership =
    memberships.find((m) => m.organization_id === requestedOrganizationId) ??
    memberships[0];

  const activeOrganization = normalizeOrganization(activeMembership.organizations);

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  return {
    user,
    memberships: memberships.map((membership) => ({
      ...membership,
      organizations: normalizeOrganization(membership.organizations),
    })),
    activeMembership: {
      ...activeMembership,
      organizations: activeOrganization,
    },
  };
}

export async function getOptionalActiveOrganization() {
  const user = await getOptionalUser();

  if (!user) {
    return null;
  }

  const memberships = await getMembershipsForUser(user.id);

  if (memberships.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const requestedOrganizationId =
    cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;

  const activeMembership =
    memberships.find((m) => m.organization_id === requestedOrganizationId) ??
    memberships[0];

  const activeOrganization = normalizeOrganization(activeMembership.organizations);

  if (!activeOrganization) {
    return null;
  }

  return {
    user,
    memberships: memberships.map((membership) => ({
      ...membership,
      organizations: normalizeOrganization(membership.organizations),
    })),
    activeMembership: {
      ...activeMembership,
      organizations: activeOrganization,
    },
  };
}

export async function requireOrganizationRole(
  allowedRoles: OrganizationRole[]
) {
  const ctx = await requireActiveOrganization();
  const role = ctx.activeMembership.role;

  if (!allowedRoles.includes(role)) {
    redirect("/");
  }

  return {
    ...ctx,
    role,
  };
}