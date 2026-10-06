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

// --- fix-round-2 item: the internal "no admin found" throw must FAIL on the wired path, not EXISTS ---
// Round 1 tested resolveAdmin directly and bypassed step()'s classifier, which masked that the thrown
// message began "server already initialised…" and was swallowed as EXISTS. These drive runSteps itself.

test('wired admin step FAILS (not EXISTS) when an initialised server has no lab admin', async () => {
  const results = [];
  const fake = {
    async get(path) {
      if (path === '/server') return { newServer: false };
      if (path === '/users') return [{ id: 9, email: 'someone-else@example.com' }];
      return [];
    },
    async post() { return { id: 1 }; },
    async put() { return null; },
  };
  // The internal throw is not an ApiError, so runSteps must rethrow, not record EXISTS.
  await assert.rejects(
    () => bootstrap.runSteps(fake, { LAB_ADMIN_EMAIL: 'lab@example.com', LAB_ADMIN_PASSWORD: 'pw' }, results));
  const admin = results.find((r) => r.name === 'admin');
  assert.ok(admin, 'the admin step is recorded');
  assert.equal(admin.result, 'failed');
});

test('wired admin step still EXISTS on a genuine ApiError 409 (idempotence preserved)', async () => {
  const results = [];
  const fake = {
    async get(path) {
      if (path === '/server') return { newServer: true, registration: false };
      if (path === '/notifications') return [{ id: 6, type: 'geofenceExit', description: 'lab-geofenceExit' }];
      return [];
    },
    async post(path, body) {
      // A real conflict from the server: the admin email already exists (409). Only the admin POST hits it.
      if (path === '/users' && body?.email === 'lab@example.com') {
        throw new ApiError(409, 'User with the same email already exists');
      }
      return { id: 1 };
    },
    async put() { return null; },
  };
  // runSteps must complete without rejecting, and the admin step must be EXISTS, proving the instanceof
  // hardening still classifies a genuine ApiError(409) as an idempotent "already there".
  await bootstrap.runSteps(fake, { LAB_ADMIN_EMAIL: 'lab@example.com', LAB_ADMIN_PASSWORD: 'pw' }, results);
  const admin = results.find((r) => r.name === 'admin');
  assert.equal(admin.result, 'exists');
});
