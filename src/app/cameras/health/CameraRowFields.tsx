// src/app/cameras/health/CameraRowFields.tsx #2
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
    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
      <form id={formId} action={saveAction}>
        <input type="hidden" name="camera_id" value={cameraId} />
        <input type="hidden" name="status" value={status} readOnly />
        <input type="hidden" name="return_revier" value={returnRevier} />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CameraStatus)}
          disabled={!canManage}
          className="rounded-md border px-2.5 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          title={!canManage ? "Nur Owner oder Admin dürfen Kameras verwalten." : ""}
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </form>
    </td>
  );
}