// src/app/cameras/import/page.tsx #4
"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type CameraRow = {
  id: string;
  name: string;
  technicalName: string;
  manualLabel: string | null;
};

function normalizeApiErrorMessage(message: string) {
  if (message.includes("Demo mode is read-only")) {
    return "Demo-Modus: Änderungen sind deaktiviert.";
  }
  return message;
}

export default function CamerasImportPage() {
  const searchParams = useSearchParams();
  const revierParam = searchParams.get("revier");
  const isDemo = searchParams.get("demo") === "1";

  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadCameras() {
    const params = new URLSearchParams();
    if (revierParam) params.set("revier", revierParam);

    const url = params.toString()
      ? `/api/manual-cameras?${params.toString()}`
      : "/api/manual-cameras";

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (!res.ok) {
      setMsg(normalizeApiErrorMessage(json.error || `HTTP ${res.status}`));
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
    loadCameras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revierParam]);

  function addFiles(newFiles: File[]) {
    const merged = [...files, ...newFiles];
    setFiles(merged);
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (isDemo) {
      setMsg("Demo-Modus: Änderungen sind deaktiviert.");
      e.target.value = "";
      return;
    }

    const picked = Array.from(e.target.files ?? []);
    if (picked.length) addFiles(picked);
    e.target.value = "";
  }

  async function startImport() {
    setMsg("");

    if (isDemo) {
      setMsg("Demo-Modus: Änderungen sind deaktiviert.");
      return;
    }

    if (!cameraId) {
      setMsg("Bitte eine manuelle Kamera auswählen.");
      return;
    }

    if (!files.length) {
      setMsg("Bitte Dateien oder ZIP auswählen.");
      return;
    }

    setBusy(true);

    try {
      const fd = new FormData();
      fd.append("cameraId", cameraId);
      fd.append("channel", "import");

      for (const f of files) {
        fd.append("files", f);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error(
          normalizeApiErrorMessage(json.error || json.details || `HTTP ${res.status}`)
        );
      }

      setFiles([]);
      setMsg(
        `✅ Import abgeschlossen: accepted=${json.accepted ?? "?"}, skippedDup=${
          json.skippedDuplicates ?? "?"
        }, batchId=${json.batchId?.slice(0, 8) ?? "?"}…`
      );
    } catch (e: any) {
      setMsg(`❌ ${normalizeApiErrorMessage(e.message)}`);
    } finally {
      setBusy(false);
      setDragOver(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);

    if (isDemo) {
      setMsg("Demo-Modus: Änderungen sind deaktiviert.");
      return;
    }

    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length) addFiles(dropped);
  }

  const canImport = !!cameraId && files.length > 0 && !busy && !isDemo;

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Import
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">Import</h1>
          <p className="mt-2 text-sm text-white/68">
            Dateien oder ZIP auswählen – oder einfach per Drag & Drop hier reinziehen.
          </p>
        </div>
      </section>

      {isDemo ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">
            Demo-Modus: Änderungen sind deaktiviert.
          </p>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Ziel-Kamera</label>
          <select
            className="w-full rounded-[10px] border border-white/10 bg-white/5 p-2 text-white outline-none disabled:bg-white/5 disabled:text-white/35"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            disabled={isDemo}
            title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
          >
            {cameras.length === 0 && (
              <option value="" className="bg-[#102018] text-white">
                (keine manuellen Kameras verfügbar)
              </option>
            )}
            {cameras.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#102018] text-white">
                {c.name}
                {c.technicalName ? ` · ${c.technicalName}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-white/45">
            Der Import wird einer als „manual“ provisionierten Kamera zugeordnet.
          </p>
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
              <div className="text-sm font-medium text-white">Dateien hinzufügen</div>
              <div className="text-xs text-white/45">
                Unterstützt: JPG/PNG/WEBP oder ZIP mit Bildern.
              </div>
            </div>

            <button
              type="button"
              className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white disabled:opacity-60"
              onClick={() => {
                if (isDemo) {
                  setMsg("Demo-Modus: Änderungen sind deaktiviert.");
                  return;
                }
                fileInputRef.current?.click();
              }}
              disabled={isDemo}
              title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
            >
              Bilder oder ZIP auswählen…
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

          <div className="mt-4 text-xs text-white/45">
            Tipp: Du kannst auch einfach Dateien oder ZIP hier reinziehen.
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-white/72">
            {files.length > 0 ? (
              <>
                Ausgewählt: <span className="font-medium text-white">{files.length}</span> Datei(en)
              </>
            ) : (
              <span className="text-white/45">Noch keine Dateien ausgewählt.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-white/15 hover:bg-white/8 hover:text-white disabled:opacity-60"
              onClick={() => {
                if (isDemo) {
                  setMsg("Demo-Modus: Änderungen sind deaktiviert.");
                  return;
                }
                setFiles([]);
              }}
              disabled={busy || files.length === 0 || isDemo}
              title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
            >
              Auswahl löschen
            </button>

            <button
              type="button"
              onClick={startImport}
              disabled={!canImport}
              className="rounded-[10px] bg-[#c9952e] px-4 py-2 text-sm text-[#102018] disabled:opacity-60"
              title={isDemo ? "Demo-Modus: Änderungen sind deaktiviert." : ""}
            >
              {busy ? "Import läuft…" : isDemo ? "Demo-Modus" : "Import starten"}
            </button>
          </div>
        </div>

        {msg ? (
          <div className="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78">
            {msg}
          </div>
        ) : null}
      </section>
    </main>
  );
}