// src/app/orga/members/page.tsx #13
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import MemberRowControls from "./MemberRowControls";
import MemberRowActions from "./MemberRowActions";

type MemberRole = "owner" | "admin" | "member" | "viewer";
type MemberStatus = "active" | "disabled";

type MemberRow = {
  user_id: string;
  organization_id: string;
  role: MemberRole;
  status: MemberStatus;
  created_at: string;
  accepted_at: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  role: MemberRole;
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

function formatInviteStatus(status: string) {
  if (status === "pending") return "Pending";
  if (status === "accepted") return "Accepted";
  if (status === "revoked") return "Revoked";
  if (status === "expired") return "Expired";
  return status;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDeliveryState(invite: InviteRow) {
  if (invite.email_sent_at) return "Sent";
  if (invite.email_error?.trim()) return "Failed";
  return "Not sent";
}

function isMemberRole(value: string): value is MemberRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
}

async function loadMemberForMutation(params: {
  organizationId: string;
  userId: string;
}) {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id,organization_id,role,status,created_at,accepted_at")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load target member: ${error.message}`);
  }

  return (data as MemberRow | null) ?? null;
}

async function countOwners(organizationId: string) {
  const supabase = supabaseServer();

  const { count, error } = await supabase
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to count owners: ${error.message}`);
  }

  return count ?? 0;
}

async function saveMemberChanges(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/members");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const actorUserId = ctx.user.id;
  const actorRole = ctx.activeMembership.role;
  const organization = ctx.activeMembership.organizations;
  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const nextRoleRaw = String(formData.get("role") ?? "").trim();
  const nextStatusRaw = String(formData.get("status") ?? "").trim();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  if (!targetUserId) {
    throw new Error("Missing target user.");
  }

  if (!isMemberRole(nextRoleRaw)) {
    throw new Error("Invalid target role.");
  }

  if (!["active", "disabled"].includes(nextStatusRaw)) {
    throw new Error("Invalid target status.");
  }

  const nextStatus = nextStatusRaw as MemberStatus;

  if (actorUserId === targetUserId) {
    throw new Error("Der eigene Account kann hier nicht geändert werden.");
  }

  const targetMember = await loadMemberForMutation({
    organizationId: organization.id,
    userId: targetUserId,
  });

  if (!targetMember) {
    throw new Error("Target member not found.");
  }

  if (actorRole === "admin" && targetMember.role === "owner") {
    throw new Error("Admins dürfen Owner nicht ändern.");
  }

  if (actorRole === "admin" && nextRoleRaw === "owner") {
    throw new Error("Admins dürfen niemanden zum Owner machen.");
  }

  if (
    targetMember.role === "owner" &&
    targetMember.status === "active" &&
    (nextRoleRaw !== "owner" || nextStatus === "disabled")
  ) {
    const ownerCount = await countOwners(organization.id);

    if (ownerCount <= 1) {
      throw new Error("Der letzte aktive Owner kann nicht geändert werden.");
    }
  }

  if (targetMember.role === nextRoleRaw && targetMember.status === nextStatus) {
    revalidatePath("/orga/members");
    redirect("/orga/members");
  }

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("organization_members")
    .update({
      role: nextRoleRaw,
      status: nextStatus,
    })
    .eq("organization_id", organization.id)
    .eq("user_id", targetUserId);

  if (error) {
    throw new Error(`Failed to save member changes: ${error.message}`);
  }

  revalidatePath("/orga/members");
  revalidatePath("/orga/members/invite");
  revalidatePath("/orga/subscription");
  redirect("/orga/members?changed=1");
}

async function removeMember(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/members");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const actorUserId = ctx.user.id;
  const actorRole = ctx.activeMembership.role;
  const organization = ctx.activeMembership.organizations;
  const targetUserId = String(formData.get("user_id") ?? "").trim();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  if (!targetUserId) {
    throw new Error("Missing target user.");
  }

  if (actorUserId === targetUserId) {
    throw new Error("Der eigene Account kann hier nicht entfernt werden.");
  }

  const targetMember = await loadMemberForMutation({
    organizationId: organization.id,
    userId: targetUserId,
  });

  if (!targetMember) {
    throw new Error("Target member not found.");
  }

  if (actorRole === "admin" && targetMember.role === "owner") {
    throw new Error("Admins dürfen Owner nicht entfernen.");
  }

  if (targetMember.role === "owner" && targetMember.status === "active") {
    const ownerCount = await countOwners(organization.id);

    if (ownerCount <= 1) {
      throw new Error("Der letzte aktive Owner kann nicht entfernt werden.");
    }
  }

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", organization.id)
    .eq("user_id", targetUserId);

  if (error) {
    throw new Error(`Failed to remove member: ${error.message}`);
  }

  revalidatePath("/orga/members");
  revalidatePath("/orga/members/invite");
  revalidatePath("/orga/subscription");
  redirect("/orga/members?removed=1");
}

async function resendInvite(formData: FormData) {
  "use server";

  const ctx = await requirePathAccess("/orga/members");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const inviteId = String(formData.get("invite_id") ?? "").trim();

  if (!organization) {
    throw new Error("Active organization not found");
  }

  if (!inviteId) {
    throw new Error("[resendInvite:input] Missing invite id.");
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("organization_invites")
    .select("id,email,role,status,expires_at,token,organization_id")
    .eq("id", inviteId)
    .eq("organization_id", organization.id)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    throw new Error(`[resendInvite:load_invite] ${error.message}`);
  }

  const invite = data as
    | {
        id: string;
        email: string;
        role: MemberRole;
        status: "pending" | "accepted" | "revoked" | "expired";
        expires_at: string | null;
        token: string;
        organization_id: string;
      }
    | null;

  if (!invite) {
    throw new Error("[resendInvite:load_invite] Invite not found.");
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

  const ctx = await requirePathAccess("/orga/members");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const inviteId = String(formData.get("invite_id") ?? "").trim();

  if (!organization) {
    throw new Error("Active organization not found");
  }

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
  searchParams?: Promise<{
    invited?: string;
    resent?: string;
    revoked?: string;
    changed?: string;
    removed?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const invited = params.invited === "1";
  const resent = params.resent === "1";
  const revoked = params.revoked === "1";
  const changed = params.changed === "1";
  const removed = params.removed === "1";

  const ctx = await requirePathAccess("/orga/members");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const actorRole = ctx.activeMembership.role;
  const actorUserId = ctx.user.id;

  if (!organization) {
    throw new Error("Active organization not found");
  }

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
    .eq("status", "pending")
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

  const ownerCount = members.filter(
    (member) => member.role === "owner" && member.status === "active"
  ).length;
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

      {changed ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Member-Änderungen wurden gespeichert.
          </p>
        </section>
      ) : null}

      {removed ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Member wurde dauerhaft entfernt.
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

          <Link
            href="/orga/members/invite"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Mitglied einladen
          </Link>
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
                  <th className="px-6 py-3 font-medium whitespace-nowrap">E-Mail</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Rolle</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Status</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap min-w-[150px]">
                    Letzter Login
                  </th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap min-w-[150px]">
                    Hinzugefügt am
                  </th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap text-right">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const authUser = authUsersById.get(member.user_id);
                  const isSelf = member.user_id === actorUserId;
                  const isLastOwner =
                    member.role === "owner" &&
                    member.status === "active" &&
                    ownerCount <= 1;

                  const canEditRole =
                    !isSelf &&
                    !(actorRole === "admin" && member.role === "owner") &&
                    !isLastOwner;

                  const canEditStatus =
                    !isSelf &&
                    !(actorRole === "admin" && member.role === "owner") &&
                    !isLastOwner;

                  const canRemove =
                    !isSelf &&
                    !(actorRole === "admin" && member.role === "owner") &&
                    !isLastOwner;

                  return (
                    <tr
                      key={`${member.organization_id}-${member.user_id}`}
                      className="border-t align-middle"
                    >
                      <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                        {authUser?.email ?? "—"}
                      </td>

                      <MemberRowControls
                        userId={member.user_id}
                        initialRole={member.role}
                        initialStatus={member.status}
                        canEditRole={canEditRole}
                        canEditStatus={canEditStatus}
                        allowOwnerOption={actorRole === "owner"}
                        saveAction={saveMemberChanges}
                      />

                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {formatDateTime(authUser?.last_sign_in_at ?? null)}
                      </td>

                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {formatDateTime(member.created_at)}
                      </td>

                      <MemberRowActions
                        userId={member.user_id}
                        initialRole={member.role}
                        initialStatus={member.status}
                        canEditRole={canEditRole}
                        canEditStatus={canEditStatus}
                        canRemove={canRemove}
                        removeAction={removeMember}
                      />
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
            Noch nicht angenommene Einladungen der aktiven Organisation.
          </p>
        </div>

        {invites.length === 0 ? (
          <div className="px-6 py-10">
            <div className="rounded-2xl border border-dashed bg-gray-50 p-8">
              <h3 className="text-base font-medium">Keine offenen Einladungen</h3>
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
                  <th className="px-6 py-3 font-medium whitespace-nowrap">E-Mail</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Rolle</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Status</th>
                  <th className="px-6 py-3 font-medium">Versand</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Invited at</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Expires at</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-t align-middle">
                    <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                      {invite.email}
                    </td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {formatRole(invite.role)}
                    </td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
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
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {formatDateTime(invite.invited_at)}
                    </td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {formatDateTime(invite.expires_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
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
                      </div>
                    </td>
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