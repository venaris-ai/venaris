// src/app/orga/members/MemberRowControls.tsx #8
"use client";

import { useEffect, useMemo, useState } from "react";

type MemberRole = "owner" | "admin" | "member" | "viewer";
type MemberStatus = "active" | "disabled";
type AppLanguage = "de" | "en";

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
  initialLanguage,
  canEditRole,
  canEditStatus,
  canEditLanguage,
  allowOwnerOption,
  saveAction,
  isDemo = false,
}: {
  userId: string;
  initialRole: MemberRole;
  initialStatus: MemberStatus;
  initialLanguage: AppLanguage;
  canEditRole: boolean;
  canEditStatus: boolean;
  canEditLanguage: boolean;
  allowOwnerOption: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
}) {
  const [role, setRole] = useState<MemberRole>(initialRole);
  const [status, setStatus] = useState<MemberStatus>(initialStatus);
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);

  const formId = useMemo(() => `member-controls-${userId}`, [userId]);
  const dirty =
    role !== initialRole || status !== initialStatus || language !== initialLanguage;

  useEffect(() => {
    emitDirtyState(userId, dirty);
    return () => {
      emitDirtyState(userId, false);
    };
  }, [userId, dirty]);

  return (
    <>
      <td className="px-6 py-4 text-white/68 whitespace-nowrap">
        <form id={formId} action={saveAction}>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="language" value={language} />

          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            disabled={!canEditRole || isDemo}
            className="rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
            title={
              isDemo
                ? "Demo-Modus: Änderungen sind deaktiviert."
                : !canEditRole
                  ? "Rolle kann für dieses Mitglied nicht geändert werden."
                  : ""
            }
          >
            <option value="viewer" className="bg-[#102018] text-white">
              Viewer
            </option>
            <option value="member" className="bg-[#102018] text-white">
              Member
            </option>
            <option value="admin" className="bg-[#102018] text-white">
              Admin
            </option>
            {allowOwnerOption ? (
              <option value="owner" className="bg-[#102018] text-white">
                Owner
              </option>
            ) : null}
          </select>
        </form>
      </td>

      <td className="px-6 py-4 text-white/68 whitespace-nowrap">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as MemberStatus)}
          disabled={!canEditStatus || isDemo}
          className="rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
          title={
            isDemo
              ? "Demo-Modus: Änderungen sind deaktiviert."
              : !canEditStatus
                ? "Status kann für dieses Mitglied nicht geändert werden."
                : ""
          }
        >
          <option value="active" className="bg-[#102018] text-white">
            Active
          </option>
          <option value="disabled" className="bg-[#102018] text-white">
            Disabled
          </option>
        </select>
      </td>

      <td className="px-6 py-4 text-white/68 whitespace-nowrap">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as AppLanguage)}
          disabled={!canEditLanguage || isDemo}
          className="rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
          title={
            isDemo
              ? "Demo-Modus: Änderungen sind deaktiviert."
              : !canEditLanguage
                ? "Sprache kann für dieses Mitglied nicht geändert werden."
                : ""
          }
        >
          <option value="de" className="bg-[#102018] text-white">
            Deutsch
          </option>
          <option value="en" className="bg-[#102018] text-white">
            English
          </option>
        </select>
      </td>
    </>
  );
}