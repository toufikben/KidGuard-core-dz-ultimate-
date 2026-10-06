import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarize } from './lib/latency.mjs';

// Design spec section 8: «مصدر → خادم (إنذار) ≤30ث p95» — the transport path, measured here
// from the source's fix time to the sink's receipt. The event age (eventTime → receipt) is
// reported beside it but never budgets anything: Traccar back-dates deviceMoving's eventTime.
const TARGET_P95_MS = 30_000;

export function toMarkdown(summary) {
  const rows = Object.entries(summary.byType).map(([type, m]) =>
    `| ${type} | ${m.count} | ${m.transportP50Ms ?? '-'} | ${m.transportP95Ms ?? '-'}`
    + ` | ${m.transportMaxMs ?? '-'} | ${m.forwardP95Ms ?? '-'} | ${m.ingestP95Ms ?? '-'}`
    + ` | ${m.withoutPosition} |`);
  const finiteP95 = Object.values(summary.byType)
    .map((m) => m.transportP95Ms)
    .filter((v) => Number.isFinite(v));
  const unmeasured = Object.entries(summary.byType)
    .filter(([, m]) => m.transportP95Ms === null)
    .map(([type]) => type);
  // An age over budget while transport is inside it is a fact about Traccar's reference
  // timestamps, so it is printed and explained instead of being dropped or clamped.
  const ageNotes = Object.entries(summary.byType)
    .filter(([, m]) => Number.isFinite(m.forwardP95Ms) && m.forwardP95Ms > TARGET_P95_MS
      && Number.isFinite(m.transportP95Ms) && m.transportP95Ms <= TARGET_P95_MS)
    .map(([type, m]) => `event-age note: ${type} p95 ${m.forwardP95Ms} ms exceeds the budget`
      + ` while its source->sink p95 is ${m.transportP95Ms} ms — Traccar back-dates ${type}`
      + ` eventTime to the motion onset, so this is the age of a reference timestamp, not a`
      + ` delay in the chain`);

  let verdict;
  if (summary.total === 0 || finiteP95.length === 0) {
    // A child-safety report must never let "no measurement" read as "within budget":
    // the previous `.every(m => m.forwardP95Ms === null || ...)` returned PASS for empty
    // input and for a null p95. Require at least one finite transport p95 before PASS/FAIL.
    verdict = `NO DATA p95 not measured (records: ${summary.total})`;
  } else if (summary.clockSkew.count > 0) {
    // R19: a clock-skewed batch is untrustworthy in both directions — the negative values
    // pull p50/p95 down, so it must not read as PASS, and it must not read as a budget
    // FAIL either. Fix the clock, then measure.
    verdict = `INVALID clock skew: ${summary.clockSkew.count} of ${summary.total} records have`
      + ` a non-positive source->sink latency (min source->sink latency`
      + ` ${summary.clockSkew.minTransportLatencyMs} ms) -- p95 not trustworthy`;
  } else if (finiteP95.every((v) => v <= TARGET_P95_MS)) {
    verdict = `PASS p95 <= ${TARGET_P95_MS} ms (source->sink)`;
  } else {
    verdict = `FAIL p95 > ${TARGET_P95_MS} ms (source->sink)`;
  }
  return [
    `# M0 measurement report`,
    ``,
    `records: ${summary.total}`,
    `clock-skewed records (source->sink latency <= 0): ${summary.clockSkew.count}`,
    `budget metric: source->sink (fix time -> sink receipt); event age (eventTime -> sink`
      + ` receipt) is shown for reference only`,
    ``,
    `| event | count | p50 source->sink (ms) | p95 source->sink (ms) | max source->sink (ms)`
      + ` | p95 event age (ms) | p95 ingest server (ms) | without position |`,
    `|---|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
    `verdict: ${verdict}`,
    ...ageNotes,
    `budget not measured for: ${unmeasured.join(', ') || 'none'}`,
    `missing expected types: ${summary.coverage.missing.join(', ') || 'none'}`,
    `unexpected types: ${summary.coverage.unexpected.join(', ') || 'none'}`,
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
    ? pathToFileURL(resolve(process.argv[2]))
    : new URL('../artifacts/events.ndjson', import.meta.url);
  const expected = (process.argv[3] ?? 'geofenceExit,alarm,deviceOffline').split(',');
  const records = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(toMarkdown(summarize(records, expected)));
}
