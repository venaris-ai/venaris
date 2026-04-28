// src/app/invite/accept/page.tsx #10
import { cookies } from "next/headers";
import { getOptionalUser } from "@/lib/auth";
import {
  LOCALE_COOKIE,
  normalizeLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  DEFAULT_APP_TIME_ZONE,
  formatAppDateTime,
} from "@/lib/dateTime";
import { supabaseServer } from "@/lib/supabaseServer";
import InviteAcceptForm from "./InviteAcceptForm";
import AcceptExistingInviteButton from "./AcceptExistingInviteButton";

type InviteRow = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string;
  invited_at: string;
  accepted_at: string | null;
  expires_at: string | null;
  language: AppLanguage;
  organizations: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

function formatRole(role: string) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  if (role === "viewer") return "Viewer";
  return role;
}

function formatDateTime(value: string | null, language: AppLanguage) {
  return formatAppDateTime(value, language, DEFAULT_APP_TIME_ZONE);
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        sectionEyebrow: "Invite",
        pageTitle: "Accept invitation",
        pageText:
          "Set your password first and then join the invited organization.",
        missingTitle: "Invitation not found",
        missingText: "The invitation link does not contain a valid token.",
        notFoundText: "No invitation was found for this link.",
        detailsTitle: "Invitation details",
        orgLabel: "Organization",
        emailLabel: "Invited email",
        roleLabel: "Role",
        statusLabel: "Status",
        invitedAtLabel: "Invited at",
        expiresAtLabel: "Expires at",
        expiredTitle: "Invitation expired",
        expiredText:
          "This invitation is no longer valid. Please request a new invitation.",
        invalidTitle: "Invitation is no longer open",
        invalidText: "This invitation already has the status",
        invalidTextSuffix: "and cannot be accepted again.",
        setPasswordTitle: "Set password",
        setPasswordText:
          "Please set your password first. Your account will then be created, the invitation accepted and you will be signed in.",
        passwordHintTitle: "Password note",
        passwordHintText: "Your password must be at least 8 characters long.",
        wrongUserTitle: "Wrong user signed in",
        wrongUserTextA: "This invitation is for",
        wrongUserTextB: "but you are currently signed in as",
        wrongUserTextC:
          "Please sign in with the invited email address.",
        unknownUser: "unknown",
        alreadyLoggedInTitle: "Already signed in",
        alreadyLoggedInText:
          "You are already signed in with the invited email address and can accept this invitation now.",
      }
    : {
        sectionEyebrow: "Invite",
        pageTitle: "Einladung annehmen",
        pageText:
          "Lege zuerst Dein Passwort fest und trete dann der eingeladenen Organisation bei.",
        missingTitle: "Einladung nicht gefunden",
        missingText: "Der Einladungslink enthält keinen gültigen Token.",
        notFoundText: "Zu diesem Link wurde keine Einladung gefunden.",
        detailsTitle: "Einladungsdetails",
        orgLabel: "Organisation",
        emailLabel: "Eingeladene E-Mail",
        roleLabel: "Rolle",
        statusLabel: "Status",
        invitedAtLabel: "Eingeladen am",
        expiresAtLabel: "Läuft ab am",
        expiredTitle: "Einladung abgelaufen",
        expiredText:
          "Diese Einladung ist nicht mehr gültig. Bitte fordere eine neue Einladung an.",
        invalidTitle: "Einladung nicht mehr offen",
        invalidText: "Diese Einladung hat bereits den Status",
        invalidTextSuffix: "und kann nicht erneut angenommen werden.",
        setPasswordTitle: "Passwort festlegen",
        setPasswordText:
          "Bitte zuerst ein Passwort festlegen. Danach wird Dein Account angelegt, die Einladung angenommen und Du wirst eingeloggt.",
        passwordHintTitle: "Passworthinweis",
        passwordHintText: "Das Passwort muss mindestens 8 Zeichen lang sein.",
        wrongUserTitle: "Falscher Benutzer eingeloggt",
        wrongUserTextA: "Diese Einladung ist für",
        wrongUserTextB: "Aktuell bist Du aber als",
        wrongUserTextC:
          "Bitte logge Dich mit der eingeladenen E-Mail-Adresse ein.",
        unknownUser: "unbekannt",
        alreadyLoggedInTitle: "Bereits eingeloggt",
        alreadyLoggedInText:
          "Du bist bereits mit der eingeladenen E-Mail-Adresse eingeloggt und kannst diese Einladung jetzt annehmen.",
      };
}

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const token = params.token?.trim() ?? "";

  const cookieStore = await cookies();
  const fallbackLanguage = normalizeLanguage(
    cookieStore.get(LOCALE_COOKIE)?.value
  );

  const fallbackText = t(fallbackLanguage);
  const user = await getOptionalUser();

  if (!token) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-[28px] border border-rose-300/20 bg-rose-300/10 p-6 backdrop-blur-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-rose-100">
            {fallbackText.missingTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-rose-100/85">
            {fallbackText.missingText}
          </p>
        </div>
      </main>
    );
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("organization_invites")
    .select(
      `
      id,
      email,
      role,
      status,
      token,
      invited_at,
      accepted_at,
      expires_at,
      language,
      organizations (
        id,
        name,
        slug
      )
    `
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load invite: ${error.message}`);
  }

  const invite = (data ?? null) as InviteRow | null;

  if (!invite) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-[28px] border border-rose-300/20 bg-rose-300/10 p-6 backdrop-blur-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-rose-100">
            {fallbackText.missingTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-rose-100/85">
            {fallbackText.notFoundText}
          </p>
        </div>
      </main>
    );
  }

  const language = normalizeLanguage(invite.language);
  const text = t(language);

  const expired = isExpired(invite.expires_at);
  const invalidStatus =
    invite.status === "accepted" ||
    invite.status === "revoked" ||
    invite.status === "expired";

  let currentEmail: string | null = null;

  if (user) {
    const authResult = await supabase.auth.admin.getUserById(user.id);
    if (!authResult.error && authResult.data.user) {
      currentEmail = authResult.data.user.email ?? null;
    }
  }

  const emailMatches =
    !!currentEmail &&
    currentEmail.trim().toLowerCase() === invite.email.trim().toLowerCase();

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.sectionEyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.pageTitle}
          </h1>
          <p className="mt-2 text-sm text-white/68">{text.pageText}</p>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <h2 className="text-lg font-medium text-white">{text.detailsTitle}</h2>

        <dl className="mt-4 divide-y divide-white/8">
          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-white/45">{text.orgLabel}</dt>
            <dd className="text-sm text-white">
              {invite.organizations?.name ?? "—"}
            </dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-white/45">{text.emailLabel}</dt>
            <dd className="text-sm text-white">{invite.email}</dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-white/45">{text.roleLabel}</dt>
            <dd className="text-sm text-white">{formatRole(invite.role)}</dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-white/45">{text.statusLabel}</dt>
            <dd className="text-sm text-white">{invite.status}</dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-white/45">{text.invitedAtLabel}</dt>
            <dd className="text-sm text-white">
              {formatDateTime(invite.invited_at, language)}
            </dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-white/45">{text.expiresAtLabel}</dt>
            <dd className="text-sm text-white">
              {formatDateTime(invite.expires_at, language)}
            </dd>
          </div>
        </dl>
      </section>

      {expired ? (
        <section className="rounded-[28px] border border-rose-300/20 bg-rose-300/10 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-rose-100">{text.expiredTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-rose-100/85">
            {text.expiredText}
          </p>
        </section>
      ) : null}

      {invalidStatus ? (
        <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-amber-100">
            {text.invalidTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/85">
            {text.invalidText} <strong>{invite.status}</strong> {text.invalidTextSuffix}
          </p>
        </section>
      ) : null}

      {!expired && !invalidStatus && !user ? (
        <>
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h2 className="text-lg font-medium text-white">{text.setPasswordTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-white/68">
              {text.setPasswordText}
            </p>

            <div className="mt-6">
              <InviteAcceptForm
                token={token}
                inviteEmail={invite.email}
                language={language}
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6 backdrop-blur-sm">
            <h2 className="text-lg font-medium text-amber-100">
              {text.passwordHintTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-100/85">
              {text.passwordHintText}
            </p>
          </section>
        </>
      ) : null}

      {!expired && !invalidStatus && user && !emailMatches ? (
        <section className="rounded-[28px] border border-rose-300/20 bg-rose-300/10 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-rose-100">
            {text.wrongUserTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-rose-100/85">
            {text.wrongUserTextA} <strong>{invite.email}</strong>.{" "}
            {text.wrongUserTextB} <strong>{currentEmail ?? text.unknownUser}</strong>.
          </p>
          <p className="mt-2 text-sm leading-6 text-rose-100/85">
            {text.wrongUserTextC}
          </p>
        </section>
      ) : null}

      {!expired && !invalidStatus && user && emailMatches ? (
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white">
            {text.alreadyLoggedInTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/68">
            {text.alreadyLoggedInText}
          </p>

          <AcceptExistingInviteButton token={token} language={language} />
        </section>
      ) : null}
    </main>
  );
}