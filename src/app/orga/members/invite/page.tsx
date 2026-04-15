// src/app/orga/members/invite/page.tsx #12
import Link from "next/link";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requirePathAccess } from "@/lib/authz";
import { redirectIfDemoWrite } from "@/lib/auth";

import { supabaseServer } from "@/lib/supabaseServer";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import SubmitButton from "@/components/SubmitButton";
import {
  canInviteMember,
  resolveSubscriptionState,
} from "@/lib/billing/subscriptionPolicy";

type SubscriptionPolicyRow = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
  max_cameras: number;
  max_members: number;
};

type AppLanguage = "de" | "en";

const LOCALE_COOKIE = "venaris_locale";

function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value === "en" ? "en" : "de";
}

async function createInvite(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/members/invite");
  redirectIfDemoWrite(ctx, "/orga/members/invite?demo_read_only=1");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const invitedByUserId = ctx.user.id;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const cookieStore = await cookies();
  const inviteLanguage = normalizeLanguage(
    cookieStore.get(LOCALE_COOKIE)?.value ?? null
  );

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const inviteRole = String(formData.get("role") ?? "member").trim() || "member";
  const expiresInDaysRaw = String(formData.get("expires_in_days") ?? "14").trim();

  if (!email || !email.includes("@")) {
    throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
  }

  if (!["owner", "admin", "member", "viewer"].includes(inviteRole)) {
    throw new Error("Ungültige Rolle.");
  }

  const expiresInDays = Number(expiresInDaysRaw);

  if (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) {
    throw new Error("Expiry muss zwischen 1 und 90 Tagen liegen.");
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.round(expiresInDays));

  const token = randomBytes(24).toString("hex");

  const supabase = supabaseServer();
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
    throw new Error("Für diese E-Mail existiert bereits eine offene Einladung.");
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
    throw new Error("Für diese Organization wurde keine Subscription gefunden.");
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

    throw new Error(`Einladung wurde angelegt, aber E-Mail-Versand fehlgeschlagen: ${message}`);
  }

  revalidatePath("/orga/members");
  revalidatePath("/orga/subscription");
  redirect("/orga/members?invited=1");
}

const roleDescriptions = [
  {
    role: "Owner",
    text: "Voller administrativer Zugriff auf Organization, Members, Reviere und spätere Subscription-Funktionen.",
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

export default async function InviteMemberPage({
  searchParams,
}: {
  searchParams?: Promise<{ demo_read_only?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const demoReadOnly = params.demo_read_only === "1";

  const ctx = await requirePathAccess("/orga/members/invite");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const isDemo = ctx.isDemo;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const supabase = supabaseServer();
  const nowIso = new Date().toISOString();

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
    throw new Error("No subscription found for active organization");
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
            Invite Member
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Mitglied einladen
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            Lege hier eine neue Einladung für die aktive Organisation an.
          </p>
        </div>
      </section>

      {demoReadOnly ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">
            Demo-Modus: Änderungen sind deaktiviert.
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
              Member-Nutzung
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
              Zusammensetzung: {policyInput.activeMemberCount} aktive Members +{" "}
              {policyInput.openInviteCount} offene Invites
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
            Hinweis: Der Trial ist fachlich bereits abgelaufen und wird effektiv als
            `expired` behandelt.
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
                  E-Mail *
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
                  Rolle
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
                  Gültig für (Tage)
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
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton
                idleLabel={
                  !invitePolicy.allowed
                    ? "Einladung gesperrt"
                    : isDemo
                      ? "Demo-Modus"
                      : "Einladung anlegen"
                }
                pendingLabel="Speichert..."
              />

              <Link
                href="/orga/members"
                className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
              >
                Abbrechen
              </Link>
            </div>
          </form>
        </section>

        <aside className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-amber-100">Wichtiger Hinweis</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">
            {isDemo
              ? "Das ist ein Demo-Account. Datensätze können weder entfernt noch hinzugefügt oder geändert werden."
              : "Neue Einladungen werden per E-Mail verschickt. Der Empfänger kann danach seinen Account anlegen und die Einladung direkt annehmen."}
          </p>
        </aside>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="text-lg font-medium text-white">Rollenübersicht</h2>
          <p className="mt-1 text-sm text-white/65">
            Diese Übersicht hilft bei der Auswahl der passenden Rolle für neue Mitglieder.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-white/55">
              <tr>
                <th className="px-6 py-3 font-medium">Rolle</th>
                <th className="px-6 py-3 font-medium">Bedeutung</th>
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