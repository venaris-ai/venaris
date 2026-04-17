// src/components/PlanSelectionCards.tsx #6
"use client";

import { useMemo, useState } from "react";
import {
  BILLING_PLANS,
  getBillingPlanDescription,
  type BillingCycle,
  type BillingPlanKey,
} from "@/lib/billing/plans";
import type { AppLanguage } from "@/lib/i18n";

type PlanKey = BillingPlanKey;

type Props = {
  currentPlanKey: PlanKey;
  billingCycle: BillingCycle;
  currency: string;
  currentCameraCount: number;
  currentMemberUsage: number;
  currentStatusLabel?: string;
  isDemo?: boolean;
  existingOpenRequest?: {
    requestedPlanKey: PlanKey;
    requestType: "upgrade" | "downgrade" | "change";
    status: "open";
    createdAt?: string | null;
  } | null;
  language: AppLanguage;
};

type PendingState = {
  requestedPlanKey: PlanKey;
  requestType: "upgrade" | "downgrade" | "change";
};

function formatMoney(amountCents: number, currency: string, language: AppLanguage) {
  return new Intl.NumberFormat(language === "en" ? "en-GB" : "de-DE", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function billingCycleLabel(cycle: BillingCycle, language: AppLanguage) {
  if (language === "en") {
    return cycle === "yearly" ? "Yearly" : "Monthly";
  }
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
}

function planPriceText(
  planKey: PlanKey,
  billingCycle: BillingCycle,
  currency: string,
  language: AppLanguage
) {
  const plan = BILLING_PLANS[planKey];
  const cents =
    billingCycle === "yearly" ? plan.yearlyPriceCents : plan.monthlyPriceCents;

  if (cents == null) {
    return language === "en" ? "Custom" : "Individuell";
  }

  return formatMoney(cents, currency, language);
}

function requestTypeLabel(
  currentPlanKey: PlanKey,
  targetPlanKey: PlanKey
): "upgrade" | "downgrade" | "change" {
  const order: Record<PlanKey, number> = {
    starter: 1,
    pro: 2,
    enterprise: 3,
  };

  if (order[targetPlanKey] > order[currentPlanKey]) return "upgrade";
  if (order[targetPlanKey] < order[currentPlanKey]) return "downgrade";
  return "change";
}

function requestTypeText(
  requestType: "upgrade" | "downgrade" | "change",
  language: AppLanguage
) {
  if (language === "en") {
    return requestType;
  }

  if (requestType === "upgrade") return "Upgrade";
  if (requestType === "downgrade") return "Downgrade";
  return "Änderung";
}

function isPlanSelectable(params: {
  planKey: PlanKey;
  currentCameraCount: number;
  currentMemberUsage: number;
}) {
  const { planKey, currentCameraCount, currentMemberUsage } = params;
  const plan = BILLING_PLANS[planKey];

  const cameraBlocked =
    plan.maxCameras != null && currentCameraCount > plan.maxCameras;
  const memberBlocked =
    plan.maxMembers != null && currentMemberUsage > plan.maxMembers;

  return {
    allowed: !cameraBlocked && !memberBlocked,
    cameraBlocked,
    memberBlocked,
    maxCameras: plan.maxCameras,
    maxMembers: plan.maxMembers,
  };
}

function normalizeApiErrorMessage(message: string, language: AppLanguage) {
  if (message.includes("Demo mode is read-only")) {
    return language === "en"
      ? "Demo mode: changes are disabled."
      : "Demo-Modus: Änderungen sind deaktiviert.";
  }
  return message;
}

export default function PlanSelectionCards({
  currentPlanKey,
  billingCycle,
  currency,
  currentCameraCount,
  currentMemberUsage,
  currentStatusLabel,
  isDemo = false,
  existingOpenRequest = null,
  language,
}: Props) {
  const [loadingPlanKey, setLoadingPlanKey] = useState<PlanKey | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingState | null>(
    existingOpenRequest
      ? {
          requestedPlanKey: existingOpenRequest.requestedPlanKey,
          requestType: existingOpenRequest.requestType,
        }
      : null
  );
  const [error, setError] = useState<string>("");

  const cards = useMemo(
    () =>
      (["starter", "pro", "enterprise"] as const).map((planKey) => {
        const plan = BILLING_PLANS[planKey];
        const eligibility = isPlanSelectable({
          planKey,
          currentCameraCount,
          currentMemberUsage,
        });

        const isCurrent = currentPlanKey === planKey;
        const actionKind = requestTypeLabel(currentPlanKey, planKey);

        let helperText = "";

        if (!eligibility.allowed) {
          helperText =
            language === "en"
              ? `You currently use ${currentCameraCount} cameras and ${currentMemberUsage} members. ${plan.label} allows a maximum of ${
                  plan.maxCameras == null ? "custom" : plan.maxCameras
                } cameras and ${
                  plan.maxMembers == null ? "custom" : plan.maxMembers
                } members.`
              : `Aktuell nutzt Du ${currentCameraCount} Kameras und ${currentMemberUsage} Mitglieder. ${plan.label} erlaubt maximal ${
                  plan.maxCameras == null ? "individuelle" : plan.maxCameras
                } Kameras und ${
                  plan.maxMembers == null ? "individuelle" : plan.maxMembers
                } Mitglieder.`;
        } else if (isCurrent) {
          helperText =
            currentPlanKey === "starter"
              ? language === "en"
                ? "Also available as Starter after the trial ends."
                : "Auch für Starter nach Ablauf des Trials möglich."
              : language === "en"
                ? `Current plan${currentStatusLabel ? ` · ${currentStatusLabel}` : ""}.`
                : `Aktueller Plan${currentStatusLabel ? ` · ${currentStatusLabel}` : ""}.`;
        } else if (actionKind === "downgrade") {
          helperText =
            language === "en"
              ? "Plan change to a smaller package."
              : "Planwechsel auf ein kleineres Paket.";
        } else if (actionKind === "upgrade") {
          helperText =
            language === "en"
              ? "Plan change to a larger package."
              : "Planwechsel auf ein größeres Paket.";
        } else {
          helperText =
            language === "en"
              ? "Plan change without package size change."
              : "Planwechsel ohne Paketänderung.";
        }

        return {
          planKey,
          plan,
          eligibility,
          isCurrent,
          actionKind,
          helperText,
        };
      }),
    [billingCycle, currentCameraCount, currentMemberUsage, currentPlanKey, currentStatusLabel, language]
  );

  async function choosePlan(planKey: PlanKey) {
    if (isDemo) {
      setError(
        language === "en"
          ? "Demo mode: changes are disabled."
          : "Demo-Modus: Änderungen sind deaktiviert."
      );
      return;
    }

    setLoadingPlanKey(planKey);
    setError("");

    try {
      const response = await fetch("/api/subscription/change-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestedPlanKey: planKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          normalizeApiErrorMessage(
            data.error ??
              data.details ??
              (language === "en"
                ? "Request could not be created."
                : "Anfrage konnte nicht erstellt werden."),
            language
          )
        );
        setLoadingPlanKey(null);
        return;
      }

      setPendingRequest({
        requestedPlanKey: data.request.requested_plan_key,
        requestType: data.request.request_type,
      });
      setLoadingPlanKey(null);
    } catch (e) {
      setError(
        normalizeApiErrorMessage(
          e instanceof Error
            ? e.message
            : language === "en"
              ? "Unknown error"
              : "Unbekannter Fehler",
          language
        )
      );
      setLoadingPlanKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {isDemo ? (
        <div className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          {language === "en"
            ? "Demo mode: changes are disabled."
            : "Demo-Modus: Änderungen sind deaktiviert."}
        </div>
      ) : null}

      {pendingRequest ? (
        <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100">
          {language === "en" ? "Request recorded:" : "Anfrage erfasst:"}{" "}
          <strong>{BILLING_PLANS[pendingRequest.requestedPlanKey].label}</strong>{" "}
          ({requestTypeText(pendingRequest.requestType, language)}).{" "}
          {language === "en"
            ? "No further open plan request is possible until this one has been processed."
            : "Bis zur Bearbeitung ist keine weitere offene Plananfrage möglich."}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(({ planKey, plan, eligibility, isCurrent, helperText }) => {
          const disabled = !eligibility.allowed || !!pendingRequest || isDemo;
          const loading = loadingPlanKey === planKey;

          return (
            <div
              key={planKey}
              className={`rounded-[28px] border p-5 backdrop-blur-sm ${
                isCurrent
                  ? "border-sky-300/30 bg-[linear-gradient(180deg,rgba(165,203,255,0.14),rgba(255,255,255,0.04))]"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-white">
                  {plan.label}
                </div>
                {isCurrent ? (
                  <span className="rounded-full border border-sky-300/30 bg-white/5 px-3 py-1 text-xs font-medium text-sky-100">
                    {language === "en" ? "Current" : "Aktuell"}
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-sm leading-6 text-white/68">
                {getBillingPlanDescription(planKey, language)}
              </p>

              <div className="mt-4 text-2xl font-semibold tracking-tight text-white">
                {planPriceText(planKey, billingCycle, currency, language)}
              </div>
              <div className="mt-1 text-xs text-white/45">
                {billingCycleLabel(billingCycle, language)} ·{" "}
                {language === "en" ? "incl. VAT" : "inkl. MwSt."}
              </div>

              <div className="mt-4 space-y-2 text-sm text-white/72">
                <div>
                  {language === "en" ? "Cameras:" : "Kameras:"}{" "}
                  {plan.maxCameras == null
                    ? language === "en"
                      ? "Custom"
                      : "Individuell"
                    : plan.maxCameras}
                </div>
                <div>
                  {language === "en" ? "Members:" : "Mitglieder:"}{" "}
                  {plan.maxMembers == null
                    ? language === "en"
                      ? "Custom"
                      : "Individuell"
                    : plan.maxMembers}
                </div>
              </div>

              <p className="mt-4 min-h-16 text-sm leading-6 text-white/68">
                {helperText}
              </p>

              <button
                type="button"
                disabled={disabled || loading}
                onClick={() => choosePlan(planKey)}
                title={
                  isDemo
                    ? language === "en"
                      ? "Demo mode: changes are disabled."
                      : "Demo-Modus: Änderungen sind deaktiviert."
                    : ""
                }
                className="mt-4 inline-flex w-full items-center justify-center rounded-[12px] bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? language === "en"
                    ? "Submitting request..."
                    : "Wird angefragt..."
                  : isDemo
                    ? language === "en"
                      ? "Demo mode"
                      : "Demo-Modus"
                    : language === "en"
                      ? "Choose plan"
                      : "Plan auswählen"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}