// src/services/traccar/positions.ts — the position/freshness layer. This decides what the app is
// allowed to SAY about a child's last known location. Pure calculation and formatting only: it takes
// positions as data and never touches the network (fetching is client.ts's job, Task 3).
//
// Three binding measurements shape this file:
//  - `speed` arrives in KNOTS (M0 + Position.java); one central conversion, no scattered `* 3.6`.
//  - Age comes from `fixTime`, never `serverTime` (R30: a retransmitted old fix is old however
//    recently the server received it).
//  - Freshness thresholds are the spec §12 numbers: aging above 180 s, silent above 300 s.
import type { ServerPosition } from './types.ts';
import { translate, type CatalogLang } from '../../translations/catalog.ts';

export type Freshness = 'fresh' | 'aging' | 'silent';

// §12: `aging` is strictly above 180 s and `silent` strictly above 300 s, so exactly 180 is still
// fresh and exactly 300 is still aging. These are decisions, not rounding; the boundary tests pin
// both sides of each.
const AGING_AFTER_SECONDS = 180;
const SILENT_AFTER_SECONDS = 300;

// Mirrors the lab's GpsFreshnessService.MAX_FUTURE_SKEW_MS (5 s): a fixTime a few seconds ahead of
// the device clock is tolerated (clamped to 0), but anything further is physically impossible and is
// rejected — the same rule the lab enforced (M0 R19 lineage).
const MAX_FUTURE_SKEW_MS = 5_000;

// §3 conflict rule: two live sources more than this many metres apart disagree enough that the app
// must announce the conflict rather than silently render whichever it picked.
const CONFLICT_DISTANCE_M = 300;

// The one and only knot→km/h conversion (1 knot = 1.852 km/h exactly). Every speed the UI shows
// routes through here; there is no second `* 3.6` anywhere in the app.
export function kmPerHour(position: Pick<ServerPosition, 'speed'>): number {
  return position.speed * 1.852;
}

// Age in whole seconds, measured from `fixTime` (never `serverTime`). Throws for an unreadable or
// impossibly future fix so a caller can never turn a broken timestamp into a confident sentence.
export function ageSeconds(position: Pick<ServerPosition, 'fixTime'>, now: number): number {
  const fixMs = Date.parse(position.fixTime);
  if (!Number.isFinite(fixMs)) throw new Error(`unreadable fixTime: ${position.fixTime}`);
  const ageMs = now - fixMs;
  if (ageMs < -MAX_FUTURE_SKEW_MS) {
    const ahead = Math.round(-ageMs / 1000);
    throw new Error(`impossible future fixTime ${position.fixTime} is ${ahead}s ahead of now (clock/future)`);
  }
  return Math.max(0, Math.floor(ageMs / 1000));
}

export function freshnessOf(age: number): Freshness {
  if (age > SILENT_AFTER_SECONDS) return 'silent';
  if (age > AGING_AFTER_SECONDS) return 'aging';
  return 'fresh';
}

// An honest label for one reading: age plus accuracy radius, degrading to a no-data announcement when
// the source is silent. It never claims the child is live, safe, or guaranteed — a fresh reading is
// phrased as "N s ago", and a silent one as "no data from the server, location may not be current".
export function formatPositionLabel(
  position: Pick<ServerPosition, 'fixTime' | 'accuracy'>,
  now: number,
  lang: CatalogLang,
): string {
  const age = ageSeconds(position, now);
  if (freshnessOf(age) === 'silent') {
    return `${translate('position.noDataFromServer', lang)} — ${translate('position.locationMayNotBeCurrent', lang)}`;
  }
  const ageText = translate('position.ageSeconds', lang, { age });
  const accuracy = position.accuracy;
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy)) return ageText;
  return `${ageText} ${translate('position.accuracyMeters', lang, { accuracy: Math.round(accuracy) })}`;
}

// The single shared great-circle distance (metres) for the position layer — one home, no duplicate
// copy in the traccar code. Same formula and Earth radius as lab/sink/lib/geo.mjs.
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// §3: reconcile several source readings (phone, tracker, …) into the one the app may show. If two of
// them sit more than CONFLICT_DISTANCE_M apart they contradict each other, so we refuse to pick
// silently and surface the conflict instead. Otherwise the freshest fixTime wins.
export function resolveSourceReadings(positions: ServerPosition[]): { chosen: ServerPosition | null; conflict: boolean } {
  const usable = (Array.isArray(positions) ? positions : [])
    .filter((p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude));
  if (usable.length === 0) return { chosen: null, conflict: false };

  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const distance = haversineMeters(
        usable[i].latitude, usable[i].longitude, usable[j].latitude, usable[j].longitude,
      );
      if (distance > CONFLICT_DISTANCE_M) return { chosen: null, conflict: true };
    }
  }

  let chosen = usable[0];
  for (const candidate of usable) {
    if (Date.parse(candidate.fixTime) > Date.parse(chosen.fixTime)) chosen = candidate;
  }
  return { chosen, conflict: false };
}
