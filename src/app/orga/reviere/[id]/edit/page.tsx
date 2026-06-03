// src/app/orga/reviere/[id]/edit/page.tsx #14
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { redirectIfDemoWrite } from "@/lib/auth";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseLatitude, parseLongitude } from "@/lib/coordinates";
import SubmitButton from "@/components/SubmitButton";
import TimeZoneSelect from "@/components/TimeZoneSelect";
import RevierBoundaryUploadForm from "./RevierBoundaryUploadForm";
import RevierMapObjectsForm, {
  type RevierMapObjectFormRow,
} from "./RevierMapObjectsForm";
import RevierSpeciesTargetsForm, {
  type SpeciesTargetFormRow,
} from "./RevierSpeciesTargetsForm";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";

const DEFAULT_TIME_ZONE = "Europe/Berlin";
const MAX_BOUNDARY_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_TARGET_PER_100HA = 1000;

type RevierRow = {
  id: string;
  name: string;
  area_ha: number;
  region: string | null;
  country: string | null;
  notes: string | null;
  status: string;
  organization_id: string;
  timezone: string;
};

type RevierBoundaryRow = {
  id: string;
  name: string;
  source: string | null;
  updated_at: string;
  geometry: unknown;
};

type RevierSpeciesTargetRow = {
  species: string;
  target_per_100ha: number | string;
};

type RevierMapObjectRow = {
  id: string;
  type: RevierMapObjectFormRow["type"];
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  status: RevierMapObjectFormRow["status"];
};

async function resolveUiLanguageForProtectedPath(pathname: string) {
  const ctx = await requirePathAccess(pathname);

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const supabase = supabaseServer();
  const cookieStore = await cookies();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  return { ctx, supabase, language };
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        nameRequired: "Ground name is required.",
        areaRequired: "Area in ha is required.",
        areaInvalid: "Area in ha must be a valid positive number.",
        timezoneInvalid: "Invalid time zone.",
        updateFailedPrefix: "Failed to update ground:",
        targetLoadFailedPrefix: "Failed to load target population values:",
        targetUpdateFailedPrefix: "Failed to update target population values:",
        targetRefreshFailedPrefix: "Failed to refresh PopSim snapshot:",
        targetValueMissing: "A target population value is missing.",
        targetValueInvalid:
          "Target population values must be valid numbers between 0 and 1000.",
        boundaryMissingFile: "Please select a GeoJSON file.",
        boundaryFileTooLarge: "The GeoJSON file is too large.",
        boundaryInvalidJson: "The selected file is not valid JSON.",
        boundaryInvalidType:
          "The GeoJSON must be a Feature or FeatureCollection.",
        boundaryInvalidGeometry:
          "The GeoJSON must contain at least one Polygon or MultiPolygon.",
        boundaryTargetNotFound: "Ground not found.",
        boundarySaveFailedPrefix: "Failed to save ground boundary:",
        mapObjectsUpdated: "Ground infrastructure was saved successfully.",
        mapObjectDeleted: "Ground infrastructure was deleted successfully.",
        mapObjectsLoadFailedPrefix: "Failed to load ground infrastructure:",
        mapObjectNameRequired: "Name is required.",
        mapObjectTypeInvalid: "Invalid type.",
        mapObjectStatusInvalid: "Invalid status.",
        mapObjectLatitudeRequired: "Latitude is required.",
        mapObjectLongitudeRequired: "Longitude is required.",
        mapObjectLatitudeInvalid: "Latitude must be between -90 and 90.",
        mapObjectLongitudeInvalid: "Longitude must be between -180 and 180.",
        mapObjectTargetNotFound: "Ground infrastructure object not found.",
        mapObjectSaveFailedPrefix: "Failed to save ground infrastructure:",
        mapObjectDeleteFailedPrefix: "Failed to delete ground infrastructure:",
        eyebrow: "Edit ground",
        title: "Edit ground",
        intro: "Edit the master data and status of the selected ground here.",
        demoReadOnly: "Demo mode: changes are disabled.",
        boundarySaved: "Ground boundary was saved successfully.",
        targetsSaved:
          "Target population values were saved and PopSim updated.",
        nameLabel: "Ground name *",
        areaLabel: "Area in ha *",
        regionLabel: "Region",
        countryLabel: "Country",
        timezoneLabel: "Time zone",
        timezoneHelp:
          "Used for wildlife, image and event times in this ground.",
        statusLabel: "Status",
        notesLabel: "Notes",
        active: "Active",
        paused: "Paused",
        archived: "Archived",
        saveIdle: "Save changes",
        savePending: "Saving...",
        demoMode: "Demo mode",
        cancel: "Cancel",
        targetsTitle: "Target population by species in this ground",
        targetsText:
          "These ground-specific target populations are used by PopSim to calculate the harvest recommendation.",
        boundaryTitle: "Ground boundary",
        boundaryText:
          "Upload a GeoJSON file to display the ground boundary as a layer on the camera map.",
        boundaryPresent: "Boundary available",
        boundaryMissing: "No boundary has been uploaded for this ground yet.",
        boundarySource: "Source",
        boundaryFeatures: "Features",
        boundaryPoints: "Points",
        boundaryUpdated: "Updated",
        boundaryFileLabel: "GeoJSON file",
        boundaryHelp:
          "Accepted: GeoJSON Feature or FeatureCollection with Polygon or MultiPolygon geometry.",
        boundarySaveIdle: "Save boundary",
        boundarySavePending: "Saving boundary...",
      }
    : {
        nameRequired: "Reviername ist erforderlich.",
        areaRequired: "Fläche in ha ist erforderlich.",
        areaInvalid: "Fläche in ha muss eine gültige positive Zahl sein.",
        timezoneInvalid: "Ungültige Zeitzone.",
        updateFailedPrefix: "Failed to update revier:",
        targetLoadFailedPrefix: "Fehler beim Laden des Zielbestands:",
        targetUpdateFailedPrefix: "Fehler beim Speichern des Zielbestands:",
        targetRefreshFailedPrefix:
          "Fehler beim Neuberechnen des PopSim-Snapshots:",
        targetValueMissing: "Ein Zielbestand fehlt.",
        targetValueInvalid:
          "Zielbestände müssen gültige Zahlen zwischen 0 und 1000 sein.",
        boundaryMissingFile: "Bitte eine GeoJSON-Datei auswählen.",
        boundaryFileTooLarge: "Die GeoJSON-Datei ist zu groß.",
        boundaryInvalidJson: "Die ausgewählte Datei enthält kein gültiges JSON.",
        boundaryInvalidType:
          "Das GeoJSON muss ein Feature oder eine FeatureCollection sein.",
        boundaryInvalidGeometry:
          "Das GeoJSON muss mindestens ein Polygon oder MultiPolygon enthalten.",
        boundaryTargetNotFound: "Revier wurde nicht gefunden.",
        boundarySaveFailedPrefix: "Fehler beim Speichern der Revierkontur:",
        mapObjectsUpdated: "Reviereinrichtung wurde erfolgreich gespeichert.",
        mapObjectDeleted: "Reviereinrichtung wurde erfolgreich gelöscht.",
        mapObjectsLoadFailedPrefix: "Fehler beim Laden der Reviereinrichtungen:",
        mapObjectNameRequired: "Name ist erforderlich.",
        mapObjectTypeInvalid: "Ungültiger Typ.",
        mapObjectStatusInvalid: "Ungültiger Status.",
        mapObjectLatitudeRequired: "Breitengrad ist erforderlich.",
        mapObjectLongitudeRequired: "Längengrad ist erforderlich.",
        mapObjectLatitudeInvalid: "Breitengrad muss zwischen -90 und 90 liegen.",
        mapObjectLongitudeInvalid:
          "Längengrad muss zwischen -180 und 180 liegen.",
        mapObjectTargetNotFound: "Reviereinrichtung wurde nicht gefunden.",
        mapObjectSaveFailedPrefix:
          "Fehler beim Speichern der Reviereinrichtung:",
        mapObjectDeleteFailedPrefix:
          "Fehler beim Löschen der Reviereinrichtung:",
        eyebrow: "Revier bearbeiten",
        title: "Revier bearbeiten",
        intro:
          "Bearbeite hier die Stammdaten und den Status des ausgewählten Reviers.",
        demoReadOnly: "Demo-Modus: Änderungen sind deaktiviert.",
        boundarySaved: "Revierkontur wurde erfolgreich gespeichert.",
        targetsSaved:
          "Zielbestand wurde gespeichert und PopSim aktualisiert.",
        nameLabel: "Reviername *",
        areaLabel: "Fläche in ha *",
        regionLabel: "Region",
        countryLabel: "Land",
        timezoneLabel: "Zeitzone",
        timezoneHelp:
          "Wird für Wildlife-, Bild- und Eventzeiten in diesem Revier verwendet.",
        statusLabel: "Status",
        notesLabel: "Notizen",
        active: "Aktiv",
        paused: "Pausiert",
        archived: "Archiviert",
        saveIdle: "Änderungen speichern",
        savePending: "Speichert...",
        demoMode: "Demo-Modus",
        cancel: "Abbrechen",
        targetsTitle: "Zielbestand der Wildarten im Revier",
        targetsText:
          "Diese revierbezogenen Zielbestände verwendet PopSim für die Berechnung des Entnahmevorschlags.",
        boundaryTitle: "Revierkontur",
        boundaryText:
          "Lade eine GeoJSON-Datei hoch, um die Revierkontur als Layer auf der Kamerakarte anzuzeigen.",
        boundaryPresent: "Kontur vorhanden",
        boundaryMissing:
          "Für dieses Revier wurde noch keine Kontur hochgeladen.",
        boundarySource: "Quelle",
        boundaryFeatures: "Features",
        boundaryPoints: "Punkte",
        boundaryUpdated: "Aktualisiert",
        boundaryFileLabel: "GeoJSON-Datei",
        boundaryHelp:
          "Akzeptiert: GeoJSON Feature oder FeatureCollection mit Polygon- oder MultiPolygon-Geometrie.",
        boundarySaveIdle: "Kontur speichern",
        boundarySavePending: "Speichert Kontur...",
      };
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeTimeZone(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return DEFAULT_TIME_ZONE;

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 100) return DEFAULT_TIME_ZONE;

  return isValidTimeZone(trimmed) ? trimmed : DEFAULT_TIME_ZONE;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getGeometryType(geometry: unknown) {
  if (!isObject(geometry)) return null;

  const type = geometry.type;
  return typeof type === "string" ? type : null;
}

function featureHasBoundaryGeometry(feature: unknown) {
  if (!isObject(feature)) return false;

  const geometryType = getGeometryType(feature.geometry);
  return geometryType === "Polygon" || geometryType === "MultiPolygon";
}

function geoJsonHasBoundaryGeometry(geoJson: unknown) {
  if (!isObject(geoJson)) return false;

  if (geoJson.type === "Feature") {
    return featureHasBoundaryGeometry(geoJson);
  }

  if (geoJson.type === "FeatureCollection") {
    return (
      Array.isArray(geoJson.features) &&
      geoJson.features.some((feature) => featureHasBoundaryGeometry(feature))
    );
  }

  return false;
}

function validateBoundaryGeoJson(geoJson: unknown, language: AppLanguage) {
  const text = t(language);

  if (!isObject(geoJson) || typeof geoJson.type !== "string") {
    throw new Error(text.boundaryInvalidType);
  }

  if (geoJson.type !== "Feature" && geoJson.type !== "FeatureCollection") {
    throw new Error(text.boundaryInvalidType);
  }

  if (!geoJsonHasBoundaryGeometry(geoJson)) {
    throw new Error(text.boundaryInvalidGeometry);
  }

  return geoJson;
}

function collectLngLatCoordinates(value: unknown, result: [number, number][]) {
  if (!Array.isArray(value)) return;

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  ) {
    result.push([value[0], value[1]]);
    return;
  }

  for (const item of value) {
    collectLngLatCoordinates(item, result);
  }
}

function extractFeatureCount(geometry: unknown) {
  if (!isObject(geometry)) return 0;

  if (geometry.type === "Feature") return 1;

  if (geometry.type === "FeatureCollection" && Array.isArray(geometry.features)) {
    return geometry.features.length;
  }

  return 0;
}

function extractPointCount(geometry: unknown) {
  const coordinates: [number, number][] = [];

  if (!isObject(geometry)) return 0;

  if (geometry.type === "Feature" && isObject(geometry.geometry)) {
    collectLngLatCoordinates(geometry.geometry.coordinates, coordinates);
    return coordinates.length;
  }

  if (geometry.type === "FeatureCollection" && Array.isArray(geometry.features)) {
    for (const feature of geometry.features) {
      if (isObject(feature) && isObject(feature.geometry)) {
        collectLngLatCoordinates(feature.geometry.coordinates, coordinates);
      }
    }
  }

  return coordinates.length;
}

function formatDateTime(value: string, language: AppLanguage) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(date);
}

function parseTargetValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(",", ".");

  if (!normalized) return null;

  const parsed = Number(normalized);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > MAX_TARGET_PER_100HA
  ) {
    return null;
  }

  return parsed;
}

const REVIER_MAP_OBJECT_TYPES = [
  "high_seat",
  "ladder",
  "feeding_place",
  "salt_lick",
  "trap",
  "other",
] as const;

const REVIER_MAP_OBJECT_STATUSES = ["active", "inactive"] as const;

function isRevierMapObjectType(
  value: string
): value is RevierMapObjectFormRow["type"] {
  return REVIER_MAP_OBJECT_TYPES.includes(
    value as RevierMapObjectFormRow["type"]
  );
}

function isRevierMapObjectStatus(
  value: string
): value is RevierMapObjectFormRow["status"] {
  return REVIER_MAP_OBJECT_STATUSES.includes(
    value as RevierMapObjectFormRow["status"]
  );
}

function parseRequiredLatitude(value: string, language: AppLanguage) {
  const text = t(language);
  const parsed = parseLatitude(value);

  if (parsed === null) {
    throw new Error(text.mapObjectLatitudeRequired);
  }

  if (!Number.isFinite(parsed) || parsed < -90 || parsed > 90) {
    throw new Error(text.mapObjectLatitudeInvalid);
  }

  return parsed;
}

function parseRequiredLongitude(value: string, language: AppLanguage) {
  const text = t(language);
  const parsed = parseLongitude(value);

  if (parsed === null) {
    throw new Error(text.mapObjectLongitudeRequired);
  }

  if (!Number.isFinite(parsed) || parsed < -180 || parsed > 180) {
    throw new Error(text.mapObjectLongitudeInvalid);
  }

  return parsed;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sortSpeciesTargetRows(
  a: SpeciesTargetFormRow,
  b: SpeciesTargetFormRow,
  language: AppLanguage
) {
  const aIsOther = a.species === "other";
  const bIsOther = b.species === "other";

  if (aIsOther && !bIsOther) return 1;
  if (!aIsOther && bIsOther) return -1;

  return a.label.localeCompare(b.label, language === "en" ? "en" : "de");
}

async function updateRevier(revierId: string, formData: FormData) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${revierId}/edit`
  );
  redirectIfDemoWrite(ctx, `/orga/reviere/${revierId}/edit?demo_read_only=1`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const text = t(language);

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const name = String(formData.get("name") ?? "").trim();
  const areaHaRaw = String(formData.get("area_ha") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const country = String(formData.get("country") ?? "DE").trim() || "DE";
  const timezone = normalizeTimeZone(formData.get("timezone"));
  const status = String(formData.get("status") ?? "active").trim() || "active";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    throw new Error(text.nameRequired);
  }

  if (!areaHaRaw) {
    throw new Error(text.areaRequired);
  }

  const parsed = Number(areaHaRaw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(text.areaInvalid);
  }

  if (!isValidTimeZone(timezone)) {
    throw new Error(text.timezoneInvalid);
  }

  const areaHa = Math.round(parsed);

  const { error } = await supabase
    .from("reviers")
    .update({
      name,
      area_ha: areaHa,
      region: region || null,
      country,
      timezone,
      status,
      notes: notes || null,
    })
    .eq("id", revierId)
    .eq("organization_id", organization.id);

  if (error) {
    throw new Error(`${text.updateFailedPrefix} ${error.message}`);
  }

  revalidatePath("/orga/reviere");
  revalidatePath("/", "layout");
  redirect("/orga/reviere?updated=1");
}

async function createRevierMapObject(revierId: string, formData: FormData) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${revierId}/edit`
  );
  redirectIfDemoWrite(ctx, `/orga/reviere/${revierId}/edit?demo_read_only=1`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const text = t(language);

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const { data: revierData, error: revierError } = await supabase
    .from("reviers")
    .select("id")
    .eq("id", revierId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (revierError) {
    throw new Error(`${text.mapObjectSaveFailedPrefix} ${revierError.message}`);
  }

  if (!revierData) {
    throw new Error(text.boundaryTargetNotFound);
  }

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const status = String(formData.get("status") ?? "active").trim();

  if (!name) {
    throw new Error(text.mapObjectNameRequired);
  }

  if (!isRevierMapObjectType(type)) {
    throw new Error(text.mapObjectTypeInvalid);
  }

  if (!isRevierMapObjectStatus(status)) {
    throw new Error(text.mapObjectStatusInvalid);
  }

  const latitude = parseRequiredLatitude(latitudeRaw, language);
  const longitude = parseRequiredLongitude(longitudeRaw, language);

  const { error } = await supabase.from("revier_map_objects").insert({
    organization_id: organization.id,
    revier_id: revierId,
    type,
    name,
    description: description || null,
    latitude,
    longitude,
    status,
    created_by: ctx.user?.id ?? null,
  });

  if (error) {
    throw new Error(`${text.mapObjectSaveFailedPrefix} ${error.message}`);
  }

  revalidatePath(`/orga/reviere/${revierId}/edit`);
  revalidatePath("/cameras/health");
  revalidatePath("/cameras");
  revalidatePath("/", "layout");
  redirect(`/orga/reviere/${revierId}/edit?map_objects_updated=1`);
}

async function updateRevierMapObject(revierId: string, formData: FormData) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${revierId}/edit`
  );
  redirectIfDemoWrite(ctx, `/orga/reviere/${revierId}/edit?demo_read_only=1`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const text = t(language);

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const objectId = String(formData.get("object_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const status = String(formData.get("status") ?? "active").trim();

  if (!objectId) {
    throw new Error(text.mapObjectTargetNotFound);
  }

  if (!name) {
    throw new Error(text.mapObjectNameRequired);
  }

  if (!isRevierMapObjectType(type)) {
    throw new Error(text.mapObjectTypeInvalid);
  }

  if (!isRevierMapObjectStatus(status)) {
    throw new Error(text.mapObjectStatusInvalid);
  }

  const latitude = parseRequiredLatitude(latitudeRaw, language);
  const longitude = parseRequiredLongitude(longitudeRaw, language);

  const { data: existing, error: existingError } = await supabase
    .from("revier_map_objects")
    .select("id")
    .eq("id", objectId)
    .eq("revier_id", revierId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`${text.mapObjectSaveFailedPrefix} ${existingError.message}`);
  }

  if (!existing) {
    throw new Error(text.mapObjectTargetNotFound);
  }

  const { error } = await supabase
    .from("revier_map_objects")
    .update({
      type,
      name,
      description: description || null,
      latitude,
      longitude,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", objectId)
    .eq("revier_id", revierId)
    .eq("organization_id", organization.id);

  if (error) {
    throw new Error(`${text.mapObjectSaveFailedPrefix} ${error.message}`);
  }

  revalidatePath(`/orga/reviere/${revierId}/edit`);
  revalidatePath("/cameras/health");
  revalidatePath("/cameras");
  revalidatePath("/", "layout");
  redirect(`/orga/reviere/${revierId}/edit?map_objects_updated=1`);
}

async function deleteRevierMapObject(revierId: string, formData: FormData) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${revierId}/edit`
  );
  redirectIfDemoWrite(ctx, `/orga/reviere/${revierId}/edit?demo_read_only=1`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const text = t(language);

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const objectId = String(formData.get("object_id") ?? "").trim();

  if (!objectId) {
    throw new Error(text.mapObjectTargetNotFound);
  }

  const { data: existing, error: existingError } = await supabase
    .from("revier_map_objects")
    .select("id")
    .eq("id", objectId)
    .eq("revier_id", revierId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `${text.mapObjectDeleteFailedPrefix} ${existingError.message}`
    );
  }

  if (!existing) {
    throw new Error(text.mapObjectTargetNotFound);
  }

  const { error } = await supabase
    .from("revier_map_objects")
    .delete()
    .eq("id", objectId)
    .eq("revier_id", revierId)
    .eq("organization_id", organization.id);

  if (error) {
    throw new Error(`${text.mapObjectDeleteFailedPrefix} ${error.message}`);
  }

  revalidatePath(`/orga/reviere/${revierId}/edit`);
  revalidatePath("/cameras/health");
  revalidatePath("/cameras");
  revalidatePath("/", "layout");
  redirect(`/orga/reviere/${revierId}/edit?map_object_deleted=1`);
}

async function updateRevierSpeciesTargets(
  revierId: string,
  formData: FormData
) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${revierId}/edit`
  );
  redirectIfDemoWrite(ctx, `/orga/reviere/${revierId}/edit?demo_read_only=1`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const text = t(language);

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const { data: revierData, error: revierError } = await supabase
    .from("reviers")
    .select("id")
    .eq("id", revierId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (revierError) {
    throw new Error(`${text.targetUpdateFailedPrefix} ${revierError.message}`);
  }

  if (!revierData) {
    throw new Error(text.boundaryTargetNotFound);
  }

  const { data: existingTargets, error: targetsError } = await supabase
    .from("revier_species_targets")
    .select("species")
    .eq("revier_id", revierId)
    .eq("organization_id", organization.id)
    .order("species", { ascending: true });

  if (targetsError) {
    throw new Error(`${text.targetUpdateFailedPrefix} ${targetsError.message}`);
  }

  const targetRows = (existingTargets ?? []) as Pick<
    RevierSpeciesTargetRow,
    "species"
  >[];

  const updates = targetRows.map((row) => {
    const parsedValue = parseTargetValue(formData.get(`target_${row.species}`));

    if (parsedValue === null) {
      throw new Error(`${text.targetValueInvalid} (${row.species})`);
    }

    return {
      organization_id: organization.id,
      revier_id: revierId,
      species: row.species,
      target_per_100ha: parsedValue,
    };
  });

  if (updates.length === 0) {
    throw new Error(text.targetValueMissing);
  }

  const { error: updateError } = await supabase
    .from("revier_species_targets")
    .upsert(updates, { onConflict: "revier_id,species" });

  if (updateError) {
    throw new Error(`${text.targetUpdateFailedPrefix} ${updateError.message}`);
  }

  const { error: refreshError } = await supabase.rpc(
    "refresh_population_estimates_for_revier",
    {
      p_revier_id: revierId,
    }
  );

  if (refreshError) {
    throw new Error(`${text.targetRefreshFailedPrefix} ${refreshError.message}`);
  }

  revalidatePath(`/orga/reviere/${revierId}/edit`);
  revalidatePath("/orga/reviere");
  revalidatePath("/wildlife/popsim");
  revalidatePath("/", "layout");
  redirect(`/orga/reviere/${revierId}/edit?targets_updated=1`);
}

async function uploadRevierBoundary(revierId: string, formData: FormData) {
  "use server";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${revierId}/edit`
  );
  redirectIfDemoWrite(ctx, `/orga/reviere/${revierId}/edit?demo_read_only=1`);

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const text = t(language);

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const { data: revierData, error: revierError } = await supabase
    .from("reviers")
    .select("id,name")
    .eq("id", revierId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (revierError) {
    throw new Error(`${text.boundarySaveFailedPrefix} ${revierError.message}`);
  }

  if (!revierData) {
    throw new Error(text.boundaryTargetNotFound);
  }

  const file = formData.get("boundary_file");

  if (
    !file ||
    typeof file !== "object" ||
    !("size" in file) ||
    !("text" in file) ||
    typeof file.text !== "function"
  ) {
    throw new Error(text.boundaryMissingFile);
  }

  const boundaryFile = file as File;

  if (boundaryFile.size <= 0) {
    throw new Error(text.boundaryMissingFile);
  }

  if (boundaryFile.size > MAX_BOUNDARY_FILE_SIZE_BYTES) {
    throw new Error(text.boundaryFileTooLarge);
  }

  let parsedGeoJson: unknown;

  try {
    parsedGeoJson = JSON.parse(await boundaryFile.text());
  } catch {
    throw new Error(text.boundaryInvalidJson);
  }

  const geometry = validateBoundaryGeoJson(parsedGeoJson, language);

  const { error } = await supabase.from("revier_boundaries").upsert(
    {
      organization_id: organization.id,
      revier_id: revierId,
      name: revierData.name,
      source: "geojson_upload",
      geometry,
    },
    { onConflict: "revier_id" }
  );

  if (error) {
    throw new Error(`${text.boundarySaveFailedPrefix} ${error.message}`);
  }

  revalidatePath(`/orga/reviere/${revierId}/edit`);
  revalidatePath("/orga/reviere");
  revalidatePath("/cameras");
  revalidatePath("/", "layout");
  redirect(`/orga/reviere/${revierId}/edit?boundary_updated=1`);
}

export default async function EditRevierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    demo_read_only?: string;
    boundary_updated?: string;
    targets_updated?: string;
    map_objects_updated?: string;
    map_object_deleted?: string;
  }>;
}) {
  const { id } = await params;
  const search = (await searchParams) ?? {};
  const demoReadOnly = search.demo_read_only === "1";
  const boundaryUpdated = search.boundary_updated === "1";
  const targetsUpdated = search.targets_updated === "1";
  const mapObjectsUpdated = search.map_objects_updated === "1";
  const mapObjectDeleted = search.map_object_deleted === "1";

  const { ctx, supabase, language } = await resolveUiLanguageForProtectedPath(
    `/orga/reviere/${id}/edit`
  );

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const organization = ctx.activeMembership.organizations;
  const isDemo = ctx.isDemo;

  if (!organization) {
    throw new Error("Active organization not found");
  }

  const text = t(language);

  const { data, error } = await supabase
    .from("reviers")
    .select(
      "id,name,area_ha,region,country,notes,status,organization_id,timezone"
    )
    .eq("id", id)
    .eq("organization_id", organization.id)
    .single();

  if (error) {
    throw new Error(`Failed to load revier: ${error.message}`);
  }

  const revier = data as RevierRow;

  const speciesMetaRows = await loadSpeciesMeta();
  const speciesMetaMap = buildSpeciesMetaMap(speciesMetaRows);

  const { data: targetData, error: targetError } = await supabase
    .from("revier_species_targets")
    .select("species,target_per_100ha")
    .eq("revier_id", revier.id)
    .eq("organization_id", organization.id)
    .order("species", { ascending: true });

  if (targetError) {
    throw new Error(`${text.targetLoadFailedPrefix} ${targetError.message}`);
  }

  const speciesTargets = ((targetData ?? []) as RevierSpeciesTargetRow[])
    .map<SpeciesTargetFormRow>((row) => {
      const targetPer100ha = toNumber(row.target_per_100ha) ?? 0;

      return {
        species: row.species,
        label: getSpeciesLabel(row.species, language, speciesMetaMap),
        targetPer100ha,
      };
    })
    .sort((a, b) => sortSpeciesTargetRows(a, b, language));

  const { data: boundaryData, error: boundaryError } = await supabase
    .from("revier_boundaries")
    .select("id,name,source,updated_at,geometry")
    .eq("revier_id", revier.id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (boundaryError) {
    throw new Error(`Failed to load revier boundary: ${boundaryError.message}`);
  }

  const boundary = (boundaryData as RevierBoundaryRow | null) ?? null;
  const boundaryFeatureCount = boundary
    ? extractFeatureCount(boundary.geometry)
    : 0;
  const boundaryPointCount = boundary ? extractPointCount(boundary.geometry) : 0;

  const { data: mapObjectsData, error: mapObjectsError } = await supabase
    .from("revier_map_objects")
    .select("id,type,name,description,latitude,longitude,status")
    .eq("revier_id", revier.id)
    .eq("organization_id", organization.id)
    .order("name", { ascending: true });

  if (mapObjectsError) {
    throw new Error(
      `${text.mapObjectsLoadFailedPrefix} ${mapObjectsError.message}`
    );
  }

  const mapObjects = (mapObjectsData ?? []) as RevierMapObjectRow[];

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            {text.intro}
          </p>
        </div>
      </section>

      {demoReadOnly ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">{text.demoReadOnly}</p>
        </section>
      ) : null}

      {boundaryUpdated ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">{text.boundarySaved}</p>
        </section>
      ) : null}

      {targetsUpdated ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">{text.targetsSaved}</p>
        </section>
      ) : null}

      {mapObjectsUpdated ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">
            {text.mapObjectsUpdated}
          </p>
        </section>
      ) : null}

      {mapObjectDeleted ? (
        <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm text-emerald-100">
            {text.mapObjectDeleted}
          </p>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <form action={updateRevier.bind(null, revier.id)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.nameLabel}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={revier.name}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              />
            </div>

            <div>
              <label
                htmlFor="area_ha"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.areaLabel}
              </label>
              <input
                id="area_ha"
                name="area_ha"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={revier.area_ha}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              />
            </div>

            <div>
              <label
                htmlFor="region"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.regionLabel}
              </label>
              <input
                id="region"
                name="region"
                type="text"
                defaultValue={revier.region ?? ""}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              />
            </div>

            <div>
              <label
                htmlFor="country"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.countryLabel}
              </label>
              <input
                id="country"
                name="country"
                type="text"
                defaultValue={revier.country ?? "DE"}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm uppercase text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              />
            </div>

            <TimeZoneSelect
              label={text.timezoneLabel}
              helpText={text.timezoneHelp}
              disabled={isDemo}
              title={isDemo ? text.demoReadOnly : ""}
              initialValue={revier.timezone}
            />

            <div>
              <label
                htmlFor="status"
                className="mb-2 block text-sm font-medium text-white"
              >
                {text.statusLabel}
              </label>
              <select
                id="status"
                name="status"
                defaultValue={revier.status}
                disabled={isDemo}
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 disabled:bg-white/5 disabled:text-white/35"
                title={isDemo ? text.demoReadOnly : ""}
              >
                <option value="active" className="bg-[#102018] text-white">
                  {text.active}
                </option>
                <option value="paused" className="bg-[#102018] text-white">
                  {text.paused}
                </option>
                <option value="archived" className="bg-[#102018] text-white">
                  {text.archived}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="notes"
              className="mb-2 block text-sm font-medium text-white"
            >
              {text.notesLabel}
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={5}
              defaultValue={revier.notes ?? ""}
              disabled={isDemo}
              className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35 disabled:bg-white/5 disabled:text-white/35"
              title={isDemo ? text.demoReadOnly : ""}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              idleLabel={isDemo ? text.demoMode : text.saveIdle}
              pendingLabel={text.savePending}
            />

            <Link
              href="/orga/reviere"
              className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
            >
              {text.cancel}
            </Link>
          </div>
        </form>
      </section>

      <RevierMapObjectsForm
        rows={mapObjects}
        createAction={createRevierMapObject.bind(null, revier.id)}
        updateAction={updateRevierMapObject.bind(null, revier.id)}
        deleteAction={deleteRevierMapObject.bind(null, revier.id)}
        isDemo={isDemo}
        language={language}
      />

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-medium text-white">
            {text.targetsTitle}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-white/65">
            {text.targetsText}
          </p>
        </div>

        <RevierSpeciesTargetsForm
          action={updateRevierSpeciesTargets.bind(null, revier.id)}
          rows={speciesTargets}
          isDemo={isDemo}
          language={language}
        />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-medium text-white">
            {text.boundaryTitle}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-white/65">
            {text.boundaryText}
          </p>
        </div>

        <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          {boundary ? (
            <div className="grid gap-4 text-sm md:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/40">
                  {text.boundaryPresent}
                </div>
                <div className="mt-1 font-medium text-emerald-100">
                  {boundary.name}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-white/40">
                  {text.boundaryFeatures}
                </div>
                <div className="mt-1 font-medium text-white">
                  {boundaryFeatureCount}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-white/40">
                  {text.boundaryPoints}
                </div>
                <div className="mt-1 font-medium text-white">
                  {boundaryPointCount}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-white/40">
                  {text.boundaryUpdated}
                </div>
                <div className="mt-1 font-medium text-white">
                  {formatDateTime(boundary.updated_at, language)}
                </div>
              </div>

              {boundary.source ? (
                <div className="md:col-span-4">
                  <div className="text-xs uppercase tracking-wide text-white/40">
                    {text.boundarySource}
                  </div>
                  <div className="mt-1 text-white/70">{boundary.source}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-white/68">{text.boundaryMissing}</p>
          )}
        </div>

        <RevierBoundaryUploadForm
          action={uploadRevierBoundary.bind(null, revier.id)}
          isDemo={isDemo}
          language={language}
        />
      </section>
    </main>
  );
}