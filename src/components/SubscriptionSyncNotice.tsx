// src/components/SubscriptionSyncNotice.tsx #1
"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AppLanguage } from "@/lib/i18n";

type Props = {
  language: AppLanguage;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        text: "Payment successful. Subscription status is being updated...",
      }
    : {
        text: "Zahlung erfolgreich. Der Abo-Status wird aktualisiert ...",
      };
}

export default function SubscriptionSyncNotice({ language }: Props) {
  const text = t(language);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const checkoutState = searchParams.get("checkout");
  const shouldSync = checkoutState === "success";

  useEffect(() => {
    if (!shouldSync) return;

    const timeout = window.setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("checkout");

      const nextUrl = nextParams.toString()
        ? `${pathname}?${nextParams.toString()}`
        : pathname;

      router.replace(nextUrl);
      router.refresh();
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [pathname, router, searchParams, shouldSync]);

  if (!shouldSync) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-sky-100">
      {text.text}
    </div>
  );
}