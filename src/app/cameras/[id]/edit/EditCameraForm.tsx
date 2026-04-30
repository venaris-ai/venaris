// src/app/cameras/[id]/edit/EditCameraForm.tsx #1
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppLanguage } from "@/lib/i18n";

type Revier = {
  id: string;
  name: string;
  organization_id: string | null;
  status: "active" | "paused" | "archived";
  is_default: boolean;
};

type Camera = {
  id: string;
  name: string;
  revier_id: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  direction_deg: number | null;
  notes: string | null;
  is_active: boolean;
  technical_name: string | null;
  import_method: string | null;
};

type CameraVendorOption = {
  key: string;
  label: string;
};

type Props = {
  camera: Camera;
  reviers: Revier[];
  returnRevier: string;
  vendors: CameraVendorOption[];
  currentVendor: string;
  isDemo?: boolean;
  language: AppLanguage;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      metaTitle: "Camera reference",
      metaText: "Provisioning fields are read-only here.",
      technicalName: "Technical name",
      method: "Method",
      vendor: "Vendor",
      cameraName: "Camera name",
      ground: "Ground",
      locationName: "Location name (optional)",
      locationPlaceholder: "e.g. Forest edge west",
      latitude: "Latitude (optional)",
      longitude: "Longitude (optional)",
      direction: "Direction (0–359, optional)",
      notes: "Notes (optional)",
      notesPlaceholder: "Optional setup notes",
      status: "Status",
      active: "Active",
      disabled: "Disabled",
      paused: "Paused",
      archived: "Archived",
      save: "Save changes",
      saving: "Saving...",
      cancel: "Cancel",
      selectGround: "Please select a ground.",
      invalidDirection: "Direction must be between 0 and 359.",
      updateFailed: "Failed to update camera",
      unexpectedError: "Unexpected error",
      demoReadOnly: "Demo mode: changes are disabled.",
      demoMode: "Demo mode",
      demoTitle: "Demo mode",
      demoText:
        "This is a demo account. Records cannot be deleted, added, or changed.",
      understood: "Understood",
    };
  }

  return {
    metaTitle: "Kamera-Referenz",
    metaText: "Provisioning-Felder sind hier nur lesbar.",
    technicalName: "Technical Name",
    method: "Methode",
    vendor: "Hersteller",
    cameraName: "Kameraname",
    ground: "Revier",
    locationName: "Standortname (optional)",
    locationPlaceholder: "z. B. Waldrand West",
    latitude: "Breitengrad (optional)",
    longitude: "Längengrad (optional)",
    direction: "Richtung (0–359, optional)",
    notes: "Notizen (optional)",
    notesPlaceholder: "Optionale Setup-Notizen",
    status: "Status",
    active: "Aktiv",
    disabled: "Deaktiviert",
    paused: "Pausiert",
    archived: "Archiviert",
    save: "Änderungen speichern",
    saving: "Wird gespeichert...",
    cancel: "Abbrechen",
    selectGround: "Bitte ein Revier auswählen.",
    invalidDirection: "Richtung muss zwischen 0 und 359 liegen.",
    updateFailed: "Kamera konnte nicht aktualisiert werden",
    unexpectedError: "Unerwarteter Fehler",
    demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
    demoMode: "Demo-Modus",
    demoTitle: "Demo-Modus",
    demoText:
      "Das ist ein Demo-Account. Datensätze können weder entfernt noch hinzugefügt oder geändert werden.",
    understood: "Verstanden",
  };
}

function formatRevierLabel(revier: Revier, language: AppLanguage) {
  const text = t(language);

  if (revier.status === "paused") return `${revier.name} (${text.paused})`;
  if (revier.status === "archived") return `${revier.name} (${text.archived})`;
  return revier.name;
}

function formatMethod(value: string | null, language: AppLanguage) {
  if (!value) return "—";
  if (value === "smtp") return "SMTP";
  if (value === "ftp") return "FTP";
  if (value === "manual") return language === "en" ? "Manual" : "Manuell";
  return value;
}

function buildReturnHref(returnRevier: string) {
  return returnRevier
    ? `/cameras/health?revier=${encodeURIComponent(returnRevier)}`
    : "/cameras/health";
}

function buildChangedHref(returnRevier: string) {
  return returnRevier
    ? `/cameras/health?revier=${encodeURIComponent(returnRevier)}&changed=1`
    : "/cameras/health?changed=1";
}

export default function EditCameraForm({
  camera,
  reviers,
  returnRevier,
  vendors,
  currentVendor,
  isDemo = false,
  language,
}: Props) {
  const text = t(language);
  const router = useRouter();

  const [cameraName, setCameraName] = useState(camera.name);
  const [vendor, setVendor] = useState(currentVendor || vendors[0]?.key || "");
  const [revierId, setRevierId] = useState(camera.revier_id);
  const [locationName, setLocationName] = useState(camera.location_name ?? "");
  const [latitude, setLatitude] = useState(
    camera.latitude === null ? "" : String(camera.latitude)
  );
  const [longitude, setLongitude] = useState(
    camera.longitude === null ? "" : String(camera.longitude)
  );
  const [directionDeg, setDirectionDeg] = useState(
    camera.direction_deg === null ? "" : String(camera.direction_deg)
  );
  const [notes, setNotes] = useState(camera.notes ?? "");
  const [status, setStatus] = useState(camera.is_active ? "active" : "disabled");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDemoModal, setShowDemoModal] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (isDemo) {
      setShowDemoModal(true);
      return;
    }

    if (!revierId) {
      setError(text.selectGround);
      return;
    }

    const parsedDirection = directionDeg === "" ? null : Number(directionDeg);
    if (
      parsedDirection !== null &&
      (!Number.isInteger(parsedDirection) || parsedDirection < 0 || parsedDirection >= 360)
    ) {
      setError(text.invalidDirection);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/cameras/${camera.id}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          revierId,
          cameraName,
          locationName: locationName || null,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          directionDeg: parsedDirection,
          notes: notes || null,
          isActive: status === "active",
          vendor,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.details || json?.error || text.updateFailed);
        return;
      }

      router.push(buildChangedHref(returnRevier));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : text.unexpectedError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">{text.metaTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-white/68">{text.metaText}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/72">
            <span className="font-medium text-white">{text.technicalName}:</span>{" "}
            {camera.technical_name ?? "—"}
          </div>
          <div className="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/72">
            <span className="font-medium text-white">{text.method}:</span>{" "}
            {formatMethod(camera.import_method, language)}
          </div>
        </div>
      </section>

      {isDemo ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">{text.demoReadOnly}</p>
        </section>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-white">
              {text.cameraName}
            </label>
            <input
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              required
              disabled={loading || isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">
              {text.vendor}
            </label>
            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none disabled:bg-white/5 disabled:text-white/35"
              required
              disabled={loading || isDemo || vendors.length === 0}
              title={isDemo ? text.demoReadOnly : ""}
            >
              {vendors.map((vendorOption) => (
                <option
                  key={vendorOption.key}
                  value={vendorOption.key}
                  className="bg-[#102018] text-white"
                >
                  {vendorOption.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">
              {text.ground}
            </label>
            <select
              value={revierId}
              onChange={(e) => setRevierId(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none disabled:bg-white/5 disabled:text-white/35"
              required
              disabled={loading || isDemo || reviers.length === 0}
              title={isDemo ? text.demoReadOnly : ""}
            >
              {reviers.map((revier) => (
                <option key={revier.id} value={revier.id} className="bg-[#102018] text-white">
                  {formatRevierLabel(revier, language)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">
              {text.locationName}
            </label>
            <input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              placeholder={text.locationPlaceholder}
              disabled={loading || isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">
              {text.latitude}
            </label>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              placeholder="52.123456"
              disabled={loading || isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">
              {text.longitude}
            </label>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              placeholder="8.123456"
              disabled={loading || isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">
              {text.direction}
            </label>
            <input
              type="number"
              min={0}
              max={359}
              step={1}
              value={directionDeg}
              onChange={(e) => setDirectionDeg(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              placeholder="180"
              disabled={loading || isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">
              {text.status}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none disabled:bg-white/5 disabled:text-white/35"
              disabled={loading || isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            >
              <option value="active" className="bg-[#102018] text-white">
                {text.active}
              </option>
              <option value="disabled" className="bg-[#102018] text-white">
                {text.disabled}
              </option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-white">
              {text.notes}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              placeholder={text.notesPlaceholder}
              disabled={loading || isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-[14px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || isDemo || reviers.length === 0}
            className="rounded-[14px] bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018] disabled:opacity-50"
          >
            {isDemo ? text.demoMode : loading ? text.saving : text.save}
          </button>

          <Link
            href={buildReturnHref(returnRevier)}
            className="rounded-[14px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:bg-white/8 hover:text-white"
          >
            {text.cancel}
          </Link>
        </div>
      </form>

      {showDemoModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[20px] border border-white/10 bg-[#102018] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">{text.demoTitle}</h3>
            <p className="mt-2 text-sm text-white/70">{text.demoText}</p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDemoModal(false)}
                className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:bg-white/8 hover:text-white"
              >
                {text.understood}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
