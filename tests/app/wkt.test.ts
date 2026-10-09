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

test('a school circle smaller than the 50 m edge is refused with the reason', () => {
  const errors = validateZone({ type: 'school', geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 25 } });
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.match(errors[0], /≥\s*50|>=\s*50/, errors[0]);
});

test('route zones need 100 m of edge, not the school default', () => {
  const errors = validateZone({ type: 'route', geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }], bufferMeters: 60 } });
  assert.ok(errors.some((e) => /100/.test(e)), errors.join('\n'));
});

test('a route zone with no declared buffer is refused, not silently given the server 25 m default', () => {
  const errors = validateZone({ type: 'route', geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }] } });
  assert.ok(errors.some((e) => /polylineDistance|هامش/.test(e)), errors.join('\n'));
});

test('a two-point polygon is refused by us before the server refuses it (GeofencePolygon.java:146)', () => {
  const errors = validateZone({ type: 'park', geometry: { kind: 'polygon', points: [{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.06 }] } });
  assert.ok(errors.some((e) => /3/.test(e)), errors.join('\n'));
});
