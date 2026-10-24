// tools/m1/ac3-guardian.mjs — one guardian's live socket client for the AC-3 measurement.
//
// Signs in with its OWN credentials and subscribes through the SHIPPED `connectLive()`. It records
// its signed-in user id once, then every frame (state transition, event) as one JSON line in
// AC3_OUT, with `Date.now()` taken when the frame was handed to the app — that timestamp is what
// the orchestrator turns into an arrival time. Nothing secret is written: no email, no password,
// no token, no socket URL. Run through tools/m1/ac3-fanout.mjs, never directly by hand.
import { appendFileSync } from 'node:fs';
import { signIn, resetSession, whoAmI } from '../../src/services/traccar/session.ts';
import { connectLive } from '../../src/services/traccar/socket.ts';

const out = process.env.AC3_OUT;
const label = process.env.AC3_LABEL;
const seconds = Number(process.env.AC3_SECONDS ?? '60');

if (!out || !label || !process.env.AC3_EMAIL || !process.env.AC3_PASSWORD) {
  console.error('AC3_OUT/AC3_LABEL/AC3_EMAIL/AC3_PASSWORD are required (use ac3-fanout.mjs)');
  process.exit(2);
}

function record(entry) {
  appendFileSync(out, `${JSON.stringify({ label, at: Date.now(), ...entry })}\n`);
}

await signIn({
  baseUrl: process.env.LAB_API_URL ?? 'http://127.0.0.1:8082/api',
  email: process.env.AC3_EMAIL,
  password: process.env.AC3_PASSWORD,
});

// Record the signed-in identity so the orchestrator proves two DISTINCT accounts, not two sessions.
// Id only: no email, no name.
const me = await whoAmI();
record({ user: { id: me.id } });

const handle = await connectLive({
  onEvent: (event) => record({ event }),
  onState: (state) => record({ state }),
});

await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
handle.close();
resetSession();
record({ state: 'exit' });
