// src/components/PlanSelectionCards.tsx #2
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
        <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100">
          Anfrage erfasst:{" "}
          <strong>{BILLING_PLANS[pendingRequest.requestedPlanKey].label}</strong>{" "}
          ({pendingRequest.requestType}). Bis zur Bearbeitung ist keine weitere
          offene Plananfrage möglich.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
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
                    Aktuell
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-sm leading-6 text-white/68">
                {plan.description}
              </p>

              <div className="mt-4 text-2xl font-semibold tracking-tight text-white">
                {planPriceText(planKey, billingCycle, currency)}
              </div>
              <div className="mt-1 text-xs text-white/45">
                {billingCycleLabel(billingCycle)} · inkl. MwSt.
              </div>

              <div className="mt-4 space-y-2 text-sm text-white/72">
                <div>
                  Kameras: {plan.maxCameras == null ? "Individuell" : plan.maxCameras}
                </div>
                <div>
                  Members: {plan.maxMembers == null ? "Individuell" : plan.maxMembers}
                </div>
              </div>

              <p className="mt-4 min-h-16 text-sm leading-6 text-white/68">
                {helperText}
              </p>

              <button
                type="button"
                disabled={disabled || loading}
                onClick={() => choosePlan(planKey)}
                className="mt-4 inline-flex w-full items-center justify-center rounded-[12px] bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018] disabled:cursor-not-allowed disabled:opacity-50"
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