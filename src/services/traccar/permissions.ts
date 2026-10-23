// src/services/traccar/permissions.ts — the §3 links (guardian↔device, device↔zone, device↔alert,
// guardian↔alert) written to the SERVER, never to a local table. Task 8 (AC-2).
//
// Why this file re-types the payload instead of importing it: `lab/` is not in tsconfig and not in the
// Vite tree, so importing `../../lab/scripts/api.mjs` here would break the production bundle (the M0
// rule: nothing from the lab enters the shipped app). The SHAPE measured in M0 is copied down and pinned
// by tests/app/permissions.test.ts against the literal samples — a shape drift fails a test, not a run.
//
// The one fact that decides every call here (Permission.java:54-66, re-measured in 007 §3 and 005 §5-7):
// a permission is a two-number map and its FIRST key is the OWNER, so the order IS the direction. The
// zone↔device link is therefore written device-first ({"deviceId":…,"geofenceId":…}) — the exact
// direction lab/scripts/bootstrap.mjs:139 posts and 005-fanout measured to make a zone EVALUATE (a
// geofence-first grant does not). No grant below trusts a local "am I admin" flag: the admin answer comes
// from whoAmI() (Task 6), which is the session the server named, never from state we kept ourselves.
import { TraccarError, type TraccarClient } from './client.ts';
import { whoAmI } from './session.ts';

// The four relations the app may grant, as the server spells them. Every key here MUST end in "Id" —
// the same guard lab/scripts/api.mjs:37-38 enforces, re-typed.
export type PermissionKey = 'userId' | 'deviceId' | 'geofenceId' | 'notificationId' | 'groupId';

// buildPermissionPayload is the re-typed M0 builder. The owner goes first; a flipped pair is a
// different grant, which is why this returns an object whose KEY ORDER carries the meaning.
export function buildPermissionPayload(
  ownerKey: string,
  ownerId: number,
  propertyKey: string,
  propertyId: number,
): Record<string, number> {
  if (!/Id$/.test(ownerKey) || !/Id$/.test(propertyKey)) {
    throw new Error('a permission key must be one of userId/deviceId/geofenceId/notificationId and end in Id');
  }
  if (ownerKey === propertyKey) throw new Error('permission needs two distinct keys');
  if (!Number.isInteger(ownerId) || !Number.isInteger(propertyId)) {
    throw new Error('permission ids must be integers');
  }
  // Insertion order IS the direction: owner first, property second (Permission.java:54-66).
  return { [ownerKey]: ownerId, [propertyKey]: propertyId };
}

type PermissionRow = Record<string, unknown>;

// The numeric value behind one relation key in a permission row. The server returns the row with the
// SAME key names it accepted, but a stray uppercase (the {OWNERKEY,PROPERTYKEY} shape noted in
// bootstrap.mjs:15) must not silently read as "no link" — so both spellings are checked.
const rowId = (row: PermissionRow, key: string): number | null => {
  const lower = row[key];
  const upper = row[key.toUpperCase()];
  const value = Number(lower ?? upper);
  return Number.isInteger(value) && value > 0 ? value : null;
};

export function createPermissionService({ client }: { client: TraccarClient }) {
  // GET /permissions filtered by an owner id and a wildcard property (the form bootstrap.mjs:18 uses:
  // `?{ownerKey}={ownerId}&{propertyKey}=0`). 0 on the property means "any". The pair ORDER is
  // semantic on the live 6.16.0 server (measured 2026-10-23): the FIRST key names the table read,
  // so ?userId=2&notificationId=0 answers 200 and the alphabetically sorted ?notificationId=0&userId=2
  // answers 400 ("Table TC_NOTIFICATION_USER not found"). The client passes this order through.
  async function readGrants(ownerKey: string, ownerId: number, propertyKey: string): Promise<PermissionRow[]> {
    return (await client.get<PermissionRow[]>('/permissions', { [ownerKey]: ownerId, [propertyKey]: 0 })) ?? [];
  }

  // A grant exists when any returned row carries BOTH endpoints with the exact ids we asked about.
  async function hasLink(ownerKey: string, ownerId: number, propertyKey: string, propertyId: number): Promise<boolean> {
    const rows = await readGrants(ownerKey, ownerId, propertyKey);
    return rows.some((row) => rowId(row, ownerKey) === ownerId && rowId(row, propertyKey) === propertyId);
  }

  // POST /permissions is the only write verb (BaseObjectResource links the new object to its creator,
  // so the body carries no userId). Re-posting an existing grant is a 204 no-op, but we skip it first
  // so the screen never re-floods a link — and, for the delete guard below, so "linked" stays measurable.
  async function grant(ownerKey: string, ownerId: number, propertyKey: string, propertyId: number): Promise<void> {
    if (await hasLink(ownerKey, ownerId, propertyKey, propertyId)) return;
    await client.post<null>('/permissions', buildPermissionPayload(ownerKey, ownerId, propertyKey, propertyId));
  }

  // The three §3 links the zone needs to actually alert (§3, and 005 §5-7 measured that sharing alone
  // is not enough — the device must be granted the geofence and the notification, and the guardian the
  // notification). Each keeps the OWNER-first direction; the zone link is device→geofence (measured).
  const linkUserToDevice = (userId: number, deviceId: number) => grant('userId', userId, 'deviceId', deviceId);
  const linkZoneToDevice = (geofenceId: number, deviceId: number) => grant('deviceId', deviceId, 'geofenceId', geofenceId);
  const linkDeviceToNotification = (deviceId: number, notificationId: number) => grant('deviceId', deviceId, 'notificationId', notificationId);
  const linkUserToNotification = (userId: number, notificationId: number) => grant('userId', userId, 'notificationId', notificationId);

  // "من يعدّل": who may edit this zone. The admin bit is read back from the SERVER (whoAmI), never from
  // local state — a viewer who forged `admin=true` in storage would still be refused here, because the
  // only source of the flag is the User the server named at sign-in (R-M1-8).
  async function zoneOwners(geofenceId: number): Promise<{ admin: boolean; userIds: number[] }> {
    const me = await whoAmI();
    // user-first: ?userId=0&geofenceId=… (the geofence-first form is a measured 400 TC_GEOFENCE_USER).
    const rows = await client.get<PermissionRow[]>('/permissions', { userId: 0, geofenceId });
    const userIds: number[] = [];
    for (const row of rows ?? []) {
      const id = rowId(row, 'userId');
      if (id !== null && !userIds.includes(id)) userIds.push(id);
    }
    return { admin: me.admin === true, userIds };
  }

  // The delete guard (و): a zone still linked to a device may not be silently deleted — that would drop
  // an evaluation the child's alerts depend on and leave the list half-saved. The caller refuses first.
  async function zoneIsLinked(geofenceId: number): Promise<boolean> {
    // device-first: ?deviceId=0&geofenceId=… (the geofence-first form is a measured 400 TC_GEOFENCE_DEVICE).
    const rows = await client.get<PermissionRow[]>('/permissions', { deviceId: 0, geofenceId });
    return (rows ?? []).some((row) => rowId(row, 'deviceId') !== null);
  }

  return {
    hasLink,
    grant,
    linkUserToDevice,
    linkZoneToDevice,
    linkDeviceToNotification,
    linkUserToNotification,
    zoneOwners,
    zoneIsLinked,
  };
}

export type PermissionService = ReturnType<typeof createPermissionService>;

// The write verb the zone service uses when it is not an administrator: it is the same TraccarError
// kind the session layer already maps to a catalog line (session.forbidden), so a refused write reads
// as a refusal everywhere in the app rather than as a fresh error vocabulary.
export function notAdministrator(): TraccarError {
  return new TraccarError('forbidden', 403, 'zone writes require an administrator');
}
