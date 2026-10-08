import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { percentile, summarize, transportLatency } from '../sink/lib/latency.mjs';

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

// R30: spec §8 budgets «مصدر → خادم» — the transport path. Rows written before the stored
// field existed (the committed M0 evidence among them) are re-derived from their ISO stamps,
// so the gate report re-renders without re-running the lab.
test('transportLatency prefers the stored measurement, else derives it from the stamps', () => {
  assert.equal(transportLatency({ transportLatencyMs: 1234,
    receivedAtIso: '2026-10-05T10:00:09.000Z', fixTimeIso: '2026-10-05T10:00:00.000Z' }), 1234);
  assert.equal(transportLatency({ transportLatencyMs: null,
    receivedAtIso: '2026-10-05T10:00:03.400Z', fixTimeIso: '2026-10-05T10:00:00.000Z' }), 3400);
  assert.equal(transportLatency({}), null);
  assert.equal(transportLatency({ receivedAtIso: '2026-10-05T10:00:03.400Z' }), null);
  assert.equal(transportLatency({ receivedAtIso: 'not a date',
    fixTimeIso: '2026-10-05T10:00:00.000Z' }), null);
});

test('summarize keeps the source->sink budget percentiles beside the event age', () => {
  const summary = summarize(fixture, ['geofenceExit']);
  assert.equal(summary.byType.geofenceExit.transportP95Ms, 4200);
  assert.equal(summary.byType.deviceMoving.transportP95Ms, 700);
  // The fixture's last deviceMoving row mimics the live gate: Traccar back-dates its
  // eventTime to the motion onset, so the age inflates while the transport does not.
  assert.equal(summary.byType.deviceMoving.forwardP95Ms, 60_700);
});

test('markdown verdict flags a p95 above the 30s budget', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize(fixture, ['geofenceExit']));
  assert.match(md, /PASS p95/);
  const slow = fixture.map((r) => ({ ...r, transportLatencyMs: 31_000 }));
  assert.match(toMarkdown(summarize(slow, ['geofenceExit'])), /FAIL p95/);
});

test('markdown verdict pins all three states: PASS, FAIL, and NO DATA', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const empty = summarize([], ['geofenceExit']);
  const slow = fixture.map((r) => ({ ...r, transportLatencyMs: 31_000 }));
  // A record present but whose transport latency was never a finite measurement
  // (e.g. every event arrived with no fix time) yields a null p95.
  const unmeasured = summarize(
    [{ eventType: 'geofenceExit', transportLatencyMs: null, forwardLatencyMs: null,
       ingestLatencyMs: null, latitude: 1 }],
    ['geofenceExit']);

  // PASS: a real finite p95 within the 30s budget.
  assert.match(toMarkdown(summarize(fixture, ['geofenceExit'])),
    /verdict: PASS p95 <= 30000 ms \(source->sink\)/);
  // FAIL: a real finite p95 above the budget.
  assert.match(toMarkdown(summarize(slow, ['geofenceExit'])),
    /verdict: FAIL p95 > 30000 ms \(source->sink\)/);
  // NO DATA: empty input must NOT read as "within budget" for a child-safety report.
  assert.equal(empty.total, 0);
  assert.match(toMarkdown(empty), /verdict: NO DATA/);
  assert.doesNotMatch(toMarkdown(empty), /verdict: PASS/);
  assert.doesNotMatch(toMarkdown(empty), /verdict: FAIL/);
  // NO DATA: records exist but there is no finite transport p95 at all.
  assert.match(toMarkdown(unmeasured), /verdict: NO DATA/);
  assert.doesNotMatch(toMarkdown(unmeasured), /verdict: PASS/);
});

// A type that cannot contribute a transport measurement must be named, never folded into a
// PASS: an event with no position has no source reading to time from.
test('the report names the types the budget was never measured for', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize(fixture, ['geofenceExit']));
  assert.match(md, /budget not measured for: deviceOffline/);
});

// A PASS must be earned by the type the budget names, not by whatever else happened to arrive.
// Both readings below printed `verdict: PASS` while the batch carried no measurement for
// geofenceExit: the first has the type present with no fix time, the second has it absent.
const timed = (transportLatencyMs) => ({
  eventType: 'deviceMoving', transportLatencyMs, forwardLatencyMs: 1_500,
  ingestLatencyMs: 20, latitude: 36.7538,
});

test('PASS is withheld when a budgeted type arrived without a transport measurement', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize(
    [{ eventType: 'geofenceExit', transportLatencyMs: null, latitude: null }, timed(1_200)],
    ['geofenceExit']));
  assert.match(md, /budget not measured for: geofenceExit/);
  assert.doesNotMatch(md, /verdict: PASS/);
  assert.match(md, /verdict: NO DATA p95 not measured for: geofenceExit/);
});

test('PASS is withheld when a budgeted type never arrived at all', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize([timed(1_200)], ['geofenceExit', 'deviceMoving']));
  assert.match(md, /missing expected types: geofenceExit/);
  assert.doesNotMatch(md, /verdict: PASS/);
  assert.match(md, /verdict: NO DATA p95 not measured for: geofenceExit/);
});

// R30 with R19 kept whole: the inflated age stays visible and explained, unclamped.
test('an event age above the budget is shown and explained, not read as transport', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize(fixture, ['geofenceExit']));
  assert.match(md, /verdict: PASS p95 <= 30000 ms \(source->sink\)/);
  assert.match(md, /60700/, 'the back-dated age must stay visible in the table');
  assert.match(md, /event-age note: deviceMoving p95 60700 ms/);
  assert.match(md, /motion onset/);
});

// R19, re-pointed at the metric that gates: the source clock feeds the transport measurement,
// so a non-positive source->sink latency is the impossible reading. Ruling R30 keeps the event
// age out of this check because Traccar legitimately back-dates it (see the note above).
const skewed = (transportLatencyMs) => ({
  eventType: 'geofenceExit', transportLatencyMs, forwardLatencyMs: 60_000,
  ingestLatencyMs: 1_200, latitude: 36.7538,
});

test('summarize exposes a clock-skew anomaly class for non-positive transport latencies', () => {
  const summary = summarize([skewed(-5_000), skewed(0), skewed(1_200), skewed(-1)], ['geofenceExit']);
  assert.equal(summary.clockSkew.count, 3);
  assert.equal(summary.clockSkew.minTransportLatencyMs, -5_000);
  const clean = summarize([skewed(1_200)], ['geofenceExit']);
  assert.equal(clean.clockSkew.count, 0);
  assert.equal(clean.clockSkew.minTransportLatencyMs, null);
});

test('report refuses PASS while any record is clock-skewed', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize([skewed(-5_000), skewed(1_200)], ['geofenceExit']));
  assert.match(md, /verdict: INVALID clock skew/);
  assert.doesNotMatch(md, /verdict: PASS/);
  assert.match(md, /min source->sink latency -5000 ms/);
});

test('a transport latency of exactly zero is not a trustworthy measurement', async () => {
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
  assert.match(out, /verdict: PASS p95 <= 30000 ms \(source->sink\)/);
  assert.match(out, /clock-skewed records \(source->sink latency <= 0\): 0/);
});

// The gate run wrote lab/artifacts/events.ndjson, which lab/.gitignore excludes (runtime state is
// never committed). That made the M0 proof machine-local and this test unrunnable in CI, so the
// gate file is pinned as a tracked fixture. It predates transportLatencyMs, so the report must
// re-render it from the stored stamps rather than declare the gate unmeasurable.
test('report CLI re-renders the pinned M0 gate evidence and it is within budget', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const out = execFileSync(process.execPath,
    ['lab/sink/report.mjs', 'lab/fixtures/gate-events.ndjson', 'geofenceExit,deviceMoving'],
    { cwd: repoRoot, encoding: 'utf8' });
  assert.match(out, /geofenceExit \| 4/);
  assert.match(out, /verdict: PASS p95 <= 30000 ms \(source->sink\)/);
  assert.match(out, /clock-skewed records \(source->sink latency <= 0\): 0/);
  assert.match(out, /event-age note: deviceMoving p95 63181 ms/);
});
