// src/app/orga/reviere/[id]/edit/RevierBoundaryUploadForm.tsx #1
"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { AppLanguage } from "@/lib/i18n";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        boundaryFileLabel: "GeoJSON file",
        boundaryHelp:
          "Accepted: GeoJSON Feature or FeatureCollection with Polygon or MultiPolygon geometry.",
        boundarySaveIdle: "Save boundary",
        boundarySavePending: "Saving boundary...",
        chooseFileFirst: "Choose a GeoJSON file first",
        demoMode: "Demo mode",
        demoReadOnly: "Demo mode: changes are disabled.",
      }
    : {
        boundaryFileLabel: "GeoJSON-Datei",
        boundaryHelp:
          "Akzeptiert: GeoJSON Feature oder FeatureCollection mit Polygon- oder MultiPolygon-Geometrie.",
        boundarySaveIdle: "Kontur speichern",
        boundarySavePending: "Speichert Kontur...",
        chooseFileFirst: "Bitte zuerst eine GeoJSON-Datei auswählen",
        demoMode: "Demo-Modus",
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
      };
}

function BoundarySubmitButton({
  hasFile,
  isDemo,
  language,
}: {
  hasFile: boolean;
  isDemo: boolean;
  language: AppLanguage;
}) {
  const { pending } = useFormStatus();
  const text = t(language);
  const isDisabled = isDemo || !hasFile || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      title={
        isDemo
          ? text.demoReadOnly
          : hasFile
            ? ""
            : text.chooseFileFirst
      }
      className={
        isDisabled
          ? "rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/35"
          : "rounded-[10px] border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-300/15"
      }
    >
      {pending
        ? text.boundarySavePending
        : isDemo
          ? text.demoMode
          : text.boundarySaveIdle}
    </button>
  );
}

export default function RevierBoundaryUploadForm({
  action,
  isDemo,
  language,
}: {
  action: (formData: FormData) => void | Promise<void>;
  isDemo: boolean;
  language: AppLanguage;
}) {
  const text = t(language);
  const [hasFile, setHasFile] = useState(false);

  return (
    <form action={action} className="mt-5 space-y-4">
      <div>
        <label
          htmlFor="boundary_file"
          className="mb-2 block text-sm font-medium text-white"
        >
          {text.boundaryFileLabel}
        </label>
        <input
          id="boundary_file"
          name="boundary_file"
          type="file"
          accept=".geojson,application/geo+json,application/json"
          required
          disabled={isDemo}
          onChange={(event) => {
            setHasFile((event.target.files?.length ?? 0) > 0);
          }}
          className="block w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white file:mr-4 file:rounded-[8px] file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white/78 hover:file:bg-white/15 disabled:bg-white/5 disabled:text-white/35"
          title={isDemo ? text.demoReadOnly : ""}
        />
        <p className="mt-2 text-xs text-white/45">{text.boundaryHelp}</p>
      </div>

      <div>
        <BoundarySubmitButton
          hasFile={hasFile}
          isDemo={isDemo}
          language={language}
        />
      </div>
    </form>
  );
}