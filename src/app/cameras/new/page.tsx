// src/app/cameras/new/page.tsx #8
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  canCreateCamera,
  resolveSubscriptionState,
} from "@/lib/billing/subscriptionPolicy";
import CreateCameraForm from "./CreateCameraForm";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type Revier = {
  id: string;
  name: string;
  organization_id: string | null;
  status: "active" | "paused" | "archived";
  is_default: boolean;
};

type SubscriptionPolicyRow = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
  max_cameras: number;
  max_members: number;
};

export default async function NewCameraPage() {
  const ctx = await requirePathAccess("/cameras/new");
  const supabase = supabaseServer();

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const activeOrganization = ctx.activeMembership.organizations;

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  const [reviersResult, subscriptionResult, cameraCountResult] = await Promise.all([
    supabase
      .from("reviers")
      .select("id, name, organization_id, status, is_default")
      .eq("organization_id", activeOrganization.id)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),

    supabase
      .from("organization_subscriptions")
      .select("status,trial_ends_at,current_period_end,max_cameras,max_members")
      .eq("organization_id", activeOrganization.id)
      .maybeSingle<SubscriptionPolicyRow>(),

    supabase
      .from("cameras")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", activeOrganization.id)
      .eq("is_active", true),
  ]);

  if (reviersResult.error) {
    throw new Error(`Failed to load reviers: ${reviersResult.error.message}`);
  }

  if (subscriptionResult.error) {
    throw new Error(
      `Failed to load subscription camera policy: ${subscriptionResult.error.message}`
    );
  }

  if (!subscriptionResult.data) {
    throw new Error("No subscription found for active organization");
  }

  if (cameraCountResult.error) {
    throw new Error(`Failed to load camera usage: ${cameraCountResult.error.message}`);
  }

  const reviers = (reviersResult.data ?? []) as Revier[];

  const policyInput = {
    status: subscriptionResult.data.status,
    trialEndsAt: subscriptionResult.data.trial_ends_at,
    currentPeriodEnd: subscriptionResult.data.current_period_end,
    maxCameras: subscriptionResult.data.max_cameras,
    maxMembers: subscriptionResult.data.max_members,
    currentCameraCount: cameraCountResult.count ?? 0,
    activeMemberCount: 0,
    openInviteCount: 0,
  } as const;

  const resolvedState = resolveSubscriptionState(policyInput);
  const cameraPolicy = canCreateCamera(policyInput);

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Create Camera
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Create Camera
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            Add a new camera and generate its provisioning data.
          </p>
        </div>
      </section>

      <CreateCameraForm
        organization={activeOrganization as Organization}
        reviers={reviers}
        currentCameraCount={policyInput.currentCameraCount}
        maxCameras={subscriptionResult.data.max_cameras}
        cameraPolicy={cameraPolicy}
        effectiveStatus={resolvedState.effectiveStatus}
        rawStatus={subscriptionResult.data.status}
      />
    </main>
  );
}