// tests/app/socket.test.ts — Task 10, Step 1 (و) and (ح) on the socket side: the live channel, the
// announced fallback, the one-time disconnect, the polling cadence, the token lifecycle, and the
// rule that no error this layer builds carries a token or a URL.
//
// The socket, the clock and the client are all injected: no browser, no real Traccar, no real timer
// longer than a few milliseconds. The live AC-3 run (Step 4) is a separate human measurement and is
// NOT simulated here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { TraccarClient } from '../../src/services/traccar/client.ts';
import type { ServerPosition } from '../../src/services/traccar/types.ts';
import {
  connectLive,
  LIVE_POLL_INTERVAL_MS,
  socketUrl,
  type ConnectionState,
  type LiveHandle,
  type LiveSocket,
} from '../../src/services/traccar/socket.ts';
import {
  activeServerBaseUrl,
  resetSession,
  signIn,
} from '../../src/services/traccar/session.ts';

// Invented lab values; never a real credential. The punctuation is deliberate: the token rides in a
// query parameter and must be percent-encoded exactly once.
const TOKEN = 'labfake+7Jd/K2m=Q9xR4tY8pL';
const TOKEN_PREFIX = TOKEN.slice(0, 7);
const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const isoAgo = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

// ── fakes ───────────────────────────────────────────────────────────────────────────────────────
type Call = { method: string; path: string; params?: Record<string, string | number>; body?: unknown };

function fakeClient(handler: (call: Call) => unknown): TraccarClient & { calls: Call[] } {
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

const position = (over: Partial<ServerPosition> = {}): ServerPosition => ({
  id: 900,
  deviceId: 11,
  fixTime: isoAgo(3),
  serverTime: new Date(NOW).toISOString(),
  latitude: 36.7538,
  longitude: 3.0588,
  speed: 0,
  course: 0,
  accuracy: 10,
  geofenceIds: [],
  attributes: {},
  ...over,
});

type FakeSocket = LiveSocket & { url: string; closed: boolean; emit: (data: unknown) => void };

function socketFactory() {
  const sockets: FakeSocket[] = [];
  const create = (url: string): LiveSocket => {
    const socket: FakeSocket = {
      url,
      closed: false,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: () => { socket.closed = true; },
      emit: (data: unknown) => {
        socket.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
      },
    };
    sockets.push(socket);
    return socket;
  };
  return { sockets, create };
}

const delay = (ms: number) => new Promise<void>((done) => { setTimeout(done, ms); });

async function captureConsole<T>(run: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const names = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;
  const originals = names.map((name) => console[name]);
  try {
    names.forEach((name) => {
      console[name] = ((...args: unknown[]) => {
        lines.push(args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' '));
      }) as typeof console.log;
    });
    return { value: await run(), lines };
  } finally {
    names.forEach((name, index) => { console[name] = originals[index]; });
  }
}

// A live handle always carries a token internally; tests close every handle they open so the
// injected revoke sees it and no timer survives the test.
async function closeQuietly(handle: LiveHandle | null): Promise<void> {
  handle?.close();
  await delay(5);
}

// ── URL: ws(s) from the server base, token in the query, encoded once ───────────────────────────
test('the socket URL is wss for an https base and ws for an http base, with an encoded token', async () => {
  const { sockets, create } = socketFactory();
  const client = fakeClient(() => []);
  let handle: LiveHandle | null = null;
  try {
    handle = await connectLive({
      baseUrl: 'https://lab.example/api',
      mintToken: async () => TOKEN,
      client,
      createSocket: create,
      revokeToken: async () => {},
      pollIntervalMs: 10_000,
    });
    assert.equal(sockets.length, 1);
    const url = new URL(sockets[0].url);
    assert.equal(url.protocol, 'wss:', 'an https server gets a wss socket');
    assert.equal(url.pathname, '/api/socket');
    assert.equal(url.searchParams.get('token'), TOKEN, 'the token round-trips through the query');
    assert.ok(sockets[0].url.includes(`token=${encodeURIComponent(TOKEN)}`),
      'the token is percent-encoded, not pasted raw');
  } finally {
    await closeQuietly(handle);
  }

  const httpCase = socketFactory();
  let httpHandle: LiveHandle | null = null;
  try {
    httpHandle = await connectLive({
      baseUrl: 'http://lab.example:8082/api/',
      mintToken: async () => TOKEN,
      client,
      createSocket: httpCase.create,
      revokeToken: async () => {},
      pollIntervalMs: 10_000,
    });
    const url = new URL(httpCase.sockets[0].url);
    assert.equal(url.protocol, 'ws:', 'an http server gets a ws socket');
    assert.equal(url.pathname, '/api/socket', 'a trailing slash on the base does not double the path');
  } finally {
    await closeQuietly(httpHandle);
  }

  assert.equal(LIVE_POLL_INTERVAL_MS, 15_000, 'the announced fallback is a 15 s poll (§4)');
  assert.equal(socketUrl('http://lab.example/api', 'a b').endsWith('token=a+b'),
    true, 'URLSearchParams encodes a space as + on the wire');
});

// ── frames: events and positions reach their callbacks; junk is ignored silently ───────────────
test('frames are read by envelope; an event without attributes.message is still delivered', async () => {
  const { sockets, create } = socketFactory();
  const client = fakeClient(() => []);
  const events: unknown[] = [];
  const deliveries: ServerPosition[][] = [];
  let handle: LiveHandle | null = null;
  try {
    handle = await connectLive({
      baseUrl: 'http://lab.example/api',
      mintToken: async () => TOKEN,
      client,
      createSocket: create,
      revokeToken: async () => {},
      pollIntervalMs: 10_000,
      onEvent: (event) => events.push(event),
      onPositions: (rows) => deliveries.push(rows),
    });

    sockets[0].onopen?.();
    assert.equal(handle.state(), 'live');

    assert.doesNotThrow(() => sockets[0].emit({
      events: [{ id: 501, type: 'geofenceExit', eventTime: isoAgo(5), deviceId: 11, geofenceId: 7 }],
    }), 'the measured envelope has no attributes.message and must not throw');
    assert.equal(events.length, 1);
    assert.equal((events[0] as { type?: string }).type, 'geofenceExit');

    sockets[0].emit({ positions: [position()] });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].length, 1);

    assert.doesNotThrow(() => sockets[0].emit('this is not json'));
    assert.doesNotThrow(() => sockets[0].emit({ events: 'not a list' }));
    assert.doesNotThrow(() => sockets[0].emit({ devices: [{ id: 1, name: 'lab-ignored' }] }));
    assert.equal(events.length, 1, 'junk frames add no event');
  } finally {
    await closeQuietly(handle);
  }
});

// ── fallback: one announcement, polling starts, no historical window ───────────────────────────
test('a socket error announces once and starts the announced /positions polling', async () => {
  const { sockets, create } = socketFactory();
  const client = fakeClient((call) => {
    if (call.method === 'GET' && call.path === '/positions') return [position()];
    throw new Error(`unexpected ${call.method} ${call.path}`);
  });
  const states: ConnectionState[] = [];
  let disconnects = 0;
  let delivered = 0;
  let handle: LiveHandle | null = null;
  try {
    handle = await connectLive({
      baseUrl: 'http://lab.example/api',
      mintToken: async () => TOKEN,
      client,
      createSocket: create,
      revokeToken: async () => {},
      pollIntervalMs: 15,
      onDisconnect: () => { disconnects += 1; },
      onState: (state) => states.push(state),
      onPositions: (rows) => { delivered += rows.length; },
    });

    sockets[0].onerror?.(new Error('lab socket error'));
    assert.equal(disconnects, 1, 'the fallback is announced exactly once');
    sockets[0].onclose?.();
    assert.equal(disconnects, 1, 'close after error does not announce a second fallback');
    assert.ok(states.includes('fallback'));

    await delay(60);
    const polls = client.calls.filter((call) => call.method === 'GET' && call.path === '/positions');
    assert.ok(polls.length >= 2, `the fallback polls repeatedly (saw ${polls.length})`);
    assert.ok(delivered >= 1, 'polled positions reach onPositions');

    assert.equal(client.calls.some((call) => call.path === '/events'), false,
      'no historical events route exists (R-M1-9)');
    for (const call of client.calls) {
      assert.equal(Object.hasOwn(call.params ?? {}, 'from'), false, 'no request carries from');
      assert.equal(Object.hasOwn(call.params ?? {}, 'to'), false, 'no request carries to');
    }
    assert.equal(handle.state(), 'fallback');
  } finally {
    await closeQuietly(handle);
  }
});

test('a failed poll does not stop the fallback and is never surfaced', async () => {
  const { sockets, create } = socketFactory();
  const client = fakeClient(() => { throw new Error('lab server down'); });
  let disconnects = 0;
  let handle: LiveHandle | null = null;
  const printed = await captureConsole(async () => {
    handle = await connectLive({
      baseUrl: 'http://lab.example/api',
      mintToken: async () => TOKEN,
      client,
      createSocket: create,
      revokeToken: async () => {},
      pollIntervalMs: 10,
      onDisconnect: () => { disconnects += 1; },
    });
    sockets[0].onerror?.();
    await delay(45);
    return handle;
  });
  try {
    assert.equal(disconnects, 1);
    assert.equal(printed.lines.length, 0, `the socket layer printed: ${printed.lines.join(' | ')}`);
    assert.ok(client.calls.length >= 2, 'the poll timer kept running after failed reads');
  } finally {
    await closeQuietly(printed.value);
  }
});

// ── leaving the screen: close, cancel the timer, revoke the token exactly once ─────────────────
test('close() closes the socket, cancels polling and revokes the token once without throwing', async () => {
  const { sockets, create } = socketFactory();
  const client = fakeClient(() => [position()]);
  const revoked: string[] = [];
  let disconnects = 0;
  const handle = await connectLive({
    baseUrl: 'http://lab.example/api',
    mintToken: async () => TOKEN,
    client,
    createSocket: create,
    revokeToken: async (token) => {
      revoked.push(token);
      throw new Error('lab revoke refused');
    },
    pollIntervalMs: 15,
    onDisconnect: () => { disconnects += 1; },
  });

  sockets[0].onerror?.();               // fall back and start the timer
  await delay(35);
  const beforeClose = client.calls.length;
  assert.doesNotThrow(() => handle.close(), 'a refused revoke must not throw into the screen');
  assert.equal(sockets[0].closed, true, 'the socket is closed');
  assert.equal(disconnects, 1, 'leaving the screen is not a new disconnect announcement');
  await delay(10);
  assert.deepEqual(revoked, [TOKEN], 'the minted token is revoked exactly once');
  assert.equal(handle.state(), 'closed');

  const afterClose = client.calls.length;
  assert.ok(afterClose >= beforeClose);
  await delay(60);
  assert.equal(client.calls.length, afterClose, 'the fallback timer is cancelled on close');

  handle.close();
  await delay(10);
  assert.deepEqual(revoked, [TOKEN], 'close is idempotent — one socket, one revoke');
});

// ── no error this layer builds carries the token or the URL ────────────────────────────────────
test('no failure message carries the token or the socket URL', async () => {
  const { sockets, create } = socketFactory();

  // (1) No server address at all: the one error this layer builds is generic.
  await assert.rejects(
    () => connectLive({ baseUrl: null, mintToken: async () => TOKEN, createSocket: create }),
    (error: unknown) => {
      const shown = `${(error as Error).message} ${String(error)}`;
      assert.equal(shown.includes(TOKEN_PREFIX), false, `leaked the token prefix: ${shown}`);
      assert.doesNotMatch(shown, /token=|wss?:\/\//i, shown);
      return true;
    },
  );
  assert.equal(sockets.length, 0, 'no socket was built without a base');

  // (2) A socket factory that throws a message containing the full URL (and therefore the token).
  let disconnects = 0;
  let leakedHandle: LiveHandle | null = null;
  const printed = await captureConsole(async () => {
    leakedHandle = await connectLive({
      baseUrl: 'http://lab.example/api',
      mintToken: async () => TOKEN,
      client: fakeClient(() => []),
      createSocket: (url: string) => { throw new Error(`could not open ${url}`); },
      revokeToken: async () => {},
      pollIntervalMs: 10_000,
      onDisconnect: () => { disconnects += 1; },
    });
    return leakedHandle;
  });
  try {
    assert.equal(disconnects, 1, 'a socket that cannot open is announced');
    assert.equal(printed.lines.length, 0, `a URL-bearing error was printed: ${printed.lines.join(' | ')}`);
    assert.doesNotMatch(JSON.stringify(Object.keys(printed.value)), /token/i, 'the handle exposes no token');
    assert.equal(String(printed.value).includes(TOKEN_PREFIX), false);
  } finally {
    await closeQuietly(printed.value);
  }

  // (3) A mint failure whose message (injected) contains the token is swallowed into the fallback.
  let mintDisconnects = 0;
  let mintHandle: LiveHandle | null = null;
  const mintPrinted = await captureConsole(async () => {
    mintHandle = await connectLive({
      baseUrl: 'http://lab.example/api',
      mintToken: async () => { throw new Error(`mint failed for ${TOKEN}`); },
      client: fakeClient(() => []),
      createSocket: create,
      revokeToken: async () => {},
      pollIntervalMs: 10_000,
      onDisconnect: () => { mintDisconnects += 1; },
    });
    return mintHandle;
  });
  try {
    assert.equal(mintDisconnects, 1, 'a failed mint falls back and says so');
    assert.equal(mintPrinted.lines.length, 0, `a token-bearing mint error was printed: ${mintPrinted.lines.join(' | ')}`);
  } finally {
    await closeQuietly(mintPrinted.value);
  }
});

// ── activeServerBaseUrl: the one session accessor this task adds ──────────────────────────────
test('activeServerBaseUrl is null with no session and returns exactly the signed-in base', async () => {
  resetSession();
  assert.equal(activeServerBaseUrl(), null);

  const seen: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen.push(`${req.method} ${req.url}`);
      if (req.method === 'POST' && req.url === '/api/session') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 2, email: 'lab-guardian-a@example.com', administrator: true }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('');
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api`;
  try {
    await signIn({ baseUrl: base, email: 'lab-guardian-a@example.com', password: 'lab-not-real' });
    assert.equal(activeServerBaseUrl(), base, 'the signed-in base is returned verbatim');
    assert.doesNotMatch(activeServerBaseUrl() ?? '', new RegExp(TOKEN_PREFIX), 'no token is hidden in the base');
    resetSession();
    assert.equal(activeServerBaseUrl(), null, 'a reset session has no base to hand out');
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    resetSession();
  }
});

// ── source guards: one request path, no printing, no storage ──────────────────────────────────
test('socket.ts takes every default from session.ts and opens no second request path', () => {
  const source = readFileSync(new URL('../../src/services/traccar/socket.ts', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/session\.ts'/, 'the session service is the only source of defaults');
  for (const name of ['mintSocketToken', 'revokeSocketToken', 'activeClient', 'activeServerBaseUrl']) {
    assert.match(source, new RegExp(name), `socket.ts must use ${name}`);
  }
  assert.doesNotMatch(source, /console\./, 'the socket layer must never log');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /(?:^|[^.\w])fetch\s*\(/m, 'polling rides the Task 3 client, not raw fetch');
});
