// src/components/SectionNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "startsWith";
};

const wildlifeItems: NavItem[] = [
  { href: "/wildlife", label: "Overview", match: "exact" },
  { href: "/wildlife/species", label: "Species", match: "exact" },
  { href: "/wildlife/wherewhen", label: "Where & When", match: "exact" },
  { href: "/wildlife/activity", label: "Activity", match: "exact" },
  { href: "/wildlife/popsim", label: "PopSim", match: "exact" },
];

const cameraItems: NavItem[] = [
  { href: "/cameras", label: "Overview", match: "exact" },
  { href: "/cameras/new", label: "New", match: "exact" },
  { href: "/cameras/health", label: "Health", match: "exact" },
  { href: "/cameras/events", label: "Events", match: "startsWith" },
  { href: "/cameras/import", label: "Import", match: "exact" },
  { href: "/cameras/ingest", label: "Ingest", match: "exact" },
];

const orgaItems: NavItem[] = [
  { href: "/orga", label: "Overview", match: "exact" },
  { href: "/orga/account", label: "Mein Konto", match: "exact" },
  { href: "/orga/reviere", label: "Reviere", match: "exact" },
  { href: "/orga/members", label: "Members", match: "exact" },
  { href: "/orga/subscription", label: "Subscription", match: "exact" },
];

function isActive(pathname: string, item: NavItem) {
  if (item.match === "startsWith") {
    return pathname.startsWith(item.href);
  }
  return pathname === item.href;
}

export default function SectionNav() {
  const pathname = usePathname();

  let items: NavItem[] = [];

  if (pathname.startsWith("/wildlife")) {
    items = wildlifeItems;
  } else if (pathname.startsWith("/cameras")) {
    items = cameraItems;
  } else if (pathname.startsWith("/orga")) {
    items = orgaItems;
  }

  if (items.length === 0) {
    return <div className="h-[28px]" />;
  }

  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item) => {
        const active = isActive(pathname, item);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              active
                ? "border-black bg-black text-white"
                : "bg-white text-black hover:bg-gray-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}