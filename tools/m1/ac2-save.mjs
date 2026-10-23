// tools/m1/ac2-save.mjs — AC-2's save executed through OUR OWN service against the live lab.
// The brief's Step 5 asks the operator to draw the 90 m school in a browser; per R-M1-19 that drawing
// GESTURE is NOT RUN here (no browser session with operator-typed credentials), while the SAVE path it
// would exercise is proven from the shipped code: sign-in → whoAmI admin gate → POST /geofences with
// the exact WKT our writer emits → ensureAlertSubscription → the four §3 links → GET /geofences re-read.
// Credentials come from env (lab/traccar/fanout.env) and nothing secret is printed: no email, no token.
//
// A zone left behind by an ABORTED earlier run (POST landed, the link step failed) is a half-saved row,
// not evidence: it is deleted through the service and created again, so the run that prints AC2-LINE is
// one where every step succeeded. A fully linked zone is reused (a duplicate would make the probe's
// grep ambiguous).
import { signIn, activeClient } from '../../src/services/traccar/session.ts';
import { createZoneService } from '../../src/services/traccar/zones.ts';
import { createPermissionService } from '../../src/services/traccar/permissions.ts';

const baseUrl = process.env.LAB_API_URL || 'http://127.0.0.1:8082/api';
const NAME = 'lab-zone-m1-1';
const EXPECTED = 'CIRCLE (36.7538 3.0588, 90)'; // the literal form the brief expects the probe to print

const me = await signIn({ baseUrl, email: process.env.LAB_ADMIN_EMAIL, password: process.env.LAB_ADMIN_PASSWORD });
const client = activeClient();
if (!client) throw new Error('no client after sign-in');
console.log(`sign-in: id=${me.id} admin=${me.admin === true} (identity is the User POST /session returned)`);

const devices = await client.get('/devices');
const device = devices?.find((d) => !process.env.LAB_DEVICE_UNIQUE_ID || d.uniqueId === process.env.LAB_DEVICE_UNIQUE_ID) ?? devices?.[0];
if (!device) throw new Error('no child device on the lab — run npm run lab:bootstrap first');
const users = await client.get('/users');
const guardian2 = users?.find((u) => u.email === process.env.LAB_GUARDIAN2_EMAIL);
console.log(`device-id=${device.id} guardian2=${guardian2 ? `id=${guardian2.id}` : 'ABSENT (no second guardian to link)'}`);

const service = createZoneService({ client });
const permissions = createPermissionService({ client });

const existing = (await service.listZones()).find((zone) => zone.name === NAME);
if (existing) {
  console.log(`existing: geofence ${existing.id} "${existing.name}" area="${existing.area}"`);
  if (existing.area !== EXPECTED) {
    throw new Error(`an older ${NAME} carries a different area; remove it before re-running so the evidence is unambiguous`);
  }
  const linked = await permissions.hasLink('deviceId', device.id, 'geofenceId', existing.id);
  if (linked) {
    console.log('reused: the zone already carries its device link from a completed run');
  } else {
    console.log('half-saved: the zone exists WITHOUT its device link (an aborted run) — deleting and saving again');
    await service.deleteZone(existing.id);
  }
}

if (!(await service.listZones()).some((zone) => zone.name === NAME)) {
  const list = await service.createZone({
    name: NAME,
    type: 'school',
    geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 90 },
    deviceId: device.id,
    userIds: guardian2 ? [guardian2.id] : [],
  });
  const created = list.find((zone) => zone.name === NAME);
  if (!created) throw new Error('POST succeeded but the re-read list does not contain the zone');
  console.log(`created: geofence ${created.id} "${created.name}" area="${created.area}" (list came from GET /geofences, not the draft)`);
}

const row = (await service.listZones()).find((zone) => zone.name === NAME);
if (!row) throw new Error('the zone is not on the server');

const notifications = (await client.get('/notifications')) ?? [];
const alert = notifications.find((n) => n.type === 'geofenceExit');
const links = [
  ['user->device', guardian2 ? await permissions.hasLink('userId', guardian2.id, 'deviceId', device.id) : null],
  ['device->geofence', await permissions.hasLink('deviceId', device.id, 'geofenceId', row.id)],
  ['device->notification', alert ? await permissions.hasLink('deviceId', device.id, 'notificationId', alert.id) : null],
  ['user->notification', guardian2 && alert ? await permissions.hasLink('userId', guardian2.id, 'notificationId', alert.id) : null],
];
for (const [name, present] of links) console.log(`permission ${name} present=${present}`);
console.log(`AC2-LINE geofence ${row.id} "${row.name}" area=${row.area}`);
