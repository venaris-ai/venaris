// src/components/ClientRevierScopeField.tsx
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
    <div className="flex items-center gap-1 text-xs text-gray-600">
      <span className="rounded-md border bg-white px-2.5 py-1">
        <span className="text-gray-500">Revier:</span>{" "}
        <span className="inline-block align-middle">
          <RevierScopeSelect reviers={reviers} value={currentRevierValue} />
        </span>
      </span>
    </div>
  );
}