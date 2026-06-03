// src/lib/coordinates.ts #1

export function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseLatitude(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const prefixedMatch = normalized.match(/^([NS])\s*(.+)$/i);
  if (!prefixedMatch) return parseOptionalNumber(normalized);

  const hemisphere = prefixedMatch[1].toUpperCase();
  const parsed = parseOptionalNumber(prefixedMatch[2]);

  if (parsed === null || Number.isNaN(parsed)) return parsed;
  return hemisphere === "S" ? -Math.abs(parsed) : Math.abs(parsed);
}

export function parseLongitude(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const prefixedMatch = normalized.match(/^([EOW])\s*(.+)$/i);
  if (!prefixedMatch) return parseOptionalNumber(normalized);

  const hemisphere = prefixedMatch[1].toUpperCase();
  const parsed = parseOptionalNumber(prefixedMatch[2]);

  if (parsed === null || Number.isNaN(parsed)) return parsed;
  return hemisphere === "W" ? -Math.abs(parsed) : Math.abs(parsed);
}