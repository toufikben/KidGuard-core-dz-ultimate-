// tools/m1/route-probe.mjs — measures the three facts Task 8 must encode, against the live lab:
//   (1) the UPDATE verb for /api/geofences: collection PUT vs id-scoped PUT (005 measured 405/200 for
//       notifications; BaseObjectResource.java:101-103 serves every resource, but this measures ours);
//   (2) the DELETE verb: query ?id= vs path /{id};
//   (3) R-M1-13: does the parser accept POLYGON((…)) as written by toPolygonWkt, and is an explicit
//       polylineDistance: 0 stored (or dropped — which would silently un-buffer a route)?
// Creates only disposable `lab-probe-<stamp>` rows and deletes them at the end. Prints statuses and
// stored area/attributes verbatim; credentials come from env and are never printed.
const base = process.env.LAB_API_URL || 'http://127.0.0.1:8082/api';
const auth = 'Basic ' + Buffer.from(`${process.env.LAB_ADMIN_EMAIL}:${process.env.LAB_ADMIN_PASSWORD}`).toString('base64');
const stamp = Date.now();

async function call(label, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: auth, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text === '' ? null : JSON.parse(text); } catch { /* plain text */ }
  console.log(`${label} ${method} ${path} -> HTTP ${response.status}${parsed === null ? configNote(text) : ''}`);
  return { status: response.status, parsed };
}
const configNote = (text) => (text === '' ? '' : ` body=${text.slice(0, 160).replace(/\s+/g, ' ')}`);

const stampName = (what) => `lab-probe-${what}-${stamp}`;

// (1) + (2): create one disposable circle, then try every update/delete route against it.
const created = await call('create-for-verbs', 'POST', '/geofences', { name: stampName('verbs'), area: 'CIRCLE (36.7538 3.0588, 100)' });
const id = created.parsed?.id;
if (Number.isInteger(id)) {
  await call('update-collection', 'PUT', '/geofences', { ...created.parsed, name: stampName('verbs-renamed') });
  await call('update-by-id', 'PUT', `/geofences/${id}`, { ...created.parsed, name: stampName('verbs-renamed') });
  const afterPut = await call('read-back-after-put', 'GET', `/geofences?id=${id}`);
  const row = Array.isArray(afterPut.parsed) ? afterPut.parsed.find((fence) => fence.id === id) : null;
  console.log(`stored-name-after-put="${row?.name ?? 'MISSING'}"`);
  await call('delete-by-query', 'DELETE', `/geofences?id=${id}`);
  const stillThere = await call('read-after-query-delete', 'GET', `/geofences?id=${id}`);
  const survived = Array.isArray(stillThere.parsed) && stillThere.parsed.some((fence) => fence.id === id);
  console.log(`survived-query-delete=${survived}`);
  if (survived) await call('delete-by-id', 'DELETE', `/geofences/${id}`);
} else {
  console.log('VERB PROBES SKIPPED: no integer id came back from the create');
}

// (3a) R-M1-13: POLYGON(( — the exact form toPolygonWkt emits, closed, no space after the name.
const polyArea = 'POLYGON((36.7538 3.0588, 36.7548 3.0588, 36.7548 3.0598, 36.7538 3.0588))';
const poly = await call('create-polygon', 'POST', '/geofences', { name: stampName('polygon'), area: polyArea });
const polyId = poly.parsed?.id;
if (Number.isInteger(polyId)) {
  const list = await call('read-polygon', 'GET', `/geofences?id=${polyId}`);
  const row = Array.isArray(list.parsed) ? list.parsed.find((fence) => fence.id === polyId) : null;
  console.log(`stored-polygon-area="${row?.area ?? 'MISSING'}"`);
  console.log(`polygon-area-roundtrip-identical=${row?.area === polyArea}`);
  await call('delete-polygon', 'DELETE', `/geofences/${polyId}`);
}

// (3b) R-M1-13: an EXPLICIT polylineDistance: 0 — the shape an unbuffered route would carry. The risk
// is silent: if the server drops the 0, the stored route loses its buffer attribute and re-reads as a
// plain linestring with no distance, i.e. no width. Measure what actually survives.
const routeArea = 'LINESTRING (36.7538 3.0588, 36.7548 3.0598)';
const route = await call('create-route-zero', 'POST', '/geofences', { name: stampName('route-zero'), area: routeArea, attributes: { polylineDistance: 0 } });
const routeId = route.parsed?.id;
if (Number.isInteger(routeId)) {
  const list = await call('read-route-zero', 'GET', `/geofences?id=${routeId}`);
  const row = Array.isArray(list.parsed) ? list.parsed.find((fence) => fence.id === routeId) : null;
  console.log(`stored-route-area="${row?.area ?? 'MISSING'}"`);
  console.log(`stored-route-attributes=${JSON.stringify(row?.attributes ?? null)}`);
  const distance = row?.attributes?.polylineDistance;
  console.log(`polylineDistance-present=${distance !== undefined} value=${JSON.stringify(distance)} type=${typeof distance}`);
  await call('delete-route-zero', 'DELETE', `/geofences/${routeId}`);
}

// (3c) the buffered route the app actually writes (buffer > 0) — the positive control for (3b).
const buffered = await call('create-route-buffered', 'POST', '/geofences', {
  name: stampName('route-buffered'), area: routeArea, attributes: { polylineDistance: 150 },
});
const bufferedId = buffered.parsed?.id;
if (Number.isInteger(bufferedId)) {
  const list = await call('read-route-buffered', 'GET', `/geofences?id=${bufferedId}`);
  const row = Array.isArray(list.parsed) ? list.parsed.find((fence) => fence.id === bufferedId) : null;
  console.log(`stored-buffered-attributes=${JSON.stringify(row?.attributes ?? null)}`);
  await call('delete-route-buffered', 'DELETE', `/geofences/${bufferedId}`);
}
