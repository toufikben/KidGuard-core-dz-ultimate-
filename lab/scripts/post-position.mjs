// Task 6 (M0 gate): post positions into Traccar the way an OsmAnd device would, and schedule the
// replay so a position is never stamped ahead of the moment it is actually posted.
// Lab-only: nothing outside lab/ imports this, no dependencies beyond Node built-ins.

// Parameter list mirrored from OsmAndProtocolDecoder.java:95-172 (Traccar 6.16.0). The decoder
// only reads these names; osmandBody refuses anything else so a typo can't silently drop a field.
export const OSMAND_PARAM_NAMES = [
  'id', 'deviceid', 'notificationToken', 'valid', 'timestamp', 'lat', 'lon', 'location',
  'cell', 'wifi', 'speed', 'bearing', 'altitude', 'accuracy', 'hdop', 'batt', 'charge',
];

export function osmandBody(params) {
  const unknown = params.map(([k]) => k).filter((k) => !OSMAND_PARAM_NAMES.includes(k));
  if (unknown.length > 0) throw new Error(`unknown osmand params: ${unknown.join(', ')}`);
  return new URLSearchParams(params.map(([k, v]) => [k, String(v)])).toString();
}

// Ruling R29 — a pure, deadline-based schedule, replacing the brief's after-post relative sleep.
// Reading i is DUE at t0 + offsetSec_i/speed; the pair returned is the whole-second wall clock at
// which it will ACTUALLY be posted (its own deadline) plus that deadline in ms. Deriving
// timestampSec from the deadline (never from a future-declared offset) is what guarantees no
// position is ever stamped ahead of the instant it is sent. The brief's loop instead stamped each
// reading with t0 + round(offsetSec/speed) while only reaching that wall time after accumulated
// sleeps, so e.g. school-exit at speed 1 posted the offset-30/60/90 readings at ~t+0/29/88 s yet
// stamped them 30/60/90 — future stamps that fed the sink negative forward latencies, which
// lab/sink/report.mjs refuses to pass (R19 INVALID clock skew), and mis-ordered Traccar's own
// fixTime-based geofence evaluation. scenario.mjs awaits each deadline before posting.
export function sendSchedule(readings, speed, t0Sec) {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error(`bad speed ${speed} (must be a finite number > 0, e.g. --speed=1)`);
  }
  if (!Number.isFinite(t0Sec)) {
    throw new Error(`bad t0Sec ${t0Sec} (must be a finite unix-second)`);
  }
  return readings.map((reading) => {
    const offsetSec = Number(reading.offsetSec);
    if (!Number.isFinite(offsetSec)) {
      throw new Error(`reading offsetSec must be a finite number, got ${JSON.stringify(reading.offsetSec)}`);
    }
    const deadlineMs = (t0Sec + offsetSec / speed) * 1000;
    // floor() keeps the stamp at or below the whole-second of its own deadline, so the stamp can
    // never run ahead of the post that happens at real time >= deadlineMs.
    return { timestampSec: Math.floor(deadlineMs / 1000), deadlineMs };
  });
}

export async function postPosition({ host = '127.0.0.1', port = 5055, uniqueId, reading, absoluteTimeSec }) {
  const body = osmandBody([
    ['id', uniqueId],
    ['valid', 'true'],
    ['timestamp', String(Math.floor(absoluteTimeSec))],
    ['lat', reading.lat],
    ['lon', reading.lon],
    ['accuracy', reading.accuracy],
    ['speed', reading.speedKnots],
    ['bearing', reading.course ?? 0],
    ['batt', reading.battery ?? 75],
  ]);
  const response = await fetch(`http://${host}:${port}/`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  await response.text();
  if (!response.ok) {
    throw new Error(`position rejected: HTTP ${response.status} `
      + '(400 means the uniqueId is not registered — database.registerUnknown is false)');
  }
  return { status: response.status };
}
