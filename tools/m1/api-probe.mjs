// tools/m1/api-probe.mjs — records the SHAPE of the API the guardians' app will consume.
// Prints field names and non-sensitive values only. Secrets are read from env and never echoed.
// Fix round 1 (007): the socket window covers the school-exit event, the identity routes are
// probed with a minted token / a form login / no header at all, and /api/notifications replaces
// the dead /events?from&to probe (EventResource.java in 6.16.0 is single-object-by-id only).
const base = process.env.LAB_API_URL || 'http://127.0.0.1:8082/api';

const auth = 'Basic ' + Buffer.from(`${process.env.LAB_ADMIN_EMAIL}:${process.env.LAB_ADMIN_PASSWORD}`).toString('base64');

const keysOf = (value) =>
  Array.isArray(value) ? (value.length === 0 ? '[]' : keysOf(value[0]))
    : value && typeof value === 'object' ? Object.keys(value).sort().join(',') : typeof value;

// Round-1 show() always attached the Basic header; fix 1 adds:
//   options.noAuth      — send the call WITHOUT the authorization header at all,
//   options.cookieNames — print ONLY the cookie names from set-cookie (never their values),
// and any token query value in the printed path is masked (the value is never echoed).
async function show(label, path, options = {}) {
  const printedPath = path.replace(/([?&]token=)[^&]*/g, '$1<redacted>');
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { ...(options.noAuth ? {} : { authorization: auth }), ...(options.headers || {}) },
      method: options.method || 'GET',
      body: options.body, // bodies (if any) are built inside this process from env and never printed
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text === '' ? null : JSON.parse(text); } catch { /* non-JSON kept as a note */ }
    console.log(`\n== ${label} == ${options.method || 'GET'} ${printedPath} -> HTTP ${response.status}`);
    console.log(`fields: ${parsed === null ? text.slice(0, 120) : keysOf(parsed)}`);
    if (options.fields) console.log(`count: ${Array.isArray(parsed) ? parsed.length : 1}`);
    if (options.cookieNames) {
      const names = (response.headers.getSetCookie ? response.headers.getSetCookie() : [])
        .map((cookie) => String(cookie).split('=')[0]);
      console.log(`set-cookie names: ${names.length === 0 ? 'none' : names.join(',')}`); // names only, values never printed
    }
    return parsed;
  } catch (error) {
    console.log(`\n== ${label} == ${printedPath} -> FETCH FAILED ${error.message}`);
    return null;
  }
}

// 1. GET /session under the Basic header ONLY (round-1 measured 404; SessionResource.java:78-105
//    resolves ?token= or a session attribute and throws NOT_FOUND otherwise — kept as a labelled fact)
await show('session-basic', '/session', { fields: true });
// 2. the child devices a guardian can actually see
const devices = await show('devices', '/devices', { fields: true });
const deviceId = devices?.[0]?.id;
// 3. latest positions, three query shapes (PositionResource.java:73-106)
await show('all-latest', '/positions', { fields: true });
if (deviceId) await show('device-latest', `/positions?deviceId=${deviceId}`, { fields: true });
const dayAgo = new Date(Date.now() - 86400000).toISOString();
if (deviceId) await show('history', `/positions?deviceId=${deviceId}&from=${dayAgo}&to=${new Date().toISOString()}`, { fields: true });
// 4. geofences: the area string comes back in WHICH order? (the §6 trap, measured not assumed)
const fences = await show('geofences', '/geofences', { fields: true });
for (const fence of fences || []) console.log(`geofence ${fence.id} "${fence.name}" area=${fence.area}`);
// 5. (Gap C) the events-collection probe was DEAD: /api/events has no collection GET in 6.16.0
//    (EventResource.java:35-42 — its only @GET is @Path("{id}")). The pollable history endpoint is
//    /api/notifications (NotificationResource.java:53-56 extends ExtendedObjectResource<Notification>,
//    whose @GET at ExtendedObjectResource.java:46-52 is the collection read). from/to are passed along
//    as round-1 passed them; the status+fields+count below are what the app can build on.
await show('notifications-history', `/notifications?from=${dayAgo}&to=${new Date().toISOString()}`, { fields: true });
// 6. what an unauthenticated call actually returns (the UI's 401 path)
const anonymous = await fetch(`${base}/positions`);
console.log(`\n== anonymous == HTTP ${anonymous.status} body=${(await anonymous.text()).slice(0, 120)}`);
// 7. CORS as configured (Keys.java:1003 default; the lab path uses a same-origin proxy).
//    OPTIONS bypasses authentication entirely (SecurityRequestFilter.java:57-59), so this needs no secret.
const preflight = await fetch(`${base}/positions`, {
  method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:3000', 'access-control-request-method': 'GET' },
});
console.log(`\n== cors == HTTP ${preflight.status} allow-origin=${preflight.headers.get('access-control-allow-origin')} allow-credentials=${preflight.headers.get('access-control-allow-credentials')}`);

// Gap A prerequisite, measured this round: widening the window ALONE cannot produce an event frame.
// Only NotificatorWeb.java:49 (connectionManager.updateEvent) pushes events to /api/socket, and the
// lab notification is bootstrapped with notificators='mail' (lab/scripts/bootstrap.mjs:13,175) —
// mail never reaches the socket. This step ensures 'web' is ADDED to the existing lab geofenceExit
// notification (PUT with the round-tripped object; idempotent — re-running changes nothing). Admin is
// a recipient automatically (BaseObjectResource.java:91-96 links creator->notification on POST).
const labNotifications = await show('notifications', '/notifications', { fields: true });
const labExitNotification = (labNotifications || []).find(
  (n) => n.type === 'geofenceExit' && n.description === 'lab-geofenceExit');
if (labExitNotification && !String(labExitNotification.notificators || '').split(',').map((s) => s.trim()).includes('web')) {
  // The update verb in this API is `PUT /{id}` (BaseObjectResource.java:101-103); a bare PUT on the
  // collection is 405 (measured this round).
  const putResponse = await fetch(`${base}/notifications/${labExitNotification.id}`, {
    method: 'PUT',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ ...labExitNotification, notificators: 'mail,web' }), // round-tripped lab row; no secrets in it
  });
  console.log(`== ensure-web-notificator == PUT /notifications/${labExitNotification.id} -> HTTP ${putResponse.status}`);
} else {
  console.log('== ensure-web-notificator == already present, no change');
}

// 8. mint the token BEFORE the identity probes (GET /session?token= needs it) and revoke at the end.
//    Authentication of the socket is a `token` query parameter (AsyncSocketServlet.java:58-74); the
//    token is minted by POST /api/session/token (SessionResource.java:150-162).
//    Node 24 ships a global WebSocket — measured on this machine: `WebSocket: function` — so no dependency.
const tokenResponse = await fetch(`${base}/session/token`, {
  method: 'POST',
  headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
  body: `expiration=${encodeURIComponent(new Date(Date.now() + 3600000).toISOString())}`,
});
const token = (await tokenResponse.text()).trim();
console.log(`\n== token == HTTP ${tokenResponse.status} length=${token.length}`); // the value is never printed

// Gap B — the authenticated-identity routes Task 6 must build on.
if (tokenResponse.ok && token.length > 20) {
  await show('whoAmI-token', `/session?token=${encodeURIComponent(token)}`, { noAuth: true, fields: true });
} else {
  console.log('\n== whoAmI-token == NOT RUN (no token minted; do not guess the response shape)');
}
// Form login exactly as the app would post it. The body is built INSIDE this process from env
// (never passed through the shell, never printed); the response fields and the cookie NAME only
// are printed — never the cookie value.
await show('login-form', '/session', {
  noAuth: true, method: 'POST', fields: true, cookieNames: true,
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    email: process.env.LAB_ADMIN_EMAIL || '',
    password: process.env.LAB_ADMIN_PASSWORD || '',
  }).toString(),
});
// The status the app sees when its session dies: no Basic header, no cookie.
await show('session-no-header-no-cookie', '/session', { noAuth: true, fields: true });

if (tokenResponse.ok && token.length > 20) {
  // Gap A — the socket capture is widened to ~150 s so the real geofenceExit lands inside it.
  // Timing measured in round 1: with `npm run lab:scenario -- school-exit --speed=1` started ~3 s
  // after this probe, the exit fix is posted at scenario t+90 s (4th reading, ~125 m from the 100 m
  // school circle). Run that scenario in this window; a second scenario run inside the same window
  // is fine if the first has not reached the fence in time.
  const wsBase = (process.env.LAB_WS_URL || base.replace(/^http/, 'ws'));
  const socket = new WebSocket(`${wsBase}/socket?token=${encodeURIComponent(token)}`);
  const shapes = new Set();
  socket.addEventListener('open', () => console.log('== socket == OPEN'));
  socket.addEventListener('message', (event) => {
    let parsed = null;
    try { parsed = JSON.parse(String(event.data)); shapes.add(keysOf(parsed)); }
    catch { shapes.add(`non-json(${String(event.data).slice(0, 40)})`); }
    // Task 10 renders the FIELDS inside an events element: once a real frame arrives, print the
    // inner field names verbatim (names only — values may carry ids/timestamps and are not echoed).
    // The type VALUE is a non-sensitive enum name (e.g. geofenceExit) and is printed to prove which
    // event arrived.
    if (parsed && Array.isArray(parsed.events) && parsed.events.length > 0) {
      for (const frameEvent of parsed.events) {
        const typeName = frameEvent && typeof frameEvent.type === 'string' ? frameEvent.type : 'unknown';
        console.log(`== socket event frame == envelope=${keysOf(parsed)} type=${typeName} fields=${keysOf(frameEvent)}`);
      }
    }
  });
  socket.addEventListener('error', (event) => console.log(`== socket == ERROR ${event.message}`));
  await new Promise((done) => setTimeout(done, 150000));
  socket.close();
  await new Promise((done) => setTimeout(done, 500));
  console.log(`== socket frames == ${shapes.size === 0 ? 'NONE IN WINDOW (run the scenario while it is open)' : [...shapes].join(' | ')}`);
  const revoke = await fetch(`${base}/session/token/revoke`, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
    body: `token=${encodeURIComponent(token)}`,
  });
  console.log(`== token revoke == HTTP ${revoke.status}`); // the token must not outlive the probe
} else {
  console.log('== socket == SKIPPED, no token issued (record NOT RUN, do not guess the frame shape)');
}
