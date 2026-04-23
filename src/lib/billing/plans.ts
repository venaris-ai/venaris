// src/lib/billing/plans.ts #6
import type { AppLanguage } from "@/lib/i18n";

export type { AppLanguage } from "@/lib/i18n";

export type BillingPlanKey = "starter" | "pro" | "enterprise";
export type SelfServeBillingPlanKey = "starter" | "pro";

export type BillingCycle = "monthly" | "yearly";

export type BillingPlanDefinition = {
  key: BillingPlanKey;
  label: string;
  description: string;
  maxCameras: number | null;
  maxMembers: number | null;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
};

export const BILLING_PLANS: Record<BillingPlanKey, BillingPlanDefinition> = {
  starter: {
    key: "starter",
    label: "Starter",
    description:
      "Für kleine Reviere und erste Teams mit klar begrenzter Kamera- und Mitglieder-Zahl.",
    maxCameras: 5,
    maxMembers: 5,
    monthlyPriceCents: 995,
    yearlyPriceCents: 9900,
  },
  pro: {
    key: "pro",
    label: "Pro",
    description:
      "Für professionelle Nutzung mit mehr Kameras, mehr Mitgliedern und operativem Ausbau.",
    maxCameras: 25,
    maxMembers: 25,
    monthlyPriceCents: 2995,
    yearlyPriceCents: 29900,
  },
  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    description:
      "Für größere Organisationen mit individueller Vertrags- und Limitstruktur.",
    maxCameras: null,
    maxMembers: null,
    monthlyPriceCents: null,
    yearlyPriceCents: null,
  },
};

export function isBillingPlanKey(value: string | null | undefined): value is BillingPlanKey {
  return value === "starter" || value === "pro" || value === "enterprise";
}

export function isSelfServeBillingPlanKey(
  value: string | null | undefined
): value is SelfServeBillingPlanKey {
  return value === "starter" || value === "pro";
}

export function getBillingPlan(planKey: string | null | undefined) {
  if (!isBillingPlanKey(planKey)) return null;
  return BILLING_PLANS[planKey];
}

export function getBillingPlanPriceCents(
  planKey: BillingPlanKey,
  billingCycle: BillingCycle
): number | null {
  const plan = BILLING_PLANS[planKey];
  return billingCycle === "yearly" ? plan.yearlyPriceCents : plan.monthlyPriceCents;
}

export function getBillingPlanDescription(
  planKey: BillingPlanKey,
  language: AppLanguage
) {
  if (language === "en") {
    switch (planKey) {
      case "starter":
        return "For smaller hunting grounds and first teams with clearly limited camera and member counts.";
      case "pro":
        return "For professional use with more cameras, more users and operational expansion.";
      case "enterprise":
        return "For larger organizations with an individual contract and limit structure.";
    }
  }

  return BILLING_PLANS[planKey].description;
}