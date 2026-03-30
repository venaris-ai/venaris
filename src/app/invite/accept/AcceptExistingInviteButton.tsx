// src/app/invite/accept/AcceptExistingInviteButton.tsx #2
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  token: string;
};

export default function AcceptExistingInviteButton({ token }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onAccept() {
    setLoading(true);
    setError("");

    const response = await fetch("/api/invites/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const payload = await response.json().catch(() => null);

    setLoading(false);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? "Einladung konnte nicht angenommen werden.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="mt-5 space-y-3">
      {error ? (
        <div className="rounded-[14px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onAccept}
        disabled={loading}
        className="rounded-[10px] bg-[#c9952e] px-4 py-2 text-sm text-[#102018] disabled:opacity-50"
      >
        {loading ? "Nimmt an..." : "Einladung annehmen"}
      </button>
    </div>
  );
}