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

// --- Task 6: the osmand transaction builder + a future-stamp-safe replay schedule (ruling R29) ---
// Dynamic import keeps these RED as a clean module-not-found while the pre-existing suite stays green.

test('osmand body uses the parameter names the decoder accepts', async () => {
  const { osmandBody, OSMAND_PARAM_NAMES } = await import('../scripts/post-position.mjs');
  const body = osmandBody([
    ['id', 'lab-child-1'], ['valid', 'true'], ['timestamp', '1791446400'],
    ['lat', 36.75541], ['lon', 3.0601], ['accuracy', 18], ['speed', 3.4], ['bearing', 45],
  ]);
  for (const name of ['id', 'timestamp', 'lat', 'lon', 'accuracy', 'speed', 'bearing']) {
    assert.ok(body.includes(`${name}=`), name);
  }
  assert.deepEqual(
    OSMAND_PARAM_NAMES.slice(0, 14),
    ['id', 'deviceid', 'notificationToken', 'valid', 'timestamp', 'lat', 'lon', 'location',
     'cell', 'wifi', 'speed', 'bearing', 'altitude', 'accuracy']);
  assert.equal(new URLSearchParams(body).get('speed'), '3.4');
});

test('osmandBody rejects a parameter name the decoder would never read', async () => {
  const { osmandBody } = await import('../scripts/post-position.mjs');
  // 'battery' is NOT a decoder param (the wire name is 'batt'); an unknown key must fail loudly
  // rather than be silently dropped, so the posted body always matches the decoder whitelist.
  assert.throws(() => osmandBody([['id', 'lab-child-1'], ['battery', 75]]), /unknown osmand params: battery/);
});

test('sendSchedule deadlines follow the scenario offsets at the requested speed', async () => {
  const { sendSchedule } = await import('../scripts/post-position.mjs');
  const readings = [
    { offsetSec: 0 }, { offsetSec: 30 }, { offsetSec: 60 }, { offsetSec: 90 },
    { offsetSec: 120 }, { offsetSec: 150 },
  ];
  const t0 = 1_791_446_400;
  const schedule = sendSchedule(readings, 1, t0);
  assert.equal(schedule.length, readings.length);
  // (a) each deadline is exactly t0 + offsetSec/speed, and they are monotonically non-decreasing.
  assert.deepEqual(
    schedule.map((s) => s.deadlineMs),
    readings.map((r) => (t0 + r.offsetSec) * 1000));
  for (let i = 1; i < schedule.length; i += 1) {
    assert.ok(schedule[i].deadlineMs >= schedule[i - 1].deadlineMs, `deadline ${i} regressed`);
  }
  // speed 3 compresses each deadline to t0 + offset/3 — the pacing is honoured, not the offsets.
  const fast = sendSchedule(readings, 3, t0);
  assert.equal(fast[2].deadlineMs, (t0 + 60 / 3) * 1000);
});

test('sendSchedule never stamps a reading ahead of its own send second (the R29 future-stamp trap)', async () => {
  const { sendSchedule } = await import('../scripts/post-position.mjs');
  const readings = [
    { offsetSec: 0 }, { offsetSec: 30 }, { offsetSec: 60 }, { offsetSec: 90 },
    { offsetSec: 120 }, { offsetSec: 150 },
  ];
  const t0 = 1_791_446_400;
  const schedule = sendSchedule(readings, 1, t0);
  // (b) no returned timestampSec may exceed the whole-second wall clock of its own deadlineMs.
  // scenario.mjs posts at real time >= deadlineMs, so this also means a position is never stamped
  // in the future of when it arrives — which is what fed the sink negative forward latencies (R19).
  const hasFutureStamp = (s) => s.timestampSec > Math.floor(s.deadlineMs / 1000);
  assert.ok(!schedule.some(hasFutureStamp),
    'no timestampSec may exceed the wall-clock second of its own deadline');
  // the stamp IS the whole second at which the reading will actually be posted.
  for (const s of schedule) {
    assert.equal(s.timestampSec, Math.floor(s.deadlineMs / 1000));
  }
  // a bad speed / bad offset / bad t0 is a hard error, never a silently skewed schedule.
  assert.throws(() => sendSchedule(readings, 0, t0), /speed/);
  assert.throws(() => sendSchedule([{ offsetSec: 'soon' }], 1, t0), /offsetSec/);
});

test('the brief relative-sleep shape would stamp positions in the future (the new test has teeth)', async () => {
  const { sendSchedule } = await import('../scripts/post-position.mjs');
  const readings = [
    { offsetSec: 0 }, { offsetSec: 30 }, { offsetSec: 60 }, { offsetSec: 90 },
    { offsetSec: 120 }, { offsetSec: 150 },
  ];
  const t0 = 1_791_446_400;
  const hasFutureStamp = (s) => s.timestampSec > Math.floor(s.deadlineMs / 1000);
  // Reconstruct the brief's shape faithfully: reading i is posted only after the accumulated
  // after-the-fact sleeps max(0, offsetSec_j/speed - 1) for j < i (so its real post second lags),
  // yet is stamped with its OWN declared offset t0 + round(offsetSec_i/speed). That stamp runs
  // ahead of the post — exactly the future-timestamp the sink flags as INVALID clock skew.
  const speed = 1;
  let postedSec = t0; // wall-clock second at which the next reading is actually posted
  const briefShape = readings.map((r) => {
    const record = {
      timestampSec: t0 + Math.round(r.offsetSec / speed), // declared-offset stamp (the defect)
      deadlineMs: postedSec * 1000,                        // when it is really posted
    };
    postedSec += Math.max(0, r.offsetSec / speed - 1);     // the brief's after-post relative sleep
    return record;
  });
  const offenders = briefShape.filter(hasFutureStamp);
  assert.ok(offenders.length >= 1,
    'the relative-sleep shape must demonstrably stamp at least one position in the future');
  assert.ok(offenders.length >= 3,
    'school-exit at speed 1 stamps the offset-30/60/90 readings ahead of their post second');
  // The SAME predicate over the corrected schedule finds no future stamp — this is what gives the
  // invariant test teeth: were sendSchedule to reuse the declared-offset stamp, it would fail too.
  assert.ok(!sendSchedule(readings, speed, t0).some(hasFutureStamp));
});
