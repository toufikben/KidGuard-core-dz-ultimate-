/**
 * Background GPS for KidGuard DZ (Capacitor)
 * Uses @capacitor-community/background-geolocation
 * Works in foreground + background with Android foreground-service notification.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { LocationPoint } from '../types';
import { BatteryEngine } from './BatteryEngine';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  'BackgroundGeolocation'
);

export type LocationCallback = (loc: LocationPoint) => void;

export class BackgroundLocationService {
  private static instance: BackgroundLocationService;
  private watcherId: string | null = null;
  private isRunning = false;
  private callbacks: LocationCallback[] = [];
  private lastLocation: LocationPoint | null = null;

  private constructor() {}

  public static getInstance(): BackgroundLocationService {
    if (!BackgroundLocationService.instance) {
      BackgroundLocationService.instance = new BackgroundLocationService();
    }
    return BackgroundLocationService.instance;
  }

  public isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public onLocation(cb: LocationCallback): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((c) => c !== cb);
    };
  }

  public getLastLocation(): LocationPoint | null {
    return this.lastLocation;
  }

  public isTracking(): boolean {
    return this.isRunning;
  }

  /**
   * Request notification permission (Android 13+) so the
   * persistent "tracking" notification can be shown.
   */
  private async ensureNotificationPermission(): Promise<void> {
    if (!this.isNative()) return;
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    } catch (e) {
      console.warn('[BG Location] notification permission', e);
    }
  }

  /**
   * Adaptive distance filter based on battery (saves power in Algeria)
   */
  private getDistanceFilterMeters(): number {
    const level = BatteryEngine.getInstance().getBatteryStatus().level;
    if (level <= 10) return 100; // critical → less frequent
    if (level <= 20) return 50;
    if (level <= 40) return 25;
    return 15; // normal high accuracy
  }

  /**
   * Start continuous background tracking.
   * On Android a persistent notification is required by the OS.
   */
  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

    // Web fallback: caller should keep using navigator.geolocation
    if (!this.isNative()) {
      console.info('[BG Location] Web platform – use HTML5 geolocation');
      return false;
    }

    await this.ensureNotificationPermission();

    const distanceFilter = this.getDistanceFilterMeters();

    try {
      const id = await BackgroundGeolocation.addWatcher(
        {
          // Arabic notification text for Algeria users
          backgroundTitle: 'كيدغارد – حماية الطفل نشطة',
          backgroundMessage:
            'جاري تتبع موقع الطفل في الخلفية لحماية سلامته. اضغط للعودة للتطبيق.',
          requestPermissions: true,
          stale: false,
          distanceFilter,
        },
        (location, error) => {
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') {
              console.warn('[BG Location] Permission denied');
              // Optionally open settings
              BackgroundGeolocation.openSettings().catch(() => {});
            } else {
              console.warn('[BG Location] error', error);
            }
            return;
          }

          if (!location) return;

          const point: LocationPoint = {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy ?? 20,
            speed: location.speed ?? 0,
            heading: location.bearing ?? 0,
            altitude: location.altitude ?? 0,
            timestamp: location.time ?? Date.now(),
            isMockLocation: !!(location as { simulated?: boolean }).simulated,
          };

          this.lastLocation = point;
          this.callbacks.forEach((cb) => {
            try {
              cb(point);
            } catch (e) {
              console.warn('[BG Location] callback error', e);
            }
          });
        }
      );

      this.watcherId = id;
      this.isRunning = true;
      console.info('[BG Location] started, watcher=', id, 'filter=', distanceFilter);
      return true;
    } catch (e) {
      console.error('[BG Location] failed to start', e);
      this.isRunning = false;
      return false;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning || !this.watcherId) return;

    try {
      await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
    } catch (e) {
      console.warn('[BG Location] removeWatcher', e);
    }

    this.watcherId = null;
    this.isRunning = false;
    console.info('[BG Location] stopped');
  }

  /** Restart with new distance filter (e.g. after battery change) */
  public async restart(): Promise<boolean> {
    await this.stop();
    return this.start();
  }
}