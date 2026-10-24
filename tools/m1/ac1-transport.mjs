// tools/m1/ac1-transport.mjs — AC-1's transport measurement, with an INJECTED source (R35/R37).
//
// The budget (spec §8) is source→server ≤30 s p95. No GPS is read in this phase: the position is
// injected from inside the phone over `adb reverse tcp:5055`, exactly as lab/README.md documents,
// and the tool measures fixTime→availability as the shipped client reads it (`GET /positions`).
// The source is therefore manual, and every printed verdict says so. A sample that never appears
// is a missing measurement, never a fast one: the verdict is NO DATA, not PASS (the report.mjs
// ruling from M0's final review).
//
// Credentials come from env (lab/traccar/fanout.env); nothing secret is printed — no email, no
// password, no token, no socket URL. Run:
//   set -a; source lab/traccar/fanout.env; set +a
//   npx tsx tools/m1/ac1-transport.mjs --device=lab-child-1 --samples=10
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { signIn, activeClient, resetSession } from '../../src/services/traccar/session.ts';
import { percentile } from '../../lab/sink/lib/latency.mjs';

const TARGET_P95_MS = 30_000;
const CENTER = { lat: 36.7538, lon: 3.0588 };

const args = new Map(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [key, value = ''] = a.slice(2).split('=');
      return [key, value];
    }),
);
const samples = Number(args.get('samples') ?? '10');
const deviceUniqueId = args.get('device') ?? process.env.LAB_DEVICE_UNIQUE_ID ?? 'lab-child-1';
const perSampleTimeoutMs = Number(args.get('timeout') ?? '30000');
const baseUrl = process.env.LAB_API_URL ?? 'http://127.0.0.1:8082/api';
const adb = process.env.ADB
  ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');

if (!Number.isInteger(samples) || samples < 1) {
  console.error('--samples must be a positive integer');
  process.exit(2);
}

function adbRun(remote) {
  return execFileSync(adb, ['shell', remote], { encoding: 'utf8', timeout: 20_000 }).replace(/\r/g, '');
}

function phoneEpoch() {
  const value = Number(adbRun('date +%s').trim());
  if (!Number.isFinite(value)) throw new Error('the phone did not return a usable clock');
  return value;
}

function inject({ lat, lon, ts }) {
  const line = `GET /?id=${deviceUniqueId}&valid=true&timestamp=${ts}&lat=${lat}&lon=${lon}`
    + '&accuracy=12&speed=0&bearing=0 HTTP/1.0\\r\\n\\r\\n';
  const response = adbRun(`{ printf '${line}'; sleep 2; } | nc -w 5 127.0.0.1 5055`);
  return response.split('\n')[0]?.trim() ?? '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!(process.env.LAB_ADMIN_EMAIL && process.env.LAB_ADMIN_PASSWORD)) {
  console.error('LAB_ADMIN_EMAIL/LAB_ADMIN_PASSWORD are not in the environment (source fanout.env)');
  process.exit(2);
}

const reverseList = execFileSync(adb, ['reverse', '--list'], { encoding: 'utf8' });
if (!/tcp:5055/.test(reverseList)) {
  execFileSync(adb, ['reverse', 'tcp:5055', 'tcp:5055'], { encoding: 'utf8' });
  console.log('tunnel: opened tcp:5055 (it was absent)');
  // Give adb's reverse socket a moment; the first injection right after opening was refused once.
  await new Promise((resolve) => setTimeout(resolve, 1000));
} else {
  console.log('tunnel: tcp:5055 already present');
}

const phoneBefore = phoneEpoch();
const pcBefore = Math.floor(Date.now() / 1000);
console.log(`clock: phone-pc=${phoneBefore - pcBefore}s (fixTime is second-resolution)`);

try {
  await signIn({
    baseUrl,
    email: process.env.LAB_ADMIN_EMAIL,
    password: process.env.LAB_ADMIN_PASSWORD,
  });
  const client = activeClient();
  if (!client) throw new Error('no client after sign-in');

  const devices = await client.get('/devices');
  const device = (devices ?? []).find((d) => d.uniqueId === deviceUniqueId);
  if (!device) throw new Error(`no device with uniqueId ${deviceUniqueId} on the server`);

  const seen = await client.get('/positions', { deviceId: device.id });
  let lastId = Math.max(0, ...(seen ?? []).map((p) => Number(p.id) || 0));
  let lastTs = 0;
  const latencies = [];

  for (let index = 0; index < samples; index += 1) {
    let ts = phoneEpoch();
    while (ts <= lastTs) {
      await sleep(250);
      ts = phoneEpoch();
    }
    lastTs = ts;
    const fixedAt = ts * 1000;
    const lat = (CENTER.lat + index * 0.00001).toFixed(5);
    const lon = (CENTER.lon + index * 0.00001).toFixed(5);

    const response = inject({ lat, lon, ts });
    if (!/200/.test(response)) {
      console.log(`sample ${index + 1}: INGEST REFUSED (${response || 'no response line'})`);
      continue;
    }

    const deadline = Date.now() + perSampleTimeoutMs;
    let latency = null;
    while (Date.now() < deadline) {
      const rows = await client.get('/positions', { deviceId: device.id });
      const hit = (rows ?? []).find(
        (p) => Number(p.id) > lastId && Date.parse(p.fixTime) === fixedAt,
      );
      if (hit) {
        lastId = Math.max(lastId, Number(hit.id) || 0);
        latency = Date.now() - fixedAt;
        break;
      }
      await sleep(200);
    }

    if (latency === null) {
      console.log(`sample ${index + 1}: NO DATA (not visible within ${perSampleTimeoutMs} ms)`);
      continue;
    }
    latencies.push(latency);
    console.log(`sample ${index + 1}: fixTime=${new Date(fixedAt).toISOString()} latency=${latency} ms`);
    await sleep(300);
  }

  const sorted = latencies.slice().sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted.length ? sorted[sorted.length - 1] : null;
  const clockSkew = latencies.filter((v) => v <= 0).length;

  console.log(`| samples | measured | p50 (ms) | p95 (ms) | max (ms) |`);
  console.log(`| ${samples} | ${sorted.length} | ${p50 ?? '-'} | ${p95 ?? '-'} | ${max ?? '-'} |`);
  console.log('source: MANUALLY INJECTED from the phone over adb reverse — no real GPS (R35/R37)');
  console.log('note: each latency is an upper bound; the adb injection command itself sleeps 2 s before nc closes');

  let verdict;
  if (sorted.length === 0) verdict = `NO DATA p95 not measured (records: 0)`;
  else if (clockSkew > 0) verdict = `INVALID clock skew: ${clockSkew} of ${sorted.length} samples have a non-positive latency`;
  else if (sorted.length < samples) verdict = `PARTIAL ${sorted.length}/${samples} measured — not enough for a PASS`;
  else if (p95 === null) verdict = `NO DATA p95 not measured (records: ${sorted.length})`;
  else if (p95 <= TARGET_P95_MS) verdict = `PASS p95 <= ${TARGET_P95_MS} ms (fixTime -> /positions availability)`;
  else verdict = `FAIL p95 > ${TARGET_P95_MS} ms (fixTime -> /positions availability)`;
  console.log(`verdict: ${verdict}`);
  console.log(`exit=${verdict.startsWith('PASS') ? 0 : 1}`);
  process.exitCode = verdict.startsWith('PASS') ? 0 : 1;
} finally {
  resetSession();
}
