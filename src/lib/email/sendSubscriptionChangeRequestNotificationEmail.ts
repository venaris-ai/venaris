// src/lib/email/sendSubscriptionChangeRequestNotificationEmail.ts #1
import {
  getAppBaseUrl,
  getResendClient,
  getResendFromEmail,
  getResendFromName,
} from "@/lib/email/resend";

type PlanKey = "starter" | "pro" | "enterprise";
type RequestType = "upgrade" | "downgrade" | "change";

type SendSubscriptionChangeRequestNotificationEmailParams = {
  requestId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  requestedByUserId: string;
  requestedByEmail: string | null;
  currentPlanKey: PlanKey;
  requestedPlanKey: PlanKey;
  requestType: RequestType;
  message: string | null;
  createdAt: string;
};

function getRequiredNotificationEmail() {
  const value = process.env.SUBSCRIPTION_REQUEST_NOTIFICATION_EMAIL?.trim();

  if (!value) {
    throw new Error("Missing env: SUBSCRIPTION_REQUEST_NOTIFICATION_EMAIL");
  }

  return value;
}

function planLabel(planKey: PlanKey) {
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

function formatNullable(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export async function sendSubscriptionChangeRequestNotificationEmail({
  requestId,
  organizationId,
  organizationName,
  organizationSlug,
  requestedByUserId,
  requestedByEmail,
  currentPlanKey,
  requestedPlanKey,
  requestType,
  message,
  createdAt,
}: SendSubscriptionChangeRequestNotificationEmailParams) {
  const resend = getResendClient();
  const fromEmail = getResendFromEmail();
  const fromName = getResendFromName();
  const appBaseUrl = getAppBaseUrl();
  const to = getRequiredNotificationEmail();

  const adminUrl = `${appBaseUrl}/admin/subscriptions`;
  const subject = `Venaris Subscription Request – ${organizationName}`;

  const currentPlanLabel = planLabel(currentPlanKey);
  const requestedPlanLabel = planLabel(requestedPlanKey);
  const organizationSlugText = formatNullable(organizationSlug);
  const requestedByEmailText = formatNullable(requestedByEmail);
  const messageText = formatNullable(message);

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 16px;">New Venaris subscription request</h2>

      <p>
        A new subscription change request was created in Venaris.
      </p>

      <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <tbody>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Organization</td>
            <td style="padding: 8px 0;">${organizationName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Organization slug</td>
            <td style="padding: 8px 0;">${organizationSlugText}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Plan change</td>
            <td style="padding: 8px 0;">${currentPlanLabel} → ${requestedPlanLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Request type</td>
            <td style="padding: 8px 0;">${requestType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Requested by</td>
            <td style="padding: 8px 0;">${requestedByEmailText}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Created at</td>
            <td style="padding: 8px 0;">${createdAt}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Message</td>
            <td style="padding: 8px 0;">${messageText}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin: 24px 0;">
        <a
          href="${adminUrl}"
          style="display: inline-block; padding: 10px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;"
        >
          Open admin subscriptions
        </a>
      </p>

      <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e5e7eb;" />

      <p style="font-size: 12px; color: #6b7280;">
        Request ID: ${requestId}<br />
        Organization ID: ${organizationId}<br />
        Requested by user ID: ${requestedByUserId}
      </p>

      <p style="font-size: 12px; color: #6b7280;">
        This email was sent automatically by Venaris.
      </p>
    </div>
  `;

  const text = [
    "New Venaris subscription request",
    "",
    `Organization: ${organizationName}`,
    `Organization slug: ${organizationSlugText}`,
    `Organization ID: ${organizationId}`,
    "",
    `Plan change: ${currentPlanLabel} -> ${requestedPlanLabel}`,
    `Request type: ${requestType}`,
    "",
    `Requested by: ${requestedByEmailText}`,
    `Requested by user ID: ${requestedByUserId}`,
    "",
    `Created at: ${createdAt}`,
    `Message: ${messageText}`,
    "",
    `Request ID: ${requestId}`,
    "",
    `Open admin subscriptions: ${adminUrl}`,
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