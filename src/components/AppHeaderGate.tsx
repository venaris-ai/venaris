// src/components/AppHeaderGate.tsx #1
"use client";

import { usePathname } from "next/navigation";

type Props = {
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

export default function AppHeaderGate({ children }: Props) {
  const pathname = usePathname();

  if (isPublicPath(pathname)) {
    return null;
  }

  return <>{children}</>;
}