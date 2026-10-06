import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildUserPayload, buildDevicePayload, buildCircleGeofencePayload,
  buildRouteGeofencePayload, buildNotificationPayload, buildPermissionPayload, ApiError,
} from '../scripts/api.mjs';
import * as bootstrap from '../scripts/bootstrap.mjs';

test('admin payload never carries a real child name', () => {
  const payload = buildUserPayload({ name: 'lab-admin', email: 'lab@example.com', password: 'secret' });
  // The exact key SET must be {name,email,password}: no `administrator`, no real child name.
  // (The actual side is .sort()-ed, so the expected literal must be sorted too to compare sets.)
  assert.deepEqual(Object.keys(payload).sort(), ['email', 'name', 'password']);
});

test('device payload uses uniqueId as the stable key', () => {
  // No groupId: a lab server has no group, and POST /devices with groupId=1 is a live FK 400.
  assert.deepEqual(buildDevicePayload({ name: 'lab-child-1', uniqueId: 'lab-child-1' }),
    { name: 'lab-child-1', uniqueId: 'lab-child-1' });
});

test('circle geofence payload keeps Traccar WKT ordering and the 50 m floor', () => {
  const payload = buildCircleGeofencePayload({ name: 'school', lat: 36.7538, lon: 3.0588, radiusMeters: 100 });
  assert.equal(payload.area, 'CIRCLE (36.7538 3.0588, 100)');
  assert.equal(payload.name, 'school');
  assert.throws(() => buildCircleGeofencePayload({ name: 'x', lat: 1, lon: 1, radiusMeters: 10 }), /50/);
});

test('route geofence payload is a LINESTRING with a polylineDistance buffer', () => {
  const payload = buildRouteGeofencePayload({
    name: 'walk-to-park',
    points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7568, lon: 3.0621 }],
    bufferMeters: 80,
  });
  assert.equal(payload.area, 'LINESTRING (36.7538 3.0588, 36.7568 3.0621)');
  assert.equal(payload.attributes.polylineDistance, 80);
});

test('notification payload carries type + channels only, never a device or owner id', () => {
  assert.deepEqual(
    buildNotificationPayload({ type: 'geofenceExit', notificators: 'telegram,email' }),
    { type: 'geofenceExit', notificators: 'telegram,email', always: false });
});

test('permission payload is an ordered two-key id map with no type field', () => {
  assert.deepEqual(buildPermissionPayload('userId', 2, 'deviceId', 7), { userId: 2, deviceId: 7 });
  assert.deepEqual(buildPermissionPayload('deviceId', 7, 'notificationId', 3), { deviceId: 7, notificationId: 3 });
  assert.throws(() => buildPermissionPayload('userId', 2, 'user', 7), /Id/);
  assert.throws(() => buildPermissionPayload('userId', 2, 'userId', 7), /distinct/);
});

test('ApiError carries status and body', () => {
  const error = new ApiError(401, 'no session');
  assert.equal(error.status, 401);
  assert.match(error.message, /401/);
});

// --- fix-round item 1: the school zone must come from the scenario file, not a hardcode ---

test('school geofence payload is read from the scenario file, not hardcoded', async () => {
  const url = new URL('../scenarios/school-exit.json', import.meta.url);
  const zone = JSON.parse(await readFile(url, 'utf8')).zone;
  const payload = await bootstrap.readCircleGeofencePayload(url);
  assert.equal(payload.name, zone.name);
  assert.equal(payload.area, `CIRCLE (${zone.lat} ${zone.lon}, ${zone.radiusMeters})`);
});

test('changing the radius in the scenario file changes the provisioned area', async () => {
  const file = join(tmpdir(), `lab-school-exit-${process.pid}.json`);
  await writeFile(file, JSON.stringify({
    zone: { type: 'circle', name: 'school', lat: 36.7538, lon: 3.0588, radiusMeters: 250 },
  }), 'utf8');
  try {
    const payload = await bootstrap.readCircleGeofencePayload(pathToFileURL(file));
    assert.equal(payload.area, 'CIRCLE (36.7538 3.0588, 250)');
  } finally {
    await unlink(file);
  }
});

// --- fix-round item 2: the collected step transcript must survive a mid-run failure ---

test('a step failing after earlier successes still surfaces the earlier records', async () => {
  const results = [];
  const fake = {
    async get(path) {
      if (path === '/server') return { newServer: true, registration: false };
      if (path === '/devices') throw new Error('device list unavailable');
      return [];
    },
    async post() { return { id: 1 }; },
    async put() { return null; },
  };
  await assert.rejects(
    () => bootstrap.runSteps(fake, { LAB_ADMIN_EMAIL: 'lab@example.com', LAB_ADMIN_PASSWORD: 'pw' }, results));
  const names = results.map((r) => r.name);
  assert.ok(names.includes('admin'), 'the earlier admin record is kept');
  assert.ok(names.includes('registration-off'), 'the earlier registration-off record is kept');
  assert.ok(names.includes('device'), 'the failing step is recorded too');
  assert.equal(results.find((r) => r.name === 'admin').result, 'created');
});

// --- fix-round item 4: the admin EXISTS branch must not claim an id it never found ---

test('admin step fails when an initialised server has no lab admin (no undefined id)', async () => {
  const fake = {
    async get(path) {
      if (path === '/server') return { newServer: false };
      if (path === '/users') return [{ id: 9, email: 'someone-else@example.com' }];
      throw new Error('unexpected ' + path);
    },
    async post() { throw new Error('must not silently create an admin here'); },
  };
  await assert.rejects(
    () => bootstrap.resolveAdmin(fake, { LAB_ADMIN_EMAIL: 'lab@example.com', LAB_ADMIN_PASSWORD: 'pw' }),
    /database\.mv\.db/);
});

test('admin step reports the real id when the lab admin already exists', async () => {
  const fake = {
    async get(path) {
      if (path === '/server') return { newServer: false };
      if (path === '/users') return [{ id: 1, email: 'lab@example.com' }];
    },
  };
  const out = await bootstrap.resolveAdmin(
    fake, { LAB_ADMIN_EMAIL: 'lab@example.com', LAB_ADMIN_PASSWORD: 'pw' });
  assert.equal(out.exists, true);
  assert.equal(out.adminId, 1);
});
