// src/app/cameras/CameraMap.tsx #6
"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, {
  type GeoJSONSource,
  type LngLatLike,
  type Map as MapLibreMap,
  type Marker,
} from "maplibre-gl";
import type { AppLanguage } from "@/lib/i18n";
import { getMapObjectIconDataUri } from "./mapObjectIcons";

export type CameraMapItem = {
  id: string;
  name: string;
  location_name: string | null;
  import_method: string | null;
  health_status: "online" | "stale" | "offline" | "unknown" | string;
  latitude: number | null;
  longitude: number | null;
  direction_deg: number | null;
};

type LocatedCamera = CameraMapItem & {
  latitude: number;
  longitude: number;
};

export type CameraMapObjectItem = {
  id: string;
  type:
    | "high_seat"
    | "ladder"
    | "feeding_place"
    | "salt_lick"
    | "trap"
    | "other"
    | string;
  name: string;
  description: string | null;
  status: "active" | "inactive" | string;
  latitude: number;
  longitude: number;
};

type LocatedMapObject = CameraMapObjectItem & {
  latitude: number;
  longitude: number;
};

export type BoundaryGeoJson = Exclude<
  Parameters<GeoJSONSource["setData"]>[0],
  string
>;

const DEFAULT_STYLE_URL =
  process.env.NEXT_PUBLIC_OPENFREEMAP_STYLE_URL ||
  "https://tiles.openfreemap.org/styles/liberty";

const DEFAULT_MAP_CENTER: LngLatLike = [10.4515, 51.1657];
const DEFAULT_MAP_ZOOM = 5;

const DIRECTION_SOURCE_ID = "camera-directions";
const DIRECTION_LAYER_ID = "camera-directions-layer";

const BOUNDARY_SOURCE_ID = "revier-boundary";
const BOUNDARY_FILL_LAYER_ID = "revier-boundary-fill";
const BOUNDARY_LINE_LAYER_ID = "revier-boundary-line";

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      title: "Camera map",
      text: "Camera positions, viewing directions and ground infrastructure in the current scope.",
      noLocatedCameras: "No cameras or map objects with location data in the current scope.",
      noCoordinatesTitle: "Enter map coordinates to use the camera map.",
      noCoordinatesCta: "Edit coordinates in the table above",
      partialCoordinates:
        "Only cameras with coordinates are shown on the map.",
      location: "Location",
      type: "Type",
      camera: "Camera",
      description: "Description",
      direction: "Direction",
      status: "Status",
      coordinates: "Coordinates",
      unknown: "unknown",
      online: "Online",
      stale: "Stale",
      offline: "Offline",
      noDirection: "not set",
      highSeat: "High seat",
      ladder: "Ladder",
      feedingPlace: "Bait site",
      saltLick: "Salt lick",
      trap: "Trap",
      other: "Other",
      active: "Active",
      inactive: "Inactive",
    };
  }

  return {
    title: "Kamerakarte",
    text: "Kamerapositionen, Blickrichtungen und Reviereinrichtungen im aktuellen Scope.",
    noLocatedCameras:
      "Keine Kameras oder Kartenobjekte mit Standortdaten im aktuellen Scope.",
    noCoordinatesTitle:
      "Bitte Kartenkoordinaten eingeben, um die Kartenansicht zu genießen.",
    noCoordinatesCta: "Koordinaten oben in der Tabelle bearbeiten",
    partialCoordinates:
      "Es werden nur die Kameras mit Koordinaten gezeigt.",
    location: "Standort",
    type: "Typ",
    camera: "Kamera",
    description: "Beschreibung",
    direction: "Richtung",
    status: "Status",
    coordinates: "Koordinaten",
    unknown: "unbekannt",
    online: "Online",
    stale: "Veraltet",
    offline: "Offline",
    noDirection: "nicht gesetzt",
    highSeat: "Hochsitz",
    ladder: "Leiter",
    feedingPlace: "Kirrung",
    saltLick: "Salzlecke",
    trap: "Falle",
    other: "Sonstiges",
    active: "Aktiv",
    inactive: "Inaktiv",
  };
}

function isValidCoordinate(latitude: number | null, longitude: number | null) {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function statusLabel(status: string | null | undefined, language: AppLanguage) {
  const text = t(language);
  const normalized = (status ?? "").toLowerCase();

  if (normalized === "online") return text.online;
  if (normalized === "stale") return text.stale;
  if (normalized === "offline") return text.offline;
  return status || text.unknown;
}

function mapObjectTypeLabel(type: string, language: AppLanguage) {
  const text = t(language);

  if (type === "high_seat") return text.highSeat;
  if (type === "ladder") return text.ladder;
  if (type === "feeding_place") return text.feedingPlace;
  if (type === "salt_lick") return text.saltLick;
  if (type === "trap") return text.trap;
  return text.other;
}

function mapObjectStatusLabel(
  status: string | null | undefined,
  language: AppLanguage
) {
  const text = t(language);
  const normalized = (status ?? "").toLowerCase();

  if (normalized === "active") return text.active;
  if (normalized === "inactive") return text.inactive;
  return status || text.unknown;
}

function statusMarkerColors(status: string | null | undefined) {
  const normalized = (status ?? "").toLowerCase();

  if (normalized === "online") {
    return {
      background: "rgba(52, 211, 153, 0.96)",
      border: "rgba(167, 243, 208, 0.95)",
      shadow: "rgba(52, 211, 153, 0.35)",
    };
  }

  if (normalized === "stale") {
    return {
      background: "rgba(251, 191, 36, 0.96)",
      border: "rgba(253, 230, 138, 0.95)",
      shadow: "rgba(251, 191, 36, 0.35)",
    };
  }

  if (normalized === "offline") {
    return {
      background: "rgba(251, 113, 133, 0.96)",
      border: "rgba(254, 205, 211, 0.95)",
      shadow: "rgba(251, 113, 133, 0.35)",
    };
  }

  return {
    background: "rgba(148, 163, 184, 0.96)",
    border: "rgba(226, 232, 240, 0.95)",
    shadow: "rgba(148, 163, 184, 0.35)",
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function normalizeDirection(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const rounded = Math.round(value) % 360;
  return rounded < 0 ? rounded + 360 : rounded;
}

function destinationPoint(
  longitude: number,
  latitude: number,
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const radiusMeters = 6378137;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (latitude * Math.PI) / 180;
  const lon1 = (longitude * Math.PI) / 180;
  const angularDistance = distanceMeters / radiusMeters;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

function buildDirectionGeoJson(cameras: LocatedCamera[]) {
  return {
    type: "FeatureCollection" as const,
    features: cameras
      .map((camera) => {
        const direction = normalizeDirection(camera.direction_deg);

        if (direction === null) return null;

        const start: [number, number] = [camera.longitude, camera.latitude];
        const end = destinationPoint(
          camera.longitude,
          camera.latitude,
          direction,
          85
        );

        return {
          type: "Feature" as const,
          properties: {
            id: camera.id,
            name: camera.name,
            direction,
          },
          geometry: {
            type: "LineString" as const,
            coordinates: [start, end],
          },
        };
      })
      .filter((feature) => feature !== null),
  };
}

function ensureDirectionLayer(map: MapLibreMap) {
  if (!map.getSource(DIRECTION_SOURCE_ID)) {
    map.addSource(DIRECTION_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }

  if (!map.getLayer(DIRECTION_LAYER_ID)) {
    map.addLayer({
      id: DIRECTION_LAYER_ID,
      type: "line",
      source: DIRECTION_SOURCE_ID,
      paint: {
        "line-color": "#fbbf24",
        "line-width": 3,
        "line-opacity": 0.9,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  }
}

function updateDirectionLayer(map: MapLibreMap, cameras: LocatedCamera[]) {
  ensureDirectionLayer(map);

  const source = map.getSource(DIRECTION_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(buildDirectionGeoJson(cameras));
}

function ensureBoundaryLayer(map: MapLibreMap) {
  if (!map.getSource(BOUNDARY_SOURCE_ID)) {
    map.addSource(BOUNDARY_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }

  if (!map.getLayer(BOUNDARY_FILL_LAYER_ID)) {
    map.addLayer({
      id: BOUNDARY_FILL_LAYER_ID,
      type: "fill",
      source: BOUNDARY_SOURCE_ID,
      paint: {
        "fill-color": "#c9952e",
        "fill-opacity": 0.12,
      },
    });
  }

  if (!map.getLayer(BOUNDARY_LINE_LAYER_ID)) {
    map.addLayer({
      id: BOUNDARY_LINE_LAYER_ID,
      type: "line",
      source: BOUNDARY_SOURCE_ID,
      paint: {
        "line-color": "#c9952e",
        "line-width": 3,
        "line-opacity": 0.88,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  }
}

function updateBoundaryLayer(
  map: MapLibreMap,
  boundaryGeoJson: BoundaryGeoJson | null
) {
  ensureBoundaryLayer(map);

  const source = map.getSource(BOUNDARY_SOURCE_ID) as GeoJSONSource | undefined;

  source?.setData(
    boundaryGeoJson ?? {
      type: "FeatureCollection",
      features: [],
    }
  );
}

function collectLngLatCoordinates(value: unknown, result: [number, number][]) {
  if (!Array.isArray(value)) return;

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
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

function getBoundaryCoordinates(
  boundaryGeoJson: BoundaryGeoJson | null
): [number, number][] {
  if (!boundaryGeoJson) return [];

  const coordinates: [number, number][] = [];

  if (
    typeof boundaryGeoJson === "object" &&
    boundaryGeoJson !== null &&
    "type" in boundaryGeoJson &&
    boundaryGeoJson.type === "FeatureCollection" &&
    "features" in boundaryGeoJson &&
    Array.isArray(boundaryGeoJson.features)
  ) {
    for (const feature of boundaryGeoJson.features) {
      if (
        typeof feature === "object" &&
        feature !== null &&
        "geometry" in feature
      ) {
        const geometry = (feature as { geometry?: unknown }).geometry;

        if (
          typeof geometry === "object" &&
          geometry !== null &&
          "coordinates" in geometry
        ) {
          collectLngLatCoordinates(
            (geometry as { coordinates?: unknown }).coordinates,
            coordinates
          );
        }
      }
    }

    return coordinates;
  }

  if (
    typeof boundaryGeoJson === "object" &&
    boundaryGeoJson !== null &&
    "geometry" in boundaryGeoJson
  ) {
    const geometry = (boundaryGeoJson as { geometry?: unknown }).geometry;

    if (
      typeof geometry === "object" &&
      geometry !== null &&
      "coordinates" in geometry
    ) {
      collectLngLatCoordinates(
        (geometry as { coordinates?: unknown }).coordinates,
        coordinates
      );
    }
  }

  return coordinates;
}

function createMarkerElement(camera: LocatedCamera) {
  const direction = normalizeDirection(camera.direction_deg);
  const colors = statusMarkerColors(camera.health_status);

  const el = document.createElement("div");
  el.setAttribute("aria-label", camera.name);
  el.style.width = "32px";
  el.style.height = "32px";
  el.style.borderRadius = "999px";
  el.style.border = `2px solid ${colors.border}`;
  el.style.background = colors.background;
  el.style.boxShadow = `0 12px 30px ${colors.shadow}`;
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";

  const arrow = document.createElement("div");
  arrow.style.width = "0";
  arrow.style.height = "0";
  arrow.style.borderLeft = "5px solid transparent";
  arrow.style.borderRight = "5px solid transparent";
  arrow.style.borderBottom = "13px solid rgba(12, 16, 22, 0.92)";
  arrow.style.transform =
    direction === null ? "rotate(0deg)" : `rotate(${direction}deg)`;
  arrow.style.transformOrigin = "50% 65%";
  arrow.style.opacity = direction === null ? "0.35" : "1";

  el.appendChild(arrow);

  return el;
}

function createMapObjectMarkerElement(object: LocatedMapObject) {
  const el = document.createElement("div");
  el.setAttribute("aria-label", object.name);
  el.style.width = "30px";
  el.style.height = "30px";
  el.style.borderRadius = object.type === "trap" ? "9px" : "999px";
  el.style.border = "2px solid rgba(253, 230, 138, 0.95)";
  el.style.background =
    object.status === "inactive"
      ? "rgba(100, 116, 139, 0.92)"
      : "rgba(201, 149, 46, 0.96)";
  el.style.boxShadow = "0 12px 30px rgba(201, 149, 46, 0.28)";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";

  const icon = document.createElement("img");
  icon.src = getMapObjectIconDataUri(object.type);
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");
  icon.style.width = "20px";
  icon.style.height = "20px";
  icon.style.display = "block";

  el.appendChild(icon);
  return el;
}

function createPopupHtml(camera: LocatedCamera, language: AppLanguage) {
  const text = t(language);
  const direction = normalizeDirection(camera.direction_deg);

  return `
    <div style="min-width: 240px; color: #0f172a; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px; color: #0f172a;">
        ${escapeHtml(camera.name)}
      </div>

      <div style="font-size: 12px; line-height: 1.6; color: #334155;">
        <div>
          <strong style="color: #0f172a;">${escapeHtml(text.type)}:</strong>
          ${escapeHtml(text.camera)}
        </div>

        <div>
          <strong style="color: #0f172a;">${escapeHtml(text.description)}:</strong>
          ${escapeHtml(camera.location_name || text.unknown)}
        </div>

        <div>
          <strong style="color: #0f172a;">${escapeHtml(text.coordinates)}:</strong>
          ${formatCoordinate(camera.latitude)}, ${formatCoordinate(camera.longitude)}
        </div>

        <div>
          <strong style="color: #0f172a;">${escapeHtml(text.direction)}:</strong>
          ${direction === null ? escapeHtml(text.noDirection) : `${direction}°`}
        </div>

        <div>
          <strong style="color: #0f172a;">${escapeHtml(text.status)}:</strong>
          ${escapeHtml(statusLabel(camera.health_status, language))}
        </div>
      </div>
    </div>
  `;
}

function createMapObjectPopupHtml(
  object: LocatedMapObject,
  language: AppLanguage
) {
  const text = t(language);

  return `
    <div style="min-width: 240px; color: #0f172a; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px; color: #0f172a;">
        ${escapeHtml(object.name)}
      </div>

      <div style="font-size: 12px; line-height: 1.6; color: #334155;">
        <div>
          <strong style="color: #0f172a;">${escapeHtml(text.type)}:</strong>
          ${escapeHtml(mapObjectTypeLabel(object.type, language))}
        </div>

        <div>
          <strong style="color: #0f172a;">${escapeHtml(text.coordinates)}:</strong>
          ${formatCoordinate(object.latitude)}, ${formatCoordinate(object.longitude)}
        </div>

        <div>
          <strong style="color: #0f172a;">${escapeHtml(text.status)}:</strong>
          ${escapeHtml(mapObjectStatusLabel(object.status, language))}
        </div>
      </div>
    </div>
  `;
}

export default function CameraMap({
  cameras,
  language,
  boundaryGeoJson = null,
  mapObjects = [],
}: {
  cameras: CameraMapItem[];
  language: AppLanguage;
  boundaryGeoJson?: BoundaryGeoJson | null;
  mapObjects?: CameraMapObjectItem[];
}) {
  const text = t(language);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const locatedCameras = useMemo<LocatedCamera[]>(() => {
    return cameras.filter((camera): camera is LocatedCamera =>
      isValidCoordinate(camera.latitude, camera.longitude)
    );
  }, [cameras]);

  const locatedMapObjects = useMemo<LocatedMapObject[]>(() => {
    return mapObjects.filter((object): object is LocatedMapObject =>
      isValidCoordinate(object.latitude, object.longitude)
    );
  }, [mapObjects]);

  const boundaryCoordinates = useMemo(() => {
    return getBoundaryCoordinates(boundaryGeoJson);
  }, [boundaryGeoJson]);

  const missingLocationCameras = useMemo(() => {
    return cameras.filter(
      (camera) => !isValidCoordinate(camera.latitude, camera.longitude)
    );
  }, [cameras]);

  const hasNoCameraCoordinates =
    cameras.length > 0 &&
    locatedCameras.length === 0 &&
    locatedMapObjects.length === 0;
  const hasPartialCameraCoordinates =
    locatedCameras.length > 0 && missingLocationCameras.length > 0;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;


const map = new maplibregl.Map({
  container: containerRef.current,
  style: DEFAULT_STYLE_URL,
  center: DEFAULT_MAP_CENTER,
  zoom: DEFAULT_MAP_ZOOM,
  attributionControl: false,
});


    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      })
    );

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [locatedCameras, locatedMapObjects]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const camera of locatedCameras) {
      const marker = new maplibregl.Marker({
        element: createMarkerElement(camera),
        anchor: "center",
      })
        .setLngLat([camera.longitude, camera.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 22 }).setHTML(
            createPopupHtml(camera, language)
          )
        )
        .addTo(map);

      markersRef.current.push(marker);
    }

    for (const object of locatedMapObjects) {
      const marker = new maplibregl.Marker({
        element: createMapObjectMarkerElement(object),
        anchor: "center",
      })
        .setLngLat([object.longitude, object.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 22 }).setHTML(
            createMapObjectPopupHtml(object, language)
          )
        )
        .addTo(map);

      markersRef.current.push(marker);
    }

    const syncLayers = () => {
      updateBoundaryLayer(map, boundaryGeoJson);
      updateDirectionLayer(map, locatedCameras);
    };

    if (map.loaded()) {
      syncLayers();
    } else {
      map.once("load", syncLayers);
    }

    const bounds = new maplibregl.LngLatBounds();

    for (const coordinate of boundaryCoordinates) {
      bounds.extend(coordinate);
    }

    for (const camera of locatedCameras) {
      bounds.extend([camera.longitude, camera.latitude]);
    }

    for (const object of locatedMapObjects) {
      bounds.extend([object.longitude, object.latitude]);
    }

    const hasBounds =
      boundaryCoordinates.length > 0 ||
      locatedCameras.length > 0 ||
      locatedMapObjects.length > 0;

    if (hasBounds) {
      map.fitBounds(bounds, {
        padding: 72,
        maxZoom:
          locatedCameras.length + locatedMapObjects.length === 1 &&
          boundaryCoordinates.length === 0
            ? 14
            : 15,
        duration: 600,
      });
    }
  }, [
    language,
    locatedCameras,
    locatedMapObjects,
    boundaryGeoJson,
    boundaryCoordinates,
  ]);

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-medium text-white">{text.title}</h2>
          <p className="text-sm text-white/65">{text.text}</p>
        </div>

        <div className="text-xs text-white/45">
          {locatedCameras.length + locatedMapObjects.length} /{" "}
          {cameras.length + mapObjects.length}
        </div>
      </div>

      {locatedCameras.length > 0 || locatedMapObjects.length > 0 ? (
        <div
          ref={containerRef}
          className="h-[520px] overflow-hidden rounded-[24px] border border-white/10 bg-[#10141c]"
        />
      ) : (
        <div className="rounded-[24px] border border-dashed border-white/12 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/68">
          {hasNoCameraCoordinates ? (
            <>
              <div className="text-base font-medium text-white">
                {text.noCoordinatesTitle}
              </div>
              <p className="mt-3 text-sm text-white/60">
                {text.noCoordinatesCta}
              </p>
            </>
          ) : (
            text.noLocatedCameras
          )}
        </div>
      )}

      {hasPartialCameraCoordinates ? (
        <div className="mt-4 rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50/90">
          {text.partialCoordinates}
        </div>
      ) : null}
    </section>
  );
}