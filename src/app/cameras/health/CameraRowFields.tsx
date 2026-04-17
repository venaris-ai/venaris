// src/app/cameras/health/CameraRowFields.tsx #6
"use client";

import { useEffect, useMemo, useState } from "react";
import { type AppLanguage } from "@/lib/i18n";

type CameraStatus = "active" | "disabled";

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      active: "Active",
      disabled: "Disabled",
      demoReadOnly: "Demo mode: changes are disabled.",
      notAllowed: "Only owner or admin can manage cameras.",
    };
  }

  return {
    active: "Aktiv",
    disabled: "Deaktiviert",
    demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
    notAllowed: "Nur Owner oder Admin dürfen Kameras verwalten.",
  };
}

function emitDirtyState(cameraId: string, dirty: boolean) {
  window.dispatchEvent(
    new CustomEvent("camera-row-dirty-change", {
      detail: { cameraId, dirty },
    })
  );
}

export default function CameraRowFields({
  cameraId,
  initialStatus,
  canManage,
  returnRevier,
  saveAction,
  isDemo = false,
  language,
}: {
  cameraId: string;
  initialStatus: CameraStatus;
  canManage: boolean;
  returnRevier: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
  language: AppLanguage;
}) {
  const text = t(language);
  const [status, setStatus] = useState<CameraStatus>(initialStatus);
  const formId = useMemo(() => `camera-controls-${cameraId}`, [cameraId]);
  const isDirty = status !== initialStatus;

  useEffect(() => {
    emitDirtyState(cameraId, isDirty);

    return () => {
      emitDirtyState(cameraId, false);
    };
  }, [cameraId, isDirty]);

  return (
    <td className="px-6 py-4 text-white/68 whitespace-nowrap">
      <form id={formId} action={saveAction}>
        <input type="hidden" name="camera_id" value={cameraId} />
        <input type="hidden" name="status" value={status} readOnly />
        <input type="hidden" name="return_revier" value={returnRevier} />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CameraStatus)}
          disabled={!canManage || isDemo}
          className="rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
          title={
            isDemo
              ? text.demoReadOnly
              : !canManage
                ? text.notAllowed
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
      </form>
    </td>
  );
}