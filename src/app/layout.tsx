// src/app/layout.tsx #12
import "./globals.css";
import MainNav from "@/components/MainNav";
import SectionNav from "@/components/SectionNav";
import ContextBar from "@/components/ContextBar";
import LogoutButton from "@/components/LogoutButton";
import AppShellGate from "@/components/AppShellGate";
import DemoSessionGuard from "@/components/DemoSessionGuard";
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

function billingCycleLabel(cycle: BillingCycle) {
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
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

function HeaderBrand({ email }: { email: string | null }) {
  return (
    <div className="font-semibold tracking-[0.18em] text-white">
      VENARIS
      {email ? (
        <span className="ml-2 text-sm font-normal tracking-normal text-white/55">
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
  const role = ctx?.activeMembership.role ?? null;
  const email = ctx?.user.email ?? null;
  const isDemo = ctx?.isDemo ?? false;

  if (organization) {
    const nowIso = new Date().toISOString();

    const [
      subscriptionResult,
      cameraCountResult,
      memberCountResult,
      inviteCountResult,
    ] = await Promise.all([
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
        blockedPage = (
          <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
            <div className="w-full rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,30,23,0.92),rgba(13,23,18,0.96))] p-8 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="text-sm font-medium text-white/55">
                    Venaris · {organization.name}
                  </div>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                    {blockedHeadline(resolved.effectiveStatus)}
                  </h1>
                  <p className="mt-4 text-sm leading-7 text-white/72">
                    {blockedText(resolved.effectiveStatus)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/60">
                    Aktueller Plan:{" "}
                    <strong className="text-white">
                      {BILLING_PLANS[subscription.plan_key].label}
                    </strong>
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
                  isDemo={isDemo}
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
    <header className="border-b border-white/8 bg-[#102018]/72 backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-6 py-3">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <HeaderBrand email={email} />
            <div className="mt-2">
              <ContextBar />
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <MainNav />
              <LogoutButton />
            </div>

            <SectionNav role={role} email={email} isDemo={isDemo} />
          </div>
        </div>
      </div>
    </header>
  );

  return (
    <html lang="de">
      <body>
        {isDemo ? <DemoSessionGuard /> : null}
        <AppShellGate blocked={blocked} blockedPage={blockedPage} header={header}>
          {children}
        </AppShellGate>
      </body>
    </html>
  );
}