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

test('markdown verdict pins all three states: PASS, FAIL, and NO DATA', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const empty = summarize([], ['geofenceExit']);
  const slow = fixture.map((r) => ({ ...r, forwardLatencyMs: 31_000 }));
  // A record present but whose forward latency was never a finite measurement
  // (e.g. every event arrived with a missing/NaN timing) yields a null p95.
  const unmeasured = summarize(
    [{ eventType: 'geofenceExit', forwardLatencyMs: null, ingestLatencyMs: null, latitude: 1 }],
    ['geofenceExit']);

  // PASS: a real finite p95 within the 30s budget.
  assert.match(toMarkdown(summarize(fixture, ['geofenceExit'])), /verdict: PASS p95 <= 30000 ms/);
  // FAIL: a real finite p95 above the budget.
  assert.match(toMarkdown(summarize(slow, ['geofenceExit'])), /verdict: FAIL p95 > 30000 ms/);
  // NO DATA: empty input must NOT read as "within budget" for a child-safety report.
  assert.equal(empty.total, 0);
  assert.match(toMarkdown(empty), /verdict: NO DATA/);
  assert.doesNotMatch(toMarkdown(empty), /verdict: PASS/);
  assert.doesNotMatch(toMarkdown(empty), /verdict: FAIL/);
  // NO DATA: records exist but there is no finite forward p95 at all.
  assert.match(toMarkdown(unmeasured), /verdict: NO DATA/);
  assert.doesNotMatch(toMarkdown(unmeasured), /verdict: PASS/);
});

// R19: a clock-skewed forward latency is a bogus measurement, not a fast one.
// The report must refuse both PASS and FAIL-p95 while any exist.
const skewed = (forwardLatencyMs) => ({
  eventType: 'geofenceExit', forwardLatencyMs, ingestLatencyMs: 1_200, latitude: 36.7538,
});

test('summarize exposes a clock-skew anomaly class for non-positive forward latencies', () => {
  const summary = summarize(
    [skewed(-5_000), skewed(0), skewed(1_200), skewed(-1)], ['geofenceExit']);
  assert.equal(summary.clockSkew.count, 3);
  assert.equal(summary.clockSkew.minForwardLatencyMs, -5_000);
  const clean = summarize([skewed(1_200)], ['geofenceExit']);
  assert.equal(clean.clockSkew.count, 0);
  assert.equal(clean.clockSkew.minForwardLatencyMs, null);
});

test('report refuses PASS while any record is clock-skewed', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize([skewed(-5_000), skewed(1_200)], ['geofenceExit']));
  assert.match(md, /verdict: INVALID clock skew/);
  assert.doesNotMatch(md, /verdict: PASS/);
  assert.match(md, /min forward latency -5000 ms/);
});

test('a forward latency of exactly zero is not a trustworthy measurement', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize([skewed(0), skewed(1_500)], ['geofenceExit']));
  assert.doesNotMatch(md, /verdict: PASS/);
  assert.match(md, /verdict: INVALID clock skew/);
});

test('skew outranks the budget verdict: untrustworthy data cannot read as FAIL p95 either', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize([skewed(-5_000), skewed(31_000)], ['geofenceExit']));
  assert.doesNotMatch(md, /verdict: PASS/);
  assert.doesNotMatch(md, /verdict: FAIL p95/);
  assert.match(md, /verdict: INVALID clock skew/);
});

// Task 6 invokes `npm run lab:report -- lab/artifacts/events.ndjson` — a path relative to
// the repo root. The CLI used to build `file:///lab/...` from it and die on Windows.
test('report CLI accepts a repo-relative events file', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const out = execFileSync(process.execPath,
    ['lab/sink/report.mjs', 'lab/fixtures/events.ndjson', 'geofenceExit'],
    { cwd: repoRoot, encoding: 'utf8' });
  assert.match(out, /verdict: PASS p95 <= 30000 ms/);
  assert.match(out, /clock-skewed records \(forward latency <= 0\): 0/);
});
