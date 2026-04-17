// src/app/admin/subscriptions/AdminSubscriptionRequestActions.tsx #3
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppLanguage } from "@/lib/i18n";

type Props = {
  requestId: string;
  language: AppLanguage;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        actionFailed: "Action failed.",
        unknownError: "Unknown error",
        approveLoading: "Approving...",
        approve: "Approve",
        rejectLoading: "Rejecting...",
        reject: "Reject",
        approveNote: "Approved manually by Venaris admin",
        rejectNote: "Rejected manually by Venaris admin",
      }
    : {
        actionFailed: "Aktion fehlgeschlagen.",
        unknownError: "Unbekannter Fehler",
        approveLoading: "Genehmigt...",
        approve: "Genehmigen",
        rejectLoading: "Abgelehnt...",
        reject: "Ablehnen",
        approveNote: "Approved manually by Venaris admin",
        rejectNote: "Rejected manually by Venaris admin",
      };
}

export default function AdminSubscriptionRequestActions({
  requestId,
  language,
}: Props) {
  const router = useRouter();
  const text = t(language);
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");

  async function runAction(
    action: "approve" | "reject",
    resolutionNote: string
  ) {
    setLoading(action);
    setError("");

    try {
      const response = await fetch(
        `/api/subscription/change-request/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestId,
            resolutionNote,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? text.actionFailed);
        setLoading(null);
        return;
      }

      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : text.unknownError);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-[18px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => runAction("approve", text.approveNote)}
          className="inline-flex rounded-full border border-amber-300/20 bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018] hover:bg-[#ddb055] disabled:opacity-50"
        >
          {loading === "approve" ? text.approveLoading : text.approve}
        </button>

        <button
          type="button"
          disabled={loading !== null}
          onClick={() => runAction("reject", text.rejectNote)}
          className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/8 disabled:opacity-50"
        >
          {loading === "reject" ? text.rejectLoading : text.reject}
        </button>
      </div>
    </div>
  );
}