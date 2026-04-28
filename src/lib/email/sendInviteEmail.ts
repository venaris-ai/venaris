// src/lib/email/sendInviteEmail.ts #4
import type { AppLanguage } from "@/lib/i18n";
import {
  DEFAULT_APP_TIME_ZONE,
  formatAppDateTime,
} from "@/lib/dateTime";
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
  language: AppLanguage;
};

function formatRole(role: string) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  if (role === "viewer") return "Viewer";
  return role;
}

function formatExpiry(value: string | null, language: AppLanguage) {
  if (!value) {
    return language === "en" ? "no fixed expiry date" : "ohne festes Ablaufdatum";
  }

  return formatAppDateTime(value, language, DEFAULT_APP_TIME_ZONE);
}

export async function sendInviteEmail({
  to,
  organizationName,
  role,
  token,
  expiresAt,
  language,
}: SendInviteEmailParams) {
  const resend = getResendClient();
  const fromEmail = getResendFromEmail();
  const fromName = getResendFromName();
  const appBaseUrl = getAppBaseUrl();

  const acceptUrl = `${appBaseUrl}/invite/accept?token=${encodeURIComponent(
    token
  )}`;

  const formattedRole = formatRole(role);
  const formattedExpiry = formatExpiry(expiresAt, language);

  const subject =
    language === "en"
      ? `Invitation to Venaris – ${organizationName}`
      : `Einladung zu Venaris – ${organizationName}`;

  const html =
    language === "en"
      ? `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 16px;">Invitation to Venaris</h2>
      <p>Hello,</p>
      <p>
        you have been invited to join the organization <strong>${organizationName}</strong>
        in Venaris.
      </p>
      <p>
        Intended role: <strong>${formattedRole}</strong>
      </p>
      <p>
        This invitation is valid until: <strong>${formattedExpiry}</strong>
      </p>
      <p style="margin: 24px 0;">
        <a
          href="${acceptUrl}"
          style="display: inline-block; padding: 10px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;"
        >
          Accept invitation
        </a>
      </p>
      <p>
        If the button does not work, please use this link:
      </p>
      <p>
        <a href="${acceptUrl}">${acceptUrl}</a>
      </p>
      <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">
        This email was sent automatically by Venaris.
      </p>
    </div>
  `
      : `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 16px;">Einladung zu Venaris</h2>
      <p>Hallo,</p>
      <p>
        du wurdest eingeladen, der Organisation <strong>${organizationName}</strong>
        in Venaris beizutreten.
      </p>
      <p>
        Vorgesehene Rolle: <strong>${formattedRole}</strong>
      </p>
      <p>
        Diese Einladung ist gültig bis: <strong>${formattedExpiry}</strong>
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

  const text =
    language === "en"
      ? [
          "Invitation to Venaris",
          "",
          `You have been invited to join the organization "${organizationName}".`,
          `Intended role: ${formattedRole}`,
          `Valid until: ${formattedExpiry}`,
          "",
          `Accept invitation: ${acceptUrl}`,
        ].join("\n")
      : [
          "Einladung zu Venaris",
          "",
          `Du wurdest eingeladen, der Organisation "${organizationName}" beizutreten.`,
          `Vorgesehene Rolle: ${formattedRole}`,
          `Gültig bis: ${formattedExpiry}`,
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