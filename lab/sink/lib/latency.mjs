const toMs = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

// The <=30 s budget of design spec §8 is the source->server path; in the lab the measured
// end of that path is the sink's receipt. Rows stored before transportLatencyMs existed —
// the committed M0 evidence among them — are re-derived from their stored ISO stamps.
export function transportLatency(record) {
  const stored = toMs(record.transportLatencyMs);
  if (stored !== null) return stored;
  const from = toMs(record.fixTimeIso);
  const to = toMs(record.receivedAtIso);
  return from === null || to === null ? null : to - from;
}

export function percentile(sortedValues, p) {
  const values = sortedValues.filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const rank = Math.ceil((p / 100) * values.length);
  return values[Math.max(0, Math.min(values.length - 1, rank - 1))];
}

export function summarize(records, expectedTypes = []) {
  const byType = {};
  // A source clock ahead of the sink yields transportLatencyMs <= 0: impossible for a real
  // transport path, and silently folded into the percentiles it drags p50 down so a slow link
  // reads fast. Kept as its own anomaly class instead of clamped, so the report can refuse a
  // verdict. Judged on the budget metric, not on the event age — Traccar back-dates
  // deviceMoving's eventTime on purpose (ruling R30), which is not clock skew.
  let skewCount = 0;
  let skewMin = null;
  for (const record of records) {
    const bucket = byType[record.eventType] ?? {
      count: 0, forwardLatencyMs: [], transportLatencyMs: [], ingestLatencyMs: [], withoutPosition: 0,
    };
    bucket.count += 1;
    const transport = transportLatency(record);
    if (Number.isFinite(transport)) {
      bucket.transportLatencyMs.push(transport);
      if (transport <= 0) {
        skewCount += 1;
        skewMin = skewMin === null ? transport : Math.min(skewMin, transport);
      }
    }
    if (Number.isFinite(record.forwardLatencyMs)) bucket.forwardLatencyMs.push(record.forwardLatencyMs);
    if (Number.isFinite(record.ingestLatencyMs)) bucket.ingestLatencyMs.push(record.ingestLatencyMs);
    if (record.latitude === null) bucket.withoutPosition += 1;
    byType[record.eventType] = bucket;
  }

  const report = {};
  for (const [type, bucket] of Object.entries(byType)) {
    const forward = bucket.forwardLatencyMs.slice().sort((a, b) => a - b);
    const transport = bucket.transportLatencyMs.slice().sort((a, b) => a - b);
    const ingest = bucket.ingestLatencyMs.slice().sort((a, b) => a - b);
    report[type] = {
      count: bucket.count,
      withoutPosition: bucket.withoutPosition,
      forwardP50Ms: percentile(forward, 50),
      forwardP95Ms: percentile(forward, 95),
      forwardMaxMs: forward.length ? forward[forward.length - 1] : null,
      transportP50Ms: percentile(transport, 50),
      transportP95Ms: percentile(transport, 95),
      transportMaxMs: transport.length ? transport[transport.length - 1] : null,
      ingestP95Ms: percentile(ingest, 95),
    };
  }

  return {
    total: records.length,
    clockSkew: { count: skewCount, minTransportLatencyMs: skewCount === 0 ? null : skewMin },
    byType: report,
    coverage: {
      expected: expectedTypes,
      missing: expectedTypes.filter((t) => !byType[t]),
      unexpected: Object.keys(byType).filter((t) => !expectedTypes.includes(t)),
    },
  };
}
