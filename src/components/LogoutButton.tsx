// src/components/LogoutButton.tsx #5
"use client";

import type { AppLanguage } from "@/lib/i18n";

type Props = {
  className?: string;
  label?: string;
  language?: AppLanguage;
};

export default function LogoutButton({
  className = "rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-white/78 backdrop-blur-sm hover:border-amber-300/20 hover:bg-white/8 hover:text-white",
  label,
  language = "de",
}: Props) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const effectiveLabel = label ?? (language === "en" ? "Logout" : "Abmelden");

  return (
    <button onClick={logout} className={className}>
      {effectiveLabel}
    </button>
  );
}