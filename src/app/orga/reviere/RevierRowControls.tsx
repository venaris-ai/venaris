// src/app/orga/reviere/RevierRowControls.tsx #2
"use client";

import { useEffect, useMemo, useState } from "react";

type RevierStatus = "active" | "paused" | "archived";

function emitDirtyState(revierId: string, dirty: boolean) {
  window.dispatchEvent(
    new CustomEvent("revier-row-dirty-change", {
      detail: { revierId, dirty },
    })
  );
}

export default function RevierRowControls({
  revierId,
  initialName,
  initialAreaHa,
  initialStatus,
  saveAction,
}: {
  revierId: string;
  initialName: string;
  initialAreaHa: number;
  initialStatus: RevierStatus;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [areaHa, setAreaHa] = useState(String(initialAreaHa));
  const [status, setStatus] = useState<RevierStatus>(initialStatus);

  const formId = useMemo(() => `revier-controls-${revierId}`, [revierId]);

  const dirty =
    name !== initialName ||
    areaHa !== String(initialAreaHa) ||
    status !== initialStatus;

  useEffect(() => {
    emitDirtyState(revierId, dirty);
    return () => {
      emitDirtyState(revierId, false);
    };
  }, [revierId, dirty]);

  return (
    <>
      <td className="px-6 py-4">
        <form id={formId} action={saveAction}>
          <input type="hidden" name="revier_id" value={revierId} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="area_ha" value={areaHa} />
          <input type="hidden" name="status" value={status} />

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full min-w-[220px] rounded-md border px-2.5 py-1.5 text-sm"
            aria-label="Reviername"
          />
        </form>
      </td>

      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
        <input
          type="number"
          min={1}
          step={1}
          value={areaHa}
          onChange={(e) => setAreaHa(e.target.value)}
          className="w-24 rounded-md border px-2.5 py-1.5 text-sm"
          aria-label="Fläche in ha"
        />
      </td>

      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as RevierStatus)}
          className="rounded-md border px-2.5 py-1.5 text-sm"
          aria-label="Status"
        >
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </td>
    </>
  );
}