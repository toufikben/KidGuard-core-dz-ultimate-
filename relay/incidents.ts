// relay/incidents.ts — the escalation state machine.
// One incident per forwarded event: every recipient is sent in parallel, then ONE current recipient
// owns a window that starts at delivery (else send) and climbs the recipient list on expiry. An ack
// assigns ownership and stops the ladder; it closes and de-tiers nothing. Silence degrades every
// open incident and clears its assignee. All time is injected; the server drives `tick`.
import { type AuditLog } from './audit.ts';
import { RelayError } from './errors.ts';
import { renderIncidentSheet } from './sheet.ts';
import { alarmName, forwardTier } from './tiers.ts';
import type {
  Delivery, ForwardPayload, Incident, IncidentTimelineEntry, IncidentPosition,
  RelayRecipient, RelayTier,
} from './types.ts';

const DEFAULT_WINDOW_MS = 60_000;
const MAX_NAME = 40;

export type IncidentStoreOptions = {
  audit: AuditLog;
  recipients: RelayRecipient[] | (() => RelayRecipient[]);
  now?: () => number;
  windowMs?: number;
};

function finiteOrNull(value: unknown, min = -Infinity, max = Infinity): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function parseIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function boundedName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name === '') return null;
  return name.length > MAX_NAME ? name.slice(0, MAX_NAME) : name;
}

// A serial of four characters or fewer is the WHOLE serial, so it is not printed at all.
function lastFour(uniqueId: unknown): string | null {
  if (typeof uniqueId !== 'string') return null;
  const compact = uniqueId.replace(/\s+/g, '');
  return compact.length > 4 ? compact.slice(-4) : null;
}

function positionOf(payload: ForwardPayload, at: number): IncidentPosition {
  const source = payload.position ?? {};
  const fixTime = parseIso(source.fixTime);
  return {
    latitude: finiteOrNull(source.latitude, -90, 90),
    longitude: finiteOrNull(source.longitude, -180, 180),
    accuracy: finiteOrNull(source.accuracy, 0, 100_000),
    speedKnots: finiteOrNull(source.speed, 0, 1_000),
    fixTime,
    ageMs: fixTime === null ? null : Math.max(0, at - Date.parse(fixTime)),
  };
}

function normalizeRecipients(list: RelayRecipient[]): RelayRecipient[] {
  const seen = new Set<number>();
  const out: RelayRecipient[] = [];
  for (const recipient of list) {
    if (!Number.isFinite(recipient.userId) || recipient.userId <= 0 || seen.has(recipient.userId)) continue;
    seen.add(recipient.userId);
    const name = boundedName(recipient.name);
    out.push(name === null ? { userId: recipient.userId } : { userId: recipient.userId, name });
  }
  return out.sort((a, b) => a.userId - b.userId);
}

export function createIncidentStore({
  audit, recipients, now = () => Date.now(), windowMs = DEFAULT_WINDOW_MS,
}: IncidentStoreOptions) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('windowMs must be a positive finite number');
  const incidents: Incident[] = [];
  let nextId = 1;

  const currentRecipients = (): RelayRecipient[] => normalizeRecipients(
    typeof recipients === 'function' ? recipients() : recipients,
  );

  const find = (id: string): Incident => {
    const incident = incidents.find((item) => item.id === id);
    if (!incident) throw new RelayError('notfound', 404, 'no incident with that id');
    return incident;
  };

  const timeline = (incident: Incident, action: string, detail: Record<string, unknown> = {}) => {
    const entry: IncidentTimelineEntry = { at: new Date(now()).toISOString(), action, detail };
    incident.timeline.push(entry);
  };

  const deliveryOf = (incident: Incident, userId: number): Delivery => {
    const delivery = incident.deliveries.find((item) => item.userId === userId);
    if (!delivery) throw new RelayError('forbidden', 403, 'this guardian is not a recipient of the incident');
    return delivery;
  };

  const baseMs = (delivery: Delivery): number =>
    delivery.deliveredAt !== null ? Date.parse(delivery.deliveredAt) : Date.parse(delivery.sentAt);

  const advance = (incident: Incident, at: number): void => {
    if (incident.degraded || incident.state !== 'active' || incident.deadlineAt === null) return;
    let guard = 0;
    while (!incident.degraded && incident.state === 'active'
      && incident.deadlineAt !== null && at >= Date.parse(incident.deadlineAt) && guard < 100) {
      guard += 1;
      const from = incident.currentRecipientUserId;
      const index = incident.recipients.findIndex((recipient) => recipient.userId === from);
      const expiredDeadline = incident.deadlineAt;
      if (index < 0 || index >= incident.recipients.length - 1) {
        incident.atEnd = true;
        incident.deadlineAt = null;
        audit.record('window_expired', { incidentId: incident.id, userId: from, atEnd: true, deadlineAt: expiredDeadline });
        timeline(incident, 'window_expired', { userId: from, atEnd: true });
        return;
      }
      audit.record('window_expired', { incidentId: incident.id, userId: from, atEnd: false, deadlineAt: expiredDeadline });
      timeline(incident, 'window_expired', { userId: from, atEnd: false });
      const next = incident.recipients[index + 1];
      const nextDelivery = incident.deliveries[index + 1];
      const deliveryMs = nextDelivery.deliveredAt === null ? null : Date.parse(nextDelivery.deliveredAt);
      const start = Math.max(at, baseMs(nextDelivery));
      incident.currentRecipientUserId = next.userId;
      incident.deadlineAt = new Date(start + incident.windowMs).toISOString();
      audit.record('escalation', {
        incidentId: incident.id, from, to: next.userId,
        basis: deliveryMs !== null && deliveryMs >= at ? 'delivered' : 'sent',
        anchorAt: new Date(start).toISOString(),
        deadlineAt: incident.deadlineAt,
      });
      timeline(incident, 'escalation', { from, to: next.userId });
    }
  };

  return {
    ingest(payload: ForwardPayload): Incident | null {
      const event = payload.event;
      if (!event || !Number.isFinite(event.id) || typeof event.type !== 'string') {
        audit.record('ignored', { reason: 'no_event' });
        return null;
      }
      // The source retries; the same event id must never become a second incident or a second send.
      const existing = incidents.find((item) => item.eventId === event.id);
      if (existing) return structuredClone(existing);
      const tier = forwardTier(payload);
      if (tier === null) {
        audit.record('ignored', { reason: 'tier_none', eventId: event.id, eventType: event.type });
        return null;
      }
      const list = currentRecipients();
      if (list.length === 0) {
        audit.record('ignored', { reason: 'no_recipients', eventId: event.id });
        return null;
      }
      const at = now();
      const createdAt = new Date(at).toISOString();
      const id = `inc-${String(nextId).padStart(4, '0')}`;
      nextId += 1;
      const eventTime = parseIso(event.eventTime) ?? createdAt;
      const incident: Incident = {
        id,
        eventId: event.id,
        eventType: event.type,
        alarm: alarmName(payload),
        tier: tier as RelayTier,
        state: 'active',
        deviceId: Number.isFinite(event.deviceId) ? event.deviceId : 0,
        deviceName: boundedName(payload.device?.name),
        deviceSerialLast4: lastFour(payload.device?.uniqueId),
        geofenceName: boundedName(payload.geofence?.name),
        eventTime,
        createdAt,
        position: positionOf(payload, at),
        recipients: list,
        deliveries: list.map((recipient) => ({
          userId: recipient.userId, state: 'sent', sentAt: createdAt, deliveredAt: null, openedAt: null,
        })),
        currentRecipientUserId: list[0].userId,
        assigneeUserId: null,
        degraded: false,
        windowMs,
        deadlineAt: new Date(at + windowMs).toISOString(),
        atEnd: false,
        timeline: [],
      };
      timeline(incident, 'ingest', { eventId: event.id });
      incidents.push(incident);
      audit.record('ingest', { incidentId: id, eventId: event.id, eventType: event.type, tier });
      for (const recipient of list) audit.record('sent', { incidentId: id, userId: recipient.userId });
      return structuredClone(incident);
    },

    delivered(id: string, userId: number): Incident {
      const incident = find(id);
      const delivery = deliveryOf(incident, userId);
      if (delivery.state !== 'sent') return structuredClone(incident);
      const at = now();
      const iso = new Date(at).toISOString();
      delivery.deliveredAt = iso;
      delivery.state = 'delivered';
      audit.record('delivered', { incidentId: id, userId, inferred: false });
      timeline(incident, 'delivered', { userId });
      if (!incident.atEnd && !incident.degraded && incident.state === 'active' && incident.currentRecipientUserId === userId) {
        const next = at + incident.windowMs;
        if (incident.deadlineAt === null || next > Date.parse(incident.deadlineAt)) {
          incident.deadlineAt = new Date(next).toISOString();
        }
      }
      return structuredClone(incident);
    },

    opened(id: string, userId: number): Incident {
      const incident = find(id);
      const delivery = deliveryOf(incident, userId);
      if (delivery.state === 'opened') return structuredClone(incident);
      const at = now();
      const iso = new Date(at).toISOString();
      if (delivery.deliveredAt === null) {
        delivery.deliveredAt = iso;
        audit.record('delivered', { incidentId: id, userId, inferred: true });
        timeline(incident, 'delivered', { userId, inferred: true });
        if (!incident.atEnd && !incident.degraded && incident.state === 'active' && incident.currentRecipientUserId === userId) {
          const next = at + incident.windowMs;
          if (incident.deadlineAt === null || next > Date.parse(incident.deadlineAt)) {
            incident.deadlineAt = new Date(next).toISOString();
          }
        }
      }
      delivery.openedAt = iso;
      delivery.state = 'opened';
      audit.record('opened', { incidentId: id, userId });
      timeline(incident, 'opened', { userId });
      return structuredClone(incident);
    },

    ack(id: string, userId: number): { incident: Incident; changed: boolean } {
      const incident = find(id);
      deliveryOf(incident, userId);
      if (incident.assigneeUserId !== null && incident.assigneeUserId !== userId) {
        throw new RelayError('conflict', 409, 'another guardian already acknowledged this incident');
      }
      if (incident.assigneeUserId === userId) return { incident: structuredClone(incident), changed: false };
      incident.assigneeUserId = userId;
      if (!incident.degraded) {
        incident.state = 'assigned';
        incident.deadlineAt = null;
      }
      audit.record('ack', { incidentId: id, userId, assigneeUserId: userId, afterDegraded: incident.degraded });
      timeline(incident, 'ack', { userId });
      return { incident: structuredClone(incident), changed: true };
    },

    degradeOpen(reason: string): number {
      let count = 0;
      for (const incident of incidents) {
        if (incident.degraded) continue;
        const previousAssignee = incident.assigneeUserId;
        incident.degraded = true;
        incident.state = 'degraded';
        incident.assigneeUserId = null;
        incident.deadlineAt = null;
        incident.atEnd = true;
        if (incident.recipients.length > 0) {
          incident.currentRecipientUserId = incident.recipients[incident.recipients.length - 1].userId;
        }
        audit.record('degraded', { incidentId: incident.id, reason, previousAssignee });
        audit.record('escalation', {
          incidentId: incident.id, to: incident.currentRecipientUserId, reason,
        });
        timeline(incident, 'degraded', { reason });
        count += 1;
      }
      return count;
    },

    tick(at: number = now()): void {
      for (const incident of incidents) advance(incident, at);
    },

    get(id: string): Incident {
      return structuredClone(find(id));
    },

    sheet(id: string, at: number = now()): string {
      return renderIncidentSheet(find(id), at);
    },

    list(): Incident[] {
      return structuredClone(incidents.slice().reverse());
    },
  };
}

export type IncidentStore = ReturnType<typeof createIncidentStore>;
