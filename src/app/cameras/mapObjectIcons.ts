// src/app/cameras/mapObjectIcons.ts #1

export type MapObjectIconType =
  | "high_seat"
  | "ladder"
  | "feeding_place"
  | "salt_lick"
  | "trap"
  | "other"
  | string;

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function iconSvg(paths: string) {
  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <g fill="none" stroke="#10141c" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
        ${paths}
      </g>
    </svg>
  `);
}

const highSeatIcon = iconSvg(`
  <path d="M9 27V14" />
  <path d="M23 27V14" />
  <path d="M8 14h16" />
  <path d="M11 10h10l2 4H9z" />
  <path d="M12 27l8-13" />
  <path d="M20 27l-8-13" />
  <path d="M13 10V6h6v4" />
`);

const ladderIcon = iconSvg(`
  <path d="M11 27L19 5" />
  <path d="M18 27L26 5" />
  <path d="M14 10h8" />
  <path d="M12.5 15h8" />
  <path d="M11 20h8" />
  <path d="M9.5 25h8" />
`);

const feedingPlaceIcon = iconSvg(`
  <path d="M8 22c2.5-5 5-7.5 8-7.5S21.5 17 24 22" />
  <path d="M10 22h12" />
  <path d="M12 25h8" />
  <path d="M16 14.5V8" />
  <path d="M12.5 10.5c1.5-2 3-2.5 5-1" />
  <path d="M19.5 11c-1.5-2-3-2.5-5-1" />
`);

const saltLickIcon = iconSvg(`
  <path d="M16 5l9 7-9 15-9-15z" />
  <path d="M7 12h18" />
  <path d="M12 12l4 15" />
  <path d="M20 12l-4 15" />
`);

const trapIcon = iconSvg(`
  <path d="M7 10h18v15H7z" />
  <path d="M7 15h18" />
  <path d="M13 10v15" />
  <path d="M19 10v15" />
  <path d="M10 7h12" />
  <path d="M12 7V5h8v2" />
`);

const otherIcon = iconSvg(`
  <path d="M16 7v18" />
  <path d="M7 16h18" />
  <path d="M9.5 9.5l13 13" />
  <path d="M22.5 9.5l-13 13" />
`);

export function getMapObjectIconDataUri(type: MapObjectIconType) {
  if (type === "high_seat") return highSeatIcon;
  if (type === "ladder") return ladderIcon;
  if (type === "feeding_place") return feedingPlaceIcon;
  if (type === "salt_lick") return saltLickIcon;
  if (type === "trap") return trapIcon;
  return otherIcon;
}