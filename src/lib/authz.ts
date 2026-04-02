// src/lib/authz.ts #6
import { redirect } from "next/navigation";
import {
  getOptionalActiveOrganization,
  requireActiveOrganization,
  requireUser,
} from "@/lib/auth";
import {
  MAIN_NAV_ITEMS,
  ROUTE_ACCESS_RULES,
  SECTION_NAV_ITEMS,
  canAccessPath,
  filterNavItemsByAccess,
  getRouteAccessRule,
  isNavItemActive,
  isPublicPathname,
  pathMatches,
  type AppRole,
  type NavItem,
  type RouteAccessRule,
} from "@/lib/routeAccess";

export type { AppRole, NavItem, RouteAccessRule };

export {
  MAIN_NAV_ITEMS,
  ROUTE_ACCESS_RULES,
  SECTION_NAV_ITEMS,
  canAccessPath,
  filterNavItemsByAccess,
  getRouteAccessRule,
  isNavItemActive,
  isPublicPathname,
  pathMatches,
};

export async function getOptionalAccessContext() {
  const ctx = await getOptionalActiveOrganization();

  if (!ctx) {
    return {
      role: null,
      email: null,
      isDemo: false,
    };
  }

  return {
    role: ctx.activeMembership.role as AppRole,
    email: ctx.user.email ?? null,
    isDemo: ctx.isDemo,
  };
}

export async function requirePathAccess(pathname: string) {
  const rule = getRouteAccessRule(pathname);

  if (!rule) {
    redirect("/access-denied");
  }

  if (rule.public) {
    return { user: null, activeMembership: null, activeOrganization: null, isDemo: false };
  }

  if (rule.allowedEmails?.length) {
    const user = await requireUser();
    const email = (user.email ?? "").toLowerCase().trim();

    if (!rule.allowedEmails.includes(email)) {
      redirect("/access-denied");
    }

    return { user, activeMembership: null, activeOrganization: null, isDemo: false };
  }

  const ctx = await requireActiveOrganization();

  if (
    !canAccessPath({
      pathname,
      role: ctx.activeMembership.role as AppRole,
      email: ctx.user.email ?? null,
      isDemo: ctx.isDemo,
    })
  ) {
    redirect("/access-denied");
  }

  return ctx;
}