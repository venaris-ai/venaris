// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";

type SpeciesRow = {
  species: string;
  activity_count: number;
  last_seen_at: string | null;
};

type CameraRow = {
  id: string;
  name: string;
  health_status: string;
};

function ago(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 2) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `vor ${h} h`;
  const dDays = Math.floor(h / 24);
  return `vor ${dDays} d`;
}

export default function Home() {
  const [name, setName] = useState<string>("");

  const [species, setSpecies] = useState<SpeciesRow[]>([]);
  const [cameraStats, setCameraStats] = useState({
    total: 0,
    online: 0,
    stale: 0,
    offline: 0,
  });

  async function loadUser() {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const json = await res.json();
      if (json?.user?.first_name) setName(json.user.first_name);
      else if (json?.user?.email) setName(json.user.email);
    } catch {}
  }

  async function loadSpecies() {
    try {
      const res = await fetch(
        "/api/intelligence/species-activity?period=7d&relevantOnly=true",
        { cache: "no-store" }
      );
      const json = await res.json();
      const rows = (json.rows ?? []) as SpeciesRow[];

      rows.sort((a, b) => b.activity_count - a.activity_count);
      setSpecies(rows.slice(0, 3));
    } catch {}
  }

  async function loadCameraHealth() {
    try {
      const res = await fetch("/api/camera-health", { cache: "no-store" });
      const json = await res.json();
      const rows = (json.items ?? []) as CameraRow[];

      let online = 0;
      let stale = 0;
      let offline = 0;

      for (const c of rows) {
        if (c.health_status === "online") online++;
        else if (c.health_status === "stale") stale++;
        else if (c.health_status === "offline") offline++;
      }

      setCameraStats({
        total: rows.length,
        online,
        stale,
        offline,
      });
    } catch {}
  }

  useEffect(() => {
    loadUser();
    loadSpecies();
    loadCameraHealth();
  }, []);

  return (
    <main className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold">
          Willkommen {name || ""}
        </h1>
        <p className="text-sm text-gray-600">
          Überblick über Wildlife, Kameras und Organisation.
        </p>
      </div>

      {/* Wildlife */}
      <section className="rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Wildlife Status</h2>
          <a
            href="/wildlife"
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Mehr
          </a>
        </div>

        {species.length === 0 && (
          <div className="text-sm text-gray-500">
            Noch keine relevanten Sichtungen.
          </div>
        )}

        <div className="space-y-2">
          {species.map((s) => (
            <div
              key={s.species}
              className="flex items-center justify-between text-sm"
            >
              <div className="font-medium">{s.species}</div>
              <div className="text-gray-600">
                letzte Sichtung {ago(s.last_seen_at)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cameras */}
      <section className="rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Camera Status</h2>
          <a
            href="/cameras"
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Mehr
          </a>
        </div>

        <div className="text-sm text-gray-700">
          {cameraStats.total} Kameras installiert
        </div>

        <div className="text-sm space-x-4">
          <span className="text-green-700 font-medium">
            {cameraStats.online} online
          </span>
          <span className="text-yellow-700 font-medium">
            {cameraStats.stale} stale
          </span>
          <span className="text-red-700 font-medium">
            {cameraStats.offline} offline
          </span>
        </div>
      </section>

      {/* Orga placeholder */}
      <section className="rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Organisation</h2>
          <a
            href="/orga"
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Mehr
          </a>
        </div>

        <div className="text-sm text-gray-600">
          Organisationsübersicht folgt im nächsten Schritt.
        </div>
      </section>
    </main>
  );
}