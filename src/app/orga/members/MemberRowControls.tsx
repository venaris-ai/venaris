// src/app/orga/members/MemberRowControls.tsx #11
"use client";

import { useEffect, useMemo, useState } from "react";
import { type AppLanguage } from "@/lib/i18n";

type MemberRole = "owner" | "admin" | "member" | "viewer";
type MemberStatus = "active" | "disabled";

function emitDirtyState(userId: string, dirty: boolean) {
  window.dispatchEvent(
    new CustomEvent("member-row-dirty-change", {
      detail: { userId, dirty },
    })
  );
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        demoReadOnly: "Demo mode: changes are disabled.",
        roleNotEditable: "Role cannot be changed for this member.",
        statusNotEditable: "Status cannot be changed for this member.",
        languageNotEditable: "Language cannot be changed for this member.",
        member: "Member",
        admin: "Admin",
        owner: "Owner",
        viewer: "Viewer",
        active: "Active",
        disabled: "Disabled",
        german: "Deutsch",
        english: "English",
      }
    : {
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        roleNotEditable: "Rolle kann für dieses Mitglied nicht geändert werden.",
        statusNotEditable: "Status kann für dieses Mitglied nicht geändert werden.",
        languageNotEditable: "Sprache kann für dieses Mitglied nicht geändert werden.",
        member: "Member",
        admin: "Admin",
        owner: "Owner",
        viewer: "Viewer",
        active: "Active",
        disabled: "Disabled",
        german: "Deutsch",
        english: "English",
      };
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
  uiLanguage,
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
  uiLanguage: AppLanguage;
}) {
  const [role, setRole] = useState<MemberRole>(initialRole);
  const [status, setStatus] = useState<MemberStatus>(initialStatus);
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);
  const text = t(uiLanguage);

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
                ? text.demoReadOnly
                : !canEditRole
                  ? text.roleNotEditable
                  : ""
            }
          >
            <option value="viewer" className="bg-[#102018] text-white">
              {text.viewer}
            </option>
            <option value="member" className="bg-[#102018] text-white">
              {text.member}
            </option>
            <option value="admin" className="bg-[#102018] text-white">
              {text.admin}
            </option>
            {allowOwnerOption ? (
              <option value="owner" className="bg-[#102018] text-white">
                {text.owner}
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
              ? text.demoReadOnly
              : !canEditStatus
                ? text.statusNotEditable
                : ""
          }
        >
          <option value="active" className="bg-[#102018] text-white">
            {text.active}
          </option>
          <option value="disabled" className="bg-[#102018] text-white">
            {text.disabled}
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
              ? text.demoReadOnly
              : !canEditLanguage
                ? text.languageNotEditable
                : ""
          }
        >
          <option value="de" className="bg-[#102018] text-white">
            {text.german}
          </option>
          <option value="en" className="bg-[#102018] text-white">
            {text.english}
          </option>
        </select>
      </td>
    </>
  );
}