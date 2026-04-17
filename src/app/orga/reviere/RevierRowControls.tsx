// src/app/orga/reviere/RevierRowControls.tsx #6
"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppLanguage } from "@/lib/i18n";

type RevierStatus = "active" | "paused" | "archived";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        demoReadOnly: "Demo mode: changes are disabled.",
        active: "Active",
        paused: "Paused",
        archived: "Archived",
      }
    : {
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        active: "Active",
        paused: "Paused",
        archived: "Archived",
      };
}

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
  isDemo = false,
  language,
}: {
  revierId: string;
  initialName: string;
  initialAreaHa: number;
  initialStatus: RevierStatus;
  saveAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
  language: AppLanguage;
}) {
  const text = t(language);
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
      <td className="px-6 py-4 text-white/68 whitespace-nowrap">
        <form id={formId} action={saveAction}>
          <input type="hidden" name="revier_id" value={revierId} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="area_ha" value={areaHa} />
          <input type="hidden" name="status" value={status} />

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isDemo}
            className="w-full rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
            title={isDemo ? text.demoReadOnly : ""}
          />
        </form>
      </td>

      <td className="px-6 py-4 text-white/68 whitespace-nowrap">
        <input
          value={areaHa}
          onChange={(e) => setAreaHa(e.target.value)}
          disabled={isDemo}
          className="w-24 rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
          title={isDemo ? text.demoReadOnly : ""}
        />
      </td>

      <td className="px-6 py-4 text-white/68 whitespace-nowrap">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as RevierStatus)}
          disabled={isDemo}
          className="rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
          title={isDemo ? text.demoReadOnly : ""}
        >
          <option value="active" className="bg-[#102018] text-white">
            {text.active}
          </option>
          <option value="paused" className="bg-[#102018] text-white">
            {text.paused}
          </option>
          <option value="archived" className="bg-[#102018] text-white">
            {text.archived}
          </option>
        </select>
      </td>
    </>
  );
}