// src/services/traccar/events.ts — the live event log and the exit debounce (Task 10).
//
// What this layer is allowed to know, and what it refuses:
//  - A server event is a fact about the device, not a verdict about the child. `tierOf` maps the three
//    measured types onto the spec's §5 ladder and nothing else: alarm→P0, geofenceExit→P1,
//    deviceOffline→P2, every other type→none. P2 stays in-app only; no bell, no call and no police
//    word exists anywhere in this file (R-M1-35).
//  - `geofenceExit` alone is NOT an alert. R-M1-31: the exit is confirmed only after three consecutive
//    readings of that device whose `position.geofenceIds` does NOT contain the event's `geofenceId`.
//    A reading that puts the zone back cancels the pending exit and resets its count; one reading is
//    never an alert. No polygon or distance maths happens here — the boundary margin (≥50 m) is NOT
//    implemented in M1 and is recorded as named debt for M2.
//  - Age is measured from the server's own `eventTime` / `fixTime`, against an injectable clock. An
//    event older than 15 minutes is not a live event (R-M1-32); it enters neither the log nor the
//    counter. The same rule stops a retransmitted old fix from satisfying the debounce.
//  - The log lives in session memory only. It names no browser storage, no historical from/to
//    request and no historical events route (R-M1-9, R-M1-32). Every instance starts empty and says
//    `sinceOpened` so the screen can never present it as a complete history.
import type { ServerEvent, ServerPosition } from './types.ts';

export type AlertTier = 'P0' | 'P1' | 'P2' | 'none';

// §6: N readings outside the boundary before the alert; the owner's default is three.
export const EXIT_CONFIRMATION_READS = 3;

// A server event older than this is part of no live session. Measured against an injectable clock.
export const LIVE_EVENT_MAX_AGE_MS = 15 * 60 * 1000;

// Mirrors positions.ts MAX_FUTURE_SKEW_MS: a few seconds of device-clock skew is tolerated, anything
// more is not a reading we can date.
const MAX_FUTURE_SKEW_MS = 5_000;

export function tierOf(event: Pick<ServerEvent, 'type'>): AlertTier {
  switch (event?.type) {
    case 'alarm': return 'P0';
    case 'geofenceExit': return 'P1';
    case 'deviceOffline': return 'P2';
    default: return 'none';
  }
}

// The minimum a reading must carry to take part in the debounce. `geofenceIds` is optional on the
// measured ServerPosition; an absent list means the zone id is not in it, exactly as R-M1-31 says.
export type LivePosition = Pick<ServerPosition, 'deviceId' | 'fixTime'> & {
  id?: number;
  geofenceIds?: number[];
};

export type ExitAlert = {
  deviceId: number;
  geofenceId: number;
  eventId: number;
  count: number;
  at: number;
  // The server event that opened the count, handed back so the log stores the server's own row.
  event: ServerEvent;
};

export type PendingExit = {
  deviceId: number;
  geofenceId: number;
  eventId: number;
  count: number;
};

export type ExitTrackerOptions = {
  threshold?: number;
  staleAfterMs?: number;
  now?: () => number;
};

export type ExitTracker = {
  noteEvent: (event: ServerEvent) => boolean;
  notePosition: (position: LivePosition) => ExitAlert[];
  pending: () => PendingExit[];
  reset: () => void;
};

type PendingRecord = PendingExit & {
  event: ServerEvent;
  eventMs: number;
  lastFixMs: number | null;
  lastPositionId: number | null;
};

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// null means "not a dateable instant"; an event/reading we cannot date is never counted.
function instantOf(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isLiveInstant(ms: number, now: number, staleAfterMs: number): boolean {
  if (!Number.isFinite(now)) return false;
  const age = now - ms;
  return Number.isFinite(age) && age <= staleAfterMs && age >= -MAX_FUTURE_SKEW_MS;
}

const pendingKey = (deviceId: number, geofenceId: number) => `${deviceId}:${geofenceId}`;

export function createExitTracker({
  threshold = EXIT_CONFIRMATION_READS,
  staleAfterMs = LIVE_EVENT_MAX_AGE_MS,
  now = Date.now,
}: ExitTrackerOptions = {}): ExitTracker {
  // A threshold below one would make every event an alert before any reading; refuse it by keeping
  // the default. No screen can configure this in M1.
  const reads = Number.isFinite(threshold) && threshold >= 1 ? Math.floor(threshold) : EXIT_CONFIRMATION_READS;
  const pending = new Map<string, PendingRecord>();

  return {
    noteEvent(event) {
      if (event?.type !== 'geofenceExit') return false;
      const deviceId = finiteNumber(event.deviceId);
      const geofenceId = finiteNumber(event.geofenceId);
      const eventMs = instantOf(event.eventTime);
      if (deviceId === null || geofenceId === null || eventMs === null) return false;
      if (!isLiveInstant(eventMs, now(), staleAfterMs)) return false;
      // A repeated exit for the same device+zone restarts the count: the server is telling us the
      // child is outside again, so the previous count is no longer the evidence for this exit.
      pending.set(pendingKey(deviceId, geofenceId), {
        deviceId,
        geofenceId,
        eventId: finiteNumber(event.id) ?? 0,
        count: 0,
        event,
        eventMs,
        lastFixMs: null,
        lastPositionId: null,
      });
      return true;
    },

    notePosition(position) {
      const deviceId = finiteNumber(position?.deviceId);
      const fixMs = instantOf(position?.fixTime);
      if (deviceId === null || fixMs === null) return [];
      if (!isLiveInstant(fixMs, now(), staleAfterMs)) return [];

      const alerts: ExitAlert[] = [];
      for (const [key, record] of pending) {
        if (record.deviceId !== deviceId) continue;

        // Replay and retransmission guards come FIRST (R-M1-31): an old or re-delivered row is not
        // a new observation, so it may neither count as outside evidence nor cancel a live count.
        const positionId = finiteNumber(position.id);
        if (positionId !== null && record.lastPositionId === positionId) continue;
        if (record.lastFixMs !== null && fixMs <= record.lastFixMs) continue;
        // A reading dated at or before the exit event cannot describe the world after that exit.
        if (fixMs <= record.eventMs) continue;

        // R-M1-31: a NEW reading that puts the zone back is the reset — cancel, do not pause.
        const inside = Array.isArray(position.geofenceIds) && position.geofenceIds.includes(record.geofenceId);
        if (inside) {
          pending.delete(key);
          continue;
        }

        record.count += 1;
        record.lastFixMs = fixMs;
        record.lastPositionId = positionId;

        if (record.count >= reads) {
          pending.delete(key);
          alerts.push({
            deviceId: record.deviceId,
            geofenceId: record.geofenceId,
            eventId: record.eventId,
            count: record.count,
            at: now(),
            event: record.event,
          });
        }
      }
      return alerts;
    },

    pending: () => Array.from(pending.values()).map(({ deviceId, geofenceId, eventId, count }) => ({
      deviceId, geofenceId, eventId, count,
    })),

    reset: () => { pending.clear(); },
  };
}

// ── the session log ─────────────────────────────────────────────────────────────────────────────

export type LoggedEvent = {
  event: ServerEvent;
  tier: AlertTier;
  receivedAt: number;
  acknowledged: boolean;
  // For a confirmed geofenceExit: how many consecutive outside readings fired it (spec: every alert
  // carries the evidence that raised it). Absent for every other row.
  evidenceCount?: number;
};

export type EventLogOptions = ExitTrackerOptions;

export type EventLog = {
  // A literal, not a date: the screen prints the since-opened sentence and never implies a full
  // history.
  readonly sinceOpened: true;
  readonly entries: LoggedEvent[];
  accept: (event: ServerEvent) => LoggedEvent | null;
  notePosition: (position: LivePosition) => ExitAlert[];
  acknowledge: (eventId: number) => void;
  pendingAck: () => LoggedEvent[];
  pendingExits: () => PendingExit[];
  reset: () => void;
};

// R-M1-32: the log is per session and nothing in it survives a re-open.
export function eventLog(options: EventLogOptions = {}): EventLog {
  const now = options.now ?? Date.now;
  const tracker = createExitTracker(options);
  const entries: LoggedEvent[] = [];

  const accept = (event: ServerEvent): LoggedEvent | null => {
    const deviceId = finiteNumber(event?.deviceId);
    const eventMs = instantOf(event?.eventTime);
    if (typeof event?.type !== 'string' || deviceId === null || eventMs === null) return null;
    if (!isLiveInstant(eventMs, now(), options.staleAfterMs ?? LIVE_EVENT_MAX_AGE_MS)) return null;

    if (event.type === 'geofenceExit') {
      // Held pending: not an alert, not a log row, until the readings confirm it. One outside read
      // therefore cannot surface as an alert (R-M1-31 / Step 1 (د)).
      tracker.noteEvent(event);
      return null;
    }

    const entry: LoggedEvent = {
      event,
      tier: tierOf(event),
      receivedAt: now(),
      acknowledged: false,
    };
    entries.push(entry);
    return entry;
  };

  return {
    sinceOpened: true,
    entries,
    accept,
    notePosition(position) {
      const alerts = tracker.notePosition(position);
      for (const alert of alerts) {
        entries.push({
          event: alert.event,
          tier: 'P1',
          receivedAt: now(),
          acknowledged: false,
          evidenceCount: alert.count,
        });
      }
      return alerts;
    },
    acknowledge(eventId) {
      for (const entry of entries) {
        if (entry.event.id === eventId) entry.acknowledged = true;
      }
    },
    pendingAck: () => pendingAck(entries),
    pendingExits: () => tracker.pending(),
    reset() {
      entries.length = 0;
      tracker.reset();
    },
  };
}

// R-M1-32 / §12: the screen shows ONE line for unacknowledged P0/P1 events instead of flooding the
// log. P2 and `none` are information, never an acknowledgement demand.
export function pendingAck(events: readonly LoggedEvent[]): LoggedEvent[] {
  return events.filter((entry) => (entry.tier === 'P0' || entry.tier === 'P1') && !entry.acknowledged);
}
