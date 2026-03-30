// src/components/SubmitButton.tsx #2
"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

export default function SubmitButton({
  idleLabel,
  pendingLabel,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-[10px] px-4 py-2 text-sm transition ${
        pending
          ? "cursor-not-allowed border border-white/10 bg-white/10 text-white/40"
          : "bg-[#c9952e] text-[#102018] hover:bg-[#ddb055]"
      }`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}