// src/app/cameras/new/CreateCameraForm.tsx #4
"use client";

import { useMemo, useState } from "react";
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
};

type Props = {
  organization: Organization;
  reviers: Revier[];
  currentCameraCount: number;
  maxCameras: number;
  cameraPolicy: SubscriptionActionPolicy;
  effectiveStatus: SubscriptionStatus;
  rawStatus: SubscriptionStatus;
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

const METHODS = [
  { value: "smtp", label: "SMTP / E-Mail" },
  { value: "ftp", label: "FTP" },
  { value: "manual", label: "Manual Import" },
] as const;

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

function badgeTone(allowed: boolean) {
  return allowed
    ? {
        wrap: "border-blue-200 bg-blue-50",
        title: "text-blue-900",
        text: "text-blue-900/80",
        hint: "text-blue-900/70",
        pill: "border-blue-300 bg-white text-blue-900",
        bar: "bg-blue-700",
      }
    : {
        wrap: "border-red-200 bg-red-50",
        title: "text-red-900",
        text: "text-red-800",
        hint: "text-red-700",
        pill: "border-red-300 bg-white text-red-900",
        bar: "bg-red-600",
      };
}

function buildCoreProvisioningCopy(camera: CreateResponse["camera"]) {
  return [
    "Provisioning Result",
    `Camera ID: ${camera.id}`,
    `Technical Name: ${camera.technicalName}`,
    `Ingest Token: ${camera.ingestToken}`,
  ].join("\n");
}

function buildFtpProvisioningCopy(
  ftpProvisioning: NonNullable<CreateResponse["ftpProvisioning"]>
) {
  return [
    "FTP Setup",
    `FTP Server: ${ftpProvisioning.host}`,
    `FTP Port: ${ftpProvisioning.port}`,
    `FTP Username: ${ftpProvisioning.username}`,
    `FTP Password: ${ftpProvisioning.password}`,
    `Path: ${ftpProvisioning.path}`,
    `Passive Mode: ${ftpProvisioning.passiveMode ? "Enabled" : "Disabled"}`,
  ].join("\n");
}

function buildSmtpProvisioningCopy(smtpAlias: string) {
  return ["SMTP Setup", `SMTP Alias: ${smtpAlias}`].join("\n");
}

function buildManualProvisioningCopy(manualLabel: string) {
  return ["Manual Import Setup", `Manual Label: ${manualLabel}`].join("\n");
}

export default function CreateCameraForm({
  organization,
  reviers,
  currentCameraCount,
  maxCameras,
  cameraPolicy,
  effectiveStatus,
  rawStatus,
}: Props) {
  const organizationId = organization.id;
  const [revierId, setRevierId] = useState("");
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

  const filteredReviers = useMemo(() => {
    return reviers.filter((r) => r.organization_id === organizationId);
  }, [reviers, organizationId]);

  const usagePercent =
    maxCameras > 0 ? Math.min((currentCameraCount / maxCameras) * 100, 100) : 0;
  const tone = badgeTone(cameraPolicy.allowed);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!cameraPolicy.allowed) {
      setError(cameraPolicy.message);
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
          revierId: revierId || null,
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
        setError(json?.details || json?.error || "Failed to create camera");
        return;
      }

      setResult(json as CreateResponse);

      setCameraName("");
      setLocationName("");
      setLatitude("");
      setLongitude("");
      setDirectionDeg("");
      setNotes("");
      setRevierId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(label: string, value: string | null | undefined) {
    if (!value) return;
    try {
      await copyText(value);
      setCopyMsg(`${label} copied.`);
      window.setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setCopyMsg(`Could not copy ${label.toLowerCase()}.`);
      window.setTimeout(() => setCopyMsg(""), 2000);
    }
  }

  const camera = result?.camera ?? null;
  const ftpProvisioning = result?.ftpProvisioning ?? null;

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border p-5 shadow-sm ${tone.wrap}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={`text-base font-semibold ${tone.title}`}>Kamera-Nutzung</h2>
            <p className={`mt-1 text-sm leading-6 ${tone.text}`}>
              {cameraPolicy.message}
            </p>
            <p className={`mt-1 text-xs ${tone.hint}`}>
              Aktuell genutzt: {currentCameraCount} von {maxCameras} Kameras.
            </p>
          </div>

          <div className={`rounded-xl border px-3 py-2 text-sm font-medium ${tone.pill}`}>
            {currentCameraCount} / {maxCameras}
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-white/70">
          <div
            className={`h-2 rounded-full ${tone.bar}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>

        {effectiveStatus !== rawStatus ? (
          <p className="mt-3 text-xs text-red-700">
            Hinweis: Der Trial ist fachlich bereits abgelaufen und wird effektiv als
            `expired` behandelt.
          </p>
        ) : null}
      </section>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Organization</label>
            <div className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              {organization.name} ({organization.slug})
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Camera Name</label>
            <input
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="e.g. Reolink North Edge"
              required
              disabled={!cameraPolicy.allowed}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as "smtp" | "ftp" | "manual")}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              required
              disabled={!cameraPolicy.allowed}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Vendor</label>
            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value as (typeof VENDORS)[number])}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              required
              disabled={!cameraPolicy.allowed}
            >
              {VENDORS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Revier (optional)</label>
            <select
              value={revierId}
              onChange={(e) => setRevierId(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              disabled={!cameraPolicy.allowed}
            >
              <option value="">No revier assigned</option>
              {filteredReviers.map((revier) => (
                <option key={revier.id} value={revier.id}>
                  {revier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Location Name (optional)</label>
            <input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="e.g. Forest edge west"
              disabled={!cameraPolicy.allowed}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Latitude (optional)</label>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="52.123456"
              disabled={!cameraPolicy.allowed}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Longitude (optional)</label>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="8.123456"
              disabled={!cameraPolicy.allowed}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Direction (0–359, optional)
            </label>
            <input
              type="number"
              min={0}
              max={359}
              step={1}
              value={directionDeg}
              onChange={(e) => setDirectionDeg(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="180"
              disabled={!cameraPolicy.allowed}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="Optional setup notes"
              disabled={!cameraPolicy.allowed}
            />
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !cameraPolicy.allowed}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {!cameraPolicy.allowed
              ? "Kameraanlage gesperrt"
              : loading
              ? "Creating..."
              : "Create Camera"}
          </button>
        </div>
      </form>

      {camera ? (
        <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">Provisioning Result</h2>
            <p className="mt-1 text-sm text-neutral-600">
              The camera has been created successfully. Save the provisioning data now.
            </p>
          </div>

          {copyMsg ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              {copyMsg}
            </div>
          ) : null}

          <div className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Core Provisioning</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Basisdaten dieser Kamera für spätere Referenz.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy("Core provisioning", buildCoreProvisioningCopy(camera))
                }
                className="rounded-md border px-3 py-2 text-xs hover:bg-white"
              >
                Copy block
              </button>
            </div>

            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Camera ID:</span> {camera.id}
              </div>
              <div>
                <span className="font-medium">Technical Name:</span> {camera.technicalName}
              </div>
              <div className="break-all">
                <span className="font-medium">Ingest Token:</span> {camera.ingestToken}
              </div>
            </div>
          </div>

          {ftpProvisioning ? (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">FTP Setup</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Enter these values into the camera now. The password is shown only once.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy("FTP setup", buildFtpProvisioningCopy(ftpProvisioning))
                  }
                  className="rounded-md border px-3 py-2 text-xs hover:bg-white"
                >
                  Copy block
                </button>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Important: store the FTP password now. It will not be shown again after this page.
              </div>

              <div className="grid gap-2 text-sm">
                <div>
                  <span className="font-medium">FTP Server:</span> {ftpProvisioning.host}
                </div>
                <div>
                  <span className="font-medium">FTP Port:</span> {ftpProvisioning.port}
                </div>
                <div>
                  <span className="font-medium">FTP Username:</span> {ftpProvisioning.username}
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
                  <span className="font-medium">FTP Password:</span> {ftpProvisioning.password}
                </div>
                <div>
                  <span className="font-medium">Path:</span> {ftpProvisioning.path}
                </div>
                <div>
                  <span className="font-medium">Passive Mode:</span>{" "}
                  {ftpProvisioning.passiveMode ? "Enabled" : "Disabled"}
                </div>
              </div>
            </div>
          ) : null}

          {!ftpProvisioning && camera.routing.smtpAlias ? (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">SMTP Setup</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Use this e-mail address in the camera configuration.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      "SMTP setup",
                      buildSmtpProvisioningCopy(camera.routing.smtpAlias)
                    )
                  }
                  className="rounded-md border px-3 py-2 text-xs hover:bg-white"
                >
                  Copy block
                </button>
              </div>

              <div className="grid gap-2 text-sm">
                <div>
                  <span className="font-medium">SMTP Alias:</span> {camera.routing.smtpAlias}
                </div>
              </div>
            </div>
          ) : null}

          {!ftpProvisioning && camera.routing.manualLabel ? (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Manual Import Setup</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    This camera is ready for manual uploads in the Import section.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      "Manual import setup",
                      buildManualProvisioningCopy(camera.routing.manualLabel)
                    )
                  }
                  className="rounded-md border px-3 py-2 text-xs hover:bg-white"
                >
                  Copy block
                </button>
              </div>

              <div className="grid gap-2 text-sm">
                <div>
                  <span className="font-medium">Manual Label:</span> {camera.routing.manualLabel}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}