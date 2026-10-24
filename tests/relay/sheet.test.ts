import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog } from '../../relay/audit.ts';
import { createIncidentStore } from '../../relay/incidents.ts';
import { MAX_SHEET_CHARS, renderIncidentSheet } from '../../relay/sheet.ts';
import { fakeClock, forwardPayload } from './helpers.ts';

const T0 = 1_700_000_000_000;

function sheetFor(options: { alarm?: string; type?: string; serial?: string } = {}) {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const store = createIncidentStore({ audit, recipients: [{ userId: 1 }, { userId: 2 }], now: clock.now });
  const incident = store.ingest(forwardPayload({
    alarm: options.alarm ?? 'sos', type: options.type ?? 'alarm', serial: options.serial ?? '1234567890HMS8',
  }))!;
  return { clock, store, incident };
}

test('sheet: a P0 sheet names the incident, tier, coordinates, age, and the lab footer', () => {
  const { store, incident } = sheetFor();
  const text = renderIncidentSheet(store.get(incident.id), T0 + 12_000);
  assert.match(text, /inc-0001/);
  assert.match(text, /P0/);
  assert.match(text, /36\.75380/);
  assert.match(text, /3\.05880/);
  assert.match(text, /12/);
  assert.match(text, /بيانات مختبر/);
});

test('sheet: only the last four serial characters appear', () => {
  const { store, incident } = sheetFor({ serial: '1234567890HMS8' });
  const text = renderIncidentSheet(store.get(incident.id), T0);
  assert.match(text, /HMS8/);
  assert.doesNotMatch(text, /1234567890HMS8/);
});

test('sheet: a short serial is never printed, and no email can appear', () => {
  const { store, incident } = sheetFor({ serial: 'ABC1' });
  const text = renderIncidentSheet(store.get(incident.id), T0);
  assert.doesNotMatch(text, /ABC1/);
  assert.doesNotMatch(text, /@/);
});

test('sheet: an unknown accuracy is omitted; a valid speed is converted to km/h', () => {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const store = createIncidentStore({ audit, recipients: [{ userId: 1 }], now: clock.now });
  const payload = forwardPayload();
  payload.position!.accuracy = null;
  payload.position!.speed = 10; // knots
  const incident = store.ingest(payload)!;
  const text = renderIncidentSheet(store.get(incident.id), T0);
  assert.doesNotMatch(text, /±/);
  assert.match(text, /18\.5/);
});

test('sheet: assignment and the degraded state are visible', () => {
  const { store, incident } = sheetFor({ type: 'geofenceExit', alarm: null });
  store.ack(incident.id, 2);
  const assigned = renderIncidentSheet(store.get(incident.id), T0);
  assert.match(assigned, /#2/);
  store.degradeOpen('silence');
  const degraded = renderIncidentSheet(store.get(incident.id), T0);
  assert.match(degraded, /متدهور/);
});

test('sheet: the delivery sequence lists every recipient with its state', () => {
  const { store, incident, clock } = sheetFor({ type: 'geofenceExit', alarm: null });
  clock.advance(5_000);
  store.delivered(incident.id, 1);
  const text = renderIncidentSheet(store.get(incident.id), T0 + 5_000);
  assert.match(text, /#1/);
  assert.match(text, /#2/);
  assert.match(text, /وصل/);
  assert.match(text, /أُرسل/);
});

test('sheet: the AC-17 family word is named as not implemented', () => {
  const { store, incident } = sheetFor();
  assert.match(renderIncidentSheet(store.get(incident.id), T0), /AC-17/);
});

test('sheet: output is deterministic for the same incident and instant', () => {
  const { store, incident } = sheetFor();
  const first = renderIncidentSheet(store.get(incident.id), T0 + 1000);
  const second = renderIncidentSheet(store.get(incident.id), T0 + 1000);
  assert.equal(first, second);
});

test('sheet: output is bounded at 4000 characters and keeps the footer', () => {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const many = Array.from({ length: 60 }, (_, index) => ({ userId: index + 1, name: 'مستلم طويل جداً '.repeat(4) }));
  const store = createIncidentStore({ audit, recipients: many, now: clock.now });
  const incident = store.ingest(forwardPayload())!;
  for (let i = 0; i < 30; i += 1) {
    clock.advance(1000);
    store.delivered(incident.id, (i % 60) + 1);
  }
  const text = renderIncidentSheet(store.get(incident.id), clock.now());
  assert.ok(text.length <= MAX_SHEET_CHARS, `sheet length ${text.length}`);
  assert.match(text, /بيانات مختبر/);
});

test('sheet: no NaN or undefined reaches the text', () => {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const store = createIncidentStore({ audit, recipients: [{ userId: 1 }], now: clock.now });
  const payload = forwardPayload({ fixTime: 'not-a-date' });
  payload.position!.latitude = Number.NaN;
  payload.position!.longitude = 3.0588;
  payload.position!.speed = Number.NaN;
  const incident = store.ingest(payload)!;
  const text = renderIncidentSheet(store.get(incident.id), T0);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('sheet: the store exposes the same text through sheet()', () => {
  const { store, incident } = sheetFor();
  assert.equal(store.sheet(incident.id, T0), renderIncidentSheet(store.get(incident.id), T0));
});
