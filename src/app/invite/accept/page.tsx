// src/app/invite/accept/page.tsx #6
import { getOptionalUser } from "@/lib/auth";
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

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const token = params.token?.trim() ?? "";

  const user = await getOptionalUser();

  if (!token) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-red-900">
            Einladung nicht gefunden
          </h1>
          <p className="mt-2 text-sm leading-6 text-red-800">
            Der Einladungslink enthält keinen gültigen Token.
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-red-900">
            Einladung nicht gefunden
          </h1>
          <p className="mt-2 text-sm leading-6 text-red-800">
            Zu diesem Link wurde keine Einladung gefunden.
          </p>
        </div>
      </main>
    );
  }

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
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Einladung annehmen
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Lege zuerst Dein Passwort fest und trete dann der eingeladenen
            Organisation bei.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium">Einladungsdetails</h2>

        <dl className="mt-4 divide-y">
          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-gray-500">Organisation</dt>
            <dd className="text-sm text-gray-900">
              {invite.organizations?.name ?? "—"}
            </dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-gray-500">Eingeladene E-Mail</dt>
            <dd className="text-sm text-gray-900">{invite.email}</dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-gray-500">Rolle</dt>
            <dd className="text-sm text-gray-900">{formatRole(invite.role)}</dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="text-sm text-gray-900">{invite.status}</dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-gray-500">Invited at</dt>
            <dd className="text-sm text-gray-900">
              {formatDateTime(invite.invited_at)}
            </dd>
          </div>

          <div className="grid gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-gray-500">Expires at</dt>
            <dd className="text-sm text-gray-900">
              {formatDateTime(invite.expires_at)}
            </dd>
          </div>
        </dl>
      </section>

      {expired ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-medium text-red-900">Einladung abgelaufen</h2>
          <p className="mt-2 text-sm leading-6 text-red-800">
            Diese Einladung ist nicht mehr gültig. Bitte fordere eine neue
            Einladung an.
          </p>
        </section>
      ) : null}

      {invalidStatus ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-medium text-amber-900">
            Einladung nicht mehr offen
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900/80">
            Diese Einladung hat bereits den Status <strong>{invite.status}</strong>{" "}
            und kann nicht erneut angenommen werden.
          </p>
        </section>
      ) : null}

      {!expired && !invalidStatus && !user ? (
        <>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium">Passwort festlegen</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Bitte zuerst ein Passwort festlegen. Danach wird Dein Account
              angelegt, die Einladung angenommen und Du wirst eingeloggt.
            </p>

            <div className="mt-6">
              <InviteAcceptForm token={token} inviteEmail={invite.email} />
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-medium text-amber-900">Passworthinweis</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900/80">
              Das Passwort muss mindestens 8 Zeichen lang sein.
            </p>
          </section>
        </>
      ) : null}

      {!expired && !invalidStatus && user && !emailMatches ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-medium text-red-900">
            Falscher Benutzer eingeloggt
          </h2>
          <p className="mt-2 text-sm leading-6 text-red-800">
            Diese Einladung ist für <strong>{invite.email}</strong>. Aktuell
            bist Du aber als <strong>{currentEmail ?? "unbekannt"}</strong>{" "}
            eingeloggt.
          </p>
          <p className="mt-2 text-sm leading-6 text-red-800">
            Bitte logge Dich mit der eingeladenen E-Mail-Adresse ein.
          </p>
        </section>
      ) : null}

      {!expired && !invalidStatus && user && emailMatches ? (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium">Bereits eingeloggt</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Du bist bereits mit der eingeladenen E-Mail-Adresse eingeloggt und
            kannst diese Einladung jetzt annehmen.
          </p>

          <AcceptExistingInviteButton token={token} />
        </section>
      ) : null}
    </main>
  );
}