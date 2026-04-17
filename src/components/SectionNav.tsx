// src/components/SectionNav.tsx #5
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  canAccessPath,
  getSectionNavItems,
  isNavItemActive,
  type AppLanguage,
  type AppRole,
  type NavItem,
} from "@/lib/routeAccess";

type Props = {
  role?: AppRole | null;
  email?: string | null;
  isDemo?: boolean;
  language: AppLanguage;
};

function getSectionItems(pathname: string, language: AppLanguage): NavItem[] {
  const sectionItems = getSectionNavItems(language);

  if (pathname.startsWith("/wildlife")) {
    return sectionItems.wildlife;
  }

  if (pathname.startsWith("/cameras")) {
    return sectionItems.cameras;
  }

  if (pathname.startsWith("/orga")) {
    return sectionItems.orga;
  }

  return [];
}

export default function SectionNav({ role, email, isDemo, language }: Props) {
  const pathname = usePathname();

  const items = getSectionItems(pathname, language).filter((item) =>
    canAccessPath({
      pathname: item.href,
      role,
      email,
      isDemo,
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
            className={`rounded-full border px-3 py-1.5 text-xs backdrop-blur-sm ${
              active
                ? "border-amber-300/30 bg-[#c9952e] text-[#102018] shadow-[0_8px_24px_rgba(201,149,46,0.22)]"
                : "border-white/10 bg-white/5 text-white/72 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}