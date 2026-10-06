export function percentile(sortedValues, p) {
  const values = sortedValues.filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const rank = Math.ceil((p / 100) * values.length);
  return values[Math.max(0, Math.min(values.length - 1, rank - 1))];
}

export function summarize(records, expectedTypes = []) {
  const byType = {};
  // A device whose clock is ahead of the server yields forwardLatencyMs <= 0: impossible,
  // and silently folded into the percentiles it drags p50 down so a slow link reads fast.
  // It is kept as its own anomaly class instead of clamped, so the report can refuse a verdict.
  let skewCount = 0;
  let skewMin = null;
  for (const record of records) {
    const bucket = byType[record.eventType] ?? {
      count: 0, forwardLatencyMs: [], ingestLatencyMs: [], withoutPosition: 0,
    };
    bucket.count += 1;
    if (Number.isFinite(record.forwardLatencyMs)) {
      bucket.forwardLatencyMs.push(record.forwardLatencyMs);
      if (record.forwardLatencyMs <= 0) {
        skewCount += 1;
        skewMin = skewMin === null ? record.forwardLatencyMs : Math.min(skewMin, record.forwardLatencyMs);
      }
    }
    if (Number.isFinite(record.ingestLatencyMs)) bucket.ingestLatencyMs.push(record.ingestLatencyMs);
    if (record.latitude === null) bucket.withoutPosition += 1;
    byType[record.eventType] = bucket;
  }

  const report = {};
  for (const [type, bucket] of Object.entries(byType)) {
    const forward = bucket.forwardLatencyMs.slice().sort((a, b) => a - b);
    const ingest = bucket.ingestLatencyMs.slice().sort((a, b) => a - b);
    report[type] = {
      count: bucket.count,
      withoutPosition: bucket.withoutPosition,
      forwardP50Ms: percentile(forward, 50),
      forwardP95Ms: percentile(forward, 95),
      forwardMaxMs: forward.length ? forward[forward.length - 1] : null,
      ingestP95Ms: percentile(ingest, 95),
    };
  }

  return {
    total: records.length,
    clockSkew: { count: skewCount, minForwardLatencyMs: skewCount === 0 ? null : skewMin },
    byType: report,
    coverage: {
      expected: expectedTypes,
      missing: expectedTypes.filter((t) => !byType[t]),
      unexpected: Object.keys(byType).filter((t) => !expectedTypes.includes(t)),
    },
  };
}
