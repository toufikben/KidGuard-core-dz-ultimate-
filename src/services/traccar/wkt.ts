// src/services/traccar/wkt.ts — the ONE place that knows Traccar reads `lat lon` (spec 6).
// Leaflet hands [lat, lng] positionally and GeoJSON hands [lng, lat]; neither may build WKT itself.
// العكس صامت وقاتل: زوج معكوس يضع منطقة المدرسة في الصحراء شرقاً بدل وسط الجزائر
// (مقيس في lab/report/evidence/007-app-api-surface.md §2: `CIRCLE (36.7538 3.0588, 100)`).
export type LatLng = { lat: number; lon: number };
export type Geometry =
  | { kind: 'circle'; lat: number; lon: number; radiusMeters: number }
  | { kind: 'polygon'; points: LatLng[] }
  | { kind: 'linestring'; points: LatLng[]; bufferMeters?: number };
export type ZoneType = 'school' | 'home' | 'park' | 'route' | 'mosque' | 'activity' | 'relative' | 'outing';

const MIN_EDGE: Record<string, number> = { school: 50, home: 50, route: 100 };
const DEFAULT_EDGE = 50;

// fmt keeps the round-trip byte-identical: 36.75 must not come back as 36.750000.
const fmt = (n: number) => Number(n.toFixed(6)).toString();
const pair = ({ lat, lon }: LatLng) => `${fmt(lat)} ${fmt(lon)}`;
const SEPARATOR = ', '; // exactly what GeofenceCircle/Polygon/Polyline toWkt() emit

export function toCircleWkt({ lat, lon, radiusMeters }: { lat: number; lon: number; radiusMeters: number }) {
  return `CIRCLE (${fmt(lat)} ${fmt(lon)}, ${fmt(radiusMeters)})`;
}
export function toPolygonWkt(points: LatLng[]) {
  const ring = [...points];
  if (pair(ring[0]) !== pair(ring[ring.length - 1])) ring.push(ring[0]);
  return `POLYGON((${ring.map(pair).join(SEPARATOR)}))`;
}
export function toRouteWkt({ points, bufferMeters }: { points: LatLng[]; bufferMeters?: number }) {
  return {
    area: `LINESTRING (${points.map(pair).join(SEPARATOR)})`,
    // Geofence.java:86 — the buffer is an attribute in METRES, defaulting to 25.0 if we omit it.
    attributes: { polylineDistance: bufferMeters ?? 0 },
  };
}
export function toWktOf(geometry: Geometry): string {
  if (geometry.kind === 'circle') return toCircleWkt(geometry);
  if (geometry.kind === 'polygon') return toPolygonWkt(geometry.points);
  return toRouteWkt(geometry).area;
}

const NUM = '(-?\\d+(?:\\.\\d+)?)';
export function parseWkt(area: string): Geometry {
  const text = area.trim().replace(/\s+/g, ' ');
  const circle = new RegExp(`^CIRCLE \\(${NUM} ${NUM}, ${NUM}\\)$`).exec(text);
  if (circle) {
    return { kind: 'circle', lat: Number(circle[1]), lon: Number(circle[2]), radiusMeters: Number(circle[3]) };
  }
  // `POLYGON((…))` is what we write; `POLYGON ((…))` is what GeofencePolygon.toWkt writes.
  const polygon = /^POLYGON ?\(\((.+)\)\)$/.exec(text);
  if (polygon) return { kind: 'polygon', points: parsePoints(polygon[1]) };
  const line = /^LINESTRING ?\((.+)\)$/.exec(text);
  if (line) return { kind: 'linestring', points: parsePoints(line[1]) };
  throw new Error(`unsupported WKT area (unknown shape or broken pair): ${text.slice(0, 40)}`);
}
function parsePoints(body: string): LatLng[] {
  return body.split(',').map((chunk) => {
    const tokens = chunk.trim().split(' ');
    if (tokens.length !== 2) throw new Error(`each vertex must be "lat lon", got "${chunk.trim()}"`);
    const [lat, lon] = tokens.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`non-numeric vertex "${chunk.trim()}"`);
    return { lat, lon };
  });
}

// A refusal is a CODE plus the numbers the sentence needs, never a baked Arabic sentence: the screen
// resolves it through the catalog in the guardian's own language (R-M1-18). The five codes below are
// the whole vocabulary; tests/app/wkt.test.ts pins each one, and zonesMessage.ts localises each one.
export type ZoneViolation =
  | { code: 'radiusMin'; need: number }
  | { code: 'polygonMinPoints' }
  | { code: 'routeMinPoints' }
  | { code: 'bufferMissing' }
  | { code: 'bufferMin'; need: number };

export function validateZone({ type, geometry }: { type: ZoneType; geometry: Geometry }): ZoneViolation[] {
  const violations: ZoneViolation[] = [];
  const need = MIN_EDGE[type] ?? DEFAULT_EDGE;
  if (geometry.kind === 'circle') {
    if (geometry.radiusMeters < need) violations.push({ code: 'radiusMin', need });
  } else if (geometry.kind === 'polygon') {
    // GeofencePolygon.java:146 rejects fewer than 3 comma-tokens server-side; we say why first.
    if (geometry.points.length < 3) violations.push({ code: 'polygonMinPoints' });
  } else {
    if (geometry.points.length < 2) violations.push({ code: 'routeMinPoints' });
    if (geometry.bufferMeters === undefined || geometry.bufferMeters === 0) {
      // Distinct from "too small": 0 is honoured by the server (measured R-M1-13), so this corridor
      // would never contain the child. Omitting it falls back to 25 m — also not a choice we make.
      violations.push({ code: 'bufferMissing' });
    } else if (geometry.bufferMeters < (type === 'route' ? 100 : need)) {
      violations.push({ code: 'bufferMin', need: type === 'route' ? 100 : need });
    }
  }
  return violations;
}
