// Task 6 (M0 gate): replay a scenario corpus by posting positions into Traccar on a deadline
// schedule, then let the sink measure the resulting events. CLI:
//   npm run lab:scenario -- school-exit --speed=1
//   npm run lab:scenario -- route-park  --speed=1
// The speed argument is ALWAYS written --speed=N. Lab-only, Node built-ins only.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { postPosition, sendSchedule } from './post-position.mjs';

// Puts are paced by deadlines (ruling R29), not by after-post relative sleeps: reading i is posted
// when its deadline arrives and stamped with the whole-second wall clock of that same deadline, so
// no position is ever stamped in the future of when it is sent. Kept parameterised for tests and
// for a quiet replay; the running defaults are the real sink/Traccar/Date.now.
export async function replayScenario({
  name,
  speed,
  env = process.env,
  log = console.log,
  readFileFn = readFile,
  wait = (ms) => new Promise((done) => setTimeout(done, ms)),
  post = postPosition,
  nowSec = () => Math.floor(Date.now() / 1000),
}) {
  const scenario = JSON.parse(await readFileFn(
    new URL(`../scenarios/${String(name).replace(/\.json$/, '')}.json`, import.meta.url), 'utf8'));
  const uniqueId = env.LAB_DEVICE_UNIQUE_ID ?? 'lab-child-1';
  const host = env.LAB_OSMAND_HOST ?? '127.0.0.1';
  const port = Number(env.LAB_OSMAND_PORT ?? 5055);

  const t0Sec = nowSec();
  const schedule = sendSchedule(scenario.readings, speed, t0Sec);
  log(`scenario ${scenario.name}: ${scenario.readings.length} readings, speed=${speed}, `
    + `device ${uniqueId}, expect ${scenario.expectEvent}`);

  for (let i = 0; i < scenario.readings.length; i += 1) {
    const reading = scenario.readings[i];
    const { timestampSec, deadlineMs } = schedule[i];
    // Await the deadline FIRST, then post: the send second is >= deadlineMs, and timestampSec is
    // floor(deadlineMs/1000), so the stamp never exceeds the second the position is actually sent.
    await wait(Math.max(0, deadlineMs - Date.now()));
    await post({ host, port, uniqueId, reading, absoluteTimeSec: timestampSec });
    log(`  t+${reading.offsetSec}s -> ${reading.lat}, ${reading.lon} (stamped ${timestampSec})`);
  }
  log('sent. Now read lab/artifacts/events.ndjson and run npm run lab:report');
  return { scenario, schedule, uniqueId };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , nameArg = 'school-exit', speedArg = '--speed=1'] = process.argv;
  const speed = Number(speedArg.replace(/^--speed=/, ''));
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error(`bad --speed "${speedArg}" (use e.g. --speed=1, must be > 0)`);
  }
  await replayScenario({ name: nameArg, speed });
}
