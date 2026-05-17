// src/app/cameras/health/CameraTableRow.tsx #4
"use client";

import { useState } from "react";
import { type AppLanguage } from "@/lib/i18n";
import { formatAppDateTime } from "@/lib/dateTime";
import CameraRowFields from "./CameraRowFields";
import CameraRowActions from "./CameraRowActions";

type CameraHealthListRow = {
  id: string;
  name: string;
  revier_id: string;
  revier_name: string;
  import_method: string | null;
  technical_name: string | null;
  is_active: boolean;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  direction_deg: number | null;
  notes: string | null;
  last_seen_at: string | null;
  stale_after_minutes: number;
  offline_after_minutes: number;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
  config_method: string | null;
  config_is_active: boolean | null;
  config_smtp_alias: string | null;
  config_ftp_username: string | null;
  config_ftp_password: string | null;
  config_ftp_inbox_path: string | null;
  config_manual_label: string | null;
  config_notes: string | null;
  config_ingest_token: string | null;
  config_vendor: string | null;
  config_external_key: string | null;
  config_provisioning_status: string | null;
  config_ftp_host: string | null;
  config_ftp_port: number | null;
  config_provisioned_at: string | null;
  config_deprovisioned_at: string | null;
  config_last_provisioning_error: string | null;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      online: "Online",
      stale: "Stale",
      offline: "Offline",
      unknown: "Unknown",
      manual: "Manual",
      configTitle: "Camera config",
      locationTitle: "Camera location",
      locationName: "Location name",
      latitude: "Latitude",
      longitude: "Longitude",
      direction: "Direction",
      technicalName: "Technical name",
      method: "Method",
      provisioningStatus: "Provisioning",
      vendor: "Vendor",
      smtpAlias: "SMTP alias",
      ftpHost: "FTP host",
      ftpPort: "FTP port",
      ftpUsername: "FTP username",
      ftpPassword: "FTP password",
      ftpInboxPath: "FTP inbox path",
      ftpInboxPathValue: "Empty or /",
      ftpMode: "FTP mode",
      ftpModeValue: "Passive / PASV",
      manualLabel: "Manual label",
      notes: "Notes",
      provisionedAt: "Provisioned at",
      lastProvisioningError: "Provisioning error",
    };
  }

  return {
    online: "Online",
    stale: "Veraltet",
    offline: "Offline",
    unknown: "Unbekannt",
    manual: "Manuell",
    configTitle: "Kamera-Config",
    locationTitle: "Kamera-Ort",
    locationName: "Standortname",
    latitude: "Breitengrad",
    longitude: "Längengrad",
    direction: "Richtung",
    technicalName: "Technical Name",
    method: "Methode",
    provisioningStatus: "Provisionierung",
    vendor: "Vendor",
    smtpAlias: "SMTP-Alias",
    ftpHost: "FTP-Host",
    ftpPort: "FTP-Port",
    ftpUsername: "FTP-Username",
    ftpPassword: "FTP-Passwort",
    ftpInboxPath: "FTP-Inbox-Pfad",
    ftpInboxPathValue: "Leer bzw. /",
    ftpMode: "FTP-Modus",
    ftpModeValue: "Passiv / PASV",
    manualLabel: "Manual-Label",
    notes: "Notizen",
    provisionedAt: "Provisioniert am",
    lastProvisioningError: "Provisionierungsfehler",
  };
}

function formatMethod(value: string | null, language: AppLanguage) {
  const text = t(language);

  if (!value) return "—";
  if (value === "smtp") return "SMTP";
  if (value === "ftp") return "FTP";
  if (value === "manual") return text.manual;
  return value;
}

function formatAgo(value: string | null, language: AppLanguage) {
  if (!value) return "—";

  const ts = new Date(value).getTime();
  const diffMs = Date.now() - ts;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 2) return language === "en" ? "just now" : "gerade eben";
  if (diffMinutes < 60) {
    return language === "en"
      ? `${diffMinutes} min ago`
      : `vor ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return language === "en"
      ? `${diffHours} h ago`
      : `vor ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return language === "en"
    ? `${diffDays} d ago`
    : `vor ${diffDays} d`;
}

function formatHealthLabel(value: string, language: AppLanguage) {
  const text = t(language);

  if (value === "online") return text.online;
  if (value === "stale") return text.stale;
  if (value === "offline") return text.offline;
  if (value === "unknown") return text.unknown;
  return value;
}

function formatDateTime(value: string | null, language: AppLanguage) {
  return formatAppDateTime(value, language);
}

function formatCoordinate(value: number | null) {
  if (value === null) return "—";
  return value.toString();
}

function formatDirection(value: number | null) {
  if (value === null) return "—";
  return value + "°";
}

function HealthBadge({
  status,
  language,
}: {
  status: string;
  language: AppLanguage;
}) {
  const className =
    status === "online"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
      : status === "stale"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
        : status === "offline"
          ? "border-rose-300/25 bg-rose-300/10 text-rose-200"
          : "border-white/10 bg-white/5 text-white/72";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {formatHealthLabel(status, language)}
    </span>
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-4.1 4.8" />
      <path d="M6.6 6.7C3.6 8.5 2 12 2 12s3.5 6 10 6c1.8 0 3.3-.4 4.6-1" />
    </svg>
  );
}

function ConfigValue({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-medium tracking-wide text-white/45 uppercase">
        {label}
      </dt>
      <dd className="text-sm text-white/82 break-words">{value ?? "—"}</dd>
    </div>
  );
}

export default function CameraTableRow({
  row,
  canManageCameras,
  returnRevier,
  saveAction,
  removeAction,
  isDemo = false,
  language,
}: {
  row: CameraHealthListRow;
  canManageCameras: boolean;
  returnRevier: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
  language: AppLanguage;
}) {
  const text = t(language);
  const [openPanel, setOpenPanel] = useState<"config" | "location" | null>(null);

  const hasConfig = !isDemo;
  const hasLocation = !isDemo;
  const configOpen = openPanel === "config";
  const locationOpen = openPanel === "location";

  const effectiveMethod = row.config_method ?? row.import_method ?? null;

  return (
    <>
      <tr className="border-t border-white/8 align-middle">
        <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
          {row.name}
        </td>

        <td className="px-6 py-4 text-white/68 whitespace-nowrap">
          {row.revier_name}
        </td>

        <td className="px-6 py-4 text-white/68 whitespace-nowrap">
          {formatMethod(row.import_method, language)}
        </td>

        <CameraRowFields
          cameraId={row.id}
          initialStatus={row.is_active ? "active" : "disabled"}
          canManage={canManageCameras}
          returnRevier={returnRevier}
          saveAction={saveAction}
          isDemo={isDemo}
          language={language}
        />

        <td className="px-6 py-4 whitespace-nowrap">
          <HealthBadge status={row.health_status} language={language} />
        </td>
        <td className="px-6 py-4 text-white/68 whitespace-nowrap">
          {formatAgo(row.last_seen_at, language)}
        </td>

        <td className="px-6 py-4 whitespace-nowrap">
          {hasConfig ? (
            <button
              type="button"
              onClick={() =>
                setOpenPanel((prev) => (prev === "config" ? null : "config"))
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 hover:border-white/15 hover:bg-white/8 hover:text-white"
              aria-label={configOpen ? "Hide config" : "Show config"}
              title={configOpen ? "Hide config" : "Show config"}
            >
              {configOpen ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/8 text-white/20">
              <EyeIcon />
            </span>
          )}
        </td>

        <td className="px-6 py-4 whitespace-nowrap">
          {hasLocation ? (
            <button
              type="button"
              onClick={() =>
                setOpenPanel((prev) =>
                  prev === "location" ? null : "location"
                )
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 hover:border-white/15 hover:bg-white/8 hover:text-white"
              aria-label={locationOpen ? "Hide location" : "Show location"}
              title={locationOpen ? "Hide location" : "Show location"}
            >
              {locationOpen ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/8 text-white/20">
              <EyeIcon />
            </span>
          )}
        </td>
        <CameraRowActions
          cameraId={row.id}
          canManage={canManageCameras}
          removeAction={removeAction}
          returnRevier={returnRevier}
          isDemo={isDemo}
          language={language}
        />
      </tr>

      {hasConfig && configOpen ? (
        <tr className="border-t border-white/6 bg-black/10">
          <td colSpan={9} className="px-6 py-5">
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">
                  {text.configTitle}
                </h3>

                <button
                  type="button"
                  onClick={() => setOpenPanel(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 hover:border-white/15 hover:bg-white/8 hover:text-white"
                  aria-label="Hide config"
                  title="Hide config"
                >
                  <EyeOffIcon />
                </button>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <ConfigValue
                  label={text.technicalName}
                  value={row.technical_name}
                />
                <ConfigValue
                  label={text.method}
                  value={formatMethod(effectiveMethod, language)}
                />
                <ConfigValue
                  label={text.provisioningStatus}
                  value={row.config_provisioning_status}
                />
                <ConfigValue label={text.vendor} value={row.config_vendor} />

                {row.config_smtp_alias ? (
                  <ConfigValue
                    label={text.smtpAlias}
                    value={row.config_smtp_alias}
                  />
                ) : null}

                {row.config_ftp_host ? (
                  <ConfigValue
                    label={text.ftpHost}
                    value={row.config_ftp_host}
                  />
                ) : null}

                {row.config_ftp_port ? (
                  <ConfigValue
                    label={text.ftpPort}
                    value={row.config_ftp_port}
                  />
                ) : null}

                {row.config_ftp_username ? (
                  <ConfigValue
                    label={text.ftpUsername}
                    value={row.config_ftp_username}
                  />
                ) : null}

                {row.config_ftp_password ? (
                  <ConfigValue
                    label={text.ftpPassword}
                    value={row.config_ftp_password}
                  />
                ) : null}

                {effectiveMethod === "ftp" ? (
                  <ConfigValue
                    label={text.ftpInboxPath}
                    value={text.ftpInboxPathValue}
                  />
                ) : null}

                {effectiveMethod === "ftp" ? (
                  <ConfigValue
                    label={text.ftpMode}
                    value={text.ftpModeValue}
                  />
                ) : null}

                {row.config_manual_label ? (
                  <ConfigValue
                    label={text.manualLabel}
                    value={row.config_manual_label}
                  />
                ) : null}

                <ConfigValue
                  label={text.provisionedAt}
                  value={formatDateTime(row.config_provisioned_at, language)}
                />

                {row.config_notes ? (
                  <ConfigValue label={text.notes} value={row.config_notes} />
                ) : null}
              </dl>

              {row.config_last_provisioning_error ? (
                <div className="mt-4 rounded-[14px] border border-rose-300/15 bg-rose-300/8 p-3">
                  <div className="text-[11px] font-medium tracking-wide text-rose-100/80 uppercase">
                    {text.lastProvisioningError}
                  </div>
                  <p className="mt-1 text-sm text-rose-100 break-words">
                    {row.config_last_provisioning_error}
                  </p>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}

      {hasLocation && locationOpen ? (
        <tr className="border-t border-white/6 bg-black/10">
          <td colSpan={9} className="px-6 py-5">
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">
                  {text.locationTitle}
                </h3>

                <button
                  type="button"
                  onClick={() => setOpenPanel(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 hover:border-white/15 hover:bg-white/8 hover:text-white"
                  aria-label="Hide location"
                  title="Hide location"
                >
                  <EyeOffIcon />
                </button>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <ConfigValue
                  label={text.locationName}
                  value={row.location_name}
                />
                <ConfigValue
                  label={text.latitude}
                  value={formatCoordinate(row.latitude)}
                />
                <ConfigValue
                  label={text.longitude}
                  value={formatCoordinate(row.longitude)}
                />
                <ConfigValue
                  label={text.direction}
                  value={formatDirection(row.direction_deg)}
                />
                <ConfigValue label={text.notes} value={row.notes} />
              </dl>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
