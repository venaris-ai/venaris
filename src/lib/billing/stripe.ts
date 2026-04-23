// src/lib/billing/stripe.ts #1
import Stripe from "stripe";
import {
  BILLING_PLANS,
  type BillingCycle,
  type SelfServeBillingPlanKey,
} from "@/lib/billing/plans";

let stripeClient: Stripe | null = null;

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required Stripe environment variable: ${name}`);
  }
  return value;
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getStripeSecretKey() {
  return readRequiredEnv("STRIPE_SECRET_KEY");
}

export function getStripeWebhookSecret() {
  return readRequiredEnv("STRIPE_WEBHOOK_SECRET");
}

export function getStripePortalConfigurationId() {
  return readOptionalEnv("STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID");
}

export function getStripeTaxRateDe19() {
  return readRequiredEnv("STRIPE_TAX_RATE_DE_19");
}

export function getStripeClient() {
  if (stripeClient) return stripeClient;

  stripeClient = new Stripe(getStripeSecretKey());
  return stripeClient;
}

export const STRIPE_PRICE_IDS: Record<
  SelfServeBillingPlanKey,
  Record<BillingCycle, string | null>
> = {
  starter: {
    monthly: readOptionalEnv("STRIPE_PRICE_STARTER_MONTHLY"),
    yearly: readOptionalEnv("STRIPE_PRICE_STARTER_YEARLY"),
  },
  pro: {
    monthly: readOptionalEnv("STRIPE_PRICE_PRO_MONTHLY"),
    yearly: readOptionalEnv("STRIPE_PRICE_PRO_YEARLY"),
  },
};

export function getStripePriceId(
  planKey: SelfServeBillingPlanKey,
  billingCycle: BillingCycle
) {
  const priceId = STRIPE_PRICE_IDS[planKey][billingCycle];

  if (!priceId) {
    throw new Error(
      `Missing Stripe price ID for ${planKey} (${billingCycle}).`
    );
  }

  return priceId;
}

export function getSelfServePlanFromStripePriceId(
  priceId: string | null | undefined
): SelfServeBillingPlanKey | null {
  if (!priceId) return null;

  const normalized = priceId.trim();
  if (!normalized) return null;

  for (const planKey of ["starter", "pro"] as const) {
    for (const billingCycle of ["monthly", "yearly"] as const) {
      if (STRIPE_PRICE_IDS[planKey][billingCycle] === normalized) {
        return planKey;
      }
    }
  }

  return null;
}

export function getBillingCycleFromStripePriceId(
  priceId: string | null | undefined
): BillingCycle | null {
  if (!priceId) return null;

  const normalized = priceId.trim();
  if (!normalized) return null;

  for (const planKey of ["starter", "pro"] as const) {
    for (const billingCycle of ["monthly", "yearly"] as const) {
      if (STRIPE_PRICE_IDS[planKey][billingCycle] === normalized) {
        return billingCycle;
      }
    }
  }

  return null;
}

export function getPlanSnapshotForStripe(
  planKey: SelfServeBillingPlanKey,
  billingCycle: BillingCycle
) {
  const plan = BILLING_PLANS[planKey];
  const priceAmountCents =
    billingCycle === "yearly" ? plan.yearlyPriceCents : plan.monthlyPriceCents;

  if (priceAmountCents == null) {
    throw new Error(
      `Plan ${planKey} does not define a price for billing cycle ${billingCycle}.`
    );
  }

  return {
    planKey,
    billingCycle,
    priceAmountCents,
    priceCurrency: "EUR" as const,
    maxCameras: plan.maxCameras,
    maxMembers: plan.maxMembers,
  };
}