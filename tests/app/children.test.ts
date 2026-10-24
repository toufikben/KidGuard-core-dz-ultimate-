// tests/app/children.test.ts — Task 9 (أطفال متعددون وأولياء متعددون) against a FAKE Traccar only.
// The live lab is never contacted here; Step 4 is the human-run live measurement.
//
// Brief letters (أ)–(ز) each own a named test below:
//   (أ) two devices ⇒ two children, each labelled «from {server device name}, {reading}»;
//   (ب) a device the viewer cannot see never appears — /api/devices is the whole truth (the fake
//       models the server's own visibility with TWO different lists, admin vs viewer);
//   (ج) only an admin may assign/unassign, and a viewer is refused before any POST/DELETE;
//   (د) one guardian is shown as §5.12 says (no voting, time-based escalation) and the screen is
//       NOT disabled;
//   (هـ) the displayed label comes from the SERVER device name, never a local childName;
//   (و) every fixture name starts with `lab-`;
//   (ز) R-M1-21: App renders <ZonesScreen> only behind the selected child and passes the literal
//       childDeviceId={selectedChild.device.id}; undefined/literal/local wirings fail the guard.
//
// Extra guards this file adds because the brief's Produces contract names them:
//   - unassignGuardian sends a JSON body to /permissions with { userId, deviceId } — USER FIRST
//     (the measured wire: a query-only DELETE is a 400 NPE, a JSON body answers 204);
//   - listGuardiansFor reads permissions user-first then /users, never invents a name;
//   - guardianSummary is single === count === 1;
//   - a load failure is a catalog sentence, never a server body;
//   - conflicting readings are announced as no-data rather than silently picked;
//   - src/state/children.ts names no browser storage;
//   - ChildScreen/ContactsScreen hardcode no Arabic and no `direction:rtl`;
//   - Navbar/App carry no PARENT/CHILD role branch (R-M1-23), ChildView is unimported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { TraccarClient } from '../../src/services/traccar/client.ts';
import { TraccarError } from '../../src/services/traccar/client.ts';
import type { ServerDevice, ServerPosition, ServerUser } from '../../src/services/traccar/types.ts';
import { formatPositionLabel, noDataLabel } from '../../src/services/traccar/positions.ts';
import { translate } from '../../src/translations/catalog.ts';
import {
  assignGuardian,
  createChildrenController,
  deviceDisplayName,
  guardianSummary,
  listGuardiansFor,
  pickSelectedChild,
  unassignGuardian,
  type Child,
} from '../../src/state/children.ts';
import { ChildScreen } from '../../src/components/ChildScreen.tsx';
import { ContactsScreen } from '../../src/components/ContactsScreen.tsx';

// ── fixtures — every name starts with `lab-` (case و) ────────────────────────────────────────────
const LAB = {
  trackerA: 'lab-tracker-a',
  trackerB: 'lab-tracker-b',
  // Long serials: masking is only meaningful when the full value is far longer than the tail.
  imeiA: 'lab-serial-a-000000000011',
  imeiB: 'lab-serial-b-000000000012',
  guardianA: 'lab-guardian-a',
  guardianB: 'lab-guardian-b',
  guardianC: 'lab-guardian-c',
  emailA: 'lab-guardian-a@example.com',
  emailB: 'lab-guardian-b@example.com',
  emailC: 'lab-guardian-c@example.com',
  localChild: 'lab-local-child',
} as const;

const ADMIN: ServerUser = { id: 2, name: LAB.guardianA, email: LAB.emailA, admin: true };
const VIEWER: ServerUser = { id: 3, name: LAB.guardianB, email: LAB.emailB, admin: false };
const ADMIN_ROW = { id: 2, name: LAB.guardianA, email: LAB.emailA, administrator: true };
const GUARDIAN_C_ROW = { id: 4, email: LAB.emailC, administrator: false };

const DEVICE_A: ServerDevice = { id: 11, name: LAB.trackerA, uniqueId: LAB.imeiA, status: 'online' };
const DEVICE_B: ServerDevice = { id: 12, name: LAB.trackerB, uniqueId: LAB.imeiB, status: 'online' };

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const isoAgo = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
const position = (over: Partial<ServerPosition> = {}): ServerPosition => ({
  id: 1,
  deviceId: DEVICE_A.id,
  fixTime: isoAgo(40),
  serverTime: new Date(NOW).toISOString(),
  latitude: 36.7538,
  longitude: 3.0588,
  speed: 0,
  course: 0,
  accuracy: 12,
  attributes: {},
  ...over,
});

const POS_A = position({ id: 101, deviceId: 11 });
const POS_B = position({ id: 102, deviceId: 12, fixTime: isoAgo(3), latitude: 36.76, longitude: 3.07 });

// ── the hand-written fake client (no library) ────────────────────────────────────────────────────
type Call = { method: string; path: string; params?: Record<string, string | number>; body?: unknown };
type Handler = (call: Call) => unknown;

function fakeClient(handler: Handler): TraccarClient & { calls: Call[] } {
  const calls: Call[] = [];
  const run = async (call: Call) => {
    calls.push(call);
    return handler(call);
  };
  const client = {
    calls,
    get: <T>(path: string, params?: Record<string, string | number>) => run({ method: 'GET', path, params }) as Promise<T>,
    post: <T>(path: string, body: unknown) => run({ method: 'POST', path, body }) as Promise<T>,
    put: <T>(path: string, body: unknown) => run({ method: 'PUT', path, body }) as Promise<T>,
    remove: (path: string, params?: Record<string, string | number>) => run({ method: 'DELETE', path, params }) as Promise<null>,
    removeWithBody: <T>(path: string, body: unknown) => run({ method: 'DELETE', path, body }) as Promise<T>,
    postForm: <T>(path: string, params: Record<string, string | number>) => run({ method: 'POST_FORM', path, params }) as Promise<T>,
    postFormText: (path: string, params: Record<string, string | number>) => run({ method: 'POST_FORM_TEXT', path, params }) as Promise<string>,
  };
  return client as TraccarClient & { calls: Call[] };
}

// A read server where /devices is the visibility the SERVER decided: each client instance answers
// with its own list, exactly like a viewer who only receives shared devices.
function readServer(devices: ServerDevice[], positionsByDevice: Record<number, ServerPosition[]>) {
  return fakeClient((call) => {
    if (call.method === 'GET' && call.path === '/devices') return devices;
    if (call.method === 'GET' && call.path === '/positions') {
      return positionsByDevice[Number(call.params?.deviceId)] ?? [];
    }
    throw new Error(`unexpected ${call.method} ${call.path}`);
  });
}

function adminServer(extra: Partial<Record<string, unknown>> = {}) {
  return fakeClient((call) => {
    const key = `${call.method} ${call.path}`;
    if (key in extra) {
      const value = extra[key];
      return typeof value === 'function' ? (value as Handler)(call) : value;
    }
    if (key === 'POST /permissions') return null;
    if (key === 'DELETE /permissions') return null;
    if (key === 'GET /users') return [ADMIN_ROW, GUARDIAN_C_ROW];
    throw new Error(`unexpected ${key}`);
  });
}

// ── (أ) two devices ⇒ two children, each label names its own server source ────────────────────────
test('(أ) two devices become two children, each labelled from its server device and reading', async () => {
  const client = readServer([DEVICE_A, DEVICE_B], { 11: [POS_A], 12: [POS_B] });
  const controller = createChildrenController({
    client, identity: async () => ADMIN, lang: 'ar', now: () => NOW,
  });

  const snapshot = await controller.refresh();

  assert.equal(snapshot.loading, false);
  assert.equal(snapshot.error, null);
  assert.equal(snapshot.children.length, 2, 'two devices must be two children');
  assert.deepEqual(snapshot.children.map((child) => child.device.id), [11, 12]);
  assert.equal(snapshot.children[0].readings?.id, 101);
  assert.equal(snapshot.children[1].readings?.id, 102);
  assert.equal(snapshot.children[0].freshness, 'fresh');
  assert.equal(snapshot.children[1].freshness, 'fresh');

  const expectedA = translate('children.sourceFromDevice', 'ar', {
    source: LAB.trackerA,
    reading: formatPositionLabel(POS_A, NOW, 'ar'),
  });
  const expectedB = translate('children.sourceFromDevice', 'ar', {
    source: LAB.trackerB,
    reading: formatPositionLabel(POS_B, NOW, 'ar'),
  });
  assert.equal(snapshot.children[0].label, expectedA, 'the label is «from {server name}, {reading}»');
  assert.equal(snapshot.children[1].label, expectedB);
  assert.match(snapshot.children[0].label, /منذ 40 ثانية/, 'the age is the measured one (40 s)');
  assert.match(snapshot.children[1].label, /منذ 3 ثانية/, 'the second source is labelled with its own reading');

  const positionCalls = client.calls.filter((call) => call.path === '/positions');
  assert.deepEqual(positionCalls.map((call) => call.params), [{ deviceId: 11 }, { deviceId: 12 }],
    'one latest-position read per visible device, scoped by deviceId');
});

// ── (ب) a device the viewer cannot see never appears ─────────────────────────────────────────────
test('(ب) a non-shared device is absent for a viewer — /devices is the whole truth, not a local union', async () => {
  // The fake models the SERVER's visibility: the admin's list has two devices, the viewer's has one.
  // No client-side union may bring the hidden device back.
  const adminReads = readServer([DEVICE_A, DEVICE_B], { 11: [POS_A], 12: [POS_B] });
  const viewerReads = readServer([DEVICE_A], { 11: [POS_A], 12: [POS_B] });

  const adminSnapshot = await createChildrenController({
    client: adminReads, identity: async () => ADMIN, lang: 'ar', now: () => NOW,
  }).refresh();
  const viewerSnapshot = await createChildrenController({
    client: viewerReads, identity: async () => VIEWER, lang: 'ar', now: () => NOW,
  }).refresh();

  assert.deepEqual(adminSnapshot.children.map((child) => child.device.id), [11, 12]);
  assert.deepEqual(viewerSnapshot.children.map((child) => child.device.id), [11],
    'the viewer receives only the device the server shared with them');
  assert.equal(viewerSnapshot.children.some((child) => child.device.id === 12), false,
    'the hidden device must not appear by any local fallback');
  assert.equal(viewerReads.calls.filter((call) => call.path === '/positions').length, 1,
    'no position is even requested for a device the server did not list');
  assert.equal(
    viewerReads.calls.some((call) => call.path === '/positions' && Number(call.params?.deviceId) === 12),
    false,
    'a hidden device id never reaches /positions',
  );
});

// ── (ج) admin-only assignment, and a viewer writes nothing ───────────────────────────────────────
test('(ج) an admin may assign, and the grant is POSTed owner-first as {"userId":2,"deviceId":11}', async () => {
  const client = adminServer({
    'GET /permissions': () => [],
  });

  await assignGuardian(11, 2, { client, identity: async () => ADMIN });

  const posts = client.calls.filter((call) => call.method === 'POST' && call.path === '/permissions');
  assert.equal(posts.length, 1, 'exactly one grant is written');
  assert.equal(JSON.stringify(posts[0].body), '{"userId":2,"deviceId":11}',
    'the owner (user) is the FIRST key of the permission map');
  const check = client.calls.find((call) => call.method === 'GET' && call.path === '/permissions');
  assert.deepEqual(Object.keys(check?.params ?? {}), ['userId', 'deviceId'],
    'the existing-link read is owner-first too');
  assert.equal(check?.params?.deviceId, 0, '0 on the property means "any"');
});

test('(ج) a viewer is refused by identity() before any POST/DELETE — zero writes', async () => {
  const client = adminServer({ 'GET /permissions': () => [] });

  await assert.rejects(
    assignGuardian(11, 2, { client, identity: async () => VIEWER }),
    (error: unknown) => error instanceof TraccarError && error.kind === 'forbidden',
    'a viewer cannot assign a guardian',
  );
  await assert.rejects(
    unassignGuardian(11, 2, { client, identity: async () => VIEWER }),
    (error: unknown) => error instanceof TraccarError && error.kind === 'forbidden',
    'a viewer cannot unassign a guardian',
  );

  assert.equal(client.calls.filter((call) => call.method === 'POST' || call.method === 'DELETE').length, 0,
    'the refusal happens before any write request');
  assert.equal(client.calls.length, 0, 'the identity check needs no request of its own when injected');
});

// ── unassign: JSON body, user id FIRST because it is the owner / first relation key ──────────────
test('unassignGuardian sends a JSON body to /permissions with { userId, deviceId } — user first', async () => {
  const client = adminServer();

  await unassignGuardian(11, 7, { client, identity: async () => ADMIN });

  const deletes = client.calls.filter((call) => call.method === 'DELETE');
  assert.equal(deletes.length, 1, 'exactly one DELETE is written');
  assert.equal(deletes[0].path, '/permissions');
  assert.equal(deletes[0].params, undefined,
    'the measured wire: a query-only DELETE /permissions is a 400 NPE, never a revoke');
  assert.equal(JSON.stringify(deletes[0].body), '{"userId":7,"deviceId":11}',
    'the owner (user) is the FIRST key of the JSON body');
});

// ── (د) the single-guardian state is a normal state, not a disabled screen ───────────────────────
test('(د) guardianSummary is single only at exactly one, and the one-guardian screen stays usable', () => {
  assert.deepEqual(guardianSummary([]), { count: 0, single: false });
  assert.deepEqual(guardianSummary([ADMIN]), { count: 1, single: true });
  assert.deepEqual(guardianSummary([ADMIN, VIEWER]), { count: 2, single: false },
    'two guardians are not the single-guardian state');

  const sentence = translate('contacts.singleGuardian', 'ar');
  assert.match(sentence, /لا تصويت/, '§5.12: one guardian means no voting');
  assert.match(sentence, /زمني/, '§5.12: escalation is time-based');
  assert.match(translate('contacts.singleGuardian', 'en'), /vote/i);
  assert.match(translate('contacts.singleGuardian', 'fr'), /vote/i);

  const child = childOf(DEVICE_A);
  const html = renderToString(React.createElement(ContactsScreen, {
    lang: 'ar',
    children: [child],
    selectedId: 11,
    onSelectChild: () => {},
    guardians: [ADMIN],
    candidates: [VIEWER],
    summary: guardianSummary([ADMIN]),
    loading: false,
    error: null,
    isAdmin: true,
    onAssign: () => {},
    onUnassign: () => {},
    onRefresh: () => {},
  }));
  assert.ok(html.includes(sentence), 'the single-guardian sentence is displayed');
  assert.ok(html.includes(translate('contacts.add', 'ar')), 'the add control is still rendered');
  assert.ok(html.includes(translate('contacts.remove', 'ar')), 'the remove control is still rendered');
  assert.doesNotMatch(html, /disabled=""/, 'the single-guardian state must not disable the screen');

  const twoHtml = renderToString(React.createElement(ContactsScreen, {
    lang: 'ar',
    children: [child],
    selectedId: 11,
    onSelectChild: () => {},
    guardians: [ADMIN, VIEWER],
    candidates: [],
    summary: guardianSummary([ADMIN, VIEWER]),
    loading: false,
    error: null,
    isAdmin: true,
    onAssign: () => {},
    onUnassign: () => {},
    onRefresh: () => {},
  }));
  assert.equal(twoHtml.includes(sentence), false, 'with two guardians the single-state notice is gone');
});

// ── (هـ) the label comes from the server, never from a local childName ──────────────────────────
test('(هـ) the displayed source is the server device name — not uniqueId, not a local childName', async () => {
  const storageReads: string[] = [];
  const fakeStorage = {
    getItem: (key: string) => { storageReads.push(key); throw new Error('storage must not be read'); },
    setItem: (key: string) => { storageReads.push(key); throw new Error('storage must not be written'); },
    removeItem: (key: string) => { storageReads.push(key); throw new Error('storage must not be removed'); },
    clear: () => { storageReads.push('<clear>'); throw new Error('storage must not be cleared'); },
    key: () => null,
    length: 0,
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = fakeStorage;
  try {
    const client = readServer([DEVICE_A], { 11: [POS_A] });
    const snapshot = await createChildrenController({
      client, identity: async () => ADMIN, lang: 'ar', now: () => NOW,
    }).refresh();
    const label = snapshot.children[0]?.label ?? '';

    assert.ok(label.includes(LAB.trackerA), 'the server device name is the source');
    assert.equal(label.includes(LAB.imeiA), false, 'the uniqueId is not substituted for the name the server gave');
    assert.equal(label.includes(LAB.localChild), false, 'no localStorage childName reaches the label');
    assert.deepEqual(storageReads, [], 'the children state never touches browser storage');
  } finally {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  }
});

// ── a nameless device is announced as unnamed, never by its serial ──────────────────────────────
test('a device with no server name is announced as unnamed — never the uniqueId', async () => {
  const unnamed: ServerDevice = { ...DEVICE_A, name: '' };
  const client = readServer([unnamed], { 11: [POS_A] });
  const snapshot = await createChildrenController({
    client, identity: async () => ADMIN, lang: 'ar', now: () => NOW,
  }).refresh();

  const unnamedSentence = translate('children.unnamedDevice', 'ar');
  const label = snapshot.children[0]?.label ?? '';
  assert.ok(label.includes(unnamedSentence), 'the source is the catalog sentence for an unnamed device');
  assert.equal(label.includes(LAB.imeiA), false, 'the full uniqueId is never substituted for a name');
  assert.equal(label.includes(LAB.imeiA.slice(-4)), false, 'not even the masked tail stands in for a name');
  assert.equal(deviceDisplayName(unnamed, 'ar'), unnamedSentence, 'the shared display helper agrees');
  assert.equal(deviceDisplayName(DEVICE_A, 'ar'), LAB.trackerA, 'a named device keeps the server name');
});

// ── conflict: two sources disagree ⇒ no silent pick, the words say no data ──────────────────────
test('a source conflict yields readings=null, freshness=null and the no-data label', async () => {
  const far = position({ id: 103, deviceId: 11, latitude: 36.80, longitude: 3.10 });
  const client = readServer([DEVICE_A], { 11: [POS_A, far] });
  const snapshot = await createChildrenController({
    client, identity: async () => ADMIN, lang: 'ar', now: () => NOW,
  }).refresh();

  assert.equal(snapshot.children[0].readings, null, 'neither conflicting source may be shown');
  assert.equal(snapshot.children[0].freshness, null, 'null means no usable reading');
  assert.equal(snapshot.children[0].label, noDataLabel('ar'));
});

// ── load failures are catalog sentences, never a server body ────────────────────────────────────
test('a failed /devices read is announced with children.loadFailed, never the server body', async () => {
  const client = fakeClient(() => {
    throw new TraccarError('server', 500, 'HTTP 500 lab server exploded');
  });
  const snapshot = await createChildrenController({
    client, identity: async () => ADMIN, lang: 'fr', now: () => NOW,
  }).refresh();

  assert.equal(snapshot.loading, false);
  assert.equal(snapshot.children.length, 0, 'a failed read shows no children, never a stale list');
  assert.equal(snapshot.error, translate('children.loadFailed', 'fr'));
  assert.equal(snapshot.error?.includes('lab server exploded'), false, 'the server body never reaches the screen');
});

// ── listGuardiansFor: user-first permissions read, then /users, no invented names ───────────────
test('listGuardiansFor reads permissions user-first, then /users, and invents no name', async () => {
  const client = fakeClient((call) => {
    if (call.method === 'GET' && call.path === '/permissions') {
      return [
        { DEVICEID: 11, USERID: 2 },
        { DEVICEID: 11, USERID: 4 },
        { DEVICEID: 11, USERID: 99 },
      ];
    }
    if (call.method === 'GET' && call.path === '/users') return [ADMIN_ROW, GUARDIAN_C_ROW];
    throw new Error(`unexpected ${call.method} ${call.path}`);
  });

  const guardians = await listGuardiansFor(11, { client });

  assert.deepEqual(guardians.map((user) => user.id), [2, 4],
    'only ids present in BOTH the link rows and /users, in row order');
  assert.equal(guardians[0].name, LAB.guardianA);
  assert.equal(guardians[1].name, undefined, 'a user the server did not name keeps no invented name');
  assert.equal('name' in guardians[1], false);
  assert.equal(guardians[1].email, LAB.emailC);
  assert.equal(guardians.some((user) => user.id === 99), false, 'a link to an unknown user invents nobody');

  const reads = client.calls.filter((call) => call.method === 'GET');
  assert.deepEqual(reads.map((call) => call.path), ['/permissions', '/users'],
    'the link rows are read first, then the users they point at');
  assert.deepEqual(Object.keys(reads[0].params ?? {}), ['userId', 'deviceId'],
    'the user→devices read is user-first — the first key names tc_user_device');
  assert.equal(reads[0].params?.userId, 0, '0 on the owner property means "any user"');
  assert.equal(reads[0].params?.deviceId, 11, 'the property is the device under question');
});

// ── (و) no real child name in any fixture ───────────────────────────────────────────────────────
test('(و) every fixture name starts with lab-', () => {
  for (const value of Object.values(LAB)) {
    assert.ok(value.startsWith('lab-'), `fixture ${JSON.stringify(value)} must start with lab-`);
  }
  for (const device of [DEVICE_A, DEVICE_B]) {
    assert.ok(device.name.startsWith('lab-'), `device name ${device.name} must start with lab-`);
    assert.ok(device.uniqueId.startsWith('lab-'), `device uniqueId ${device.uniqueId} must start with lab-`);
  }
  for (const person of [ADMIN, VIEWER]) {
    assert.ok(String(person.name).startsWith('lab-'), `user name ${person.name} must start with lab-`);
    assert.ok(person.email.startsWith('lab-'), `email ${person.email} must start with lab-`);
  }
  // The source guard: a name-like fixture literal added inline must carry the same prefix.
  const source = readFileSync(new URL('./children.test.ts', import.meta.url), 'utf8');
  const inlineNames = [...source.matchAll(/(?:name|uniqueId|email):\s*'([^']+)'/g)].map((match) => match[1]);
  for (const name of inlineNames) {
    assert.ok(name.startsWith('lab-'), `inline fixture name ${JSON.stringify(name)} must start with lab-`);
  }
});

// ── (ز) R-M1-21: the selected child's device id is what ZonesScreen receives ────────────────────
test('(ز R-M1-21) App renders ZonesScreen only behind selectedChild and passes selectedChild.device.id', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');

  assert.match(app, /\{selectedChild && \(\s*<ZonesScreen\b/, 'ZonesScreen must be behind a selectedChild guard');
  assert.match(app, /childDeviceId=\{selectedChild\.device\.id\}/,
    'the literal wiring is selectedChild.device.id — no default and no local value');
  assert.equal((app.match(/<ZonesScreen\b/g) ?? []).length, 1, 'exactly one ZonesScreen render site');
  assert.equal((app.match(/childDeviceId=/g) ?? []).length, 1, 'exactly one childDeviceId wiring');

  for (const forbidden of [
    'childDeviceId={undefined}',
    'childDeviceId={null}',
    'childDeviceId={0}',
    'childDeviceId={11}',
    'childDeviceId={alertPolicy',
    'childDeviceId={localStorage',
    'childDeviceId={Number',
  ]) {
    assert.equal(app.includes(forbidden), false, `R-M1-21 forbids ${forbidden}`);
  }
  assert.doesNotMatch(app, /childDeviceId=\{\s*(?:undefined|null|\d+)\s*\}/);
  assert.match(app, /zones\.noChild/, 'with no selected child the panel is replaced by an honest catalog sentence');
  assert.match(app, /childName=\{deviceDisplayName\(selectedChild\.device, lang\)\}/,
    'the map gets the same shared display name as the screens — a nameless device is a sentence, not undefined');
  assert.equal(app.includes('childName={selectedChild.device.name}'), false,
    'the raw optional server name never reaches escapeHtml');

  // The behaviour behind the literal: pickSelectedChild is the exact find/first/null rule.
  const childA = childOf(DEVICE_A);
  const childB = childOf(DEVICE_B);
  assert.equal(pickSelectedChild([childA, childB], 12)?.device.id, 12, 'the selected id wins');
  assert.equal(pickSelectedChild([childA, childB], null)?.device.id, 11, 'no selection falls back to the first child');
  assert.equal(pickSelectedChild([childA, childB], 999)?.device.id, 11, 'an unknown id falls back to the first child');
  assert.equal(pickSelectedChild([], 12), null, 'no children means no selected child — ZonesScreen is not rendered');
});

// ── R-M1-23 shell: no role branch, three views, both screens reachable ──────────────────────────
test('R-M1-23: App always renders the guardian shell; Navbar branches on the view, not on role', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const navbar = readFileSync(new URL('../../src/components/Navbar.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(app, /role === 'PARENT'\s*\?/, 'the old role render branch must be gone');
  assert.doesNotMatch(app, /<ChildView\b/, 'ChildView stays on disk but unimported (Task 11 debt)');
  assert.match(app, /'dashboard' \| 'children' \| 'contacts' \| 'alerts'/, 'the shell has exactly the four views');
  assert.match(app, /<ChildScreen\b/);
  assert.match(app, /<ContactsScreen\b/);
  assert.match(app, /view === 'alerts'[\s\S]{0,80}<AlertsLog/,
    'the fourth view renders the alerts log (R-M1-29)');
  assert.match(app, /view === 'dashboard'[\s\S]{0,80}<ParentDashboard/,
    'the dashboard is one view of the guardian shell, not a role branch');
  assert.match(app, /useChildren\(\)/, 'App consumes the server-backed children state');
  assert.match(app, /refreshChildren\(/, 'App refreshes it when the session is signed in');
  assert.match(app, /view !== 'contacts' \|\| selectedChild === null \|\| session\.status !== 'signed-in' \|\| session\.user\?\.admin !== true/,
    'a viewer opening the contacts view triggers no guardian read at all');
  assert.match(app, /if \(session\.user\?\.admin !== true\)[\s\S]{0,200}return;/,
    'loadGuardians refuses a non-admin before any /permissions or /users request');
  assert.match(app, /childPosition=\{selectedChild\?\.readings \?\? null\}/,
    'the map position is the selected child’s server reading');
  assert.match(app, /childFreshness=\{selectedChild\?\.freshness \?\? null\}/);
  assert.match(app, /childLabel=\{selectedChild\?\.label \?\? null\}/);
  assert.doesNotMatch(app, /const childLabel: string \| null = noDataLabel/, 'the local placeholder label is gone');

  assert.doesNotMatch(navbar, /role === 'PARENT'/, 'no PARENT/CHILD switcher remains');
  assert.doesNotMatch(navbar, /setRole\(/, 'Navbar no longer changes the role');
  assert.match(navbar, /tabs\.dashboard/);
  assert.match(navbar, /tabs\.children/);
  assert.match(navbar, /tabs\.contacts/);
  assert.match(navbar, /tabs\.alerts/);
});

// ── R-M1-18: the two new screens hold no literal copy and no hard-coded RTL ─────────────────────
test('ChildScreen and ContactsScreen hold zero Arabic codepoints and no literal direction:rtl', () => {
  for (const file of ['src/components/ChildScreen.tsx', 'src/components/ContactsScreen.tsx']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /[\u0600-\u06FF]/, `${file} hardcodes Arabic — every string belongs to the catalog`);
    assert.doesNotMatch(source, /direction:\s*['"]?rtl/, `${file} sets RTL with a literal instead of the lang prop`);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, `${file} touches browser storage`);
    assert.match(source, /translate\(/, `${file} must read its copy through the catalog`);
  }
  const state = readFileSync(new URL('../../src/state/children.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(state, /localStorage|sessionStorage|indexedDB/, 'src/state/children.ts touches no browser storage');
});

// ── catalog: every key the new screens/state use is trilingual ──────────────────────────────────
test('every children/contacts/tabs key exists in Arabic, French and English', () => {
  const keys = [
    'children.title', 'children.serverShared', 'children.loading', 'children.noneShared',
    'children.loadFailed', 'children.sourceFromDevice', 'children.refresh', 'children.unnamedDevice',
    'children.selected', 'children.freshness.fresh', 'children.freshness.aging',
    'children.freshness.silent', 'children.freshness.none',
    'contacts.title', 'contacts.subtitle', 'contacts.child', 'contacts.guardians', 'contacts.count',
    'contacts.loading', 'contacts.loadFailed', 'contacts.actionFailed', 'contacts.none',
    'contacts.singleGuardian', 'contacts.adminOnlyList', 'contacts.available', 'contacts.add',
    'contacts.remove', 'contacts.noCandidates',
    'tabs.dashboard', 'tabs.children', 'tabs.contacts', 'nav.online', 'nav.offline',
    'zones.noChild',
  ];
  for (const key of keys) {
    const label = translate(key, 'ar');
    assert.ok(label.length > 0, `${key}.ar is blank`);
    assert.ok(translate(key, 'fr').length > 0, `${key}.fr is blank`);
    assert.ok(translate(key, 'en').length > 0, `${key}.en is blank`);
  }
  assert.equal(
    translate('children.sourceFromDevice', 'fr', { source: LAB.trackerA, reading: 'il y a 40 s' }),
    'de lab-tracker-a, il y a 40 s',
    'the label template substitutes the server source and the reading',
  );
});

// ── a ChildScreen render shows both server labels (the list is what the guardian reads) ─────────
test('ChildScreen renders one row per child with the server label and the selected marker', async () => {
  const client = readServer([DEVICE_A, DEVICE_B], { 11: [POS_A], 12: [POS_B] });
  const snapshot = await createChildrenController({
    client, identity: async () => ADMIN, lang: 'en', now: () => NOW,
  }).refresh();

  const html = renderToString(React.createElement(ChildScreen, {
    lang: 'en',
    loading: snapshot.loading,
    error: snapshot.error,
    children: snapshot.children,
    selectedId: 12,
    onSelect: () => {},
    onRefresh: () => {},
  }));

  assert.ok(html.includes('from lab-tracker-a, 40 s ago'), 'the first server label is rendered');
  assert.ok(html.includes('from lab-tracker-b, 3 s ago'), 'the second server label is rendered');
  assert.ok(html.includes('aria-pressed="true"'), 'the selected child is marked for assistive tech');
  assert.ok(html.includes(`…${LAB.imeiA.slice(-4)}`), 'the serial is shown as an ellipsis plus its last four');
  for (const serial of [LAB.imeiA, LAB.imeiB]) {
    assert.equal(html.includes(serial), false, `the full serial ${serial} must never be rendered`);
  }
  assert.ok(html.includes(translate('children.noneShared', 'en')) === false, 'a populated list says nothing about emptiness');
});

// ── a viewer sees the admin-only sentence, never a fake empty guardian list ─────────────────────
test('a viewer sees contacts.adminOnlyList — no list, no count, no add/remove', () => {
  const html = renderToString(React.createElement(ContactsScreen, {
    lang: 'ar',
    children: [childOf(DEVICE_A)],
    selectedId: 11,
    onSelectChild: () => {},
    guardians: [],
    candidates: [],
    summary: guardianSummary([]),
    loading: false,
    error: null,
    isAdmin: false,
    onAssign: () => {},
    onUnassign: () => {},
    onRefresh: () => {},
  }));

  assert.ok(html.includes(translate('contacts.adminOnlyList', 'ar')), 'the honest viewer sentence is shown');
  assert.equal(html.includes(translate('contacts.none', 'ar')), false,
    'a viewer who cannot read the list is never told "no guardian"');
  assert.equal(html.includes(translate('contacts.count', 'ar', { count: 0 })), false,
    'a count of 0 would claim a read the viewer never made');
  assert.equal(html.includes(translate('contacts.add', 'ar')), false, 'a viewer has no add control');
  assert.equal(html.includes(translate('contacts.remove', 'ar')), false, 'a viewer has no remove control');
});

// ── a failed read is named; it never becomes "nothing is shared" ────────────────────────────────
test('an error shows the failure and never the empty-state sentences it cannot verify', () => {
  const errorLine = translate('contacts.loadFailed', 'ar');
  const props = {
    lang: 'ar' as const,
    selectedId: 11,
    onSelectChild: () => {},
    guardians: [],
    candidates: [],
    summary: guardianSummary([]),
    loading: false,
    error: errorLine,
    isAdmin: true,
    onAssign: () => {},
    onUnassign: () => {},
    onRefresh: () => {},
  };

  const noChildren = renderToString(React.createElement(ContactsScreen, { ...props, children: [], selectedId: null }));
  assert.ok(noChildren.includes(errorLine), 'the failure is named');
  assert.equal(noChildren.includes(translate('children.noneShared', 'ar')), false,
    'a failed read is not "no child is shared"');

  const oneChild = renderToString(React.createElement(ContactsScreen, { ...props, children: [childOf(DEVICE_A)] }));
  assert.ok(oneChild.includes(errorLine), 'the failure is still named');
  assert.equal(oneChild.includes(translate('contacts.none', 'ar')), false,
    'a failed guardian read is not "no guardian"');
  assert.equal(oneChild.includes(translate('contacts.count', 'ar', { count: 0 })), false,
    'no count is claimed from a read that failed');
  assert.equal(oneChild.includes(translate('contacts.noCandidates', 'ar')), false,
    'a failed read is not "nobody is left to add"');
});

// ── an in-flight read claims nothing: no count, no "none", no candidate verdict ──────────────────
test('a loading guardian read shows the loading line and no verdict', () => {
  const props = {
    lang: 'ar' as const,
    selectedId: 11,
    onSelectChild: () => {},
    guardians: [],
    candidates: [],
    summary: guardianSummary([]),
    loading: true,
    error: null,
    isAdmin: true,
    onAssign: () => {},
    onUnassign: () => {},
    onRefresh: () => {},
  };

  const oneChild = renderToString(React.createElement(ContactsScreen, { ...props, children: [childOf(DEVICE_A)] }));
  assert.ok(oneChild.includes(translate('contacts.loading', 'ar')), 'the loading line is named');
  assert.equal(oneChild.includes(translate('contacts.count', 'ar', { count: 0 })), false,
    'no count is claimed before the read lands');
  assert.equal(oneChild.includes(translate('contacts.none', 'ar')), false,
    'an in-flight read is not "no guardian"');
  assert.equal(oneChild.includes(translate('contacts.noCandidates', 'ar')), false,
    'an in-flight read is not "nobody is left to add"');

  const noChildren = renderToString(React.createElement(ContactsScreen, { ...props, children: [], selectedId: null }));
  assert.equal(noChildren.includes(translate('contacts.child', 'ar')), false,
    'no empty "child" heading while the list is still loading');
  assert.equal(noChildren.includes(translate('children.noneShared', 'ar')), false,
    'a loading read is not "no child is shared"');
});

// ── helper ──────────────────────────────────────────────────────────────────────────────────────
function childOf(device: ServerDevice): Child {
  return { device, readings: null, label: noDataLabel('ar'), freshness: null };
}
