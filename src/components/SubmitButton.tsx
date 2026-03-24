// src/components/SubmitButton.tsx
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
      className={`rounded-md border px-4 py-2 text-sm ${
        pending
          ? "cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500"
          : "border-black bg-black text-white hover:opacity-90"
      }`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}