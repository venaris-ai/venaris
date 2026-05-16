// src/app/cameras/tipps/CameraTipsTable.tsx #4
"use client";

import { type AppLanguage } from "@/lib/i18n";

type RecommendationStatus =
  | "compatible"
  | "tested"
  | "certified"
  | "recommended";

type YesNoRating = "yes" | "no";
type AvailabilityRating = "yes" | "no" | "possible";
type CostRating = "low" | "medium" | "high";

export type CameraRecommendation = {
  name: string;
  status: RecommendationStatus;
  simLock: YesNoRating;
  appCloudRequired: YesNoRating;
  directTransfer: YesNoRating;
  constantEnergy: AvailabilityRating;
  stableInternet: YesNoRating;
  dayNightMode: YesNoRating;
  acquisitionCosts: CostRating;
  runningCosts: CostRating;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      groups: {
        open: "Open",
        autonomous: "Autonomous",
        affordable: "Affordable",
      },
      columns: {
        camera: "Camera",
        status: "Status",
        simLock: "SIM lock",
        appCloudRequired: "Mandatory app/cloud",
        directTransfer: "Direct image transfer",
        constantEnergy: "Constant energy",
        stableInternet: "Stable internet",
        dayNightMode: "Day/night mode",
        acquisitionCosts: "Purchase costs",
        runningCosts: "Running costs",
      },
      levels: {
        compatible: "Compatible",
        tested: "Field-tested",
        certified: "Certified",
        recommended: "Recommendation",
      },
      ratings: {
        yes: "Yes",
        no: "No",
        possible: "Possible",
        low: "Low",
        medium: "Medium",
        high: "High",
      },
    };
  }

  return {
    groups: {
      open: "Offen",
      autonomous: "Autonom",
      affordable: "Günstig",
    },
    columns: {
      camera: "Kamera",
      status: "Status",
      simLock: "SIM-Lock",
      appCloudRequired: "Pflicht-App/Cloud",
      directTransfer: "Direkter Bildtransfer",
      constantEnergy: "Konstante Energie",
      stableInternet: "Stabiles Internet",
      dayNightMode: "Tag-/Nacht-Modus",
      acquisitionCosts: "Anschaffungs-Kosten",
      runningCosts: "Laufende Kosten",
    },
    levels: {
      compatible: "Kompatibel",
      tested: "Praxistest",
      certified: "Zertifiziert",
      recommended: "Empfehlung",
    },
    ratings: {
      yes: "Ja",
      no: "Nein",
      possible: "Möglich",
      low: "Niedrig",
      medium: "Mittel",
      high: "Hoch",
    },
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

function positiveYesNoTone(value: YesNoRating) {
  return value === "yes" ? "good" : "bad";
}

function negativeYesNoTone(value: YesNoRating) {
  return value === "no" ? "good" : "bad";
}

function availabilityTone(value: AvailabilityRating) {
  if (value === "yes") {
    return "good";
  }

  if (value === "possible") {
    return "warning";
  }

  return "bad";
}

function costTone(value: CostRating) {
  if (value === "low") {
    return "good";
  }

  if (value === "medium") {
    return "warning";
  }

  return "bad";
}

function RatingBadge({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warning" | "bad";
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${ratingBadgeClass(
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
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
        status
      )}`}
    >
      {text.levels[status]}
    </span>
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

  return (
    <tr className="border-t border-white/8 align-middle transition-colors hover:bg-white/[0.025]">
      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-white">
        {row.name}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-center">
        <StatusBadge status={row.status} language={language} />
      </td>

      <td className="whitespace-nowrap border-l border-white/8 px-2 py-3 text-center">
        <RatingBadge
          label={text.ratings[row.simLock]}
          tone={negativeYesNoTone(row.simLock)}
        />
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-center">
        <RatingBadge
          label={text.ratings[row.appCloudRequired]}
          tone={negativeYesNoTone(row.appCloudRequired)}
        />
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-center">
        <RatingBadge
          label={text.ratings[row.directTransfer]}
          tone={positiveYesNoTone(row.directTransfer)}
        />
      </td>

      <td className="whitespace-nowrap border-l border-white/8 px-2 py-3 text-center">
        <RatingBadge
          label={text.ratings[row.constantEnergy]}
          tone={availabilityTone(row.constantEnergy)}
        />
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-center">
        <RatingBadge
          label={text.ratings[row.stableInternet]}
          tone={positiveYesNoTone(row.stableInternet)}
        />
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-center">
        <RatingBadge
          label={text.ratings[row.dayNightMode]}
          tone={positiveYesNoTone(row.dayNightMode)}
        />
      </td>

      <td className="whitespace-nowrap border-l border-white/8 px-2 py-3 text-center">
        <RatingBadge
          label={text.ratings[row.acquisitionCosts]}
          tone={costTone(row.acquisitionCosts)}
        />
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-center">
        <RatingBadge
          label={text.ratings[row.runningCosts]}
          tone={costTone(row.runningCosts)}
        />
      </td>
    </tr>
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
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[1048px] table-fixed text-xs">
        <colgroup>
          <col className="w-[172px]" />
          <col className="w-[124px]" />
          <col className="w-[94px]" />
          <col className="w-[94px]" />
          <col className="w-[94px]" />
          <col className="w-[94px]" />
          <col className="w-[94px]" />
          <col className="w-[94px]" />
          <col className="w-[94px]" />
          <col className="w-[94px]" />
        </colgroup>

        <thead className="bg-white/5 text-white/55">
          <tr className="border-b border-white/8">
            <th className="px-4 py-2 text-left font-medium" />
            <th className="px-3 py-2 text-left font-medium" />
            <th
              colSpan={3}
              className="border-l border-white/8 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80"
            >
              {text.groups.open}
            </th>
            <th
              colSpan={3}
              className="border-l border-white/8 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80"
            >
              {text.groups.autonomous}
            </th>
            <th
              colSpan={2}
              className="border-l border-white/8 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80"
            >
              {text.groups.affordable}
            </th>
          </tr>

          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
              {text.columns.camera}
            </th>
            <th className="whitespace-nowrap px-3 py-3 text-center font-medium">
              {text.columns.status}
            </th>
            <th className="border-l border-white/8 px-2 py-3 text-center font-medium leading-tight">
              {text.columns.simLock}
            </th>
            <th className="px-2 py-3 text-center font-medium leading-tight">
              {text.columns.appCloudRequired}
            </th>
            <th className="px-2 py-3 text-center font-medium leading-tight">
              {text.columns.directTransfer}
            </th>
            <th className="border-l border-white/8 px-2 py-3 text-center font-medium leading-tight">
              {text.columns.constantEnergy}
            </th>
            <th className="px-2 py-3 text-center font-medium leading-tight">
              {text.columns.stableInternet}
            </th>
            <th className="px-2 py-3 text-center font-medium leading-tight">
              {text.columns.dayNightMode}
            </th>
            <th className="border-l border-white/8 px-2 py-3 text-center font-medium leading-tight">
              {text.columns.acquisitionCosts}
            </th>
            <th className="px-2 py-3 text-center font-medium leading-tight">
              {text.columns.runningCosts}
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