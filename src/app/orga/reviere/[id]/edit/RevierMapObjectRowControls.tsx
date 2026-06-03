// src/app/orga/reviere/[id]/edit/RevierMapObjectRowControls.tsx #2
"use client";

import { useEffect, useMemo, useState } from "react";
import { type AppLanguage } from "@/lib/i18n";

export type RevierMapObjectType =
  | "high_seat"
  | "ladder"
  | "feeding_place"
  | "salt_lick"
  | "trap"
  | "other";

export type RevierMapObjectStatus = "active" | "inactive";

function emitDirtyState(rowKey: string, dirty: boolean) {
  window.dispatchEvent(
    new CustomEvent("revier-map-object-row-dirty-change", {
      detail: { rowKey, dirty },
    })
  );
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        demoReadOnly: "Demo mode: changes are disabled.",
        highSeat: "High seat",
        ladder: "Ladder",
        feedingPlace: "Bait site",
        saltLick: "Salt lick",
        trap: "Trap",
        other: "Other",
        active: "Active",
        inactive: "Inactive",
        namePlaceholder: "Name",
        latitudePlaceholder: "e.g. N 51.82752",
        longitudePlaceholder: "e.g. E 7.12735",
      }
    : {
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        highSeat: "Hochsitz",
        ladder: "Leiter",
        feedingPlace: "Kirrung",
        saltLick: "Salzlecke",
        trap: "Falle",
        other: "Sonstiges",
        active: "Aktiv",
        inactive: "Inaktiv",
        namePlaceholder: "Name",
        latitudePlaceholder: "z. B. N 51,82752",
        longitudePlaceholder: "z. B. O 7,12735",
      };
}

function formatCoordinate(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toFixed(6);
}

export default function RevierMapObjectRowControls({
  rowKey,
  objectId,
  initialName,
  initialType,
  initialDescription,
  initialLatitude,
  initialLongitude,
  initialStatus,
  saveAction,
  isDemo = false,
  language,
}: {
  rowKey: string;
  objectId?: string;
  initialName?: string;
  initialType?: RevierMapObjectType;
  initialDescription?: string | null;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialStatus?: RevierMapObjectStatus;
  saveAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
  language: AppLanguage;
}) {
  const text = t(language);

  const [type, setType] = useState<RevierMapObjectType>(
    initialType ?? "high_seat"
  );
  const [name, setName] = useState(initialName ?? "");
  const [latitude, setLatitude] = useState(formatCoordinate(initialLatitude ?? null));
  const [longitude, setLongitude] = useState(
    formatCoordinate(initialLongitude ?? null)
  );
  const [status, setStatus] = useState<RevierMapObjectStatus>(
    initialStatus ?? "active"
  );

  const formId = useMemo(() => `revier-map-object-controls-${rowKey}`, [rowKey]);

  const initialLatitudeText = formatCoordinate(initialLatitude ?? null);
  const initialLongitudeText = formatCoordinate(initialLongitude ?? null);
  const description = initialDescription ?? "";

  const dirty =
    type !== (initialType ?? "high_seat") ||
    name !== (initialName ?? "") ||
    latitude !== initialLatitudeText ||
    longitude !== initialLongitudeText ||
    status !== (initialStatus ?? "active");

  useEffect(() => {
    emitDirtyState(rowKey, dirty);
    return () => {
      emitDirtyState(rowKey, false);
    };
  }, [rowKey, dirty]);

  return (
    <>
      <td className="px-4 py-3 align-middle">
        <form id={formId} action={saveAction}>
          {objectId ? <input type="hidden" name="object_id" value={objectId} /> : null}
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="description" value={description} />
          <input type="hidden" name="latitude" value={latitude} />
          <input type="hidden" name="longitude" value={longitude} />
          <input type="hidden" name="status" value={status} />

          <select
            value={type}
            onChange={(event) => setType(event.target.value as RevierMapObjectType)}
            disabled={isDemo}
            className="w-32 rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
            title={isDemo ? text.demoReadOnly : ""}
          >
            <option value="high_seat" className="bg-[#102018] text-white">
              {text.highSeat}
            </option>
            <option value="ladder" className="bg-[#102018] text-white">
              {text.ladder}
            </option>
            <option value="feeding_place" className="bg-[#102018] text-white">
              {text.feedingPlace}
            </option>
            <option value="salt_lick" className="bg-[#102018] text-white">
              {text.saltLick}
            </option>
            <option value="trap" className="bg-[#102018] text-white">
              {text.trap}
            </option>
            <option value="other" className="bg-[#102018] text-white">
              {text.other}
            </option>
          </select>
        </form>
      </td>

      <td className="px-4 py-3 align-middle">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isDemo}
          placeholder={text.namePlaceholder}
          className="w-44 rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
          title={isDemo ? text.demoReadOnly : ""}
        />
      </td>

      <td className="px-4 py-3 align-middle">
        <input
          type="text"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
          disabled={isDemo}
          placeholder={text.latitudePlaceholder}
          className="w-32 rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
          title={isDemo ? text.demoReadOnly : ""}
        />
      </td>

      <td className="px-4 py-3 align-middle">
        <input
          type="text"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
          disabled={isDemo}
          placeholder={text.longitudePlaceholder}
          className="w-32 rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
          title={isDemo ? text.demoReadOnly : ""}
        />
      </td>

      <td className="px-4 py-3 align-middle">
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as RevierMapObjectStatus)
          }
          disabled={isDemo}
          className="w-24 rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
          title={isDemo ? text.demoReadOnly : ""}
        >
          <option value="active" className="bg-[#102018] text-white">
            {text.active}
          </option>
          <option value="inactive" className="bg-[#102018] text-white">
            {text.inactive}
          </option>
        </select>
      </td>
    </>
  );
}