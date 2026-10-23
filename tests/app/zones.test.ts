// tests/app/zones.test.ts — Task 8 (المناطق تُرسم وتُحفظ على الخادم، AC-2) against a FAKE server only.
// The live lab is exercised in the Step 5 report run, never here.
//
// Brief letters: (أ) a too-small school is refused BEFORE any request; (ب) a drawn circle POSTs the
// literal M0 body {"name","area":"CIRCLE (…)"}; (ج) a route is LINESTRING + attributes.polylineDistance;
// (د) after a save the list is RE-READ from the server (the local object is never the shown truth);
// (و) deleting a still-linked zone warns and leaves no half-saved state; (ز) AC-2: the save path never
// names localStorage (a globalThis.localStorage spy records zero calls during createZone); (ح) the
// geofenceExit alert subscription is UNIONED with `web` (never replaced), a missing subscription says
// «لا اشتراك تنبيه لهذه المنطقة» (not «already present»), and a failed PUT is ANNOUNCED not swallowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { createTraccarClient, TraccarError } from '../../src/services/traccar/client.ts';
import { resetSession, signIn } from '../../src/services/traccar/session.ts';
import { translate } from '../../src/translations/catalog.ts';
import {
  buildZonePayload,
  createZoneService,
  ZoneValidationError,
  ZoneAlertError,
  ZoneLinkedError,
} from '../../src/services/traccar/zones.ts';
import type { ZoneDraft } from '../../src/services/traccar/zones.ts';
import { zoneErrorMessage } from '../../src/components/zonesMessage.ts';
import { bufferFromAttributes } from '../../src/components/zoneAttributes.ts';

const EMAIL = 'lab-guardian-a@example.com';
const PASSWORD = 'sup3rs3cret';
const ADMIN_JSON = JSON.stringify({ id: 1, name: 'lab guardian a', email: EMAIL, administrator: true });
const VIEWER_JSON = JSON.stringify({ id: 2, name: 'lab guardian b', email: 'lab-guardian-b@example.com', administrator: false });
// The server returns the geofence with its id after a POST (BaseObjectResource assigns it).
const SCHOOL_ROW = { id: 5, name: 'lab-school', area: 'CIRCLE (36.7538 3.0588, 120)' };
// A DISTINCT row for GET /geofences: the (د) test must prove the shown list is the RE-READ, not the
// POST answer echoed back. Different name and area — a local short-circuit cannot fake this.
const READBACK_ROW = { id: 5, name: 'lab-reread', area: 'CIRCLE (36.7500 3.0500, 130)' };

type Seen = { method: string; url: string; body: string };

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

// A benign server that satisfies the whole save pipeline: sign-in as admin, a geofenceExit notification
// that ALREADY carries `web` (so ensureAlertSubscription does nothing extra), and a geofences list.
// `mutate` lets one test bend a single route (a 500 on PUT, an empty notifications list, a link row).
function serverWithWeb(mutate: Partial<Record<string, (seen: Seen) => { status: number; body?: string }>> = {}) {
  const base: Record<string, (seen: Seen) => { status: number; body?: string }> = {
    'POST /api/session': () => ({ status: 200, body: ADMIN_JSON }),
    'GET /api/notifications': () => ({ status: 200, body: '[{"id":1,"type":"geofenceExit","notificators":"mail,web","always":false}]' }),
    'GET /api/geofences': () => ({ status: 200, body: JSON.stringify([SCHOOL_ROW]) }),
    'POST /api/geofences': () => ({ status: 200, body: JSON.stringify(SCHOOL_ROW) }),
    'PUT /api/geofences/5': () => ({ status: 200, body: JSON.stringify(SCHOOL_ROW) }),
    'DELETE /api/geofences/5': () => ({ status: 204, body: '' }),
    'GET /api/permissions': () => ({ status: 200, body: '[]' }),
    'POST /api/permissions': () => ({ status: 200, body: '[]' }),
  };
  for (const [key, fn] of Object.entries(mutate)) base[key] = fn;
  return withFakeTraccar((seen) => (base[`${seen.method} ${seen.url.split('?')[0]}`] ?? (() => ({ status: 404 })))({ ...seen, url: seen.url }));
}

async function adminService(srv: { log: Seen[]; url: string }) {
  resetSession();
  await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
  srv.log.length = 0;
  const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: EMAIL, password: PASSWORD } });
  return createZoneService({ client });
}

const circleDraft = (over: Partial<ZoneDraft> = {}): ZoneDraft => ({
  name: 'lab-school', type: 'school',
  geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 120 }, ...over,
});

// ── the M0 payload contract, re-typed and pinned against the LITERAL M0 samples (never imported) ──
test('buildZonePayload (ب): a drawn circle is the literal M0 body — {name, area}, nothing else', () => {
  const payload = buildZonePayload(circleDraft());
  assert.equal(payload.area, 'CIRCLE (36.7538 3.0588, 120)');
  // 007 §2 measured the stored circle verbatim; this pins our writer to that byte-for-byte.
  assert.equal(JSON.stringify(payload), '{"name":"lab-school","area":"CIRCLE (36.7538 3.0588, 120)"}');
  assert.equal('attributes' in payload, false, 'a plain circle carries no attributes key');
});

test('buildZonePayload matches the literal M0 circle sample CIRCLE (36.7538 3.0588, 100)', () => {
  const payload = buildZonePayload(circleDraft({ geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 100 } }));
  assert.equal(payload.area, 'CIRCLE (36.7538 3.0588, 100)'); // exactly lab/report/evidence/007 §2
});

// ── (ج) route zone: LINESTRING + attributes.polylineDistance ─────────────────────────────────────
test('buildZonePayload (ج): a route is LINESTRING + attributes.polylineDistance, never one big circle', () => {
  const payload = buildZonePayload({
    name: 'lab-route', type: 'route',
    geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7548, lon: 3.0598 }], bufferMeters: 150 },
  });
  assert.equal(payload.area, 'LINESTRING (36.7538 3.0588, 36.7548 3.0598)'); // the M0 sample form
  assert.deepEqual(payload.attributes, { polylineDistance: 150 });
  assert.match(payload.area, /^LINESTRING /);
});

test('buildZonePayload (ب): a polygon is POLYGON((…)) lat-lon per vertex, closed by the writer', () => {
  const payload = buildZonePayload({
    name: 'lab-park', type: 'park',
    geometry: { kind: 'polygon', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7548, lon: 3.0588 }, { lat: 36.7548, lon: 3.0598 }] },
  });
  assert.match(payload.area, /^POLYGON\(\(/, 'the writer uses the no-space POLYGON(( form; R-M1-13 measures if the parser takes it');
});

// ── (د) save then RE-READ: the shown list comes back from GET /geofences, not the local object ────
test('createZone (د): after POST /geofences succeeds, GET /geofences is called and ITS rows are returned', async () => {
  // POST answers SCHOOL_ROW while GET answers READBACK_ROW. If the service returned its local draft
  // or the POST answer, the name below would be 'lab-school'; only a real re-read yields 'lab-reread'.
  const srv = await serverWithWeb({
    'GET /api/geofences': () => ({ status: 200, body: JSON.stringify([READBACK_ROW]) }),
  });
  try {
    const service = await adminService(srv);
    const zones = await service.createZone(circleDraft());
    const methods = srv.log.map((r) => `${r.method} ${r.url.split('?')[0]}`);
    assert.deepEqual(methods, ['POST /api/geofences', 'GET /api/notifications', 'GET /api/geofences'], methods.join(' | '));
    assert.equal(zones.length, 1);
    assert.equal(zones[0].id, 5);
    assert.equal(zones[0].name, 'lab-reread', 'the shown list is the GET answer, never the POST echo or the local draft');
    assert.equal(zones[0].area, 'CIRCLE (36.7500 3.0500, 130)');
  } finally { await srv.close(); resetSession(); }
});

test('createZone (ب): the POST /geofences body is the literal {name, area} circle body', async () => {
  const srv = await serverWithWeb();
  try {
    const service = await adminService(srv);
    await service.createZone(circleDraft());
    const post = srv.log.find((r) => r.method === 'POST' && r.url.startsWith('/api/geofences'));
    assert.ok(post, 'no geofence POST was made');
    assert.equal(post.body, '{"name":"lab-school","area":"CIRCLE (36.7538 3.0588, 120)"}');
  } finally { await srv.close(); resetSession(); }
});

// ── (أ) a too-small school is refused BEFORE any request ──────────────────────────────────────────
test('createZone (أ): a 30 m school circle is refused with the validateZone reason and ZERO requests', async () => {
  const srv = await serverWithWeb();
  try {
    const service = await adminService(srv);
    const error = await service.createZone(circleDraft({ geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 30 } }))
      .catch((e) => e as Error);
    assert.ok(error instanceof ZoneValidationError, `expected ZoneValidationError, got ${String(error)}`);
    assert.deepEqual((error as ZoneValidationError).violations, [{ code: 'radiusMin', need: 50 }],
      'the refusal carries the violated rule as a code — the screen localises it, the service does not speak one language');
    assert.equal(srv.log.length, 0, `validation must fire before any request; saw ${srv.log.map((r) => r.url).join(', ')}`);
  } finally { await srv.close(); resetSession(); }
});

test('createZone (أ): a route whose buffer is an explicit 0 is refused before any request (R-M1-13 pre-flight)', async () => {
  const srv = await serverWithWeb();
  try {
    const service = await adminService(srv);
    const error = await service.createZone({
      name: 'lab-route', type: 'route',
      geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7548, lon: 3.0598 }], bufferMeters: 0 },
    }).catch((e) => e as Error);
    assert.ok(error instanceof ZoneValidationError, String(error));
    assert.deepEqual((error as ZoneValidationError).violations, [{ code: 'bufferMissing' }]);
    assert.equal(srv.log.length, 0, 'an unusable buffer never reaches the server');
  } finally { await srv.close(); resetSession(); }
});

// ── the admin gate is read from whoAmI(), never from local state ──────────────────────────────────
test('createZone: a viewer (whoAmI admin=false) is refused before any write, with a forbidden kind', async () => {
  resetSession();
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: VIEWER_JSON };
    return { status: 404 };
  });
  try {
    await signIn({ baseUrl: srv.url, email: 'lab-guardian-b@example.com', password: PASSWORD });
    srv.log.length = 0;
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'lab-guardian-b@example.com', password: PASSWORD } });
    const service = createZoneService({ client });
    const error = await service.createZone(circleDraft()).catch((e) => e as Error);
    assert.ok(error instanceof TraccarError, String(error));
    assert.equal((error as TraccarError).kind, 'forbidden');
    assert.equal(srv.log.filter((r) => /geofences|permissions|notifications/.test(r.url)).length, 0, 'a viewer writes nothing');
  } finally { await srv.close(); resetSession(); }
});

// ── updateZone re-reads; deleteZone refuses while still linked ────────────────────────────────────
// The id-scoped routes are MEASURED, not assumed (tools/m1/route-probe.mjs against the live 6.16.0 lab,
// 2026-10-23): `PUT /geofences` → 405, `PUT /geofences/{id}` → 200; `DELETE /geofences?id=` → 405 with
// the row surviving, `DELETE /geofences/{id}` → 204. Both inherited calls used the collection form.
test('updateZone (د): PUT /geofences/{id} then GET /geofences — the collection PUT is the measured 405', async () => {
  const srv = await serverWithWeb();
  try {
    const service = await adminService(srv);
    await service.updateZone({ ...circleDraft(), id: 5 });
    const methods = srv.log.map((r) => `${r.method} ${r.url.split('?')[0]}`);
    assert.deepEqual(methods, ['PUT /api/geofences/5', 'GET /api/geofences'], methods.join(' | '));
  } finally { await srv.close(); resetSession(); }
});

// (و) deleting a zone still linked to a device must warn and NOT half-save (no DELETE fired).
test('deleteZone (و): a zone still linked to a device is refused with a clear reason and no DELETE request', async () => {
  const srv = await serverWithWeb({
    'GET /api/permissions': () => ({ status: 200, body: '[{"userId":0,"deviceId":7,"geofenceId":5}]' }),
  });
  try {
    const service = await adminService(srv);
    const error = await service.deleteZone(5).catch((e) => e as Error);
    assert.ok(error instanceof ZoneLinkedError, `expected ZoneLinkedError, got ${String(error)}`);
    assert.match(translate('zones.delete.linked', 'ar'), /موصولة|مرتبطة|جهاز/, 'the warning must name the reason in words');
    assert.equal(srv.log.filter((r) => r.method === 'DELETE').length, 0, 'a linked zone must not be deleted half-way');
  } finally { await srv.close(); resetSession(); }
});

test('deleteZone: an unlinked zone is deleted via client.remove and the list is re-read', async () => {
  const srv = await serverWithWeb();
  try {
    const service = await adminService(srv);
    await service.deleteZone(5);
    const del = srv.log.find((r) => r.method === 'DELETE');
    assert.ok(del, 'no DELETE was made');
    assert.equal(del.url, '/api/geofences/5', 'deleteZone uses the measured id-scoped DELETE; ?id= is a measured 405');
    assert.deepEqual(
      srv.log.map((r) => `${r.method} ${r.url.split('?')[0]}`),
      ['GET /api/permissions', 'DELETE /api/geofences/5', 'GET /api/geofences'],
      'the (و) link check runs FIRST (a zone still linked is refused above), then DELETE, then the server list is re-read'
    );
  } finally { await srv.close(); resetSession(); }
});

// ── (هـ) the §3 links on the CREATE path: guardian→device BEFORE device→zone, all owner-first ─────
// The brief's 1(هـ) names the four links; the direction of the zone link is the one M0 measured to
// make zones evaluate (bootstrap.mjs:139-140, device first). The guardian→device grant comes first
// because a zone the guardian cannot see the child through means nothing.
test('createZone (هـ): the four §3 links are posted owner-first — user→device before device→geofence', async () => {
  const srv = await serverWithWeb();
  try {
    const service = await adminService(srv);
    await service.createZone(circleDraft({ deviceId: 7, userIds: [1] }));
    const posts = srv.log.filter((r) => r.method === 'POST' && r.url === '/api/permissions').map((r) => r.body);
    assert.deepEqual(posts, [
      '{"userId":1,"notificationId":1}',
      '{"userId":1,"deviceId":7}',
      '{"deviceId":7,"geofenceId":5}',
      '{"deviceId":7,"notificationId":1}',
    ], posts.join(' | '));
  } finally { await srv.close(); resetSession(); }
});

// ── (ز) AC-2: the save path never names localStorage ─────────────────────────────────────────────
type StorageRecord = { key: string; value: string };
function installStorageSpy(): StorageRecord[] {
  const records: StorageRecord[] = [];
  const backing = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => { records.push({ key, value: String(value) }); backing.set(key, String(value)); },
    removeItem: (key: string) => { records.push({ key, value: '<remove>' }); backing.delete(key); },
    clear: () => { records.push({ key: '<clear>', value: '' }); backing.clear(); },
    key: (i: number) => Array.from(backing.keys())[i] ?? null,
    get length() { return backing.size; },
  };
  return records;
}
function uninstallStorageSpy() { delete (globalThis as unknown as { localStorage?: unknown }).localStorage; }

test('createZone (ز AC-2): a globalThis.localStorage spy records ZERO calls across the whole save path', async () => {
  const records = installStorageSpy();
  const srv = await serverWithWeb();
  try {
    const service = await adminService(srv);
    await service.createZone(circleDraft({ deviceId: 7, userIds: [1] }));
    assert.equal(records.length, 0, `the save path touched browser storage: ${records.map((r) => r.key).join(', ')}`);
  } finally { await srv.close(); uninstallStorageSpy(); resetSession(); }
});

test('App wiring (AC-2): the zones tab is the server-backed panel and the local save path is gone', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../../src/components/ParentDashboard.tsx', import.meta.url), 'utf8');
  assert.match(app, /zonesPanel=\{/, 'App MUST inject the server-backed panel into the zones tab');
  assert.match(app, /<ZonesScreen/, 'the injected panel is ZonesScreen, the service-backed screen');
  assert.match(app, /const mapZones = useMemo<MapZone\[\]>\(\(\) => serverZones/, 'the map draws the SERVER list, not a local one');
  assert.doesNotMatch(app, /saveSafeZones\s*\(/, 'no call to the removed local save helper');
  assert.doesNotMatch(app, /localStorage\.(?:get|set)Item\(\s*['"]kidguard_safe_zones/, 'the zone key is never read or written');
  assert.doesNotMatch(app, /onSaveSafeZone=\{/, 'App must not hand the legacy local handler to the dashboard');
  assert.doesNotMatch(dashboard, /localStorage\.|sessionStorage\.|indexedDB\./, 'the dashboard touches no browser storage');
  assert.match(dashboard, /activeTab === 'zones' && zonesPanel/, 'the panel IS what the zones tab renders');
  assert.match(dashboard, /zonesPanel: React\.ReactNode/, 'the panel is REQUIRED — no local fallback block is left to render instead');
  assert.doesNotMatch(dashboard, /SafeZoneForm|showAddZoneModal|selectedMapCoords/, 'the legacy local zone form and its modal state are gone');
  assert.equal(existsSync(new URL('../../src/components/SafeZoneForm.tsx', import.meta.url)), false,
    'the dead local form is deleted, not left as a second truth beside the server screen');
});

test('App wiring (R-M1-21): the signed-in guardian is the user link, and a write reaches the map', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /guardianUserIds=\{session\.user \? \[session\.user\.id\] : undefined\}/,
    'the guardian→device link must use the SERVER-named session user (R-M1-8), not a local id');
  assert.match(app, /onServerZones=\{setServerZones\}/,
    'the re-read list from a write must reach the dashboard map, or the outline stays stale');
  // The child device id cannot be wired in Task 8: nothing under src/ reads /devices until Task 9's
  // useChildren(). R-M1-21 names that gap in the screen itself instead of leaving it silent.
  assert.match(zonesScreen(), /R-M1-21/, 'the deferred child-device binding is named in ZonesScreen (R-M1-21)');
});

test('the zones/permissions/screen files never name localStorage at all (source guard for (ز))', () => {
  for (const file of ['src/services/traccar/zones.ts', 'src/services/traccar/permissions.ts', 'src/components/ZonesScreen.tsx']) {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/, `${file} touches a browser storage`);
  }
});

// ── (ح) ensureAlertSubscription: union web, never replace; missing says the right thing; failure ───
test('ensureAlertSubscription (ح): a "mail" subscription is UNIONED to "mail,web", not replaced', async () => {
  let getCount = 0;
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: ADMIN_JSON };
    if (seen.method === 'GET' && seen.url.startsWith('/api/notifications')) {
      getCount += 1;
      // first read: mail only; the confirmation read after PUT: mail,web.
      return { status: 200, body: getCount <= 1 ? '[{"id":1,"type":"geofenceExit","notificators":"mail","always":false}]' : '[{"id":1,"type":"geofenceExit","notificators":"mail,web","always":false}]' };
    }
    if (seen.method === 'PUT' && seen.url.startsWith('/api/notifications/')) return { status: 200, body: '{}' };
    return { status: 404 };
  });
  try {
    const service = await adminService(srv);
    await service.ensureAlertSubscription(1, []);
    const put = srv.log.find((r) => r.method === 'PUT' && r.url.startsWith('/api/notifications/'));
    assert.ok(put, 'no PUT was made');
    const body = JSON.parse(put.body) as { notificators: string };
    assert.equal(body.notificators, 'mail,web', 'web is ADDED to the existing value');
    assert.match(body.notificators, /mail/, 'the previous non-web value must survive (union, not replace)');
  } finally { await srv.close(); resetSession(); }
});

test('ensureAlertSubscription (ح): union is value-aware — "sms" becomes "sms,web", never a literal "mail,web"', async () => {
  let getCount = 0;
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: ADMIN_JSON };
    if (seen.method === 'GET' && seen.url.startsWith('/api/notifications')) {
      getCount += 1;
      return { status: 200, body: getCount <= 1 ? '[{"id":2,"type":"geofenceExit","notificators":"sms","always":false}]' : '[{"id":2,"type":"geofenceExit","notificators":"sms,web","always":false}]' };
    }
    if (seen.method === 'PUT' && seen.url.startsWith('/api/notifications/')) return { status: 200, body: '{}' };
    return { status: 404 };
  });
  try {
    const service = await adminService(srv);
    await service.ensureAlertSubscription(2, []);
    const put = srv.log.find((r) => r.method === 'PUT');
    assert.equal((JSON.parse(put!.body) as { notificators: string }).notificators, 'sms,web');
  } finally { await srv.close(); resetSession(); }
});

test('ensureAlertSubscription (ح): an already-web subscription is left alone — NO PUT (never replaced)', async () => {
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: ADMIN_JSON };
    if (seen.method === 'GET' && seen.url.startsWith('/api/notifications')) return { status: 200, body: '[{"id":1,"type":"geofenceExit","notificators":"mail,web","always":false}]' };
    return { status: 404 };
  });
  try {
    const service = await adminService(srv);
    await service.ensureAlertSubscription(1, []);
    assert.equal(srv.log.filter((r) => r.method === 'PUT').length, 0, 'a web-bearing subscription must not be re-PUT (no overwrite)');
  } finally { await srv.close(); resetSession(); }
});

// A missing geofenceExit subscription is its OWN case — the message names the absence, never "already
// present" (that wording came from the review of the Task 2 probe; it lies about a zone with no alert).
test('ensureAlertSubscription (ح): no subscription at all says "لا اشتراك تنبيه لهذه المنطقة", not "already present"', async () => {
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: ADMIN_JSON };
    if (seen.method === 'GET' && seen.url.startsWith('/api/notifications')) return { status: 200, body: '[]' };
    return { status: 404 };
  });
  try {
    const service = await adminService(srv);
    const error = await service.ensureAlertSubscription(9, []).catch((e) => e as Error);
    assert.ok(error instanceof ZoneAlertError, String(error));
    assert.equal((error as ZoneAlertError).reason, 'nosubscription');
    assert.equal(error.message, translate('zones.alert.missing', 'ar'));
    assert.match(error.message, /لا اشتراك تنبيه لهذه المنطقة/, error.message);
    assert.doesNotMatch(error.message, /already present|موجود مسبقا|لا تغيير/i, error.message);
  } finally { await srv.close(); resetSession(); }
});

// A failing PUT is ANNOUNCED, not swallowed: the save path rejects so the screen can show it (R-M1-10).
test('createZone (ح): a subscription PUT that fails makes createZone reject — the state is declared, not swallowed', async () => {
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: ADMIN_JSON };
    if (seen.method === 'GET' && seen.url.startsWith('/api/notifications')) return { status: 200, body: '[{"id":1,"type":"geofenceExit","notificators":"mail","always":false}]' };
    if (seen.method === 'POST' && seen.url.startsWith('/api/geofences')) return { status: 200, body: JSON.stringify(SCHOOL_ROW) };
    if (seen.method === 'PUT' && seen.url.startsWith('/api/notifications/')) return { status: 500, body: 'boom' };
    if (seen.method === 'GET' && seen.url.startsWith('/api/geofences')) return { status: 200, body: JSON.stringify([SCHOOL_ROW]) };
    return { status: 404 };
  });
  try {
    const service = await adminService(srv);
    const error = await service.createZone(circleDraft()).catch((e) => e as Error);
    assert.ok(error instanceof ZoneAlertError, `the alert failure must not be swallowed, got ${String(error)}`);
    assert.equal((error as ZoneAlertError).reason, 'putfailed');
    assert.equal(srv.log.filter((r) => r.method === 'PUT').length, 1, 'exactly one union attempt before it is declared');
  } finally { await srv.close(); resetSession(); }
});

// ── R-M1-10: ensureAlertSubscription is LOAD-BEARING and called right after createZone ─────────────
test('createZone (R-M1-10): the alert subscription read happens between the POST and the final re-read', async () => {
  const srv = await serverWithWeb();
  try {
    const service = await adminService(srv);
    await service.createZone(circleDraft());
    const order = srv.log.map((r) => `${r.method} ${r.url.split('?')[0]}`);
    const post = order.indexOf('POST /api/geofences');
    const notif = order.indexOf('GET /api/notifications');
    const reread = order.lastIndexOf('GET /api/geofences');
    assert.ok(post >= 0 && notif > post && reread > notif, `expected POST → notifications → re-read, got ${order.join(' → ')}`);
  } finally { await srv.close(); resetSession(); }
});

// ── ZonesScreen source guards: no test renders the screen, so its invariants are read off the file ──
// (copy through the catalog, RTL via dir attr, admin gate on the edit button, real service calls,
//  no fabricated child coordinates). These mirror what Step 3 of the brief requires the screen to do.
function zonesScreen(): string {
  return readFileSync(new URL('../../src/components/ZonesScreen.tsx', import.meta.url), 'utf8');
}
test('ZonesScreen (copy): no Arabic codepoints, no literal direction:rtl — every string is translate(catalog.ts)', () => {
  const src = zonesScreen();
  // U+0600..U+06FF blocks: the file must not hardcode any Arabic; all copy is catalog-driven.
  assert.doesNotMatch(src, /[؀-ۿ]/, 'ZonesScreen must not hardcode Arabic strings (use translate)');
  assert.doesNotMatch(src, /direction:\s*['"]?rtl/, 'ZonesScreen must set dir via the lang attr, not a literal direction:rtl');
  assert.match(src, /import \{[^}]*translate[^}]*\} from '\.\.\/translations\/catalog\.ts'/, 'ZonesScreen must import translate from the catalog');
  assert.match(src, /lang: CatalogLang/, 'ZonesScreen must receive the catalog language as a prop');
});
test('ZonesScreen (admin gate + server path): edit button disabled for non-admin, real service calls, no fake coords', () => {
  const src = zonesScreen();
  assert.match(src, /disabled=\{!isAdmin\}/, 'the edit button must be disabled when the user is not an administrator');
  for (const call of ['listZones(', 'createZone(', 'updateZone(', 'deleteZone(']) {
    assert.ok(src.includes(call), `ZonesScreen must call ${call} on the zone service (server is the truth)`);
  }
  // AC-2 root: the screen reads/writes the server, never a fabricated hardcoded child position.
  assert.doesNotMatch(src, /36\.7538|3\.0588/, 'ZonesScreen must not embed the prototype fabricated coordinates');
});

// R-M1-18's second half: no fabricated geometry either. A circle with no picked centre must NOT
// become CIRCLE (0 0, …) — that is a real place in the Gulf of Guinea, and it would be saved as if
// the guardian had drawn it. The screen refuses with a catalog line instead.
test('ZonesScreen (no fabricated geometry): an unfinished drawing is refused, never saved at (0,0)', () => {
  const src = zonesScreen();
  assert.doesNotMatch(src, /\?\?\s*0/, 'no "(lat ?? 0)" fallback — an unpicked centre is null, not the equator');
  assert.match(src, /function draftGeometry\(\): Geometry \| null/, 'draftGeometry returns null when the drawing is incomplete');
  assert.match(src, /zones\.needGeometry/, 'the refusal is a catalog sentence the guardian can read');
  assert.match(src, /!geometryReady/, 'the save button stays disabled until the drawing is complete');
});

// ── fix-round: the route buffer survives an edit, and a write reaches the map ─────────────────────
// The buffer is a geofence ATTRIBUTE (polylineDistance), not part of the WKT, so reading the geometry
// back is not enough: an edit that reset it to the editor default would silently widen a 220 m
// corridor to 150 m (or narrow it), changing which streets trigger the exit alert.
test('bufferFromAttributes (fix): a stored polylineDistance survives the edit round-trip', () => {
  assert.equal(bufferFromAttributes({ polylineDistance: 220 }), 220);
  assert.equal(bufferFromAttributes({ polylineDistance: '140' }), 140, 'the server may hand a numeric string back');
  assert.equal(bufferFromAttributes({ polylineDistance: 0 }), 0, 'a stored 0 is shown as 0 so save refuses it — never silently replaced');
  assert.equal(bufferFromAttributes({ polylineDistance: -5 }, 160), 160, 'a negative width is unusable; fall back');
  assert.equal(bufferFromAttributes({ polylineDistance: 'nope' }, 180), 180);
  assert.equal(bufferFromAttributes({ polylineDistance: '' }, 190), 190, 'a blank string is missing, not zero metres');
  assert.equal(bufferFromAttributes({ polylineDistance: '   ' }, 195), 195, 'whitespace-only is still missing');
  assert.equal(bufferFromAttributes(undefined, 175), 175);
  assert.equal(bufferFromAttributes({}, 150), 150);
});

test('ZonesScreen (route edit): the editor reads the stored buffer instead of resetting it', () => {
  const src = zonesScreen();
  // The only `setBuffer(150)` left is resetDraft()'s default for a NEW drawing; the edit path must
  // come through the stored attribute, so the two lines are pinned by their distinct sources.
  assert.match(src, /setBuffer\(bufferFromAttributes\(attributes\)\)/, 'the edit path must read polylineDistance from the stored attributes');
  assert.match(src, /function resetDraft\(\)[\s\S]{0,240}setBuffer\(150\)/, 'the default belongs to a fresh draft only');
});

test('ZonesScreen (fresh map): create, update and delete all publish the RE-READ list to App', () => {
  const src = zonesScreen();
  assert.match(src, /const list = editingId !== null \? await service\.updateZone\(draft\) : await service\.createZone\(draft\);\s*[\s\S]{0,60}publish\(list\)/,
    'a create/update result is published, never only kept in local state');
  assert.match(src, /const list = await service\.deleteZone\(id\);\s*[\s\S]{0,60}publish\(list\)/,
    'a delete result is published too — the map must lose the outline with the list');
  assert.match(src, /onServerZones\?\.\(list\)/, 'the optional callback carries the server list to the dashboard map');
});

// ── fix-round 2: the circle tool draws with a real drag (review 2) ───────────────────────────────
// The state machine is proven BEHAVIOURALLY in tests/app/circleDrag.test.ts. What follows is a WIRING
// GUARD — source-level assertions that the browser-bound half (Pointer Events, capture, click
// suppression) is still connected to it. The gesture itself stays NOT RUN until a measured run (R-M1-19).
test('ZonesScreen (circle by drag) — WIRING GUARD: the tool is armed only for an admin and the drag becomes the draft', () => {
  const src = zonesScreen();
  assert.match(src, /drawCircle=\{mode === 'circle' && isAdmin\}/, 'only an admin gets the drawing tool, only on the circle tab');
  assert.match(src, /onCircleDrawn=\{handleCircleDrawn\}/, 'the map reports the drawn circle back to the screen');
  assert.match(src, /const handleCircleDrawn = \(center: LatLng, radiusMeters: number\)/, 'the handler takes the map centre and radius');
  assert.match(src, /if \(!isAdmin\) return;/, 'a non-admin cannot arm a draft through the map callback');
});

test('MapView (circle by drag) — WIRING GUARD: Pointer Events, capture and click suppression', () => {
  const src = readFileSync(new URL('../../src/components/MapView.tsx', import.meta.url), 'utf8');
  for (const handler of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    assert.ok(src.includes(`container.addEventListener('${handler}', `),
      `MapView must listen for ${handler} on the map container itself — Leaflet's Map events never carried DOM touches`);
  }
  assert.match(src, /setPointerCapture\(event\.pointerId\)/, 'capture keeps a release outside the map in the same drag');
  assert.ok(src.includes("container.addEventListener('lostpointercapture', "),
    'if capture is lost mid-drag the gesture must end, not hang');
  // Capture can throw where the API is unavailable; without a document-level release the drag would
  // stay active forever and the next tap would be rejected as "already dragging".
  assert.ok(src.includes("document.addEventListener('pointerup', finish)"),
    'a release outside the container must finish the drag even without capture');
  assert.ok(src.includes("document.removeEventListener('pointerup', finish)"),
    'the document-level fallback must be removed when the tool is unarmed');
  assert.match(src, /closest\('\.leaflet-control-container'\)/,
    'starting a drag on a zoom button must not draw a circle');
  assert.match(src, /pointerType === 'mouse'[\s\S]{0,80}button !== 0/,
    'a right-click must not start a draw');
  assert.match(src, /container\.style\.touchAction = 'none'/, 'touch must not scroll the page mid-draw');
  assert.match(src, /circleDragRef\.current\?\.consumeClickSuppression\(\)\) return;[\s\S]{0,220}selectCallbackRef\.current\?\./,
    'the click after a drag is consumed BEFORE it can overwrite the drawn centre');
  assert.match(src, /createCircleDrag\(\)/, 'the pure state machine makes the draw-vs-tap decision');
  assert.match(src, /previewCircleRef\.current = L\.circle\(/, 'the drag draws a dashed preview that never becomes a saved zone');
  assert.match(src, /map\.dragging\.disable\(\)/, 'while armed a drag draws, it does not pan the map');
  assert.match(src, /map\.dragging\.enable\(\)/, 'unarming restores panning');
  assert.match(src, /\[drawCircle, mapReady\]/, 'the effect re-runs once the map exists — the tool may be armed on first render');
});

// Failure copy follows the guardian's language too: the service errors carry Arabic in `.message`,
// so the screen resolves the class/reason through the catalog instead of printing `.message`.
test('zoneErrorMessage (R-M1-18): the same failure speaks the screen language — Arabic .message is never rendered', () => {
  const missing = new ZoneAlertError('nosubscription');
  assert.equal(zoneErrorMessage(missing, 'fr'), translate('zones.alert.missing', 'fr'));
  assert.equal(zoneErrorMessage(missing, 'en'), translate('zones.alert.missing', 'en'));
  assert.notEqual(zoneErrorMessage(missing, 'fr'), missing.message, 'a French guardian must not be shown the Arabic service line');
  assert.equal(zoneErrorMessage(new ZoneAlertError('putfailed'), 'fr'), translate('zones.alert.failed', 'fr'));
  assert.equal(zoneErrorMessage(new ZoneLinkedError(5), 'en'), translate('zones.delete.linked', 'en'));
  assert.equal(zoneErrorMessage(new TraccarError('forbidden', 403, 'x'), 'fr'), translate('session.forbidden', 'fr'));
});

// A REFUSED GEOMETRY is the most likely failure a guardian meets, so its copy must follow `lang` too:
// the violation codes are language-neutral and the catalog owns the five sentences (R-M1-14).
test('zoneErrorMessage (fix): every geometry violation code is localised, and none leaks Arabic into fr/en', () => {
  const radius = new ZoneValidationError([{ code: 'radiusMin', need: 50 }]);
  assert.equal(zoneErrorMessage(radius, 'ar'), translate('zones.error.radiusMin', 'ar', { need: 50 }));
  assert.equal(zoneErrorMessage(radius, 'fr'), translate('zones.error.radiusMin', 'fr', { need: 50 }));
  assert.equal(zoneErrorMessage(radius, 'en'), translate('zones.error.radiusMin', 'en', { need: 50 }));
  for (const lang of ['fr', 'en'] as const) {
    assert.doesNotMatch(zoneErrorMessage(radius, lang), /[؀-ۿ]/, `${lang} output must not contain Arabic`);
  }

  assert.equal(zoneErrorMessage(new ZoneValidationError([{ code: 'bufferMissing' }]), 'fr'), translate('zones.error.bufferMissing', 'fr'));
  assert.equal(zoneErrorMessage(new ZoneValidationError([{ code: 'bufferMin', need: 100 }]), 'en'), translate('zones.error.bufferMin', 'en', { need: 100 }));
  assert.equal(zoneErrorMessage(new ZoneValidationError([{ code: 'polygonMinPoints' }]), 'fr'), translate('zones.error.polygonMinPoints', 'fr'));

  // Every violation is named, not just the first — a route with two problems reads as both sentences.
  const two = new ZoneValidationError([{ code: 'routeMinPoints' }, { code: 'bufferMissing' }]);
  assert.equal(zoneErrorMessage(two, 'en'),
    `${translate('zones.error.routeMinPoints', 'en')} — ${translate('zones.error.bufferMissing', 'en')}`);
  assert.doesNotMatch(zoneErrorMessage(two, 'en'), /[؀-ۿ]/);
});
