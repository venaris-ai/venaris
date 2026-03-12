"use client";

import { useMemo, useState } from "react";

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
  organizations: Organization[];
  reviers: Revier[];
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

export default function CreateCameraForm({ organizations, reviers }: Props) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Organization</label>
            <select
              value={organizationId}
              onChange={(e) => {
                setOrganizationId(e.target.value);
                setRevierId("");
              }}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              required
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.slug})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Camera Name</label>
            <input
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="e.g. Reolink North Edge"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as "smtp" | "ftp" | "manual")}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              required
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
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Direction (0–359, optional)</label>
            <input
              type="number"
              min={0}
              max={359}
              step={1}
              value={directionDeg}
              onChange={(e) => setDirectionDeg(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="180"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] w-full rounded-xl border border-neutral-300 px-3 py-2"
              placeholder="Optional setup notes"
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
            disabled={loading}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Camera"}
          </button>
        </div>
      </form>

      {camera ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-5">
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

          <div className="grid gap-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-medium">Camera ID:</span> {camera.id}
              </div>
              <button
                type="button"
                onClick={() => handleCopy("Camera ID", camera.id)}
                className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
              >
                Copy
              </button>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-medium">Technical Name:</span> {camera.technicalName}
              </div>
              <button
                type="button"
                onClick={() => handleCopy("Technical Name", camera.technicalName)}
                className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
              >
                Copy
              </button>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="break-all">
                <span className="font-medium">Ingest Token:</span> {camera.ingestToken}
              </div>
              <button
                type="button"
                onClick={() => handleCopy("Ingest Token", camera.ingestToken)}
                className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
              >
                Copy
              </button>
            </div>
          </div>

          {ftpProvisioning ? (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
              <div>
                <h3 className="text-base font-semibold">FTP Setup</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Enter these values into the camera now. The password is shown only once.
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Important: store the FTP password now. It will not be shown again after this page.
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium">FTP Server:</span> {ftpProvisioning.host}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("FTP Server", ftpProvisioning.host)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                  >
                    Copy
                  </button>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium">FTP Port:</span> {ftpProvisioning.port}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("FTP Port", String(ftpProvisioning.port))}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                  >
                    Copy
                  </button>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium">FTP Username:</span> {ftpProvisioning.username}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("FTP Username", ftpProvisioning.username)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                  >
                    Copy
                  </button>
                </div>

                <div className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-3">
                  <div>
                    <span className="font-medium">FTP Password:</span> {ftpProvisioning.password}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("FTP Password", ftpProvisioning.password)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    Copy
                  </button>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium">Path:</span> {ftpProvisioning.path}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("FTP Path", ftpProvisioning.path)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                  >
                    Copy
                  </button>
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
              <div>
                <h3 className="text-base font-semibold">SMTP Setup</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Use this e-mail address in the camera configuration.
                </p>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium">SMTP Alias:</span> {camera.routing.smtpAlias}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("SMTP Alias", camera.routing.smtpAlias)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {!ftpProvisioning && camera.routing.manualLabel ? (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
              <div>
                <h3 className="text-base font-semibold">Manual Import Setup</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  This camera is ready for manual uploads in the Import section.
                </p>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium">Manual Label:</span> {camera.routing.manualLabel}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("Manual Label", camera.routing.manualLabel)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}