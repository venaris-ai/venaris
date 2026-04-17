// src/components/RevierScopeSelect.tsx #4
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AppLanguage } from "@/lib/i18n";

type RevierOption = {
  id: string;
  name: string;
};

type Props = {
  reviers: RevierOption[];
  value: string;
  language: AppLanguage;
};

export default function RevierScopeSelect({ reviers, value, language }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("revier", nextValue);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="bg-transparent px-0 py-0 text-xs text-white outline-none"
    >
      <option value="all" className="bg-[#102018] text-white">
        {language === "en" ? "All grounds" : "Alle Reviere"}
      </option>
      {reviers.map((revier) => (
        <option
          key={revier.id}
          value={revier.id}
          className="bg-[#102018] text-white"
        >
          {revier.name}
        </option>
      ))}
    </select>
  );
}