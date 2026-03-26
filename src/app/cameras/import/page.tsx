// src/app/cameras/import/page.tsx #2
"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type CameraRow = {
  id: string;
  name: string;
  technicalName: string;
  manualLabel: string | null;
};

export default function CamerasImportPage() {
  const searchParams = useSearchParams();
  const revierParam = searchParams.get("revier");

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
      setMsg(json.error || `HTTP ${res.status}`);
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
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) addFiles(picked);
    e.target.value = "";
  }

  async function startImport() {
    setMsg("");

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
        throw new Error(json.error || json.details || `HTTP ${res.status}`);
      }

      setFiles([]);
      setMsg(
        `✅ Import abgeschlossen: accepted=${json.accepted ?? "?"}, skippedDup=${
          json.skippedDuplicates ?? "?"
        }, batchId=${json.batchId?.slice(0, 8) ?? "?"}…`
      );
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
      setDragOver(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);

    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length) addFiles(dropped);
  }

  const canImport = !!cameraId && files.length > 0 && !busy;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Import</h1>
        <p className="text-sm text-gray-600">
          Dateien oder ZIP auswählen – oder einfach per Drag & Drop hier reinziehen.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-5 space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">Ziel-Kamera</label>
          <select
            className="w-full rounded-md border p-2"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
          >
            {cameras.length === 0 && (
              <option value="">(keine manuellen Kameras verfügbar)</option>
            )}
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.technicalName ? ` · ${c.technicalName}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Der Import wird einer als „manual“ provisionierten Kamera zugeordnet.
          </p>
        </div>

        <div
          className={[
            "rounded-xl border-2 border-dashed p-5 transition",
            dragOver ? "border-black bg-gray-50" : "border-gray-300",
          ].join(" ")}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Dateien hinzufügen</div>
              <div className="text-xs text-gray-500">
                Unterstützt: JPG/PNG/WEBP oder ZIP mit Bildern.
              </div>
            </div>

            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => fileInputRef.current?.click()}
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

          <div className="mt-4 text-xs text-gray-500">
            Tipp: Du kannst auch einfach Dateien oder ZIP hier reinziehen.
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-700">
            {files.length > 0 ? (
              <>
                Ausgewählt: <span className="font-medium">{files.length}</span> Datei(en)
              </>
            ) : (
              <span className="text-gray-500">Noch keine Dateien ausgewählt.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setFiles([])}
              disabled={busy || files.length === 0}
            >
              Auswahl löschen
            </button>

            <button
              type="button"
              onClick={startImport}
              disabled={!canImport}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {busy ? "Import läuft…" : "Import starten"}
            </button>
          </div>
        </div>

        {msg && <div className="text-sm">{msg}</div>}
      </div>
    </div>
  );
}