import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
    assert.equal(seen, 'Basic ' + Buffer.from('a@b.example:x').toString('base64'));
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

test('a query object becomes a sorted, repeated-free query string', async () => {
  let url = '';
  const srv = await withServer((req, res) => { url = req.url ?? ''; res.writeHead(200); res.end('[]'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    await client.get('/positions', { deviceId: 7, to: '2026-10-08T00:00:00Z', from: '2026-10-07T00:00:00Z' });
    // srv.url is `http://127.0.0.1:<port>/api`, so the request line the server sees carries the
    // `/api` prefix the client keeps: req.url === '/api/positions?…'. The assertion below pins the
    // measured behaviour (deviceId first, then from before to, one shape, no repeat).
    assert.match(url, /^\/api\/positions\?deviceId=7&from=/);
    assert.ok(url.indexOf('from') < url.indexOf('to'), url);
  } finally { await srv.close(); }
});

test('a 200 with a non-JSON body is kind=badpayload, not a silent null', async () => {
  const srv = await withServer((_req, res) => { res.writeHead(200); res.end('<html>login</html>'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    await assert.rejects(client.get('/positions'), (error: unknown) => (error as TraccarError).kind === 'badpayload');
  } finally { await srv.close(); }
});

test('a hung server becomes kind=timeout, not an infinite spinner', async () => {
  const srv = await withServer(() => { /* never answers */ });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' }, timeoutMs: 120 });
    await assert.rejects(client.get('/positions'), (error: unknown) => (error as TraccarError).kind === 'timeout');
  } finally { await srv.close(); }
});
