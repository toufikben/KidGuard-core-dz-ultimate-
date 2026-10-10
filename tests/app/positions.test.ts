import test from 'node:test';
import assert from 'node:assert/strict';
import { kmPerHour, ageSeconds, freshnessOf, formatPositionLabel, resolveSourceReadings, isSourceConflict } from '../../src/services/traccar/positions.ts';
import type { ServerPosition } from '../../src/services/traccar/types.ts';

const now = Date.parse('2026-10-08T12:00:00Z');
const pos = (over: Partial<ServerPosition>): ServerPosition => ({
  id: 1, deviceId: 7, fixTime: '2026-10-08T12:00:00Z', serverTime: '2026-10-08T12:00:01Z',
  latitude: 36.7538, longitude: 3.0588, speed: 0, course: 0, accuracy: 25, attributes: {}, ...over,
});

test('speed comes from the server in knots and is shown in km/h', () => {
  assert.equal(Math.round(kmPerHour(pos({ speed: 10 }))), 19, '10 kn = 18.52 km/h');
});

test('age is read off fixTime, not serverTime (ruling R30)', () => {
  const late = pos({ fixTime: '2026-10-08T11:59:00Z', serverTime: '2026-10-08T12:00:30Z' });
  assert.equal(ageSeconds(late, now), 60, 'the reading is 60 s old no matter when the server stored it');
});

// R30, pinned the other way: identical serverTime but different fixTime MUST give different ages.
// If ageSeconds read serverTime, both would be the same (0) and this collapses — the retransmission
// rule (an old fix is old however recently the server received it) is exactly what this kills.
test('the same serverTime with two different fixTimes yields two different ages', () => {
  const retransmitted = pos({ fixTime: '2026-10-08T11:50:00Z', serverTime: '2026-10-08T12:00:00Z' });
  const current = pos({ fixTime: '2026-10-08T11:59:00Z', serverTime: '2026-10-08T12:00:00Z' });
  assert.equal(ageSeconds(retransmitted, now), 600, 'a fix retransmitted 10 min late is 600 s old');
  assert.equal(ageSeconds(current, now), 60, 'a fresh fix at the same serverTime is 60 s old');
});

test('freshness thresholds are the spec 12 numbers', () => {
  assert.equal(freshnessOf(ageSeconds(pos({ fixTime: '2026-10-08T11:59:50Z' }), now)), 'fresh');
  assert.equal(freshnessOf(ageSeconds(pos({ fixTime: '2026-10-08T11:56:40Z' }), now)), 'aging');   // 200 s > 180
  assert.equal(freshnessOf(ageSeconds(pos({ fixTime: '2026-10-08T11:54:00Z' }), now)), 'silent');  // 360 s > 300
});

// Boundary directions are load-bearing and stated here for the reviewer: §12 says aging is ABOVE
// 180 and silent is ABOVE 300, so exactly 180 stays fresh and exactly 300 stays aging. Each side is
// asserted with a value only that branch produces, never a word shared by two branches.
test('the 180 s and 300 s thresholds fall on the exact side spec 12 states', () => {
  assert.equal(freshnessOf(180), 'fresh', '180 is not above 180, so it is still fresh');
  assert.equal(freshnessOf(181), 'aging', 'one second past 180 is aging');
  assert.equal(freshnessOf(300), 'aging', '300 is not above 300, so it is aging not silent');
  assert.equal(freshnessOf(301), 'silent', 'one second past 300 is silent');
});

test('the label carries age and accuracy, and never says live alone', () => {
  const ar = formatPositionLabel(pos({ accuracy: 25, fixTime: '2026-10-08T11:59:05Z' }), now, 'ar');
  assert.match(ar, /منذ\s*55/); assert.match(ar, /±\s*25\s*م/);
  assert.doesNotMatch(ar, /حيّ|مضمون|live|guaranteed/i, ar);
});

// The same reading, phrased in the other two languages, must carry the age and must not over-claim.
// A missing `en`/`fr` value would surface here rather than at runtime on a guardian's phone.
test('the age+accuracy label is honest in fr and en too, never live/safe/guaranteed', () => {
  const p = pos({ accuracy: 25, fixTime: '2026-10-08T11:59:05Z' });
  const fr = formatPositionLabel(p, now, 'fr');
  const en = formatPositionLabel(p, now, 'en');
  assert.match(fr, /55/); assert.match(fr, /25/);
  assert.match(en, /55/); assert.match(en, /25/);
  for (const label of [fr, en]) assert.doesNotMatch(label, /live|guaranteed|safe|s[eé]ruris/i, label);
});

test('a silent source is announced as no-data, not as safety', () => {
  const label = formatPositionLabel(pos({ fixTime: '2026-10-08T11:40:00Z' }), now, 'ar');
  assert.match(label, /لا بيانات|قد لا يكون/);
  assert.doesNotMatch(label, /بأمان|safe/i, label);
});

test('two live sources over 300 m apart are a conflict, not a silent pick', () => {
  const near = pos({ id: 1, attributes: { source: 'phone' } });
  const far = pos({ id: 2, attributes: { source: 'tracker' }, latitude: 36.7638 });
  const { conflict, chosen } = resolveSourceReadings([near, far]);
  assert.equal(conflict, true); assert.equal(chosen, null, 'conflict must not quietly render one of them');
});

test('two live sources within 300 m resolve to the freshest reading', () => {
  const older = pos({ id: 1, fixTime: '2026-10-08T11:59:40Z', attributes: { source: 'phone' } });
  const fresher = pos({ id: 2, fixTime: '2026-10-08T11:59:55Z', latitude: 36.7539, attributes: { source: 'tracker' } });
  const { conflict, chosen } = resolveSourceReadings([older, fresher]);
  assert.equal(conflict, false); assert.equal(chosen?.id, 2);
});

// Both sides of the 300 m conflict rule (≈244 m vs ≈356 m at this latitude). Mutating the single
// CONFLICT_DISTANCE_M constant flips one of these two assertions, so the rule is pinned by value.
test('two sources straddle the 300 m conflict rule on both sides', () => {
  const base = pos({ id: 1, attributes: { source: 'phone' } });                 // 36.7538
  const justInside = pos({ id: 2, latitude: 36.7560, attributes: { source: 'tracker' } }); // ~244 m
  const justOutside = pos({ id: 3, latitude: 36.7570, attributes: { source: 'tracker' } }); // ~356 m
  assert.equal(resolveSourceReadings([base, justInside]).conflict, false, '244 m is not a conflict');
  assert.equal(resolveSourceReadings([base, justOutside]).conflict, true, '356 m is a conflict');
});

// The straddle above cannot pin the tie: no two float coordinates sit exactly 300 m apart, so
// flipping `>` to `>=` left the whole suite green (reviewer mutation e). This pins the tie directly.
test('exactly 300 m is not yet a conflict — the rule is strictly over', () => {
  assert.equal(isSourceConflict(300), false, '300 is not more than 300, so the app may still pick');
  assert.equal(isSourceConflict(301), true, 'one metre past the rule is a conflict');
});

test('a future fixTime is rejected as impossible, same rule as the lab (M0 R19 lineage)', () => {
  assert.throws(() => ageSeconds(pos({ fixTime: '2026-10-08T12:05:00Z' }), now), /future|clock/i);
});

// Task 10 feeds `now` from a live socket/device clock, so a non-finite `now` is a real input, not a
// hypothetical. Without the guard the arithmetic yields NaN, which fell through both threshold
// comparisons and came back labelled 'fresh' — the loudest possible over-claim in a safety product.
test('a non-finite now is refused by ageSeconds, never turned into a NaN age', () => {
  assert.throws(() => ageSeconds(pos({}), NaN), /now|clock/i);
  assert.throws(() => ageSeconds(pos({}), Number.POSITIVE_INFINITY), /now|clock/i);
});

test('a non-finite age is never called fresh', () => {
  assert.equal(freshnessOf(Number.NaN), 'silent', 'NaN passed both comparisons and returned fresh');
  assert.equal(freshnessOf(Number.POSITIVE_INFINITY), 'silent');
});

// The label is the screen-facing function, so a broken reading must degrade out loud to the no-data
// sentence rather than throw (a throw here white-outs the map screen) and must never print NaN.
test('a broken fixTime degrades to the no-data label instead of throwing or printing NaN', () => {
  for (const fixTime of ['not-a-date', '', null as unknown as string]) {
    const label = formatPositionLabel(pos({ fixTime }), now, 'ar');
    assert.match(label, /لا بيانات/, label);
    assert.doesNotMatch(label, /NaN/, label);
  }
});

test('a broken now degrades to the no-data label instead of printing "منذ NaN ثانية"', () => {
  const label = formatPositionLabel(pos({}), NaN, 'ar');
  assert.match(label, /لا بيانات/, label);
  assert.doesNotMatch(label, /NaN/, label);
});

test('every copy key used by the labels exists in ar, fr and en', async () => {
  const { catalog } = await import('../../src/translations/catalog.ts');
  // Non-empty guard first: a vacuous loop over an empty catalog must not count as a passing test.
  assert.ok(Object.keys(catalog).length > 0, 'catalog is empty — the parity guard would prove nothing');
  for (const [key, entry] of Object.entries(catalog)) {
    for (const lang of ['ar', 'fr', 'en'] as const) {
      assert.ok(typeof entry[lang] === 'string' && entry[lang].length > 0, `${key}.${lang} is missing`);
    }
  }
});

// Parity, pinned structurally: a key present in one language only, or carrying an unexpected
// language, fails here. Tasks 6–11 append keys and must keep every entry exactly {ar, fr, en}.
test('no catalog key exists in one language only and none carries an extra language', async () => {
  const { catalog } = await import('../../src/translations/catalog.ts');
  for (const [key, entry] of Object.entries(catalog)) {
    assert.deepEqual(Object.keys(entry).sort(), ['ar', 'en', 'fr'], `${key} is not trilingual`);
  }
  // The keys formatPositionLabel relies on must be present, so deleting one cannot pass silently.
  for (const key of ['position.ageSeconds', 'position.accuracyMeters', 'position.noDataFromServer', 'position.locationMayNotBeCurrent']) {
    assert.ok(key in catalog, `required label key is missing: ${key}`);
  }
});
