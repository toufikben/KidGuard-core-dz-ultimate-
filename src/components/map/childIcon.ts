// src/components/map/childIcon.ts — the child's map pin, drawn to spec §12 and nothing else.
// Pure: it turns three facts about a reading into HTML and metre/pixel arithmetic, so the whole
// §12 contract is testable without a browser, a map, or a server. MapView owns Leaflet; this module
// owns what the guardian is allowed to SEE about the child's position.
//
// §12 has two demands this module exists to enforce:
//  - Direction, age and confidence must differ in SHAPE, not only colour (a colour-blind guardian
//    reads the same map), and the icon must never be a picture of a child.
//  - The accuracy ring must be the reported radius in metres, never a fixed pixel blob that looks
//    like precision the fix does not have.
import type { Freshness } from '../../services/traccar/positions.ts';

export type IconShape = 'arrow' | 'dot';
export type ChildIconInput = {
  course: number | null | undefined;
  // `freshness` is Task 5's name (positions.ts `freshnessOf`) and Task 9 forwards it unchanged;
  // `null` is its fourth value — no reading at all.
  freshness: Freshness | null;
  hasFix: boolean;
};
export type ChildIcon = { html: string; shape: IconShape; tone: string };

// The only colours this module may emit. All three tones are dark enough to sit on the white plate
// as borders, and the one text colour is dark on that plate, so no state depends on hue alone.
export const CHILD_ICON_COLORS = {
  fresh: '#047857',
  aging: '#b45309',
  silent: '#334155',
  plate: '#ffffff',
  ink: '#0f172a',
} as const;

export const CHILD_ICON_GLYPHS = {
  arrow: '▲',
  dot: '●',
  unknown: '?',
} as const;

export const CHILD_ICON_SIZE = 34;
// A ring smaller than this on screen is a line, not a circle; zoomForRing keeps it above it.
const RING_MAX_PIXEL_RADIUS = 140;
// The map's own zoom limits. DEFAULT_VIEW_ZOOM is a VIEWPORT default — where the map looks when it
// has nothing to frame. It is deliberately not a coordinate: a fabricated position is the failure
// this whole module was written after measuring on a guardian's phone.
export const DEFAULT_VIEW_ZOOM = 16;
export const RING_ZOOM_MIN = 12;
export const RING_ZOOM_MAX = 18;

const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686; // Web Mercator tile math at the equator

// `hasFix: false` and a `null` freshness both force the silent presentation even when the caller
// also passed 'fresh' and a real course: an absent reading may never select a confident pin by
// falling through a comparison. That is exactly how freshnessOf(NaN) once read as 'fresh'.
export function childIconHtml({ course, freshness, hasFix }: ChildIconInput): ChildIcon {
  const quiet = !hasFix || freshness === null || freshness === 'silent';
  const tone = quiet
    ? CHILD_ICON_COLORS.silent
    : freshness === 'aging'
      ? CHILD_ICON_COLORS.aging
      : CHILD_ICON_COLORS.fresh;

  const heading = typeof course === 'number' && Number.isFinite(course)
    ? ((Math.round(course) % 360) + 360) % 360
    : null;
  const shape: IconShape = !quiet && heading !== null ? 'arrow' : 'dot';
  const glyph = quiet ? CHILD_ICON_GLYPHS.unknown
    : shape === 'arrow' ? CHILD_ICON_GLYPHS.arrow
      : CHILD_ICON_GLYPHS.dot;

  // Dashed for the unreadable state: a second, non-colour channel for the same fact.
  const border = `border:3px ${quiet ? 'dashed' : 'solid'} ${tone};`;
  const rotation = shape === 'arrow' ? `transform:rotate(${heading}deg);` : '';

  return {
    shape,
    tone,
    html: `<div style="width:${CHILD_ICON_SIZE}px;height:${CHILD_ICON_SIZE}px;box-sizing:border-box;`
      + `${border}border-radius:50%;background:${CHILD_ICON_COLORS.plate};`
      + 'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(15,23,42,0.45);">'
      + `<span style="${rotation}color:${CHILD_ICON_COLORS.ink};font-size:16px;line-height:1;">${glyph}</span></div>`,
  };
}

// A marker needs a position the server actually reported. Anything else — a missing field, a string,
// a NaN, a latitude of 91 — is no position, so the caller gets null and draws no pin. This is the
// guard that replaces the v1.3 fallback pair measured on the phone (36.7538, 3.0588).
export function childFixLatLng(lat: unknown, lng: unknown): [number, number] | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

export function scaleForZoom(
  accuracyMeters: number | null | undefined,
  zoom: number,
  latitude: number,
): { ringMeters: number | null; pixelRadius: number } {
  if (!Number.isFinite(zoom)) throw new Error(`zoom is not a map zoom level: ${zoom}`);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`latitude is not a latitude: ${latitude}`);
  }
  // An accuracy the server did not report is not a small accuracy. Draw nothing rather than the
  // invented 10 m radius the old map used.
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
    return { ringMeters: null, pixelRadius: 0 };
  }
  const metersPerPixel = (EARTH_CIRCUMFERENCE_METERS * Math.cos((latitude * Math.PI) / 180))
    / 2 ** (zoom + 8);
  return { ringMeters: accuracyMeters, pixelRadius: accuracyMeters / metersPerPixel };
}

// The zoom at which the reported radius still fits the screen. Zooming to a fixed level over a
// 3 km radius would show a pin and imply a precision the fix never had.
export function zoomForRing(
  accuracyMeters: number | null | undefined,
  latitude: number,
  maxPixelRadius: number = RING_MAX_PIXEL_RADIUS,
): number {
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return DEFAULT_VIEW_ZOOM;
  }
  const metersPerPixelNeeded = accuracyMeters / maxPixelRadius;
  const latitudeCos = Math.cos((latitude * Math.PI) / 180);
  const raw = Math.log2((EARTH_CIRCUMFERENCE_METERS * latitudeCos) / metersPerPixelNeeded) - 8;
  return Math.min(RING_ZOOM_MAX, Math.max(RING_ZOOM_MIN, Math.floor(raw)));
}
