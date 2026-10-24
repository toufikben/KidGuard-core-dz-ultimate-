// tests/app/noLocalRecord.test.ts — Task 11 guards for the spec §1.5 deletions (R-M1-37..R-M1-42).
//
// Written BEFORE any deletion: at f21fd25 the seven deletion guards were RED — the role model, its
// translations, the simulation switches, the stub server and the record keys in App were still
// present — while the two runtime and two keep-list guards were already green. Each failure named
// the offending file and key/match, so the RED run (preserved as task-11-red.log in the SDD
// workspace) proves the guards are connected to the real tree, not to an empty glob. At HEAD all 11
// must be green.
//
// The 11 named tests:
//   (أ) runtime: saving a zone writes no local record
//   (أ) runtime: loading and selecting a child writes no local record
//   (ب) static: the role model is gone from src
//   (ب) static: the role copy is gone from the translation catalog
//   (ج) static: no simulation switch exists in src
//   (ج) static: SmsService claims no simulated method
//   (د) keep-list: the six services exist and are still imported
//   (د) keep-list: tests/core.test.ts still covers them
//   (و) the stub server is gone
//   (ز) the truth layer names none of the six record keys
//   (ح) App's only localStorage write is the language setting
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createTraccarClient, TraccarError } from '../../src/services/traccar/client.ts';
import type { TraccarClient } from '../../src/services/traccar/client.ts';
import { resetSession, signIn } from '../../src/services/traccar/session.ts';
import { createZoneService } from '../../src/services/traccar/zones.ts';
import {
  clearChildren,
  createChildrenController,
  pickSelectedChild,
} from '../../src/state/children.ts';
import type { ServerDevice, ServerPosition } from '../../src/services/traccar/types.ts';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const REPO = fileURLToPath(new URL('../../', import.meta.url));

const RECORD_KEYS = [
  'kidguard_role',
  'kidguard_safe_zones',
  'kidguard_device_pairing',
  'kidguard_protection_state',
  'kidguard_offline_queue',
  'kidguard_alert_history',
] as const;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function rel(path: string): string {
  return relative(REPO, path).replace(/\\/g, '/');
}

// ── shared fixtures: a recording globalThis.localStorage ─────────────────────────────────────────
type StorageSpy = { writes: string[]; reads: string[] };

let savedStorage: PropertyDescriptor | undefined;

function installStorageSpy(): StorageSpy {
  const spy: StorageSpy = { writes: [], reads: [] };
  const backing = new Map<string, string>();
  savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => {
        spy.reads.push(key);
        return backing.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        spy.writes.push(key);
        backing.set(key, String(value));
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
      clear: () => {
        backing.clear();
      },
      key: (index: number) => Array.from(backing.keys())[index] ?? null,
      get length() {
        return backing.size;
      },
    },
  });
  return spy;
}

function uninstallStorageSpy(): void {
  if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage);
  else delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  savedStorage = undefined;
}

// ── a tiny HTTP fake, adapted from tests/app/zones.test.ts (never imported) ─────────────────────
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
      resolve({
        log,
        url: `http://127.0.0.1:${port}/api`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

const EMAIL = 'lab-admin@example.com';
// A literal test password, never a lab secret.
const TEST_PASSWORD = 'literal-test-password';
const ADMIN_JSON = JSON.stringify({ id: 1, name: 'lab admin', email: EMAIL, administrator: true });
const POSTED_ROW = { id: 5, name: 'lab-zone', area: 'CIRCLE (36.7538 3.0588, 120)' };
const REREAD_ROW = { id: 5, name: 'lab-zone-reread', area: 'CIRCLE (36.7538 3.0588, 120)' };

// ── (أ) runtime: saving a zone writes no local record ───────────────────────────────────────────
test('(أ) saving a zone writes no local record', async () => {
  const spy = installStorageSpy();
  const srv = await withFakeTraccar((seen) => {
    const key = `${seen.method} ${seen.url.split('?')[0]}`;
    if (key === 'POST /api/session') return { status: 200, body: ADMIN_JSON };
    if (key === 'POST /api/geofences') return { status: 200, body: JSON.stringify(POSTED_ROW) };
    if (key === 'GET /api/notifications') {
      return { status: 200, body: '[{"id":1,"type":"geofenceExit","notificators":"web"}]' };
    }
    if (key === 'GET /api/geofences') return { status: 200, body: JSON.stringify([REREAD_ROW]) };
    return { status: 404 };
  });
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: TEST_PASSWORD });
    const client = createTraccarClient({
      baseUrl: srv.url,
      credentials: { email: EMAIL, password: TEST_PASSWORD },
    });
    const service = createZoneService({ client });
    const zones = await service.createZone({
      name: 'lab-zone',
      type: 'school',
      geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 120 },
    });
    assert.equal(zones.length, 1, 'the fake re-read row must come back');
    assert.deepEqual(
      spy.writes,
      [],
      `saving a zone wrote local records: ${spy.writes.join(', ') || '<none>'}`,
    );
    assert.deepEqual(
      spy.reads,
      [],
      `saving a zone read local records: ${spy.reads.join(', ') || '<none>'}`,
    );
  } finally {
    await srv.close();
    resetSession();
    uninstallStorageSpy();
  }
});

// ── (أ) runtime: loading and selecting a child writes no local record ───────────────────────────
type Call = { method: string; path: string; params?: Record<string, string | number>; body?: unknown };

function fakeClient(handler: (call: Call) => unknown): TraccarClient {
  const run = async (call: Call) => handler(call);
  return {
    get: <T>(path: string, params?: Record<string, string | number>) =>
      run({ method: 'GET', path, params }) as Promise<T>,
    post: <T>(path: string, body: unknown) => run({ method: 'POST', path, body }) as Promise<T>,
    put: <T>(path: string, body: unknown) => run({ method: 'PUT', path, body }) as Promise<T>,
    remove: (path: string, params?: Record<string, string | number>) =>
      run({ method: 'DELETE', path, params }) as Promise<null>,
    removeWithBody: <T>(path: string, body: unknown) =>
      run({ method: 'DELETE', path, body }) as Promise<T>,
    postForm: <T>(path: string, params: Record<string, string | number>) =>
      run({ method: 'POST_FORM', path, params }) as Promise<T>,
    postFormText: (path: string, params: Record<string, string | number>) =>
      run({ method: 'POST_FORM_TEXT', path, params }) as Promise<string>,
  };
}

const DEVICE_A: ServerDevice = { id: 11, name: 'lab-tracker-a', uniqueId: 'lab-serial-a-000000000011' };
const DEVICE_B: ServerDevice = { id: 12, name: 'lab-tracker-b', uniqueId: 'lab-serial-b-000000000012' };

function labPosition(id: number, deviceId: number, at: number): ServerPosition {
  return {
    id,
    deviceId,
    fixTime: new Date(at - 5_000).toISOString(),
    serverTime: new Date(at).toISOString(),
    latitude: 36.7538,
    longitude: 3.0588,
    speed: 0,
    course: 0,
    accuracy: 12,
    attributes: {},
  };
}

test('(أ) loading and selecting a child writes no local record', async () => {
  const spy = installStorageSpy();
  const now = Date.now();
  const positions: Record<number, ServerPosition[]> = {
    11: [labPosition(101, 11, now)],
    12: [labPosition(102, 12, now)],
  };
  const client = fakeClient((call) => {
    if (call.method === 'GET' && call.path === '/devices') return [DEVICE_A, DEVICE_B];
    if (call.method === 'GET' && call.path === '/positions') {
      return positions[Number(call.params?.deviceId)] ?? [];
    }
    throw new TraccarError('badpayload', 0, `unexpected ${call.method} ${call.path}`);
  });
  try {
    const snapshot = await createChildrenController({ client }).refresh();
    assert.equal(snapshot.error, null, `child load failed: ${snapshot.error ?? ''}`);
    assert.equal(snapshot.children.length, 2, 'two lab devices must become two children');
    const selected = pickSelectedChild(snapshot.children, DEVICE_B.id);
    assert.equal(selected?.device.id, DEVICE_B.id, 'the second child must be selected by its device id');
    assert.deepEqual(spy.writes, [], `child load/select wrote local records: ${spy.writes.join(', ') || '<none>'}`);
    assert.deepEqual(spy.reads, [], `child load/select read local records: ${spy.reads.join(', ') || '<none>'}`);

    clearChildren('ar');
    assert.deepEqual(spy.writes, [], `clearChildren wrote local records: ${spy.writes.join(', ') || '<none>'}`);
    assert.deepEqual(spy.reads, [], `clearChildren read local records: ${spy.reads.join(', ') || '<none>'}`);
  } finally {
    uninstallStorageSpy();
  }
});

// ── (ب) static: the role model is gone from src ─────────────────────────────────────────────────
const ROLE_PATTERN = /\bDeviceRole\b|\broleParent\b|\broleChild\b|['"]PARENT['"]|['"]CHILD['"]/g;

test('(ب) the role model is gone from src', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const text = read(file);
    for (const match of text.matchAll(ROLE_PATTERN)) offenders.push(`${rel(file)}: ${match[0]}`);
  }
  // The bare words are banned in these three files too (comments included, R-M1-41).
  for (const file of [
    'src/App.tsx',
    'src/components/Navbar.tsx',
    'src/components/SettingsModal.tsx',
  ]) {
    const text = read(join(REPO, file));
    for (const match of text.matchAll(/\bPARENT\b|\bCHILD\b/g)) offenders.push(`${file}: ${match[0]}`);
  }
  assert.deepEqual(offenders, [], `role-model references remain: ${offenders.join(' | ')}`);
});

// ── (ب) static: the role copy is gone from the translation catalog ─────────────────────────────
test('(ب) the role copy is gone from the translation catalog', () => {
  const text = read(join(SRC, 'translations', 'index.ts'));
  assert.doesNotMatch(text, /\broleParent\b/, 'src/translations/index.ts still defines roleParent');
  assert.doesNotMatch(text, /\broleChild\b/, 'src/translations/index.ts still defines roleChild');
});

// ── (ج) static: no simulation switch exists in src ─────────────────────────────────────────────
const SIMULATION_PATTERN =
  /\bisSimulatingOutside\b|\bsetIsSimulatingOutside\b|\btestModeEnabled\b|\bsetMockBatteryLevel\b|['"]simulated['"]/g;

test('(ج) no simulation switch exists in src', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const text = read(file);
    for (const match of text.matchAll(SIMULATION_PATTERN)) offenders.push(`${rel(file)}: ${match[0]}`);
  }
  assert.deepEqual(offenders, [], `simulation switches remain: ${offenders.join(' | ')}`);
});

// ── (ج) static: SmsService claims no simulated method ──────────────────────────────────────────
test('(ج) SmsService claims no simulated method', () => {
  const text = read(join(SRC, 'services', 'SmsService.ts'));
  assert.doesNotMatch(text, /simulated/, 'src/services/SmsService.ts still mentions `simulated`');
  assert.doesNotMatch(
    text,
    /method\?: 'direct_sms' \| 'sms_link' \| 'simulated'/,
    'src/services/SmsService.ts still declares the simulated union member',
  );
  assert.match(
    text,
    /method\?: 'direct_sms' \| 'sms_link';/,
    "the SmsService method union must be exactly 'direct_sms' | 'sms_link'",
  );
});

// ── (د) keep-list: the six services exist and are still imported ───────────────────────────────
const KEPT_SERVICES = [
  { name: 'GeofenceMonitor', path: 'services/GeofenceMonitor.ts', symbols: ['GeofenceMonitor'] },
  { name: 'RiskEngine', path: 'services/RiskEngine.ts', symbols: ['RiskEngine'] },
  { name: 'GpsFreshnessService', path: 'services/GpsFreshnessService.ts', symbols: ['GpsFreshnessService'] },
  { name: 'OfflineQueueService', path: 'services/OfflineQueueService.ts', symbols: ['OfflineQueueService'] },
  { name: 'AlertPolicyManager', path: 'services/AlertPolicyManager.ts', symbols: ['AlertPolicyManager'] },
  // The measured tree imports the exported singleton (lowercase), not the class symbol.
  { name: 'PrivacyDataService', path: 'services/PrivacyDataService.ts', symbols: ['PrivacyDataService', 'privacyDataService'] },
] as const;

test('(د) the six kept services exist and are still imported', () => {
  const problems: string[] = [];
  const sources = walk(SRC);
  for (const service of KEPT_SERVICES) {
    const file = join(SRC, service.path);
    if (!existsSync(file)) {
      problems.push(`${service.name}: missing ${rel(file)}`);
      continue;
    }
    if (!read(file).includes(`export class ${service.name}`)) {
      problems.push(`${service.name}: ${rel(file)} no longer exports class ${service.name}`);
    }
    const importerPattern = new RegExp(
      `import\\s*(?:type\\s*)?\\{[^}]*\\b(?:${service.symbols.join('|')})\\b[^}]*\\}\\s*from`,
    );
    const importers = sources.filter((candidate) => candidate !== file && importerPattern.test(read(candidate)));
    if (importers.length === 0) {
      problems.push(`${service.name}: no file under src imports ${service.symbols.join('/')}`);
    }
  }
  assert.deepEqual(problems, [], `keep-list services broken: ${problems.join(' | ')}`);
});

// ── (د) keep-list: tests/core.test.ts still covers the kept services ────────────────────────────
test('(د) tests/core.test.ts still covers the kept services', () => {
  const corePath = join(REPO, 'tests', 'core.test.ts');
  assert.equal(existsSync(corePath), true, 'tests/core.test.ts is missing');
  const text = read(corePath);
  for (const symbol of [
    'GeofenceMonitor',
    'RiskEngine',
    'GpsFreshnessService',
    'OfflineQueueService',
    'privacyDataService',
  ]) {
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}`).test(text);
    assert.equal(imported, true, `tests/core.test.ts no longer imports ${symbol}`);
  }
  assert.equal(
    text.trimEnd().endsWith("console.log('core unit tests passed');"),
    true,
    "tests/core.test.ts must still end with console.log('core unit tests passed');",
  );
});

// ── (و) the stub server is gone ────────────────────────────────────────────────────────────────
test('(و) the stub server is gone', () => {
  assert.equal(existsSync(join(REPO, 'server', 'index.mjs')), false, 'server/index.mjs still exists');
  assert.equal(existsSync(join(REPO, 'server')), false, 'the server/ directory still exists');
  const pkg = JSON.parse(read(join(REPO, 'package.json'))) as { scripts?: Record<string, string> };
  assert.equal(
    Object.prototype.hasOwnProperty.call(pkg.scripts ?? {}, 'server'),
    false,
    'package.json still declares a "server" script',
  );
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const text = read(file);
    if (/server\/index\.mjs|from\s+['"]\.\.\/server(?:[/'"]|$)/.test(text)) offenders.push(rel(file));
  }
  assert.deepEqual(offenders, [], `stub-server references remain: ${offenders.join(' | ')}`);
});

// ── (ز) the truth layer names none of the six record keys ──────────────────────────────────────
test('(ز) the truth layer names none of the six record keys', () => {
  const truthLayer = [
    join(SRC, 'App.tsx'),
    ...walk(join(SRC, 'state')),
    ...walk(join(SRC, 'services', 'traccar')),
    ...['ZonesScreen', 'ChildScreen', 'ContactsScreen', 'AlertsLog', 'Navbar', 'ParentDashboard']
      .map((name) => join(SRC, 'components', `${name}.tsx`)),
  ];
  const offenders: string[] = [];
  for (const file of truthLayer) {
    assert.equal(existsSync(file), true, `truth-layer file missing: ${rel(file)}`);
    const text = read(file);
    for (const key of RECORD_KEYS) {
      if (text.includes(key)) offenders.push(`${rel(file)}: ${key}`);
    }
  }
  assert.deepEqual(offenders, [], `record keys named in the truth layer: ${offenders.join(' | ')}`);
});

// ── (ح) App's only localStorage write is the language setting ──────────────────────────────────
test("(ح) App's only localStorage write is the language setting", () => {
  const text = read(join(SRC, 'App.tsx'));
  const calls = [...text.matchAll(/localStorage\.setItem\(\s*([^,)]+)/g)].map((match) => match[1].trim());
  const total = (text.match(/localStorage\.setItem\(/g) ?? []).length;
  assert.equal(total, 1, `src/App.tsx calls localStorage.setItem ${total} times; exactly one (LANG_KEY) is allowed`);
  assert.equal(calls.length, 1, `could not read the localStorage.setItem key: ${calls.join(', ')}`);
  assert.deepEqual(
    calls.filter((arg) => arg !== 'LANG_KEY'),
    [],
    `src/App.tsx writes local records: ${calls.filter((arg) => arg !== 'LANG_KEY').join(', ')}`,
  );
  assert.match(
    text,
    /const\s+LANG_KEY\s*=\s*'kidguard_lang';/,
    "src/App.tsx must still declare LANG_KEY = 'kidguard_lang'",
  );
});
