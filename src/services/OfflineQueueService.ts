import { OfflineEvent } from '../types';

import { SyncApiService } from './SyncApiService';
import { randomHex } from './SecurityUtils';

export class OfflineQueueService {
  private static instance: OfflineQueueService;
  private queue: OfflineEvent[] = [];
  private STORAGE_KEY = 'kidguard_offline_queue';

  private constructor() {
    this.loadQueue();
  }

  public static getInstance(): OfflineQueueService {
    if (!OfflineQueueService.instance) {
      OfflineQueueService.instance = new OfflineQueueService();
    }
    return OfflineQueueService.instance;
  }

  private loadQueue(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch (e) {
      console.warn('Failed to load offline queue', e);
      this.queue = [];
    }
  }

  private saveQueue(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('Failed to save offline queue', e);
    }
  }

  public enqueueEvent(
    eventType: OfflineEvent['eventType'],
    incidentId: string,
    kidId: string,
    payload: Record<string, unknown>,
    zoneId?: string
  ): OfflineEvent {
    // Deduplication check: Don't enqueue identical event type for same incident if already pending
    const existing = this.queue.find(
      (e) => e.incidentId === incidentId && e.eventType === eventType && e.status === 'PENDING'
    );
    if (existing) {
      return existing;
    }

    const event: OfflineEvent = {
      id: `evt_${Date.now()}_${randomHex(8)}`,
      incidentId,
      kidId,
      zoneId,
      eventType,
      payload,
      timestamp: Date.now(),
      status: 'PENDING',
      retryCount: 0,
    };

    this.queue.push(event);
    this.saveQueue();
    return event;
  }

  public getPendingEvents(): OfflineEvent[] {
    return this.queue.filter((e) => e.status === 'PENDING' || e.status === 'FAILED');
  }

  public getAllEvents(): OfflineEvent[] {
    return [...this.queue];
  }

  public async syncQueue(): Promise<{ syncedCount: number; failedCount: number }> {
    const pending = this.getPendingEvents();
    if (pending.length === 0) {
      return { syncedCount: 0, failedCount: 0 };
    }

    let syncedCount = 0;
    let failedCount = 0;

    for (const event of pending) {
      event.status = 'SENDING';
      this.saveQueue();

      try {
        await SyncApiService.getInstance().sendEvents([event]);
        event.status = 'SENT';
        syncedCount++;
      } catch (err) {
        event.retryCount++;
        event.status = 'FAILED';
        failedCount++;
        console.warn('[OfflineQueueService] Event remains queued after sync failure', err);
      }
      this.saveQueue();
    }

    // Keep last 50 sent items
    this.queue = this.queue.filter((e) => e.status !== 'SENT').concat(
      this.queue.filter((e) => e.status === 'SENT').slice(-30)
    );
    this.saveQueue();

    return { syncedCount, failedCount };
  }

  public clearQueue(): void {
    this.queue = [];
    this.saveQueue();
  }
}
