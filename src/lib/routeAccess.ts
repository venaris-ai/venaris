// src/lib/routeAccess.ts #1
export type AppRole = "owner" | "admin" | "member" | "viewer";
export type RouteMatch = "exact" | "startsWith";

export type RouteAccessRule = {
  path: string;
  match?: RouteMatch;
  allowedRoles?: AppRole[];
  allowedEmails?: string[];
  public?: boolean;
};

export type NavItem = {
  href: string;
  label: string;
  match?: RouteMatch;
};

export const ROUTE_ACCESS_RULES: RouteAccessRule[] = [
  { path: "/login", public: true },
  { path: "/register", public: true },
  { path: "/reset-password", public: true },
  { path: "/invite/accept", match: "startsWith", public: true },

  { path: "/", allowedRoles: ["owner", "admin", "member", "viewer"] },

  { path: "/wildlife", allowedRoles: ["owner", "admin", "member", "viewer"] },
  { path: "/wildlife/species", allowedRoles: ["owner", "admin", "member", "viewer"] },
  { path: "/wildlife/wherewhen", allowedRoles: ["owner", "admin", "member", "viewer"] },
  { path: "/wildlife/activity", allowedRoles: ["owner", "admin", "member", "viewer"] },
  { path: "/wildlife/popsim", allowedRoles: ["owner", "admin", "member", "viewer"] },

  { path: "/cameras", allowedRoles: ["owner", "admin", "member"] },
  { path: "/cameras/new", allowedRoles: ["owner", "admin"] },
  { path: "/cameras/health", allowedRoles: ["owner", "admin", "member"] },
  { path: "/cameras/events", match: "startsWith", allowedRoles: ["owner", "admin", "member"] },
  { path: "/cameras/import", allowedRoles: ["owner", "admin", "member"] },
  { path: "/cameras/ingest", allowedRoles: ["owner", "admin", "member"] },

  { path: "/orga", allowedRoles: ["owner", "admin"] },
  { path: "/orga/account", allowedRoles: ["owner", "admin"] },
  { path: "/orga/reviere", allowedRoles: ["owner", "admin"] },
  { path: "/orga/reviere/new", allowedRoles: ["owner", "admin"] },
  { path: "/orga/reviere/", match: "startsWith", allowedRoles: ["owner", "admin"] },
  { path: "/orga/members", allowedRoles: ["owner", "admin"] },
  { path: "/orga/members/invite", allowedRoles: ["owner", "admin"] },
  { path: "/orga/subscription", allowedRoles: ["owner"] },

  { path: "/admin/subscriptions", allowedEmails: ["dev@venaris.io"] },
];

export const MAIN_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", match: "exact" },
  { href: "/wildlife", label: "Wildlife", match: "startsWith" },
  { href: "/cameras", label: "Cameras", match: "startsWith" },
  { href: "/orga", label: "Orga", match: "startsWith" },
];

export const SECTION_NAV_ITEMS = {
  wildlife: [
    { href: "/wildlife", label: "Overview", match: "exact" },
    { href: "/wildlife/species", label: "Species", match: "exact" },
    { href: "/wildlife/wherewhen", label: "Where & When", match: "exact" },
    { href: "/wildlife/activity", label: "Activity", match: "exact" },
    { href: "/wildlife/popsim", label: "PopSim", match: "exact" },
  ] satisfies NavItem[],

  cameras: [
    { href: "/cameras", label: "Overview", match: "exact" },
    { href: "/cameras/new", label: "New", match: "exact" },
    { href: "/cameras/health", label: "Health", match: "exact" },
    { href: "/cameras/events", label: "Events", match: "startsWith" },
    { href: "/cameras/import", label: "Import", match: "exact" },
    { href: "/cameras/ingest", label: "Ingest", match: "exact" },
  ] satisfies NavItem[],

  orga: [
    { href: "/orga", label: "Overview", match: "exact" },
    { href: "/orga/account", label: "Mein Konto", match: "exact" },
    { href: "/orga/reviere", label: "Reviere", match: "exact" },
    { href: "/orga/members", label: "Members", match: "exact" },
    { href: "/orga/subscription", label: "Subscription", match: "exact" },
  ] satisfies NavItem[],
} as const;

function getItemPath(item: RouteAccessRule | NavItem) {
  return "path" in item ? item.path : item.href;
}

export function pathMatches(pathname: string, rule: RouteAccessRule | NavItem) {
  const target = getItemPath(rule);

  if (rule.match === "startsWith") {
    return pathname.startsWith(target);
  }

  return pathname === target;
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.match === "startsWith") {
    return pathname.startsWith(item.href);
  }

  return pathname === item.href;
}

export function getRouteAccessRule(pathname: string) {
  return ROUTE_ACCESS_RULES.find((rule) => pathMatches(pathname, rule)) ?? null;
}

export function isPublicPathname(pathname: string) {
  const rule = getRouteAccessRule(pathname);
  return rule?.public === true;
}

export function canAccessPath(args: {
  pathname: string;
  role?: AppRole | null;
  email?: string | null;
}) {
  const rule = getRouteAccessRule(args.pathname);

  if (!rule) {
    return false;
  }

  if (rule.public) {
    return true;
  }

  const email = (args.email ?? "").toLowerCase().trim();

  if (rule.allowedEmails?.length) {
    return rule.allowedEmails.includes(email);
  }

  if (!args.role || !rule.allowedRoles?.length) {
    return false;
  }

  return rule.allowedRoles.includes(args.role);
}

export function filterNavItemsByAccess(args: {
  items: NavItem[];
  role?: AppRole | null;
  email?: string | null;
}) {
  return args.items.filter((item) =>
    canAccessPath({
      pathname: item.href,
      role: args.role,
      email: args.email,
    })
  );
}