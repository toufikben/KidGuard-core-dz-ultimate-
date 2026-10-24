// tests/app/events.test.ts — Task 10, Step 1 (أ)–(ط): the live event log and the exit debounce,
// against pure functions and server-rendered markup only. No jsdom, no browser, no timers.
//
// Binding rulings this file pins (they override any looser wording in the brief):
//  R-M1-31  debounce = 3 consecutive reads of the same device whose `position.geofenceIds` does NOT
//           contain the pending exit's `geofenceId`; a read that puts the zone back cancels it; one
//           read is never an alert; `position.fixTime` is the age, against an injectable clock.
//  R-M1-32  the log lives in session memory only, is empty on (re)open, carries `sinceOpened`, and
//           no request ever carries `from`/`to`.
//  R-M1-33  `attributes.message` is unmeasured: its absence must not break the screen, and no
//           `undefined`/`NaN` may reach the HTML.
//  R-M1-35  `deviceOffline` alone is P2: in-app only, no bell, no phone, no police word.
//  R-M1-36  device names come from `deviceDisplayName`; a serial is shown only as its last four
//           characters, and an unknown device is a catalog sentence, never a uniqueId.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { translate } from '../../src/translations/catalog.ts';
import { noDataLabel } from '../../src/services/traccar/positions.ts';
import { eventLog, pendingAck, tierOf, type LoggedEvent } from '../../src/services/traccar/events.ts';
import { AlertsLog } from '../../src/components/AlertsLog.tsx';
import type { ServerDevice, ServerEvent, ServerPosition } from '../../src/services/traccar/types.ts';

// ── fixtures — every human-readable name starts with `lab-` ──────────────────────────────────────
const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const isoAgo = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const DEVICE: ServerDevice = {
  id: 11,
  name: 'lab-tracker-a',
  uniqueId: 'lab-serial-a-000000000011',
  status: 'online',
};

const exitEvent = (over: Partial<ServerEvent> = {}): ServerEvent => ({
  id: 501,
  type: 'geofenceExit',
  eventTime: isoAgo(10),
  deviceId: 11,
  positionId: 900,
  geofenceId: 7,
  attributes: {},
  ...over,
});

const alarmEvent = (over: Partial<ServerEvent> = {}): ServerEvent => ({
  id: 601,
  type: 'alarm',
  eventTime: isoAgo(5),
  deviceId: 11,
  attributes: {},
  ...over,
});

const offlineEvent = (over: Partial<ServerEvent> = {}): ServerEvent => ({
  id: 701,
  type: 'deviceOffline',
  eventTime: isoAgo(5),
  deviceId: 11,
  attributes: {},
  ...over,
});

const position = (over: Partial<ServerPosition> = {}): ServerPosition => ({
  id: 900,
  deviceId: 11,
  fixTime: isoAgo(5),
  serverTime: new Date(NOW).toISOString(),
  latitude: 36.7538,
  longitude: 3.0588,
  speed: 0,
  course: 0,
  accuracy: 10,
  geofenceIds: [],
  attributes: {},
  ...over,
});

// Three DIFFERENT readings of one device, each newer than the last (the debounce counts readings,
// not retransmissions of the same row).
const outsideReads = (): ServerPosition[] => [
  position({ id: 901, fixTime: isoAgo(4) }),
  position({ id: 902, fixTime: isoAgo(3) }),
  position({ id: 903, fixTime: isoAgo(2) }),
];

function renderAlerts(over: {
  entries?: readonly LoggedEvent[];
  devices?: readonly ServerDevice[];
  connection?: 'connecting' | 'live' | 'fallback' | 'closed';
  lang?: 'ar' | 'fr' | 'en';
} = {}): string {
  return renderToString(React.createElement(AlertsLog, {
    lang: over.lang ?? 'ar',
    entries: over.entries ?? [],
    devices: over.devices ?? [DEVICE],
    connection: over.connection ?? 'live',
  }));
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

// ── (أ) geofenceExit is an alert only after three consecutive outside reads ──────────────────────
test('(أ) geofenceExit becomes P1 only after three consecutive outside reads', () => {
  const store = eventLog({ now: () => NOW });
  assert.equal(tierOf(exitEvent()), 'P1', 'the event tier is P1 by its type');

  store.accept(exitEvent());
  assert.equal(store.entries.length, 0, 'an unconfirmed exit is not yet a log alert');
  assert.equal(store.pendingExits().length, 1, 'the exit is held pending, not raised');

  const [first, second, third] = outsideReads();
  assert.deepEqual(store.notePosition(first), [], 'one read is not an alert');
  assert.deepEqual(store.notePosition(second), [], 'two reads are not an alert');
  assert.equal(store.entries.length, 0);
  assert.equal(store.pendingAck().length, 0, 'nothing is pending acknowledgement yet');

  const raised = store.notePosition(third);
  assert.equal(raised.length, 1, 'the third consecutive outside read confirms the exit');
  assert.equal(raised[0].count, 3);
  assert.equal(raised[0].deviceId, 11);
  assert.equal(raised[0].geofenceId, 7);
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].tier, 'P1');
  assert.equal(store.entries[0].event.id, 501, 'the logged alert is the server event itself');
  assert.equal(store.entries[0].evidenceCount, 3, 'the alert carries the evidence that fired it');
  assert.equal(store.pendingAck().length, 1);
  assert.equal(pendingAck(store.entries).length, 1);
});

// ── (ب) alarm ⇒ P0 ──────────────────────────────────────────────────────────────────────────────
test('(ب) alarm is P0 and enters the log immediately', () => {
  const store = eventLog({ now: () => NOW });
  assert.equal(tierOf(alarmEvent()), 'P0');

  const entry = store.accept(alarmEvent());
  assert.notEqual(entry, null);
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].tier, 'P0');
  assert.equal(store.pendingAck().length, 1);
});

// ── (ج) deviceOffline alone ⇒ P2, in-app only, no bell/phone/police ─────────────────────────────
test('(ج) deviceOffline alone is P2 — no bell, no phone, no police word', () => {
  const store = eventLog({ now: () => NOW });
  const tier = tierOf(offlineEvent());
  assert.equal(tier, 'P2');
  assert.doesNotMatch(JSON.stringify(tier), /شرطة|police/i, 'the tier is a code, never a police referral');

  store.accept(offlineEvent());
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].tier, 'P2');
  assert.equal(store.pendingAck().length, 0, 'P2 is not an acknowledgement event');

  const html = renderAlerts({ entries: store.entries });
  assert.ok(html.includes(translate('alerts.tier.p2', 'ar')), 'the P2 row names its inconclusive tier');
  assert.doesNotMatch(html, /شرطة|police|جرس|bell|phone/i, 'a P2 row mentions no bell, phone or police');

  const source = readFileSync(new URL('../../src/components/AlertsLog.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:Bell|Phone)[A-Za-z]*\b/,
    'the component must not even import a bell or phone icon — P2 would inherit it');
  for (const lang of ['ar', 'fr', 'en'] as const) {
    assert.doesNotMatch(translate('alerts.tier.p2', lang), /شرطة|police/i);
  }
});

// ── (د) one read outside the zone ⇒ no alert ────────────────────────────────────────────────────
test('(د) a single read outside the boundary raises no alert', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(exitEvent());
  assert.deepEqual(store.notePosition(position({ id: 904, fixTime: isoAgo(4) })), []);
  assert.equal(store.entries.length, 0);
  assert.equal(store.pendingAck().length, 0);

  const html = renderAlerts({ entries: store.entries });
  assert.equal(html.includes(translate('alerts.pendingAck', 'ar')), false,
    'an unconfirmed single read must not show the unacknowledged-event line');
});

// ── (هـ) stale events and stale readings never enter the live counter ──────────────────────────
test('(هـ) an event older than 15 minutes never enters the live counter', () => {
  const store = eventLog({ now: () => NOW });
  const stale = exitEvent({ eventTime: isoAgo(16 * 60) });
  assert.equal(store.accept(stale), null, 'a 16-minute-old exit is not a live event');
  assert.equal(store.pendingExits().length, 0);

  const [first, second, third] = outsideReads();
  assert.deepEqual(store.notePosition(first), []);
  assert.deepEqual(store.notePosition(second), []);
  assert.deepEqual(store.notePosition(third), []);
  assert.equal(store.entries.length, 0, 'a stale exit can never be confirmed into an alert');

  // The boundary itself: exactly 15 minutes old is still live (the ruling says «أقدم من 15 دقيقة»).
  const boundary = eventLog({ now: () => NOW });
  boundary.accept(exitEvent({ eventTime: isoAgo(15 * 60) }));
  assert.equal(boundary.pendingExits().length, 1, 'exactly 15 minutes is not older than 15 minutes');
});

test('(هـ) a position whose fixTime is older than 15 minutes is not a new reading', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(exitEvent());
  const staleReads = [0, 1, 2].map((index) =>
    position({ id: 911 + index, fixTime: isoAgo(16 * 60 + index) }));
  for (const read of staleReads) assert.deepEqual(store.notePosition(read), []);
  assert.equal(store.entries.length, 0, 'retransmitted old fixes must not confirm an exit');
});

// ── (و) socket drop: the screen says no-data, never safe ───────────────────────────────────────
test('(و) a fallback connection shows the connection badge and the no-data label, never "safe"', () => {
  const html = renderAlerts({ connection: 'fallback' });
  assert.ok(html.includes(translate('alerts.connection.fallback', 'ar', { seconds: 15 })),
    'the announced fallback names the polling cadence');
  assert.ok(html.includes(noDataLabel('ar')), 'the last known is labelled as no data from the server');
  assert.doesNotMatch(html, /آمن|بأمان|safe|guaranteed/i, 'a dropped live channel is never called safe');
});

// ── (ز) one line for unacknowledged events, not a flooded log ─────────────────────────────────
test('(ز) unacknowledged P0/P1 events collapse into one line', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(alarmEvent({ id: 601 }));
  store.accept(exitEvent({ id: 502 }));
  for (const read of outsideReads()) store.notePosition(read);
  assert.equal(store.pendingAck().length, 2);

  const line = translate('alerts.pendingAck', 'ar');
  const html = renderAlerts({ entries: store.entries });
  assert.ok(html.includes(line), 'the single unacknowledged line is shown');
  assert.equal(occurrences(html, line), 1, 'two unacknowledged events still produce ONE line');

  store.acknowledge(601);
  assert.equal(store.pendingAck().length, 1);
  store.acknowledge(502);
  assert.equal(store.pendingAck().length, 0);
  assert.equal(renderAlerts({ entries: store.entries }).includes(line), false);
});

// ── (ح) the log is per session, empty on reopen, and no historical request exists ─────────────
test('(ح) reopening the session shows an empty log with the sinceOpened badge', () => {
  const first = eventLog({ now: () => NOW });
  first.accept(alarmEvent());
  const firstHtml = renderAlerts({ entries: first.entries });
  assert.ok(firstHtml.includes(translate('alerts.sinceOpened', 'ar')), 'the badge is explicit');
  assert.ok(firstHtml.includes(translate('alerts.tier.p0', 'ar')), 'the event is in this session log');

  const reopened = eventLog({ now: () => NOW + 60_000 });
  assert.equal(reopened.entries.length, 0, 'a new session starts with an empty log');
  assert.equal(reopened.sinceOpened, true);
  const secondHtml = renderAlerts({ entries: reopened.entries });
  assert.ok(secondHtml.includes(translate('alerts.empty', 'ar')), 'the empty log is named');
  assert.ok(secondHtml.includes(translate('alerts.sinceOpened', 'ar')));
  assert.equal(secondHtml.includes(translate('alerts.tier.p0', 'ar')), false,
    'no previous session event survives into the new log');
});

test('(ح) the event layer has no historical window and no browser storage', () => {
  for (const file of [
    'src/services/traccar/events.ts',
    'src/services/traccar/socket.ts',
    'src/components/AlertsLog.tsx',
  ]) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, `${file} touches browser storage`);
    assert.doesNotMatch(source, /[?&](?:from|to)=|from:\s*\w+,\s*to:/, `${file} builds a from/to window`);
    assert.doesNotMatch(source, /['"`]\/events\b/, `${file} must not read a historical events route`);
  }
});

// ── (ط) an event frame without attributes.message does not break the screen ────────────────────
test('(ط) an event with no attributes.message renders without undefined or NaN', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(exitEvent({ attributes: undefined }));
  for (const read of outsideReads()) store.notePosition(read);
  store.accept(alarmEvent({ id: 602, attributes: undefined }));

  assert.equal(store.entries.length, 2);
  const html = renderAlerts({ entries: store.entries });
  assert.equal(html.includes('undefined'), false, 'no missing message reaches the HTML as undefined');
  assert.equal(html.includes('NaN'), false, 'no unmeasured number reaches the HTML as NaN');
  assert.ok(html.includes(translate('alerts.exitEvidence', 'ar', { count: 3 })),
    'the debounce evidence is rendered from counted reads, not from attributes.message');
});

// ── (cancel) returning to the zone cancels the pending exit ───────────────────────────────────
test('a reading that puts the zone back cancels the pending exit and resets the count', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(exitEvent());
  const [first, second] = outsideReads();
  store.notePosition(first);
  store.notePosition(second);

  assert.deepEqual(store.notePosition(position({ id: 930, fixTime: isoAgo(1), geofenceIds: [7] })), []);
  assert.equal(store.pendingExits().length, 0, 'the pending exit is cancelled, not merely paused');

  const [third, fourth, fifth] = [1, 2, 3].map((step) =>
    position({ id: 931 + step, fixTime: isoAgo(-step) }));
  for (const read of [third, fourth, fifth]) assert.deepEqual(store.notePosition(read), []);
  assert.equal(store.entries.length, 0, 'after a return, three outside reads alone do not re-raise');
});

// ── an old or re-delivered row is not a new observation ──────────────────────────────────────
test('a replayed or older reading can neither count nor cancel a live exit count', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(exitEvent()); // event at NOW-10s
  assert.deepEqual(store.notePosition(position({ id: 950, fixTime: isoAgo(8) })), []);
  assert.deepEqual(store.notePosition(position({ id: 951, fixTime: isoAgo(7) })), []);
  assert.equal(store.pendingExits().length, 1);
  assert.equal(store.pendingExits()[0].count, 2);

  // An inside row older than the last accepted fix is a retransmission, not a return to the zone.
  assert.deepEqual(store.notePosition(position({ id: 952, fixTime: isoAgo(9), geofenceIds: [7] })), []);
  assert.equal(store.pendingExits().length, 1, 'an older inside row must not cancel the pending exit');
  assert.equal(store.pendingExits()[0].count, 2, 'an older row is not a new reading');

  const raised = store.notePosition(position({ id: 953, fixTime: isoAgo(6) }));
  assert.equal(raised.length, 1, 'the next NEW outside reading is the third one');
  assert.equal(raised[0].count, 3);
  assert.equal(store.entries.length, 1);
});

test('a reading dated at or before the exit event can never cancel or count', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(exitEvent()); // event at NOW-10s

  // Pre-event inside reading: not evidence about the world after the exit.
  assert.deepEqual(store.notePosition(position({ id: 960, fixTime: isoAgo(12), geofenceIds: [7] })), []);
  assert.equal(store.pendingExits().length, 1, 'a pre-event row must not cancel the pending exit');
  assert.equal(store.pendingExits()[0].count, 0);

  // Exactly at the event instant: strictly-after is required, so it is skipped too.
  assert.deepEqual(store.notePosition(position({ id: 961, fixTime: isoAgo(10), geofenceIds: [7] })), []);
  assert.equal(store.pendingExits().length, 1);
  assert.equal(store.pendingExits()[0].count, 0);

  for (const read of [
    position({ id: 962, fixTime: isoAgo(8) }),
    position({ id: 963, fixTime: isoAgo(7) }),
    position({ id: 964, fixTime: isoAgo(6) }),
  ]) store.notePosition(read);
  assert.equal(store.entries.length, 1, 'three genuinely newer outside readings still confirm the exit');
  assert.equal(store.entries[0].evidenceCount, 3);
});

// ── a repeated position row is one reading ────────────────────────────────────────────────────
test('the same position row read three times is one reading, not three', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(exitEvent());
  const row = position({ id: 940, fixTime: isoAgo(2) });
  assert.deepEqual(store.notePosition(row), []);
  assert.deepEqual(store.notePosition(row), []);
  assert.deepEqual(store.notePosition(row), []);
  assert.equal(store.entries.length, 0, 're-polling one row cannot satisfy a readings debounce');
});

// ── tierOf: the exact four-way mapping ────────────────────────────────────────────────────────
test('tierOf maps exactly alarm→P0, geofenceExit→P1, deviceOffline→P2, everything else→none', () => {
  assert.equal(tierOf(alarmEvent()), 'P0');
  assert.equal(tierOf(exitEvent()), 'P1');
  assert.equal(tierOf(offlineEvent()), 'P2');
  assert.equal(tierOf({ type: 'deviceMoving' }), 'none');
  assert.equal(tierOf({ type: 'geofenceEnter' }), 'none');
});

// ── pendingAck ignores acknowledged and non-P0/P1 entries ─────────────────────────────────────
test('pendingAck returns only unacknowledged P0/P1 entries', () => {
  const entries: LoggedEvent[] = [
    { event: alarmEvent({ id: 1 }), tier: 'P0', receivedAt: NOW, acknowledged: false },
    { event: exitEvent({ id: 2 }), tier: 'P1', receivedAt: NOW, acknowledged: true },
    { event: offlineEvent({ id: 3 }), tier: 'P2', receivedAt: NOW, acknowledged: false },
    { event: alarmEvent({ id: 4 }), tier: 'none', receivedAt: NOW, acknowledged: false },
  ];
  assert.deepEqual(pendingAck(entries).map((entry) => entry.event.id), [1]);
});

// ── device names and serials (R-M1-36) ────────────────────────────────────────────────────────
test('rows use the shared device display name and only the last four serial characters', () => {
  const store = eventLog({ now: () => NOW });
  store.accept(alarmEvent());
  const html = renderAlerts({ entries: store.entries });

  assert.ok(html.includes('lab-tracker-a'), 'the server device name is the label');
  assert.ok(html.includes(`…${DEVICE.uniqueId.slice(-4)}`), 'the serial appears only as ellipsis plus four');
  assert.equal(html.includes(DEVICE.uniqueId), false, 'the full serial never reaches the screen');

  const unknownHtml = renderAlerts({
    entries: [{ event: alarmEvent({ deviceId: 99 }), tier: 'P0', receivedAt: NOW, acknowledged: false }],
  });
  assert.ok(unknownHtml.includes(translate('children.unnamedDevice', 'ar')),
    'an unknown device is a catalog sentence');
  assert.equal(unknownHtml.includes('99'), false, 'the unknown device id is not printed as an identity');
});

// ── catalog parity for every new key ──────────────────────────────────────────────────────────
test('every alerts/tabs.alerts key exists in Arabic, French and English', () => {
  const keys = [
    'tabs.alerts',
    'alerts.title', 'alerts.sinceOpened', 'alerts.empty', 'alerts.pendingAck',
    'alerts.acknowledge', 'alerts.acknowledged', 'alerts.serverEvents',
    'alerts.connection.connecting', 'alerts.connection.live',
    'alerts.connection.fallback', 'alerts.connection.closed',
    'alerts.tier.p0', 'alerts.tier.p1', 'alerts.tier.p2', 'alerts.tier.none',
    'alerts.type.alarm', 'alerts.type.geofenceExit', 'alerts.type.deviceOffline',
    'alerts.type.other', 'alerts.exitEvidence',
  ];
  for (const key of keys) {
    for (const lang of ['ar', 'fr', 'en'] as const) {
      assert.ok(translate(key, lang).length > 0, `${key}.${lang} is blank`);
    }
  }
  assert.equal(
    translate('alerts.connection.fallback', 'fr', { seconds: 15 }),
    'Canal interrompu — interrogation toutes les 15 s',
  );
  assert.equal(translate('alerts.pendingAck', 'ar'), 'حدث واحد لم يُؤكد — افتح التفاصيل');
  assert.equal(translate('alerts.sinceOpened', 'ar'), 'منذ فتح الجلسة');
});

// ── the screen holds no Arabic and no RTL literal ─────────────────────────────────────────────
test('AlertsLog holds zero Arabic codepoints, no literal RTL and reads copy from the catalog', () => {
  const source = readFileSync(new URL('../../src/components/AlertsLog.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /[\u0600-\u06FF]/, 'every string belongs to the catalog (R-M1-18)');
  assert.doesNotMatch(source, /direction:\s*['"]?rtl/, 'direction follows the lang prop');
  assert.match(source, /translate\(/, 'the copy is read through the catalog');
});

// ── an absent session is closed, not a fake polling fallback ─────────────────────────────────
test('a refused live channel is closed, never announced as a polling fallback', () => {
  const source = readFileSync(new URL('../../src/components/AlertsLog.tsx', import.meta.url), 'utf8');
  const catchBlock = source.match(/\.catch\(\(\) => \{[\s\S]*?\n    \}\);/)?.[0] ?? '';
  assert.notEqual(catchBlock, '', 'the refusal path is present');
  assert.ok(catchBlock.includes("setConnection('closed')"), 'no channel and no poll is the closed state');
  assert.equal(catchBlock.includes("setConnection('fallback')"), false,
    'a fallback cadence is never claimed when no client exists');
});

test('the live alerts channel opens only for a signed-in session', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /useLiveAlerts\(view === 'alerts' && session\.status === 'signed-in'\)/);
});

test('leaving the alerts view empties the session log before it can be painted again', () => {
  const source = readFileSync(new URL('../../src/components/AlertsLog.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!enabled\) \{\s*setEntries\(\[\]\);\s*setConnection\('closed'\);/,
    'the disabled branch empties the log, so reopening cannot paint a previous session');
});
