import { OfflineEvent } from '../types';
import { PairingService } from './PairingService';

const DEFAULT_EVENTS_PATH = '/api/events/batch';

export class SyncApiService {
  private static instance: SyncApiService;

  private constructor() {}

  public static getInstance(): SyncApiService {
    if (!SyncApiService.instance) SyncApiService.instance = new SyncApiService();
    return SyncApiService.instance;
  }

  private getBaseUrl(): string {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();
    if (!configured) throw new Error('VITE_API_BASE_URL is not configured');
    return configured.replace(/\/$/, '');
  }

  public async sendEvents(events: OfflineEvent[]): Promise<void> {
    const pairing = PairingService.getInstance();
    if (!pairing.isSessionValid()) throw new Error('Pairing session is not active or has expired');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${this.getBaseUrl()}${DEFAULT_EVENTS_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pairing.getPairingInfo().deviceToken}`,
          'X-KidGuard-Device': pairing.getPairingInfo().kidId,
          'Idempotency-Key': events.map((event) => event.idempotencyKey ?? event.id).join(','),
        },
        body: JSON.stringify({ events }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Sync API returned HTTP ${response.status}`);
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
