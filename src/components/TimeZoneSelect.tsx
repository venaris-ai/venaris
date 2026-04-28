// src/components/TimeZoneSelect.tsx #1
"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_TIME_ZONE = "Europe/Berlin";

const FALLBACK_TIME_ZONES = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Dublin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

type Props = {
  name?: string;
  id?: string;
  label: string;
  helpText?: string;
  disabled?: boolean;
  title?: string;
  initialValue?: string | null;
};

function getSupportedTimeZones() {
  try {
    const supportedValuesOf = (
      Intl as typeof Intl & {
        supportedValuesOf?: (key: "timeZone") => string[];
      }
    ).supportedValuesOf;

    if (typeof supportedValuesOf === "function") {
      return supportedValuesOf("timeZone").sort((a, b) => a.localeCompare(b));
    }
  } catch {
    // fallback below
  }

  return FALLBACK_TIME_ZONES;
}

function getClientTimeZone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone.trim()
      ? timeZone.trim()
      : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export default function TimeZoneSelect({
  name = "timezone",
  id = "timezone",
  label,
  helpText,
  disabled = false,
  title = "",
  initialValue = null,
}: Props) {
  const timeZones = useMemo(() => getSupportedTimeZones(), []);
  const safeInitialValue =
    initialValue && timeZones.includes(initialValue)
      ? initialValue
      : DEFAULT_TIME_ZONE;

  const [value, setValue] = useState(safeInitialValue);

  useEffect(() => {
    if (initialValue && timeZones.includes(initialValue)) return;

    const clientTimeZone = getClientTimeZone();

    if (timeZones.includes(clientTimeZone)) {
      setValue(clientTimeZone);
    }
  }, [initialValue, timeZones]);

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white">
        {label}
      </label>

      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 disabled:bg-white/5 disabled:text-white/35"
        title={title}
      >
        {timeZones.map((timeZone) => (
          <option key={timeZone} value={timeZone} className="bg-[#102018] text-white">
            {timeZone}
          </option>
        ))}
      </select>

      {helpText ? <p className="mt-2 text-xs text-white/45">{helpText}</p> : null}
    </div>
  );
}