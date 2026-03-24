// src/app/orga/members/page.tsx #5
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";

type MemberRow = {
  user_id: string;
  organization_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "disabled";
  created_at: string;
  accepted_at: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_at: string;
  accepted_at: string | null;
  expires_at: string | null;
  provider: string | null;
  provider_message_id: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  token: string;
};

type AuthUserInfo = {
  id: string;
  email: string | null;
  last_sign_in_at: string | null;
};

function formatRole(role: string) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  if (role === "viewer") return "Viewer";
  return role;
}

function formatMemberStatus(status: string) {
  if (status === "active") return "Active";
  if (status === "disabled") return "Disabled";
  return status;
}

function formatInviteStatus(status: string) {
  if (status === "pending") return "Pending";
  if (status === "accepted") return "Accepted";
  if (status === "revoked") return "Revoked";
  if (status === "expired") return "Expired";
  return status;
}

function formatUserId(userId: string) {
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}…${userId.slice(-6)}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDeliveryState(invite: InviteRow) {
  if (invite.email_sent_at) return "Sent";
  if (invite.email_error?.trim()) return "Failed";
  return "Not sent";
}

// src/app/orga/members/page.tsx #6-resend-debug
async function resendInvite(formData: FormData) {
  "use server";

  const ctx = await requireActiveOrganization();
  const role = ctx.activeMembership.role;

  if (role !== "owner" && role !== "admin") {
    throw new Error("[resendInvite:permission] Du hast keine Berechtigung, Einladungen erneut zu versenden.");
  }

  const organization = ctx.activeMembership.organizations;
  const inviteId = String(formData.get("invite_id") ?? "").trim();

  if (!inviteId) {
    throw new Error("[resendInvite:input] Missing invite id.");
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("organization_invites")
    .select("id,email,role,status,expires_at,token,organization_id")
    .eq("id", inviteId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (error) {
    throw new Error(`[resendInvite:load_invite] ${error.message}`);
  }

  const invite = data as
    | {
        id: string;
        email: string;
        role: "owner" | "admin" | "member" | "viewer";
        status: "pending" | "accepted" | "revoked" | "expired";
        expires_at: string | null;
        token: string;
        organization_id: string;
      }
    | null;

  if (!invite) {
    throw new Error("[resendInvite:load_invite] Invite not found.");
  }

  if (invite.status !== "pending") {
    throw new Error("[resendInvite:status] Nur pending Einladungen können erneut versendet werden.");
  }

  let mailResult:
    | {
        provider: string;
        providerMessageId: string | null;
      }
    | null = null;

  try {
    mailResult = await sendInviteEmail({
      to: invite.email,
      organizationName: organization.name,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expires_at,
    });
  } catch (mailError) {
    const message =
      mailError instanceof Error ? mailError.message : "Unknown email delivery error";

    try {
      const { error: persistError } = await supabase
        .from("organization_invites")
        .update({
          provider: "resend",
          provider_message_id: null,
          email_sent_at: null,
          email_error: message,
        })
        .eq("id", invite.id);

      if (persistError) {
        throw new Error(persistError.message);
      }
    } catch (persistFailure) {
      const persistMessage =
        persistFailure instanceof Error
          ? persistFailure.message
          : "Unknown error while saving email_error";

      throw new Error(
        `[resendInvite:email_send_failed_and_error_persist_failed] send=${message}; persist=${persistMessage}`
      );
    }

    throw new Error(`[resendInvite:email_send_failed] ${message}`);
  }

  const { error: updateError } = await supabase
    .from("organization_invites")
    .update({
      provider: mailResult.provider,
      provider_message_id: mailResult.providerMessageId,
      email_sent_at: new Date().toISOString(),
      email_error: null,
    })
    .eq("id", invite.id);

  if (updateError) {
    throw new Error(
      `[resendInvite:email_sent_but_metadata_save_failed] ${updateError.message}`
    );
  }

  revalidatePath("/orga/members");
  redirect("/orga/members?resent=1");
}













async function revokeInvite(formData: FormData) {
  "use server";

  const ctx = await requireActiveOrganization();
  const role = ctx.activeMembership.role;

  if (role !== "owner" && role !== "admin") {
    throw new Error("Du hast keine Berechtigung, Einladungen zu widerrufen.");
  }

  const organization = ctx.activeMembership.organizations;
  const inviteId = String(formData.get("invite_id") ?? "").trim();

  if (!inviteId) {
    throw new Error("Missing invite id.");
  }

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("organization_invites")
    .update({
      status: "revoked",
    })
    .eq("id", inviteId)
    .eq("organization_id", organization.id)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to revoke invite: ${error.message}`);
  }

  revalidatePath("/orga/members");
  redirect("/orga/members?revoked=1");
}

export default async function OrgaMembersPage({
  searchParams,
}: {
  searchParams?: Promise<{ invited?: string; resent?: string; revoked?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const invited = params.invited === "1";
  const resent = params.resent === "1";
  const revoked = params.revoked === "1";

  const { activeMembership } = await requireActiveOrganization();
  const organization = activeMembership.organizations;
  const canManageMembers =
    activeMembership.role === "owner" || activeMembership.role === "admin";

  const supabase = supabaseServer();

  const { data: memberData, error: memberError } = await supabase
    .from("organization_members")
    .select("user_id,organization_id,role,status,created_at,accepted_at")
    .eq("organization_id", organization.id)
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });

  if (memberError) {
    throw new Error(`Failed to load members: ${memberError.message}`);
  }

  const { data: inviteData, error: inviteError } = await supabase
    .from("organization_invites")
    .select(
      "id,email,role,status,invited_at,accepted_at,expires_at,provider,provider_message_id,email_sent_at,email_error,token"
    )
    .eq("organization_id", organization.id)
    .order("invited_at", { ascending: false });

  if (inviteError) {
    throw new Error(`Failed to load invites: ${inviteError.message}`);
  }

  const members = (memberData ?? []) as MemberRow[];
  const invites = (inviteData ?? []) as InviteRow[];

  const authUsersById = new Map<string, AuthUserInfo>();

  for (const member of members) {
    const result = await supabase.auth.admin.getUserById(member.user_id);

    if (result.error) {
      authUsersById.set(member.user_id, {
        id: member.user_id,
        email: null,
        last_sign_in_at: null,
      });
      continue;
    }

    authUsersById.set(member.user_id, {
      id: result.data.user.id,
      email: result.data.user.email ?? null,
      last_sign_in_at: result.data.user.last_sign_in_at ?? null,
    });
  }

  const ownerCount = members.filter((member) => member.role === "owner").length;
  const adminCount = members.filter((member) => member.role === "admin").length;
  const memberCount = members.filter((member) => member.role === "member").length;
  const viewerCount = members.filter((member) => member.role === "viewer").length;

  return (
    <main className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Verwalte hier die Nutzer der aktiven Organisation. Rollen bestimmen,
          welche administrativen und operativen Rechte innerhalb des aktuellen
          Tenant-Kontexts bestehen.
        </p>
      </section>

      {invited ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Einladung wurde erfolgreich angelegt.
          </p>
        </section>
      ) : null}

      {resent ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Einladung wurde erneut versendet.
          </p>
        </section>
      ) : null}

      {revoked ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Einladung wurde widerrufen.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Owner</div>
          <div className="mt-2 text-3xl font-semibold">{ownerCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Voller Zugriff auf die Organisation.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Admin</div>
          <div className="mt-2 text-3xl font-semibold">{adminCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Operative Verwaltung innerhalb der Orga.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Member</div>
          <div className="mt-2 text-3xl font-semibold">{memberCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Reguläre produktive Nutzer.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Viewer</div>
          <div className="mt-2 text-3xl font-semibold">{viewerCount}</div>
          <p className="mt-2 text-sm text-gray-600">
            Lesender Zugriff ohne Admin-Funktion.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-medium">Mitgliederliste</h2>
            <p className="mt-1 text-sm text-gray-600">
              Aktuelle Memberships der aktiven Organisation.
            </p>
          </div>

          {canManageMembers ? (
            <Link
              href="/orga/members/invite"
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Mitglied einladen
            </Link>
          ) : null}
        </div>

        {members.length === 0 ? (
          <div className="px-6 py-10">
            <div className="rounded-2xl border border-dashed bg-gray-50 p-8">
              <h3 className="text-base font-medium">Noch keine Members vorhanden</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Für die aktive Organisation wurden bisher noch keine Memberships
                angelegt.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-6 py-3 font-medium">E-Mail</th>
                  <th className="px-6 py-3 font-medium">Rolle</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Letzter Login</th>
                  <th className="px-6 py-3 font-medium">Hinzugefügt am</th>
                  <th className="px-6 py-3 font-medium">User ID</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const authUser = authUsersById.get(member.user_id);

                  return (
                    <tr
                      key={`${member.organization_id}-${member.user_id}`}
                      className="border-t align-top"
                    >
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {authUser?.email ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatRole(member.role)}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatMemberStatus(member.status)}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatDateTime(authUser?.last_sign_in_at ?? null)}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatDateTime(member.created_at)}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatUserId(member.user_id)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-medium">Offene Einladungen</h2>
          <p className="mt-1 text-sm text-gray-600">
            Noch nicht angenommene oder historisch sichtbare Einladungen.
          </p>
        </div>

        {invites.length === 0 ? (
          <div className="px-6 py-10">
            <div className="rounded-2xl border border-dashed bg-gray-50 p-8">
              <h3 className="text-base font-medium">Noch keine Einladungen vorhanden</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Sobald Du ein neues Mitglied einlädst, erscheint die Einladung hier.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-6 py-3 font-medium">E-Mail</th>
                  <th className="px-6 py-3 font-medium">Rolle</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Versand</th>
                  <th className="px-6 py-3 font-medium">Invited at</th>
                  <th className="px-6 py-3 font-medium">Expires at</th>
                  <th className="px-6 py-3 font-medium">Accepted at</th>
                  {canManageMembers ? (
                    <th className="px-6 py-3 font-medium">Aktionen</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-t align-top">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {invite.email}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatRole(invite.role)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatInviteStatus(invite.status)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div>{formatDeliveryState(invite)}</div>
                      {invite.email_error?.trim() ? (
                        <div className="mt-1 text-xs text-red-700">
                          {invite.email_error}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatDateTime(invite.invited_at)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatDateTime(invite.expires_at)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatDateTime(invite.accepted_at)}
                    </td>
                    {canManageMembers ? (
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {invite.status === "pending" ? (
                            <>
                              <form action={resendInvite}>
                                <input type="hidden" name="invite_id" value={invite.id} />
                                <button
                                  type="submit"
                                  className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                  Resend
                                </button>
                              </form>

                              <form action={revokeInvite}>
                                <input type="hidden" name="invite_id" value={invite.id} />
                                <button
                                  type="submit"
                                  className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                  Revoke
                                </button>
                              </form>
                            </>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}