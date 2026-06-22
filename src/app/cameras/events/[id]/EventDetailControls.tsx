// src/app/cameras/events/[id]/EventDetailControls.tsx #13
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type AppLanguage } from "@/lib/i18n";
import type { SpeciesOption } from "@/lib/speciesMeta";

type RelevantSelectValue = "yes" | "no";
type SpeciesSelectValue = "auto" | string;
type CountInputValue = string;

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

function relevantToSelect(
  relevantAuto: boolean | null,
  relevantUser: boolean | null
): RelevantSelectValue {
  const effective = relevantUser ?? relevantAuto;
  return effective === false ? "no" : "yes";
}

function selectToRelevantUser(value: RelevantSelectValue): boolean {
  return value === "yes";
}

function formatInteger(
  value: number | null | undefined,
  language: AppLanguage
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  return new Intl.NumberFormat(language === "en" ? "en-US" : "de-DE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function speciesUserToSelect(value: string | null): SpeciesSelectValue {
  if (!value) return "auto";
  return value;
}

function effectiveCountToInput(
  countUser: number | null | undefined,
  countAuto: number | null | undefined,
  eventCount: number | null | undefined
): CountInputValue {
  const value = countUser ?? countAuto ?? eventCount;

  if (typeof value !== "number" || !Number.isFinite(value)) return "";

  return String(Math.round(value));
}

function countInputToNumber(value: CountInputValue): number | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) return null;

  return parsed;
}

function isInvalidManualCount(value: CountInputValue) {
  const trimmed = value.trim();

  if (!trimmed) return false;

  const parsed = Number(trimmed);
  return !Number.isInteger(parsed) || parsed < 1 || parsed > 999;
}

function scoreBadge(score: number | null, language: AppLanguage) {
  if (typeof score !== "number") return "—";

  if (language === "en") {
    if (score >= 0.9) return "very high";
    if (score >= 0.75) return "high";
    if (score >= 0.5) return "medium";
    return "low";
  }

  if (score >= 0.9) return "sehr hoch";
  if (score >= 0.75) return "hoch";
  if (score >= 0.5) return "mittel";
  return "niedrig";
}

function formatProbability(score: number | null | undefined, language: AppLanguage) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  return `${Math.round(score * 100)}% · ${scoreBadge(score, language)}`;
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      save: "Save changes",
      relevant: "Relevant",
      species: "Species",
      count: "Animal count",
      imageCount: "Image count",
      probability: "Probability",
      camera: "Camera",
      timestamp: "Timestamp",
      yes: "Yes",
      no: "No",
      auto: "Auto",
      manual: "Manual",
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
    count: "Anzahl Stück",
    imageCount: "Anzahl Bilder",
    probability: "Wahrscheinlichkeit",
    camera: "Kamera",
    timestamp: "Zeitpunkt",
    yes: "Ja",
    no: "Nein",
    auto: "Auto",
    manual: "Manuell",
    couldNotSave: "Konnte Änderungen nicht speichern:",
    demoTitle: "Demo-Modus",
    demoText:
      "Das ist ein Demo-Account. Datensätze können weder entfernt noch hinzugefügt oder geändert werden.",
    understood: "Verstanden",
  };
}

export default function EventDetailControls({
  materializedEventId = null,
  assetId,
  initialRelevantAuto,
  initialRelevantUser,
  initialSpeciesAuto,
  initialSpeciesUser,
  initialCountAuto = null,
  initialCountUser = null,
  probabilityScore,
  cameraLabel,
  timestampLabel,
  isDemo = false,
  language,
  speciesOptions,
  speciesLabelByCode,
  eventCount,
  assetCount,
  currentEventId,
  afterRemoveHref,
  eventQuerySuffix,
}: {
  materializedEventId?: string | null;
  assetId: string | null;
  initialRelevantAuto: boolean | null;
  initialRelevantUser: boolean | null;
  initialSpeciesAuto: string | null;
  initialSpeciesUser: string | null;
  initialCountAuto?: number | null;
  initialCountUser?: number | null;
  probabilityScore?: number | null;
  cameraLabel: string;
  timestampLabel?: string | null;
  isDemo?: boolean;
  language: AppLanguage;
  speciesOptions: SpeciesOption[];
  speciesLabelByCode: Record<string, string>;
  topSpeciesLabel?: string;
  eventCount?: number | null;
  assetCount?: number | null;
  currentEventId: string;
  afterRemoveHref: string;
  eventQuerySuffix: string;
}) {
  const router = useRouter();
  const text = t(language);

  const isMaterializedEventMode = Boolean(materializedEventId);

  const initialRelevantValue = relevantToSelect(
    initialRelevantAuto,
    initialRelevantUser
  );
  const initialSpeciesValue = speciesUserToSelect(initialSpeciesUser);
  const initialCountValue = effectiveCountToInput(
    initialCountUser,
    initialCountAuto,
    eventCount
  );

  const [relevantValue, setRelevantValue] =
    useState<RelevantSelectValue>(initialRelevantValue);
  const [speciesValue, setSpeciesValue] =
    useState<SpeciesSelectValue>(initialSpeciesValue);
  const [countValue, setCountValue] =
    useState<CountInputValue>(initialCountValue);
  const [busy, setBusy] = useState(false);
  const [isReadOnlyModalOpen, setIsReadOnlyModalOpen] = useState(false);

  const isManuallyNotRelevant = relevantValue === "no";
  const hasManualSpeciesOverride =
    !isManuallyNotRelevant && speciesValue !== "auto";

  const countInputInvalid =
    isMaterializedEventMode &&
    !isManuallyNotRelevant &&
    isInvalidManualCount(countValue);

  const hasCountChanged =
    isMaterializedEventMode &&
    !isManuallyNotRelevant &&
    countValue.trim() !== initialCountValue.trim();

  const hasManualCountOverride =
    isMaterializedEventMode &&
    !isManuallyNotRelevant &&
    (initialCountUser != null || hasCountChanged);

  const dirty =
    relevantValue !== initialRelevantValue ||
    (!isManuallyNotRelevant && speciesValue !== initialSpeciesValue) ||
    hasCountChanged;

  const canSave =
    dirty &&
    !busy &&
    !isDemo &&
    !countInputInvalid &&
    Boolean(materializedEventId || assetId);

  async function saveChanges() {
    if (!dirty || busy || isDemo || countInputInvalid) return;

    setBusy(true);

    try {
      const nextRelevant = selectToRelevantUser(relevantValue);

      if (materializedEventId) {
        const nextSpecies =
          nextRelevant && speciesValue !== "auto" ? speciesValue : null;
        const nextAnimalCount =
          nextRelevant && hasManualCountOverride
            ? countInputToNumber(countValue)
            : null;

        const reviewRes = await fetch("/api/materialized-event-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            materializedEventId,
            relevant: nextRelevant,
            species: nextSpecies,
            animalCount: nextAnimalCount,
          }),
        });

        if (!reviewRes.ok) {
          const rawText = await reviewRes.text();
          throw new Error(rawText || `Materialized event HTTP ${reviewRes.status}`);
        }

        if (!nextRelevant) {
          router.push(afterRemoveHref);
          return;
        }

        router.refresh();
        return;
      }

      if (!assetId) return;

      const relevantRes = await fetch("/api/asset-relevant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          relevant: nextRelevant,
        }),
      });

      if (!relevantRes.ok) {
        const rawText = await relevantRes.text();
        throw new Error(rawText || `Relevant HTTP ${relevantRes.status}`);
      }

      const relevantPayload = await relevantRes.json().catch(() => null);
      let nextEventId =
        typeof relevantPayload?.eventId === "string"
          ? relevantPayload.eventId
          : null;

      if (!nextRelevant) {
        if (typeof assetCount === "number" && assetCount > 1) {
          router.refresh();
          return;
        }

        router.push(afterRemoveHref);
        return;
      }

      const nextSpecies = speciesValue === "auto" ? null : speciesValue;

      const speciesRes = await fetch("/api/asset-species", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          species: nextSpecies,
        }),
      });

      if (!speciesRes.ok) {
        const rawText = await speciesRes.text();
        throw new Error(rawText || `Species HTTP ${speciesRes.status}`);
      }

      const speciesPayload = await speciesRes.json().catch(() => null);
      nextEventId =
        typeof speciesPayload?.eventId === "string"
          ? speciesPayload.eventId
          : nextEventId;

      if (
        typeof nextEventId === "string" &&
        nextEventId !== currentEventId &&
        assetCount === 1
      ) {
        router.push(`/cameras/events/${nextEventId}${eventQuerySuffix}`);
        return;
      }

      router.refresh();
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      alert(`${text.couldNotSave} ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex h-full flex-col space-y-4">
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
                disabled={!canSave}
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

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">{text.count}</div>

            {isMaterializedEventMode ? (
              <input
                type="number"
                min={1}
                max={999}
                step={1}
                inputMode="numeric"
                value={countValue}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  setCountValue(nextValue.replace(/[^\d]/g, ""));
                }}
                disabled={busy || isDemo || isManuallyNotRelevant}
                className="mt-2 h-11 w-full rounded-[10px] border border-white/10 bg-white/5 px-3 text-2xl font-semibold text-white outline-none disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoTitle : ""}
              />
            ) : (
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatInteger(eventCount, language)}
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">{text.imageCount}</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {formatInteger(assetCount, language)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/45">{text.relevant}</div>
            <select
              value={relevantValue}
              onChange={(e) => {
                const nextValue = e.target.value as RelevantSelectValue;
                setRelevantValue(nextValue);

                if (nextValue === "no") {
                  setSpeciesValue("auto");
                  setCountValue(initialCountValue);
                }
              }}
              disabled={(!assetId && !materializedEventId) || busy || isDemo}
              className="mt-2 w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none disabled:bg-white/5 disabled:text-white/35"
              title={isDemo ? text.demoTitle : ""}
            >
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
            {isManuallyNotRelevant ? (
              <div className="mt-2 w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/35">
                —
              </div>
            ) : (
              <select
                value={speciesValue}
                onChange={(e) =>
                  setSpeciesValue(e.target.value as SpeciesSelectValue)
                }
                disabled={(!assetId && !materializedEventId) || busy || isDemo}
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
            )}
          </div>
        </div>

        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/45">{text.probability}</div>
          <div className="mt-1 text-sm font-medium text-white">
            {isManuallyNotRelevant || hasManualSpeciesOverride || hasManualCountOverride
              ? text.manual
              : formatProbability(probabilityScore, language)}
          </div>
        </div>

        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/45">{text.camera}</div>
          <div className="mt-1 text-sm font-medium text-white">{cameraLabel}</div>
        </div>

        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/45">{text.timestamp}</div>
          <div className="mt-1 text-sm font-medium text-white">
            {timestampLabel ?? "—"}
          </div>
        </div>
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
