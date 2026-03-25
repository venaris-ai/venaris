// src/components/SectionNav.tsx #3
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SECTION_NAV_ITEMS,
  canAccessPath,
  isNavItemActive,
  type AppRole,
  type NavItem,
} from "@/lib/routeAccess";

type Props = {
  role?: AppRole | null;
  email?: string | null;
};

function getSectionItems(pathname: string): NavItem[] {
  if (pathname.startsWith("/wildlife")) {
    return SECTION_NAV_ITEMS.wildlife;
  }

  if (pathname.startsWith("/cameras")) {
    return SECTION_NAV_ITEMS.cameras;
  }

  if (pathname.startsWith("/orga")) {
    return SECTION_NAV_ITEMS.orga;
  }

  return [];
}

export default function SectionNav({ role, email }: Props) {
  const pathname = usePathname();

  const items = getSectionItems(pathname).filter((item) =>
    canAccessPath({
      pathname: item.href,
      role,
      email,
    })
  );

  if (items.length === 0) {
    return <div className="h-[28px]" />;
  }

  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item) => {
        const active = isNavItemActive(pathname, item);

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