// src/app/cameras/health/CameraRowActions.tsx #3
"use client";

import { useEffect, useMemo, useState } from "react";

type DirtyEventDetail = {
  cameraId: string;
  dirty: boolean;
};

function SaveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3" />
      <path d="M9 17h6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function CameraRowActions({
  cameraId,
  canManage,
  returnRevier,
  removeAction,
}: {
  cameraId: string;
  canManage: boolean;
  returnRevier: string;
  removeAction: (formData: FormData) => void | Promise<void>;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const formId = useMemo(() => `camera-controls-${cameraId}`, [cameraId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<DirtyEventDetail>;
      if (customEvent.detail?.cameraId !== cameraId) return;
      setIsDirty(Boolean(customEvent.detail.dirty));
    };

    window.addEventListener("camera-row-dirty-change", handler);
    return () => {
      window.removeEventListener("camera-row-dirty-change", handler);
    };
  }, [cameraId]);

  const canSave = canManage && isDirty;

  return (
    <td className="px-6 py-4 text-right whitespace-nowrap">
      <div className="flex items-center justify-end gap-2">
        {canSave ? (
          <button
            type="submit"
            form={formId}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-gray-700 hover:bg-gray-50"
            aria-label="Änderungen speichern"
            title="Änderungen speichern"
          >
            <SaveIcon />
          </button>
        ) : (
          <span
            className="inline-flex h-8 w-8 items-center justify-center text-gray-300"
            aria-label="Änderungen speichern"
            title="Änderungen speichern"
          >
            <SaveIcon />
          </span>
        )}

        {canManage ? (
          <form
            action={removeAction}
            onSubmit={(e) => {
              const ok = window.confirm(
                "Sind Sie sicher, dass Sie die Kamera dauerhaft entfernen möchten?"
              );
              if (!ok) e.preventDefault();
            }}
          >
            <input type="hidden" name="camera_id" value={cameraId} />
            <input type="hidden" name="return_revier" value={returnRevier} />
            <button
              type="submit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-gray-700 hover:bg-gray-50"
              aria-label="Kamera dauerhaft entfernen"
              title="Kamera dauerhaft entfernen"
            >
              <TrashIcon />
            </button>
          </form>
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center text-gray-300">
            <TrashIcon />
          </span>
        )}
      </div>
    </td>
  );
}