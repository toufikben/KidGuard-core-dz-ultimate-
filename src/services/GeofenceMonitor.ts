import { ExitCandidateStatus, LocationPoint, SafeZone } from '../types';

export interface GeofenceEvaluation {
  status: ExitCandidateStatus;
  violatedZones: SafeZone[];
  distanceToNearestZone: number; // in meters
  nearestZoneName: string | null;
  consecutiveOutsideCount: number;
  confidence: number; // 0-100%
  insideZoneNames: string[];
}

export class GeofenceMonitor {
  private static instance: GeofenceMonitor;
  private consecutiveOutsideCount: number = 0;
  private consecutiveInsideCount: number = 0;
  private currentStatus: ExitCandidateStatus = 'SAFE_INSIDE';

  // Config parameters
  private readonly CONSECUTIVE_REQUIRED_FOR_EXIT = 3;
  private readonly CONSECUTIVE_REQUIRED_FOR_ENTRY = 2;
  private readonly HYSTERESIS_BUFFER_METERS = 15; // 15m buffer zone to avoid boundary oscillation

  private constructor() {}

  public static getInstance(): GeofenceMonitor {
    if (!GeofenceMonitor.instance) {
      GeofenceMonitor.instance = new GeofenceMonitor();
    }
    return GeofenceMonitor.instance;
  }

  /**
   * Calculate Haversine distance between two lat/lng points in meters.
   */
  public calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    if (
      typeof lat1 !== 'number' || isNaN(lat1) ||
      typeof lon1 !== 'number' || isNaN(lon1) ||
      typeof lat2 !== 'number' || isNaN(lat2) ||
      typeof lon2 !== 'number' || isNaN(lon2)
    ) {
      return 0;
    }
    const R = 6371000; // Radius of Earth in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Evaluates if a GPS point is inside active Safe Zones with accuracy confidence and hysteresis filter.
   */
  public evaluate(
    location: LocationPoint,
    activeZones: SafeZone[],
    instant1mExitEmergency: boolean = true
  ): GeofenceEvaluation {
    if (!activeZones || activeZones.length === 0) {
      return {
        status: 'SAFE_INSIDE',
        violatedZones: [],
        distanceToNearestZone: 0,
        nearestZoneName: null,
        consecutiveOutsideCount: 0,
        confidence: 100,
        insideZoneNames: ['افتراضي / Default'],
      };
    }

    // Evaluate confidence based on accuracy (lower accuracy radius = higher confidence)
    let confidence = 100;
    if (location.accuracy > 150) {
      confidence = 30; // Very poor GPS signal
    } else if (location.accuracy > 80) {
      confidence = 60;
    } else if (location.accuracy > 30) {
      confidence = 85;
    }

    const insideZoneNames: string[] = [];
    const violatedZones: SafeZone[] = [];
    let minDistance = Infinity;
    let nearestZoneName: string | null = null;

    let isInsideAnyZone = false;

    for (const zone of activeZones) {
      if (!zone.active) continue;

      const dist = this.calculateDistanceMeters(
        location.latitude,
        location.longitude,
        zone.latitude,
        zone.longitude
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearestZoneName = zone.name;
      }

      // Apply Hysteresis:
      // When inside, boundary is zone.radius + buffer
      // When outside, boundary is zone.radius
      const effectiveRadius =
        this.currentStatus === 'SAFE_INSIDE'
          ? zone.radius + this.HYSTERESIS_BUFFER_METERS
          : zone.radius;

      if (dist <= effectiveRadius) {
        isInsideAnyZone = true;
        insideZoneNames.push(zone.name);
      } else {
        violatedZones.push(zone);
      }
    }

    // State machine filter for candidate exit verification
    if (isInsideAnyZone) {
      this.consecutiveOutsideCount = 0;
      this.consecutiveInsideCount++;

      if (
        this.currentStatus !== 'SAFE_INSIDE' &&
        this.consecutiveInsideCount >= this.CONSECUTIVE_REQUIRED_FOR_ENTRY
      ) {
        this.currentStatus = 'SAFE_INSIDE';
      }
    } else {
      this.consecutiveInsideCount = 0;

      // Only count as candidate reading if GPS accuracy is reasonable (< 120m)
      if (location.accuracy <= 120) {
        this.consecutiveOutsideCount++;
      }

      if (instant1mExitEmergency || this.consecutiveOutsideCount >= this.CONSECUTIVE_REQUIRED_FOR_EXIT) {
        this.currentStatus = 'EXIT_CONFIRMED';
      } else if (this.currentStatus === 'SAFE_INSIDE') {
        this.currentStatus = 'EXIT_PENDING';
      }
    }

    return {
      status: this.currentStatus,
      violatedZones,
      distanceToNearestZone: Math.round(minDistance),
      nearestZoneName,
      consecutiveOutsideCount: this.consecutiveOutsideCount,
      confidence,
      insideZoneNames,
    };
  }

  public resetState(): void {
    this.consecutiveOutsideCount = 0;
    this.consecutiveInsideCount = 0;
    this.currentStatus = 'SAFE_INSIDE';
  }
}
