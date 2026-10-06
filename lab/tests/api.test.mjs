import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserPayload, buildDevicePayload, buildCircleGeofencePayload,
  buildRouteGeofencePayload, buildNotificationPayload, buildPermissionPayload, ApiError,
} from '../scripts/api.mjs';

test('admin payload never carries a real child name', () => {
  const payload = buildUserPayload({ name: 'lab-admin', email: 'lab@example.com', password: 'secret' });
  // The exact key SET must be {name,email,password}: no `administrator`, no real child name.
  // (The actual side is .sort()-ed, so the expected literal must be sorted too to compare sets.)
  assert.deepEqual(Object.keys(payload).sort(), ['email', 'name', 'password']);
});

test('device payload uses uniqueId as the stable key', () => {
  // No groupId: a lab server has no group, and POST /devices with groupId=1 is a live FK 400.
  assert.deepEqual(buildDevicePayload({ name: 'lab-child-1', uniqueId: 'lab-child-1' }),
    { name: 'lab-child-1', uniqueId: 'lab-child-1' });
});

test('circle geofence payload keeps Traccar WKT ordering and the 50 m floor', () => {
  const payload = buildCircleGeofencePayload({ name: 'school', lat: 36.7538, lon: 3.0588, radiusMeters: 100 });
  assert.equal(payload.area, 'CIRCLE (36.7538 3.0588, 100)');
  assert.equal(payload.name, 'school');
  assert.throws(() => buildCircleGeofencePayload({ name: 'x', lat: 1, lon: 1, radiusMeters: 10 }), /50/);
});

test('route geofence payload is a LINESTRING with a polylineDistance buffer', () => {
  const payload = buildRouteGeofencePayload({
    name: 'walk-to-park',
    points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7568, lon: 3.0621 }],
    bufferMeters: 80,
  });
  assert.equal(payload.area, 'LINESTRING (36.7538 3.0588, 36.7568 3.0621)');
  assert.equal(payload.attributes.polylineDistance, 80);
});

test('notification payload carries type + channels only, never a device or owner id', () => {
  assert.deepEqual(
    buildNotificationPayload({ type: 'geofenceExit', notificators: 'telegram,email' }),
    { type: 'geofenceExit', notificators: 'telegram,email', always: false });
});

test('permission payload is an ordered two-key id map with no type field', () => {
  assert.deepEqual(buildPermissionPayload('userId', 2, 'deviceId', 7), { userId: 2, deviceId: 7 });
  assert.deepEqual(buildPermissionPayload('deviceId', 7, 'notificationId', 3), { deviceId: 7, notificationId: 3 });
  assert.throws(() => buildPermissionPayload('userId', 2, 'user', 7), /Id/);
  assert.throws(() => buildPermissionPayload('userId', 2, 'userId', 7), /distinct/);
});

test('ApiError carries status and body', () => {
  const error = new ApiError(401, 'no session');
  assert.equal(error.status, 401);
  assert.match(error.message, /401/);
});
