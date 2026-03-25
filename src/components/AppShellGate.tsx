// src/components/AppShellGate.tsx #3
"use client";

import { usePathname } from "next/navigation";
import { isPublicPathname } from "@/lib/routeAccess";

type Props = {
  blocked: boolean;
  blockedPage: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
};

function isAllowedWhenBlocked(pathname: string) {
  return pathname === "/orga/subscription";
}

export default function AppShellGate({
  blocked,
  blockedPage,
  header,
  children,
}: Props) {
  const pathname = usePathname();

  if (isPublicPathname(pathname)) {
    return <>{children}</>;
  }

  if (blocked && !isAllowedWhenBlocked(pathname)) {
    return <>{blockedPage}</>;
  }

  return (
    <>
      {header}
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </>
  );
}