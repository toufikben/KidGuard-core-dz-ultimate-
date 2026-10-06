import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { percentile, summarize } from '../sink/lib/latency.mjs';

test('percentile uses nearest-rank', () => {
  const sorted = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  assert.equal(percentile(sorted, 50), 500);
  assert.equal(percentile(sorted, 95), 1000);
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([5, Number.NaN, 7], 50), 5);
});

const fixture = (await readFile(new URL('../fixtures/events.ndjson', import.meta.url), 'utf8'))
  .trim().split('\n').map((line) => JSON.parse(line));

test('summarize counts every type and reports the one that never arrived', () => {
  const summary = summarize(fixture, ['geofenceExit', 'alarm', 'deviceOverspeed']);
  assert.equal(summary.byType.geofenceExit.count, 5);
  assert.equal(summary.byType.alarm.count, 2);
  assert.equal(summary.byType.deviceOffline.withoutPosition, 2);
  assert.deepEqual(summary.coverage.missing, ['deviceOverspeed']);
  assert.equal(summary.byType.geofenceExit.forwardP95Ms, 4200);
  assert.deepEqual(summary.coverage.unexpected.sort(), ['deviceMoving', 'deviceOffline']);
});

test('markdown verdict flags a p95 above the 30s budget', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize(fixture, ['geofenceExit']));
  assert.match(md, /PASS p95/);
  const slow = fixture.map((r) => ({ ...r, forwardLatencyMs: 31_000 }));
  assert.match(toMarkdown(summarize(slow, ['geofenceExit'])), /FAIL p95/);
});
