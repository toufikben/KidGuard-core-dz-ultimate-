import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { summarize } from './lib/latency.mjs';

const TARGET_P95_MS = 30_000; // design spec section 8: source -> server <= 30s p95

export function toMarkdown(summary) {
  const rows = Object.entries(summary.byType).map(([type, m]) =>
    `| ${type} | ${m.count} | ${m.forwardP50Ms ?? '-'} | ${m.forwardP95Ms ?? '-'}`
    + ` | ${m.forwardMaxMs ?? '-'} | ${m.ingestP95Ms ?? '-'} | ${m.withoutPosition} |`);
  const verdict = Object.values(summary.byType).every((m) =>
    m.forwardP95Ms === null || m.forwardP95Ms <= TARGET_P95_MS)
    ? `PASS p95 <= ${TARGET_P95_MS} ms` : `FAIL p95 > ${TARGET_P95_MS} ms`;
  return [
    `# M0 measurement report`,
    ``,
    `records: ${summary.total}`,
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
    ? new URL(`file:///${process.argv[2].replace(/\\/g, '/')}`)
    : new URL('../artifacts/events.ndjson', import.meta.url);
  const expected = (process.argv[3] ?? 'geofenceExit,alarm,deviceOffline').split(',');
  const records = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(toMarkdown(summarize(records, expected)));
}
