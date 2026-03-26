// src/app/orga/members/MemberRowControls.tsx #5
"use client";

import { useEffect, useMemo, useState } from "react";

type MemberRole = "owner" | "admin" | "member" | "viewer";
type MemberStatus = "active" | "disabled";

function emitDirtyState(userId: string, dirty: boolean) {
  window.dispatchEvent(
    new CustomEvent("member-row-dirty-change", {
      detail: { userId, dirty },
    })
  );
}

export default function MemberRowControls({
  userId,
  initialRole,
  initialStatus,
  canEditRole,
  canEditStatus,
  allowOwnerOption,
  saveAction,
}: {
  userId: string;
  initialRole: MemberRole;
  initialStatus: MemberStatus;
  canEditRole: boolean;
  canEditStatus: boolean;
  allowOwnerOption: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const [role, setRole] = useState<MemberRole>(initialRole);
  const [status, setStatus] = useState<MemberStatus>(initialStatus);

  const formId = useMemo(() => `member-controls-${userId}`, [userId]);
  const dirty = role !== initialRole || status !== initialStatus;

  useEffect(() => {
    emitDirtyState(userId, dirty);
    return () => {
      emitDirtyState(userId, false);
    };
  }, [userId, dirty]);

  return (
    <>
      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
        <form id={formId} action={saveAction}>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="status" value={status} />

          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            disabled={!canEditRole}
            className="rounded-md border px-2.5 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
            title={!canEditRole ? "Rolle kann für dieses Mitglied nicht geändert werden." : ""}
          >
            <option value="viewer">Viewer</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            {allowOwnerOption ? <option value="owner">Owner</option> : null}
          </select>
        </form>
      </td>

      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as MemberStatus)}
          disabled={!canEditStatus}
          className="rounded-md border px-2.5 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          title={!canEditStatus ? "Status kann für dieses Mitglied nicht geändert werden." : ""}
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </td>
    </>
  );
}