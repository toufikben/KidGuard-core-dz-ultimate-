// tools/m1/api-probe.mjs — records the SHAPE of the API the guardians' app will consume.
// Prints field names and non-sensitive values only. Secrets are read from env and never echoed.
const base = process.env.LAB_API_URL || 'http://127.0.0.1:8082/api';

const auth = 'Basic ' + Buffer.from(`${process.env.LAB_ADMIN_EMAIL}:${process.env.LAB_ADMIN_PASSWORD}`).toString('base64');

const keysOf = (value) =>
  Array.isArray(value) ? (value.length === 0 ? '[]' : keysOf(value[0]))
    : value && typeof value === 'object' ? Object.keys(value).sort().join(',') : typeof value;

async function show(label, path, options = {}) {
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { authorization: auth, ...(options.headers || {}) },
      method: options.method || 'GET',
      body: options.body,
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text === '' ? null : JSON.parse(text); } catch { /* non-JSON kept as a note */ }
    console.log(`\n== ${label} == ${options.method || 'GET'} ${path} -> HTTP ${response.status}`);
    console.log(`fields: ${parsed === null ? text.slice(0, 120) : keysOf(parsed)}`);
    if (options.fields) console.log(`count: ${Array.isArray(parsed) ? parsed.length : 1}`);
    return parsed;
  } catch (error) {
    console.log(`\n== ${label} == ${path} -> FETCH FAILED ${error.message}`);
    return null;
  }
}

// 1. who am I + the role field the UI will branch on
await show('session', '/session', { fields: true });
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
// 5. events window the alerts screen will read
await show('events', `/events?from=${dayAgo}&to=${new Date().toISOString()}`, { fields: true });
// 6. what an unauthenticated call actually returns (the UI's 401 path)
const anonymous = await fetch(`${base}/positions`);
console.log(`\n== anonymous == HTTP ${anonymous.status} body=${(await anonymous.text()).slice(0, 120)}`);
// 7. CORS as configured (Keys.java:1003 default; the lab path uses a same-origin proxy).
//    OPTIONS bypasses authentication entirely (SecurityRequestFilter.java:57-59), so this needs no secret.
const preflight = await fetch(`${base}/positions`, {
  method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:3000', 'access-control-request-method': 'GET' },
});
console.log(`\n== cors == HTTP ${preflight.status} allow-origin=${preflight.headers.get('access-control-allow-origin')} allow-credentials=${preflight.headers.get('access-control-allow-credentials')}`);

// 8. the live socket the alerts screen will use (Task 10). Authentication is a `token` query
//    parameter (AsyncSocketServlet.java:58-74); the token is minted by POST /api/session/token
//    (SessionResource.java:150-162) and revoked again at the end of this probe.
//    Node 24 ships a global WebSocket — measured on this machine: `WebSocket: function` — so no dependency.
const tokenResponse = await fetch(`${base}/session/token`, {
  method: 'POST',
  headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
  body: `expiration=${encodeURIComponent(new Date(Date.now() + 3600000).toISOString())}`,
});
const token = (await tokenResponse.text()).trim();
console.log(`\n== token == HTTP ${tokenResponse.status} length=${token.length}`); // the value is never printed

if (tokenResponse.ok && token.length > 20) {
  const wsBase = (process.env.LAB_WS_URL || base.replace(/^http/, 'ws'));
  const socket = new WebSocket(`${wsBase}/socket?token=${encodeURIComponent(token)}`);
  const shapes = new Set();
  socket.addEventListener('open', () => console.log('== socket == OPEN'));
  socket.addEventListener('message', (event) => {
    try { shapes.add(keysOf(JSON.parse(String(event.data)))); }
    catch { shapes.add(`non-json(${String(event.data).slice(0, 40)})`); }
  });
  socket.addEventListener('error', (event) => console.log(`== socket == ERROR ${event.message}`));
  // Idle frames only prove the handshake; a real frame needs an event. While this 20 s window is
  // open, run in a second shell: npm run lab:scenario -- school-exit --speed=1
  await new Promise((done) => setTimeout(done, 20000));
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
