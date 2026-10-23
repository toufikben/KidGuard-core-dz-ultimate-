// tests/app/permissions.test.ts — Task 8 (الصلاحيات والروابط الثلاثة، §3) against a FAKE server only.
// The live lab is never contacted here. Every payload shape is re-typed inside src/ (never imported
// from lab/), and the boundary guard test in this file proves src/ imports nothing from lab/.
//
// Brief letter (هـ): the three §3 links are sent in the correct direction, and the permission map's
// key order is reverse-SENSITIVE (Permission.java:54-66 decided the owner by ORDER — first key wins),
// so each test names the exact owner-first body and asserts a flipped body is a different object.
// R-M1-12: every branch-pinning assertion below must redden under the mutation it names (report).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { createTraccarClient } from '../../src/services/traccar/client.ts';
import { resetSession, signIn } from '../../src/services/traccar/session.ts';
import {
  buildPermissionPayload,
  createPermissionService,
} from '../../src/services/traccar/permissions.ts';

const EMAIL = 'lab-guardian-a@example.com';
const PASSWORD = 'sup3rs3cret';
// The admin field is what the gate reads back from whoAmI (POST /session), never from local state.
const ADMIN_JSON = JSON.stringify({ id: 1, name: 'lab guardian a', email: EMAIL, administrator: true });
const VIEWER_JSON = JSON.stringify({ id: 2, name: 'lab guardian b', email: 'lab-guardian-b@example.com', administrator: false });

type Seen = { method: string; url: string; body: string };

// A router that records every request so the request-ORDER and request-BODIES can be asserted exactly,
// the way session.test.ts does. Unknown routes answer 404 so a stray call shows up in the log.
function withFakeTraccar(handler: (seen: Seen) => { status: number; body?: string }) {
  const log: Seen[] = [];
  return new Promise<{ log: Seen[]; url: string; close: () => Promise<void> }>((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const seen: Seen = { method: req.method ?? '', url: req.url ?? '', body };
        log.push(seen);
        const out = handler(seen);
        res.writeHead(out.status, { 'content-type': 'application/json' });
        res.end(out.body ?? '');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as import('node:net').AddressInfo).port;
      resolve({ log, url: `http://127.0.0.1:${port}/api`, close: () => new Promise<void>((d) => server.close(() => d())) });
    });
  });
}

// Establishes the admin identity whoAmI reads from on an EPHEMERAL session server that is closed
// immediately, so it never pollutes the test's own permission-server log. The permission client each
// test builds authenticates with Basic credentials, NOT this module session, so a closed server is
// harmless: whoAmI() with a null token makes zero requests (session.ts) and the link tests never
// call it at all — only the two zoneOwners tests below, which sign in directly against their own
// server, read the session.
async function adminClient() {
  resetSession();
  const routes = (seen: Seen) => (seen.method === 'POST' && seen.url === '/api/session' ? { status: 200, body: ADMIN_JSON } : { status: 404 });
  const srv = await withFakeTraccar(routes);
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
  } finally {
    await srv.close();
  }
}

// ── buildPermissionPayload: the M0 contract, re-typed, order-SENSITIVE ────────────────────────────
test('buildPermissionPayload (هـ): the owner key is FIRST, exactly the measured {"userId":2,"deviceId":7}', () => {
  const payload = buildPermissionPayload('userId', 2, 'deviceId', 7);
  // JSON.stringify preserves insertion order, so this pins the FIRST key = owner (Permission.java:54-66).
  assert.equal(JSON.stringify(payload), '{"userId":2,"deviceId":7}');
  assert.deepEqual(Object.keys(payload), ['userId', 'deviceId'], 'the owner must be the first inserted key');
});

test('buildPermissionPayload (هـ): the direction is REVERSE-SENSITIVE — a flipped pair is a different owner', () => {
  const forward = buildPermissionPayload('userId', 2, 'deviceId', 7);
  const flipped = buildPermissionPayload('deviceId', 7, 'userId', 2);
  // deepEqual ignores KEY ORDER, and key order IS the meaning here (Permission.java:54-66: first key =
  // owner), so the comparison is on the serialised form, which preserves insertion order.
  assert.notEqual(JSON.stringify(forward), JSON.stringify(flipped), 'swapping owner and property must not be treated as the same grant');
  assert.equal(Object.keys(forward)[0], 'userId');
  assert.equal(Object.keys(flipped)[0], 'deviceId', 'the first key is the OWNER, and that decides who grants to whom');
});

test('buildPermissionPayload (هـ): a key that is not an Id-key is refused before any request', () => {
  assert.throws(() => buildPermissionPayload('user', 2, 'deviceId', 7), /Id$/);
  assert.throws(() => buildPermissionPayload('userId', 2, 'device', 7), /Id$/);
});

test('buildPermissionPayload (هـ): two keys naming the same relation are refused (a self-grant is meaningless)', () => {
  assert.throws(() => buildPermissionPayload('userId', 2, 'userId', 7), /distinct/);
});

// ── linkUserToDevice: {"userId":…, "deviceId":…} in that direction ────────────────────────────────
test('linkUserToDevice (هـ): POST /permissions body is {"userId":2,"deviceId":7} — user FIRST', async () => {
  const srv = await withFakeTraccar(() => ({ status: 200, body: '[]' }));
  try {
    await adminClient();
    srv.log.length = 0;
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    await service.linkUserToDevice(2, 7);
    const posts = srv.log.filter((r) => r.method === 'POST' && r.url === '/api/permissions');
    assert.deepEqual(posts.map((r) => r.body), ['{"userId":2,"deviceId":7}'], 'exactly one grant, owner first');
  } finally { await srv.close(); resetSession(); }
});

// ── linkZoneToDevice: the M0-MEASURED evaluation direction is device -> geofence ──────────────────
// lab/scripts/bootstrap.mjs:139-140 posts buildPermissionPayload('deviceId', …, 'geofenceId', …) and
// that is the direction 005-fanout measured to actually produce geofenceExit events, so the owner is
// the DEVICE. This test pins the order and proves a geofence-first body would be a different grant.
test('linkZoneToDevice (هـ): POST /permissions body is {"deviceId":1,"geofenceId":9} — device FIRST (measured)', async () => {
  const srv = await withFakeTraccar(() => ({ status: 200, body: '[]' }));
  try {
    await adminClient();
    srv.log.length = 0;
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    await service.linkZoneToDevice(9, 1);
    const posts = srv.log.filter((r) => r.method === 'POST' && r.url === '/api/permissions');
    assert.deepEqual(posts.map((r) => r.body), ['{"deviceId":1,"geofenceId":9}'],
      'the owner is the device (the direction the lab measured to make zones evaluate), not the geofence');
    assert.notEqual(posts[0].body, '{"geofenceId":9,"deviceId":1}', 'a geofence-first body would be a different, wrong grant');
  } finally { await srv.close(); resetSession(); }
});

test('linkDeviceToNotification (هـ): POST /permissions body is {"deviceId":1,"notificationId":4} — device FIRST', async () => {
  const srv = await withFakeTraccar(() => ({ status: 200, body: '[]' }));
  try {
    await adminClient();
    srv.log.length = 0;
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    await service.linkDeviceToNotification(1, 4);
    const posts = srv.log.filter((r) => r.method === 'POST' && r.url === '/api/permissions');
    assert.deepEqual(posts.map((r) => r.body), ['{"deviceId":1,"notificationId":4}']);
  } finally { await srv.close(); resetSession(); }
});

// ── the three §3 links, in the right direction, skipping ones already present ─────────────────────
test('§3 links (هـ): user->device, device->geofence and device->notification each grant in owner-first order', async () => {
  const srv = await withFakeTraccar(() => ({ status: 200, body: '[]' }));
  try {
    await adminClient();
    srv.log.length = 0;
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    await service.linkUserToDevice(2, 7);
    await service.linkZoneToDevice(9, 7);
    await service.linkDeviceToNotification(7, 4);
    const bodies = srv.log.filter((r) => r.method === 'POST' && r.url === '/api/permissions').map((r) => r.body);
    assert.deepEqual(bodies, ['{"userId":2,"deviceId":7}', '{"deviceId":7,"geofenceId":9}', '{"deviceId":7,"notificationId":4}']);
  } finally { await srv.close(); resetSession(); }
});

test('hasLink: an existing grant is reported present, and link* skips a POST when it already exists', async () => {
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'GET' && seen.url.startsWith('/api/permissions')) {
      return { status: 200, body: '[{"userId":0,"deviceId":7,"geofenceId":9}]' };
    }
    return { status: 200, body: '[]' };
  });
  try {
    await adminClient();
    srv.log.length = 0;
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    assert.equal(await service.hasLink('deviceId', 7, 'geofenceId', 9), true, 'the fake row carries deviceId 7 + geofenceId 9');
    srv.log.length = 0;
    await service.linkZoneToDevice(9, 7);
    assert.equal(srv.log.filter((r) => r.method === 'POST').length, 0, 'an already-present link must not be re-POSTed');
  } finally { await srv.close(); resetSession(); }
});

// ── zoneOwners: the admin flag comes from whoAmI(), never from local state ────────────────────────
test('zoneOwners (هـ): a non-admin whoAmI yields admin=false — the gate is read from the SERVER', async () => {
  resetSession();
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: VIEWER_JSON };
    if (seen.method === 'GET' && seen.url.startsWith('/api/permissions')) return { status: 200, body: '[]' };
    return { status: 404 };
  });
  try {
    await signIn({ baseUrl: srv.url, email: 'lab-guardian-b@example.com', password: PASSWORD });
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'lab-guardian-b@example.com', password: PASSWORD } });
    const service = createPermissionService({ client });
    const owners = await service.zoneOwners(9);
    assert.equal(owners.admin, false, 'a viewer is NOT an admin, and the only source of that is whoAmI()');
  } finally { await srv.close(); resetSession(); }
});

test('zoneOwners (هـ): admin=true comes from whoAmI, and linked user ids are collected from the rows', async () => {
  resetSession();
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: ADMIN_JSON };
    if (seen.method === 'GET' && seen.url.startsWith('/api/permissions')) {
      return { status: 200, body: '[{"userId":3,"geofenceId":9},{"userId":5,"geofenceId":9}]' };
    }
    return { status: 404 };
  });
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    const owners = await service.zoneOwners(9);
    assert.equal(owners.admin, true);
    assert.deepEqual(owners.userIds, [3, 5], 'the users granted this geofence are collected, in row order');
    const perms = srv.log.filter((r) => r.method === 'GET' && r.url.startsWith('/api/permissions'));
    assert.equal(perms.length, 1, 'one permission read for this zone');
    assert.match(perms[0].url, /geofenceId=9/, 'the read is scoped to this zone by the geofenceId query param');
  } finally { await srv.close(); resetSession(); }
});

// ── the exact READ query forms (measured live on 6.16.0, 2026-10-23) ─────────────────────────────
// Traccar resolves the relation from the query pair's ORDER: the FIRST key names the table read.
// ?userId=2&notificationId=0 → 200; ?notificationId=0&userId=2 → 400 "Table TC_NOTIFICATION_USER not
// found"; ?geofenceId=9&userId=0 → 400 "Table TC_GEOFENCE_USER not found"; ?userId=0&geofenceId=9 → 200.
// And the live rows carry UPPERCASE columns ({USERID, NOTIFICATIONID}), so a lower-case-only reader
// would report "no link" for a link that exists.
test('hasLink (هـ): the notification read is owner-FIRST and uppercase rows count as a link', async () => {
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'GET' && seen.url.startsWith('/api/permissions')) {
      return { status: 200, body: '[{"USERID":2,"NOTIFICATIONID":1}]' };
    }
    return { status: 404 };
  });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    assert.equal(await service.hasLink('userId', 2, 'notificationId', 1), true, 'an existing grant must not read as absent');
    const gets = srv.log.filter((r) => r.method === 'GET');
    assert.deepEqual(gets.map((r) => r.url), ['/api/permissions?userId=2&notificationId=0'],
      'the owner key is FIRST — the sorted form is a measured 400');
  } finally { await srv.close(); resetSession(); }
});

test('zoneOwners (هـ): the zone read is user-FIRST — ?userId=0&geofenceId=9 — and uppercase rows are collected', async () => {
  resetSession();
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: ADMIN_JSON };
    if (seen.method === 'GET' && seen.url.startsWith('/api/permissions')) {
      return { status: 200, body: '[{"USERID":3,"GEOFENCEID":9},{"USERID":5,"GEOFENCEID":9}]' };
    }
    return { status: 404 };
  });
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    const owners = await service.zoneOwners(9);
    assert.deepEqual(owners.userIds, [3, 5], 'the UPPERCASE USERID column is the same fact as userId');
    const permGet = srv.log.find((r) => r.method === 'GET' && r.url.startsWith('/api/permissions'));
    assert.equal(permGet?.url, '/api/permissions?userId=0&geofenceId=9',
      'geofence-first is the measured 400 "Table TC_GEOFENCE_USER not found"');
  } finally { await srv.close(); resetSession(); }
});

test('zoneIsLinked (هـ): the zone read is device-FIRST — ?deviceId=0&geofenceId=5', async () => {
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'GET' && seen.url.startsWith('/api/permissions')) {
      return { status: 200, body: '[{"DEVICEID":7,"GEOFENCEID":5}]' };
    }
    return { status: 404 };
  });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
    const service = createPermissionService({ client });
    assert.equal(await service.zoneIsLinked(5), true);
    assert.equal(srv.log[0].url, '/api/permissions?deviceId=0&geofenceId=5');
  } finally { await srv.close(); resetSession(); }
});

// ── boundary guard: nothing under src/ may import from lab/ (Step 4 of the brief) ──────────────────
// lab/ is not in tsconfig nor in the Vite tree, so importing it would break the production bundle;
// this test re-runs the brief's grep as a permanent guard rather than a one-off command.
test('Step 4 boundary: no file under src/ imports anything from lab/', () => {
  const root = new URL('../../src/', import.meta.url);
  const offenders: string[] = [];
  const walk = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const src = readFileSync(full, 'utf8');
      if (/from\s+['"][^'"]*lab\/|import\s+['"][^'"]*lab\/|require\([^)]*lab\//.test(src)) offenders.push(entry.name);
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], `production code reached into lab/: ${offenders.join(', ')}`);
});
