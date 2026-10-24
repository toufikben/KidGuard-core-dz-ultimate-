import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog, sanitize } from '../../relay/audit.ts';
import { fakeClock } from './helpers.ts';

test('audit: entries carry a monotonic seq and an ISO instant from the injected clock', () => {
  const clock = fakeClock();
  const log = createAuditLog({ now: clock.now });
  const first = log.record('ingest', { eventId: 74 });
  clock.advance(1000);
  const second = log.record('sent', { userId: 1 });
  assert.equal(first.seq, 1);
  assert.equal(second.seq, 2);
  assert.equal(first.at, new Date(1_700_000_000_000).toISOString());
  assert.notEqual(first.at, second.at);
});

test('audit: sanitize drops secret-shaped keys at every depth and bounds long strings', () => {
  const out = sanitize({
    ok: 'visible',
    password: 'sup3rs3cret',
    nested: { authorization: 'Bearer abc', token: 't0k', email: 'a@b.c', keep: 'yes' },
    long: 'x'.repeat(500),
  }) as Record<string, unknown>;
  assert.equal(out.ok, 'visible');
  assert.equal(out.password, undefined);
  const nested = out.nested as Record<string, unknown>;
  assert.equal(nested.authorization, undefined);
  assert.equal(nested.token, undefined);
  assert.equal(nested.email, undefined);
  assert.equal(nested.keep, 'yes');
  assert.ok((out.long as string).length <= 201);
});

test('audit: a circular object is recorded as a marker instead of throwing', () => {
  const value: Record<string, unknown> = { name: 'loop' };
  value.self = value;
  const out = sanitize(value) as Record<string, unknown>;
  assert.equal(out.name, 'loop');
  assert.equal(out.self, '[circular]');
  const log = createAuditLog();
  assert.doesNotThrow(() => log.record('internal_error', { value }));
});

test('audit: non-finite numbers become null and NDJSON is one line per entry', () => {
  const log = createAuditLog();
  log.record('ingest', { bad: Number.NaN, worse: Number.POSITIVE_INFINITY });
  log.record('sent', { userId: 1 });
  const lines = log.toNdjson().split('\n');
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]) as { data: Record<string, unknown> };
  assert.equal(first.data.bad, null);
  assert.equal(first.data.worse, null);
  assert.equal(log.entries().length, 2);
});
