"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type PeriodKey = "24h" | "7d" | "30d";

type SpeciesActivityRow = {
  species: string;
  detection_count: number;
  asset_count: number;
  avg_score: number | null;
  max_score: number | null;
};

type HourlyActivityRow = {
  hour_of_day: number;
  asset_count: number;
};

type SpeciesActivityResponse = {
  period: PeriodKey;
  startAt: string;
  endAt: string;
  rows: SpeciesActivityRow[];
};

type HourlyActivityResponse = {
  period: PeriodKey;
  startAt: string;
  endAt: string;
  rows: HourlyActivityRow[];
};

const PERIODS: PeriodKey[] = ["24h", "7d", "30d"];

function formatScore(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(3);
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function prettifySpecies(species: string) {
  return species.replaceAll("_", " ");
}

export default function IntelligencePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const period = (searchParams.get("period") as PeriodKey) || "7d";
  const selectedSpecies = searchParams.get("species") || "";

  const [speciesData, setSpeciesData] = useState<SpeciesActivityResponse | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyActivityResponse | null>(null);

  const [loadingSpecies, setLoadingSpecies] = useState(false);
  const [loadingHourly, setLoadingHourly] = useState(false);

  const [speciesError, setSpeciesError] = useState<string | null>(null);
  const [hourlyError, setHourlyError] = useState<string | null>(null);

  const availableSpecies = useMemo(() => {
    return (speciesData?.rows || []).map((row) => row.species);
  }, [speciesData]);

  useEffect(() => {
    let cancelled = false;

    async function loadSpeciesActivity() {
      try {
        setLoadingSpecies(true);
        setSpeciesError(null);

        const res = await fetch(
          `/api/intelligence/species-activity?period=${encodeURIComponent(period)}`,
          { cache: "no-store" }
        );

        if (!res.ok) {
          throw new Error(`species_activity_http_${res.status}`);
        }

        const json: SpeciesActivityResponse = await res.json();
        if (!cancelled) {
          setSpeciesData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setSpeciesError(err instanceof Error ? err.message : "Unknown error");
          setSpeciesData(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingSpecies(false);
        }
      }
    }

    loadSpeciesActivity();

    return () => {
      cancelled = true;
    };
  }, [period]);

  useEffect(() => {
    let cancelled = false;

    async function loadHourlyActivity() {
      try {
        setLoadingHourly(true);
        setHourlyError(null);

        const qs = new URLSearchParams();
        qs.set("period", period);
        if (selectedSpecies) qs.set("species", selectedSpecies);

        const res = await fetch(`/api/intelligence/activity-by-hour?${qs.toString()}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`hourly_activity_http_${res.status}`);
        }

        const json: HourlyActivityResponse = await res.json();
        if (!cancelled) {
          setHourlyData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setHourlyError(err instanceof Error ? err.message : "Unknown error");
          setHourlyData(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingHourly(false);
        }
      }
    }

    loadHourlyActivity();

    return () => {
      cancelled = true;
    };
  }, [period, selectedSpecies]);

  function updateQuery(next: { period?: PeriodKey; species?: string }) {
    const params = new URLSearchParams(searchParams.toString());

    if (next.period) {
      params.set("period", next.period);
    }

    if (next.species !== undefined) {
      if (next.species) {
        params.set("species", next.species);
      } else {
        params.delete("species");
      }
    }

    router.replace(`/intelligence?${params.toString()}`);
  }

  const maxHourlyCount = Math.max(
    1,
    ...(hourlyData?.rows?.map((row) => row.asset_count) || [1])
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Visible Intelligence</h1>
        <p className="mt-2 text-sm text-gray-600">
          Activity windows are operational views, not long-term trends.
        </p>
      </div>

      <section className="mb-8 rounded-xl border bg-white p-4">
        <div className="mb-3 text-sm font-medium text-gray-700">Activity Window</div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => {
            const active = p === period;
            return (
              <button
                key={p}
                onClick={() => updateQuery({ period: p })}
                className={`rounded-md border px-3 py-2 text-sm ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-gray-300 bg-white text-black hover:bg-gray-50"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-8 rounded-xl border bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Species Activity</h2>
            <p className="text-sm text-gray-600">
              Aggregated detections within the selected activity window.
            </p>
          </div>
          {loadingSpecies && <div className="text-sm text-gray-500">Loading…</div>}
        </div>

        {speciesError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Failed to load species activity: {speciesError}
          </div>
        ) : !speciesData || speciesData.rows.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No species activity found for this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Species</th>
                  <th className="px-3 py-2 font-medium">Detections</th>
                  <th className="px-3 py-2 font-medium">Assets</th>
                  <th className="px-3 py-2 font-medium">Avg Score</th>
                  <th className="px-3 py-2 font-medium">Max Score</th>
                </tr>
              </thead>
              <tbody>
                {speciesData.rows.map((row) => (
                  <tr key={row.species} className="border-b last:border-b-0">
                    <td className="px-3 py-2 capitalize">{prettifySpecies(row.species)}</td>
                    <td className="px-3 py-2">{row.detection_count}</td>
                    <td className="px-3 py-2">{row.asset_count}</td>
                    <td className="px-3 py-2">{formatScore(row.avg_score)}</td>
                    <td className="px-3 py-2">{formatScore(row.max_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Hourly Activity</h2>
            <p className="text-sm text-gray-600">
              Asset activity by hour based on captured_at.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:min-w-64">
            <label htmlFor="speciesFilter" className="text-sm font-medium text-gray-700">
              Species filter
            </label>
            <select
              id="speciesFilter"
              value={selectedSpecies}
              onChange={(e) => updateQuery({ species: e.target.value })}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">All species</option>
              {availableSpecies.map((species) => (
                <option key={species} value={species}>
                  {prettifySpecies(species)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingHourly && <div className="mb-3 text-sm text-gray-500">Loading…</div>}

        {hourlyError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Failed to load hourly activity: {hourlyError}
          </div>
        ) : !hourlyData ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No hourly activity data available.
          </div>
        ) : (
          <div className="space-y-2">
            {hourlyData.rows.map((row) => {
              const widthPct = `${(row.asset_count / maxHourlyCount) * 100}%`;

              return (
                <div
                  key={row.hour_of_day}
                  className="grid grid-cols-[72px_1fr_56px] items-center gap-3"
                >
                  <div className="text-sm text-gray-700">{formatHour(row.hour_of_day)}</div>

                  <div className="h-6 rounded bg-gray-100">
                    <div
                      className="h-6 rounded bg-black"
                      style={{ width: widthPct }}
                      title={`${row.asset_count} assets`}
                    />
                  </div>

                  <div className="text-right text-sm text-gray-700">{row.asset_count}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}