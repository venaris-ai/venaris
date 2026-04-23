// src/components/StripeBillingPortalButton.tsx #1
"use client";

import { useState } from "react";
import type { AppLanguage } from "@/lib/i18n";

type Props = {
  language: AppLanguage;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        idle: "Manage billing",
        loading: "Opening billing portal...",
        genericError: "Billing portal could not be opened.",
      }
    : {
        idle: "Abrechnung verwalten",
        loading: "Billing Portal wird geöffnet...",
        genericError: "Billing Portal konnte nicht geöffnet werden.",
      };
}

export default function StripeBillingPortalButton({ language }: Props) {
  const text = t(language);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/billing/stripe/portal", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? data.details ?? text.genericError);
        setLoading(false);
        return;
      }

      if (!data.url || typeof data.url !== "string") {
        setError(text.genericError);
        setLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : text.genericError);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-[16px] border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-[12px] bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? text.loading : text.idle}
      </button>
    </div>
  );
}