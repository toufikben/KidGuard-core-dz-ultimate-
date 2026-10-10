// src/services/traccar/positions.ts — the position/freshness layer. This decides what the app is
// allowed to SAY about a child's last known location. Pure calculation and formatting only: it takes
// positions as data and never touches the network (fetching is client.ts's job, Task 3).
//
// Three binding measurements shape this file:
//  - `speed` arrives in KNOTS (M0 + Position.java); this layer converts knots once (see kmPerHour).
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

// The only knots→km/h conversion in the app (1 knot = 1.852 km/h exactly); every Traccar speed the
// UI shows must route through here. Named debt, not a claim of uniqueness: two legacy m/s→km/h
// conversions remain outside this layer — src/services/RiskEngine.ts `toKmH` (HTML5 geolocation,
// genuinely m/s) and src/components/MapView.tsx's `speed > 50 ? speed : speed * 3.6` guess, which
// cannot tell the two units apart. The task that owns the map replaces that guess with this function.
export function kmPerHour(position: Pick<ServerPosition, 'speed'>): number {
  return position.speed * 1.852;
}

// Age in whole seconds, measured from `fixTime` (never `serverTime`). Throws for an unreadable or
// impossibly future fix, or for a `now` that is not a real clock reading, so a caller can never turn
// a broken timestamp into a confident sentence.
export function ageSeconds(position: Pick<ServerPosition, 'fixTime'>, now: number): number {
  if (!Number.isFinite(now)) throw new Error(`now is not a clock reading: ${now}`);
  const fixMs = Date.parse(position.fixTime);
  if (!Number.isFinite(fixMs)) throw new Error(`unreadable fixTime: ${position.fixTime}`);
  const ageMs = now - fixMs;
  if (ageMs < -MAX_FUTURE_SKEW_MS) {
    const ahead = Math.round(-ageMs / 1000);
    throw new Error(`impossible future fixTime ${position.fixTime} is ${ahead}s ahead of now (clock/future)`);
  }
  return Math.max(0, Math.floor(ageMs / 1000));
}

// An unknown age is the loudest claim this layer can make, so it must land on the weakest word:
// NaN satisfies neither `>` comparison, and falling through to 'fresh' would tell a guardian the
// child was just seen. Non-finite ages are 'silent' — the same sentence a dead source gets.
export function freshnessOf(age: number): Freshness {
  if (!Number.isFinite(age)) return 'silent';
  if (age > SILENT_AFTER_SECONDS) return 'silent';
  if (age > AGING_AFTER_SECONDS) return 'aging';
  return 'fresh';
}

// §12's honest sentence for a source we cannot read: no data, and the location may not be current.
function noDataLabel(lang: CatalogLang): string {
  return `${translate('position.noDataFromServer', lang)} — ${translate('position.locationMayNotBeCurrent', lang)}`;
}

// An honest label for one reading: age plus accuracy radius, degrading to a no-data announcement when
// the source is silent. It never claims the child is live, safe, or guaranteed — a fresh reading is
// phrased as "N s ago", and a silent one as "no data from the server, location may not be current".
// Unlike ageSeconds this never throws on the DATA it is given: a broken fixTime, a broken clock, or an
// unreadable accuracy degrades into a true sentence rather than taking a screen down (R-M1-14). The
// `lang` argument is not data — an unknown language still throws from `translate`, and the caller that
// stores the locale (src/App.tsx reads localStorage) is the place that must validate it.
export function formatPositionLabel(
  position: Pick<ServerPosition, 'fixTime' | 'accuracy'>,
  now: number,
  lang: CatalogLang,
): string {
  let age: number;
  try {
    age = ageSeconds(position, now);
  } catch {
    return noDataLabel(lang);
  }
  if (freshnessOf(age) === 'silent') return noDataLabel(lang);
  const ageText = translate('position.ageSeconds', lang, { age });
  const accuracy = position.accuracy;
  // A radius is only worth printing when it is a radius: negative or non-finite would read as a
  // measurement ("±-25 م") when the server actually reported nothing usable.
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0) return ageText;
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

// §3's conflict rule as a predicate on metres, kept separate from resolveSourceReadings so the
// exact-boundary decision is testable: 300 m is not "more than 300 m apart", so it is not a conflict.
// Two float coordinates can never land on exactly 300 m, so only this form pins that side.
export function isSourceConflict(distanceMeters: number): boolean {
  return distanceMeters > CONFLICT_DISTANCE_M;
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
      if (isSourceConflict(distance)) return { chosen: null, conflict: true };
    }
  }

  let chosen = usable[0];
  for (const candidate of usable) {
    if (Date.parse(candidate.fixTime) > Date.parse(chosen.fixTime)) chosen = candidate;
  }
  return { chosen, conflict: false };
}
