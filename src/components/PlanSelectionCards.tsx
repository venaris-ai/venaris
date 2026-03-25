// src/components/PlanSelectionCards.tsx #1
"use client";

import { useMemo, useState } from "react";
import { BILLING_PLANS, type BillingCycle } from "@/lib/billing/plans";

type PlanKey = "starter" | "pro" | "enterprise";

type Props = {
  currentPlanKey: PlanKey;
  billingCycle: BillingCycle;
  currency: string;
  currentCameraCount: number;
  currentMemberUsage: number;
  currentStatusLabel?: string;
  existingOpenRequest?: {
    requestedPlanKey: PlanKey;
    requestType: "upgrade" | "downgrade" | "change";
    status: "open";
    createdAt?: string | null;
  } | null;
};

type PendingState = {
  requestedPlanKey: PlanKey;
  requestType: "upgrade" | "downgrade" | "change";
};

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function billingCycleLabel(cycle: BillingCycle) {
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
}

function planPriceText(planKey: PlanKey, billingCycle: BillingCycle, currency: string) {
  const plan = BILLING_PLANS[planKey];
  const cents =
    billingCycle === "yearly" ? plan.yearlyPriceCents : plan.monthlyPriceCents;

  if (cents == null) {
    return "Individuell";
  }

  return formatMoney(cents, currency);
}

function requestTypeLabel(currentPlanKey: PlanKey, targetPlanKey: PlanKey) {
  const order: Record<PlanKey, number> = {
    starter: 1,
    pro: 2,
    enterprise: 3,
  };

  if (order[targetPlanKey] > order[currentPlanKey]) return "upgrade";
  if (order[targetPlanKey] < order[currentPlanKey]) return "downgrade";
  return "change";
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

export default function PlanSelectionCards({
  currentPlanKey,
  billingCycle,
  currency,
  currentCameraCount,
  currentMemberUsage,
  currentStatusLabel,
  existingOpenRequest = null,
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
          helperText = `Aktuell nutzt Du ${currentCameraCount} Kameras und ${currentMemberUsage} Members. ${plan.label} erlaubt maximal ${
            plan.maxCameras == null ? "individuelle" : plan.maxCameras
          } Kameras und ${
            plan.maxMembers == null ? "individuelle" : plan.maxMembers
          } Members.`;
        } else if (isCurrent) {
          helperText =
            currentPlanKey === "starter"
              ? "Auch für Starter nach Ablauf des Trials möglich."
              : `Aktueller Plan${currentStatusLabel ? ` · ${currentStatusLabel}` : ""}.`;
        } else if (actionKind === "downgrade") {
          helperText = "Planwechsel auf ein kleineres Paket.";
        } else if (actionKind === "upgrade") {
          helperText = "Planwechsel auf ein größeres Paket.";
        } else {
          helperText = "Planwechsel ohne Paketänderung.";
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
    [billingCycle, currentCameraCount, currentMemberUsage, currentPlanKey, currentStatusLabel]
  );

  async function choosePlan(planKey: PlanKey) {
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
        setError(data.error ?? "Anfrage konnte nicht erstellt werden.");
        setLoadingPlanKey(null);
        return;
      }

      setPendingRequest({
        requestedPlanKey: data.request.requested_plan_key,
        requestType: data.request.request_type,
      });
      setLoadingPlanKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setLoadingPlanKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {pendingRequest ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Anfrage erfasst:{" "}
          <strong>{BILLING_PLANS[pendingRequest.requestedPlanKey].label}</strong>{" "}
          ({pendingRequest.requestType}). Bis zur Bearbeitung ist keine weitere
          offene Plananfrage möglich.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(({ planKey, plan, eligibility, isCurrent, helperText }) => {
          const disabled = !eligibility.allowed || !!pendingRequest;
          const loading = loadingPlanKey === planKey;

          return (
            <div
              key={planKey}
              className={`rounded-2xl border p-5 ${
                isCurrent ? "border-blue-300 bg-blue-50" : "bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-gray-900">
                  {plan.label}
                </div>
                {isCurrent ? (
                  <span className="rounded-full border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-900">
                    Aktuell
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-sm leading-6 text-gray-600">
                {plan.description}
              </p>

              <div className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">
                {planPriceText(planKey, billingCycle, currency)}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {billingCycleLabel(billingCycle)} · inkl. MwSt.
              </div>

              <div className="mt-4 space-y-2 text-sm text-gray-700">
                <div>
                  Kameras: {plan.maxCameras == null ? "Individuell" : plan.maxCameras}
                </div>
                <div>
                  Members: {plan.maxMembers == null ? "Individuell" : plan.maxMembers}
                </div>
              </div>

              <p className="mt-4 min-h-16 text-sm leading-6 text-gray-600">
                {helperText}
              </p>

              <button
                type="button"
                disabled={disabled || loading}
                onClick={() => choosePlan(planKey)}
                className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Wird angefragt..." : "Plan auswählen"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}