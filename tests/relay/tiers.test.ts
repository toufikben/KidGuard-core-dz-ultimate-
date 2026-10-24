import assert from 'node:assert/strict';
import test from 'node:test';
import { alarmName, forwardTier } from '../../relay/tiers.ts';
import { forwardPayload } from './helpers.ts';

test('tiers: alarm=sos is P0 — the only path to the highest tier (§5)', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: 'sos' })), 'P0');
  assert.equal(alarmName(forwardPayload({ type: 'alarm', alarm: 'sos' })), 'sos');
});

test('tiers: another alarm is P1, not P0', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: 'vibration' })), 'P1');
});

test('tiers: an alarm with no usable alarm name is ignored, not upgraded', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: null })), null);
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: 'none' })), null);
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: '  ' })), null);
});

test('tiers: geofenceExit is P1', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'geofenceExit' })), 'P1');
});

test('tiers: deviceOffline is P2 — never police (§5)', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'deviceOffline' })), 'P2');
});

test('tiers: every other event type is ignored', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'geofenceEnter' })), null);
  assert.equal(forwardTier(forwardPayload({ type: 'textMessage' })), null);
  assert.equal(forwardTier({}), null);
});
