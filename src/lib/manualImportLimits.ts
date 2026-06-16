// src/lib/manualImportLimits.ts #1

export const MANUAL_IMPORT_MAX_BYTES = 50_000_000;
export const MANUAL_IMPORT_MAX_LABEL = "50 MB";
export const MANUAL_IMPORT_MAX_FILES = 500;

export const MANUAL_IMPORT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MANUAL_IMPORT_ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;

export const MANUAL_IMPORT_ACCEPT =
  "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

const allowedMimeTypes = new Set<string>(MANUAL_IMPORT_ALLOWED_MIME_TYPES);
const allowedExtensions = new Set<string>(MANUAL_IMPORT_ALLOWED_EXTENSIONS);

export function isManualImportAllowedFileName(name: string) {
  const normalized = String(name || "").toLowerCase().trim();
  return MANUAL_IMPORT_ALLOWED_EXTENSIONS.some((ext) =>
    normalized.endsWith(ext)
  );
}

export function getManualImportFileExtension(name: string) {
  const normalized = String(name || "").toLowerCase().trim();
  const match = normalized.match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export function isManualImportAllowedMimeType(type: string | null | undefined) {
  const normalized = String(type || "").toLowerCase().trim();

  // Browser/File APIs sometimes leave type empty for local files.
  // Supabase bucket MIME restriction is intentionally not set yet because
  // existing FTP/SMTP production paths still allow a wider set.
  if (!normalized || normalized === "application/octet-stream") {
    return true;
  }

  return allowedMimeTypes.has(normalized);
}

export function isManualImportAllowedFileLike(file: {
  name: string;
  type?: string | null;
}) {
  const extension = getManualImportFileExtension(file.name);

  return (
    allowedExtensions.has(extension) &&
    isManualImportAllowedMimeType(file.type)
  );
}