// src/components/HeaderMenu.tsx #3
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
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

type MenuGroup = {
  key: "wildlife" | "cameras" | "orga";
  label: string;
  items: NavItem[];
};

function groupLabel(key: MenuGroup["key"], language: AppLanguage) {
  if (key === "wildlife") return "Wildlife";
  if (key === "cameras") return language === "en" ? "Cameras" : "Kameras";
  return language === "en" ? "Organization" : "Organisation";
}

export default function HeaderMenu({ role, email, isDemo, language }: Props) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const sectionItems = getSectionNavItems(language);

  useEffect(() => {
    function handleOutsideInteraction(event: MouseEvent | TouchEvent) {
      if (!menuRef.current) return;

      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideInteraction);
    document.addEventListener("touchstart", handleOutsideInteraction);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideInteraction);
      document.removeEventListener("touchstart", handleOutsideInteraction);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const groups: MenuGroup[] = [
    {
      key: "wildlife",
      label: groupLabel("wildlife", language),
      items: sectionItems.wildlife,
    },
    {
      key: "cameras",
      label: groupLabel("cameras", language),
      items: sectionItems.cameras,
    },
    {
      key: "orga",
      label: groupLabel("orga", language),
      items: sectionItems.orga,
    },
  ];

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canAccessPath({
          pathname: item.href,
          role,
          email,
          isDemo,
        })
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div ref={menuRef} className="relative z-[120]">
      <button
        type="button"
        aria-label={language === "en" ? "Open navigation" : "Navigation öffnen"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/82 backdrop-blur-sm hover:border-amber-300/25 hover:bg-white/8 hover:text-white"
      >
        <span className="flex flex-col gap-1">
          <span className="block h-0.5 w-4 rounded-full bg-current" />
          <span className="block h-0.5 w-4 rounded-full bg-current" />
          <span className="block h-0.5 w-4 rounded-full bg-current" />
        </span>
      </button>

      {open ? (
        <div className="fixed left-3 right-3 top-[9.5rem] z-[9999] max-h-[calc(100dvh-10.5rem)] overflow-y-auto rounded-[24px] border border-white/10 bg-[#102018] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-72 sm:max-h-[calc(100vh-6rem)]">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className={`block rounded-2xl px-3 py-2 text-sm ${
              pathname === "/"
                ? "bg-[#c9952e] text-[#102018]"
                : "text-white/78 hover:bg-white/8 hover:text-white"
            }`}
          >
            Home
          </Link>

          <div className="my-2 border-t border-white/8" />

          <div className="space-y-3">
            {visibleGroups.map((group) => (
              <div key={group.key}>
                <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">
                  {group.label}
                </div>

                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isNavItemActive(pathname, item);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`block rounded-2xl px-3 py-2 text-sm ${
                          active
                            ? "bg-[#c9952e] text-[#102018]"
                            : "text-white/74 hover:bg-white/8 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="my-2 border-t border-white/8" />

          <LogoutButton
            language={language}
            className="block w-full rounded-2xl px-3 py-2 text-left text-sm text-white/74 hover:bg-white/8 hover:text-white"
          />
        </div>
      ) : null}
    </div>
  );
}