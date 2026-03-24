// src/lib/email/sendInviteEmail.ts #1
import {
  getAppBaseUrl,
  getResendClient,
  getResendFromEmail,
  getResendFromName,
} from "@/lib/email/resend";

type SendInviteEmailParams = {
  to: string;
  organizationName: string;
  role: string;
  token: string;
  expiresAt: string | null;
};

function formatRole(role: string) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  if (role === "viewer") return "Viewer";
  return role;
}

function formatExpiry(value: string | null) {
  if (!value) return "ohne festes Ablaufdatum";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function sendInviteEmail({
  to,
  organizationName,
  role,
  token,
  expiresAt,
}: SendInviteEmailParams) {
  const resend = getResendClient();
  const fromEmail = getResendFromEmail();
  const fromName = getResendFromName();
  const appBaseUrl = getAppBaseUrl();

  const acceptUrl = `${appBaseUrl}/invite/accept?token=${encodeURIComponent(
    token
  )}`;

  const subject = `Einladung zu Venaris – ${organizationName}`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 16px;">Einladung zu Venaris</h2>
      <p>Hallo,</p>
      <p>
        du wurdest eingeladen, der Organisation <strong>${organizationName}</strong>
        in Venaris beizutreten.
      </p>
      <p>
        Vorgesehene Rolle: <strong>${formatRole(role)}</strong>
      </p>
      <p>
        Diese Einladung ist gültig bis: <strong>${formatExpiry(expiresAt)}</strong>
      </p>
      <p style="margin: 24px 0;">
        <a
          href="${acceptUrl}"
          style="display: inline-block; padding: 10px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;"
        >
          Einladung annehmen
        </a>
      </p>
      <p>
        Falls der Button nicht funktioniert, nutze bitte diesen Link:
      </p>
      <p>
        <a href="${acceptUrl}">${acceptUrl}</a>
      </p>
      <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">
        Diese E-Mail wurde automatisch von Venaris versendet.
      </p>
    </div>
  `;

  const text = [
    "Einladung zu Venaris",
    "",
    `Du wurdest eingeladen, der Organisation "${organizationName}" beizutreten.`,
    `Vorgesehene Rolle: ${formatRole(role)}`,
    `Gültig bis: ${formatExpiry(expiresAt)}`,
    "",
    `Einladung annehmen: ${acceptUrl}`,
  ].join("\n");

  const result = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    text,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    provider: "resend",
    providerMessageId: result.data?.id ?? null,
  };
}