# Evidence 010 — M1 Task 12: AC-3 fan-out to two guardians on the `web` channel

- Date: 2026-10-24
- Server: Traccar 6.16.0, live H2 lab at `http://127.0.0.1:8082/api` (the instance M0 provisioned and
  `npm run lab:bootstrap` re-verified: device 1, geofence 1 `school`, notification 1 `geofenceExit`).
- Path under test: the **shipped** client — `signIn()` + `connectLive()` from `src/services/traccar/`
  (`session.ts`, `socket.ts`, `client.ts`). Each guardian runs in its own process with its own session.
- Accounts: `guardian-a` = the admin account (user id 1); `guardian-b` = the second guardian (user id 2,
  linked to device 1 and notification 1 by `lab:bootstrap`). No email, password, or token is printed.
- Channel: `web` only. Notification 1 carries `notificators=mail,web`; the template keeps `telegram`
  out of `notificator.types`, and `mail.debug=true` makes `Email sent / To:` selection-only text, never
  delivery evidence.
- Tools (committed in the same change): `tools/m1/ac3-fanout.mjs` (orchestrator) and
  `tools/m1/ac3-guardian.mjs` (one guardian's socket client).
- Numbering: the plan asked for `009-m1-ac3-web-fanout.md`, but **009 is already taken** by
  `009-m1-ac2-zone-on-server.md` (Task 8). This artifact is **010**; the plan references were corrected
  in the same change (R-M1-44).

## Method

1. Start two children, each signing in with its **own** credentials and subscribing through
   `connectLive()`. Wait until both report `state:"live"` — no child may sit in a fallback path.
2. Inject one position **inside** the school circle (36.75380, 3.05880) from the phone over
   `adb reverse tcp:5055` (manual osmand injection; no GPS — R35/R37), then one **outside** it
   (36.75475, 3.05955) ~25 m past the circle edge (geofence 1 is a 100 m circle).
3. Wait for a `geofenceExit` frame on **both** children. Each child stamps `Date.now()` when the frame
   is handed to the app; those stamps are the arrival times, so one guardian's arrival does not depend
   on the other's. Each child also records its own signed-in **user id** (via the shipped `whoAmI()`),
   so the summary can prove two distinct identities, not merely two sessions.

## Command (exact)

```bash
set -a; source lab/traccar/fanout.env; set +a
node tools/m1/ac3-fanout.mjs --device=lab-child-1 --seconds=45
```

## Output (verbatim, accepted run, exit 0)

This is the run on the **final tool bytes** (after the review added the identity assertion, the
fixTime latency baseline, the multiple-event failure and the explicit exit line). Log:
`task12-ac3-rerun.log`.

```text
clock: phone-pc=0s (fixTime is second-resolution)
{
  "live": true,
  "delivered": true,
  "inside": {
    "ts": 1792835666,
    "commandStart": 1792835667202,
    "at": 1792835669356,
    "response": "HTTP/1.1 200 OK"
  },
  "outside": {
    "ts": 1792835671,
    "commandStart": 1792835671968,
    "at": 1792835674108,
    "response": "HTTP/1.1 200 OK"
  },
  "deltaMs": 0,
  "sameEvent": true,
  "distinctIdentities": true,
  "leftoverZonesSuspected": false,
  "guardians": [
    {
      "label": "guardian-a",
      "userId": 1,
      "states": [
        {
          "at": 1792835667007,
          "state": "live"
        }
      ],
      "exits": [
        {
          "at": 1792835675844,
          "id": 74,
          "type": "geofenceExit",
          "eventTime": "2026-10-24T09:54:31.000+00:00",
          "deviceId": 1,
          "geofenceId": 1,
          "positionId": 110,
          "latencyFromFixTimeMs": 4844,
          "latencyFromCommandReturnMs": 1736
        }
      ],
      "anyFallback": false
    },
    {
      "label": "guardian-b",
      "userId": 2,
      "states": [
        {
          "at": 1792835666593,
          "state": "live"
        }
      ],
      "exits": [
        {
          "at": 1792835675844,
          "id": 74,
          "type": "geofenceExit",
          "eventTime": "2026-10-24T09:54:31.000+00:00",
          "deviceId": 1,
          "geofenceId": 1,
          "positionId": 110,
          "latencyFromFixTimeMs": 4844,
          "latencyFromCommandReturnMs": 1736
        }
      ],
      "anyFallback": false
    }
  ],
  "logs": {
    "dir": "C:\\Users\\Administrator\\Documents\\Qoder\\2026-10-05\\6bdda3ce\\kidguard-core\\lab\\logs\\ac3-fanout-2026-10-24T09-54-20-215Z",
    "a": "C:\\Users\\Administrator\\Documents\\Qoder\\2026-10-05\\6bdda3ce\\kidguard-core\\lab\\logs\\ac3-fanout-2026-10-24T09-54-20-215Z\\guardian-a.ndjson",
    "b": "C:\\Users\\Administrator\\Documents\\Qoder\\2026-10-05\\6bdda3ce\\kidguard-core\\lab\\logs\\ac3-fanout-2026-10-24T09-54-20-215Z\\guardian-b.ndjson"
  }
}
exit=0
EXIT=0
```

Raw per-frame NDJSON stays in `lab/logs/ac3-fanout-2026-10-24T09-54-20-215Z/` (git-ignored, local
artifact; the numbers above are the tool's own summary of those lines).

## Reading

- **Both sessions were live before the injection** (`state:"live"`, `anyFallback:false` on both), so the
  arrivals are socket frames, not polling results.
- **Two distinct signed-in identities are in the artifact**: guardian-a `userId 1`, guardian-b
  `userId 2` (recorded by `whoAmI()` before subscribing). `distinctIdentities:true`; the tool exits
  non-zero if an id is missing or equal.
- **Exactly one event reached each guardian**: id **74**, `geofenceExit`, device 1, geofence 1,
  position 110, eventTime `09:54:31Z`. `sameEvent:true`, `leftoverZonesSuspected:false` — and a
  multiple-event run now fails the exit code, not just a printed flag.
- **Latency is measured from the position's own `fixTime`** (`outside.ts`): **4844 ms** to each
  guardian. The old 1736 ms number is arrival-minus-command-return; it is kept only for traceability,
  because the adb command sleeps 2 s *after* sending and is not an injection time.
- **Independent arrival stamps**: both children stamped the frame in the same millisecond
  (`deltaMs: 0`); each stamp is taken in its own process, so neither depends on the other. A zero
  delta is a coincidence of local broadcast, not a shared clock read.
- An earlier scratch run on the same day delivered **five** `geofenceExit` events because leftover
  Task 8 zones shared the school center; those zones (38–41) were unlinked and deleted through the
  service, and the rerun above delivered exactly one. That cleanup is why `leftoverZonesSuspected` is a
  field in the tool rather than a footnote.

## What this does NOT prove

- **Not the app-side confirmed P1 path.** The children subscribe with `connectLive()` and record the
  raw server `geofenceExit`. They do **not** run `AlertsLog` → `createExitTracker` (three consecutive
  outside readings) and the outside point is only ~25 m past the circle, below the ≥50 m margin that is
  still M2 debt. Confirmation and margin are **unit-tested only** (`tests/app/events.test.ts`), not
  live-exercised here.
- **Not a generic channel result.** Mail and Telegram are **NOT RUN** — mail has no real recipient in
  the lab (`mail.debug=true`), and Telegram is deliberately absent from `notificator.types`. Native
  push/system notifications are **NOT RUN (needs APK)**.
- **Not 24/7, not a public network.** Two accounts, one device, one local Traccar over loopback; no
  reconnection, outage, or scale measurement was made.
- **Not a per-user filtering proof beyond these two accounts**: both are legitimate recipients
  (admin by role; guardian 2 by the bootstrap links). What is measured is delivery to two distinct
  authenticated users, not the server's behaviour for an unlinked third user.
