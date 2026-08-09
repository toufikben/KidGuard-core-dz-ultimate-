import { HealthStatus, LocationPoint } from '../types';
import { BatteryEngine } from './BatteryEngine';
import { SecurityChecker } from './SecurityChecker';

export class HealthMonitorService {
  private static instance: HealthMonitorService;
  private lastLocationTimestamp: number | null = null;
  private lastSyncTimestamp: number | null = Date.now();
  private permissions = {
    location: true,
    notification: true,
    microphone: true,
  };

  private constructor() {}

  public static getInstance(): HealthMonitorService {
    if (!HealthMonitorService.instance) {
      HealthMonitorService.instance = new HealthMonitorService();
    }
    return HealthMonitorService.instance;
  }

  public updateLastLocationTime(timestamp: number): void {
    this.lastLocationTimestamp = timestamp;
  }

  public updateLastSyncTime(timestamp: number): void {
    this.lastSyncTimestamp = timestamp;
  }

  public setPermissionStatus(
    permission: 'location' | 'notification' | 'microphone',
    granted: boolean
  ): void {
    this.permissions[permission] = granted;
  }

  public getHealthDiagnostics(
    location: LocationPoint | null,
    batteryOverrideLevel?: number
  ): HealthStatus {
    const batteryStatus = BatteryEngine.getInstance().getBatteryStatus(batteryOverrideLevel);
    const security = SecurityChecker.getInstance().checkSecurity(
      location,
      this.permissions.location
    );

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    return {
      protectionActive: true, // Foreground service active 24/7
      gpsActive: !security.gpsDisabled && this.permissions.location,
      networkConnected: isOnline,
      batteryLevel: batteryStatus.level,
      batteryState: batteryStatus.state,
      lastLocationTime: this.lastLocationTimestamp || (location ? location.timestamp : null),
      lastSyncTime: this.lastSyncTimestamp,
      permissionsGranted: { ...this.permissions },
      mockLocationDetected: security.mockLocationDetected,
      tamperDetected: security.tamperDetected,
    };
  }
}
