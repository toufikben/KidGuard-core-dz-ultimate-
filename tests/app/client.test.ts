import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createTraccarClient, TraccarError } from '../../src/services/traccar/client.ts';

function withServer(handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void) {
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as import('node:net').AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}/api`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test('GET sends Basic auth built from the credentials it was given', async () => {
  let seen: string | undefined;
  const srv = await withServer((req, res) => {
    seen = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('[]');
  });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    assert.deepEqual(await client.get('/positions'), []);
    // Literal, not recomputed with Buffer: the client itself must not need Buffer (see the
    // browser-safety guard test below). btoa('a@b.example:x') === 'YUBiLmV4YW1wbGU6eA=='.
    assert.equal(seen, 'Basic YUBiLmV4YW1wbGU6eA==');
  } finally { await srv.close(); }
});

// The product is Arabic-first: a guardian's password can hold non-ASCII characters, and bare
// `btoa` throws DOMException("Invalid character") on those — measured on this machine. The
// server decodes the header as UTF-8, so the bytes that go into base64 must be UTF-8.
// Buffer appears here deliberately: this file only ever runs under Node.
test('a non-ASCII password still produces the UTF-8 base64 the server decodes', async () => {
  let seen: string | undefined;
  const srv = await withServer((req, res) => {
    seen = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('[]');
  });
  try {
    const credentials = { email: 'lab@a.dz', password: 'سِر-7' };
    const client = createTraccarClient({ baseUrl: srv.url, credentials });
    assert.deepEqual(await client.get('/positions'), []);
    assert.equal(seen, 'Basic ' + Buffer.from(`${credentials.email}:${credentials.password}`, 'utf8').toString('base64'));
  } finally { await srv.close(); }
});

test('a 401 body becomes kind=unauthorized, not a generic error', async () => {
  const srv = await withServer((_req, res) => { res.writeHead(401); res.end('{"error":"Unauthorized login"}'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    await assert.rejects(client.get('/positions'), (error: unknown) => {
      assert.ok(error instanceof TraccarError);
      assert.equal((error as TraccarError).kind, 'unauthorized');
      assert.equal((error as TraccarError).status, 401);
      return true;
    });
  } finally { await srv.close(); }
});

test('the password and the auth header never appear in the error message', async () => {
  const srv = await withServer((_req, res) => { res.writeHead(401); res.end('nope'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'sup3rs3cret' } });
    const error = await client.get('/positions').catch((e) => e as Error);
    assert.ok(error instanceof TraccarError);
    assert.doesNotMatch(error.message, /sup3rs3cret|authorization/i, error.message);
  } finally { await srv.close(); }
});

test('a query object keeps the CALLER key order — /permissions reads are order-sensitive', async () => {
  const urls: string[] = [];
  const srv = await withServer((req, res) => { urls.push(req.url ?? ''); res.writeHead(200); res.end('[]'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    // Measured live on Traccar 6.16.0 (2026-10-23): ?userId=2&notificationId=0 answers 200, while
    // the alphabetically sorted ?notificationId=0&userId=2 answers 400 ("Table TC_NOTIFICATION_USER
    // not found"). The pair's FIRST key selects the relation, so the client must not reorder.
    await client.get('/permissions', { userId: 2, notificationId: 0 });
    await client.get('/permissions', { notificationId: 0, userId: 2 });
    assert.equal(urls[0], '/api/permissions?userId=2&notificationId=0');
    assert.equal(urls[1], '/api/permissions?notificationId=0&userId=2', 'the client passes the order through unchanged');
  } finally { await srv.close(); }
});

test('a 200 with a non-JSON body is kind=badpayload, not a silent null', async () => {
  const srv = await withServer((_req, res) => { res.writeHead(200); res.end('<html>login</html>'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    await assert.rejects(client.get('/positions'), (error: unknown) => (error as TraccarError).kind === 'badpayload');
  } finally { await srv.close(); }
});

// R-M1-15 / 008 §3.2. The message used to interpolate `text.slice(0, 40)` — and on /api/session/token
// that body IS a credential (measured: a bare string declared application/json, so the parse fails on
// a 200 that succeeded). Deleting the excerpt is what this test measures: put it back and this goes
// red, while the test above stays green (R-M1-12).
test('a badpayload message carries the body shape, never the body itself', async () => {
  const SECRET_BODY = 'RjBEAiBSecretLookingTokenHead0123456789abcdef';
  const srv = await withServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(SECRET_BODY);
  });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    const error = await client.get('/session/token').catch((e) => e as TraccarError);
    assert.ok(error instanceof TraccarError);
    assert.equal(error.kind, 'badpayload');
    // No run of the body's own characters, however short, may reach the message.
    for (const fragment of [SECRET_BODY.slice(0, 7), SECRET_BODY.slice(7, 14), SECRET_BODY.slice(-8)]) {
      assert.ok(!error.message.includes(fragment), `message leaked ${fragment}: ${error.message}`);
    }
    assert.doesNotMatch(error.message, new RegExp(SECRET_BODY));
    // And the shape it does report is the one a debugger needs: length + declared content-type.
    assert.match(error.message, /^HTTP 200 returned non-JSON \(45 bytes, content-type application\/json\)$/, error.message);
  } finally { await srv.close(); }
});

test('a hung server becomes kind=timeout, not an infinite spinner', async () => {
  const srv = await withServer(() => { /* never answers */ });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' }, timeoutMs: 120 });
    await assert.rejects(client.get('/positions'), (error: unknown) => (error as TraccarError).kind === 'timeout');
  } finally { await srv.close(); }
});

// The guardians' app ships to a browser (owner's PC + a Realme phone over `adb reverse`), where
// `Buffer` is undefined: a single reference in the shipped client would make the FIRST request any
// screen makes throw ReferenceError and take the whole app down. There is no browser test in M1, so
// this source-text guard is the only thing that keeps the encoding browser-safe.
test('the shipped client source never references Buffer, which does not exist in a browser', () => {
  const source = readFileSync(new URL('../../src/services/traccar/client.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Buffer/, 'client.ts must encode with btoa(), never with Node-only Buffer');
});

// Traccar's session endpoints read @FormParam (SessionResource.java:119-141,150-173; measured in
// lab/report/evidence/007-app-api-surface.md), so the client itself must be able to put a
// form-encoded body on the wire — otherwise Task 6 bolts a second raw fetch path next to it.
test('postForm puts an x-www-form-urlencoded body on the wire through the same request path', async () => {
  let body = '';
  let contentType = '';
  let method = '';
  let authorization: string | undefined;
  const srv = await withServer((req, res) => {
    method = req.method ?? '';
    contentType = String(req.headers['content-type'] ?? '');
    authorization = req.headers.authorization;
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"success":true}'); });
  });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'lab-guardian@example.com', password: 'x' } });
    const payload = await client.postForm('/session/token', { expiration: 86400, label: 'lab guardian app' });
    assert.deepEqual(payload, { success: true });
    assert.equal(method, 'POST');
    assert.equal(contentType, 'application/x-www-form-urlencoded');
    // URLSearchParams encoding: numbers coerced, spaces as `+`, caller key order preserved.
    assert.equal(body, 'expiration=86400&label=lab+guardian+app');
    assert.equal(authorization, 'Basic bGFiLWd1YXJkaWFuQGV4YW1wbGUuY29tOng=');
  } finally { await srv.close(); }
});
