// src/app/cameras/health/page.tsx
import { requireActiveOrganization } from "@/lib/auth";
import CamerasClient from "./CamerasClient";

export default async function CamerasHealthPage() {
  const { activeMembership } = await requireActiveOrganization();
  const role = activeMembership.role;

  return <CamerasClient role={role} />;
}