// src/lib/billing/subscriptionPolicy.ts #2
import type { AppLanguage } from "@/lib/i18n";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type SubscriptionPolicyInput = {
  status: SubscriptionStatus;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  maxCameras: number;
  maxMembers: number;
  currentCameraCount: number;
  activeMemberCount: number;
  openInviteCount: number;
  now?: Date;
  language?: AppLanguage;
};

export type SubscriptionActionPolicy = {
  allowed: boolean;
  reason:
    | "ok"
    | "camera_limit_reached"
    | "member_limit_reached"
    | "trial_expired"
    | "subscription_expired"
    | "subscription_past_due"
    | "subscription_canceled";
  message: string;
};

export type ResolvedSubscriptionState = {
  effectiveStatus: SubscriptionStatus;
  isTrialExpired: boolean;
  currentMemberUsage: number;
  cameraSlotsLeft: number;
  memberSlotsLeft: number;
};

function isPast(dateValue?: string | null, now = new Date()) {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() < now.getTime();
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        cameraTrialExpired:
          "The trial period has ended. Another camera can only be created after the subscription has been activated.",
        cameraSubscriptionExpired:
          "The subscription has expired. Another camera cannot currently be created.",
        cameraPastDue:
          "The subscription currently has an open billing status. New cameras are currently blocked.",
        cameraCanceled:
          "The subscription has been canceled. New cameras can no longer be created at the moment.",
        cameraLimitReached: (current: number, max: number) =>
          `Camera limit reached. Currently used: ${current} of ${max} cameras.`,
        cameraAllowed:
          "Camera creation is possible within the current subscription.",

        inviteTrialExpired:
          "The trial period has ended. New invitations will only be possible again after the subscription has been activated.",
        inviteSubscriptionExpired:
          "The subscription has expired. New invitations are currently not possible.",
        invitePastDue:
          "The subscription currently has an open billing status. New invitations are currently blocked.",
        inviteCanceled:
          "The subscription has been canceled. New invitations are currently no longer possible.",
        memberLimitReached: (current: number, max: number) =>
          `Member limit reached. Currently counted: ${current} of ${max} (active members + open invites).`,
        inviteAllowed:
          "Member invitation is possible within the current subscription.",
      }
    : {
        cameraTrialExpired:
          "Die Testphase ist abgelaufen. Eine weitere Kamera kann erst nach Aktivierung des Abos angelegt werden.",
        cameraSubscriptionExpired:
          "Das Abo ist abgelaufen. Eine weitere Kamera kann aktuell nicht angelegt werden.",
        cameraPastDue:
          "Das Abo hat aktuell einen offenen Billing-Status. Neue Kameras sind derzeit gesperrt.",
        cameraCanceled:
          "Das Abo ist gekündigt. Neue Kameras können aktuell nicht mehr angelegt werden.",
        cameraLimitReached: (current: number, max: number) =>
          `Kamera-Limit erreicht. Aktuell genutzt: ${current} von ${max} Kameras.`,
        cameraAllowed:
          "Kameraanlage innerhalb des aktuellen Abos möglich.",

        inviteTrialExpired:
          "Die Testphase ist abgelaufen. Neue Einladungen sind erst nach Aktivierung des Abos wieder möglich.",
        inviteSubscriptionExpired:
          "Das Abo ist abgelaufen. Neue Einladungen sind aktuell nicht möglich.",
        invitePastDue:
          "Das Abo hat aktuell einen offenen Billing-Status. Neue Einladungen sind derzeit gesperrt.",
        inviteCanceled:
          "Das Abo ist gekündigt. Neue Einladungen sind aktuell nicht mehr möglich.",
        memberLimitReached: (current: number, max: number) =>
          `Member-Limit erreicht. Aktuell angerechnet: ${current} von ${max} (aktive Members + offene Invites).`,
        inviteAllowed:
          "Mitgliedereinladung innerhalb des aktuellen Abos möglich.",
      };
}

export function resolveSubscriptionState(
  input: SubscriptionPolicyInput
): ResolvedSubscriptionState {
  const now = input.now ?? new Date();
  const isTrialExpired =
    input.status === "trialing" && isPast(input.trialEndsAt, now);

  const effectiveStatus: SubscriptionStatus = isTrialExpired
    ? "expired"
    : input.status;

  const currentMemberUsage = input.activeMemberCount + input.openInviteCount;

  return {
    effectiveStatus,
    isTrialExpired,
    currentMemberUsage,
    cameraSlotsLeft: Math.max(input.maxCameras - input.currentCameraCount, 0),
    memberSlotsLeft: Math.max(input.maxMembers - currentMemberUsage, 0),
  };
}

export function canCreateCamera(
  input: SubscriptionPolicyInput
): SubscriptionActionPolicy {
  const state = resolveSubscriptionState(input);
  const language = input.language ?? "de";
  const text = t(language);

  if (state.effectiveStatus === "expired") {
    return {
      allowed: false,
      reason: state.isTrialExpired ? "trial_expired" : "subscription_expired",
      message: state.isTrialExpired
        ? text.cameraTrialExpired
        : text.cameraSubscriptionExpired,
    };
  }

  if (state.effectiveStatus === "past_due") {
    return {
      allowed: false,
      reason: "subscription_past_due",
      message: text.cameraPastDue,
    };
  }

  if (state.effectiveStatus === "canceled") {
    return {
      allowed: false,
      reason: "subscription_canceled",
      message: text.cameraCanceled,
    };
  }

  if (input.currentCameraCount >= input.maxCameras) {
    return {
      allowed: false,
      reason: "camera_limit_reached",
      message: text.cameraLimitReached(
        input.currentCameraCount,
        input.maxCameras
      ),
    };
  }

  return {
    allowed: true,
    reason: "ok",
    message: text.cameraAllowed,
  };
}

export function canInviteMember(
  input: SubscriptionPolicyInput
): SubscriptionActionPolicy {
  const state = resolveSubscriptionState(input);
  const language = input.language ?? "de";
  const text = t(language);

  if (state.effectiveStatus === "expired") {
    return {
      allowed: false,
      reason: state.isTrialExpired ? "trial_expired" : "subscription_expired",
      message: state.isTrialExpired
        ? text.inviteTrialExpired
        : text.inviteSubscriptionExpired,
    };
  }

  if (state.effectiveStatus === "past_due") {
    return {
      allowed: false,
      reason: "subscription_past_due",
      message: text.invitePastDue,
    };
  }

  if (state.effectiveStatus === "canceled") {
    return {
      allowed: false,
      reason: "subscription_canceled",
      message: text.inviteCanceled,
    };
  }

  if (state.currentMemberUsage >= input.maxMembers) {
    return {
      allowed: false,
      reason: "member_limit_reached",
      message: text.memberLimitReached(
        state.currentMemberUsage,
        input.maxMembers
      ),
    };
  }

  return {
    allowed: true,
    reason: "ok",
    message: text.inviteAllowed,
  };
}