// src/services/traccar/types.ts — entity shapes only; no logic lives here.
// Field names are copied from lab/report/evidence/007-app-api-surface.md, which copied them
// from the live server. If the probe did not show a field, it does not go in this file.
export type Credentials = { email: string; password: string };

export type ServerPosition = {
  id: number;
  deviceId: number;
  fixTime: string;   // ISO-8601 (MainModule.java:153-158 disables WRITE_DATES_AS_TIMESTAMPS)
  serverTime: string;
  latitude: number;
  longitude: number;
  speed: number;     // KNOTS as delivered by Traccar (model/Position.java) — the UI shows km/h
  course: number;
  accuracy: number | null;
  geofenceIds?: number[];
  attributes: Record<string, unknown>;
};

export type ServerEvent = {
  id: number;
  type: string;      // 'geofenceExit' | 'alarm' | 'deviceOffline' | … (model/Event.java:42-72)
  eventTime: string;
  deviceId: number;
  positionId?: number;
  geofenceId?: number;
  maintenanceId?: number;   // ظهر في قياس 007 §9 داخل إطار {"events":[…]} — الحقل السابع بلا استعمال عندنا
  attributes?: Record<string, unknown>;  // رسالة NotificatorWeb غير مقيسة: لا تعتمد عليها
};

export type ServerGeofence = {
  id: number;
  name: string;
  description?: string;
  area: string;                        // WKT, `lat lon` — handled only by wkt.ts
  attributes?: Record<string, unknown>;
};

export type ServerDevice = { id: number; name: string; uniqueId: string; status?: string; lastUpdate?: string };
export type ServerUser = { id: number; name?: string; email: string; admin?: boolean };
