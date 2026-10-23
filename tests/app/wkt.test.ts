import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toCircleWkt, toPolygonWkt, toRouteWkt, toWktOf, parseWkt, validateZone,
} from '../../src/services/traccar/wkt.ts';

// 36.7538/3.0588 = وسط الجزائر. لو خرج "lon lat" لوقعت المنطقة في الصحراء شرقاً (المواصفة §6).
test('circle WKT is lat-then-lon, and a swapped pair is a different, wrong area', () => {
  assert.equal(toCircleWkt({ lat: 36.7538, lon: 3.0588, radiusMeters: 120 }), 'CIRCLE (36.7538 3.0588, 120)');
  const wrong = toCircleWkt({ lat: 3.0588, lon: 36.7538, radiusMeters: 120 });
  assert.notEqual(wrong, 'CIRCLE (36.7538 3.0588, 120)', 'a swapped pair must not read as the school zone');
});

test('polygon closes itself and stays lat-then-lon per vertex', () => {
  const wkt = toPolygonWkt([{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.05 }, { lat: 36.76, lon: 3.06 }]);
  assert.equal(wkt, 'POLYGON((36.75 3.05, 36.76 3.05, 36.76 3.06, 36.75 3.05))');
});

test('route zones are LINESTRING + a metre polylineDistance, never one big circle', () => {
  const { area, attributes } = toRouteWkt(
    { points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }], bufferMeters: 120 });
  assert.equal(area, 'LINESTRING (36.7538 3.0588, 36.7545 3.0595)');
  // Geofence.java:86 reads polylineDistance as METRES (default 25.0) — it is not in the WKT.
  assert.equal(attributes.polylineDistance, 120);
});

test('parse round-trips every shape we emit', () => {
  const cases = [
    toCircleWkt({ lat: 36.7538, lon: 3.0588, radiusMeters: 120 }),
    toPolygonWkt([{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.05 }, { lat: 36.76, lon: 3.06 }]),
    toRouteWkt({ points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }], bufferMeters: 120 }).area,
  ];
  for (const area of cases) {
    assert.equal(toWktOf(parseWkt(area)), area, `round-trip must be byte-identical: ${area}`);
  }
});

test("parse also accepts the form Traccar's own toWkt emits (space before the ring)", () => {
  // GeofencePolygon.java:121-132 writes "POLYGON ((lat lon, ...))"; we write "POLYGON((...))".
  // A zone the server re-serialised must still load into the editor instead of losing its shape.
  const fromServer = 'POLYGON ((36.75 3.05, 36.76 3.05, 36.76 3.06, 36.75 3.05))';
  assert.deepEqual(parseWkt(fromServer), {
    kind: 'polygon',
    points: [{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.05 }, { lat: 36.76, lon: 3.06 }, { lat: 36.75, lon: 3.05 }],
  });
});

test('an unknown geometry type is a named error, not an empty zone', () => {
  assert.throws(() => parseWkt('MULTIPOLYGON (((36.75 3.05)))'), /unknown|unsupported/i);
});

// Validation answers structured codes, not English/Arabic prose: the screen localises them via
// `zones.error.*` in the active `lang` (R-M1-14). Pinning `deepEqual` here means a mutation that
// swaps the reason (radiusMin reported as bufferMin) reddens the exact branch that changed.
test('a school circle smaller than the 50 m edge is refused with the reason', () => {
  const errors = validateZone({ type: 'school', geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 25 } });
  assert.deepEqual(errors, [{ code: 'radiusMin', need: 50 }]);
});

test('route zones need 100 m of edge, not the school default', () => {
  const errors = validateZone({ type: 'route', geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }], bufferMeters: 60 } });
  assert.deepEqual(errors, [{ code: 'bufferMin', need: 100 }]);
});

test('a route zone with no declared buffer is refused, not silently given the server 25 m default', () => {
  const errors = validateZone({ type: 'route', geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }] } });
  assert.deepEqual(errors, [{ code: 'bufferMissing' }]);
});

// `bufferMeters: 0` is a DIFFERENT bug from omitting it: 0 is a real value the server honours, so a
// zero-width corridor never contains the child and no geofenceExit ever fires (AC-1 would silently
// never trigger). `undefined` above and `0` here are separate branches of validateZone, so each
// needs its own test. The codes differ (`bufferMissing` vs `bufferMin`): a mutation that deletes the
// `=== 0` clause must fall through to the "merely too small" diagnosis and fail this assertion.
test('an explicit zero-width route buffer is refused as unusable, not as merely too small', () => {
  const errors = validateZone({
    type: 'route',
    geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }], bufferMeters: 0 },
  });
  assert.deepEqual(errors, [{ code: 'bufferMissing' }], 'a zero corridor is refused as missing, not as under 100 m');
});

// Task 8's hand-off: the ONLY safe order is validate-then-emit, because `toRouteWkt` answers a
// missing buffer with `polylineDistance: 0` (wkt.ts:32) rather than refusing. This test pins that
// the geometry the emitter would accept-with-0 is the same geometry the validator rejects for that
// named code, so a zone editor that forgets validateZone cannot reach the server with a corridor
// nobody exits.
test('what the emitter writes as 0 is what the validator rejects (the Task 8 guard is real)', () => {
  const points = [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }];
  assert.equal(toRouteWkt({ points }).attributes.polylineDistance, 0);
  const errors = validateZone({ type: 'route', geometry: { kind: 'linestring', points } });
  assert.deepEqual(errors, [{ code: 'bufferMissing' }]);
});

test('a two-point polygon is refused by us before the server refuses it (GeofencePolygon.java:146)', () => {
  const errors = validateZone({ type: 'park', geometry: { kind: 'polygon', points: [{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.06 }] } });
  assert.deepEqual(errors, [{ code: 'polygonMinPoints' }]);
});

// A one-point route is refused for both reasons it cannot work: the line itself is degenerate and
// no corridor width was declared. Pinning both codes proves the validator reports every reason
// instead of stopping at the first.
test('a one-point route reports the degenerate line and the missing buffer together', () => {
  const errors = validateZone({
    type: 'route',
    geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }] },
  });
  assert.deepEqual(errors, [{ code: 'routeMinPoints' }, { code: 'bufferMissing' }]);
});
