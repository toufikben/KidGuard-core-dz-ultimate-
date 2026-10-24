// relay/types.ts — entity shapes only; no logic lives here.
// Field names follow the measured Traccar forward payload (evidence 005/010) and the M1 client types.
export type RelayTier = 'P0' | 'P1' | 'P2';

export type ForwardEvent = {
  id: number;
  type: string;
  eventTime: string;
  deviceId: number;
  positionId?: number;
  geofenceId?: number;
  attributes?: Record<string, unknown>;
};

export type ForwardPosition = {
  id?: number;
  fixTime?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  speed?: number;
  course?: number;
  attributes?: Record<string, unknown>;
};

export type ForwardDevice = { id?: number; name?: string; uniqueId?: string };
export type ForwardGeofence = { id?: number; name?: string };

export type ForwardPayload = {
  event?: ForwardEvent | null;
  position?: ForwardPosition | null;
  device?: ForwardDevice | null;
  geofence?: ForwardGeofence | null;
};

export type RelayRecipient = { userId: number; name?: string };
export type DeliveryState = 'sent' | 'delivered' | 'opened';
export type Delivery = {
  userId: number;
  state: DeliveryState;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
};

export type IncidentState = 'active' | 'assigned' | 'degraded';
export type IncidentPosition = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speedKnots: number | null;
  fixTime: string | null;
  ageMs: number | null;
};
export type IncidentTimelineEntry = { at: string; action: string; detail: Record<string, unknown> };

export type Incident = {
  id: string;
  eventId: number;
  eventType: string;
  alarm: string | null;
  tier: RelayTier;
  state: IncidentState;
  deviceId: number;
  deviceName: string | null;
  deviceSerialLast4: string | null;
  geofenceName: string | null;
  eventTime: string;
  createdAt: string;
  position: IncidentPosition;
  recipients: RelayRecipient[];
  deliveries: Delivery[];
  currentRecipientUserId: number | null;
  assigneeUserId: number | null;
  degraded: boolean;
  windowMs: number;
  deadlineAt: string | null;
  atEnd: boolean;
  timeline: IncidentTimelineEntry[];
};
