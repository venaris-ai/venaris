// src/app/orga/reviere/[id]/edit/RevierSpeciesTargetsForm.tsx #1
"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AppLanguage } from "@/lib/i18n";

const MAX_TARGET_PER_100HA = 1000;

export type SpeciesTargetFormRow = {
  species: string;
  label: string;
  targetPer100ha: number;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        speciesCol: "Species",
        targetCol: "Target population per 100 ha",
        saveIdle: "Save target population",
        savePending: "Saving target population...",
        demoMode: "Demo mode",
        demoReadOnly: "Demo mode: changes are disabled.",
        unchanged: "Change a value first",
      }
    : {
        speciesCol: "Wildart",
        targetCol: "Zielbestand pro 100 ha",
        saveIdle: "Zielbestand speichern",
        savePending: "Speichert Zielbestand...",
        demoMode: "Demo-Modus",
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        unchanged: "Bitte zuerst einen Wert ändern",
      };
}

function normalizeTargetValue(value: string) {
  const normalized = value.trim().replace(",", ".");

  if (!normalized) return "";

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) return normalized;

  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
}

function formatInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function chunkRows(rows: SpeciesTargetFormRow[], size: number) {
  const chunks: SpeciesTargetFormRow[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function TargetSubmitButton({
  isDirty,
  isDemo,
  language,
}: {
  isDirty: boolean;
  isDemo: boolean;
  language: AppLanguage;
}) {
  const { pending } = useFormStatus();
  const text = t(language);
  const isDisabled = isDemo || !isDirty || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      title={
        isDemo
          ? text.demoReadOnly
          : isDirty
            ? ""
            : text.unchanged
      }
      className={
        isDisabled
          ? "rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/35"
          : "rounded-[10px] border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-300/15"
      }
    >
      {pending
        ? text.savePending
        : isDemo
          ? text.demoMode
          : text.saveIdle}
    </button>
  );
}

export default function RevierSpeciesTargetsForm({
  action,
  rows,
  isDemo,
  language,
}: {
  action: (formData: FormData) => void | Promise<void>;
  rows: SpeciesTargetFormRow[];
  isDemo: boolean;
  language: AppLanguage;
}) {
  const text = t(language);

  const initialValues = useMemo(() => {
    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.species] = formatInputValue(row.targetPer100ha);
      return acc;
    }, {});
  }, [rows]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);

  const isDirty = rows.some((row) => {
    return (
      normalizeTargetValue(values[row.species] ?? "") !==
      normalizeTargetValue(initialValues[row.species] ?? "")
    );
  });

  const columns = chunkRows(rows, 10);
  const rowCount = Math.max(...columns.map((column) => column.length), 0);

  return (
    <form action={action} className="mt-5 space-y-5">
      <div className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-white/45">
            <tr>
              {columns.map((_, index) => (
                <FragmentHeader
                  key={`header-${index}`}
                  speciesLabel={text.speciesCol}
                  targetLabel={text.targetCol}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
              <tr
                key={`target-row-${rowIndex}`}
                className="border-b border-white/8 last:border-0"
              >
                {columns.map((column, columnIndex) => {
                  const row = column[rowIndex];

                  if (!row) {
                    return (
                      <FragmentEmptyCells
                        key={`empty-${columnIndex}-${rowIndex}`}
                      />
                    );
                  }

                  return (
                    <FragmentTargetCells
                      key={row.species}
                      row={row}
                      value={values[row.species] ?? ""}
                      isDemo={isDemo}
                      demoReadOnly={text.demoReadOnly}
                      onChange={(value) => {
                        setValues((current) => ({
                          ...current,
                          [row.species]: value,
                        }));
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <TargetSubmitButton
          isDirty={isDirty}
          isDemo={isDemo}
          language={language}
        />
      </div>
    </form>
  );
}

function FragmentHeader({
  speciesLabel,
  targetLabel,
}: {
  speciesLabel: string;
  targetLabel: string;
}) {
  return (
    <>
      <th className="px-4 py-3 font-medium">{speciesLabel}</th>
      <th className="px-4 py-3 text-right font-medium">{targetLabel}</th>
    </>
  );
}

function FragmentEmptyCells() {
  return (
    <>
      <td className="px-4 py-3" />
      <td className="px-4 py-3" />
    </>
  );
}

function FragmentTargetCells({
  row,
  value,
  isDemo,
  demoReadOnly,
  onChange,
}: {
  row: SpeciesTargetFormRow;
  value: string;
  isDemo: boolean;
  demoReadOnly: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <td className="px-4 py-2.5 align-middle">
        <div className="font-medium text-white">{row.label}</div>
      </td>
      <td className="px-4 py-2.5 text-right align-middle">
        <input
          id={`target_${row.species}`}
          name={`target_${row.species}`}
          type="number"
          min="0"
          max={MAX_TARGET_PER_100HA}
          step="0.01"
          required
          value={value}
          disabled={isDemo}
          onChange={(event) => onChange(event.target.value)}
          className="ml-auto w-24 rounded-[10px] border border-white/10 bg-white/5 px-3 py-1.5 text-right text-sm text-white outline-none ring-0 disabled:bg-white/5 disabled:text-white/35"
          title={isDemo ? demoReadOnly : ""}
        />
      </td>
    </>
  );
}