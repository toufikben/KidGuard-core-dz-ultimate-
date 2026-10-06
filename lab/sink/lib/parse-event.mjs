const toMillis = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());

const diff = (later, earlier) =>
  (later === null || earlier === null ? null : later - earlier);

export function parseEventData(payload, receivedAtMs) {
  const event = payload && payload.event;
  if (!event || typeof event.type !== 'string' || event.type.length === 0) {
    throw new Error('payload.event.type is required');
  }
  const position = payload.position ?? null;
  const device = payload.device ?? null;
  const geofence = payload.geofence ?? null;

  const eventTime = toMillis(event.eventTime);
  const fixTime = position ? toMillis(position.fixTime ?? position.deviceTime) : null;
  const serverTime = position ? toMillis(position.serverTime) : null;

  return {
    eventType: event.type,
    eventId: event.id ?? null,
    eventTimeIso: iso(eventTime),
    deviceId: event.deviceId ?? device?.id ?? null,
    deviceName: device?.name ?? null,
    uniqueId: device?.uniqueId ?? null,
    geofenceId: event.geofenceId ?? 0,
    geofenceName: geofence?.name ?? null,
    alarm: position?.attributes?.alarm ?? null,
    batteryLevel: position?.attributes?.battery ?? null,
    latitude: position?.latitude ?? null,
    longitude: position?.longitude ?? null,
    accuracyMeters: position?.accuracy ?? null,
    speedKnots: position?.speed ?? null,
    courseDegrees: position?.course ?? null,
    fixTimeIso: iso(fixTime),
    serverTimeIso: iso(serverTime),
    receivedAtIso: new Date(receivedAtMs).toISOString(),
    // Two different quantities, both kept: `forward` is the age of Traccar's reference time
    // (deviceMoving back-dates eventTime to the motion onset), `transport` is the
    // source->sink path spec §8 budgets at <=30 s p95.
    forwardLatencyMs: diff(receivedAtMs, eventTime),
    transportLatencyMs: diff(receivedAtMs, fixTime),
    ingestLatencyMs: diff(serverTime, fixTime),
  };
}
