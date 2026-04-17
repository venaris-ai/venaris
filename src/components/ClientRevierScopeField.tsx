// src/components/ClientRevierScopeField.tsx #5
"use client";

import { useSearchParams } from "next/navigation";
import RevierScopeSelect from "@/components/RevierScopeSelect";
import type { AppLanguage } from "@/lib/i18n";

type RevierOption = {
  id: string;
  name: string;
};

type Props = {
  reviers: RevierOption[];
  language: AppLanguage;
};

export default function ClientRevierScopeField({ reviers, language }: Props) {
  const searchParams = useSearchParams();
  const currentRevierValue = searchParams.get("revier") ?? "all";

  return (
    <div className="flex items-center gap-1 text-xs text-white/68">
      <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 backdrop-blur-sm">
        <span className="text-white/45">
          {language === "en" ? "Ground:" : "Revier:"}
        </span>{" "}
        <span className="inline-block align-middle">
          <RevierScopeSelect
            reviers={reviers}
            value={currentRevierValue}
            language={language}
          />
        </span>
      </span>
    </div>
  );
}