// src/components/AppShellGate.tsx #1
"use client";

import { usePathname } from "next/navigation";

type Props = {
  blocked: boolean;
  blockedPage: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
};

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/reset-password" ||
    pathname === "/invite/accept" ||
    pathname.startsWith("/invite/accept/")
  );
}

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

  if (isPublicPath(pathname)) {
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