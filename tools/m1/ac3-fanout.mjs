// tools/m1/ac3-fanout.mjs — AC-3: one confirmed geofenceExit must reach TWO guardians independently.
//
// Starts two child processes (tools/m1/ac3-guardian.mjs), each signed in as a DIFFERENT guardian and
// subscribed through the shipped socket client on the lab's real `web` notification channel. When both
// report `live`, the tool injects one position inside the school zone and one outside it (manual
// osmand injection from the phone over `adb reverse tcp:5055`, R35/R37). It then waits for a
// `geofenceExit` frame on BOTH children. Arrival times are the children's own receive timestamps, so
// one guardian's arrival is independent of the other's.
//
// Exit code 0 only when both guardians were live, no child fell back, and both received the same
// event id. Anything else is a failed measurement, never a pass. Nothing secret is printed: labels,
// ids and timestamps only. Run:
//   set -a; source lab/traccar/fanout.env; set +a
//   node tools/m1/ac3-fanout.mjs --device=lab-child-1
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..');
const CHILD = join(HERE, 'ac3-guardian.mjs');
const ADB = process.env.ADB
  ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const args = new Map(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [key, value = ''] = a.slice(2).split('=');
      return [key, value];
    }),
);
const DEVICE = args.get('device') ?? process.env.LAB_DEVICE_UNIQUE_ID ?? 'lab-child-1';
const SECONDS = Number(args.get('seconds') ?? '60');
const INSIDE = { lat: '36.75380', lon: '3.05880' };
const OUTSIDE = { lat: '36.75475', lon: '3.05955' };
const RUN_DIR = join(REPO, 'lab', 'logs', `ac3-fanout-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const OUT_A = join(RUN_DIR, 'guardian-a.ndjson');
const OUT_B = join(RUN_DIR, 'guardian-b.ndjson');

for (const key of ['LAB_ADMIN_EMAIL', 'LAB_ADMIN_PASSWORD', 'LAB_GUARDIAN2_EMAIL', 'LAB_GUARDIAN2_PASSWORD']) {
  if (!process.env[key]) {
    console.error(`${key} is not in the environment (source lab/traccar/fanout.env)`);
    process.exit(2);
  }
}

function adb(commandArgs) {
  return execFileSync(ADB, commandArgs, { encoding: 'utf8', timeout: 20_000 }).replace(/\r/g, '').trim();
}

function phoneEpoch() {
  return Number(adb(['shell', 'date', '+%s']));
}

function sendPosition({ lat, lon }, speed, bearing) {
  const ts = phoneEpoch();
  const line = `GET /?id=${DEVICE}&valid=true&timestamp=${ts}&lat=${lat}&lon=${lon}`
    + `&accuracy=12&speed=${speed}&bearing=${bearing} HTTP/1.0\\r\\n\\r\\n`;
  const remote = `{ printf '${line}'; sleep 2; } | nc -w 5 127.0.0.1 5055`;
  const body = adb(['shell', remote]);
  return { ts, at: Date.now(), response: body.split(/\r?\n/)[0] ?? '' };
}

function lines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function waitFor(predicate, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); resolve(true); return; }
      if (Date.now() - started > timeoutMs) { clearInterval(timer); resolve(false); }
    }, 100);
  });
}

mkdirSync(RUN_DIR, { recursive: true });
for (const file of [OUT_A, OUT_B]) rmSync(file, { force: true });

const reverse = adb(['reverse', '--list']);
if (!/tcp:5055/.test(reverse)) adb(['reverse', 'tcp:5055', 'tcp:5055']);

const childEnv = { ...process.env, AC3_SECONDS: String(SECONDS) };
const children = [
  spawn(process.execPath, ['--import', 'tsx', CHILD], {
    cwd: REPO,
    env: { ...childEnv, AC3_LABEL: 'guardian-a', AC3_OUT: OUT_A, AC3_EMAIL: process.env.LAB_ADMIN_EMAIL, AC3_PASSWORD: process.env.LAB_ADMIN_PASSWORD },
    stdio: ['ignore', 'ignore', 'pipe'],
  }),
  spawn(process.execPath, ['--import', 'tsx', CHILD], {
    cwd: REPO,
    env: { ...childEnv, AC3_LABEL: 'guardian-b', AC3_OUT: OUT_B, AC3_EMAIL: process.env.LAB_GUARDIAN2_EMAIL, AC3_PASSWORD: process.env.LAB_GUARDIAN2_PASSWORD },
    stdio: ['ignore', 'ignore', 'pipe'],
  }),
];
for (const child of children) child.stderr.on('data', () => {});

let inside = null;
let outside = null;
let live = false;
let delivered = false;

try {
  live = await waitFor(() => {
    const states = (file) => lines(file).filter((row) => row.state).map((row) => row.state);
    return states(OUT_A).includes('live') && states(OUT_B).includes('live');
  }, 20_000);

  if (live) {
    inside = sendPosition(INSIDE, '0', '0');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    outside = sendPosition(OUTSIDE, '3.4', '45');
    delivered = await waitFor(() => {
      const exits = (file) => lines(file).filter((row) => row.event?.type === 'geofenceExit');
      return exits(OUT_A).length > 0 && exits(OUT_B).length > 0;
    }, 30_000);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  for (const child of children) child.kill();
}

const summary = (file, label) => {
  const rows = lines(file);
  const states = rows.filter((row) => row.state).map((row) => ({ at: row.at, state: row.state }));
  const exits = rows.filter((row) => row.event?.type === 'geofenceExit').map((row) => ({
    at: row.at,
    id: row.event.id,
    type: row.event.type,
    eventTime: row.event.eventTime,
    deviceId: row.event.deviceId,
    geofenceId: row.event.geofenceId,
    positionId: row.event.positionId,
    latencyFromOutsideMs: outside === null ? null : row.at - outside.at,
  }));
  return { label, states, exits, anyFallback: states.some((state) => state.state === 'fallback') };
};

const guardianA = summary(OUT_A, 'guardian-a');
const guardianB = summary(OUT_B, 'guardian-b');
const sameEvent = guardianA.exits.length > 0 && guardianB.exits.length > 0
  && guardianA.exits.every((exit) => guardianB.exits.some((other) => other.id === exit.id));
const aAt = guardianA.exits[0]?.at ?? null;
const bAt = guardianB.exits[0]?.at ?? null;
const deltaMs = aAt !== null && bAt !== null ? Math.abs(aAt - bAt) : null;
const moreThanOne = [guardianA, guardianB].some((guardian) => new Set(guardian.exits.map((exit) => exit.id)).size > 1);

console.log(JSON.stringify({
  live,
  delivered,
  inside,
  outside,
  deltaMs,
  sameEvent,
  leftoverZonesSuspected: moreThanOne,
  guardians: [guardianA, guardianB],
  logs: { dir: RUN_DIR, a: OUT_A, b: OUT_B },
}, null, 2));

if (!(live && delivered && sameEvent) || guardianA.anyFallback || guardianB.anyFallback) {
  process.exitCode = 1;
}
