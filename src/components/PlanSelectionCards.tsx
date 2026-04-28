// src/components/PlanSelectionCards.tsx #12
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BILLING_PLANS,
  getBillingPlanDescription,
  isSelfServeBillingPlanKey,
  type BillingCycle,
  type BillingPlanKey,
} from "@/lib/billing/plans";
import type { AppLanguage } from "@/lib/i18n";
import { formatAppDate } from "@/lib/dateTime";

type PlanKey = BillingPlanKey;

type Props = {
  currentPlanKey: PlanKey;
  billingCycle: BillingCycle;
  currency: string;
  currentCameraCount: number;
  currentMemberUsage: number;
  currentStatusLabel?: string;
  billingProvider?: "none" | "manual" | "stripe";
  isDemo?: boolean;
  existingOpenRequest?: {
    requestedPlanKey: PlanKey;
    requestType: "upgrade" | "downgrade" | "change";
    status: "open";
    createdAt?: string | null;
  } | null;
  existingScheduledChange?: {
    requestedPlanKey: "starter" | "pro";
    requestType: "upgrade" | "downgrade";
    scheduledFor?: string | null;
  } | null;
  language: AppLanguage;
};

type PendingState = {
  requestedPlanKey: PlanKey;
  requestType: "upgrade" | "downgrade" | "change";
};

type ScheduledChangeState = {
  requestedPlanKey: "starter" | "pro";
  requestType: "upgrade" | "downgrade";
  scheduledFor?: string | null;
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

function isBillingDataIncompleteMessage(message: string) {
  return (
    message.includes("Billing data is incomplete") ||
    message.includes("Rechnungsdaten sind unvollständig")
  );
}

function normalizeApiErrorMessage(message: string, language: AppLanguage) {
  if (message.includes("Demo mode is read-only")) {
    return language === "en"
      ? "Demo mode: changes are disabled."
      : "Demo-Modus: Änderungen sind deaktiviert.";
  }

  if (isBillingDataIncompleteMessage(message)) {
    return language === "en"
      ? "Please complete your account billing details first."
      : "Bitte vervollständige zuerst Deine Account-Daten für die Rechnungsstellung.";
  }

  return message;
}

function choosePlanButtonLabel(params: {
  planKey: PlanKey;
  loading: boolean;
  isDemo: boolean;
  currentPlanKey: PlanKey;
  currentStatusLabel?: string;
  language: AppLanguage;
}) {
  const {
    planKey,
    loading,
    isDemo,
    currentPlanKey,
    currentStatusLabel,
    language,
  } = params;

  const actionKind = requestTypeLabel(currentPlanKey, planKey);
  const isCurrent = currentPlanKey === planKey;
  const isTrialingCurrent = isCurrent && currentStatusLabel === "Trial";

  if (loading) {
    if (isSelfServeBillingPlanKey(planKey) && actionKind === "downgrade") {
      return language === "en"
        ? "Scheduling downgrade..."
        : "Downgrade wird geplant...";
    }

    if (isSelfServeBillingPlanKey(planKey) && actionKind === "upgrade") {
      return language === "en" ? "Updating plan..." : "Plan wird aktualisiert...";
    }

    if (isSelfServeBillingPlanKey(planKey)) {
      return language === "en"
        ? "Opening checkout..."
        : "Checkout wird geöffnet...";
    }

    return language === "en" ? "Submitting request..." : "Wird angefragt...";
  }

  if (isDemo) {
    return language === "en" ? "Demo mode" : "Demo-Modus";
  }

  if (isCurrent && !isTrialingCurrent) {
    return language === "en" ? "Current plan" : "Aktueller Plan";
  }

  if (isSelfServeBillingPlanKey(planKey) && actionKind === "downgrade") {
    return language === "en" ? "Schedule downgrade" : "Downgrade planen";
  }

  if (isSelfServeBillingPlanKey(planKey)) {
    return language === "en" ? "Continue to checkout" : "Zum Checkout";
  }

  return language === "en" ? "Request plan" : "Plan anfragen";
}

function formatScheduledDate(value: string | null | undefined, language: AppLanguage) {
  if (!value) return null;

  return formatAppDate(value, language);
}

export default function PlanSelectionCards({
  currentPlanKey,
  billingCycle,
  currency,
  currentCameraCount,
  currentMemberUsage,
  currentStatusLabel,
  billingProvider = "none",
  isDemo = false,
  existingOpenRequest = null,
  existingScheduledChange = null,
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
  const [scheduledChange, setScheduledChange] =
    useState<ScheduledChangeState | null>(
      existingScheduledChange
        ? {
            requestedPlanKey: existingScheduledChange.requestedPlanKey,
            requestType: existingScheduledChange.requestType,
            scheduledFor: existingScheduledChange.scheduledFor ?? null,
          }
        : null
    );
  const [error, setError] = useState<string>("");
  const [needsAccountData, setNeedsAccountData] = useState(false);

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
        const isSelfServe = isSelfServeBillingPlanKey(planKey);
        const isScheduledTarget = scheduledChange?.requestedPlanKey === planKey;

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
        } else if (isScheduledTarget) {
          helperText =
            language === "en"
              ? "No further checkout is required. Amount and date are stored in Stripe."
              : "Kein weiterer Checkout erforderlich. Betrag & Datum sind bei Stripe hinterlegt.";
        } else if (isCurrent) {
          helperText =
            language === "en"
              ? `Current plan${currentStatusLabel ? ` · ${currentStatusLabel}` : ""}.`
              : `Aktueller Plan${currentStatusLabel ? ` · ${currentStatusLabel}` : ""}.`;
        } else if (planKey === "enterprise") {
          helperText =
            language === "en"
              ? "Individual arrangement."
              : "Individuelle Abstimmung.";
        } else if (isSelfServe && actionKind === "downgrade") {
          helperText =
            language === "en"
              ? "Scheduled plan change to a smaller package. The new tariff starts with the next period."
              : "Geplanter Planwechsel auf ein kleineres Paket. Der neue Tarif startet mit der nächsten Periode.";
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
          helperText,
          isScheduledTarget,
        };
      }),
    [
      currentCameraCount,
      currentMemberUsage,
      currentPlanKey,
      currentStatusLabel,
      language,
      scheduledChange,
    ]
  );

  async function choosePlan(planKey: PlanKey) {
    if (isDemo) {
      setError(
        language === "en"
          ? "Demo mode: changes are disabled."
          : "Demo-Modus: Änderungen sind deaktiviert."
      );
      setNeedsAccountData(false);
      return;
    }

    setLoadingPlanKey(planKey);
    setError("");
    setNeedsAccountData(false);

    try {
      const actionKind = requestTypeLabel(currentPlanKey, planKey);
      const shouldUseDirectStripeChange =
        billingProvider === "stripe" &&
        currentStatusLabel !== "Trial" &&
        isSelfServeBillingPlanKey(planKey) &&
        actionKind !== "change";

      if (shouldUseDirectStripeChange) {
        const response = await fetch("/api/billing/stripe/change-plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planKey,
            billingCycle,
          }),
        });

        const data = await response.json();
        const rawMessage =
          data.error ??
          data.details ??
          (language === "en"
            ? "Plan change could not be executed."
            : "Planwechsel konnte nicht ausgeführt werden.");

        if (!response.ok) {
          setNeedsAccountData(isBillingDataIncompleteMessage(rawMessage));
          setError(normalizeApiErrorMessage(rawMessage, language));
          setLoadingPlanKey(null);
          return;
        }

        if (data.mode === "downgrade") {
          setScheduledChange({
            requestedPlanKey: planKey,
            requestType: "downgrade",
            scheduledFor:
              typeof data.scheduledFor === "string" ? data.scheduledFor : null,
          });
          setLoadingPlanKey(null);
          return;
        }

        if (data.mode === "upgrade") {
          window.location.reload();
          return;
        }
      }

      if (isSelfServeBillingPlanKey(planKey)) {
        const response = await fetch("/api/billing/stripe/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planKey,
            billingCycle,
          }),
        });

        const data = await response.json();
        const rawMessage =
          data.error ??
          data.details ??
          (language === "en"
            ? "Checkout could not be started."
            : "Checkout konnte nicht gestartet werden.");

        if (!response.ok) {
          setNeedsAccountData(isBillingDataIncompleteMessage(rawMessage));
          setError(normalizeApiErrorMessage(rawMessage, language));
          setLoadingPlanKey(null);
          return;
        }

        if (!data.url || typeof data.url !== "string") {
          setError(
            language === "en"
              ? "Checkout URL is missing."
              : "Checkout-URL fehlt."
          );
          setLoadingPlanKey(null);
          return;
        }

        window.location.assign(data.url);
        return;
      }

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
      const rawMessage =
        data.error ??
        data.details ??
        (language === "en"
          ? "Request could not be created."
          : "Anfrage konnte nicht erstellt werden.");

      if (!response.ok) {
        setError(normalizeApiErrorMessage(rawMessage, language));
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
          <div>{error}</div>
          {needsAccountData ? (
            <div className="mt-4">
              <Link
                href={`/orga/account?next=${encodeURIComponent("/orga/subscription")}`}
                className="inline-flex items-center justify-center rounded-[12px] bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018]"
              >
                {language === "en" ? "Open account" : "Mein Konto öffnen"}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(
          ({ planKey, plan, eligibility, isCurrent, helperText, isScheduledTarget }) => {
            const isTrialingCurrent =
              isCurrent && currentStatusLabel === "Trial";
            const disabled =
              !eligibility.allowed ||
              !!pendingRequest ||
              isDemo ||
              isScheduledTarget ||
              (isCurrent && !isTrialingCurrent);
            const loading = loadingPlanKey === planKey;

            return (
              <div
                key={planKey}
                className={`rounded-[28px] border p-5 backdrop-blur-sm ${
                  isCurrent
                    ? currentStatusLabel === "Trial"
                      ? "border-sky-300/25 bg-[linear-gradient(180deg,rgba(56,189,248,0.10),rgba(255,255,255,0.04))]"
                      : "border-emerald-300/25 bg-[linear-gradient(180deg,rgba(16,185,129,0.10),rgba(255,255,255,0.04))]"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-semibold text-white">
                    {plan.label}
                  </div>

                  {isCurrent ? (
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        currentStatusLabel === "Trial"
                          ? "border-sky-300/25 bg-sky-300/10 text-sky-200"
                          : "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                      }`}
                    >
                      {currentStatusLabel ?? "Active"}
                    </span>
                  ) : isScheduledTarget ? (
                    <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-xs font-medium text-sky-200">
                      {language === "en"
                        ? `Scheduled from ${formatScheduledDate(
                            scheduledChange?.scheduledFor,
                            language
                          )}`
                        : `Geplant ab ${formatScheduledDate(
                            scheduledChange?.scheduledFor,
                            language
                          )}`}
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
                  {isScheduledTarget
                    ? language === "en"
                      ? "Downgrade scheduled"
                      : "Downgrade geplant"
                    : choosePlanButtonLabel({
                        planKey,
                        loading,
                        isDemo,
                        currentPlanKey,
                        currentStatusLabel,
                        language,
                      })}
                </button>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}