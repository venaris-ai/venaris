// src/app/cameras/list/page.tsx
import { requireActiveOrganization } from "@/lib/auth";
import CamerasClient from "./CamerasClient";

export default async function CamerasListPage() {
  const { activeMembership } = await requireActiveOrganization();
  const role = activeMembership.role;

  return <CamerasClient role={role} />;
}