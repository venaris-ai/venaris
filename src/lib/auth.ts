import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAuthServer } from "@/lib/supabaseAuthServer";

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

type MembershipRow = {
  organization_id: string;
  role: OrganizationRole;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
  }> | null;
};

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

export async function requireActiveOrganization() {
  const user = await requireUser();
  const memberships = await getMembershipsForUser(user.id);

  if (memberships.length === 0) {
    throw new Error("User has no organization membership");
  }

  const activeMembership = memberships[0];
  const activeOrganization = activeMembership.organizations?.[0] ?? null;

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  return {
    user,
    memberships,
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