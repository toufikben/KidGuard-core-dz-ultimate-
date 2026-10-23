// tests/app/circleDrag.test.ts — the behavioural proof behind the circle tool (review 2, fix round 2).
// The state machine lives in src/components/map/circleDrag.ts, free of Leaflet, so these tests drive the
// exact decisions a browser will make: tap vs drag, what the radius is, and whether the synthetic click
// that follows a release must be swallowed. The gesture itself is still NOT RUN in a real browser
// (R-M1-19); this file proves the logic the browser will run, not that the browser ran it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircleDrag, type DragPoint } from '../../src/components/map/circleDrag.ts';

const START: DragPoint = { lat: 36.7538, lon: 3.0588, x: 100, y: 100 };
// 0.0009 degrees of latitude is ~100 m, and the pixels are 100 apart: a real, drawable drag.
const DRAGGED: DragPoint = { lat: 36.7547, lon: 3.0588, x: 100, y: 200 };

test('a tap (movement under the tolerance) neither draws nor swallows the map click', () => {
  const drag = createCircleDrag();
  assert.equal(drag.begin(START), true);
  const outcome = drag.finish({ ...START, x: 102, y: 102 });
  assert.equal(outcome?.drawn, false, 'a 3 px wobble is a tap, not a circle');
  assert.equal(drag.consumeClickSuppression(), false, 'the tap must still reach onSelectCoordinates');
});

test('a real drag draws from the PRESS point and never from the release point', () => {
  const drag = createCircleDrag();
  drag.begin(START);
  const outcome = drag.finish(DRAGGED);
  assert.equal(outcome?.drawn, true);
  // The Critical finding: the release point is the RIM. A circle centred there is off by one radius.
  assert.deepEqual(outcome?.center, { lat: START.lat, lon: START.lon });
  assert.equal(outcome?.draggedPx, 100);
  assert.ok(Math.abs((outcome?.radiusMeters ?? 0) - 100) < 1.5, `expected ~100 m, got ${outcome?.radiusMeters}`);
});

test('the preview follows the pointer while the centre stays anchored at the press point', () => {
  const drag = createCircleDrag();
  drag.begin(START);
  const preview = drag.move(DRAGGED);
  assert.deepEqual(preview?.center, { lat: START.lat, lon: START.lon });
  assert.ok(Math.abs((preview?.radiusMeters ?? 0) - 100) < 1.5);
});

test('the release click is consumed exactly once, so the NEXT tap selects normally', () => {
  const drag = createCircleDrag();
  drag.begin(START);
  drag.move(DRAGGED);
  drag.finish(DRAGGED);
  assert.equal(drag.consumeClickSuppression(), true, 'the click after a drag must be swallowed');
  assert.equal(drag.consumeClickSuppression(), false, 'consume-once: a later tap is not eaten');
});

test('a drag too small in metres is not a tap: it draws nothing but still swallows its click', () => {
  // Zoomed far out: 100 px is a real gesture, but the ground distance is ~1 m — below the 10 m floor.
  const drag = createCircleDrag();
  drag.begin(START);
  const outcome = drag.finish({ lat: 36.75381, lon: 3.0588, x: 200, y: 100 });
  assert.equal(outcome?.drawn, false);
  assert.equal(drag.consumeClickSuppression(), true, 'a gesture that moved must not become a centre pick');
});

test('a release outside the map finishes the same drag (pointer capture supplies the point)', () => {
  const drag = createCircleDrag();
  drag.begin(START);
  const outside: DragPoint = { lat: 36.7520, lon: 3.0400, x: -40, y: 380 };
  const outcome = drag.finish(outside);
  assert.equal(outcome?.drawn, true);
  assert.deepEqual(outcome?.center, { lat: START.lat, lon: START.lon });
  assert.ok((outcome?.draggedPx ?? 0) > 6);
});

test('a fresh gesture clears stale suppression: a tap after a drag is never eaten', () => {
  const drag = createCircleDrag();
  drag.begin(START);
  drag.move(DRAGGED);
  drag.finish(DRAGGED);
  // No click was generated (e.g. a touch release outside); the flag is still set.
  drag.begin(START);
  const tap = drag.finish(START);
  assert.equal(tap?.drawn, false);
  assert.equal(drag.consumeClickSuppression(), false);
});

test('move/finish without begin are no-ops, and a second press cannot re-anchor a live drag', () => {
  const drag = createCircleDrag();
  assert.equal(drag.move(START), null);
  assert.equal(drag.finish(START), null);
  assert.equal(drag.begin(START), true);
  assert.equal(drag.begin(DRAGGED), false, 'a second pointer cannot restart the first gesture');
  const outcome = drag.finish(DRAGGED);
  assert.deepEqual(outcome?.center, { lat: START.lat, lon: START.lon });
});

test('cancel never draws; a moved cancel still swallows its click, a tap cancel does not', () => {
  const drag = createCircleDrag();
  drag.begin(START);
  drag.move(DRAGGED);
  assert.equal(drag.cancel(), true);
  assert.equal(drag.finish(DRAGGED), null, 'a cancelled gesture cannot still report a circle');
  assert.equal(drag.consumeClickSuppression(), true);

  drag.begin(START);
  assert.equal(drag.cancel(), false);
  assert.equal(drag.consumeClickSuppression(), false);
});

test('reset clears an unfinished drag and any pending suppression (used when the tool is unarmed)', () => {
  const drag = createCircleDrag();
  drag.begin(START);
  drag.move(DRAGGED);
  drag.reset();
  assert.equal(drag.finish(DRAGGED), null);
  assert.equal(drag.consumeClickSuppression(), false);
});
