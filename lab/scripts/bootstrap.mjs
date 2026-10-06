import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createApiClient, buildUserPayload, buildDevicePayload,
  buildCircleGeofencePayload, buildRouteGeofencePayload,
  buildNotificationPayload, buildPermissionPayload,
} from './api.mjs';

// GET /permissions?ownerKey=id&propertyKey=0 => array of {OWNERKEY: v, PROPERTYKEY: v} (uppercase live).
// 0 على الطرف الثاني يعني «بلا ترشيح» (DatabaseStorage.java:192-198)، فنفلتر في JS بدل كثرة الاستعلامات.
async function hasLink(client, ownerKey, ownerId, propertyKey, propertyId) {
  const rows = await client.get(`/permissions?${ownerKey}=${ownerId}&${propertyKey}=0`);
  if (!Array.isArray(rows)) return false;
  const want = propertyKey.toUpperCase();
  return rows.some((row) => Object.entries(row)
    .some(([key, value]) => key.toUpperCase() === want && Number(value) === Number(propertyId)));
}

// School zone geometry comes from the scenario file, exactly like the route step reads its own:
// a single source of truth so an edit to lab/scenarios/school-exit.json re-provisions the gate zone.
export async function readCircleGeofencePayload(scenarioUrl) {
  const scenario = JSON.parse(await readFile(scenarioUrl, 'utf8'));
  return buildCircleGeofencePayload(scenario.zone);
}

// admin: the already-initialised branch must never claim an id it never located. This is a
// lab-only DB, so the remedy is to reset it and re-run rather than retry or auto-create blindly.
export async function resolveAdmin(client, env) {
  const server = await client.get('/server');
  if (server.newServer !== true) {
    const users = await client.get('/users');
    const adminId = users.find((u) => u.email === env.LAB_ADMIN_EMAIL)?.id;
    if (adminId === undefined) {
      throw new Error(`server already initialised but ${env.LAB_ADMIN_EMAIL} is not among /users; `
        + 'this is a lab-only DB — delete lab/traccar/lab-data/database.mv.db and re-run bootstrap');
    }
    return { adminId, exists: true, detail: `already initialised, admin id=${adminId}` };
  }
  const user = await client.post('/users', buildUserPayload({
    name: 'lab-admin', email: env.LAB_ADMIN_EMAIL, password: env.LAB_ADMIN_PASSWORD }));
  return { adminId: user.id, exists: false, detail: `id=${user.id}` };
}

// run() returns a string => CREATED, or { exists: true, detail } => EXISTS (idempotent re-run).
// results is an out-param so the transcript collected before a failure survives the throw.
export async function runSteps(client, env, results = []) {
  async function step(name, run) {
    try {
      const value = await run();
      if (value && typeof value === 'object' && value.exists) {
        results.push({ name, result: 'exists', detail: value.detail });
      } else {
        results.push({ name, result: 'created', detail: value });
      }
    } catch (error) {
      // A genuine constraint/validation 400 (e.g. the groupId FK crash) must stay FAILED;
      // only a real "already there" conflict maps to exists. Safety instrument: never swallow.
      if (error.status === 409 || /already|exist|duplicate|unique index|primary key violation/i.test(error.message ?? '')) {
        results.push({ name, result: 'exists', detail: String(error.body ?? error.message).slice(0, 120) });
      } else {
        results.push({ name, result: 'failed', detail: error.message });
        throw error;
      }
    }
  }

  // 1. أول مستخدم يصبح administrator تلقائياً ما دامت القاعدة فارغة (UserResource.java:113)
  let adminId;
  await step('admin', async () => {
    const admin = await resolveAdmin(client, env);
    adminId = admin.adminId;
    if (admin.exists) return { exists: true, detail: admin.detail };
    return admin.detail;
  });

  // 2. close self-registration (Server.registration; UserResource.java:117)
  await step('registration-off', async () => {
    const server = await client.get('/server');
    if (server.registration === false) return { exists: true, detail: 'already disabled' };
    await client.put('/server', { ...server, registration: false });
    const after = await client.get('/server');
    if (after.registration !== false) throw new Error('server did not honour registration=false');
    return 'registration=false verified';
  });

  // 3. the child device = one Traccar device, uniqueId is the stable identity (spec 3)
  let device;
  await step('device', async () => {
    const uniqueId = env.LAB_DEVICE_UNIQUE_ID ?? 'lab-child-1';
    const devices = await client.get('/devices');
    device = devices.find((d) => d.uniqueId === uniqueId);
    if (device) return { exists: true, detail: `id=${device.id} exists` };
    device = await client.post('/devices', buildDevicePayload({ name: uniqueId, uniqueId }));
    return `id=${device.id}`;
  });

  // 4. the school zone, drawn from geometry not localStorage (spec 6)
  let geofence;
  await step('geofence-school', async () => {
    const payload = await readCircleGeofencePayload(
      new URL('scenarios/school-exit.json', new URL('../', import.meta.url)));
    const zones = await client.get('/geofences');
    geofence = zones.find((z) => z.name === payload.name);
    if (geofence) return { exists: true, detail: `id=${geofence.id} exists` };
    geofence = await client.post('/geofences', payload);
    return `id=${geofence.id} area=${geofence.area}`;
  });

  // 4b. a route zone = LINESTRING + polylineDistance, never one big circle (spec 6)
  let park;
  await step('geofence-walk-to-park', async () => {
    const route = JSON.parse(await readFile(
      new URL('scenarios/route-park.json', new URL('../', import.meta.url)), 'utf8'));
    const zones = await client.get('/geofences');
    park = zones.find((z) => z.name === route.zone.name);
    if (park) return { exists: true, detail: `id=${park.id} exists` };
    park = await client.post('/geofences', buildRouteGeofencePayload(route.zone));
    return `id=${park.id} buffer=${park.attributes?.polylineDistance}`;
  });

  // 4c. zones are only evaluated when linked to the device: Device -> Geofence, ترتيباً
  for (const zone of [{ name: 'school', ref: () => geofence }, { name: 'walk-to-park', ref: () => park }]) {
    await step(`link-${zone.name}`, async () => {
      const target = zone.ref();
      if (!target?.id) throw new Error(`${zone.name} has no id`);
      if (await hasLink(client, 'deviceId', device.id, 'geofenceId', target.id)) {
        return { exists: true, detail: `device ${device.id} -> ${zone.name} ${target.id} already linked` };
      }
      await client.post('/permissions',
        buildPermissionPayload('deviceId', device.id, 'geofenceId', target.id));
      return `device ${device.id} -> ${zone.name} ${target.id}`;
    });
  }

  // 5. second guardian, shared to the device (spec 3: 2-3 guardians)
  let guardian2;
  await step('guardian-2', async () => {
    const users = await client.get('/users');
    guardian2 = users.find((u) => u.email === env.LAB_GUARDIAN2_EMAIL);
    if (guardian2) return { exists: true, detail: `id=${guardian2.id} exists` };
    guardian2 = await client.post('/users', buildUserPayload({
      name: 'lab-guardian-2', email: env.LAB_GUARDIAN2_EMAIL, password: env.LAB_GUARDIAN2_PASSWORD }));
    return `id=${guardian2.id}`;
  });

  // 5b. user -> device: يعاد الربط إن غاب (running bootstrap twice must not leave a guardian unshared)،
  //     لكن إن كان موجوداً نطبع EXISTS بدل CREATED لأن POST المكرر يُرجع 204 بلا خطأ (probe).
  await step('guardian-2-device', async () => {
    if (await hasLink(client, 'userId', guardian2.id, 'deviceId', device.id)) {
      return { exists: true, detail: `user ${guardian2.id} -> device ${device.id} already linked` };
    }
    await client.post('/permissions',
      buildPermissionPayload('userId', guardian2.id, 'deviceId', device.id));
    return `user ${guardian2.id} -> device ${device.id}`;
  });

  // 6. the notification subscription: proof that device sharing alone is not enough.
  //    always:false يجعل ربط Device->Notification إلزامياً (CacheManager.java:126-133)،
  //    وgetNotificationUsers يأخذ تقاطع مصرّحي الـNotification مع مستخدمي الجهاز (:119-124).
  await step('notification-geofenceExit', async () => {
    const notifications = await client.get('/notifications');
    const existing = notifications.find((n) => n.type === 'geofenceExit' && n.description === 'lab-geofenceExit');
    if (existing) return { exists: true, detail: `id=${existing.id} exists` };
    const created = await client.post('/notifications', buildNotificationPayload({
      type: 'geofenceExit', notificators: 'telegram,email', description: 'lab-geofenceExit' }));
    return `id=${created.id} (owner ${adminId} is linked automatically by BaseObjectResource:91-96)`;
  });

  // 6b. two links, in this direction only
  await step('notification-links', async () => {
    const notification = (await client.get('/notifications'))
      .find((n) => n.type === 'geofenceExit' && n.description === 'lab-geofenceExit');
    if (!notification) throw new Error('notification missing after step 6');
    const links = [
      ['deviceId', device.id, 'notificationId', notification.id],
      ['userId', guardian2.id, 'notificationId', notification.id],
    ];
    let added = 0;
    for (const [ownerKey, ownerId, propertyKey, propertyId] of links) {
      if (await hasLink(client, ownerKey, ownerId, propertyKey, propertyId)) continue;
      await client.post('/permissions', buildPermissionPayload(ownerKey, ownerId, propertyKey, propertyId));
      added += 1;
    }
    if (added === 0) {
      return { exists: true, detail: `device ${device.id} + guardian ${guardian2.id} -> notification ${notification.id} already linked` };
    }
    return `device ${device.id} + guardian ${guardian2.id} -> notification ${notification.id} (${added} linked)`;
  });

  return results;
}

export async function bootstrap(env, results = []) {
  const client = createApiClient({
    baseUrl: env.LAB_API_URL ?? 'http://127.0.0.1:8082/api',
    email: env.LAB_ADMIN_EMAIL,
    password: env.LAB_ADMIN_PASSWORD,
  });
  return { client, steps: await runSteps(client, env, results) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const print = (rows) => {
    for (const r of rows) console.log(`${r.result.toUpperCase()} ${r.name}: ${r.detail ?? ''}`);
  };
  // results is the same array runSteps fills, so on failure the transcript collected so far
  // survives to be printed; the original error still propagates with a nonzero exit.
  const results = [];
  try {
    print((await bootstrap(process.env, results)).steps);
  } catch (error) {
    print(results);
    process.exitCode = 1;
    throw error;
  }
}
