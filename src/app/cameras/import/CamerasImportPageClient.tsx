// src/app/cameras/import/CamerasImportPageClient.tsx #2
"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type AppLanguage } from "@/lib/i18n";

type CameraRow = {
  id: string;
  name: string;
  locationName: string | null;
  technicalName: string;
  manualLabel: string | null;
};

type MessageTone = "success" | "error" | "info";

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      demoReadOnly: "Demo mode: changes are disabled.",
      importEyebrow: "Import",
      importTitle: "Import",
      intro:
        "Select files or a ZIP archive — or simply drag and drop them here.",
      targetCamera: "Target camera",
      noManualCameras: "(no manual cameras available)",
      targetCameraHint:
        "The import is assigned to a camera provisioned as “manual”.",
      addFiles: "Add files",
      addFilesHint: "Supported: JPG/PNG/WEBP or ZIP with images.",
      chooseFiles: "Choose images or ZIP…",
      dragHint:
        "Tip: you can also drag files or a ZIP archive directly here.",
      selected: "Selected:",
      files: "file(s)",
      noneSelected: "No files selected yet.",
      clearSelection: "Clear selection",
      running: "Import running…",
      startImport: "Start import",
      demoMode: "Demo mode",
      selectCamera: "Please select a manual camera.",
      selectFiles: "Please select files or a ZIP archive.",
      noticeTitle: "Notice",
      errorTitle: "Import could not be completed",
      successTitle: "Import completed",
      successText: "The selected files have been processed successfully.",
    };
  }

  return {
    demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
    importEyebrow: "Import",
    importTitle: "Import",
    intro:
      "Dateien oder ZIP auswählen – oder einfach per Drag & Drop hier hineinziehen.",
    targetCamera: "Ziel-Kamera",
    noManualCameras: "(keine manuellen Kameras verfügbar)",
    targetCameraHint:
      "Der Import wird einer als „manual“ provisionierten Kamera zugeordnet.",
    addFiles: "Dateien hinzufügen",
    addFilesHint: "Unterstützt: JPG/PNG/WEBP oder ZIP mit Bildern.",
    chooseFiles: "Bilder oder ZIP auswählen…",
    dragHint:
      "Tipp: Du kannst auch einfach Dateien oder ein ZIP direkt hier hineinziehen.",
    selected: "Ausgewählt:",
    files: "Datei(en)",
    noneSelected: "Noch keine Dateien ausgewählt.",
    clearSelection: "Auswahl löschen",
    running: "Import läuft…",
    startImport: "Import starten",
    demoMode: "Demo-Modus",
    selectCamera: "Bitte eine manuelle Kamera auswählen.",
    selectFiles: "Bitte Dateien oder ein ZIP auswählen.",
    noticeTitle: "Hinweis",
    errorTitle: "Import konnte nicht abgeschlossen werden",
    successTitle: "Import abgeschlossen",
    successText: "Die ausgewählten Dateien wurden erfolgreich verarbeitet.",
  };
}

function normalizeApiErrorMessage(message: string, language: AppLanguage) {
  const text = t(language);

  if (message.includes("Demo mode is read-only")) {
    return text.demoReadOnly;
  }

  return message;
}

async function parseApiResponse(res: Response) {
  const rawText = await res.text();

  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

function alertTone(tone: MessageTone) {
  if (tone === "success") {
    return {
      wrap: "border-emerald-300/20 bg-emerald-300/10",
      title: "text-emerald-100",
      text: "text-emerald-100/75",
    };
  }

  if (tone === "error") {
    return {
      wrap: "border-rose-300/20 bg-rose-300/10",
      title: "text-rose-100",
      text: "text-rose-100/75",
    };
  }

  return {
    wrap: "border-amber-300/20 bg-amber-300/10",
    title: "text-amber-100",
    text: "text-amber-100/75",
  };
}


export default function CamerasImportPageClient({
  language,
  isDemo = false,
}: {
  language: AppLanguage;
  isDemo?: boolean;
}) {
  const searchParams = useSearchParams();
  const revierParam = searchParams.get("revier");
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<MessageTone>("info");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const text = t(language);

  async function loadCameras() {
    const params = new URLSearchParams();

    if (revierParam) {
      params.set("revier", revierParam);
    }

    const url = params.toString()
      ? `/api/manual-cameras?${params.toString()}`
      : "/api/manual-cameras";

    const res = await fetch(url, { cache: "no-store" });
    const json = await parseApiResponse(res);

    if (!res.ok) {
      setMsgTone("error");
      setMsg(
        normalizeApiErrorMessage(
          json.error || json.rawText || `HTTP ${res.status}`,
          language
        )
      );
      return;
    }

    const list = (json.items ?? []) as CameraRow[];
    setCameras(list);

    setCameraId((current) => {
      if (list.length === 0) return "";
      if (!current) return list[0].id;
      if (!list.some((camera) => camera.id === current)) return list[0].id;
      return current;
    });
  }

  useEffect(() => {
    void loadCameras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revierParam, language]);

  function addFiles(newFiles: File[]) {
    setFiles((current) => [...current, ...newFiles]);
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (isDemo) {
      setMsgTone("info");
      setMsg(text.demoReadOnly);
      e.target.value = "";
      return;
    }

    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) {
      addFiles(picked);
    }

    e.target.value = "";
  }

  async function startImport() {
    setMsg("");

    if (isDemo) {
      setMsgTone("info");
      setMsg(text.demoReadOnly);
      return;
    }

    if (!cameraId) {
      setMsgTone("error");
      setMsg(text.selectCamera);
      return;
    }

    if (files.length === 0) {
      setMsgTone("error");
      setMsg(text.selectFiles);
      return;
    }

    setBusy(true);

    try {
      const formData = new FormData();
      formData.append("cameraId", cameraId);
      formData.append("channel", "import");

      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error(
          normalizeApiErrorMessage(
            json.error || json.details || `HTTP ${res.status}`,
            language
          )
        );
      }

      setFiles([]);
      setMsgTone("success");
      setMsg(text.successText);
    } catch (error: any) {
      setMsgTone("error");
      setMsg(normalizeApiErrorMessage(error.message, language));
    } finally {
      setBusy(false);
      setDragOver(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);

    if (isDemo) {
      setMsgTone("info");
      setMsg(text.demoReadOnly);
      return;
    }

    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length > 0) {
      addFiles(dropped);
    }
  }

  const canImport = !!cameraId && files.length > 0 && !busy && !isDemo;
  const messageTone = alertTone(msgTone);
  const messageTitle =
    msgTone === "success"
      ? text.successTitle
      : msgTone === "error"
        ? text.errorTitle
        : text.noticeTitle;

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.importEyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            {text.importTitle}
          </h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </div>
      </section>

      {isDemo ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">{text.demoReadOnly}</p>
        </section>
      ) : null}

      {msg ? (
        <section className={`rounded-[24px] border p-4 ${messageTone.wrap}`}>
          <p className={`text-sm font-medium ${messageTone.title}`}>
            {messageTitle}
          </p>
          <p className={`mt-1 text-sm ${messageTone.text}`}>{msg}</p>
        </section>
      ) : null}

      <section className="space-y-5 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">
            {text.targetCamera}
          </label>
          <select
            className="w-full rounded-[10px] border border-white/10 bg-white/5 p-2 text-white outline-none disabled:bg-white/5 disabled:text-white/35"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            disabled={isDemo}
            title={isDemo ? text.demoReadOnly : ""}
          >
            {cameras.length === 0 ? (
              <option value="" className="bg-[#102018] text-white">
                {text.noManualCameras}
              </option>
            ) : null}

            {cameras.map((camera) => (
              <option
                key={camera.id}
                value={camera.id}
                className="bg-[#102018] text-white"
              >


{camera.name}
{camera.locationName ? ` · ${camera.locationName}` : ""}
{camera.manualLabel || camera.technicalName
  ? ` · ${camera.manualLabel || camera.technicalName}`
  : ""}

              </option>
            ))}
          </select>
          <p className="text-xs text-white/45">{text.targetCameraHint}</p>
        </div>

        <div
          className={[
            "rounded-[24px] border-2 border-dashed p-5 transition",
            dragOver
              ? "border-amber-300/30 bg-white/8"
              : "border-white/10 bg-white/5",
            isDemo ? "opacity-70" : "",
          ].join(" ")}
          onDragEnter={(e) => {
            e.preventDefault();
            if (!isDemo) setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDemo) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-white">{text.addFiles}</div>
              <div className="text-xs text-white/45">{text.addFilesHint}</div>
            </div>

            <button
              type="button"
              className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white disabled:opacity-60"
              onClick={() => {
                if (isDemo) {
                  setMsgTone("info");
                  setMsg(text.demoReadOnly);
                  return;
                }

                fileInputRef.current?.click();
              }}
              disabled={isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            >
              {text.chooseFiles}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.zip"
            multiple
            className="hidden"
            onChange={onPickFiles}
          />


<div className="mt-4 text-xs text-white/45">{text.dragHint}</div>

{files.length > 0 ? (
  <ul className="mt-3 max-h-32 space-y-1 overflow-auto rounded-[14px] border border-white/10 bg-white/5 p-3 text-xs text-white/62">
    {files.map((file, index) => (
      <li key={`${file.name}-${file.size}-${index}`} className="truncate">
        {file.name}
      </li>
    ))}
  </ul>
) : null}
</div>

<div className="flex items-center justify-between gap-3">
  <div className="text-sm text-white/72">
    {files.length > 0 ? (
      <>
        {text.selected}{" "}
        <span className="font-medium text-white">{files.length}</span>{" "}
        {text.files}
      </>
    ) : (
      <span className="text-white/45">{text.noneSelected}</span>
    )}
  </div>





          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-white/15 hover:bg-white/8 hover:text-white disabled:opacity-60"
              onClick={() => {
                if (isDemo) {
                  setMsgTone("info");
                  setMsg(text.demoReadOnly);
                  return;
                }

                setFiles([]);
              }}
              disabled={busy || files.length === 0 || isDemo}
              title={isDemo ? text.demoReadOnly : ""}
            >
              {text.clearSelection}
            </button>


<button
  type="button"
  onClick={startImport}
  disabled={!canImport}
  className={[
    "rounded-[10px] px-4 py-2 text-sm transition disabled:cursor-not-allowed",
    canImport
      ? "bg-[#c9952e] text-[#102018] hover:bg-[#d6a13a]"
      : "bg-white/10 text-white/35",
  ].join(" ")}
  title={isDemo ? text.demoReadOnly : ""}
>
  {busy ? text.running : isDemo ? text.demoMode : text.startImport}
</button>



          </div>
        </div>
      </section>
    </main>
  );
}