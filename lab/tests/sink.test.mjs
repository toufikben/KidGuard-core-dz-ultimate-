import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSink } from '../sink/sink.mjs';

const silent = { log() {}, error() {} };

test('records a forwarded event and answers 200, rejects junk with 400', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kidguard-lab-sink-'));
  const eventsFile = join(dir, 'events.ndjson');
  const server = createSink({ eventsFile, log: silent });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;

  const payload = JSON.parse(await readFile(
    new URL('../fixtures/event-geofence-exit.json', import.meta.url), 'utf8'));

  const ok = await fetch(`${base}/alert`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, eventType: 'geofenceExit' });

  const junk = await fetch(`${base}/alert`, { method: 'POST', body: 'not json' });
  assert.equal(junk.status, 400);

  const missing = await fetch(`${base}/alert`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(missing.status, 400);

  const wrongPath = await fetch(`${base}/other`, { method: 'POST', body: '{}' });
  assert.equal(wrongPath.status, 404);

  const lines = (await readFile(eventsFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).eventType, 'geofenceExit');

  server.close();
  await rm(dir, { recursive: true, force: true });
});

test('rejects an oversized body with 413 and appends nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kidguard-lab-sink-413-'));
  const eventsFile = join(dir, 'events.ndjson');
  const server = createSink({ eventsFile, log: silent });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;

  // 2 MiB body, over the sink's MAX_BODY_BYTES cap (1 MiB).
  const oversized = 'x'.repeat(2 * 1024 * 1024);
  const res = await fetch(`${base}/alert`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: oversized,
  });
  assert.equal(res.status, 413);

  // The guard returns before mkdir/appendFile, so nothing was ever written:
  // the events file must not exist at all.
  await assert.rejects(readFile(eventsFile, 'utf8'), { code: 'ENOENT' });

  server.close();
  await rm(dir, { recursive: true, force: true });
});
