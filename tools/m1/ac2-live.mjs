// tools/m1/ac2-live.mjs — AC-2 re-measured against the live lab through the SHIPPED service.
//
// AC-2 has two halves: the drawn zone must exist on the server, and the app must not keep a local
// record of it. The first half is read back with `listZones()` (the server's own `area`, not the
// draft we sent). The second half is measured with a localStorage spy installed BEFORE the service
// is imported and used: every read/write is recorded, so "zero calls" is a count, not a claim.
// The zone is deleted again in `finally`, so the lab is left as it was found.
//
// Credentials come from env (lab/traccar/fanout.env); nothing secret is printed — no email, no
// password, no token. Run:
//   set -a; source lab/traccar/fanout.env; set +a
//   node tools/m1/ac2-live.mjs
import { signIn, activeClient, resetSession } from '../../src/services/traccar/session.ts';
import { createZoneService } from '../../src/services/traccar/zones.ts';

const EXPECTED_AREA = 'CIRCLE (36.7538 3.0588, 120)';
const accesses = { reads: [], writes: [] };
const backing = new Map();

// `writable: true` matters to `tsc --noEmit`: with `allowJs`, TS infers this descriptor as a
// global property declaration, and an omitted `writable` means readonly — which would redden the
// untouched spy assignment in tests/core.test.ts. Runtime behaviour is unchanged.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (key) => { accesses.reads.push(key); return backing.get(key) ?? null; },
    setItem: (key, value) => { accesses.writes.push(key); backing.set(key, String(value)); },
    removeItem: (key) => backing.delete(key),
    clear: () => backing.clear(),
    key: (index) => [...backing.keys()][index] ?? null,
    get length() { return backing.size; },
  },
});

if (!(process.env.LAB_ADMIN_EMAIL && process.env.LAB_ADMIN_PASSWORD)) {
  console.error('LAB_ADMIN_EMAIL/LAB_ADMIN_PASSWORD are not in the environment (source fanout.env)');
  process.exit(2);
}

const name = `lab-zone-m1-gate-${Date.now()}`;
let saved = null;
let service = null;
let exitCode = 0;

try {
  await signIn({
    baseUrl: process.env.LAB_API_URL ?? 'http://127.0.0.1:8082/api',
    email: process.env.LAB_ADMIN_EMAIL,
    password: process.env.LAB_ADMIN_PASSWORD,
  });
  const client = activeClient();
  if (!client) throw new Error('no client after sign-in');
  service = createZoneService({ client });

  await service.createZone({
    name,
    type: 'school',
    geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 120 },
  });
  saved = (await service.listZones()).find((zone) => zone.name === name);
  if (!saved) throw new Error('POST succeeded but the re-read list does not contain the zone');

  const roundtrip = saved.area === EXPECTED_AREA;
  console.log(`AC2-LINE geofence ${saved.id} "${saved.name}" area=${saved.area}`);
  console.log(`roundtrip=${roundtrip}`);
  console.log(`localStorage.keys=${JSON.stringify([...backing.keys()])}`);
  console.log(`localStorage.reads=${accesses.reads.length} writes=${accesses.writes.length}`);
  console.log(JSON.stringify({ reads: accesses.reads, writes: accesses.writes }));
  if (!roundtrip) {
    console.error(`FAIL the server area differs from the drawn geometry: ${EXPECTED_AREA}`);
    exitCode = 1;
  }
  if (accesses.reads.length > 0 || accesses.writes.length > 0) {
    console.error('FAIL the save path touched localStorage');
    exitCode = 1;
  }
} catch (error) {
  console.error(`FAIL ${error?.message ?? error}`);
  exitCode = 1;
} finally {
  if (service && saved) {
    try {
      await service.deleteZone(saved.id);
      console.log(`cleanup: deleted geofence ${saved.id}`);
    } catch (error) {
      console.error(`cleanup: geofence ${saved.id} NOT deleted: ${error?.message ?? error}`);
      exitCode = 1;
    }
  }
  resetSession();
  process.exitCode = exitCode;
}
