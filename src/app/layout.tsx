// src/app/layout.tsx #6
import "./globals.css";
import Link from "next/link";
import MainNav from "@/components/MainNav";
import SectionNav from "@/components/SectionNav";
import ContextBar from "@/components/ContextBar";
import LogoutButton from "@/components/LogoutButton";
import AppShellGate from "@/components/AppShellGate";
import { getOptionalActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import PlanSelectionCards from "@/components/PlanSelectionCards";
import { BILLING_PLANS, type BillingCycle } from "@/lib/billing/plans";
import {
  resolveSubscriptionState,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionPolicy";

export const metadata = {
  title: "Venaris",
};

type SubscriptionRow = {
  plan_key: "starter" | "pro" | "enterprise";
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  trial_ends_at: string | null;
  current_period_end: string | null;
  price_amount_cents: number;
  price_currency: string;
  max_cameras: number;
  max_members: number;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function billingCycleLabel(cycle: BillingCycle) {
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
}

function planPriceText(params: {
  planKey: "starter" | "pro" | "enterprise";
  billingCycle: BillingCycle;
  currency: string;
}) {
  const { planKey, billingCycle, currency } = params;
  const plan = BILLING_PLANS[planKey];

  const cents =
    billingCycle === "yearly" ? plan.yearlyPriceCents : plan.monthlyPriceCents;

  if (cents == null) {
    return "Individuell";
  }

  return formatMoney(cents, currency);
}

function blockedHeadline(status: SubscriptionStatus) {
  switch (status) {
    case "expired":
      return "Dein Abo ist abgelaufen";
    case "past_due":
      return "Deine Subscription braucht gerade eine kurze Klärung";
    case "canceled":
      return "Deine Subscription ist derzeit nicht aktiv";
    default:
      return "Bitte wähle einen aktiven Plan";
  }
}

function blockedText(status: SubscriptionStatus) {
  switch (status) {
    case "expired":
      return "Um weiter in den Genuss der Venaris-Welt zu kommen, wähle jetzt eine passende Option für Deine Organization aus.";
    case "past_due":
      return "Sobald der Plan wieder aktiv ist, kannst Du Venaris wie gewohnt weiter nutzen. Wähle jetzt eine passende Option oder prüfe Deine Subscription-Details.";
    case "canceled":
      return "Aktiviere jetzt wieder einen passenden Plan, damit Deine Organization den Zugriff auf die Produktwelt fortsetzen kann.";
    default:
      return "Wähle jetzt eine passende Option für Deine Organization aus.";
  }
}

async function HeaderBrand() {
  const ctx = await getOptionalActiveOrganization();
  const email = ctx?.user.email ?? null;

  return (
    <div className="font-semibold">
      Venaris
      {email ? (
        <span className="ml-2 text-sm font-normal text-gray-500">
          · {email}
        </span>
      ) : null}
    </div>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getOptionalActiveOrganization();
  const supabase = supabaseServer();

  let blocked = false;
  let blockedPage: React.ReactNode = null;

  const organization = ctx?.activeMembership.organizations ?? null;

  if (organization) {
    const nowIso = new Date().toISOString();

    const [subscriptionResult, cameraCountResult, memberCountResult, inviteCountResult] =
      await Promise.all([
        supabase
          .from("organization_subscriptions")
          .select(
            `
            plan_key,
            status,
            billing_cycle,
            trial_ends_at,
            current_period_end,
            price_amount_cents,
            price_currency,
            max_cameras,
            max_members
            `
          )
          .eq("organization_id", organization.id)
          .maybeSingle<SubscriptionRow>(),

        supabase
          .from("cameras")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id),

        supabase
          .from("organization_members")
          .select("user_id", { count: "exact", head: true })
          .eq("organization_id", organization.id),

        supabase
          .from("organization_invites")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .eq("status", "pending")
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
      ]);

    if (subscriptionResult.error) {
      throw new Error(
        `Failed to load subscription shell state: ${subscriptionResult.error.message}`
      );
    }

    if (cameraCountResult.error) {
      throw new Error(
        `Failed to load camera shell count: ${cameraCountResult.error.message}`
      );
    }

    if (memberCountResult.error) {
      throw new Error(
        `Failed to load member shell count: ${memberCountResult.error.message}`
      );
    }

    if (inviteCountResult.error) {
      throw new Error(
        `Failed to load invite shell count: ${inviteCountResult.error.message}`
      );
    }

    const subscription = subscriptionResult.data;

    if (subscription) {
      const resolved = resolveSubscriptionState({
        status: subscription.status,
        trialEndsAt: subscription.trial_ends_at,
        currentPeriodEnd: subscription.current_period_end,
        maxCameras: subscription.max_cameras,
        maxMembers: subscription.max_members,
        currentCameraCount: cameraCountResult.count ?? 0,
        activeMemberCount: memberCountResult.count ?? 0,
        openInviteCount: inviteCountResult.count ?? 0,
      });

      blocked = !["trialing", "active"].includes(resolved.effectiveStatus);

      if (blocked) {
        const cycle = subscription.billing_cycle;
        const currency = subscription.price_currency;

        blockedPage = (
          <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
            
<div className="w-full rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
  <div className="flex items-start justify-between gap-4">
    <div className="max-w-3xl">
      <div className="text-sm font-medium text-neutral-500">
        Venaris · {organization.name}
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">
        {blockedHeadline(resolved.effectiveStatus)}
      </h1>
      <p className="mt-4 text-sm leading-7 text-neutral-700">
        {blockedText(resolved.effectiveStatus)}
      </p>
      <p className="mt-3 text-sm leading-7 text-neutral-600">
        Aktueller Plan: <strong>{BILLING_PLANS[subscription.plan_key].label}</strong>
        {" · "}
        {billingCycleLabel(subscription.billing_cycle)}
        {" · "}
        Trial endet: {formatDate(subscription.trial_ends_at)}
      </p>
    </div>

    <LogoutButton />
  </div>



<div className="mt-8">
  <PlanSelectionCards
    currentPlanKey={subscription.plan_key}
    billingCycle={subscription.billing_cycle}
    currency={subscription.price_currency}
    currentCameraCount={cameraCountResult.count ?? 0}
    currentMemberUsage={
      (memberCountResult.count ?? 0) + (inviteCountResult.count ?? 0)
    }
    currentStatusLabel={resolved.effectiveStatus}
    existingOpenRequest={null}
  />
</div>

              
            </div>
          </main>
        );
      }
    }
  }

  const header = (
    <header className="border-b">
      <div className="mx-auto max-w-5xl px-6 py-3">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <HeaderBrand />
            <div className="mt-2">
              <ContextBar />
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <MainNav />
              <LogoutButton />
            </div>

            <SectionNav />
          </div>
        </div>
      </div>
    </header>
  );

  return (
    <html lang="de">
      <body>
        <AppShellGate blocked={blocked} blockedPage={blockedPage} header={header}>
          {children}
        </AppShellGate>
      </body>
    </html>
  );
}