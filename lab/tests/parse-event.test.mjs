import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEventData } from '../sink/lib/parse-event.mjs';

const fixture = JSON.parse(await readFile(
  new URL('../fixtures/event-geofence-exit.json', import.meta.url), 'utf8'));

test('parses a geofenceExit EventData into a flat measurement record', () => {
  const receivedAt = Date.parse('2026-10-05T10:00:03.400Z');
  const record = parseEventData(fixture, receivedAt);
  assert.equal(record.eventType, 'geofenceExit');
  assert.equal(record.deviceName, 'lab-child-1');
  assert.equal(record.uniqueId, 'lab-child-1');
  assert.equal(record.geofenceName, 'school');
  assert.equal(record.latitude, 36.75541);
  assert.equal(record.speedKnots, 3.4);
  assert.equal(record.accuracyMeters, 18);
  assert.equal(record.forwardLatencyMs, 3400);
  assert.equal(record.ingestLatencyMs, 3500);
});

test('alarm payload keeps the alarm name for tier mapping', () => {
  const sos = { ...fixture, geofence: undefined,
                 event: { ...fixture.event, type: 'alarm', geofenceId: 0 },
                 position: { ...fixture.position, attributes: { alarm: 'sos' } } };
  const record = parseEventData(sos, Date.parse('2026-10-05T10:00:01.000Z'));
  assert.equal(record.eventType, 'alarm');
  assert.equal(record.alarm, 'sos');
  assert.equal(record.geofenceName, null);
});

test('rejects a payload with no event type', () => {
  assert.throws(() => parseEventData({}, 0), /event.type/);
  assert.throws(() => parseEventData({ event: {} }, 0), /event.type/);
});

test('tolerates missing position (deviceOffline has none)', () => {
  const offline = { ...fixture, position: undefined,
                    event: { ...fixture.event, type: 'deviceOffline', positionId: 0 } };
  const record = parseEventData(offline, Date.parse('2026-10-05T10:05:00.000Z'));
  assert.equal(record.latitude, null);
  assert.equal(record.ingestLatencyMs, null);
  // Forward latency is a REAL measurement here, not "whatever the range check happens
  // to accept". `record.forwardLatencyMs >= 0` was defective: null >= 0 is truthy in JS,
  // so it passed even when the measurement was missing. The offline fixture pins it:
  // receivedAt 10:05:00.000Z - eventTime 10:00:00.000Z = 300000 ms exactly.
  assert.ok(Number.isFinite(record.forwardLatencyMs),
    'forward latency must be a finite number, never a missing (null) measurement');
  assert.equal(record.forwardLatencyMs, 300_000);
});

test('accepts epoch millis as well as ISO timestamps', () => {
  const eventMs = Date.parse('2026-10-05T10:00:00.000Z');
  const millis = { ...fixture,
    event: { ...fixture.event, eventTime: eventMs },
    position: { ...fixture.position, fixTime: eventMs - 3000, serverTime: eventMs + 500 } };
  const record = parseEventData(millis, eventMs + 1000);
  assert.equal(record.forwardLatencyMs, 1000);
  assert.equal(record.ingestLatencyMs, 3500);
  assert.equal(record.fixTimeIso, '2026-10-05T09:59:57.000Z');
});

// R30: spec §8 budgets the «مصدر → خادم» path. The record must carry that transport
// measurement (sink receipt − fix time) beside the event age (sink receipt − eventTime),
// because Traccar back-dates deviceMoving's eventTime to the motion onset.
test('stores source->sink transport latency beside the event age', () => {
  const record = parseEventData(fixture, Date.parse('2026-10-05T10:00:03.400Z'));
  assert.equal(record.fixTimeIso, '2026-10-05T09:59:57.000Z');
  assert.equal(record.transportLatencyMs, 6400);
  assert.equal(record.forwardLatencyMs, 3400);
});

test('a positionless event has no transport measurement (nothing was read from the source)', () => {
  const offline = { ...fixture, position: undefined,
                    event: { ...fixture.event, type: 'deviceOffline', positionId: 0 } };
  const record = parseEventData(offline, Date.parse('2026-10-05T10:05:00.000Z'));
  assert.equal(record.transportLatencyMs, null);
  assert.equal(record.forwardLatencyMs, 300_000);
});

test('back-dated deviceMoving: transport stays small while the event age grows by the lag', () => {
  const onset = Date.parse('2026-10-05T10:00:00.000Z');
  const moving = { ...fixture,
    event: { ...fixture.event, type: 'deviceMoving', eventTime: new Date(onset - 60_000).toISOString() },
    position: { ...fixture.position, fixTime: new Date(onset - 3_000).toISOString(),
                serverTime: new Date(onset + 500).toISOString() } };
  const record = parseEventData(moving, onset + 1_000);
  assert.equal(record.transportLatencyMs, 4_000);
  assert.equal(record.forwardLatencyMs, 61_000);
});
