// src/app/orga/page.tsx #6
import Link from "next/link";
import { cookies } from "next/headers";
import { requirePathAccess, canAccessPath } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import { getBillingPlan } from "@/lib/billing/plans";
import {
  resolveSubscriptionState,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionPolicy";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";

type SubscriptionRow = {
  plan_key: "starter" | "pro" | "enterprise";
  status: SubscriptionStatus;
  billing_cycle: "monthly" | "yearly";
  trial_ends_at: string | null;
  current_period_end: string | null;
  price_amount_cents: number;
  price_currency: string;
  max_cameras: number;
  max_members: number;
};

function formatDate(value: string | null, language: AppLanguage) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "de-DE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatMoney(
  amountCents: number,
  currency: string,
  language: AppLanguage
) {
  return new Intl.NumberFormat(language === "en" ? "en-GB" : "de-DE", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function billingCycleLabel(
  cycle: "monthly" | "yearly",
  language: AppLanguage
) {
  if (language === "en") {
    return cycle === "yearly" ? "Yearly" : "Monthly";
  }
  return cycle === "yearly" ? "Jährlich" : "Monatlich";
}

function planLabel(planKey: SubscriptionRow["plan_key"]) {
  switch (planKey) {
    case "starter":
      return "Starter";
    case "pro":
      return "Pro";
    case "enterprise":
      return "Enterprise";
    default:
      return planKey;
  }
}

function formatPlanPrice(
  subscription: SubscriptionRow,
  language: AppLanguage
) {
  const plan = getBillingPlan(subscription.plan_key);

  if (subscription.price_amount_cents > 0) {
    return formatMoney(
      subscription.price_amount_cents,
      subscription.price_currency,
      language
    );
  }

  if (!plan) return "—";

  const price =
    subscription.billing_cycle === "yearly"
      ? plan.yearlyPriceCents
      : plan.monthlyPriceCents;

  if (price != null) {
    return formatMoney(price, subscription.price_currency, language);
  }

  return subscription.plan_key === "enterprise"
    ? language === "en"
      ? "Custom"
      : "Individuell"
    : language === "en"
      ? "Not yet defined"
      : "Noch nicht festgelegt";
}

function statusUi(status: SubscriptionStatus) {
  switch (status) {
    case "trialing":
      return {
        label: "Trialing",
        badgeClass: "border-sky-300/25 bg-sky-300/10 text-sky-200",
      };
    case "active":
      return {
        label: "Active",
        badgeClass: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
      };
    case "past_due":
      return {
        label: "Past Due",
        badgeClass: "border-amber-300/25 bg-amber-300/10 text-amber-200",
      };
    case "canceled":
      return {
        label: "Canceled",
        badgeClass: "border-orange-300/25 bg-orange-300/10 text-orange-200",
      };
    case "expired":
      return {
        label: "Expired",
        badgeClass: "border-rose-300/25 bg-rose-300/10 text-rose-200",
      };
    default:
      return {
        label: status,
        badgeClass: "border-white/10 bg-white/5 text-white/72",
      };
  }
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        eyebrow: "Organization",
        title: "Organization",
        intro:
          "Overview of account, grounds, members and — where permitted — the subscription of the active organization.",
        statGroundsTitle: "Grounds",
        statGroundsText: "Current ground structure of this organization.",
        statMembersTitle: "Members",
        statMembersText: (openInvitesCount: number) =>
          `${openInvitesCount} open invites`,
        statCamerasTitle: "Cameras",
        statCamerasTextWithPlan: (count: number, max: number) =>
          `${count} / ${max} in active plan`,
        statCamerasTextNoPlan: "No subscription found",
        statSubscriptionTitle: "Subscription",
        statSubscriptionTextWithPlan: (status: string, price: string) =>
          `${status} · ${price} incl. VAT`,
        statSubscriptionTextNoPlan: "No subscription stored",
        myAccountTitle: "My Account",
        myAccountText: "Active organizational context and your role.",
        openMyAccount: "Open my account",
        organizationLabel: "Organization",
        slugLabel: "Slug",
        roleLabel: "Your role",
        emailLabel: "Email",
        groundsTitle: "Grounds",
        groundsText:
          "Operational area and ground structure of the organization.",
        openGrounds: "Open grounds",
        newGround: "New ground",
        groundsStatus: "Status",
        groundsStatusText:
          "Grounds are created and administratively managed in organization settings.",
        membersTitle: "Members",
        membersText: "Team access, roles and open invitations.",
        openMembers: "Open members",
        inviteMember: "Invite member",
        activeMembers: "Active members",
        openInvites: "Open invites",
        countedMembers: (usage: number, max: number) =>
          `Currently counted: ${usage} of ${max} members.`,
        subscriptionTitle: "Subscription",
        subscriptionText: "Commercial setup, plan and current usage limits.",
        openSubscription: "Open subscription",
        noSubscription: "No subscription was found for this organization.",
        priceTitle: "Price",
        usageTitle: "Usage",
        camerasLabel: "Cameras",
        membersLabel: "Members",
        trialEnds: "Trial ends",
        periodUntil: "Current period until",
      }
    : {
        eyebrow: "Organisation",
        title: "Organisation",
        intro:
          "Überblick über Konto, Reviere, Mitglieder und – sofern freigegeben – das Abo der aktiven Organisation.",
        statGroundsTitle: "Reviere",
        statGroundsText: "Aktuelle Revier-Struktur dieser Organisation.",
        statMembersTitle: "Mitglieder",
        statMembersText: (openInvitesCount: number) =>
          `${openInvitesCount} offene Invites`,
        statCamerasTitle: "Kameras",
        statCamerasTextWithPlan: (count: number, max: number) =>
          `${count} / ${max} im aktiven Plan`,
        statCamerasTextNoPlan: "Kein Abo gefunden",
        statSubscriptionTitle: "Subscription",
        statSubscriptionTextWithPlan: (status: string, price: string) =>
          `${status} · ${price} inkl. MwSt.`,
        statSubscriptionTextNoPlan: "Kein Abo hinterlegt",
        myAccountTitle: "Mein Konto",
        myAccountText: "Aktiver Organisationskontext und Deine Rolle.",
        openMyAccount: "Mein Konto öffnen",
        organizationLabel: "Organization",
        slugLabel: "Slug",
        roleLabel: "Deine Rolle",
        emailLabel: "E-Mail",
        groundsTitle: "Reviere",
        groundsText:
          "Fachliche Flächen- und Revierstruktur der Organization.",
        openGrounds: "Reviere öffnen",
        newGround: "Neues Revier",
        groundsStatus: "Status",
        groundsStatusText:
          "Reviere sind angelegt und über die Orga-Verwaltung administrierbar.",
        membersTitle: "Mitglieder",
        membersText: "Teamzugänge, Rollen und offene Einladungen.",
        openMembers: "Mitglieder öffnen",
        inviteMember: "Mitglied einladen",
        activeMembers: "Aktive Mitglieder",
        openInvites: "Offene Invites",
        countedMembers: (usage: number, max: number) =>
          `Aktuell angerechnet: ${usage} von ${max} Mitglieder.`,
        subscriptionTitle: "Subscription",
        subscriptionText:
          "Kommerzieller Rahmen, Plan und aktuelle Nutzungsgrenzen.",
        openSubscription: "Abo öffnen",
        noSubscription:
          "Für diese Organisation wurde noch kein Abo gefunden.",
        priceTitle: "Preis",
        usageTitle: "Nutzung",
        camerasLabel: "Kameras",
        membersLabel: "Mitglieder",
        trialEnds: "Trial endet",
        periodUntil: "Periode bis",
      };
}

function StatCard({
  title,
  value,
  subline,
}: {
  title: string;
  value: string;
  subline?: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="text-sm text-white/50">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      {subline ? (
        <p className="mt-2 text-sm leading-6 text-white/68">{subline}</p>
      ) : null}
    </div>
  );
}

function ActionLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 backdrop-blur-sm hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
    >
      {label}
    </Link>
  );
}

export default async function OrgaPage() {
  const ctx = await requirePathAccess("/orga");

if (!ctx.user) {
  throw new Error("Authenticated user required");
}


  const supabase = supabaseServer();
  const cookieStore = await cookies();

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const role = ctx.activeMembership.role;
  const userEmail = ctx.user.email ?? null;
  const nowIso = new Date().toISOString();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  const text = t(language);

  const [
    reviersResult,
    membersResult,
    invitesResult,
    subscriptionResult,
    camerasResult,
  ] = await Promise.all([
    supabase
      .from("reviers")
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
  ]);

  if (reviersResult.error) {
    throw new Error(`Failed to load reviers summary: ${reviersResult.error.message}`);
  }

  if (membersResult.error) {
    throw new Error(`Failed to load members summary: ${membersResult.error.message}`);
  }

  if (invitesResult.error) {
    throw new Error(`Failed to load invites summary: ${invitesResult.error.message}`);
  }

  if (subscriptionResult.error) {
    throw new Error(
      `Failed to load subscription summary: ${subscriptionResult.error.message}`
    );
  }

  if (camerasResult.error) {
    throw new Error(`Failed to load cameras summary: ${camerasResult.error.message}`);
  }

  const reviersCount = reviersResult.count ?? 0;
  const membersCount = membersResult.count ?? 0;
  const openInvitesCount = invitesResult.count ?? 0;
  const camerasCount = camerasResult.count ?? 0;
  const subscription = subscriptionResult.data;

  const resolvedSubscription = subscription
    ? resolveSubscriptionState({
        status: subscription.status,
        trialEndsAt: subscription.trial_ends_at,
        currentPeriodEnd: subscription.current_period_end,
        maxCameras: subscription.max_cameras,
        maxMembers: subscription.max_members,
        currentCameraCount: camerasCount,
        activeMemberCount: membersCount,
        openInviteCount: openInvitesCount,
      })
    : null;

  const effectiveStatus = subscription
    ? statusUi(resolvedSubscription?.effectiveStatus ?? subscription.status)
    : null;

  const planPrice = subscription ? formatPlanPrice(subscription, language) : "—";

  const canSeeSubscription = canAccessPath({
    pathname: "/orga/subscription",
    role,
    email: userEmail,
  });

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">{text.intro}</p>
        </div>
      </section>

      <section
        className={`grid gap-4 md:grid-cols-2 ${
          canSeeSubscription ? "xl:grid-cols-4" : "xl:grid-cols-3"
        }`}
      >
        <StatCard
          title={text.statGroundsTitle}
          value={String(reviersCount)}
          subline={text.statGroundsText}
        />
        <StatCard
          title={text.statMembersTitle}
          value={String(membersCount)}
          subline={text.statMembersText(openInvitesCount)}
        />
        <StatCard
          title={text.statCamerasTitle}
          value={String(camerasCount)}
          subline={
            subscription
              ? text.statCamerasTextWithPlan(camerasCount, subscription.max_cameras)
              : text.statCamerasTextNoPlan
          }
        />
        {canSeeSubscription ? (
          <StatCard
            title={text.statSubscriptionTitle}
            value={subscription ? planLabel(subscription.plan_key) : "—"}
            subline={
              subscription
                ? text.statSubscriptionTextWithPlan(
                    effectiveStatus?.label ?? "—",
                    planPrice
                  )
                : text.statSubscriptionTextNoPlan
            }
          />
        ) : null}
      </section>

      <section
        className={`grid gap-4 ${
          canSeeSubscription ? "xl:grid-cols-2" : "xl:grid-cols-3"
        }`}
      >
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">{text.myAccountTitle}</h2>
              <p className="mt-1 text-sm text-white/65">{text.myAccountText}</p>
            </div>
            <ActionLink href="/orga/account" label={text.openMyAccount} />
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-white/45">{text.organizationLabel}</dt>
              <dd className="text-right font-medium text-white">
                {organization.name}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-white/45">{text.slugLabel}</dt>
              <dd className="text-right font-medium text-white">
                {organization.slug}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-white/45">{text.roleLabel}</dt>
              <dd className="text-right font-medium capitalize text-white">
                {role}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-white/45">{text.emailLabel}</dt>
              <dd className="text-right font-medium text-white">
                {userEmail ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">{text.groundsTitle}</h2>
              <p className="mt-1 text-sm text-white/65">{text.groundsText}</p>
            </div>
            <div className="flex gap-2">
              <ActionLink href="/orga/reviere" label={text.openGrounds} />
              <ActionLink href="/orga/reviere/new" label={text.newGround} />
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-white/45">
              {text.groundsStatus}
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {reviersCount}
            </div>
            <p className="mt-2 text-sm leading-6 text-white/68">
              {text.groundsStatusText}
            </p>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">{text.membersTitle}</h2>
              <p className="mt-1 text-sm text-white/65">{text.membersText}</p>
            </div>
            <div className="flex gap-2">
              <ActionLink href="/orga/members" label={text.openMembers} />
              <ActionLink href="/orga/members/invite" label={text.inviteMember} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                {text.activeMembers}
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {membersCount}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                {text.openInvites}
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {openInvitesCount}
              </div>
            </div>
          </div>

          {subscription && resolvedSubscription ? (
            <p className="mt-4 text-sm text-white/68">
              {text.countedMembers(
                resolvedSubscription.currentMemberUsage,
                subscription.max_members
              )}
            </p>
          ) : null}
        </div>

        {canSeeSubscription ? (
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-white">
                  {text.subscriptionTitle}
                </h2>
                <p className="mt-1 text-sm text-white/65">
                  {text.subscriptionText}
                </p>
              </div>
              <ActionLink
                href="/orga/subscription"
                label={text.openSubscription}
              />
            </div>

            {!subscription ? (
              <div className="mt-6 rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
                {text.noSubscription}
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <div className="text-2xl font-semibold text-white">
                    {planLabel(subscription.plan_key)}
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${effectiveStatus?.badgeClass}`}
                  >
                    {effectiveStatus?.label}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                      {text.priceTitle}
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {planPrice}
                    </div>
                    <p className="mt-1 text-sm text-white/68">
                      {billingCycleLabel(subscription.billing_cycle, language)} ·{" "}
                      {language === "en" ? "incl. VAT" : "inkl. MwSt."}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                      {text.usageTitle}
                    </div>
                    <div className="mt-2 text-sm font-medium text-white">
                      {text.camerasLabel}: {camerasCount} / {subscription.max_cameras}
                    </div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {text.membersLabel}:{" "}
                      {resolvedSubscription?.currentMemberUsage ?? 0} /{" "}
                      {subscription.max_members}
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-white/68">
                  {text.trialEnds}: {formatDate(subscription.trial_ends_at, language)} ·{" "}
                  {text.periodUntil}:{" "}
                  {formatDate(subscription.current_period_end, language)}
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
