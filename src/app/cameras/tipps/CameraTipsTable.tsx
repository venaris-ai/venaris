// src/app/cameras/tipps/CameraTipsTable.tsx #3
"use client";

import { useState } from "react";
import { type AppLanguage } from "@/lib/i18n";

type RecommendationStatus =
  | "compatible"
  | "tested"
  | "certified"
  | "recommended";

type InputRating = "direct" | "app_download" | "manual" | "not_possible";
type BinaryRating = "yes" | "no";
type SimLockRating = "without" | "with";
type SolarRating = "included" | "possible" | "not_possible";

export type CameraRecommendation = {
  name: string;
  status: RecommendationStatus;
  input: InputRating;
  simLock: SimLockRating;
  appRequired: BinaryRating;
  nightShots: BinaryRating;
  solar: SolarRating;
  comment: string;
  verdict: string;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      columns: {
        camera: "Camera",
        status: "Status",
        input: "Input",
        simLock: "SIM lock",
        appRequired: "App required",
        nightShots: "Night captures",
        solar: "Solar panel",
        details: "Details",
        verdict: "Verdict",
      },
      levels: {
        compatible: "Compatible",
        tested: "Field-tested",
        certified: "Certified",
        recommended: "Recommendation",
      },
      ratings: {
        input: {
          direct: "Direct",
          app_download: "App download",
          manual: "Manual",
          not_possible: "Not possible",
        },
        simLock: {
          without: "No",
          with: "Yes",
        },
        appRequired: {
          yes: "Yes",
          no: "No",
        },
        nightShots: {
          yes: "Yes",
          no: "No",
        },
        solar: {
          included: "Included",
          possible: "Possible",
          not_possible: "Not possible",
        },
      },
      notesLabel: "Notes",
      hideDetails: "Hide details",
      showDetails: "Show details",
    };
  }

  return {
    columns: {
      camera: "Kamera",
      status: "Status",
      input: "Input",
      simLock: "SIM-Lock",
      appRequired: "App-Zwang",
      nightShots: "Nachtaufnahmen",
      solar: "Solarpanel",
      details: "Details",
      verdict: "Fazit",
    },
    levels: {
      compatible: "Kompatibel",
      tested: "Praxistest",
      certified: "Zertifiziert",
      recommended: "Empfehlung",
    },
    ratings: {
      input: {
        direct: "Direkt",
        app_download: "App-Download",
        manual: "Manuell",
        not_possible: "Nicht möglich",
      },
      simLock: {
        without: "Ohne",
        with: "Mit",
      },
      appRequired: {
        yes: "Ja",
        no: "Nein",
      },
      nightShots: {
        yes: "Ja",
        no: "Nein",
      },
      solar: {
        included: "Inklusive",
        possible: "Möglich",
        not_possible: "Nicht möglich",
      },
    },
    notesLabel: "Hinweise",
    hideDetails: "Details ausblenden",
    showDetails: "Details anzeigen",
  };
}

function statusBadgeClass(status: RecommendationStatus) {
  if (status === "recommended") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  }

  if (status === "certified") {
    return "border-sky-300/25 bg-sky-300/10 text-sky-200";
  }

  if (status === "tested") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  }

  return "border-white/10 bg-white/5 text-white/72";
}

function ratingBadgeClass(tone: "good" | "warning" | "bad") {
  if (tone === "good") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  }

  if (tone === "warning") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  }

  return "border-red-300/25 bg-red-300/10 text-red-200";
}

function inputTone(value: InputRating) {
  if (value === "direct") {
    return "good";
  }

  if (value === "app_download" || value === "manual") {
    return "warning";
  }

  return "bad";
}

function simLockTone(value: SimLockRating) {
  return value === "without" ? "good" : "bad";
}

function appRequiredTone(value: BinaryRating) {
  return value === "no" ? "good" : "bad";
}

function nightShotsTone(value: BinaryRating) {
  return value === "yes" ? "good" : "bad";
}

function solarTone(value: SolarRating) {
  if (value === "included") {
    return "good";
  }

  if (value === "possible") {
    return "warning";
  }

  return "bad";
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

function RatingBadge({ label, tone }: { label: string; tone: "good" | "warning" | "bad" }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${ratingBadgeClass(
        tone
      )}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({
  status,
  language,
}: {
  status: RecommendationStatus;
  language: AppLanguage;
}) {
  const text = t(language);

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(
        status
      )}`}
    >
      {text.levels[status]}
    </span>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-white/45">
        {label}
      </dt>
      <dd className="break-words text-sm leading-6 text-white/82">{value}</dd>
    </div>
  );
}

function CameraTipsTableRow({
  row,
  language,
}: {
  row: CameraRecommendation;
  language: AppLanguage;
}) {
  const text = t(language);
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-t border-white/8 align-middle transition-colors hover:bg-white/[0.025]">
        <td className="whitespace-nowrap px-6 py-4 font-medium text-white">
          {row.name}
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <StatusBadge status={row.status} language={language} />
        </td>
        <td className="whitespace-nowrap px-4 py-4 text-center">
          <RatingBadge
            label={text.ratings.input[row.input]}
            tone={inputTone(row.input)}
          />
        </td>
        <td className="whitespace-nowrap px-4 py-4 text-center">
          <RatingBadge
            label={text.ratings.simLock[row.simLock]}
            tone={simLockTone(row.simLock)}
          />
        </td>
        <td className="whitespace-nowrap px-4 py-4 text-center">
          <RatingBadge
            label={text.ratings.appRequired[row.appRequired]}
            tone={appRequiredTone(row.appRequired)}
          />
        </td>
        <td className="whitespace-nowrap px-4 py-4 text-center">
          <RatingBadge
            label={text.ratings.nightShots[row.nightShots]}
            tone={nightShotsTone(row.nightShots)}
          />
        </td>
        <td className="whitespace-nowrap px-4 py-4 text-center">
          <RatingBadge
            label={text.ratings.solar[row.solar]}
            tone={solarTone(row.solar)}
          />
        </td>
        <td className="whitespace-nowrap px-6 py-4 text-right">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 transition hover:border-white/15 hover:bg-white/8 hover:text-white"
            aria-label={open ? text.hideDetails : text.showDetails}
            title={open ? text.hideDetails : text.showDetails}
          >
            {open ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </td>
      </tr>

      {open ? (
        <tr className="border-t border-white/6 bg-black/10">
          <td colSpan={8} className="px-6 py-5">
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 transition hover:border-white/15 hover:bg-white/8 hover:text-white"
                  aria-label={text.hideDetails}
                  title={text.hideDetails}
                >
                  <EyeOffIcon />
                </button>
              </div>

              <dl className="grid gap-4 md:grid-cols-2">
                <DetailValue label={text.columns.verdict} value={row.verdict} />
                <DetailValue label={text.notesLabel} value={row.comment} />
              </dl>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function CameraTipsTable({
  rows,
  language,
}: {
  rows: CameraRecommendation[];
  language: AppLanguage;
}) {
  const text = t(language);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[980px] table-fixed text-sm">
        <colgroup>
          <col className="w-[210px]" />
          <col className="w-[150px]" />
          <col className="w-[128px]" />
          <col className="w-[128px]" />
          <col className="w-[128px]" />
          <col className="w-[128px]" />
          <col className="w-[128px]" />
          <col className="w-[90px]" />
        </colgroup>

        <thead className="bg-white/5 text-left text-white/55">
          <tr>
            <th className="whitespace-nowrap px-6 py-3 font-medium">
              {text.columns.camera}
            </th>
            <th className="whitespace-nowrap px-6 py-3 font-medium">
              {text.columns.status}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.columns.input}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.columns.simLock}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.columns.appRequired}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.columns.nightShots}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.columns.solar}
            </th>
            <th className="whitespace-nowrap px-6 py-3 text-right font-medium">
              {text.columns.details}
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <CameraTipsTableRow
              key={row.name}
              row={row}
              language={language}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}