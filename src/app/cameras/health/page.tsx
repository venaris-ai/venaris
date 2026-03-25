// src/app/cameras/health/page.tsx #2
import { requirePathAccess } from "@/lib/authz";
import CamerasClient from "./CamerasClient";

export default async function CamerasHealthPage() {
  const ctx = await requirePathAccess("/cameras/health");

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const role = ctx.activeMembership.role;

  return <CamerasClient role={role} />;
}