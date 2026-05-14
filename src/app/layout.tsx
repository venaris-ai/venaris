// src/app/layout.tsx #16
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { cookies } from "next/headers";
import HeaderMenu from "@/components/HeaderMenu";
import HeaderRevierScope from "@/components/HeaderRevierScope";
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
import {
  LOCALE_COOKIE,
  normalizeLanguage,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  DEFAULT_APP_TIME_ZONE,
  formatAppDate,
} from "@/lib/dateTime";

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

function formatDate(value: string | null, language: AppLanguage) {
  return formatAppDate(value, language, DEFAULT_APP_TIME_ZONE);
}

function billingCycleLabel(cycle: BillingCycle, language: AppLanguage) {
  if (language === "en") {
    return cycle === "yearly" ? "Yearly" : "Monthly";
  }
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
}

function blockedHeadline(status: SubscriptionStatus, language: AppLanguage) {
  if (language === "en") {
    switch (status) {
      case "expired":
        return "Your subscription has expired";
      case "past_due":
        return "Your subscription needs a quick clarification";
      case "canceled":
        return "Your subscription is currently not active";
      default:
        return "Please choose an active plan";
    }
  }

  switch (status) {
    case "expired":
      return "Dein Abo ist abgelaufen";
    case "past_due":
      return "Dein Abo braucht gerade eine kurze Klärung";
    case "canceled":
      return "Dein Abo ist derzeit nicht aktiv";
    default:
      return "Bitte wähle einen aktiven Plan";
  }
}

function blockedText(status: SubscriptionStatus, language: AppLanguage) {
  if (language === "en") {
    switch (status) {
      case "expired":
        return "To continue using Venaris, please choose a suitable plan for your organization now.";
      case "past_due":
        return "As soon as the plan is active again, you can continue using Venaris as usual. Choose a suitable plan now or review your subscription details.";
      case "canceled":
        return "Activate a suitable plan again now so your organization can continue accessing the product environment.";
      default:
        return "Choose a suitable plan for your organization now.";
    }
  }

  switch (status) {
    case "expired":
      return "Um weiter in den Genuss der Venaris-Welt zu kommen, wähle jetzt einen passenden Plan für Deine Organization aus.";
    case "past_due":
      return "Sobald Dein Abo wieder aktiv ist, kannst Du Venaris wie gewohnt weiter nutzen. Wähle jetzt einen passenden Plan oder prüfe Deine Abo-Details.";
    case "canceled":
      return "Aktiviere jetzt wieder einen passenden Plan, damit Deine Organization den Zugriff auf die Produktwelt fortsetzen kann.";
    default:
      return "Wähle jetzt einen passende Plan für Deine Organization aus.";
  }
}

function HeaderBrand({ email }: { email: string | null }) {
  return (
    <div className="min-w-0 font-semibold tracking-[0.18em] text-white">
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
  const cookieStore = await cookies();

  let blocked = false;
  let blockedPage: React.ReactNode = null;

  const organization = ctx?.activeMembership.organizations ?? null;
  const role = ctx?.activeMembership.role ?? null;
  const email = ctx?.user.email ?? null;
  const isDemo = ctx?.isDemo ?? false;

  const cookieLanguage = normalizeLanguage(cookieStore.get(LOCALE_COOKIE)?.value);
  let profileLanguage: AppLanguage | undefined;

  if (ctx?.user.id) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", ctx.user.id)
      .maybeSingle();

    profileLanguage = normalizeLanguage(profileData?.preferred_language);
  }

  const language = resolveLanguage({
    cookieLanguage,
    profileLanguage,
  });

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
                    {blockedHeadline(resolved.effectiveStatus, language)}
                  </h1>
                  <p className="mt-4 text-sm leading-7 text-white/72">
                    {blockedText(resolved.effectiveStatus, language)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/60">
                    {language === "en" ? "Current plan:" : "Aktueller Plan:"}{" "}
                    <strong className="text-white">
                      {BILLING_PLANS[subscription.plan_key].label}
                    </strong>
                    {" · "}
                    {billingCycleLabel(subscription.billing_cycle, language)}
                    {" · "}
                    {language === "en" ? "Trial ends:" : "Trial endet:"}{" "}
                    {formatDate(subscription.trial_ends_at, language)}
                  </p>
                </div>

                <LogoutButton language={language} />
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
                  language={language}
                />
              </div>
            </div>
          </main>
        );
      }
    }
  }

  const header = (
    <header className="relative z-[100] border-b border-white/8 bg-[#102018]/92 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <HeaderBrand email={email} />

          <div className="flex items-center gap-3">
            <HeaderRevierScope language={language} />
            <HeaderMenu
              role={role}
              email={email}
              isDemo={isDemo}
              language={language}
            />
          </div>
        </div>
      </div>
    </header>
  );

  return (
    <html lang={language}>
      <body>
        {isDemo ? <DemoSessionGuard /> : null}
        <AppShellGate blocked={blocked} blockedPage={blockedPage} header={header}>
          {children}
        </AppShellGate>
      </body>
    </html>
  );
}