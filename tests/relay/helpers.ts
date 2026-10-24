import type { ForwardPayload } from '../../relay/types.ts';

export function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    set: (value: number) => { t = value; },
    advance: (ms: number) => { t += ms; },
  };
}

// One payload builder so every test speaks the measured forward shape and no test invents a field.
export function forwardPayload(overrides: {
  type?: string;
  alarm?: string | null;
  eventId?: number;
  deviceId?: number;
  fixTime?: string;
  serial?: string;
  geofenceName?: string;
  attributes?: Record<string, unknown>;
} = {}): ForwardPayload {
  const {
    type = 'geofenceExit', alarm = null, eventId = 74, deviceId = 1,
    fixTime = '2026-10-24T10:00:00.000Z', serial = '1234567890HMS8',
    geofenceName = 'school', attributes = {},
  } = overrides;
  return {
    event: { id: eventId, type, eventTime: fixTime, deviceId, ...(attributes ? { attributes } : {}) },
    position: {
      id: 900 + eventId, fixTime, latitude: 36.7538, longitude: 3.0588,
      accuracy: 12, speed: 2, course: 0,
      attributes: alarm === null ? {} : { alarm },
    },
    device: { id: deviceId, name: 'lab-child-1', uniqueId: serial },
    geofence: geofenceName === '' ? null : { id: 1, name: geofenceName },
  };
}
