// src/app/cameras/events/[id]/EventDetailControls.tsx #6
"use client";

import { useMemo, useState } from "react";
import { type AppLanguage } from "@/lib/i18n";
import type { SpeciesOption } from "@/lib/speciesMeta";

type RelevantSelectValue = "auto" | "yes" | "no";
type SpeciesSelectValue = "auto" | string;

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

function getSpeciesLabel(
  value: string | null,
  speciesLabelByCode: Record<string, string>
) {
  if (!value) return "—";
  return speciesLabelByCode[value] ?? value.replaceAll("_", " ");
}

function relevantUserToSelect(value: boolean | null): RelevantSelectValue {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "auto";
}

function selectToRelevantUser(value: RelevantSelectValue): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function speciesUserToSelect(value: string | null): SpeciesSelectValue {
  if (!value) return "auto";
  return value;
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      save: "Save changes",
      relevant: "Relevant",
      species: "Species",
      yes: "Yes",
      no: "No",
      auto: "Auto",
      active: "Active",
      couldNotSave: "Could not save changes:",
      demoTitle: "Demo mode",
      demoText:
        "This is a demo account. Records cannot be deleted, added, or changed.",
      understood: "Understood",
    };
  }

  return {
    save: "Änderungen speichern",
    relevant: "Relevant",
    species: "Art",
    yes: "Ja",
    no: "Nein",
    auto: "Auto",
    active: "Aktiv",
    couldNotSave: "Konnte Änderungen nicht speichern:",
    demoTitle: "Demo-Modus",
    demoText:
      "Das ist ein Demo-Account. Datensätze können weder entfernt noch hinzugefügt oder geändert werden.",
    understood: "Verstanden",
  };
}

export default function EventDetailControls({
  assetId,
  initialRelevantAuto,
  initialRelevantUser,
  initialSpeciesAuto,
  initialSpeciesUser,
  isDemo = false,
  language,
  speciesOptions,
  speciesLabelByCode,
}: {
  assetId: string | null;
  initialRelevantAuto: boolean | null;
  initialRelevantUser: boolean | null;
  initialSpeciesAuto: string | null;
  initialSpeciesUser: string | null;
  isDemo?: boolean;
  language: AppLanguage;
  speciesOptions: SpeciesOption[];
  speciesLabelByCode: Record<string, string>;
}) {
  const text = t(language);

  const [relevantValue, setRelevantValue] = useState<RelevantSelectValue>(
    relevantUserToSelect(initialRelevantUser)
  );
  const [speciesValue, setSpeciesValue] = useState<SpeciesSelectValue>(
    speciesUserToSelect(initialSpeciesUser)
  );
  const [busy, setBusy] = useState(false);
  const [isReadOnlyModalOpen, setIsReadOnlyModalOpen] = useState(false);

  const dirty =
    relevantValue !== relevantUserToSelect(initialRelevantUser) ||
    speciesValue !== speciesUserToSelect(initialSpeciesUser);

  const currentRelevantLabel = useMemo(() => {
    if (relevantValue === "yes") return text.yes;
    if (relevantValue === "no") return text.no;
    if (initialRelevantAuto === true) return text.yes;
    if (initialRelevantAuto === false) return text.no;
    return "—";
  }, [relevantValue, initialRelevantAuto, text.no, text.yes]);

  const currentSpeciesLabel = useMemo(() => {
    if (speciesValue !== "auto") {
      return getSpeciesLabel(speciesValue, speciesLabelByCode);
    }
    return getSpeciesLabel(initialSpeciesAuto, speciesLabelByCode);
  }, [speciesValue, initialSpeciesAuto, speciesLabelByCode]);

  async function saveChanges() {
    if (!assetId || !dirty || busy || isDemo) return;

    setBusy(true);

    try {
      const nextRelevant = selectToRelevantUser(relevantValue);
      const nextSpecies = speciesValue === "auto" ? null : speciesValue;

      const [relevantRes, speciesRes] = await Promise.all([
        fetch("/api/asset-relevant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId,
            relevant: nextRelevant,
          }),
        }),
        fetch("/api/asset-species", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId,
            species: nextSpecies,
          }),
        }),
      ]);

      if (!relevantRes.ok) {
        const rawText = await relevantRes.text();
        throw new Error(rawText || `Relevant HTTP ${relevantRes.status}`);
      }

      if (!speciesRes.ok) {
        const rawText = await speciesRes.text();
        throw new Error(rawText || `Species HTTP ${speciesRes.status}`);
      }

      window.location.reload();
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      alert(`${text.couldNotSave} ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          {dirty ? (
            isDemo ? (
              <button
                type="button"
                onClick={() => setIsReadOnlyModalOpen(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-amber-300/20 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15"
                aria-label={text.save}
                title={text.save}
              >
                <SaveIcon />
              </button>
            ) : (
              <button
                type="button"
                onClick={saveChanges}
                disabled={busy || !assetId}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-amber-300/20 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={text.save}
                title={text.save}
              >
                <SaveIcon />
              </button>
            )
          ) : (
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/8 text-white/20"
              aria-label={text.save}
              title={text.save}
            >
              <SaveIcon />
            </span>
          )}
        </div>

        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/45">{text.relevant}</div>
          <select
            value={relevantValue}
            onChange={(e) => setRelevantValue(e.target.value as RelevantSelectValue)}
            disabled={!assetId || busy || isDemo}
            className="mt-2 w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
            title={isDemo ? text.demoTitle : ""}
          >
            <option value="auto" className="bg-[#102018] text-white">
              {initialRelevantAuto === true
                ? text.yes
                : initialRelevantAuto === false
                  ? text.no
                  : text.auto}
            </option>
            <option value="yes" className="bg-[#102018] text-white">
              {text.yes}
            </option>
            <option value="no" className="bg-[#102018] text-white">
              {text.no}
            </option>
          </select>
        </div>

        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/45">{text.species}</div>
          <select
            value={speciesValue}
            onChange={(e) => setSpeciesValue(e.target.value as SpeciesSelectValue)}
            disabled={!assetId || busy || isDemo}
            className="mt-2 w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
            title={isDemo ? text.demoTitle : ""}
          >
            <option value="auto" className="bg-[#102018] text-white">
              {getSpeciesLabel(initialSpeciesAuto, speciesLabelByCode)}
            </option>
            {speciesOptions.map((species) => (
              <option
                key={species.value}
                value={species.value}
                className="bg-[#102018] text-white"
              >
                {species.label}
              </option>
            ))}
          </select>
        </div>

        {(relevantValue !== "auto" || speciesValue !== "auto") && (
          <div className="text-xs text-white/45">
            {text.active}:{" "}
            <span className="text-white/70">
              {currentRelevantLabel} · {currentSpeciesLabel}
            </span>
          </div>
        )}
      </div>

      {isReadOnlyModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[20px] border border-white/10 bg-[#102018] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">{text.demoTitle}</h3>
            <p className="mt-2 text-sm text-white/70">{text.demoText}</p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsReadOnlyModalOpen(false)}
                className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:bg-white/8 hover:text-white"
              >
                {text.understood}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}