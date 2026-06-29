// src/app/orga/reviere/[id]/edit/RevierMapObjectRowControls.tsx #4
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
        nameRequired: "Name is required.",
        latitudeRequired: "Latitude is required.",
        longitudeRequired: "Longitude is required.",
        latitudeInvalid: "Latitude must be between -90 and 90.",
        longitudeInvalid: "Longitude must be between -180 and 180.",
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
        nameRequired: "Name ist erforderlich.",
        latitudeRequired: "Breitengrad ist erforderlich.",
        longitudeRequired: "Längengrad ist erforderlich.",
        latitudeInvalid: "Breitengrad muss zwischen -90 und 90 liegen.",
        longitudeInvalid: "Längengrad muss zwischen -180 und 180 liegen.",
      };
}

function formatCoordinate(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toFixed(6);
}

type CoordinateKind = "latitude" | "longitude";

function parseCoordinateInput(value: string) {
  const normalized = value.trim().replace(",", ".").toUpperCase();

  if (!normalized) return null;

  const match = normalized.match(/[+-]?\d+(?:\.\d+)?/);

  if (!match) return Number.NaN;

  const parsed = Number(match[0]);

  if (!Number.isFinite(parsed)) return Number.NaN;

  if (/\b[SW]\b/.test(normalized)) {
    return -Math.abs(parsed);
  }

  return parsed;
}

function getCoordinateError(
  value: string,
  kind: CoordinateKind,
  text: ReturnType<typeof t>
) {
  const trimmed = value.trim();

  if (!trimmed) {
    return kind === "latitude"
      ? text.latitudeRequired
      : text.longitudeRequired;
  }

  const parsed = parseCoordinateInput(trimmed);

  if (parsed === null || !Number.isFinite(parsed)) {
    return kind === "latitude" ? text.latitudeInvalid : text.longitudeInvalid;
  }

  if (kind === "latitude" && (parsed < -90 || parsed > 90)) {
    return text.latitudeInvalid;
  }

  if (kind === "longitude" && (parsed < -180 || parsed > 180)) {
    return text.longitudeInvalid;
  }

  return null;
}

function validationBorderClass(hasError: boolean) {
  return hasError
    ? "border-rose-300/40 bg-rose-300/10"
    : "border-white/10 bg-white/5";
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;

  return (
    <p id={id} className="mt-1 max-w-44 text-xs leading-snug text-rose-100">
      {message}
    </p>
  );
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

  const nameInputRef = useRef<HTMLInputElement>(null);
  const latitudeInputRef = useRef<HTMLInputElement>(null);
  const longitudeInputRef = useRef<HTMLInputElement>(null);

  const [nameTouched, setNameTouched] = useState(false);
  const [latitudeTouched, setLatitudeTouched] = useState(false);
  const [longitudeTouched, setLongitudeTouched] = useState(false);

  const initialLatitudeText = formatCoordinate(initialLatitude ?? null);
  const initialLongitudeText = formatCoordinate(initialLongitude ?? null);
  const description = initialDescription ?? "";

  const nameError = name.trim() ? null : text.nameRequired;
  const latitudeError = getCoordinateError(latitude, "latitude", text);
  const longitudeError = getCoordinateError(longitude, "longitude", text);

  const visibleNameError = nameTouched ? nameError : null;
  const visibleLatitudeError = latitudeTouched ? latitudeError : null;
  const visibleLongitudeError = longitudeTouched ? longitudeError : null;

  const nameErrorId = `${formId}-name-error`;
  const latitudeErrorId = `${formId}-latitude-error`;
  const longitudeErrorId = `${formId}-longitude-error`;

  const dirty =
    type !== (initialType ?? "high_seat") ||
    name !== (initialName ?? "") ||
    latitude !== initialLatitudeText ||
    longitude !== initialLongitudeText ||
    status !== (initialStatus ?? "active");

  useEffect(() => {
    nameInputRef.current?.setCustomValidity(nameError ?? "");
  }, [nameError]);

  useEffect(() => {
    latitudeInputRef.current?.setCustomValidity(latitudeError ?? "");
  }, [latitudeError]);

  useEffect(() => {
    longitudeInputRef.current?.setCustomValidity(longitudeError ?? "");
  }, [longitudeError]);

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
          {objectId ? (
            <input type="hidden" name="object_id" value={objectId} />
          ) : null}
          <input type="hidden" name="description" value={description} />

          <select
            form={formId}
            name="type"
            value={type}
            onChange={(event) =>
              setType(event.target.value as RevierMapObjectType)
            }
            disabled={isDemo}
            required
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

      <td className="px-4 py-3 align-top">
        <input
          ref={nameInputRef}
          form={formId}
          name="name"
          type="text"
          value={name}
          onChange={(event) => {
            setNameTouched(true);
            setName(event.target.value);
          }}
          onBlur={() => setNameTouched(true)}
          onInvalid={() => setNameTouched(true)}
          disabled={isDemo}
          required
          placeholder={text.namePlaceholder}
          aria-invalid={visibleNameError ? true : undefined}
          aria-describedby={visibleNameError ? nameErrorId : undefined}
          className={`w-44 rounded-[10px] border px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35 ${validationBorderClass(
            Boolean(visibleNameError)
          )}`}
          title={isDemo ? text.demoReadOnly : ""}
        />
        <FieldError id={nameErrorId} message={visibleNameError} />
      </td>

      <td className="px-4 py-3 align-top">
        <input
          ref={latitudeInputRef}
          form={formId}
          name="latitude"
          type="text"
          inputMode="decimal"
          value={latitude}
          onChange={(event) => {
            setLatitudeTouched(true);
            setLatitude(event.target.value);
          }}
          onBlur={() => setLatitudeTouched(true)}
          onInvalid={() => setLatitudeTouched(true)}
          disabled={isDemo}
          required
          placeholder={text.latitudePlaceholder}
          aria-invalid={visibleLatitudeError ? true : undefined}
          aria-describedby={visibleLatitudeError ? latitudeErrorId : undefined}
          className={`w-32 rounded-[10px] border px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35 ${validationBorderClass(
            Boolean(visibleLatitudeError)
          )}`}
          title={isDemo ? text.demoReadOnly : ""}
        />
        <FieldError id={latitudeErrorId} message={visibleLatitudeError} />
      </td>

      <td className="px-4 py-3 align-top">
        <input
          ref={longitudeInputRef}
          form={formId}
          name="longitude"
          type="text"
          inputMode="decimal"
          value={longitude}
          onChange={(event) => {
            setLongitudeTouched(true);
            setLongitude(event.target.value);
          }}
          onBlur={() => setLongitudeTouched(true)}
          onInvalid={() => setLongitudeTouched(true)}
          disabled={isDemo}
          required
          placeholder={text.longitudePlaceholder}
          aria-invalid={visibleLongitudeError ? true : undefined}
          aria-describedby={visibleLongitudeError ? longitudeErrorId : undefined}
          className={`w-32 rounded-[10px] border px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35 ${validationBorderClass(
            Boolean(visibleLongitudeError)
          )}`}
          title={isDemo ? text.demoReadOnly : ""}
        />
        <FieldError id={longitudeErrorId} message={visibleLongitudeError} />
      </td>

      <td className="px-4 py-3 align-middle">
        <select
          form={formId}
          name="status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as RevierMapObjectStatus)
          }
          disabled={isDemo}
          required
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