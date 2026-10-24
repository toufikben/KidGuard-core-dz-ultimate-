# Evidence 012 — M1 Task 12: AC-1 transport, measured with a manually injected source

- Date: 2026-10-24
- Server: Traccar 6.16.0, live H2 lab at `http://127.0.0.1:8082/api` (osmand ingest on 5055).
- Phone: the Realme used in M0 (USB debugging), identified only by the last four characters `HMS8`;
  the position enters through `adb reverse tcp:5055`.
- Path under test: the **shipped** client (`src/services/traccar/session.ts` + `client.ts`) reading
  `GET /positions` — the same call the app makes. No hand-written HTTP for the read path.
- Source: **manually injected** osmand request from inside the phone. **No GPS, no tracker app** —
  R35/R37. The clock offset was measured before the run: `phone-pc=0s`.
- Credentials: read from `lab/traccar/fanout.env` into the environment; nothing secret is printed.
- Tool (committed in the same change): `tools/m1/ac1-transport.mjs`.
- Numbering: the plan asked for `011-m1-ac1-transport.md`, but **009 is already taken** by the Task 8
  artifact; after shifting that list, 011 is the phone-check artifact and this one is **012**
  (R-M1-44).

## Command (exact)

```bash
set -a; source lab/traccar/fanout.env; set +a
LAB_API_URL=http://127.0.0.1:8082/api node tools/m1/ac1-transport.mjs --device=lab-child-1 --samples=10
```

## Output (verbatim, exit 0)

```
tunnel: tcp:5055 already present
clock: phone-pc=0s (fixTime is second-resolution)
sample 1: fixTime=2026-10-24T08:55:42.000Z latency=5399 ms
sample 2: fixTime=2026-10-24T08:55:47.000Z latency=5190 ms
sample 3: fixTime=2026-10-24T08:55:52.000Z latency=3748 ms
sample 4: fixTime=2026-10-24T08:55:56.000Z latency=3332 ms
sample 5: fixTime=2026-10-24T08:55:59.000Z latency=5115 ms
sample 6: fixTime=2026-10-24T08:56:04.000Z latency=4950 ms
sample 7: fixTime=2026-10-24T08:56:09.000Z latency=3676 ms
sample 8: fixTime=2026-10-24T08:56:12.000Z latency=5457 ms
sample 9: fixTime=2026-10-24T08:56:17.000Z latency=5194 ms
sample 10: fixTime=2026-10-24T08:56:22.000Z latency=4262 ms
| samples | measured | p50 (ms) | p95 (ms) | max (ms) |
| 10 | 10 | 4950 | 5457 | 5457 |
source: MANUALLY INJECTED from the phone over adb reverse — no real GPS (R35/R37)
verdict: PASS p95 <= 30000 ms (fixTime -> /positions availability)
```

## Verdict

**AC-1 transport: PASS** — 10 of 10 samples measured, p50 **4950 ms**, p95 **5457 ms**, max **5457 ms**,
against a 30 000 ms p95 budget. Percentiles use the same `percentile()` as `lab/sink/report.mjs`
(nearest rank); a sample that never appears would print `NO DATA`, never `PASS`.

The measured interval is **`fixTime` (taken on the phone) → the position being visible in
`GET /positions` through the shipped client**. It includes adb command startup and the 200 ms polling
cadence, so it is an upper bound on the server-side ingest delay, not a lower bound.

## What this does NOT prove

- **No GPS source**: coordinates were typed into the osmand request by the tool. The GPS/`Location`
  stack, permissions, and background tracking are untouched (R35/R37).
- **No native app shell**: this ran in Node against the same client code; the browser/Capacitor shell
  on the phone was not exercised (see `011-m1-phone-check.md` — NOT RUN).
- **No public network**: phone→PC over USB `adb reverse`, server on loopback. No cellular, no VPS.
- **One device, one lab**: no multi-device, roaming, or outage behaviour was measured.
