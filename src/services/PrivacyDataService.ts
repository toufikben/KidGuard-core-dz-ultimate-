const STORAGE_KEYS = [
  'kidguard_safe_zones',
  'kidguard_alert_policy',
  'kidguard_alert_history',
  'kidguard_offline_queue',
  'kidguard_protection_state',
  'kidguard_device_pairing',
  'kidguard_role',
  'kidguard_lang',
  'kidguard_theme',
] as const;

const SECRET_KEYS = new Set(['kidguard_device_pairing', 'kidguard_alert_policy']);

export interface PrivacyExport {
  exportedAt: number;
  schemaVersion: 1;
  data: Record<string, unknown>;
}

export class PrivacyDataService {
  public exportData(): PrivacyExport {
    const data: Record<string, unknown> = {};
    for (const key of STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        data[key] = SECRET_KEYS.has(key) ? this.redactSecrets(key, parsed) : parsed;
      } catch {
        data[key] = '[unreadable local value]';
      }
    }
    return { exportedAt: Date.now(), schemaVersion: 1, data };
  }

  public deleteLocalData(): void {
    for (const key of STORAGE_KEYS) localStorage.removeItem(key);
  }

  public getManagedStorageKeys(): readonly string[] {
    return STORAGE_KEYS;
  }

  private redactSecrets(key: string, value: Record<string, unknown>): Record<string, unknown> {
    const copy = { ...value };
    if (key === 'kidguard_device_pairing') {
      delete copy.deviceToken;
      delete copy.parentAccountId;
      delete copy.pairingCode;
    }
    if (key === 'kidguard_alert_policy') delete copy.parentPinHash;
    return copy;
  }
}

export const privacyDataService = new PrivacyDataService();
