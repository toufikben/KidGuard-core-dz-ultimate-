import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleArea, parseCircle, polylineArea, distanceMeters } from '../sink/lib/geo.mjs';

test('circle WKT is lat-lon order like Traccar, not standard WKT', () => {
  assert.equal(circleArea(36.7538, 3.0588, 100), 'CIRCLE (36.7538 3.0588, 100)');
  assert.deepEqual(parseCircle('CIRCLE (36.7538 3.0588, 100)'),
    { lat: 36.7538, lon: 3.0588, radiusMeters: 100 });
});

test('a 10 m circle is rejected: real-world exit detection needs >=50 m buffer', () => {
  assert.throws(() => circleArea(36.7538, 3.0588, 10), /50/);
});

test('route zones are LINESTRING with a polylineDistance buffer', () => {
  const zone = polylineArea(
    [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7548, lon: 3.0598 }], 80);
  assert.equal(zone.area, 'LINESTRING (36.7538 3.0588, 36.7548 3.0598)');
  assert.equal(zone.attributes.polylineDistance, 80);
  assert.throws(() => polylineArea([{ lat: 1, lon: 1 }]), /at least 2/);
});

test('haversine distance is metres and sane at 0.001 deg latitude', () => {
  assert.ok(Math.abs(distanceMeters(36.7538, 3.0588, 36.7548, 3.0588) - 111.2) < 2);
});

test('haversine distance is sane at 0.001 deg longitude (cos-lat axis)', () => {
  // خط الطول يتقلّص بعامل cos(العرض): 111.195 × cos 36.75° ≈ 89.09 م لكل 0.001°؛ بدون هذه الحالة لا يشارك cos(lat) في الاختبار فيمرّ أي تبديل lat/lon أو نصف قطر خاطئ على محور الطول
  assert.ok(Math.abs(distanceMeters(36.7538, 3.0588, 36.7538, 3.0598) - 89.1) < 2);
});
