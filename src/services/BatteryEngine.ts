export interface BatteryStatus {
  level: number; // 0-100
  state: 'NORMAL' | 'OPTIMIZED' | 'SAVING' | 'CRITICAL';
  recommendedTrackingIntervalMs: number;
}

export class BatteryEngine {
  private static instance: BatteryEngine;
  private currentLevel: number = 85; // Default mock battery level

  private constructor() {
    this.listenToBatteryApi();
  }

  public static getInstance(): BatteryEngine {
    if (!BatteryEngine.instance) {
      BatteryEngine.instance = new BatteryEngine();
    }
    return BatteryEngine.instance;
  }

  private async listenToBatteryApi(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      try {
        // @ts-expect-error navigator.getBattery standard browser API
        const battery = await navigator.getBattery();
        this.currentLevel = Math.round(battery.level * 100);

        battery.addEventListener('levelchange', () => {
          this.currentLevel = Math.round(battery.level * 100);
        });
      } catch (e) {
        console.warn('Battery API not supported on this browser, using managed battery state', e);
      }
    }
  }

  public getBatteryStatus(overrideLevel?: number): BatteryStatus {
    const level = overrideLevel !== undefined ? overrideLevel : this.currentLevel;

    if (level > 30) {
      return {
        level,
        state: 'NORMAL',
        recommendedTrackingIntervalMs: 15000, // 15s normal tracking
      };
    } else if (level > 10) {
      return {
        level,
        state: 'OPTIMIZED',
        recommendedTrackingIntervalMs: 45000, // 45s battery optimized
      };
    } else if (level > 5) {
      return {
        level,
        state: 'SAVING',
        recommendedTrackingIntervalMs: 120000, // 2m power saving
      };
    } else {
      return {
        level,
        state: 'CRITICAL',
        recommendedTrackingIntervalMs: 300000, // 5m critical low battery
      };
    }
  }

  public setMockBatteryLevel(level: number): void {
    this.currentLevel = Math.max(0, Math.min(100, level));
  }
}
