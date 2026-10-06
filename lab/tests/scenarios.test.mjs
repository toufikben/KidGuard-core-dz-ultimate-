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
