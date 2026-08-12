import {
  CheckInRequest,
  CheckInStatus,
  LastKnownLocation,
  LocationPoint,
  ProtectionIncident,
} from '../types';

const STATE_KEY = 'kidguard_protection_state';
const STALE_AFTER_MS = 5 * 60 * 1000;
const CHECK_IN_TTL_MS = 2 * 60 * 1000;

type PersistedState = {
  incident: ProtectionIncident | null;
  lastKnownLocation: LastKnownLocation | null;
  checkIn: CheckInRequest | null;
};

function now(): number {
  return Date.now();
}

function safeId(prefix: string): string {
  const bytes = new Uint32Array(2);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return `${prefix}_${now()}_${bytes[0].toString(36)}${bytes[1].toString(36)}`;
  }
  return `${prefix}_${now()}`;
}

export class ProtectionStateService {
  private static instance: ProtectionStateService;
  private state: PersistedState = {
    incident: null,
    lastKnownLocation: null,
    checkIn: null,
  };

  private constructor() {
    this.load();
    this.expireCheckIn();
  }

  public static getInstance(): ProtectionStateService {
    if (!ProtectionStateService.instance) {
      ProtectionStateService.instance = new ProtectionStateService();
    }
    return ProtectionStateService.instance;
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      this.state = {
        incident: parsed.incident ?? null,
        lastKnownLocation: parsed.lastKnownLocation ?? null,
        checkIn: parsed.checkIn ?? null,
      };
    } catch {
      this.state = { incident: null, lastKnownLocation: null, checkIn: null };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
    } catch {
      // Local persistence is best effort; the live state remains available.
    }
  }

  private expireCheckIn(): void {
    const checkIn = this.state.checkIn;
    if (!checkIn || checkIn.status !== 'PENDING' || checkIn.expiresAt > now()) return;
    checkIn.status = 'EXPIRED';
    if (this.state.incident?.checkIn?.id === checkIn.id) {
      this.state.incident.checkIn = checkIn;
      this.state.incident.updatedAt = now();
    }
    this.save();
  }

  public getLastKnownLocation(referenceTime = now()): LastKnownLocation | null {
    const snapshot = this.state.lastKnownLocation;
    if (!snapshot) return null;
    return { ...snapshot, isStale: referenceTime - snapshot.capturedAt > STALE_AFTER_MS };
  }

  public recordLocation(
    point: LocationPoint,
    source: LastKnownLocation['source'] = 'LIVE_GPS',
    capturedAt = now()
  ): LastKnownLocation {
    const snapshot: LastKnownLocation = {
      point: { ...point },
      source,
      capturedAt,
      isStale: false,
    };
    this.state.lastKnownLocation = snapshot;
    if (this.state.incident) {
      this.state.incident.lastKnownLocation = snapshot;
      this.state.incident.updatedAt = capturedAt;
    }
    this.save();
    return snapshot;
  }

  public getIncident(): ProtectionIncident | null {
    this.expireCheckIn();
    return this.state.incident ? structuredClone(this.state.incident) : null;
  }

  public startIncident(childId: string, reason: string, location?: LastKnownLocation): ProtectionIncident {
    const timestamp = now();
    const existing = this.state.incident;
    if (existing && existing.status !== 'RESOLVED' && existing.status !== 'NONE') {
      existing.updatedAt = timestamp;
      if (location) existing.lastKnownLocation = location;
      this.save();
      return structuredClone(existing);
    }
    const incident: ProtectionIncident = {
      id: safeId('incident'),
      childId,
      status: 'MONITORING',
      startedAt: timestamp,
      updatedAt: timestamp,
      reason,
      lastKnownLocation: location ?? this.getLastKnownLocation(timestamp),
      checkIn: null,
    };
    this.state.incident = incident;
    this.save();
    return structuredClone(incident);
  }

  public escalateIncident(reason?: string): ProtectionIncident | null {
    const incident = this.state.incident;
    if (!incident) return null;
    incident.status = 'ESCALATED';
    incident.updatedAt = now();
    if (reason) incident.reason = reason;
    this.save();
    return structuredClone(incident);
  }

  public resolveIncident(): ProtectionIncident | null {
    const incident = this.state.incident;
    if (!incident) return null;
    incident.status = 'RESOLVED';
    incident.updatedAt = now();
    this.save();
    return structuredClone(incident);
  }

  public requestCheckIn(childId: string, ttlMs = CHECK_IN_TTL_MS): CheckInRequest {
    const timestamp = now();
    const checkIn: CheckInRequest = {
      id: safeId('checkin'),
      childId,
      requestedAt: timestamp,
      expiresAt: timestamp + Math.max(1000, ttlMs),
      respondedAt: null,
      status: 'PENDING',
    };
    this.state.checkIn = checkIn;
    if (!this.state.incident || this.state.incident.status === 'RESOLVED') {
      this.startIncident(childId, 'Check-in requested');
    }
    if (this.state.incident) {
      this.state.incident.checkIn = checkIn;
      this.state.incident.updatedAt = timestamp;
    }
    this.save();
    return structuredClone(checkIn);
  }

  public respondToCheckIn(status: Extract<CheckInStatus, 'CONFIRMED' | 'CANCELLED'> = 'CONFIRMED'): CheckInRequest | null {
    this.expireCheckIn();
    const checkIn = this.state.checkIn;
    if (!checkIn || checkIn.status !== 'PENDING') return null;
    checkIn.status = status;
    checkIn.respondedAt = now();
    if (this.state.incident?.checkIn?.id === checkIn.id) {
      this.state.incident.checkIn = checkIn;
      this.state.incident.updatedAt = checkIn.respondedAt;
    }
    this.save();
    return structuredClone(checkIn);
  }

  public reset(): void {
    this.state = { incident: null, lastKnownLocation: null, checkIn: null };
    try {
      localStorage.removeItem(STATE_KEY);
    } catch {
      // ignore
    }
  }

  public static getStaleAfterMs(): number {
    return STALE_AFTER_MS;
  }
}
