import { LocationPoint } from '../types';

export interface SecurityStatus {
  mockLocationDetected: boolean;
  tamperDetected: boolean;
  gpsDisabled: boolean;
  permissionsRevoked: boolean;
  reasons: string[];
}

export class SecurityChecker {
  private static instance: SecurityChecker;

  private constructor() {}

  public static getInstance(): SecurityChecker {
    if (!SecurityChecker.instance) {
      SecurityChecker.instance = new SecurityChecker();
    }
    return SecurityChecker.instance;
  }

  public checkSecurity(
    location: LocationPoint | null,
    hasLocationPermission: boolean
  ): SecurityStatus {
    const reasons: string[] = [];
    let mockLocationDetected = false;
    let tamperDetected = false;
    let gpsDisabled = false;
    let permissionsRevoked = false;

    if (!hasLocationPermission) {
      permissionsRevoked = true;
      reasons.push('Location permission revoked by user or system');
    }

    if (!location) {
      gpsDisabled = true;
      reasons.push('GPS sensor disabled or no fix available');
    } else {
      if (location.isMockLocation) {
        mockLocationDetected = true;
        reasons.push('Mock location provider detected on Android device');
      }

      // Check for unrealistically perfect accuracy (often associated with fake GPS apps)
      if (location.accuracy === 0) {
        mockLocationDetected = true;
        reasons.push('Anomalous GPS accuracy (0m) detected');
      }
    }

    // Tamper detection logic
    if (mockLocationDetected) {
      tamperDetected = true;
    }

    return {
      mockLocationDetected,
      tamperDetected,
      gpsDisabled,
      permissionsRevoked,
      reasons,
    };
  }
}
