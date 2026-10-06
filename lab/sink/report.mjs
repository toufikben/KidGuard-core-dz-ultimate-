import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarize } from './lib/latency.mjs';

const TARGET_P95_MS = 30_000; // design spec section 8: source -> server <= 30s p95

export function toMarkdown(summary) {
  const rows = Object.entries(summary.byType).map(([type, m]) =>
    `| ${type} | ${m.count} | ${m.forwardP50Ms ?? '-'} | ${m.forwardP95Ms ?? '-'}`
    + ` | ${m.forwardMaxMs ?? '-'} | ${m.ingestP95Ms ?? '-'} | ${m.withoutPosition} |`);
  const finiteP95 = Object.values(summary.byType)
    .map((m) => m.forwardP95Ms)
    .filter((v) => Number.isFinite(v));
  let verdict;
  if (summary.total === 0 || finiteP95.length === 0) {
    // A child-safety report must never let "no measurement" read as "within budget":
    // the previous `.every(m => m.forwardP95Ms === null || ...)` returned PASS for empty
    // input and for a null p95. Require at least one finite forward p95 before PASS/FAIL.
    verdict = `NO DATA p95 not measured (records: ${summary.total})`;
  } else if (summary.clockSkew.count > 0) {
    // R19: a clock-skewed batch is untrustworthy in both directions — the negative values
    // pull p50/p95 down, so it must not read as PASS, and it must not read as a budget
    // FAIL either. Fix the clock, then measure.
    verdict = `INVALID clock skew: ${summary.clockSkew.count} of ${summary.total} records have`
      + ` a non-positive forward latency (min forward latency ${summary.clockSkew.minForwardLatencyMs} ms)`
      + ` -- p95 not trustworthy`;
  } else if (finiteP95.every((v) => v <= TARGET_P95_MS)) {
    verdict = `PASS p95 <= ${TARGET_P95_MS} ms`;
  } else {
    verdict = `FAIL p95 > ${TARGET_P95_MS} ms`;
  }
  return [
    `# M0 measurement report`,
    ``,
    `records: ${summary.total}`,
    `clock-skewed records (forward latency <= 0): ${summary.clockSkew.count}`,
    ``,
    `| event | count | p50 forward (ms) | p95 forward (ms) | max forward (ms) | p95 ingest (ms) | without position |`,
    `|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
    `verdict: ${verdict}`,
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
