// src/services/traccar/zones.ts — the drawn zone goes to the SERVER and the server stays the truth
// (AC-2). Task 8. Every write re-reads `/geofences` before the screen shows anything; no zone list is
// ever kept in local state or in a browser-storage record (AC-2 forbids it), and the
// admin gate is read from whoAmI() — the User the server named — never from a flag we set ourselves.
//
// Three measured facts are load-bearing here and none of them is a guess:
//  - The payload shapes (R-M1-13 pending the two live WKT measurements recorded in the Task 8 report):
//    buildCircleGeofencePayload / buildRouteGeofencePayload from lab/scripts/api.mjs are RE-TYPED below,
//    not imported (the M0 boundary: no lab/ code in the production bundle), and pinned against the
//    literal M0 samples by tests/app/zones.test.ts.
//  - R-M1-10: a geofence whose `geofenceExit` subscription does not carry `web` in `notificators`
//    produces NO event that ever reaches this app (NotificatorWeb.java is the only thing that pushes to
//    /api/socket). So `ensureAlertSubscription` runs right after `createZone`, it UNIONS `web` onto the
//    existing value rather than replacing it, and its failure is thrown so the screen can show it — a
//    saved zone with no alert is a §4 lie, so we do not stay silent about it.
//  - `PUT /api/notifications/{id}` (the id-scoped route) is the update verb; a PUT on the collection
//    with no id is a measured 405.
import { TraccarError, type TraccarClient } from './client.ts';
import { whoAmI } from './session.ts';
import { validateZone, toCircleWkt, toPolygonWkt, toRouteWkt, type Geometry, type ZoneType } from './wkt.ts';
import type { ServerGeofence } from './types.ts';
import { translate } from '../../translations/catalog.ts';
import { createPermissionService, notAdministrator, type PermissionService } from './permissions.ts';

// A zone as the screen draws it, before it becomes a server geofence. `id` is set only for an update.
export type ZoneDraft = {
  id?: number;
  name: string;
  type: ZoneType;
  geometry: Geometry;
  // §6: the active hours ride as a geofence attribute (the server stores them, we never invent them).
  attributes?: Record<string, unknown>;
  // The guardian ids who must receive this zone's exit alert (§3 user→notification).
  userIds?: number[];
  // The child device the zone is evaluated against (§3 device→geofence, the measured working direction).
  deviceId?: number;
};

// The POST/PUT body shape — re-typed from lab/scripts/api.mjs. Key order is name, area, attributes:
// the literal M0 circle sample is exactly {"name":…,"area":"CIRCLE (…)"} with no attributes key.
export type GeofencePayload = { name: string; area: string; attributes?: Record<string, unknown> };

// A zone the geometry rule refused (§6: a tiny school circle or a zero-width route buffer). It throws
// BEFORE any request, so the server is never asked to store a shape that would only emit false edges.
export class ZoneValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join(' — '));
    this.name = 'ZoneValidationError';
    this.errors = errors;
  }
}

// The alert subscription could not be made to reach this app. The reason decides the sentence the
// screen shows — and a missing subscription is its OWN reason, never folded into "already present"
// (the wording the review of the Task 2 probe struck: a zone with no alert must not read as fine).
export type ZoneAlertReason = 'nosubscription' | 'putfailed' | 'unconfirmed';
export class ZoneAlertError extends Error {
  readonly reason: ZoneAlertReason;
  constructor(reason: ZoneAlertReason) {
    super(translate(reason === 'nosubscription' ? 'zones.alert.missing' : 'zones.alert.failed', 'ar'));
    this.name = 'ZoneAlertError';
    this.reason = reason;
  }
}

// Deleting a zone still linked to a device would drop an evaluation the child's alerts depend on, so
// the caller refuses and says why instead of deleting (و): no half-saved state is left behind.
export class ZoneLinkedError extends Error {
  readonly geofenceId: number;
  constructor(geofenceId: number) {
    super(translate('zones.delete.linked', 'ar'));
    this.name = 'ZoneLinkedError';
    this.geofenceId = geofenceId;
  }
}

// buildZonePayload is the re-typed M0 builder. It never imports lab/geo.mjs; the shapes are pinned
// against the literal samples by the test suite, and validateZone runs on the geometry upstream.
export function buildZonePayload(draft: ZoneDraft): GeofencePayload {
  const geometry = draft.geometry;
  let area: string;
  let attributes: Record<string, unknown> | undefined;
  if (geometry.kind === 'circle') {
    area = toCircleWkt(geometry);
  } else if (geometry.kind === 'polygon') {
    area = toPolygonWkt(geometry.points);
  } else {
    const route = toRouteWkt(geometry);
    area = route.area;
    attributes = route.attributes; // { polylineDistance: bufferMeters ?? 0 }
  }
  const payload: GeofencePayload = { name: draft.name, area };
  if (draft.attributes) attributes = { ...(attributes ?? {}), ...draft.attributes };
  if (attributes && Object.keys(attributes).length > 0) payload.attributes = attributes;
  return payload;
}

type NotificationRow = { id: number; type?: string; notificators?: string; [key: string]: unknown };

const splitNotificators = (value: unknown): string[] =>
  String(value ?? '').split(',').map((token) => token.trim()).filter((token) => token !== '');

export function createZoneService({
  client, permissions = createPermissionService({ client }),
}: { client: TraccarClient; permissions?: PermissionService }) {
  // The gate is the server's answer about who we are (whoAmI, Task 6), read fresh — never a role we
  // kept in state. A viewer therefore cannot reach any write below.
  async function requireAdministrator() {
    const me = await whoAmI();
    if (me.admin !== true) throw notAdministrator();
    return me;
  }

  // The shown list is always the server's — GET /geofences, parsed straight through, nothing local.
  async function listZones(): Promise<ServerGeofence[]> {
    return (await client.get<ServerGeofence[]>('/geofences')) ?? [];
  }

  // R-M1-10: read the `geofenceExit` subscription, UNION `web` onto whatever notificators it already
  // carries (never replace — a prior `telegram`/`sms` must survive), PUT the id-scoped route, re-read
  // to confirm. Every failure is thrown so createZone can announce it instead of swallowing it.
  async function ensureAlertSubscription(geofenceId: number, userIds: number[]): Promise<{ notificationId: number | null }> {
    const subscriptions = (await client.get<NotificationRow[]>('/notifications')) ?? [];
    const target = subscriptions.find((row) => row.type === 'geofenceExit');
    if (!target || !Number.isInteger(target.id)) throw new ZoneAlertError('nosubscription');

    const before = splitNotificators(target.notificators);
    if (!before.includes('web')) {
      // Union, never overwrite: existing values stay, `web` is added. The literal 'mail,web' the old
      // probe wrote would have DROPPED any non-mail value — the exact review finding this re-types.
      const merged = { ...target, notificators: [...before, 'web'].join(',') };
      try {
        await client.put<null>(`/notifications/${target.id}`, merged);
      } catch (error) {
        // A failed PUT is not silence: re-read once so the screen reports the true server state.
        void error;
        throw new ZoneAlertError('putfailed');
      }
      const confirmed = ((await client.get<NotificationRow[]>('/notifications')) ?? [])
        .find((row) => row.id === target.id);
      if (!splitNotificators(confirmed?.notificators).includes('web')) throw new ZoneAlertError('unconfirmed');
    }

    // §3: the alert reaches a guardian only if they are granted the notification — device sharing alone
    // is not enough (005 §5-7). Link each recipient, skipping any already granted.
    for (const userId of userIds) await permissions.linkUserToNotification(userId, target.id);
    return { notificationId: target.id };
  }

  // The full save path. Order is fixed by the tests: validate (no request) → admin gate → POST →
  // ensure the alert reaches the app → (optional links) → re-read the server list.
  async function createZone(draft: ZoneDraft): Promise<ServerGeofence[]> {
    const errors = validateZone({ type: draft.type, geometry: draft.geometry });
    if (errors.length > 0) throw new ZoneValidationError(errors);
    const me = await requireAdministrator();
    void me;
    const created = await client.post<ServerGeofence>('/geofences', buildZonePayload(draft));
    const geofenceId = created?.id;
    if (!Number.isInteger(geofenceId)) {
      throw new TraccarError('badpayload', 200, 'the server saved the zone but returned no id');
    }
    const { notificationId } = await ensureAlertSubscription(geofenceId, draft.userIds ?? []);
    if (draft.deviceId !== undefined) {
      // §3 (هـ): the guardian must see the child before a zone means anything, so user→device is
      // granted BEFORE the zone link; all four links stay owner-first (the measured M0 direction).
      for (const userId of draft.userIds ?? []) await permissions.linkUserToDevice(userId, draft.deviceId);
      await permissions.linkZoneToDevice(geofenceId, draft.deviceId);
      if (notificationId !== null) await permissions.linkDeviceToNotification(draft.deviceId, notificationId);
    }
    // Never show the object we just built — show what the server lists back.
    return listZones();
  }

  async function updateZone(draft: ZoneDraft): Promise<ServerGeofence[]> {
    const errors = validateZone({ type: draft.type, geometry: draft.geometry });
    if (errors.length > 0) throw new ZoneValidationError(errors);
    await requireAdministrator();
    if (!Number.isInteger(draft.id)) {
      throw new TraccarError('badpayload', 0, 'an update needs the server id of the zone being edited');
    }
    // The update verb is id-scoped: tools/m1/route-probe.mjs measured `PUT /geofences` → 405 and
    // `PUT /geofences/{id}` → 200 against the 6.16.0 lab (2026-10-23). The body is the measured shape —
    // the M0 payload plus the id the path already names.
    await client.put<null>(`/geofences/${draft.id}`, { ...buildZonePayload(draft), id: draft.id });
    return listZones();
  }

  async function deleteZone(id: number): Promise<ServerGeofence[]> {
    await requireAdministrator();
    // (و): refuse before deleting — a linked zone would leave the child without an evaluation the
    // alerts run on, and the list half-saved. No DELETE goes out, so there is nothing to roll back.
    if (await permissions.zoneIsLinked(id)) throw new ZoneLinkedError(id);
    // Measured (route-probe 2026-10-23): `DELETE /geofences?id=` → 405 with the row SURVIVING;
    // `DELETE /geofences/{id}` → 204. The query form would leave the zone on the server.
    await client.remove(`/geofences/${id}`);
    return listZones();
  }

  return { listZones, createZone, updateZone, deleteZone, ensureAlertSubscription };
}

export type ZoneService = ReturnType<typeof createZoneService>;
