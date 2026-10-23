// tests/app/session.test.ts — Task 6 (الجلسة) against a FAKE server only.
// Every request is answered by a local node:http server in this file; the lab Traccar server is
// never contacted (it is down for this task anyway). Fake identities are lab-style
// (lab-guardian-a@example.com) and the "password"/"token" below are invented strings, never real.
//
// Brief letters (أ)…(ح) each get their own named test; R-M1-12 requires the mutation that targets
// every branch-pinning assertion to turn exactly that test red, which is recorded in the report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TraccarError } from '../../src/services/traccar/client.ts';
import {
  signIn,
  signOut,
  whoAmI,
  currentUser,
  mintSocketToken,
  revokeSocketToken,
  probeServerVersion,
  serverVersionLine,
  resetSession,
} from '../../src/services/traccar/session.ts';
import { createSessionController } from '../../src/state/session.ts';
import { LoginScreen } from '../../src/components/LoginScreen.tsx';
import { translate } from '../../src/translations/catalog.ts';

const EMAIL = 'lab-guardian-a@example.com';
const PASSWORD = 'sup3rs3cret';
const SERVER_PASSWORD_FIELD = 'a-not-real-stored-hash';
// The token shape mirrors the measured one (a base64url string, 007 §9: length 184, value never
// printed). This value is invented.
const FAKE_TOKEN = 'labfake-7JdK2mQ9xR4tY8pL1wZ6vB3nM5cX0aS9d';
const TOKEN_PREFIX = FAKE_TOKEN.slice(0, 7);
const EXPIRES_AT = '2026-11-01T00:00:00.000Z';

// What the app HOLDS for this user (the parsed shape, whitelisted by toServerUser).
const USER_FIELDS = { id: 7, name: 'lab guardian a', email: EMAIL, admin: true };
// What the SERVER sends, field-for-field as measured in 007 §1: the admin bit is named `administrator`
// on the wire. Traccar really does serialise a `password` field and a `totpKey` in the User it
// returns from POST /session — so the layer must strip them, not hand them onward.
const SERVER_USER_FIELDS = { id: 7, name: 'lab guardian a', email: EMAIL, administrator: true };
const USER_JSON = JSON.stringify({ ...SERVER_USER_FIELDS, password: SERVER_PASSWORD_FIELD, totpKey: 'NOTREAL', attributes: {} });

type Seen = { method: string; url: string; body: string; contentType: string; authorization: string | undefined };
type Outcome = { status: number; body?: string; contentType?: string };

function withFakeTraccar(route: (seen: Seen) => Outcome) {
  const log: Seen[] = [];
  return new Promise<{ log: Seen[]; url: string; close: () => Promise<void> }>((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const seen: Seen = {
          method: req.method ?? '',
          url: req.url ?? '',
          body,
          contentType: String(req.headers['content-type'] ?? ''),
          authorization: req.headers.authorization,
        };
        log.push(seen);
        const outcome = route(seen);
        res.writeHead(outcome.status, { 'content-type': outcome.contentType ?? 'application/json' });
        res.end(outcome.body ?? '');
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

// The measured happy path of every session route (POST/DELETE/GET /session, token mint + revoke).
// Anything else the app is not supposed to call answers 404, so an unexpected route shows up in the
// recorded log instead of silently succeeding.
const sessionRoutes = () =>
  (seen: Seen): Outcome => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: USER_JSON };
    if (seen.method === 'DELETE' && seen.url === '/api/session') return { status: 204, body: '' };
    if (seen.method === 'POST' && seen.url === '/api/session/token') {
      // 008 §3.1 measured the running server: the token body is a BARE STRING whose declared
      // content-type is `application/json`. A fake must not declare text/plain — that would let the
      // client look right for a reason the server does not give it.
      return { status: 200, body: FAKE_TOKEN, contentType: 'application/json' };
    }
    if (seen.method === 'POST' && seen.url === '/api/session/token/revoke') return { status: 204, body: '' };
    if (seen.method === 'GET' && seen.url.startsWith('/api/session')) return { status: 200, body: USER_JSON };
    return { status: 404, body: '' };
  };

// The same happy path, but with the identity route answered as the MEASURED 404 of R-M1-8
// (SessionResource.java:78-105). It has to be a separate router because sessionRoutes' sanctioned
// `GET /session?token=` rule answers 200 first, which would hide the very branch this test pins.
const sessionRoutesWithDeadIdentity = (seen: Seen): Outcome => {
  if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: USER_JSON };
  if (seen.method === 'DELETE' && seen.url === '/api/session') return { status: 204, body: '' };
  if (seen.method === 'POST' && seen.url === '/api/session/token') {
    return { status: 200, body: FAKE_TOKEN, contentType: 'application/json' }; // as measured in 008 §3.1
  }
  if (seen.method === 'POST' && seen.url === '/api/session/token/revoke') return { status: 204, body: '' };
  if (seen.method === 'GET' && seen.url.startsWith('/api/session')) {
    return { status: 404, body: '{"error":"HTTP 404 Not Found"}' };
  }
  return { status: 404, body: '' };
};

async function captureConsole<T>(run: () => Promise<T> | T): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const names = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;
  const originals = names.map((name) => console[name]);
  try {
    names.forEach((name, index) => {
      console[name] = ((...args: unknown[]) => {
        lines.push(args.map((arg) => (typeof arg === 'string' ? arg : `${String(arg)} ${JSON.stringify(arg)}`)).join(' '));
      }) as typeof console.log;
      void originals[index];
    });
    return { value: await run(), lines };
  } finally {
    names.forEach((name, index) => { console[name] = originals[index]; });
  }
}

// The storage spies are the only way (ج) can be proved at runtime: the session layer must not write
// a single record, and the recorded values are scanned for the password and the token anyway, so a
// later task that adds a legitimate write cannot smuggle a secret through.
type StorageRecord = { store: string; key: string; value: string };
function installStorageSpies(): StorageRecord[] {
  const records: StorageRecord[] = [];
  const make = (store: string, backing: Map<string, string>) => ({
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => { records.push({ store, key, value: String(value) }); backing.set(key, String(value)); },
    removeItem: (key: string) => { records.push({ store, key, value: '<removeItem>' }); backing.delete(key); },
    clear: () => { records.push({ store, key: '<clear>', value: '' }); backing.clear(); },
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    get length() { return backing.size; },
  });
  (globalThis as unknown as { localStorage: unknown }).localStorage = make('localStorage', new Map());
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = make('sessionStorage', new Map());
  return records;
}
function uninstallStorageSpies() {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  delete (globalThis as unknown as { sessionStorage?: unknown }).sessionStorage;
}

async function deadUrl(): Promise<string> {
  const srv = await withFakeTraccar(() => ({ status: 200, body: '{}' }));
  const url = srv.url;
  await srv.close();
  return url;
}

const SESSION_FILES = [
  'src/services/traccar/session.ts',
  'src/state/session.ts',
  'src/components/LoginScreen.tsx',
];
const readSource = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('session (أ): a successful sign-in hands on the server User and keeps the password out of every output', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    const printed = await captureConsole(() => signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD }));
    assert.deepEqual(printed.value, USER_FIELDS, 'only the fields the app may show, from the User POST /session returned');
    assert.ok(!('password' in printed.value), 'the User object must not carry the server password field');
    const posts = srv.log.filter((r) => r.method === 'POST' && r.url === '/api/session');
    assert.equal(posts.length, 1, 'sign-in makes exactly one request');
    assert.equal(posts[0].contentType, 'application/x-www-form-urlencoded', 'SessionResource.java:119-122 reads @FormParam, not JSON');
    assert.equal(posts[0].body, `email=${encodeURIComponent(EMAIL)}&password=${PASSWORD}`, 'the exact form body put on the wire');
    assert.doesNotMatch(JSON.stringify(printed.value), /password|totpKey|sup3rs3cret/i, JSON.stringify(printed.value));
    assert.equal(printed.lines.length, 0, `sign-in printed: ${printed.lines.join(' | ')}`);
  } finally { await srv.close(); resetSession(); }
});

// The live AC-2 run of Task 8 (2026-10-23) measured a User whose `administrator` was true yet whose
// parsed `admin` was undefined, because the wire name is `administrator` (007 §1). This pins both
// directions so the gate can never silently read a name the server does not send.
test('session (أ): the admin bit is read from the measured wire name `administrator`, not `admin`', async () => {
  resetSession();
  const srv = await withFakeTraccar((seen) =>
    seen.method === 'POST' && seen.url === '/api/session'
      ? { status: 200, body: JSON.stringify({ id: 9, email: EMAIL, administrator: true }) }
      : { status: 404, body: '' });
  try {
    const user = await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    assert.equal(user.admin, true, '6.16.0 sends `administrator`; reading only `admin` closed the gate on every real admin');
  } finally { await srv.close(); resetSession(); }
});

test('session (أ): an `admin` key alone does NOT confer administrator — the wire name is reverse-sensitive', async () => {
  resetSession();
  const srv = await withFakeTraccar((seen) =>
    seen.method === 'POST' && seen.url === '/api/session'
      ? { status: 200, body: JSON.stringify({ id: 9, email: EMAIL, admin: true }) }
      : { status: 404, body: '' });
  try {
    const user = await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    assert.equal(user.admin, undefined, 'the server field is `administrator`; `admin` is not evidence of anything');
  } finally { await srv.close(); resetSession(); }
});

test('session (أ): a sign-in that returns no usable User is refused as badpayload, never kept as a half identity', async () => {
  resetSession();
  const srv = await withFakeTraccar(() => ({ status: 200, body: '{"name":"lab guardian a"}' }));
  try {
    const error = await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD }).catch((e) => e as Error);
    assert.ok(error instanceof TraccarError, `expected a TraccarError, got ${String(error)}`);
    assert.equal((error as TraccarError).kind, 'badpayload');
    assert.doesNotMatch(error.message, /sup3rs3cret|password/i, error.message);
    assert.equal(currentUser(), null, 'a refused sign-in must leave no identity behind');
  } finally { await srv.close(); resetSession(); }
});

test('session (ب): a 401 lands as failed(unauthorized) with one Arabic catalog line, not the server body', async () => {
  resetSession();
  const srv = await withFakeTraccar(() => ({ status: 401, body: '{"error":"Unauthorized login for lab-guardian-a@example.com"}' }));
  try {
    const controller = createSessionController();
    const printed = await captureConsole(() => controller.signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD }));
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'failed');
    assert.equal(snapshot.kind, 'unauthorized');
    assert.equal(snapshot.message, translate('session.unauthorized', 'ar'));
    assert.match(snapshot.message ?? '', /غير صحيحة/);
    assert.doesNotMatch(snapshot.message ?? '', /Unauthorized|lab-guardian|sup3rs3cret/i, snapshot.message ?? '');
    assert.equal(snapshot.user, null);
    assert.equal(printed.lines.length, 0, `a failed sign-in printed: ${printed.lines.join(' | ')}`);
  } finally { await srv.close(); resetSession(); }
});

test('session (ب): the login screen prints the catalog failure line, so a failure reads as a failure', async () => {
  resetSession();
  const srv = await withFakeTraccar(() => ({ status: 401, body: '{"error":"Unauthorized login"}' }));
  try {
    const controller = createSessionController();
    await controller.signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const html = renderToString(React.createElement(LoginScreen, { baseUrl: srv.url, controller }));
    assert.ok(html.includes(translate('session.unauthorized', 'ar')), html);
    assert.doesNotMatch(html, /Unauthorized/i, html);
    assert.doesNotMatch(html, /بأمان|safe|guaranteed|حيّ/i, html);
  } finally { await srv.close(); resetSession(); }
});

test('session (ج): the session layer writes nothing at all to sessionStorage or localStorage', async () => {
  resetSession();
  const records = installStorageSpies();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    const controller = createSessionController();
    await controller.signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    await mintSocketToken(EXPIRES_AT);
    await controller.signOut();
    await controller.signIn({ baseUrl: srv.url, email: EMAIL, password: 'wrong-on-purpose' });
    const dumped = records.map((r) => `${r.store}.${r.key}=${r.value}`).join('\n');
    assert.equal(records.length, 0, `the session layer wrote to browser storage: ${dumped}`);
    assert.doesNotMatch(dumped, /sup3rs3cret|password|labfake/i, dumped);
  } finally { await srv.close(); uninstallStorageSpies(); resetSession(); }
});

test('session (ج): none of the three session files even names a browser storage', () => {
  for (const file of SESSION_FILES) {
    assert.doesNotMatch(readSource(file), /localStorage|sessionStorage|indexedDB/, `${file} touches a browser storage`);
  }
});

test('session (د): an unreachable server says no data from the server, never that the child is safe', async () => {
  resetSession();
  const controller = createSessionController();
  const snapshot = await controller.signIn({ baseUrl: await deadUrl(), email: EMAIL, password: PASSWORD });
  assert.equal(snapshot.status, 'failed');
  assert.equal(snapshot.kind, 'network');
  assert.match(snapshot.message ?? '', /لا بيانات من الخادم/);
  assert.doesNotMatch(snapshot.message ?? '', /بأمان|safe|guaranteed|live/i, snapshot.message ?? '');
  assert.equal(snapshot.user, null);
  resetSession();
});

test('session (هـ): signOut calls DELETE /api/session exactly once', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    srv.log.length = 0;
    await signOut();
    assert.deepEqual(srv.log.filter((r) => r.method === 'DELETE').map((r) => r.url), ['/api/session']);
    assert.equal(currentUser(), null, 'signing out drops the in-memory identity');
  } finally { await srv.close(); resetSession(); }
});

test('session (هـ): signing out with no session asks the server nothing', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signOut();
    assert.deepEqual(srv.log, [], 'a sign-out with no session must not invent a request');
  } finally { await srv.close(); }
});

test('session (هـ): signing out revokes a live socket token instead of leaving it valid for hours', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    await mintSocketToken(EXPIRES_AT);
    srv.log.length = 0;
    await signOut();
    const revoked = srv.log.filter((r) => r.url === '/api/session/token/revoke');
    assert.deepEqual(revoked.map((r) => r.body), [`token=${FAKE_TOKEN}`]);
    assert.deepEqual(srv.log.filter((r) => r.url === '/api/session').map((r) => r.method), ['DELETE']);
  } finally { await srv.close(); resetSession(); }
});

test('session (و): mintSocketToken returns the bare-string token (declared application/json, 008 §3.1) and never lets it into a printed line', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const printed = await captureConsole(() => mintSocketToken(EXPIRES_AT));
    assert.equal(printed.value, FAKE_TOKEN, 'the bare token text, trimmed (the 007 probe round-tripped it verbatim)');
    assert.equal(printed.lines.length, 0, `the mint printed: ${printed.lines.join(' | ')}`);
    const mint = srv.log.find((r) => r.url === '/api/session/token');
    assert.ok(mint, 'no mint request was made');
    assert.equal(mint.contentType, 'application/x-www-form-urlencoded');
    assert.equal(mint.body, `expiration=${encodeURIComponent(EXPIRES_AT)}`, 'the literal form body the server reads');
  } finally { await srv.close(); resetSession(); }
});

test('session (و): a failed mint carries no token in any message, and leaves none in memory', async () => {
  resetSession();
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: USER_JSON };
    if (seen.url.startsWith('/api/session')) return { status: 401, body: '{"error":"Unauthorized login"}' };
    return { status: 404, body: '' };
  });
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const error = await mintSocketToken(EXPIRES_AT).catch((e) => e as Error);
    assert.ok(error instanceof TraccarError, `expected a TraccarError, got ${String(error)}`);
    assert.equal((error as TraccarError).kind, 'unauthorized');
    const shown = `${error.message} ${String(error)} ${JSON.stringify({ ...error, kind: (error as TraccarError).kind })}`;
    assert.doesNotMatch(shown, new RegExp(TOKEN_PREFIX), shown);
    assert.doesNotMatch(shown, /labfake|expiration=/i, shown);
    srv.log.length = 0;
    // The failed mint recorded nothing: whoAmI still rides the sanctioned POST /session source and
    // therefore makes no request at all (no token to verify with).
    assert.deepEqual(await whoAmI(), USER_FIELDS);
    assert.equal(srv.log.length, 0, srv.log.map((r) => `${r.method} ${r.url}`).join(', '));
  } finally { await srv.close(); resetSession(); }
});

test('session (و): minting without a session is refused before any request goes out', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    const error = await mintSocketToken(EXPIRES_AT).catch((e) => e as Error);
    assert.ok(error instanceof TraccarError, `expected a TraccarError, got ${String(error)}`);
    assert.equal((error as TraccarError).kind, 'unauthorized');
    assert.equal(srv.log.length, 0, 'no credential, no request');
  } finally { await srv.close(); }
});

test('session (و): an expiration that is not a future instant is refused before any request', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    srv.log.length = 0;
    for (const bad of ['not-a-date', Number.NaN, 0, '2000-01-01T00:00:00.000Z']) {
      await assert.rejects(() => mintSocketToken(bad as unknown as string), /expiration/, `${String(bad)} was accepted`);
    }
    assert.equal(srv.log.length, 0, 'a dead expiration must never reach the server');
  } finally { await srv.close(); resetSession(); }
});

test('session (و): the session snapshot never carries the minted token', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    const controller = createSessionController();
    await controller.signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const token = await mintSocketToken(EXPIRES_AT);
    // Sampled while the token is live, and again after an identity round-trip that used it — the
    // second sample alone would pass even if the service handed the token onward, because whoAmI
    // rebuilds the User from the server response. R-M1-12 proved this with the mutation recorded in
    // the task-6 report (mintSocketToken also attaching the token to the user record).
    const liveJson = JSON.stringify(controller.getSnapshot());
    srv.log.length = 0;
    await controller.refresh();
    assert.deepEqual(srv.log.map((r) => r.url), [`/api/session?token=${token}`], 'the token was live for this snapshot');
    const afterJson = JSON.stringify(controller.getSnapshot());
    for (const [label, json] of [['live', liveJson], ['after refresh', afterJson]] as const) {
      assert.doesNotMatch(json, new RegExp(TOKEN_PREFIX), `${label}: ${json}`);
      assert.doesNotMatch(json, /labfake/, `${label}: ${json}`);
      assert.doesNotMatch(json, /sup3rs3cret|password/i, `${label}: ${json}`);
    }
    assert.equal(controller.getSnapshot().status, 'signed-in', afterJson);
  } finally { await srv.close(); resetSession(); }
});

test('session (و): a 200 mint that returns an empty body is refused, never stored as a token', async () => {
  resetSession();
  const srv = await withFakeTraccar((seen) => {
    if (seen.method === 'POST' && seen.url === '/api/session') return { status: 200, body: USER_JSON };
    if (seen.method === 'POST' && seen.url === '/api/session/token') return { status: 200, body: '' };
    return { status: 404, body: '' };
  });
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const error = await mintSocketToken(EXPIRES_AT).catch((e) => e as Error);
    assert.ok(error instanceof TraccarError, `expected a TraccarError, got ${String(error)}`);
    assert.equal((error as TraccarError).kind, 'badpayload', error.message);
    // An empty string must not become the identity route either: with no token stored, whoAmI falls
    // back to the sanctioned POST /session User and asks the server nothing.
    srv.log.length = 0;
    assert.deepEqual(await whoAmI(), USER_FIELDS);
    assert.equal(srv.log.length, 0, srv.log.map((r) => `${r.method} ${r.url}`).join(', '));
  } finally { await srv.close(); resetSession(); }
});

test('session (و): revokeSocketToken posts the token as a form field, not as JSON', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const token = await mintSocketToken(EXPIRES_AT);
    srv.log.length = 0;
    await revokeSocketToken(token);
    const revoke = srv.log.find((r) => r.url === '/api/session/token/revoke');
    assert.ok(revoke, 'no revoke request was made');
    assert.equal(revoke.method, 'POST');
    assert.equal(revoke.contentType, 'application/x-www-form-urlencoded');
    assert.equal(revoke.body, `token=${token}`);
  } finally { await srv.close(); resetSession(); }
});

test('session (و): revoking without a session is refused before any request goes out', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    const error = await revokeSocketToken(FAKE_TOKEN).catch((e) => e as Error);
    assert.ok(error instanceof TraccarError, `expected a TraccarError, got ${String(error)}`);
    assert.equal((error as TraccarError).kind, 'unauthorized');
    assert.equal(srv.log.length, 0, srv.log.map((r) => `${r.method} ${r.url}`).join(', '));
  } finally { await srv.close(); }
});

test('session (ز) R-M1-8: whoAmI verifies through GET /session?token=, never through a Basic-only GET', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const token = await mintSocketToken(EXPIRES_AT);
    srv.log.length = 0;
    assert.deepEqual(await whoAmI(), USER_FIELDS);
    assert.equal(srv.log.length, 1, srv.log.map((r) => `${r.method} ${r.url}`).join(', '));
    const [request] = srv.log;
    assert.equal(request.method, 'GET');
    const url = new URL(request.url, 'http://127.0.0.1');
    assert.equal(url.pathname, '/api/session');
    assert.equal(url.searchParams.get('token'), token, 'R-M1-8: identity rides on the minted token or on nothing');
  } finally { await srv.close(); resetSession(); }
});

test('session (ز) R-M1-8: with no minted token whoAmI reuses the User POST /session returned and sends nothing', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    srv.log.length = 0;
    assert.deepEqual(await whoAmI(), USER_FIELDS);
    // GET /api/session under a Basic header alone is a MEASURED 404 (SessionResource.java:78-105),
    // so the only honest no-token behaviour is to make no request at all.
    assert.equal(srv.log.length, 0, srv.log.map((r) => `${r.method} ${r.url}`).join(', '));
  } finally { await srv.close(); resetSession(); }
});

test('session (ز): the measured 404 fails as notfound and never routes through an assume-the-guardian-locally branch', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutesWithDeadIdentity);
  try {
    const controller = createSessionController();
    await controller.signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    await mintSocketToken(EXPIRES_AT);
    assert.equal(controller.getSnapshot().status, 'signed-in');
    srv.log.length = 0;
    const snapshot = await controller.refresh();
    assert.equal(snapshot.status, 'failed');
    assert.equal(snapshot.kind, 'notfound');
    assert.equal(snapshot.user, null, 'a 404 must leave NO identity on screen — there is no local guardian to fall back on');
    assert.deepEqual(
      srv.log.map((r) => `${r.method} ${r.url}`),
      [`GET /api/session?token=${FAKE_TOKEN}`],
      'exactly the one sanctioned identity request, no other route consulted',
    );
  } finally { await srv.close(); resetSession(); }
});

test('session (ح): the token routes ride the Task 3 client only — session.ts opens no second request path', () => {
  const source = readSource('src/services/traccar/session.ts');
  assert.match(source, /from '\.\/client\.ts'/, 'session.ts must build its client from Task 3');
  assert.match(source, /postFormText[<(]/, 'the mint must go through the client form path');
  assert.match(source, /postForm<null>\(\s*['"]\/session\/token\/revoke['"]/, 'the revoke must go through the client form path');
  assert.doesNotMatch(source, /(?:^|[^.\w])fetch\s*\(/m, 'a parallel raw fetch would lose the client timeout and the secret-free errors');
  for (const file of SESSION_FILES) {
    assert.doesNotMatch(readSource(file), /console\./, `${file} must not log`);
  }
});

test('session (ح): the token text body is read by the client, so it is never rejected as badpayload', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const token = await mintSocketToken(EXPIRES_AT);
    assert.equal(token, FAKE_TOKEN);
    const mint = srv.log.filter((r) => r.url === '/api/session/token');
    assert.equal(mint.length, 1);
    assert.equal(mint[0].contentType, 'application/x-www-form-urlencoded');
    assert.doesNotMatch(mint[0].contentType, /json/i, mint[0].contentType);
  } finally { await srv.close(); resetSession(); }
});

test('session (ز) R-M1-8: with no session at all whoAmI refuses instead of asking or assuming', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    const error = await whoAmI().catch((e) => e as Error);
    assert.ok(error instanceof TraccarError, `expected a TraccarError, got ${String(error)}`);
    assert.equal((error as TraccarError).kind, 'unauthorized');
    // The two forbidden alternatives both show up here: no Basic-only GET /session (the measured 404)
    // and no silent local identity.
    assert.equal(srv.log.length, 0, srv.log.map((r) => `${r.method} ${r.url}`).join(', '));
    assert.equal(currentUser(), null);
  } finally { await srv.close(); }
});

test('session (Step 3): LoginScreen renders two fields and one button in RTL, with no remembered password', async () => {
  resetSession();
  const controller = createSessionController();
  const html = renderToString(React.createElement(LoginScreen, { baseUrl: '/api', controller }));
  assert.match(html, /dir="rtl"/, 'Arabic is the default language');
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"/);
  assert.ok(html.includes(translate('session.signIn', 'ar')), html);
  assert.ok(html.includes(translate('login.serverUnknown', 'ar')), `the footer must not invent a version: ${html}`);
  assert.doesNotMatch(html, /type="checkbox"|تذكرني|remember\s*me/i, html);
  assert.doesNotMatch(html, /sup3rs3cret/, html);
});

test('session (Step 3): the footer prints a verified server version and degrades when the server cannot be read', async () => {
  resetSession();
  const srv = await withFakeTraccar(() => ({ status: 200, body: '{"version":"6.16.0"}' }));
  try {
    assert.equal(await probeServerVersion(srv.url), '6.16.0');
    assert.equal(serverVersionLine('6.16.0', 'ar'), translate('login.serverVersion', 'ar', { version: '6.16.0' }));
    assert.ok(serverVersionLine('6.16.0', 'ar').includes('6.16.0'));
  } finally { await srv.close(); }

  const blank = await withFakeTraccar(() => ({ status: 200, body: '{"version":""}' }));
  try { assert.equal(await probeServerVersion(blank.url), null, 'an empty version is not a verified version'); }
  finally { await blank.close(); }

  const broken = await withFakeTraccar(() => ({ status: 500, body: 'boom' }));
  try { assert.equal(await probeServerVersion(broken.url), null); } finally { await broken.close(); }

  assert.equal(await probeServerVersion(await deadUrl()), null, 'a dead server is unknown, not a thrown screen');
  assert.equal(serverVersionLine(null, 'ar'), translate('login.serverUnknown', 'ar'));
  for (const unusable of ['', '   ', `${'x'.repeat(200)}`, Number.NaN as unknown as string, undefined as unknown as string]) {
    assert.equal(serverVersionLine(unusable, 'ar'), translate('login.serverUnknown', 'ar'), String(unusable));
  }
  assert.doesNotMatch(serverVersionLine(Number.NaN as unknown as string, 'ar'), /NaN/);
});

test('session (صدق): no session or login copy claims the child is live, safe, or guaranteed', async () => {
  const { catalog } = await import('../../src/translations/catalog.ts');
  const keys = Object.keys(catalog).filter((key) => key.startsWith('session.') || key.startsWith('login.'));
  assert.ok(keys.length >= 8, `expected session/login copy, found ${keys.join(', ')}`);
  for (const key of keys) {
    for (const lang of ['ar', 'fr', 'en'] as const) {
      assert.doesNotMatch(catalog[key][lang], /حيّ|مضمون|بأمان|آمن الآن|live|safe|guaranteed/i, `${key}.${lang}`);
    }
  }
});
