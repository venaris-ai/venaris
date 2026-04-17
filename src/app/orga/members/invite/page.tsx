// src/app/orga/members/invite/page.tsx #17
import Link from "next/link";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requirePathAccess } from "@/lib/authz";
import { redirectIfDemoWrite } from "@/lib/auth";

import { supabaseServer } from "@/lib/supabaseServer";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import SubmitButton from "@/components/SubmitButton";
import {
  canInviteMember,
  resolveSubscriptionState,
} from "@/lib/billing/subscriptionPolicy";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";

type SubscriptionPolicyRow = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
  max_cameras: number;
  max_members: number;
};

async function resolveUiLanguageForProtectedPath(pathname: string) {
  const ctx = await requirePathAccess(pathname);

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const supabase = supabaseServer();
  const cookieStore = await cookies();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  return { ctx, supabase, language };
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        invalidEmail: "Please enter a valid email address.",
        invalidRole: "Invalid role.",
        invalidLanguage: "Invalid language.",
        invalidExpiry: "Expiry must be between 1 and 90 days.",
        openInviteExists: "There is already an open invitation for this email address.",
        noSubscription: "No subscription was found for this organization.",
        inviteCreatedMailFailedPrefix:
          "Invitation was created, but email delivery failed:",
        eyebrow: "Invite Member",
        title: "Invite member",
        intro: "Create a new invitation for the active organization here.",
        demoReadOnly: "Demo mode: changes are disabled.",
        memberUsageTitle: "Member usage",
        usageComposition: (active: number, open: number) =>
          `Composition: ${active} active members + ${open} open invites`,
        trialExpiredHint:
          "Note: the trial has already expired logically and is effectively treated as `expired`.",
        emailLabel: "Email *",
        roleLabel: "Role",
        validDaysLabel: "Valid for (days)",
        languageLabel: "Language",
        german: "Deutsch",
        english: "English",
        inviteBlocked: "Invitation blocked",
        demoMode: "Demo mode",
        createInvite: "Create invitation",
        saving: "Saving...",
        cancel: "Cancel",
        noteTitle: "Important note",
        noteDemo:
          "This is a demo account. Records cannot be removed, added or changed.",
        noteNormal:
          "New invitations are sent by email. The recipient can then create their account and accept the invitation directly.",
        roleOverviewTitle: "Role overview",
        roleOverviewText:
          "This overview helps with choosing the appropriate role for new members.",
        roleCol: "Role",
        meaningCol: "Meaning",
      }
    : {
        invalidEmail: "Bitte eine gültige E-Mail-Adresse eingeben.",
        invalidRole: "Ungültige Rolle.",
        invalidLanguage: "Ungültige Sprache.",
        invalidExpiry: "Die Gültigkeitsdauer muss zwischen 1 und 90 Tagen liegen.",
        openInviteExists: "Für diese E-Mail existiert bereits eine offene Einladung.",
        noSubscription: "Für diese Organisation wurde kein Abo gefunden.",
        inviteCreatedMailFailedPrefix:
          "Einladung wurde angelegt, aber E-Mail-Versand fehlgeschlagen:",
        eyebrow: "Mitglied einladen",
        title: "Mitglied einladen",
        intro: "Lege hier eine neue Einladung für die aktive Organisation an.",
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        memberUsageTitle: "Mitglieder-Nutzung",
        usageComposition: (active: number, open: number) =>
          `Zusammensetzung: ${active} aktive Mitglieder + ${open} offene Einladungen`,
        trialExpiredHint:
          "Hinweis: Der Trial ist fachlich bereits abgelaufen und wird effektiv als `expired` behandelt.",
        emailLabel: "E-Mail *",
        roleLabel: "Rolle",
        validDaysLabel: "Gültig für (Tage)",
        languageLabel: "Sprache",
        german: "Deutsch",
        english: "Englisch",
        inviteBlocked: "Einladung gesperrt",
        demoMode: "Demo-Modus",
        createInvite: "Einladung anlegen",
        saving: "Speichern...",
        cancel: "Abbrechen",
        noteTitle: "Wichtiger Hinweis",
        noteDemo:
          "Das ist ein Demo-Account. Datensätze können weder entfernt noch hinzugefügt oder geändert werden.",
        noteNormal:
          "Neue Einladungen werden per E-Mail verschickt. Der Empfänger kann danach seinen Account anlegen und die Einladung direkt annehmen.",
        roleOverviewTitle: "Rollenübersicht",
        roleOverviewText:
          "Diese Übersicht hilft bei der Auswahl der passenden Rolle für neue Mitglieder.",
        roleCol: "Rolle",
        meaningCol: "Bedeutung",
      };
}

function getRoleDescriptions(language: AppLanguage) {
  return language === "en"
    ? [
        {
          role: "Owner",
          text: "Full administrative access to organization, members, grounds and later subscription functions.",
        },
        {
          role: "Admin",
          text: "Operational administration of the platform without necessarily having the same ownership role as an owner.",
        },
        {
          role: "Member",
          text: "Regular working access for daily use within the shared organizational structure.",
        },
        {
          role: "Viewer",
          text: "Read-only access for users who should see content but not change administrative settings.",
        },
      ]
    : [
        {
          role: "Owner",
          text: "Voller administrativer Zugriff auf Organisation, Mitglieder, Reviere und spätere Abo-Funktionen.",
        },
        {
          role: "Admin",
          text: "Operative Verwaltung der Plattform, ohne zwingend dieselbe Eigentümerrolle wie ein Owner zu haben.",
        },
        {
          role: "Member",
          text: "Regulärer Arbeitszugang für die tägliche Nutzung innerhalb der freigegebenen Organisationsstruktur.",
        },
        {
          role: "Viewer",
          text: "Lesender Zugriff für Nutzer, die Inhalte sehen, aber nicht administrativ verändern sollen.",
        },
      ];
}

async function createInvite(formData: FormData) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    "/orga/members/invite"
  );
  redirectIfDemoWrite(ctx, "/orga/members/invite?demo_read_only=1");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const invitedByUserId = ctx.user.id;
  const text = t(language);

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const inviteRole = String(formData.get("role") ?? "member").trim() || "member";
  const expiresInDaysRaw = String(formData.get("expires_in_days") ?? "14").trim();
  const inviteLanguageRaw = String(formData.get("language") ?? "").trim();

  if (!email || !email.includes("@")) {
    throw new Error(text.invalidEmail);
  }

  if (!["owner", "admin", "member", "viewer"].includes(inviteRole)) {
    throw new Error(text.invalidRole);
  }

  if (!["de", "en"].includes(inviteLanguageRaw)) {
    throw new Error(text.invalidLanguage);
  }

  const inviteLanguage = inviteLanguageRaw as AppLanguage;
  const expiresInDays = Number(expiresInDaysRaw);

  if (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) {
    throw new Error(text.invalidExpiry);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.round(expiresInDays));

  const token = randomBytes(24).toString("hex");
  const nowIso = new Date().toISOString();

  const { data: existingPending, error: existingPendingError } = await supabase
    .from("organization_invites")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPendingError) {
    throw new Error(`Failed to check existing invites: ${existingPendingError.message}`);
  }

  if (existingPending) {
    throw new Error(text.openInviteExists);
  }

  const [subscriptionResult, memberCountResult, inviteCountResult] = await Promise.all([
    supabase
      .from("organization_subscriptions")
      .select("status,trial_ends_at,current_period_end,max_cameras,max_members")
      .eq("organization_id", organization.id)
      .maybeSingle<SubscriptionPolicyRow>(),

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
    throw new Error(`Failed to load subscription limits: ${subscriptionResult.error.message}`);
  }

  if (!subscriptionResult.data) {
    throw new Error(text.noSubscription);
  }

  if (memberCountResult.error) {
    throw new Error(`Failed to load member usage: ${memberCountResult.error.message}`);
  }

  if (inviteCountResult.error) {
    throw new Error(`Failed to load invite usage: ${inviteCountResult.error.message}`);
  }

  const invitePolicy = canInviteMember({
    status: subscriptionResult.data.status,
    trialEndsAt: subscriptionResult.data.trial_ends_at,
    currentPeriodEnd: subscriptionResult.data.current_period_end,
    maxCameras: subscriptionResult.data.max_cameras,
    maxMembers: subscriptionResult.data.max_members,
    currentCameraCount: 0,
    activeMemberCount: memberCountResult.count ?? 0,
    openInviteCount: inviteCountResult.count ?? 0,
    language,
  });

  if (!invitePolicy.allowed) {
    throw new Error(invitePolicy.message);
  }

  const { data: inviteRow, error: insertError } = await supabase
    .from("organization_invites")
    .insert({
      organization_id: organization.id,
      email,
      role: inviteRole,
      status: "pending",
      token,
      invited_by_user_id: invitedByUserId,
      expires_at: expiresAt.toISOString(),
      language: inviteLanguage,
    })
    .select("id")
    .single();

  if (insertError || !inviteRow) {
    throw new Error(`Failed to create invite: ${insertError?.message ?? "Unknown error"}`);
  }

  try {
    const mailResult = await sendInviteEmail({
      to: email,
      organizationName: organization.name,
      role: inviteRole,
      token,
      expiresAt: expiresAt.toISOString(),
      language: inviteLanguage,
    });

    const { error: updateMailError } = await supabase
      .from("organization_invites")
      .update({
        provider: mailResult.provider,
        provider_message_id: mailResult.providerMessageId,
        email_sent_at: new Date().toISOString(),
        email_error: null,
      })
      .eq("id", inviteRow.id);

    if (updateMailError) {
      throw new Error(
        `Invite was created, but provider metadata could not be saved: ${updateMailError.message}`
      );
    }
  } catch (mailError) {
    const message =
      mailError instanceof Error ? mailError.message : "Unknown email delivery error";

    await supabase
      .from("organization_invites")
      .update({
        provider: "resend",
        provider_message_id: null,
        email_sent_at: null,
        email_error: message,
      })
      .eq("id", inviteRow.id);

    throw new Error(`${text.inviteCreatedMailFailedPrefix} ${message}`);
  }

  revalidatePath("/orga/members");
  revalidatePath("/orga/subscription");
  redirect("/orga/members?invited=1");
}

export default async function InviteMemberPage({
  searchParams,
}: {
  searchParams?: Promise<{ demo_read_only?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const demoReadOnly = params.demo_read_only === "1";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    "/orga/members/invite"
  );

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const isDemo = ctx.isDemo;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const nowIso = new Date().toISOString();
  const text = t(language);
  const roleDescriptions = getRoleDescriptions(language);

  const [subscriptionResult, memberCountResult, inviteCountResult] = await Promise.all([
    supabase
      .from("organization_subscriptions")
      .select("status,trial_ends_at,current_period_end,max_cameras,max_members")
      .eq("organization_id", organization.id)
      .maybeSingle<SubscriptionPolicyRow>(),

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
      `Failed to load subscription member limit: ${subscriptionResult.error.message}`
    );
  }

  if (!subscriptionResult.data) {
    throw new Error(text.noSubscription);
  }

  if (memberCountResult.error) {
    throw new Error(`Failed to load member usage: ${memberCountResult.error.message}`);
  }

  if (inviteCountResult.error) {
    throw new Error(`Failed to load invite usage: ${inviteCountResult.error.message}`);
  }

  const policyInput = {
    status: subscriptionResult.data.status,
    trialEndsAt: subscriptionResult.data.trial_ends_at,
    currentPeriodEnd: subscriptionResult.data.current_period_end,
    maxCameras: subscriptionResult.data.max_cameras,
    maxMembers: subscriptionResult.data.max_members,
    currentCameraCount: 0,
    activeMemberCount: memberCountResult.count ?? 0,
    openInviteCount: inviteCountResult.count ?? 0,
    language,
  } as const;

  const resolvedState = resolveSubscriptionState(policyInput);
  const invitePolicy = canInviteMember(policyInput);
  const usagePercent =
    subscriptionResult.data.max_members > 0
      ? Math.min(
          (resolvedState.currentMemberUsage / subscriptionResult.data.max_members) * 100,
          100
        )
      : 0;

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
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            {text.intro}
          </p>
        </div>
      </section>

      {demoReadOnly ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">
            {text.demoReadOnly}
          </p>
        </section>
      ) : null}

      <section
        className={`rounded-[28px] border p-5 backdrop-blur-sm ${
          invitePolicy.allowed
            ? "border-sky-300/20 bg-sky-300/10"
            : "border-rose-300/20 bg-rose-300/10"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              className={`text-base font-semibold ${
                invitePolicy.allowed ? "text-sky-100" : "text-rose-100"
              }`}
            >
              {text.memberUsageTitle}
            </h2>
            <p
              className={`mt-1 text-sm leading-6 ${
                invitePolicy.allowed ? "text-sky-100/85" : "text-rose-100/85"
              }`}
            >
              {invitePolicy.message}
            </p>
            <p
              className={`mt-1 text-xs ${
                invitePolicy.allowed ? "text-sky-100/70" : "text-rose-100/70"
              }`}
            >
              {text.usageComposition(
                policyInput.activeMemberCount,
                policyInput.openInviteCount
              )}
            </p>
          </div>

          <div
            className={`rounded-[14px] border px-3 py-2 text-sm font-medium ${
              invitePolicy.allowed
                ? "border-sky-300/25 bg-white/5 text-sky-100"
                : "border-rose-300/25 bg-white/5 text-rose-100"
            }`}
          >
            {resolvedState.currentMemberUsage} / {subscriptionResult.data.max_members}
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div
            className={`h-2 rounded-full ${
              invitePolicy.allowed ? "bg-sky-300" : "bg-rose-300"
            }`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>

        {resolvedState.effectiveStatus !== subscriptionResult.data.status ? (
          <p className="mt-3 text-xs text-rose-200">
            {text.trialExpiredHint}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm xl:col-span-2">
          <form action={createInvite} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.emailLabel}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  disabled={!invitePolicy.allowed || isDemo}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="role"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.roleLabel}
                </label>
                <select
                  id="role"
                  name="role"
                  defaultValue="member"
                  disabled={!invitePolicy.allowed || isDemo}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="member" className="bg-[#102018] text-white">
                    Member
                  </option>
                  <option value="viewer" className="bg-[#102018] text-white">
                    Viewer
                  </option>
                  <option value="admin" className="bg-[#102018] text-white">
                    Admin
                  </option>
                  <option value="owner" className="bg-[#102018] text-white">
                    Owner
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="expires_in_days"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.validDaysLabel}
                </label>
                <input
                  id="expires_in_days"
                  name="expires_in_days"
                  type="number"
                  min="1"
                  max="90"
                  step="1"
                  defaultValue="14"
                  disabled={!invitePolicy.allowed || isDemo}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="language"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  {text.languageLabel}
                </label>
                <select
                  id="language"
                  name="language"
                  defaultValue={language}
                  disabled={!invitePolicy.allowed || isDemo}
                  className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="de" className="bg-[#102018] text-white">
                    {text.german}
                  </option>
                  <option value="en" className="bg-[#102018] text-white">
                    {text.english}
                  </option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton
                idleLabel={
                  !invitePolicy.allowed
                    ? text.inviteBlocked
                    : isDemo
                      ? text.demoMode
                      : text.createInvite
                }
                pendingLabel={text.saving}
              />

              <Link
                href="/orga/members"
                className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
              >
                {text.cancel}
              </Link>
            </div>
          </form>
        </section>

        <aside className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-amber-100">{text.noteTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">
            {isDemo ? text.noteDemo : text.noteNormal}
          </p>
        </aside>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="text-lg font-medium text-white">{text.roleOverviewTitle}</h2>
          <p className="mt-1 text-sm text-white/65">
            {text.roleOverviewText}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-white/55">
              <tr>
                <th className="px-6 py-3 font-medium">{text.roleCol}</th>
                <th className="px-6 py-3 font-medium">{text.meaningCol}</th>
              </tr>
            </thead>
            <tbody>
              {roleDescriptions.map((item) => (
                <tr key={item.role} className="border-t border-white/8 align-top">
                  <td className="px-6 py-4 font-medium text-white">
                    {item.role}
                  </td>
                  <td className="px-6 py-4 text-white/68">{item.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}