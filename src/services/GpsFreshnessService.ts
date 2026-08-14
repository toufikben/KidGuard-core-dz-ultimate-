import { LocationPoint } from '../types';

export type GpsFreshnessResult =
  | { accepted: true; ageMs: number }
  | { accepted: false; ageMs: number; reason: 'STALE' | 'OUT_OF_ORDER' | 'FUTURE_TIMESTAMP' };

/**
 * Protects the risk pipeline from delayed, replayed, or otherwise unusable GPS fixes.
 * A rejected fix must never mutate geofence counters or trigger/resolve an incident.
 */
export class GpsFreshnessService {
  public static readonly MAX_AGE_MS = 90_000;
  public static readonly MAX_FUTURE_SKEW_MS = 5_000;

  private static instance: GpsFreshnessService;
  private lastAcceptedTimestamp: number | null = null;

  private constructor() {}

  public static getInstance(): GpsFreshnessService {
    if (!GpsFreshnessService.instance) {
      GpsFreshnessService.instance = new GpsFreshnessService();
    }
    return GpsFreshnessService.instance;
  }

  public accept(location: LocationPoint, now = Date.now()): GpsFreshnessResult {
    const timestamp = Number(location.timestamp);
    if (!Number.isFinite(timestamp)) {
      return { accepted: false, ageMs: Infinity, reason: 'STALE' };
    }

    const ageMs = now - timestamp;
    if (ageMs < -GpsFreshnessService.MAX_FUTURE_SKEW_MS) {
      return { accepted: false, ageMs, reason: 'FUTURE_TIMESTAMP' };
    }
    if (ageMs > GpsFreshnessService.MAX_AGE_MS) {
      return { accepted: false, ageMs, reason: 'STALE' };
    }
    if (this.lastAcceptedTimestamp !== null && timestamp < this.lastAcceptedTimestamp) {
      return { accepted: false, ageMs, reason: 'OUT_OF_ORDER' };
    }

    this.lastAcceptedTimestamp = timestamp;
    return { accepted: true, ageMs };
  }

  public getLastAcceptedTimestamp(): number | null {
    return this.lastAcceptedTimestamp;
  }

  public reset(): void {
    this.lastAcceptedTimestamp = null;
  }
}
