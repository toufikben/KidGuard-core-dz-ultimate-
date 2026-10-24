import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog } from '../../relay/audit.ts';
import { RelayError } from '../../relay/errors.ts';
import { createIncidentStore } from '../../relay/incidents.ts';
import { fakeClock, forwardPayload } from './helpers.ts';

const T0 = 1_700_000_000_000;
const WINDOW = 60_000;

function setup(recipients = [{ userId: 1 }, { userId: 2 }], windowMs = WINDOW) {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const store = createIncidentStore({ audit, recipients, now: clock.now, windowMs });
  return { clock, audit, store };
}

function actions(audit: ReturnType<typeof createAuditLog>) {
  return audit.entries().map((entry) => entry.action);
}

test('incidents: ingest sends every recipient in parallel and starts the first window at sent', () => {
  const { store, audit } = setup();
  const incident = store.ingest(forwardPayload());
  assert.ok(incident);
  assert.equal(incident!.tier, 'P1');
  assert.equal(incident!.deliveries.length, 2);
  assert.deepEqual(incident!.deliveries.map((delivery) => delivery.state), ['sent', 'sent']);
  assert.equal(incident!.currentRecipientUserId, 1);
  assert.equal(incident!.deadlineAt, new Date(T0 + WINDOW).toISOString());
  assert.equal(actions(audit).filter((action) => action === 'sent').length, 2);
});

test('incidents: a delivery while current extends the deadline from the delivery instant', () => {
  const { store, clock } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(30_000);
  const delivered = store.delivered(incident.id, 1);
  assert.equal(delivered.deadlineAt, new Date(T0 + 30_000 + WINDOW).toISOString());
  assert.equal(delivered.deliveries[0].state, 'delivered');
});

test('incidents: a tick before the deadline changes nothing', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW - 1);
  store.tick();
  assert.equal(audit.entries().filter((entry) => entry.action === 'window_expired').length, 0);
  assert.equal(store.get(incident.id).deadlineAt, new Date(T0 + WINDOW).toISOString());
});

test('incidents: expiry escalates to the next recipient with a fresh window and a sequence log', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW);
  store.tick();
  const after = store.get(incident.id);
  assert.equal(after.currentRecipientUserId, 2);
  assert.equal(after.deadlineAt, new Date(T0 + WINDOW + WINDOW).toISOString());
  assert.equal(actions(audit).filter((action) => action === 'window_expired').length, 1);
  assert.equal(actions(audit).filter((action) => action === 'escalation').length, 1);
  const expired = audit.entries().find((entry) => entry.action === 'window_expired')!;
  assert.equal(expired.data.atEnd, false);
  assert.equal(expired.data.userId, 1);
});

test('incidents: expiry at the last recipient is audited once and never repeats', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW);
  store.tick();
  clock.advance(WINDOW);
  store.tick();
  clock.advance(10 * WINDOW);
  store.tick();
  const atEnd = audit.entries().filter((entry) => entry.action === 'window_expired' && entry.data.atEnd === true);
  assert.equal(atEnd.length, 1);
  const after = store.get(incident.id);
  assert.equal(after.state, 'active');
  assert.equal(after.atEnd, true);
  assert.equal(after.deadlineAt, null);
});

test('incidents: any recipient may ack; the ack assigns, stops the ladder, closes nothing', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  const result = store.ack(incident.id, 2);
  assert.equal(result.changed, true);
  assert.equal(result.incident.assigneeUserId, 2);
  assert.equal(result.incident.state, 'assigned');
  assert.equal(result.incident.tier, 'P1');
  assert.equal(result.incident.deadlineAt, null);
  const ackEntry = audit.entries().find((entry) => entry.action === 'ack')!;
  assert.equal(ackEntry.data.assigneeUserId, 2);
  assert.equal(ackEntry.data.afterDegraded, false);
  clock.advance(10 * WINDOW);
  store.tick();
  assert.equal(actions(audit).filter((action) => action === 'window_expired').length, 0);
  assert.equal(actions(audit).filter((action) => action === 'escalation').length, 0);
});

test('incidents: a second ack by a different user is a conflict and changes nothing', () => {
  const { store } = setup();
  const incident = store.ingest(forwardPayload())!;
  store.ack(incident.id, 1);
  assert.throws(() => store.ack(incident.id, 2), (error: unknown) => {
    assert.ok(error instanceof RelayError);
    assert.equal((error as RelayError).kind, 'conflict');
    return true;
  });
  assert.equal(store.get(incident.id).assigneeUserId, 1);
});

test('incidents: a repeat ack by the same user is idempotent and audits once', () => {
  const { store, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  store.ack(incident.id, 2);
  const repeat = store.ack(incident.id, 2);
  assert.equal(repeat.changed, false);
  assert.equal(audit.entries().filter((entry) => entry.action === 'ack').length, 1);
});

test('incidents: a late delivery pushes the current deadline later, never earlier', () => {
  const { store, clock } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW);
  store.tick();
  assert.equal(store.get(incident.id).currentRecipientUserId, 2);
  clock.advance(40_000);
  const after = store.delivered(incident.id, 2);
  // delivered at T0+100s ⇒ max(old deadline T0+120s, T0+160s)
  assert.equal(after.deadlineAt, new Date(T0 + 100_000 + WINDOW).toISOString());
});

test('incidents: silence degradation clears the assignee, jumps to the last contact, and is final', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  store.ack(incident.id, 1);
  const count = store.degradeOpen('silence');
  assert.equal(count, 1);
  const after = store.get(incident.id);
  assert.equal(after.degraded, true);
  assert.equal(after.state, 'degraded');
  assert.equal(after.assigneeUserId, null);
  assert.equal(after.currentRecipientUserId, 2);
  assert.equal(after.deadlineAt, null);
  assert.equal(after.atEnd, true);
  assert.equal(actions(audit).filter((action) => action === 'degraded').length, 1);
  const escalation = audit.entries().find((entry) => entry.action === 'escalation')!;
  assert.equal(escalation.data.reason, 'silence');
  clock.advance(10 * WINDOW);
  store.tick();
  assert.equal(actions(audit).filter((action) => action === 'degraded').length, 1);
});

test('incidents: no recipients means the event is ignored, never an incident nobody sees', () => {
  const { store, audit } = setup([]);
  assert.equal(store.ingest(forwardPayload()), null);
  assert.equal(store.list().length, 0);
  const ignored = audit.entries().find((entry) => entry.action === 'ignored')!;
  assert.equal(ignored.data.reason, 'no_recipients');
});

test('incidents: list returns copies, so a caller cannot mutate the store', () => {
  const { store } = setup();
  store.ingest(forwardPayload());
  const first = store.list()[0];
  first.recipients.push({ userId: 99 });
  first.deliveries[0].state = 'opened';
  const second = store.list()[0];
  assert.equal(second.recipients.length, 2);
  assert.equal(second.deliveries[0].state, 'sent');
});

test('incidents: a non-positive or non-finite window is refused at construction', () => {
  const audit = createAuditLog();
  assert.throws(() => createIncidentStore({ audit, recipients: [], windowMs: 0 }));
  assert.throws(() => createIncidentStore({ audit, recipients: [], windowMs: Number.NaN }));
  assert.throws(() => createIncidentStore({ audit, recipients: [], windowMs: -1 }));
});

test('incidents: the tier comes from the measured mapping, and sos is the only P0', () => {
  const { store } = setup();
  const sos = store.ingest(forwardPayload({ type: 'alarm', alarm: 'sos', eventId: 1 }))!;
  const alarm = store.ingest(forwardPayload({ type: 'alarm', alarm: 'vibration', eventId: 2 }))!;
  assert.equal(sos.tier, 'P0');
  assert.equal(alarm.tier, 'P1');
});

test('incidents: an ignored tier creates no incident and is audited', () => {
  const { store, audit } = setup();
  assert.equal(store.ingest(forwardPayload({ type: 'geofenceEnter' })), null);
  assert.equal(store.list().length, 0);
  assert.equal(audit.entries().find((entry) => entry.action === 'ignored')!.data.reason, 'tier_none');
});

test('incidents: a repeated event id returns the original incident and never re-sends', () => {
  const { store, audit } = setup();
  const first = store.ingest(forwardPayload())!;
  const second = store.ingest(forwardPayload())!;
  assert.equal(second.id, first.id);
  assert.equal(store.list().length, 1);
  assert.equal(actions(audit).filter((action) => action === 'ingest').length, 1);
  assert.equal(actions(audit).filter((action) => action === 'sent').length, 2);
});

test('incidents: an escalation past a notification that landed earlier is audited as sent, with its real anchor', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(10_000);
  store.delivered(incident.id, 2);
  clock.advance(50_000);
  store.tick();
  const escalation = audit.entries().find((entry) => entry.action === 'escalation')!;
  const after = store.get(incident.id);
  assert.equal(after.deadlineAt, new Date(T0 + WINDOW + WINDOW).toISOString());
  assert.equal(escalation.data.basis, 'sent');
  assert.equal(escalation.data.anchorAt, new Date(T0 + WINDOW).toISOString());
  assert.equal(escalation.data.deadlineAt, after.deadlineAt);
});

test('incidents: an escalation at the delivery instant is audited as delivered', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW);
  store.delivered(incident.id, 2);
  store.tick();
  const escalation = audit.entries().find((entry) => entry.action === 'escalation')!;
  assert.equal(escalation.data.basis, 'delivered');
  assert.equal(escalation.data.anchorAt, new Date(T0 + WINDOW).toISOString());
  assert.equal(store.get(incident.id).deadlineAt, new Date(T0 + WINDOW + WINDOW).toISOString());
});

test('incidents: a late receipt after the ladder ended cannot reopen a window', () => {
  const deliveredRun = setup();
  const deliveredIncident = deliveredRun.store.ingest(forwardPayload())!;
  deliveredRun.clock.advance(WINDOW);
  deliveredRun.store.tick();
  deliveredRun.clock.advance(WINDOW);
  deliveredRun.store.tick();
  deliveredRun.clock.advance(5_000);
  const lateDelivery = deliveredRun.store.delivered(deliveredIncident.id, 2);
  assert.equal(lateDelivery.deadlineAt, null);
  assert.equal(lateDelivery.deliveries[1].state, 'delivered');
  assert.ok(deliveredRun.audit.entries().some((entry) => entry.action === 'delivered' && entry.data.userId === 2));

  const openedRun = setup();
  const openedIncident = openedRun.store.ingest(forwardPayload())!;
  openedRun.clock.advance(WINDOW);
  openedRun.store.tick();
  openedRun.clock.advance(WINDOW);
  openedRun.store.tick();
  openedRun.clock.advance(5_000);
  const lateOpen = openedRun.store.opened(openedIncident.id, 2);
  assert.equal(lateOpen.deadlineAt, null);
  assert.equal(lateOpen.deliveries[1].state, 'opened');
  assert.ok(openedRun.audit.entries().some((entry) => entry.action === 'opened' && entry.data.userId === 2));

  for (const run of [deliveredRun, openedRun]) {
    run.clock.advance(10 * WINDOW);
    run.store.tick();
    const atEnd = run.audit.entries().filter((entry) => entry.action === 'window_expired' && entry.data.atEnd === true);
    assert.equal(atEnd.length, 1);
  }
});

test('incidents: an opened receipt without a prior delivery counts as an inferred delivery', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(20_000);
  const after = store.opened(incident.id, 1);
  assert.equal(after.deliveries[0].state, 'opened');
  assert.equal(after.deliveries[0].deliveredAt, new Date(T0 + 20_000).toISOString());
  assert.equal(after.deadlineAt, new Date(T0 + 20_000 + WINDOW).toISOString());
  const inferred = audit.entries().find((entry) => entry.action === 'delivered' && entry.data.inferred === true);
  assert.ok(inferred);
});

test('incidents: acking a degraded incident records the assignee and keeps the degraded state', () => {
  const { store, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  store.degradeOpen('silence');
  const result = store.ack(incident.id, 2);
  assert.equal(result.changed, true);
  assert.equal(result.incident.assigneeUserId, 2);
  assert.equal(result.incident.state, 'degraded');
  assert.equal(result.incident.degraded, true);
  assert.equal(result.incident.deadlineAt, null);
  const ack = audit.entries().find((entry) => entry.action === 'ack')!;
  assert.equal(ack.data.assigneeUserId, 2);
  assert.equal(ack.data.afterDegraded, true);
  assert.equal(store.ack(incident.id, 2).changed, false);
});

test('incidents: a non-recipient cannot receipt or ack the incident', () => {
  const { store } = setup();
  const incident = store.ingest(forwardPayload())!;
  for (const attempt of [
    () => store.delivered(incident.id, 99),
    () => store.opened(incident.id, 99),
    () => store.ack(incident.id, 99),
  ]) {
    assert.throws(attempt, (error: unknown) => {
      assert.ok(error instanceof RelayError);
      assert.equal((error as RelayError).kind, 'forbidden');
      return true;
    });
  }
});
