// src/app/cameras/import/CamerasImportPageClient.tsx #5
"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MANUAL_IMPORT_ACCEPT,
  MANUAL_IMPORT_MAX_BYTES,
  MANUAL_IMPORT_MAX_LABEL,
  isManualImportAllowedFileLike,
} from "@/lib/manualImportLimits";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { type AppLanguage } from "@/lib/i18n";

type CameraRow = {
  id: string;
  name: string;
  locationName: string | null;
};

type MessageTone = "success" | "error" | "info";

type PreparedUploadFile = {
  clientId: string;
  uploadId: string;
  status: "upload_required";
  uploadStrategy?: "signed_standard";
  bucket: string;
  storagePath: string;
  token: string;
  contentType: string;
  expectedSizeBytes: number;
};

type PrepareUploadResponse = {
  ok: boolean;
  batchId: string;
  bucket: string;
  uploadStrategy?: "signed_standard";
  maxBytes: number;
  files: PreparedUploadFile[];
};

type CompletedUpload = {
  uploadId: string;
};

function formatMb(bytes: number) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

function createClientId(file: File, index: number) {
  return [
    index,
    file.name,
    file.size,
    file.lastModified,
    crypto.randomUUID(),
  ].join(":");
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      demoReadOnly: "Demo mode: changes are disabled.",
      importEyebrow: "Import",
      importTitle: "Import",
      intro: "Select image files — or simply drag and drop them here.",
      targetCamera: "Target camera",
      noCameras: "(no cameras available)",
      targetCameraHint: "The import is assigned to the selected camera",
      addFiles: "Add files",
      addFilesHint: "Supported: JPG/PNG/WEBP.",
      chooseFiles: "Choose images…",
      dragHint: "Tip: you can also drag image files directly here.",
      selected: "Selected:",
      files: "file(s)",
      noneSelected: "No files selected yet.",
      clearSelection: "Clear selection",
      running: "Import running…",
      preparing: "Preparing upload…",
      uploading: "Uploading…",
      finalizing: "Finalizing import…",
      startImport: "Start import",
      demoMode: "Demo mode",
      selectCamera: "Please select a camera.",
      selectFiles: "Please select image files.",
      noticeTitle: "Notice",
      errorTitle: "Import could not be completed",
      successTitle: "Import queued",
      successText:
        "The selected files were uploaded successfully and are now being processed.",
      maxImportSize: `Max. ${MANUAL_IMPORT_MAX_LABEL} per import`,
      importTooLarge: `The import is larger than ${MANUAL_IMPORT_MAX_LABEL}. Please split the selection into multiple imports.`,
      unsupportedFilesSkipped: (count: number) =>
        `${count} unsupported file(s) were ignored. Supported formats: JPG, PNG, WEBP.`,
      uploadPayloadTooLarge:
        "This import is too large for the current upload route. Please split it into smaller packages for now.",
      prepareFailed: "Upload preparation failed.",
      uploadFailed: "Upload failed.",
      completeFailed: "Import completion failed.",
      preparedFileMissing:
        "Upload preparation returned an incomplete file mapping.",
    };
  }

  return {
    demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
    importEyebrow: "Import",
    importTitle: "Import",
    intro:
      "Bilddateien auswählen – oder einfach per Drag & Drop hier hineinziehen.",
    targetCamera: "Ziel-Kamera",
    noCameras: "(keine Kameras verfügbar)",
    targetCameraHint: "Der Import wird der ausgewählten Kamera zugeordnet.",
    addFiles: "Dateien hinzufügen",
    addFilesHint: "Unterstützt: JPG/PNG/WEBP.",
    chooseFiles: "Bilder auswählen…",
    dragHint: "Tipp: Du kannst Bilddateien auch direkt hier hineinziehen.",
    selected: "Ausgewählt:",
    files: "Datei(en)",
    noneSelected: "Noch keine Dateien ausgewählt.",
    clearSelection: "Auswahl löschen",
    running: "Import läuft…",
    preparing: "Upload wird vorbereitet…",
    uploading: "Upload läuft…",
    finalizing: "Import wird abgeschlossen…",
    startImport: "Import starten",
    demoMode: "Demo-Modus",
    selectCamera: "Bitte eine Kamera auswählen.",
    selectFiles: "Bitte Bilddateien auswählen.",
    noticeTitle: "Hinweis",
    errorTitle: "Import konnte nicht abgeschlossen werden",
    successTitle: "Import eingereiht",
    successText:
      "Die ausgewählten Dateien wurden erfolgreich hochgeladen und werden jetzt verarbeitet.",
    maxImportSize: `Max. ${MANUAL_IMPORT_MAX_LABEL} pro Import`,
    importTooLarge: `Der Import ist größer als ${MANUAL_IMPORT_MAX_LABEL}. Bitte die Auswahl auf mehrere Importvorgänge aufteilen.`,
    unsupportedFilesSkipped: (count: number) =>
      `${count} nicht unterstützte Datei(en) wurden ignoriert. Unterstützte Formate: JPG, PNG, WEBP.`,
    uploadPayloadTooLarge:
      "Dieser Import ist für die aktuelle Upload-Route zu groß. Bitte vorübergehend in kleinere Pakete aufteilen.",
    prepareFailed: "Upload-Vorbereitung fehlgeschlagen.",
    uploadFailed: "Upload fehlgeschlagen.",
    completeFailed: "Import-Abschluss fehlgeschlagen.",
    preparedFileMissing:
      "Die Upload-Vorbereitung hat keine vollständige Dateizuordnung geliefert.",
  };
}

function normalizeApiErrorMessage(message: string, language: AppLanguage) {
  const text = t(language);

  if (message.includes("Demo mode is read-only")) {
    return text.demoReadOnly;
  }

  if (
    message.includes("HTTP 413") ||
    message.includes("FUNCTION_PAYLOAD_TOO_LARGE") ||
    message.toLowerCase().includes("payload too large")
  ) {
    return text.uploadPayloadTooLarge;
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

async function uploadFileToSignedUrl({
  file,
  prepared,
}: {
  file: File;
  prepared: PreparedUploadFile;
}) {
  const supabase = supabaseBrowser();

  const { error } = await supabase.storage
    .from(prepared.bucket)
    .uploadToSignedUrl(prepared.storagePath, prepared.token, file, {
      cacheControl: "3600",
      contentType: prepared.contentType || file.type || "image/jpeg",
    });

  if (error) {
    throw new Error(error.message);
  }
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
  const [busyLabel, setBusyLabel] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const text = t(language);

  const selectedBytes = files.reduce((sum, file) => sum + file.size, 0);
  const selectedMb = formatMb(selectedBytes);
  const importTooLarge = selectedBytes > MANUAL_IMPORT_MAX_BYTES;

  async function loadCameras() {
    const params = new URLSearchParams();

    if (revierParam) {
      params.set("revier", revierParam);
    }

    const url = params.toString()
      ? `/api/cameras?${params.toString()}`
      : "/api/cameras";

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

    const list = (json.cameras ?? []) as CameraRow[];
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
    const supported = newFiles.filter(isManualImportAllowedFileLike);
    const rejectedCount = newFiles.length - supported.length;

    if (supported.length > 0) {
      setFiles((current) => [...current, ...supported]);
    }

    if (rejectedCount > 0) {
      setMsgTone("error");
      setMsg(text.unsupportedFilesSkipped(rejectedCount));
    }
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

  async function prepareUpload(clientIds: string[]) {
    const res = await fetch("/api/upload/prepare", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        cameraId,
        files: files.map((file, index) => ({
          clientId: clientIds[index],
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        })),
      }),
    });

    const json = await parseApiResponse(res);

    if (!res.ok || !json.ok) {
      throw new Error(
        normalizeApiErrorMessage(
          json.error || json.details || json.rawText || text.prepareFailed,
          language
        )
      );
    }

    return json as PrepareUploadResponse;
  }

  async function completeUpload(batchId: string, uploaded: CompletedUpload[]) {
    if (uploaded.length === 0) return;

    const res = await fetch("/api/upload/complete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        batchId,
        uploaded,
      }),
    });

    const json = await parseApiResponse(res);

    if (!res.ok || !json.ok) {
      throw new Error(
        normalizeApiErrorMessage(
          json.error || json.details || json.rawText || text.completeFailed,
          language
        )
      );
    }
  }

  async function startImport() {
    setMsg("");
    setUploadProgress(0);

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

    if (importTooLarge) {
      setMsgTone("error");
      setMsg(text.importTooLarge);
      return;
    }

    setBusy(true);
    setBusyLabel(text.preparing);

    const uploaded: CompletedUpload[] = [];

    try {
      const clientIds = files.map(createClientId);
      const prepared = await prepareUpload(clientIds);
      const preparedByClientId = new Map(
        prepared.files.map((preparedFile) => [
          preparedFile.clientId,
          preparedFile,
        ])
      );

      setBusyLabel(text.uploading);

      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const clientId = clientIds[index];
        const preparedFile = preparedByClientId.get(clientId);

        if (!preparedFile) {
          throw new Error(text.preparedFileMissing);
        }

        await uploadFileToSignedUrl({ file, prepared: preparedFile });

        uploaded.push({ uploadId: preparedFile.uploadId });
        setUploadProgress(
          Math.min(99, Math.round(((index + 1) / files.length) * 100))
        );
      }

      setBusyLabel(text.finalizing);
      await completeUpload(prepared.batchId, uploaded);

      setUploadProgress(100);
      setFiles([]);
      setMsgTone("success");
      setMsg(text.successText);
    } catch (error: unknown) {
      setMsgTone("error");
      setMsg(normalizeApiErrorMessage(getErrorMessage(error), language));
    } finally {
      setBusy(false);
      setBusyLabel("");
      setDragOver(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);

    if (busy) {
      return;
    }

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

  const canImport =
    !!cameraId && files.length > 0 && !busy && !isDemo && !importTooLarge;
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
            disabled={isDemo || busy}
            title={isDemo ? text.demoReadOnly : ""}
          >
            {cameras.length === 0 ? (
              <option value="" className="bg-[#102018] text-white">
                {text.noCameras}
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
            if (!isDemo && !busy) setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDemo && !busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-white">
                {text.addFiles}
              </div>
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
              disabled={isDemo || busy}
              title={isDemo ? text.demoReadOnly : ""}
            >
              {text.chooseFiles}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={MANUAL_IMPORT_ACCEPT}
            multiple
            className="hidden"
            onChange={onPickFiles}
          />

          <div className="mt-4 text-xs text-white/45">{text.dragHint}</div>

          {files.length > 0 ? (
            <ul className="mt-3 max-h-32 space-y-1 overflow-auto rounded-[14px] border border-white/10 bg-white/5 p-3 text-xs text-white/62">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="truncate"
                >
                  {file.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {busy ? (
              <div className="space-y-2">
                <div className="text-sm text-white/72">
                  {busyLabel || text.running}
                  {uploadProgress > 0 ? ` · ${uploadProgress}%` : ""}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#c9952e] transition-all"
                    style={{ width: `${Math.max(uploadProgress, 8)}%` }}
                  />
                </div>
              </div>
            ) : files.length > 0 ? (
              <div className="space-y-1 text-sm text-white/72">
                <div>
                  {text.selected}{" "}
                  <span className="font-medium text-white">{files.length}</span>{" "}
                  {text.files} ·{" "}
                  <span className="font-medium text-white">{selectedMb}</span>
                </div>
                <div
                  className={importTooLarge ? "text-rose-200" : "text-white/45"}
                >
                  {text.maxImportSize}
                </div>
              </div>
            ) : (
              <span className="text-sm text-white/45">{text.noneSelected}</span>
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
                setUploadProgress(0);
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
