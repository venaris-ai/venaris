// src/lib/billing/subscriptionPolicy.ts #1
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

  if (state.effectiveStatus === "expired") {
    return {
      allowed: false,
      reason: state.isTrialExpired ? "trial_expired" : "subscription_expired",
      message: state.isTrialExpired
        ? "Die Testphase ist abgelaufen. Eine weitere Kamera kann erst nach Aktivierung der Subscription angelegt werden."
        : "Die Subscription ist abgelaufen. Eine weitere Kamera kann aktuell nicht angelegt werden.",
    };
  }

  if (state.effectiveStatus === "past_due") {
    return {
      allowed: false,
      reason: "subscription_past_due",
      message:
        "Die Subscription hat aktuell einen offenen Billing-Status. Neue Kameras sind derzeit gesperrt.",
    };
  }

  if (state.effectiveStatus === "canceled") {
    return {
      allowed: false,
      reason: "subscription_canceled",
      message:
        "Die Subscription ist gekündigt. Neue Kameras können aktuell nicht mehr angelegt werden.",
    };
  }

  if (input.currentCameraCount >= input.maxCameras) {
    return {
      allowed: false,
      reason: "camera_limit_reached",
      message: `Kamera-Limit erreicht. Aktuell genutzt: ${input.currentCameraCount} von ${input.maxCameras} Kameras.`,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    message: "Kameraanlage innerhalb der aktuellen Subscription möglich.",
  };
}

export function canInviteMember(
  input: SubscriptionPolicyInput
): SubscriptionActionPolicy {
  const state = resolveSubscriptionState(input);

  if (state.effectiveStatus === "expired") {
    return {
      allowed: false,
      reason: state.isTrialExpired ? "trial_expired" : "subscription_expired",
      message: state.isTrialExpired
        ? "Die Testphase ist abgelaufen. Neue Einladungen sind erst nach Aktivierung der Subscription wieder möglich."
        : "Die Subscription ist abgelaufen. Neue Einladungen sind aktuell nicht möglich.",
    };
  }

  if (state.effectiveStatus === "past_due") {
    return {
      allowed: false,
      reason: "subscription_past_due",
      message:
        "Die Subscription hat aktuell einen offenen Billing-Status. Neue Einladungen sind derzeit gesperrt.",
    };
  }

  if (state.effectiveStatus === "canceled") {
    return {
      allowed: false,
      reason: "subscription_canceled",
      message:
        "Die Subscription ist gekündigt. Neue Einladungen sind aktuell nicht mehr möglich.",
    };
  }

  if (state.currentMemberUsage >= input.maxMembers) {
    return {
      allowed: false,
      reason: "member_limit_reached",
      message: `Member-Limit erreicht. Aktuell angerechnet: ${state.currentMemberUsage} von ${input.maxMembers} (aktive Members + offene Invites).`,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    message: "Member-Einladung innerhalb der aktuellen Subscription möglich.",
  };
}