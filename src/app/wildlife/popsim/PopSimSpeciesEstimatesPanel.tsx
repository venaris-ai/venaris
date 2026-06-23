// src/app/wildlife/popsim/PopSimSpeciesEstimatesPanel.tsx #1
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppLanguage } from "@/lib/i18n";

const MAX_TARGET_PER_100HA = 1000;

export type PopSimSpeciesEstimateRow = {
  species: string;
  speciesLabel: string;
  estimatedPopulationTotal: number | null;
  estimatedPopulationPer100ha: number | null;
  targetTotal: number | null;
  targetPer100ha: number | null;
  harvestSurplus: number | null;
};

export type PopSimSpeciesEstimatesPanelLabels = {
  speciesEstimates: string;
  speciesEstimatesText: string;
  currentState: string;
  targetState: string;
  species: string;
  estimatedTotalCol: string;
  per100ha: string;
  targetTotal: string;
  targetPer100ha: string;
  harvestSurplusCol: string;
  noSpeciesRows: string;
};

type PopulationStatus = "good" | "low" | "high" | "neutral";

function SaveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3" />
      <path d="M9 17h6" />
    </svg>
  );
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      save: "Save changes",
      couldNotSave: "Could not save changes:",
      demoTitle: "Demo mode",
      demoText:
        "This is a demo account. Target values cannot be changed.",
      readOnlyTitle: "Changes are disabled.",
      invalidTargets:
        "Please enter valid target values between 0 and 1,000.",
    };
  }

  return {
    save: "Änderungen speichern",
    couldNotSave: "Konnte Änderungen nicht speichern:",
    demoTitle: "Demo-Modus",
    demoText:
      "Das ist ein Demo-Account. Zielwerte können nicht geändert werden.",
    readOnlyTitle: "Änderungen sind deaktiviert.",
    invalidTargets:
      "Bitte gültige Zielwerte zwischen 0 und 1.000 eingeben.",
  };
}

function locale(language: AppLanguage) {
  return language === "en" ? "en-GB" : "de-DE";
}

function fmtInt(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString(locale(language));
}

function formatInputValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(value);
}

function normalizeTargetValue(value: string) {
  const normalized = value.trim().replace(",", ".");

  if (!normalized) return "";

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) return normalized;

  return String(parsed);
}

function parseTargetValue(value: string) {
  const normalized = value.trim().replace(",", ".");

  if (!normalized) return null;

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > MAX_TARGET_PER_100HA) return null;

  return parsed;
}

function getPopulationStatus(
  estimated: number | null | undefined,
  target: number | null | undefined
): PopulationStatus {
  if (
    typeof estimated !== "number" ||
    Number.isNaN(estimated) ||
    typeof target !== "number" ||
    Number.isNaN(target) ||
    target <= 0
  ) {
    return "neutral";
  }

  const lowerBound = target * 0.9;
  const upperBound = target * 1.1;

  if (estimated < lowerBound) return "low";
  if (estimated > upperBound) return "high";
  return "good";
}

function getPopulationRowClasses(status: PopulationStatus) {
  switch (status) {
    case "good":
      return "bg-emerald-400/8";
    case "low":
      return "bg-amber-400/8";
    case "high":
      return "bg-rose-400/8";
    default:
      return "";
  }
}

export default function PopSimSpeciesEstimatesPanel({
  revierId,
  rows,
  isDemo,
  canEditTargets,
  language,
  labels,
}: {
  revierId: string;
  rows: PopSimSpeciesEstimateRow[];
  isDemo: boolean;
  canEditTargets: boolean;
  language: AppLanguage;
  labels: PopSimSpeciesEstimatesPanelLabels;
}) {
  const router = useRouter();
  const text = t(language);

  const initialValues = useMemo(() => {
    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.species] = formatInputValue(row.targetPer100ha);
      return acc;
    }, {});
  }, [rows]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const dirtyTargets = useMemo(() => {
    return rows
      .map((row) => {
        const initialValue = initialValues[row.species] ?? "";
        const currentValue = values[row.species] ?? "";

        if (
          normalizeTargetValue(currentValue) ===
          normalizeTargetValue(initialValue)
        ) {
          return null;
        }

        const parsed = parseTargetValue(currentValue);

        return {
          species: row.species,
          targetPer100ha: parsed,
        };
      })
      .filter(
        (
          target
        ): target is {
          species: string;
          targetPer100ha: number | null;
        } => target !== null
      );
  }, [initialValues, rows, values]);

  const invalidDirtyTargets = dirtyTargets.filter(
    (target) => target.targetPer100ha == null
  );

const validDirtyTargets = dirtyTargets
  .filter(
    (target): target is { species: string; targetPer100ha: number } =>
      target.targetPer100ha != null
  )
  .map((target) => ({
    species: target.species,
    targetPer100ha: target.targetPer100ha,
  }));

  const dirty = dirtyTargets.length > 0;
  const hasInvalidTargets = invalidDirtyTargets.length > 0;

  const canSave =
    dirty &&
    !busy &&
    !isDemo &&
    canEditTargets &&
    !hasInvalidTargets &&
    validDirtyTargets.length > 0;

  async function saveChanges() {
    if (!canSave) {
      if (hasInvalidTargets) {
        alert(text.invalidTargets);
      }

      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/popsim-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revierId,
          targets: validDirtyTargets,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;

        throw new Error(message);
      }

      router.refresh();
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      alert(`${text.couldNotSave} ${message}`);
    } finally {
      setBusy(false);
    }
  }

  const inputsDisabled = busy || isDemo || !canEditTargets;

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-white">
            {labels.speciesEstimates}
          </h2>
          <p className="text-sm text-white/65">{labels.speciesEstimatesText}</p>
        </div>

        {dirty ? (
          <button
            type="button"
            onClick={saveChanges}
            disabled={!canSave}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-amber-300/20 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={text.save}
            title={
              isDemo
                ? text.demoText
                : hasInvalidTargets
                  ? text.invalidTargets
                  : text.save
            }
          >
            <SaveIcon />
          </button>
        ) : (
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/8 text-white/20"
            aria-label={text.save}
            title={isDemo ? text.demoText : text.save}
          >
            <SaveIcon />
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left text-white/55">
              <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                {labels.species}
              </th>
              <th
                colSpan={2}
                className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white/45"
              >
                {labels.currentState}
              </th>
              <th
                colSpan={2}
                className="border-l border-white/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white/45"
              >
                {labels.targetState}
              </th>
              <th
                aria-hidden="true"
                className="border-l border-white/10 px-3 py-2"
              />
            </tr>
            <tr className="border-b border-white/8 text-left text-white/55">
              <th className="px-3 py-2 text-center font-medium">
                {labels.estimatedTotalCol}
              </th>
              <th className="px-3 py-2 text-center font-medium">
                {labels.per100ha}
              </th>
              <th className="border-l border-white/10 px-3 py-2 text-center font-medium">
                {labels.targetTotal}
              </th>
              <th className="px-3 py-2 text-center font-medium">
                {labels.targetPer100ha}
              </th>
              <th className="border-l border-white/10 px-3 py-2 text-center font-medium text-white/70">
                {labels.harvestSurplusCol}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const populationStatus = getPopulationStatus(
                row.estimatedPopulationTotal,
                row.targetTotal
              );
              const populationRowClasses =
                getPopulationRowClasses(populationStatus);
              const currentValue = values[row.species] ?? "";
              const isInvalid =
                normalizeTargetValue(currentValue) !==
                  normalizeTargetValue(initialValues[row.species] ?? "") &&
                parseTargetValue(currentValue) == null;

              return (
                <tr
                  key={row.species}
                  className={`border-b border-white/8 last:border-0 ${populationRowClasses}`}
                >
                  <td className="px-3 py-3 font-medium text-white">
                    {row.speciesLabel}
                  </td>
                  <td className="px-3 py-3 text-center text-white/72">
                    {fmtInt(row.estimatedPopulationTotal, language)}
                  </td>
                  <td className="px-3 py-3 text-center text-white/72">
                    {fmtInt(row.estimatedPopulationPer100ha, language)}
                  </td>
                  <td className="border-l border-white/10 px-3 py-3 text-center text-white/72">
                    {fmtInt(row.targetTotal, language)}
                  </td>
                  <td className="px-3 py-3 text-center text-white/72">
                    <input
                      type="number"
                      min="0"
                      max={MAX_TARGET_PER_100HA}
                      step="0.01"
                      inputMode="decimal"
                      value={currentValue}
                      disabled={inputsDisabled}
                      onChange={(event) => {
                        setValues((current) => ({
                          ...current,
                          [row.species]: event.target.value,
                        }));
                      }}
                      className={
                        isInvalid
                          ? "mx-auto w-24 rounded-[10px] border border-rose-300/40 bg-rose-300/10 px-3 py-1.5 text-right text-sm text-rose-100 outline-none disabled:bg-white/5 disabled:text-white/35"
                          : "mx-auto w-24 rounded-[10px] border border-white/10 bg-white/5 px-3 py-1.5 text-right text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
                      }
                      title={
                        isDemo || !canEditTargets ? text.readOnlyTitle : ""
                      }
                    />
                  </td>
                  <td className="border-l border-white/10 px-3 py-3 text-center font-medium text-white/78">
                    {fmtInt(row.harvestSurplus, language)}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-sm text-white/68">
                  {labels.noSpeciesRows}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
