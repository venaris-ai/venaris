// src/components/ClientRevierScopeField.tsx #3
"use client";

import { useSearchParams } from "next/navigation";
import RevierScopeSelect from "@/components/RevierScopeSelect";

type RevierOption = {
  id: string;
  name: string;
};

type Props = {
  reviers: RevierOption[];
};

export default function ClientRevierScopeField({ reviers }: Props) {
  const searchParams = useSearchParams();
  const currentRevierValue = searchParams.get("revier") ?? "all";

  return (
    <div className="flex items-center gap-1 text-xs text-white/68">
      <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 backdrop-blur-sm">
        <span className="text-white/45">Revier:</span>{" "}
        <span className="inline-block align-middle">
          <RevierScopeSelect reviers={reviers} value={currentRevierValue} />
        </span>
      </span>
    </div>
  );
}