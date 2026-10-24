// relay/tiers.ts — forward payload → escalation tier.
// P0 is the SOS button only (§5). A bare `alarm` event with no usable alarm name is not evidence,
// so it is ignored rather than promoted; the M1 UI mapping was display-only.
import type { ForwardPayload, RelayTier } from './types.ts';

function usableAlarm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const alarm = value.trim();
  if (alarm === '' || alarm.toLowerCase() === 'none') return null;
  return alarm;
}

export function alarmName(payload: ForwardPayload): string | null {
  return usableAlarm(payload.position?.attributes?.alarm ?? payload.event?.attributes?.alarm);
}

export function forwardTier(payload: ForwardPayload): RelayTier | null {
  const type = payload.event?.type;
  if (typeof type !== 'string' || type === '') return null;
  if (type === 'alarm') {
    const alarm = alarmName(payload);
    if (alarm === null) return null;
    return alarm.toLowerCase() === 'sos' ? 'P0' : 'P1';
  }
  if (type === 'geofenceExit') return 'P1';
  if (type === 'deviceOffline') return 'P2';
  return null;
}
