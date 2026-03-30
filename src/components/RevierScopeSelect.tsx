// src/components/RevierScopeSelect.tsx #2
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type RevierOption = {
  id: string;
  name: string;
};

type Props = {
  reviers: RevierOption[];
  value: string;
};

export default function RevierScopeSelect({ reviers, value }: Props) {
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
        All Reviers
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