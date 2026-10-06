import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validateScenario } from '../scripts/scenario-lib.mjs';

const KNOWN_TYPES = ['geofenceExit', 'geofenceEnter', 'alarm', 'deviceOffline',
  'deviceOverspeed', 'unaccompaniedMotion', 'deviceMoving', 'deviceStopped'];

for (const file of await readdir(new URL('../scenarios/', import.meta.url))) {
  test(`scenario ${file} is well formed and geometrically meaningful`, async () => {
    const scenario = JSON.parse(await readFile(
      new URL(`../scenarios/${file}`, import.meta.url), 'utf8'));
    assert.deepEqual(validateScenario(scenario, KNOWN_TYPES), []);
  });
}

test('school-exit really leaves the circle', async () => {
  const scenario = JSON.parse(await readFile(
    new URL('../scenarios/school-exit.json', import.meta.url), 'utf8'));
  const { distanceMeters } = await import('../sink/lib/geo.mjs');
  const { parseCircle } = await import('../sink/lib/geo.mjs');
  const circle = { lat: scenario.zone.lat, lon: scenario.zone.lon, radiusMeters: scenario.zone.radiusMeters };
  const first = scenario.readings[0];
  const last = scenario.readings[scenario.readings.length - 1];
  assert.ok(distanceMeters(first.lat, first.lon, circle.lat, circle.lon) < circle.radiusMeters);
  assert.ok(distanceMeters(last.lat, last.lon, circle.lat, circle.lon) > circle.radiusMeters + 50);
});

test('route-park really leaves the 80 m corridor', async () => {
  const scenario = JSON.parse(await readFile(
    new URL('../scenarios/route-park.json', import.meta.url), 'utf8'));
  const { distanceMeters } = await import('../sink/lib/geo.mjs');
  const buffer = scenario.zone.bufferMeters;
  const vertices = scenario.zone.points;
  const nearestVertexMeters = (r) =>
    Math.min(...vertices.map((v) => distanceMeters(r.lat, r.lon, v.lat, v.lon)));
  for (const r of scenario.readings.slice(0, -1)) {
    assert.ok(nearestVertexMeters(r) < buffer, `reading ${r.offsetSec} must stay inside the corridor`);
  }
  // هامش ثابت (~425م مقاسة من أقرب رأس) لا الرقم الحرفي، لضمان إثبات الخروج لا مجرد تجاوز الحد
  assert.ok(nearestVertexMeters(scenario.readings[scenario.readings.length - 1]) > buffer + 50);
});

test('a null accuracy is rejected while 0 stays valid', () => {
  const base = {
    name: 'accuracy-probe',
    expectEvent: 'geofenceExit',
    zone: { type: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 100 },
    readings: [
      { offsetSec: 0, lat: 36.7538, lon: 3.0588, accuracy: 0 },
      { offsetSec: 30, lat: 36.7539, lon: 3.0589, accuracy: 12 },
      { offsetSec: 60, lat: 36.7540, lon: 3.0590, accuracy: 15 },
      { offsetSec: 90, lat: 36.7541, lon: 3.0591, accuracy: 18 },
    ],
  };
  // لا خطأ دقة حين تكون 0 (قياس دقيق تماماً يبقى صالحاً)
  assert.deepEqual(validateScenario(base, KNOWN_TYPES).filter((e) => e.includes('accuracy')), []);
  const withNull = structuredClone(base);
  withNull.readings[1].accuracy = null;
  // null مرفوض: لا نبتلع قياساً مفقوداً في أداة أمان أطفال
  assert.ok(validateScenario(withNull, KNOWN_TYPES).some((e) => e.includes('accuracy')),
    'null accuracy must be rejected');
});
