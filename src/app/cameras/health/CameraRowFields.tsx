// src/app/cameras/health/CameraRowFields.tsx #3
"use client";

import { useEffect, useMemo, useState } from "react";

type CameraStatus = "active" | "disabled";

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
}: {
  cameraId: string;
  initialStatus: CameraStatus;
  canManage: boolean;
  returnRevier: string;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
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
          disabled={!canManage}
          className="rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
          title={!canManage ? "Nur Owner oder Admin dürfen Kameras verwalten." : ""}
        >
          <option value="active" className="bg-[#102018] text-white">
            Active
          </option>
          <option value="disabled" className="bg-[#102018] text-white">
            Disabled
          </option>
        </select>
      </form>
    </td>
  );
}