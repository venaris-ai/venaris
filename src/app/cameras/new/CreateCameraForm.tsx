// src/app/cameras/new/CreateCameraForm.tsx #11
"use client";

import { useMemo, useState } from "react";
import type { AppLanguage } from "@/lib/i18n";
import type {
  SubscriptionActionPolicy,
  SubscriptionStatus,
} from "@/lib/billing/subscriptionPolicy";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type Revier = {
  id: string;
  name: string;
  organization_id: string | null;
  status: "active" | "paused" | "archived";
  is_default: boolean;
};

type Props = {
  organization: Organization;
  reviers: Revier[];
  currentCameraCount: number;
  maxCameras: number;
  cameraPolicy: SubscriptionActionPolicy;
  effectiveStatus: SubscriptionStatus;
  rawStatus: SubscriptionStatus;
  isDemo?: boolean;
  language: AppLanguage;
};

type CreateResponse = {
  ok: true;
  camera: {
    id: string;
    name: string;
    technicalName: string;
    ingestToken: string;
    routing: {
      smtpAlias: string | null;
      ftpUsername: string | null;
      ftpInboxPath: string | null;
      manualLabel: string | null;
    };
  };
  ftpProvisioning?: {
    host: string;
    port: number;
    username: string;
    password: string;
    path: string;
    passiveMode: boolean;
  };
};

const VENDORS = [
  "berger&schröter",
  "blazevideo",
  "braun",
  "bushnell",
  "gardepro",
  "hikmicro",
  "maginon",
  "minox",
  "reconyx",
  "reolink",
  "seissiger",
  "spypoint",
  "xview",
  "zeiss",
  "other",
] as const;

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      methods: [
        { value: "smtp", label: "SMTP / Email" },
        { value: "ftp", label: "FTP" },
        { value: "manual", label: "Manual import" },
      ] as const,
      usageTitle: "Camera usage",
      usageNow: "Currently used:",
      usageOf: "of",
      cameras: "cameras",
      trialExpiredHint:
        "Note: the trial has already expired in business logic and is treated effectively as `expired`.",
      demoReadOnly: "Demo mode: changes are disabled.",
      organization: "Organization",
      cameraName: "Camera name",
      cameraNamePlaceholder: "e.g. Reolink North Edge",
      method: "Method",
      vendor: "Vendor",
      ground: "Ground",
      locationName: "Location name (optional)",
      locationPlaceholder: "e.g. Forest edge west",
      latitude: "Latitude (optional)",
      longitude: "Longitude (optional)",
      direction: "Direction (0–359, optional)",
      notes: "Notes (optional)",
      notesPlaceholder: "Optional setup notes",
      selectGround: "Please select a ground.",
      createFailed: "Failed to create camera",
      unexpectedError: "Unexpected error",
      copied: "copied.",
      copyFailed: "Could not copy",
      createBlocked: "Camera creation blocked",
      creating: "Creating...",
      createCamera: "Create camera",
      createSuccess: "Camera was created successfully.",
      demoMode: "Demo mode",
      understood: "Understood",
      provisioningTitle: "Provisioning result",
      provisioningText:
        "The camera has been created successfully. The provisioning data is available later in Camera status.",
      coreProvisioning: "Core provisioning",
      coreProvisioningText: "Basic camera data for later reference.",
      copyBlock: "Copy block",
      cameraId: "Camera ID",
      technicalName: "Technical name",
      ingestToken: "Ingest token",
      ftpSetup: "FTP setup",
      ftpSetupText:
        "Enter these values into the camera. The FTP password is also available later in Camera status.",
      important:
        "Important: store these FTP settings in the camera configuration. You can view the password again later in Camera status.",
      ftpServer: "FTP server",
      ftpPort: "FTP port",
      ftpUsername: "FTP username",
      ftpPassword: "FTP password",
      path: "Path",
      passiveMode: "Passive mode",
      enabled: "Enabled",
      disabled: "Disabled",
      smtpSetup: "SMTP setup",
      smtpSetupText: "Use this email address in the camera configuration.",
      smtpAlias: "SMTP alias",
      manualSetup: "Manual import setup",
      manualSetupText:
        "This camera is ready for manual uploads in the Import section.",
      manualLabel: "Manual label",
      demoTitle: "Demo mode",
      demoText:
        "This is a demo account. Records cannot be deleted, added, or changed.",
      paused: "Paused",
      archived: "Archived",
      coreProvisioningLabel: "Core provisioning",
      ftpSetupLabel: "FTP setup",
      smtpSetupLabel: "SMTP setup",
      manualSetupLabel: "Manual import setup",
    };
  }

  return {
    methods: [
      { value: "smtp", label: "SMTP / E-Mail" },
      { value: "ftp", label: "FTP" },
      { value: "manual", label: "Manueller Import" },
    ] as const,
    usageTitle: "Kamera-Nutzung",
    usageNow: "Aktuell genutzt:",
    usageOf: "von",
    cameras: "Kameras",
    trialExpiredHint:
      "Hinweis: Der Trial ist fachlich bereits abgelaufen und wird effektiv als `expired` behandelt.",
    demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
    organization: "Organisation",
    cameraName: "Kameraname",
    cameraNamePlaceholder: "z. B. Reolink Nordkante",
    method: "Methode",
    vendor: "Hersteller",
    ground: "Revier",
    locationName: "Standortname (optional)",
    locationPlaceholder: "z. B. Waldrand West",
    latitude: "Breitengrad (optional)",
    longitude: "Längengrad (optional)",
    direction: "Richtung (0–359, optional)",
    notes: "Notizen (optional)",
    notesPlaceholder: "Optionale Setup-Notizen",
    selectGround: "Bitte ein Revier auswählen.",
    createFailed: "Kamera konnte nicht angelegt werden",
    unexpectedError: "Unerwarteter Fehler",
    copied: "kopiert.",
    copyFailed: "Konnte nicht kopieren:",
    createBlocked: "Kameraanlage gesperrt",
    creating: "Wird angelegt...",
    createCamera: "Kamera anlegen",
    createSuccess: "Kamera wurde erfolgreich angelegt.",
    demoMode: "Demo-Modus",
    understood: "Verstanden",
    provisioningTitle: "Provisioning-Ergebnis",
    provisioningText:
      "Die Kamera wurde erfolgreich angelegt. Die Provisioning-Daten sind später im Kamerastatus verfügbar.",
    coreProvisioning: "Core Provisioning",
    coreProvisioningText: "Basisdaten dieser Kamera für spätere Referenz.",
    copyBlock: "Block kopieren",
    cameraId: "Kamera-ID",
    technicalName: "Technical Name",
    ingestToken: "Ingest-Token",
    ftpSetup: "FTP-Setup",
    ftpSetupText:
      "Bitte diese Werte direkt in der Kamera eintragen. Das FTP-Passwort ist später auch im Kamerastatus verfügbar.",
    important:
      "Wichtig: Bitte diese FTP-Daten in der Kamera-Konfiguration eintragen. Das Passwort kann später im Kamerastatus erneut eingesehen werden.",
    ftpServer: "FTP-Server",
    ftpPort: "FTP-Port",
    ftpUsername: "FTP-Benutzername",
    ftpPassword: "FTP-Passwort",
    path: "Pfad",
    passiveMode: "Passivmodus",
    enabled: "Aktiviert",
    disabled: "Deaktiviert",
    smtpSetup: "SMTP-Setup",
    smtpSetupText:
      "Bitte diese E-Mail-Adresse in der Kamera-Konfiguration verwenden.",
    smtpAlias: "SMTP-Alias",
    manualSetup: "Setup manueller Import",
    manualSetupText:
      "Diese Kamera ist jetzt für manuelle Uploads im Import-Bereich bereit.",
    manualLabel: "Manual Label",
    demoTitle: "Demo-Modus",
    demoText:
      "Das ist ein Demo-Account. Datensätze können weder entfernt noch hinzugefügt oder geändert werden.",
    paused: "Pausiert",
    archived: "Archiviert",
    coreProvisioningLabel: "Core Provisioning",
    ftpSetupLabel: "FTP-Setup",
    smtpSetupLabel: "SMTP-Setup",
    manualSetupLabel: "Setup manueller Import",
  };
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

function badgeTone(allowed: boolean) {
  return allowed
    ? {
        wrap: "border-sky-300/20 bg-sky-300/10",
        title: "text-sky-100",
        text: "text-sky-100/85",
        hint: "text-sky-100/70",
        pill: "border-sky-300/25 bg-white/5 text-sky-100",
        bar: "bg-sky-300",
      }
    : {
        wrap: "border-rose-300/20 bg-rose-300/10",
        title: "text-rose-100",
        text: "text-rose-100/85",
        hint: "text-rose-100/70",
        pill: "border-rose-300/25 bg-white/5 text-rose-100",
        bar: "bg-rose-300",
      };
}

function buildCoreProvisioningCopy(
  camera: CreateResponse["camera"],
  language: AppLanguage
) {
  const text = t(language);

  return [
    text.coreProvisioningLabel,
    `${text.cameraId}: ${camera.id}`,
    `${text.technicalName}: ${camera.technicalName}`,
    `${text.ingestToken}: ${camera.ingestToken}`,
  ].join("\n");
}

function buildFtpProvisioningCopy(
  ftpProvisioning: NonNullable<CreateResponse["ftpProvisioning"]>,
  language: AppLanguage
) {
  const text = t(language);

  return [
    text.ftpSetupLabel,
    `${text.ftpServer}: ${ftpProvisioning.host}`,
    `${text.ftpPort}: ${ftpProvisioning.port}`,
    `${text.ftpUsername}: ${ftpProvisioning.username}`,
    `${text.ftpPassword}: ${ftpProvisioning.password}`,
    `${text.path}: ${ftpProvisioning.path}`,
    `${text.passiveMode}: ${ftpProvisioning.passiveMode ? text.enabled : text.disabled}`,
  ].join("\n");
}

function buildSmtpProvisioningCopy(smtpAlias: string, language: AppLanguage) {
  const text = t(language);
  return [text.smtpSetupLabel, `${text.smtpAlias}: ${smtpAlias}`].join("\n");
}

function buildManualProvisioningCopy(
  manualLabel: string,
  language: AppLanguage
) {
  const text = t(language);
  return [text.manualSetupLabel, `${text.manualLabel}: ${manualLabel}`].join(
    "\n"
  );
}

function formatRevierLabel(revier: Revier, language: AppLanguage) {
  const text = t(language);

  if (revier.status === "active") return revier.name;
  if (revier.status === "paused") return `${revier.name} (${text.paused})`;
  if (revier.status === "archived") return `${revier.name} (${text.archived})`;
  return revier.name;
}

export default function CreateCameraForm({
  organization,
  reviers,
  currentCameraCount,
  maxCameras,
  cameraPolicy,
  effectiveStatus,
  rawStatus,
  isDemo = false,
  language,
}: Props) {
  const text = t(language);
  const organizationId = organization.id;

  const filteredReviers = useMemo(() => {
    return reviers.filter((revier) => revier.organization_id === organizationId);
  }, [reviers, organizationId]);

  const defaultRevierId = useMemo(() => {
    const explicitDefault = filteredReviers.find((revier) => revier.is_default);
    return explicitDefault?.id ?? filteredReviers[0]?.id ?? "";
  }, [filteredReviers]);

  const [revierId, setRevierId] = useState(defaultRevierId);
  const [cameraName, setCameraName] = useState("");
  const [method, setMethod] = useState<"smtp" | "ftp" | "manual">("smtp");
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>("reolink");
  const [locationName, setLocationName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [directionDeg, setDirectionDeg] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [showDemoModal, setShowDemoModal] = useState(false);

  const usagePercent =
    maxCameras > 0 ? Math.min((currentCameraCount / maxCameras) * 100, 100) : 0;
  const tone = badgeTone(cameraPolicy.allowed);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (isDemo) {
      setShowDemoModal(true);
      return;
    }

    if (!cameraPolicy.allowed) {
      setError(cameraPolicy.message);
      return;
    }

    if (!revierId) {
      setError(text.selectGround);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setCopyMsg("");

    try {
      const res = await fetch("/api/cameras/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          revierId,
          cameraName,
          method,
          vendor,
          locationName: locationName || null,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          directionDeg: directionDeg ? Number(directionDeg) : null,
          notes: notes || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.details || json?.error || text.createFailed);
        return;
      }

      setResult(json as CreateResponse);

      setCameraName("");
      setLocationName("");
      setLatitude("");
      setLongitude("");
      setDirectionDeg("");
      setNotes("");
      setRevierId(defaultRevierId);
    } catch (err) {
      setError(err instanceof Error ? err.message : text.unexpectedError);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(label: string, value: string | null | undefined) {
    if (!value) return;

    try {
      await copyText(value);
      setCopyMsg(`${label} ${text.copied}`);
      window.setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setCopyMsg(`${text.copyFailed} ${label.toLowerCase()}.`);
      window.setTimeout(() => setCopyMsg(""), 2000);
    }
  }

  const camera = result?.camera ?? null;
  const ftpProvisioning = result?.ftpProvisioning ?? null;
  const formDisabled = isDemo || !cameraPolicy.allowed;

  return (
    <div className="space-y-6">
      <section className={`rounded-[28px] border p-5 backdrop-blur-sm ${tone.wrap}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={`text-base font-semibold ${tone.title}`}>{text.usageTitle}</h2>
            <p className={`mt-1 text-sm leading-6 ${tone.text}`}>
              {cameraPolicy.message}
            </p>
            <p className={`mt-1 text-xs ${tone.hint}`}>
              {text.usageNow} {currentCameraCount} {text.usageOf} {maxCameras} {text.cameras}.
            </p>
          </div>

          <div className={`rounded-[14px] border px-3 py-2 text-sm font-medium ${tone.pill}`}>
            {currentCameraCount} / {maxCameras}
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div
            className={`h-2 rounded-full ${tone.bar}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>

        {effectiveStatus !== rawStatus ? (
          <p className="mt-3 text-xs text-rose-200">{text.trialExpiredHint}</p>
        ) : null}
      </section>

      {isDemo ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">{text.demoReadOnly}</p>
        </section>
      ) : null}

      {camera ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm font-medium text-emerald-100">
            {text.createSuccess}
          </p>
          <p className="mt-1 text-sm text-emerald-100/75">
            {text.provisioningText}
          </p>
        </section>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-white">{text.organization}</label>
            <div className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/72">
              {organization.name}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-white">{text.cameraName}</label>
            <input
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              placeholder={text.cameraNamePlaceholder}
              required
              disabled={formDisabled}
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">{text.method}</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as "smtp" | "ftp" | "manual")}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none disabled:bg-white/5 disabled:text-white/35"
              required
              disabled={formDisabled}
              title={isDemo ? text.demoReadOnly : ""}
            >
              {text.methods.map((methodOption) => (
                <option
                  key={methodOption.value}
                  value={methodOption.value}
                  className="bg-[#102018] text-white"
                >
                  {methodOption.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">{text.vendor}</label>
            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value as (typeof VENDORS)[number])}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none disabled:bg-white/5 disabled:text-white/35"
              required
              disabled={formDisabled}
              title={isDemo ? text.demoReadOnly : ""}
            >
              {VENDORS.map((vendorOption) => (
                <option key={vendorOption} value={vendorOption} className="bg-[#102018] text-white">
                  {vendorOption}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-white">{text.ground}</label>
            <select
              value={revierId}
              onChange={(e) => setRevierId(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none disabled:bg-white/5 disabled:text-white/35"
              required
              disabled={formDisabled || filteredReviers.length === 0}
              title={isDemo ? text.demoReadOnly : ""}
            >
              {filteredReviers.map((revier) => (
                <option key={revier.id} value={revier.id} className="bg-[#102018] text-white">
                  {formatRevierLabel(revier, language)}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-white">
              {text.locationName}
            </label>
            <input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              placeholder={text.locationPlaceholder}
              disabled={formDisabled}
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
              disabled={formDisabled}
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
              disabled={formDisabled}
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
              disabled={formDisabled}
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-white">{text.notes}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              placeholder={text.notesPlaceholder}
              disabled={formDisabled}
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
            disabled={loading || !cameraPolicy.allowed || filteredReviers.length === 0}
            className="rounded-[14px] bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018] disabled:opacity-50"
          >
            {isDemo
              ? text.demoMode
              : !cameraPolicy.allowed
                ? text.createBlocked
                : loading
                  ? text.creating
                  : text.createCamera}
          </button>
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

      {camera ? (
        <div className="space-y-5 rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-semibold text-white">{text.provisioningTitle}</h2>
            <p className="mt-1 text-sm text-white/68">{text.provisioningText}</p>
          </div>

          {copyMsg ? (
            <div className="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/72">
              {copyMsg}
            </div>
          ) : null}

          <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">{text.coreProvisioning}</h3>
                <p className="mt-1 text-sm text-white/68">{text.coreProvisioningText}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy(text.coreProvisioning, buildCoreProvisioningCopy(camera, language))
                }
                className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
              >
                {text.copyBlock}
              </button>
            </div>

            <div className="grid gap-2 text-sm text-white/78">
              <div>
                <span className="font-medium text-white">{text.cameraId}:</span> {camera.id}
              </div>
              <div>
                <span className="font-medium text-white">{text.technicalName}:</span> {camera.technicalName}
              </div>
              <div className="break-all">
                <span className="font-medium text-white">{text.ingestToken}:</span> {camera.ingestToken}
              </div>
            </div>
          </div>

          {ftpProvisioning ? (
            <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">{text.ftpSetup}</h3>
                  <p className="mt-1 text-sm text-white/68">{text.ftpSetupText}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(text.ftpSetup, buildFtpProvisioningCopy(ftpProvisioning, language))
                  }
                  className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
                >
                  {text.copyBlock}
                </button>
              </div>

              <div className="rounded-[14px] border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                {text.important}
              </div>

              <div className="grid gap-2 text-sm text-white/78">
                <div>
                  <span className="font-medium text-white">{text.ftpServer}:</span> {ftpProvisioning.host}
                </div>
                <div>
                  <span className="font-medium text-white">{text.ftpPort}:</span> {ftpProvisioning.port}
                </div>
                <div>
                  <span className="font-medium text-white">{text.ftpUsername}:</span> {ftpProvisioning.username}
                </div>
                <div className="rounded-[14px] border border-white/10 bg-white/5 px-3 py-3 text-white">
                  <span className="font-medium">{text.ftpPassword}:</span> {ftpProvisioning.password}
                </div>
                <div>
                  <span className="font-medium text-white">{text.path}:</span> {ftpProvisioning.path}
                </div>
                <div>
                  <span className="font-medium text-white">{text.passiveMode}:</span>{" "}
                  {ftpProvisioning.passiveMode ? text.enabled : text.disabled}
                </div>
              </div>
            </div>
          ) : null}

          {!ftpProvisioning && camera.routing.smtpAlias ? (
            <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">{text.smtpSetup}</h3>
                  <p className="mt-1 text-sm text-white/68">{text.smtpSetupText}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    camera.routing.smtpAlias
                      ? handleCopy(
                          text.smtpSetup,
                          buildSmtpProvisioningCopy(camera.routing.smtpAlias, language)
                        )
                      : undefined
                  }
                  className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
                >
                  {text.copyBlock}
                </button>
              </div>

              <div className="grid gap-2 text-sm text-white/78">
                <div>
                  <span className="font-medium text-white">{text.smtpAlias}:</span> {camera.routing.smtpAlias}
                </div>
              </div>
            </div>
          ) : null}

          {!ftpProvisioning && camera.routing.manualLabel ? (
            <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">{text.manualSetup}</h3>
                  <p className="mt-1 text-sm text-white/68">{text.manualSetupText}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    camera.routing.manualLabel
                      ? handleCopy(
                          text.manualSetup,
                          buildManualProvisioningCopy(camera.routing.manualLabel, language)
                        )
                      : undefined
                  }
                  className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
                >
                  {text.copyBlock}
                </button>
              </div>

              <div className="grid gap-2 text-sm text-white/78">
                <div>
                  <span className="font-medium text-white">{text.manualLabel}:</span> {camera.routing.manualLabel}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}