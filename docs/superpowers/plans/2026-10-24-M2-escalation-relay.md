# M2 — Escalation Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small self-hosted relay that turns one Traccar forward into an auditable escalation: every guardian is contacted in parallel, an unacknowledged incident climbs a 60-second ladder, five minutes of source silence is itself announced as an alarm, and an SOS produces a copyable incident sheet.

**Architecture:** A dependency-free TypeScript Node service lives under `relay/`: pure, clock-injected domain modules (`tiers`, `incidents`, `sheet`, `source`) wrapped by one HTTP/SSE server (`server.ts`) whose only inbound integration point is the existing Traccar forward `POST /alert`. The guardian app reads the same relay over Bearer-authenticated JSON plus a fetch-based SSE stream, because `EventSource` cannot set `Authorization`. Tokens are Traccar-minted and leased from the existing session layer; no token ever enters a snapshot, an audit entry, or a printed line.

**Tech Stack:** Node 22 (CI) / Node 24 (local), TypeScript 5.8, `node:http`, `node:crypto`, `node:fs`, `node:test` via `tsx`, React 19 + `renderToStaticMarkup` for copy tests, Vite dev proxy. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-10-05-parent-side-tracing-design.md` (§5, §5.7–§5.13, §8, §13, §14). The spec is the binding authority; this plan is its argument. Where the plan and the spec disagree, the spec wins and the controller records a ruling.

---

## Global Constraints

- **Gate:** M2 is accepted only for **AC-4** (no ack 60 s → next contact + sequence log), **AC-5** (5 min source silence → announced degraded + escalation), **AC-6** (SOS → P0 + copyable sheet path ≤10 s). AC-13, AC-14, AC-15, AC-16, AC-17, AC-18 are **NOT RUN** in M2 unless the controller separately measures them; never report them as met.
- **No new dependencies.** Nothing is added to `dependencies` or `devDependencies`.
- **CI is the only build verifier.** This PC is 2 cores / 4 GB / HDD; never build locally. Node 22 in CI, Node 24 locally.
- **`tests 0` exits 0.** Every test collection is policed by a numeric floor in the workflow that always runs. A task that adds tests raises the floor in the same commit.
- **`tsconfig.json` has no `include`.** Every new `.ts` file enters `npm run lint` (`tsc --noEmit`). Relay code must type-check under the existing `lib` (`ES2022`, `DOM`, `DOM.Iterable`).
- **Secrets never appear** in chat, in a committed file, in an audit entry, in an incident, in a snapshot, in an error message, or in a screenshot. Read `lab/traccar/fanout.env` by path only; never print values; never put a password on a command line (`set -a; source lab/traccar/fanout.env; set +a`).
- **Device serial:** last four characters only (`HMS8`). A serial of length ≤4 is not printed at all, because that would be the whole serial.
- **No user email** in any committed artifact. Recipients are printed as `#<userId>` plus an optional display name.
- **No browser storage** for tokens: no `localStorage`, `sessionStorage`, or IndexedDB in `relay/*`, `src/services/relay/*`, `src/state/escalation.ts`, or the session service.
- **Arabic-first copy** lives only in `src/translations/catalog.ts`. A component holds no literal copy. No line may claim the child is safe, live, or guaranteed (`safe`, `guaranteed`, `بأمان`, `حيّ`).
- **Honesty:** an unmeasured path is `NOT RUN`, never `PASS`. Evidence files contain only measured numbers and the command that produced them.
- **Lab-only data:** device names and serials in artifacts start with `lab-` / end with the last four characters. Never a real child name.
- **Never merge, never open a PR.** The controller pushes after each reviewed task; a subagent never pushes.
- **Relay binds `127.0.0.1`.** The forward sink and the relay are local; no public exposure is claimed or tested.
- **Forward endpoint shape is fixed:** `POST /alert`, JSON, `X-Lab-Sign: <LAB_FORWARD_TOKEN>` (Traccar `EventForwarderJson` sends configured headers verbatim), 1 MiB cap, flush then destroy on 413. The lab forward template does not change.
- **Tier mapping in the relay is deliberately narrower than M1's display mapping:** `alarm=sos` → P0; any other non-empty alarm → P1; `alarm` missing/`none` → ignored; `geofenceExit` → P1; `deviceOffline` → P2. §5 makes P0 the SOS button; M1's blanket `alarm → P0` was display-only. This divergence is tested.
- **No closing, no de-tiering, no automatic un-degrade in M2.** An ack assigns ownership; it never closes. Silence degrades; only a fresh source stops new degradation, and no code path clears an incident's `degraded` flag.

---

## Measured Facts This Plan Relies On

| Fact | Source |
|---|---|
| Traccar 6.16.0 lab at `http://127.0.0.1:8082/api`; osmand listener `5055`; admin id 1, guardian2 id 2, device 1 `lab-child-1`, geofence 1 `school` (100 m) | `lab/report/M1-REPORT.md`; `lab/traccar/fanout.env` names only |
| Forward payload is `{event, position, device, geofence}`; header configured as `X-Lab-Sign` | `lab/sink/lib/parse-event.mjs`; evidence 005/010 |
| `NotificationManager.java:90` forwards **before** notification matching, so every event reaches the sink | M1 measured source reading |
| `AlarmEventHandler.java:29-58` emits `alarm` and copies `Position.KEY_ALARM` into `attributes.alarm` | M1 measured source reading |
| `POST /api/session/token` returns the bare token text; `GET /api/session?token=` is `@PermitAll`; `POST /api/session/token/revoke` takes `token` form field | `src/services/traccar/session.ts`; evidence 008 §3.1 |
| `GET /api/positions` with no params = latest position per device | M1 lab probe |
| Node 24 prints `ℹ tests`, Node 22 prints `# tests`; CI parser accepts both | `.github/workflows/m1-ci.yml` |
| Current floors: app 229, lab 97 | `.github/workflows/m1-ci.yml` |
| Session layer keeps one in-memory record and mints one token; `connectLive` accepts injected `mintToken`/`revokeToken` | `src/services/traccar/session.ts`, `socket.ts` |
| Alerts view already owns a live channel via `useLiveAlerts(view === 'alerts' && …)` | `src/App.tsx:126` |
| M1 AC-3: event 74 reached userIds 1 and 2 on `web`, delta 0 ms | evidence 010 |

## File Map

| Path | Responsibility |
|---|---|
| `relay/types.ts` | Entity shapes only; no logic |
| `relay/errors.ts` | `RelayError` with a closed kind union and HTTP status |
| `relay/tiers.ts` | Forward payload → tier (`P0`/`P1`/`P2`/none) |
| `relay/audit.ts` | Append-only in-memory log + recursive sanitizer + NDJSON |
| `relay/incidents.ts` | Ingest, parallel send, ack-window ladder, ack, degrade, snapshot copies |
| `relay/sheet.ts` | Deterministic Arabic incident sheet, bounded at 4000 chars |
| `relay/auth.ts` | Bearer token → Traccar user id, hash-keyed short cache |
| `relay/source.ts` | Position poll interpretation: fresh/stale/unknown/poll-failed |
| `relay/server.ts` | HTTP + SSE routes, signature check, 1 MiB cap, JSON serialization |
| `relay/main.ts` | Env parse, Traccar wiring, poller + ticker, graceful close |
| `src/services/relay/client.ts` | Bearer JSON client, status-only errors |
| `src/services/relay/stream.ts` | SSE parser + fetch streaming reader |
| `src/state/escalation.ts` | idle/connecting/live/fallback/failed store, receipts, ack |
| `src/components/RelayPanel.tsx` | Incident list, delivery table, degraded banner |
| `src/components/IncidentSheet.tsx` | P0 sheet dialog + one-tap copy |
| `src/translations/catalog.ts` | `relay.*` keys (all three languages) |
| `src/App.tsx` | Mounts `RelayPanel` in the alerts view |
| `vite.config.ts` | `/relay` → `http://127.0.0.1:8083` dev proxy |
| `tests/relay/*.test.ts` | Relay domain + HTTP tests |
| `tests/app/relay*.test.ts` | App relay layer + UI copy tests |
| `tests/core.test.ts` | Always-run guard for the relay floor |
| `.github/workflows/m2-ci.yml` | Node 22: lint, build, relay floor, app floor, lab floor, `lab:check` |
| `tools/m2/*.mjs` | AC-4 / AC-5 / AC-6 harnesses (signed synthetic forwards + real waits) |
| `lab/report/evidence/013..015-*.md` | Measured M2 evidence |
| `lab/report/M2-REPORT.md` | M2 verdict, numbers, and NOT RUN list |
| `docs/superpowers/plans/2026-10-05-roadmap.md` | M2 row marked closed only after evidence |

---

## Controller Rulings Baked Into This Plan

Each ruling is recorded here so an implementer never has to guess, and so a reviewer can reject a deviation:

1. **All recipients are sent in parallel at ingest**, then one recipient at a time owns the *current* window. The ladder is an escalation of responsibility, not of delivery.
2. **The window starts at the later of the handoff instant and the contact's delivery-else-send instant**, so a guardian escalated to after their notice landed still gets a full window. The escalation audit records the real anchor: `basis: 'delivered'` only when the delivery instant is ≥ the handoff, otherwise `'sent'`, plus `anchorAt` and `deadlineAt`. A late delivery pushes the current deadline later (never earlier).
3. **At the last recipient's expiry**, the relay audits `window_expired {atEnd:true}` once and stays active. `atEnd` is terminal: a late `delivered`/`opened` afterwards records the receipt but never installs a window, so a second `atEnd` audit is impossible. M2 has no close endpoint.
4. **Any recipient may ack, including one who is not current.** The ack assigns `assigneeUserId`, stops the ladder, and changes nothing else. The ack audit carries `assigneeUserId` and `afterDegraded`. An ack after degradation records the assignee but keeps `state:'degraded'` and the `degraded` flag: degradation is never cleared by an ack. A second ack by a different user is `409 conflict`; a repeat ack by the same user is idempotent.
5. **Silence=alarm:** five minutes (≥300 000 ms) without a fresh fix degrades every open incident, clears its assignee, jumps the current contact to the last recipient, audits `degraded` + `escalation {reason:'silence'}`, and is never auto-cleared. The jump is terminal: `atEnd` becomes true.
6. **A source poll failure is not silence.** It audits `source_poll_failed` once per transition and never degrades. An unreadable `fixTime` is not evidence either: it yields `unknown`, which neither degrades nor recovers.
7. **Recipients** come from `LAB_RELAY_RECIPIENT_IDS` when set (comma-separated user ids, sorted ascending); otherwise from `GET /api/users` at startup and every 5 minutes. M2 treats every account as a guardian; named-guardian selection and quorum are AC-14 and NOT RUN.
8. **Silence watches the oldest fix among returned devices.** With one lab device this is exact; with several it is the conservative reading. Multi-child silence is NOT RUN.
9. **The relay never verifies a signature with `===`.** Compare SHA-256 digests with `timingSafeEqual` so length is not a side channel.
10. **`sheetText` is computed, never stored**, and is present in every incident JSON plus `GET /incidents/:id/sheet` for the AC-6 harness.

---

### Task 1: Relay foundation — types, tiers, audit, scripts, M2 CI guard

**Files:**
- Create: `relay/types.ts`
- Create: `relay/errors.ts`
- Create: `relay/tiers.ts`
- Create: `relay/audit.ts`
- Create: `tests/relay/helpers.ts`
- Test: `tests/relay/tiers.test.ts`
- Test: `tests/relay/audit.test.ts`
- Modify: `package.json` (scripts only)
- Create: `.github/workflows/m2-ci.yml`
- Modify: `tests/core.test.ts` (always-run relay floor guard)

**Interfaces:**
- Consumes: nothing (first relay task).
- Produces:
  - `ForwardPayload`, `RelayTier`, `RelayRecipient`, `Delivery`, `Incident` (types used by Tasks 2–5, 7, 8).
  - `RelayError { kind: 'conflict'|'notfound'|'forbidden'|'badpayload'; status: number }`.
  - `forwardTier(payload): RelayTier | null`, `alarmName(payload): string | null`.
  - `createAuditLog({now?, write?}) → { record(action, data?), entries(), toNdjson() }`, `sanitize(value)`, `AuditLog` type.

- [ ] **Step 1: Write the failing tests**

`tests/relay/helpers.ts`:

```ts
import type { ForwardPayload } from '../../relay/types.ts';

export function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    set: (value: number) => { t = value; },
    advance: (ms: number) => { t += ms; },
  };
}

// One payload builder so every test speaks the measured forward shape and no test invents a field.
export function forwardPayload(overrides: {
  type?: string;
  alarm?: string | null;
  eventId?: number;
  deviceId?: number;
  fixTime?: string;
  serial?: string;
  geofenceName?: string;
  attributes?: Record<string, unknown>;
} = {}): ForwardPayload {
  const {
    type = 'geofenceExit', alarm = null, eventId = 74, deviceId = 1,
    fixTime = '2026-10-24T10:00:00.000Z', serial = '1234567890HMS8',
    geofenceName = 'school', attributes = {},
  } = overrides;
  return {
    event: { id: eventId, type, eventTime: fixTime, deviceId, ...(attributes ? { attributes } : {}) },
    position: {
      id: 900 + eventId, fixTime, latitude: 36.7538, longitude: 3.0588,
      accuracy: 12, speed: 2, course: 0,
      attributes: alarm === null ? {} : { alarm },
    },
    device: { id: deviceId, name: 'lab-child-1', uniqueId: serial },
    geofence: geofenceName === '' ? null : { id: 1, name: geofenceName },
  };
}
```

`tests/relay/tiers.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { alarmName, forwardTier } from '../../relay/tiers.ts';
import { forwardPayload } from './helpers.ts';

test('tiers: alarm=sos is P0 — the only path to the highest tier (§5)', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: 'sos' })), 'P0');
  assert.equal(alarmName(forwardPayload({ type: 'alarm', alarm: 'sos' })), 'sos');
});

test('tiers: another alarm is P1, not P0', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: 'vibration' })), 'P1');
});

test('tiers: an alarm with no usable alarm name is ignored, not upgraded', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: null })), null);
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: 'none' })), null);
  assert.equal(forwardTier(forwardPayload({ type: 'alarm', alarm: '  ' })), null);
});

test('tiers: geofenceExit is P1', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'geofenceExit' })), 'P1');
});

test('tiers: deviceOffline is P2 — never police (§5)', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'deviceOffline' })), 'P2');
});

test('tiers: every other event type is ignored', () => {
  assert.equal(forwardTier(forwardPayload({ type: 'geofenceEnter' })), null);
  assert.equal(forwardTier(forwardPayload({ type: 'textMessage' })), null);
  assert.equal(forwardTier({}), null);
});
```

`tests/relay/audit.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog, sanitize } from '../../relay/audit.ts';
import { fakeClock } from './helpers.ts';

test('audit: entries carry a monotonic seq and an ISO instant from the injected clock', () => {
  const clock = fakeClock();
  const log = createAuditLog({ now: clock.now });
  const first = log.record('ingest', { eventId: 74 });
  clock.advance(1000);
  const second = log.record('sent', { userId: 1 });
  assert.equal(first.seq, 1);
  assert.equal(second.seq, 2);
  assert.equal(first.at, new Date(1_700_000_000_000).toISOString());
  assert.notEqual(first.at, second.at);
});

test('audit: sanitize drops secret-shaped keys at every depth and bounds long strings', () => {
  const out = sanitize({
    ok: 'visible',
    password: 'sup3rs3cret',
    assigneeUserId: 2,
    deviceSerialLast4: 'HMS8',
    signedAt: '2026-10-24T00:00:00.000Z',
    designation: 'lead',
    deviceToken: 't0k',
    emailAddress: 'a@b.c',
    signature: 'sig',
    nested: { authorization: 'Bearer abc', token: 't0k', email: 'a@b.c', keep: 'yes' },
    long: 'x'.repeat(500),
  }) as Record<string, unknown>;
  assert.equal(out.ok, 'visible');
  assert.equal(out.password, undefined);
  assert.equal(out.assigneeUserId, 2);
  assert.equal(out.deviceSerialLast4, 'HMS8');
  assert.equal(out.signedAt, '2026-10-24T00:00:00.000Z');
  assert.equal(out.designation, 'lead');
  assert.equal(out.deviceToken, undefined);
  assert.equal(out.emailAddress, undefined);
  assert.equal(out.signature, undefined);
  const nested = out.nested as Record<string, unknown>;
  assert.equal(nested.authorization, undefined);
  assert.equal(nested.token, undefined);
  assert.equal(nested.email, undefined);
  assert.equal(nested.keep, 'yes');
  assert.ok((out.long as string).length <= 201);
});

test('audit: a circular object is recorded as a marker instead of throwing', () => {
  const value: Record<string, unknown> = { name: 'loop' };
  value.self = value;
  const out = sanitize(value) as Record<string, unknown>;
  assert.equal(out.name, 'loop');
  assert.equal(out.self, '[circular]');
  const shared = { x: 1 };
  const copies = sanitize({ a: shared, b: shared }) as Record<string, unknown>;
  assert.deepEqual(copies.a, { x: 1 });
  assert.deepEqual(copies.b, { x: 1 });
  const log = createAuditLog();
  assert.doesNotThrow(() => log.record('internal_error', { value }));
});

test('audit: non-finite numbers become null and NDJSON is one line per entry', () => {
  const log = createAuditLog();
  log.record('ingest', { bad: Number.NaN, worse: Number.POSITIVE_INFINITY });
  log.record('sent', { userId: 1 });
  const lines = log.toNdjson().split('\n');
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]) as { data: Record<string, unknown> };
  assert.equal(first.data.bad, null);
  assert.equal(first.data.worse, null);
  assert.equal(log.entries().length, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:relay --silent` (after Step 4 adds the script, this command exists; before that run `node --import tsx --test "tests/relay/*.test.ts"`)
Expected: FAIL — `Cannot find module '../../relay/tiers.ts'`.

- [ ] **Step 3: Implement the relay foundation**

`relay/types.ts`:

```ts
// relay/types.ts — entity shapes only; no logic lives here.
// Field names follow the measured Traccar forward payload (evidence 005/010) and the M1 client types.
export type RelayTier = 'P0' | 'P1' | 'P2';

export type ForwardEvent = {
  id: number;
  type: string;
  eventTime: string;
  deviceId: number;
  positionId?: number;
  geofenceId?: number;
  attributes?: Record<string, unknown>;
};

export type ForwardPosition = {
  id?: number;
  fixTime?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  speed?: number;
  course?: number;
  attributes?: Record<string, unknown>;
};

export type ForwardDevice = { id?: number; name?: string; uniqueId?: string };
export type ForwardGeofence = { id?: number; name?: string };

export type ForwardPayload = {
  event?: ForwardEvent | null;
  position?: ForwardPosition | null;
  device?: ForwardDevice | null;
  geofence?: ForwardGeofence | null;
};

export type RelayRecipient = { userId: number; name?: string };
export type DeliveryState = 'sent' | 'delivered' | 'opened';
export type Delivery = {
  userId: number;
  state: DeliveryState;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
};

export type IncidentState = 'active' | 'assigned' | 'degraded';
export type IncidentPosition = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speedKnots: number | null;
  fixTime: string | null;
  ageMs: number | null;
};
export type IncidentTimelineEntry = { at: string; action: string; detail: Record<string, unknown> };

export type Incident = {
  id: string;
  eventId: number;
  eventType: string;
  alarm: string | null;
  tier: RelayTier;
  state: IncidentState;
  deviceId: number;
  deviceName: string | null;
  deviceSerialLast4: string | null;
  geofenceName: string | null;
  eventTime: string;
  createdAt: string;
  position: IncidentPosition;
  recipients: RelayRecipient[];
  deliveries: Delivery[];
  currentRecipientUserId: number | null;
  assigneeUserId: number | null;
  degraded: boolean;
  windowMs: number;
  deadlineAt: string | null;
  atEnd: boolean;
  timeline: IncidentTimelineEntry[];
};
```

`relay/errors.ts`:

```ts
// relay/errors.ts — the only error type the relay's domain and HTTP layers share.
// Messages are written here, never copied from a request body or a token.
export type RelayErrorKind = 'conflict' | 'notfound' | 'forbidden' | 'badpayload';

export class RelayError extends Error {
  readonly kind: RelayErrorKind;
  readonly status: number;

  constructor(kind: RelayErrorKind, status: number, message: string) {
    super(message);
    this.name = 'RelayError';
    this.kind = kind;
    this.status = status;
  }
}
```

`relay/tiers.ts`:

```ts
// relay/tiers.ts — forward payload → escalation tier.
// P0 is the SOS button only (§5). A bare `alarm` event with no usable alarm name is not evidence,
// so it is ignored rather than promoted; the M1 UI mapping was display-only.
import type { ForwardPayload, RelayTier } from './types.ts';

function usableAlarm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const alarm = value.trim();
  if (alarm === '' || alarm.toLowerCase() === 'none') return null;
  return alarm;
}

export function alarmName(payload: ForwardPayload): string | null {
  return usableAlarm(payload.position?.attributes?.alarm ?? payload.event?.attributes?.alarm);
}

export function forwardTier(payload: ForwardPayload): RelayTier | null {
  const type = payload.event?.type;
  if (typeof type !== 'string' || type === '') return null;
  if (type === 'alarm') {
    const alarm = alarmName(payload);
    if (alarm === null) return null;
    return alarm.toLowerCase() === 'sos' ? 'P0' : 'P1';
  }
  if (type === 'geofenceExit') return 'P1';
  if (type === 'deviceOffline') return 'P2';
  return null;
}
```

`relay/audit.ts`:

```ts
// relay/audit.ts — append-only audit log with a recursive sanitizer.
// The log is evidence for AC-4/AC-5, so it must never contain a credential, an email, or a token;
// `sanitize` drops secret-shaped keys by name and is the ONLY path an audit detail takes.
export type AuditAction =
  | 'ingest' | 'ignored' | 'sent' | 'delivered' | 'opened' | 'ack'
  | 'window_expired' | 'escalation' | 'degraded'
  | 'source_poll_failed' | 'source_recovered' | 'internal_error';

export type AuditEntry = { seq: number; at: string; action: AuditAction; data: Record<string, unknown> };

// Keys are matched as whole words after splitting camelCase. A substring rule silently dropped
// `assigneeUserId` and `deviceSerialLast4` (both contain "sign"/"serial"), which would have erased
// the assignee from the AC-4 audit trail. The one safe serial form, a trailing `Last4`, is kept.
const SECRET_WORDS = new Set([
  'password', 'passwd', 'pass', 'secret', 'token', 'cookie',
  'authorization', 'signature', 'sign', 'email', 'serial',
]);

function isSecretKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
  if (words[words.length - 1] === 'last4') return false;
  return words.some((word) => SECRET_WORDS.has(word));
}
const MAX_STRING = 200;
const MAX_DEPTH = 6;
const MAX_ARRAY = 50;

export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return '[depth]';
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return null;
    return value;
  }
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1, seen));
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSecretKey(key)) continue;
      out[key] = sanitize(item, depth + 1, seen);
    }
    return out;
  } finally {
    // Ancestors only: a shared acyclic object must be copied twice, not mislabeled `[circular]`.
    seen.delete(value);
  }
}

export function createAuditLog({
  now = () => Date.now(),
  write,
}: { now?: () => number; write?: (entry: AuditEntry) => void } = {}) {
  let seq = 0;
  const entries: AuditEntry[] = [];
  return {
    record(action: AuditAction, data: Record<string, unknown> = {}): AuditEntry {
      seq += 1;
      const entry: AuditEntry = {
        seq,
        at: new Date(now()).toISOString(),
        action,
        data: sanitize(data) as Record<string, unknown>,
      };
      entries.push(entry);
      write?.(entry);
      return entry;
    },
    entries: (): AuditEntry[] => entries.slice(),
    toNdjson: (): string => entries.map((entry) => JSON.stringify(entry)).join('\n'),
  };
}

export type AuditLog = ReturnType<typeof createAuditLog>;
```

- [ ] **Step 4: Add scripts, the M2 workflow, and the always-run floor guard**

In `package.json` add to `scripts` (keep existing entries untouched):

```json
    "relay": "node --import tsx relay/main.ts",
    "test:relay": "node --import tsx --test \"tests/relay/*.test.ts\"",
```

Create `.github/workflows/m2-ci.yml`:

```yaml
name: m2
on:
  push:
    branches: ['m2/**']
jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install dependencies
        run: npm ci --no-audit --no-fund || npm install --no-audit --no-fund
      - name: Type-check
        run: npm run lint
      - name: Build the web bundle
        run: npm run build
      # `tests 0` exits 0, so a numeric floor is the only guard. The relay floor is read by
      # tests/core.test.ts from THIS file (marker below) and raised in the same commit that adds tests.
      # Node 22 prints `# tests`, Node 24 prints `ℹ tests`; accept both.
      - name: Run relay tests with a measured count floor
        env:
          EXPECTED_MIN_TESTS: '10'
        run: |
          set -o pipefail
          npm run test:relay --silent | tee /tmp/relay.log
          n=$(grep -E '^(#|ℹ) tests ' /tmp/relay.log | awk '{print $3}')
          echo "detected tests=$n (floor $EXPECTED_MIN_TESTS)"
          awk -v n="$n" -v f="$EXPECTED_MIN_TESTS" 'BEGIN { exit (n+0 >= f+0) ? 0 : 1 }'
      - name: Run app tests with a measured count floor
        env:
          EXPECTED_MIN_TESTS: '229'
        run: |
          set -o pipefail
          npm run test:app --silent | tee /tmp/app.log
          n=$(grep -E '^(#|ℹ) tests ' /tmp/app.log | awk '{print $3}')
          echo "detected tests=$n (floor $EXPECTED_MIN_TESTS)"
          awk -v n="$n" -v f="$EXPECTED_MIN_TESTS" 'BEGIN { exit (n+0 >= f+0) ? 0 : 1 }'
      - name: Lab suite must not regress
        env:
          EXPECTED_MIN_TESTS: '97'
        run: |
          set -o pipefail
          npm run test:lab --silent | tee /tmp/lab.log
          n=$(grep -E '^(#|ℹ) tests ' /tmp/lab.log | awk '{print $3}')
          awk -v n="$n" -v f="$EXPECTED_MIN_TESTS" 'BEGIN { exit (n+0 >= f+0) ? 0 : 1 }'
      - name: Lab configuration renders and validates
        run: npm run lab:check
```

In `tests/core.test.ts`, insert the relay guard immediately before the final `console.log('core unit tests passed');`:

```ts
// M2 relay floor, same lesson as the app floor above: `tests 0` would exit 0, so the count is the
// guard. The number lives only in m2-ci.yml and is read from its marker, never copied here.
const m2Workflow = readFileSync(new URL('../.github/workflows/m2-ci.yml', import.meta.url), 'utf8');
const relayFloorMatch = m2Workflow.match(/Run relay tests with a measured count floor[\s\S]*?EXPECTED_MIN_TESTS: '(\d+)'/);
assert(relayFloorMatch !== null, 'm2-ci.yml lost the relay count floor step');
const relayFloor = Number(relayFloorMatch![1]);
const relayRun = spawnSync('npm', ['run', 'test:relay', '--silent'], { encoding: 'utf8', shell: true });
const relayCounted = /ℹ tests (\d+)/.exec(relayRun.stdout) ?? /# tests (\d+)/.exec(relayRun.stdout);
const relayFailed = /ℹ fail (\d+)/.exec(relayRun.stdout) ?? /# fail (\d+)/.exec(relayRun.stdout);
assert(relayCounted !== null && relayFailed !== null, `relay runner printed no summary: ${relayRun.stdout.slice(-400)}`);
console.log(`relay floor check: tests ${relayCounted[1]} >= ${relayFloor}, fail ${relayFailed[1]}`);
assert(Number(relayCounted[1]) >= relayFloor, `relay tests de-collected or shrank: ${relayCounted[1]} < ${relayFloor}`);
assert(Number(relayFailed[1]) === 0, `relay runner reports ${relayFailed[1]} failures`);
```

- [ ] **Step 5: Run the tests to verify they pass and measure the floor**

Run: `npm run test:relay --silent`
Expected: `ℹ tests 10`, `ℹ fail 0`.

Run: `npm run lint`
Expected: exit 0.

If the printed count differs, set `EXPECTED_MIN_TESTS` in `m2-ci.yml` to that exact printed number before committing — the floor is measured, never guessed.

- [ ] **Step 6: Commit**

```bash
git add relay/types.ts relay/errors.ts relay/tiers.ts relay/audit.ts tests/relay tests/core.test.ts package.json .github/workflows/m2-ci.yml
git commit -m "feat(relay): add tier mapping, audit log, and the always-run M2 floor"
```

---

### Task 2: Incident store — parallel send, ack-window ladder, ack, silence degradation

**Files:**
- Create: `relay/incidents.ts`
- Test: `tests/relay/incidents.test.ts`

**Interfaces:**
- Consumes: `ForwardPayload`, `Incident`, `Delivery`, `RelayRecipient`, `RelayTier` (Task 1); `forwardTier`, `alarmName` (Task 1); `AuditLog` (Task 1); `RelayError` (Task 1).
- Produces:
  - `createIncidentStore({ audit, recipients, now?, windowMs? }) → IncidentStore`
  - `IncidentStore.ingest(payload): Incident | null`
  - `.delivered(id, userId): Incident`
  - `.opened(id, userId): Incident`
  - `.ack(id, userId): { incident: Incident; changed: boolean }`
  - `.degradeOpen(reason: string): number`
  - `.tick(nowMs?: number): void`
  - `.get(id): Incident`, `.list(): Incident[]`

- [ ] **Step 1: Write the failing tests**

`tests/relay/incidents.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog } from '../../relay/audit.ts';
import { RelayError } from '../../relay/errors.ts';
import { createIncidentStore } from '../../relay/incidents.ts';
import { fakeClock, forwardPayload } from './helpers.ts';

const T0 = 1_700_000_000_000;
const WINDOW = 60_000;

function setup(recipients = [{ userId: 1 }, { userId: 2 }], windowMs = WINDOW) {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const store = createIncidentStore({ audit, recipients, now: clock.now, windowMs });
  return { clock, audit, store };
}

function actions(audit: ReturnType<typeof createAuditLog>) {
  return audit.entries().map((entry) => entry.action);
}

test('incidents: ingest sends every recipient in parallel and starts the first window at sent', () => {
  const { store, audit } = setup();
  const incident = store.ingest(forwardPayload());
  assert.ok(incident);
  assert.equal(incident!.tier, 'P1');
  assert.equal(incident!.deliveries.length, 2);
  assert.deepEqual(incident!.deliveries.map((delivery) => delivery.state), ['sent', 'sent']);
  assert.equal(incident!.currentRecipientUserId, 1);
  assert.equal(incident!.deadlineAt, new Date(T0 + WINDOW).toISOString());
  assert.equal(actions(audit).filter((action) => action === 'sent').length, 2);
});

test('incidents: a delivery while current extends the deadline from the delivery instant', () => {
  const { store, clock } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(30_000);
  const delivered = store.delivered(incident.id, 1);
  assert.equal(delivered.deadlineAt, new Date(T0 + 30_000 + WINDOW).toISOString());
  assert.equal(delivered.deliveries[0].state, 'delivered');
});

test('incidents: a tick before the deadline changes nothing', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW - 1);
  store.tick();
  assert.equal(audit.entries().filter((entry) => entry.action === 'window_expired').length, 0);
  assert.equal(store.get(incident.id).deadlineAt, new Date(T0 + WINDOW).toISOString());
});

test('incidents: expiry escalates to the next recipient with a fresh window and a sequence log', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW);
  store.tick();
  const after = store.get(incident.id);
  assert.equal(after.currentRecipientUserId, 2);
  assert.equal(after.deadlineAt, new Date(T0 + WINDOW + WINDOW).toISOString());
  assert.equal(actions(audit).filter((action) => action === 'window_expired').length, 1);
  assert.equal(actions(audit).filter((action) => action === 'escalation').length, 1);
  const expired = audit.entries().find((entry) => entry.action === 'window_expired')!;
  assert.equal(expired.data.atEnd, false);
  assert.equal(expired.data.userId, 1);
});

test('incidents: expiry at the last recipient is audited once and never repeats', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW);
  store.tick();
  clock.advance(WINDOW);
  store.tick();
  clock.advance(10 * WINDOW);
  store.tick();
  const atEnd = audit.entries().filter((entry) => entry.action === 'window_expired' && entry.data.atEnd === true);
  assert.equal(atEnd.length, 1);
  const after = store.get(incident.id);
  assert.equal(after.state, 'active');
  assert.equal(after.atEnd, true);
  assert.equal(after.deadlineAt, null);
});

test('incidents: any recipient may ack; the ack assigns, stops the ladder, closes nothing', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  const result = store.ack(incident.id, 2);
  assert.equal(result.changed, true);
  assert.equal(result.incident.assigneeUserId, 2);
  assert.equal(result.incident.state, 'assigned');
  assert.equal(result.incident.tier, 'P1');
  assert.equal(result.incident.deadlineAt, null);
  const ackEntry = audit.entries().find((entry) => entry.action === 'ack')!;
  assert.equal(ackEntry.data.assigneeUserId, 2);
  assert.equal(ackEntry.data.afterDegraded, false);
  clock.advance(10 * WINDOW);
  store.tick();
  assert.equal(actions(audit).filter((action) => action === 'window_expired').length, 0);
  assert.equal(actions(audit).filter((action) => action === 'escalation').length, 0);
});

test('incidents: a second ack by a different user is a conflict and changes nothing', () => {
  const { store } = setup();
  const incident = store.ingest(forwardPayload())!;
  store.ack(incident.id, 1);
  assert.throws(() => store.ack(incident.id, 2), (error: unknown) => {
    assert.ok(error instanceof RelayError);
    assert.equal((error as RelayError).kind, 'conflict');
    return true;
  });
  assert.equal(store.get(incident.id).assigneeUserId, 1);
});

test('incidents: a repeat ack by the same user is idempotent and audits once', () => {
  const { store, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  store.ack(incident.id, 2);
  const repeat = store.ack(incident.id, 2);
  assert.equal(repeat.changed, false);
  assert.equal(audit.entries().filter((entry) => entry.action === 'ack').length, 1);
});

test('incidents: a late delivery pushes the current deadline later, never earlier', () => {
  const { store, clock } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW);
  store.tick();
  assert.equal(store.get(incident.id).currentRecipientUserId, 2);
  clock.advance(40_000);
  const after = store.delivered(incident.id, 2);
  // delivered at T0+100s ⇒ max(old deadline T0+120s, T0+160s)
  assert.equal(after.deadlineAt, new Date(T0 + 100_000 + WINDOW).toISOString());
});

test('incidents: silence degradation clears the assignee, jumps to the last contact, and is final', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  store.ack(incident.id, 1);
  const count = store.degradeOpen('silence');
  assert.equal(count, 1);
  const after = store.get(incident.id);
  assert.equal(after.degraded, true);
  assert.equal(after.state, 'degraded');
  assert.equal(after.assigneeUserId, null);
  assert.equal(after.currentRecipientUserId, 2);
  assert.equal(after.deadlineAt, null);
  assert.equal(after.atEnd, true);
  assert.equal(actions(audit).filter((action) => action === 'degraded').length, 1);
  const escalation = audit.entries().find((entry) => entry.action === 'escalation')!;
  assert.equal(escalation.data.reason, 'silence');
  clock.advance(10 * WINDOW);
  store.tick();
  assert.equal(actions(audit).filter((action) => action === 'degraded').length, 1);
});

test('incidents: no recipients means the event is ignored, never an incident nobody sees', () => {
  const { store, audit } = setup([]);
  assert.equal(store.ingest(forwardPayload()), null);
  assert.equal(store.list().length, 0);
  const ignored = audit.entries().find((entry) => entry.action === 'ignored')!;
  assert.equal(ignored.data.reason, 'no_recipients');
});

test('incidents: list returns copies, so a caller cannot mutate the store', () => {
  const { store } = setup();
  store.ingest(forwardPayload());
  const first = store.list()[0];
  first.recipients.push({ userId: 99 });
  first.deliveries[0].state = 'opened';
  const second = store.list()[0];
  assert.equal(second.recipients.length, 2);
  assert.equal(second.deliveries[0].state, 'sent');
});

test('incidents: a non-positive or non-finite window is refused at construction', () => {
  const audit = createAuditLog();
  assert.throws(() => createIncidentStore({ audit, recipients: [], windowMs: 0 }));
  assert.throws(() => createIncidentStore({ audit, recipients: [], windowMs: Number.NaN }));
  assert.throws(() => createIncidentStore({ audit, recipients: [], windowMs: -1 }));
});

test('incidents: the tier comes from the measured mapping, and sos is the only P0', () => {
  const { store } = setup();
  const sos = store.ingest(forwardPayload({ type: 'alarm', alarm: 'sos', eventId: 1 }))!;
  const alarm = store.ingest(forwardPayload({ type: 'alarm', alarm: 'vibration', eventId: 2 }))!;
  assert.equal(sos.tier, 'P0');
  assert.equal(alarm.tier, 'P1');
});

test('incidents: an ignored tier creates no incident and is audited', () => {
  const { store, audit } = setup();
  assert.equal(store.ingest(forwardPayload({ type: 'geofenceEnter' })), null);
  assert.equal(store.list().length, 0);
  assert.equal(audit.entries().find((entry) => entry.action === 'ignored')!.data.reason, 'tier_none');
});

test('incidents: a repeated event id returns the original incident and never re-sends', () => {
  const { store, audit } = setup();
  const first = store.ingest(forwardPayload())!;
  const second = store.ingest(forwardPayload())!;
  assert.equal(second.id, first.id);
  assert.equal(store.list().length, 1);
  assert.equal(actions(audit).filter((action) => action === 'ingest').length, 1);
  assert.equal(actions(audit).filter((action) => action === 'sent').length, 2);
});

test('incidents: an escalation past a notification that landed earlier is audited as sent, with its real anchor', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(10_000);
  store.delivered(incident.id, 2);
  clock.advance(50_000);
  store.tick();
  const escalation = audit.entries().find((entry) => entry.action === 'escalation')!;
  const after = store.get(incident.id);
  assert.equal(after.deadlineAt, new Date(T0 + WINDOW + WINDOW).toISOString());
  assert.equal(escalation.data.basis, 'sent');
  assert.equal(escalation.data.anchorAt, new Date(T0 + WINDOW).toISOString());
  assert.equal(escalation.data.deadlineAt, after.deadlineAt);
});

test('incidents: an escalation at the delivery instant is audited as delivered', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(WINDOW);
  store.delivered(incident.id, 2);
  store.tick();
  const escalation = audit.entries().find((entry) => entry.action === 'escalation')!;
  assert.equal(escalation.data.basis, 'delivered');
  assert.equal(escalation.data.anchorAt, new Date(T0 + WINDOW).toISOString());
  assert.equal(store.get(incident.id).deadlineAt, new Date(T0 + WINDOW + WINDOW).toISOString());
});

test('incidents: a late receipt after the ladder ended cannot reopen a window', () => {
  const deliveredRun = setup();
  const deliveredIncident = deliveredRun.store.ingest(forwardPayload())!;
  deliveredRun.clock.advance(WINDOW);
  deliveredRun.store.tick();
  deliveredRun.clock.advance(WINDOW);
  deliveredRun.store.tick();
  deliveredRun.clock.advance(5_000);
  const lateDelivery = deliveredRun.store.delivered(deliveredIncident.id, 2);
  assert.equal(lateDelivery.deadlineAt, null);
  assert.equal(lateDelivery.deliveries[1].state, 'delivered');
  assert.ok(deliveredRun.audit.entries().some((entry) => entry.action === 'delivered' && entry.data.userId === 2));

  const openedRun = setup();
  const openedIncident = openedRun.store.ingest(forwardPayload())!;
  openedRun.clock.advance(WINDOW);
  openedRun.store.tick();
  openedRun.clock.advance(WINDOW);
  openedRun.store.tick();
  openedRun.clock.advance(5_000);
  const lateOpen = openedRun.store.opened(openedIncident.id, 2);
  assert.equal(lateOpen.deadlineAt, null);
  assert.equal(lateOpen.deliveries[1].state, 'opened');
  assert.ok(openedRun.audit.entries().some((entry) => entry.action === 'opened' && entry.data.userId === 2));

  for (const run of [deliveredRun, openedRun]) {
    run.clock.advance(10 * WINDOW);
    run.store.tick();
    const atEnd = run.audit.entries().filter((entry) => entry.action === 'window_expired' && entry.data.atEnd === true);
    assert.equal(atEnd.length, 1);
  }
});

test('incidents: an opened receipt without a prior delivery counts as an inferred delivery', () => {
  const { store, clock, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  clock.advance(20_000);
  const after = store.opened(incident.id, 1);
  assert.equal(after.deliveries[0].state, 'opened');
  assert.equal(after.deliveries[0].deliveredAt, new Date(T0 + 20_000).toISOString());
  assert.equal(after.deadlineAt, new Date(T0 + 20_000 + WINDOW).toISOString());
  const inferred = audit.entries().find((entry) => entry.action === 'delivered' && entry.data.inferred === true);
  assert.ok(inferred);
});

test('incidents: acking a degraded incident records the assignee and keeps the degraded state', () => {
  const { store, audit } = setup();
  const incident = store.ingest(forwardPayload())!;
  store.degradeOpen('silence');
  const result = store.ack(incident.id, 2);
  assert.equal(result.changed, true);
  assert.equal(result.incident.assigneeUserId, 2);
  assert.equal(result.incident.state, 'degraded');
  assert.equal(result.incident.degraded, true);
  assert.equal(result.incident.deadlineAt, null);
  const ack = audit.entries().find((entry) => entry.action === 'ack')!;
  assert.equal(ack.data.assigneeUserId, 2);
  assert.equal(ack.data.afterDegraded, true);
  assert.equal(store.ack(incident.id, 2).changed, false);
});

test('incidents: a non-recipient cannot receipt or ack the incident', () => {
  const { store } = setup();
  const incident = store.ingest(forwardPayload())!;
  for (const attempt of [
    () => store.delivered(incident.id, 99),
    () => store.opened(incident.id, 99),
    () => store.ack(incident.id, 99),
  ]) {
    assert.throws(attempt, (error: unknown) => {
      assert.ok(error instanceof RelayError);
      assert.equal((error as RelayError).kind, 'forbidden');
      return true;
    });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:relay --silent`
Expected: FAIL — `Cannot find module '../../relay/incidents.ts'`.

- [ ] **Step 3: Implement the incident store**

`relay/incidents.ts`:

```ts
// relay/incidents.ts — the escalation state machine.
// One incident per forwarded event: every recipient is sent in parallel, then ONE current recipient
// owns a window that starts at delivery (else send) and climbs the recipient list on expiry. An ack
// assigns ownership and stops the ladder; it closes and de-tiers nothing. Silence degrades every
// open incident and clears its assignee. All time is injected; the server drives `tick`.
import { type AuditLog } from './audit.ts';
import { RelayError } from './errors.ts';
import { alarmName, forwardTier } from './tiers.ts';
import type {
  Delivery, ForwardPayload, Incident, IncidentTimelineEntry, IncidentPosition,
  RelayRecipient, RelayTier,
} from './types.ts';

const DEFAULT_WINDOW_MS = 60_000;
const MAX_NAME = 40;

export type IncidentStoreOptions = {
  audit: AuditLog;
  recipients: RelayRecipient[] | (() => RelayRecipient[]);
  now?: () => number;
  windowMs?: number;
};

function finiteOrNull(value: unknown, min = -Infinity, max = Infinity): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function parseIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function boundedName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name === '') return null;
  return name.length > MAX_NAME ? name.slice(0, MAX_NAME) : name;
}

// A serial of four characters or fewer is the WHOLE serial, so it is not printed at all.
function lastFour(uniqueId: unknown): string | null {
  if (typeof uniqueId !== 'string') return null;
  const compact = uniqueId.replace(/\s+/g, '');
  return compact.length > 4 ? compact.slice(-4) : null;
}

function positionOf(payload: ForwardPayload, at: number): IncidentPosition {
  const source = payload.position ?? {};
  const fixTime = parseIso(source.fixTime);
  return {
    latitude: finiteOrNull(source.latitude, -90, 90),
    longitude: finiteOrNull(source.longitude, -180, 180),
    accuracy: finiteOrNull(source.accuracy, 0, 100_000),
    speedKnots: finiteOrNull(source.speed, 0, 1_000),
    fixTime,
    ageMs: fixTime === null ? null : Math.max(0, at - Date.parse(fixTime)),
  };
}

function normalizeRecipients(list: RelayRecipient[]): RelayRecipient[] {
  const seen = new Set<number>();
  const out: RelayRecipient[] = [];
  for (const recipient of list) {
    if (!Number.isFinite(recipient.userId) || recipient.userId <= 0 || seen.has(recipient.userId)) continue;
    seen.add(recipient.userId);
    const name = boundedName(recipient.name);
    out.push(name === null ? { userId: recipient.userId } : { userId: recipient.userId, name });
  }
  return out.sort((a, b) => a.userId - b.userId);
}

export function createIncidentStore({
  audit, recipients, now = () => Date.now(), windowMs = DEFAULT_WINDOW_MS,
}: IncidentStoreOptions) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('windowMs must be a positive finite number');
  const incidents: Incident[] = [];
  let nextId = 1;

  const currentRecipients = (): RelayRecipient[] => normalizeRecipients(
    typeof recipients === 'function' ? recipients() : recipients,
  );

  const find = (id: string): Incident => {
    const incident = incidents.find((item) => item.id === id);
    if (!incident) throw new RelayError('notfound', 404, 'no incident with that id');
    return incident;
  };

  const timeline = (incident: Incident, action: string, detail: Record<string, unknown> = {}) => {
    const entry: IncidentTimelineEntry = { at: new Date(now()).toISOString(), action, detail };
    incident.timeline.push(entry);
  };

  const deliveryOf = (incident: Incident, userId: number): Delivery => {
    const delivery = incident.deliveries.find((item) => item.userId === userId);
    if (!delivery) throw new RelayError('forbidden', 403, 'this guardian is not a recipient of the incident');
    return delivery;
  };

  const baseMs = (delivery: Delivery): number =>
    delivery.deliveredAt !== null ? Date.parse(delivery.deliveredAt) : Date.parse(delivery.sentAt);

  const advance = (incident: Incident, at: number): void => {
    if (incident.degraded || incident.state !== 'active' || incident.deadlineAt === null) return;
    let guard = 0;
    while (!incident.degraded && incident.state === 'active'
      && incident.deadlineAt !== null && at >= Date.parse(incident.deadlineAt) && guard < 100) {
      guard += 1;
      const from = incident.currentRecipientUserId;
      const index = incident.recipients.findIndex((recipient) => recipient.userId === from);
      const expiredDeadline = incident.deadlineAt;
      if (index < 0 || index >= incident.recipients.length - 1) {
        incident.atEnd = true;
        incident.deadlineAt = null;
        audit.record('window_expired', { incidentId: incident.id, userId: from, atEnd: true, deadlineAt: expiredDeadline });
        timeline(incident, 'window_expired', { userId: from, atEnd: true });
        return;
      }
      audit.record('window_expired', { incidentId: incident.id, userId: from, atEnd: false, deadlineAt: expiredDeadline });
      timeline(incident, 'window_expired', { userId: from, atEnd: false });
      const next = incident.recipients[index + 1];
      const nextDelivery = incident.deliveries[index + 1];
      const deliveryMs = nextDelivery.deliveredAt === null ? null : Date.parse(nextDelivery.deliveredAt);
      const start = Math.max(at, baseMs(nextDelivery));
      incident.currentRecipientUserId = next.userId;
      incident.deadlineAt = new Date(start + incident.windowMs).toISOString();
      audit.record('escalation', {
        incidentId: incident.id, from, to: next.userId,
        basis: deliveryMs !== null && deliveryMs >= at ? 'delivered' : 'sent',
        anchorAt: new Date(start).toISOString(),
        deadlineAt: incident.deadlineAt,
      });
      timeline(incident, 'escalation', { from, to: next.userId });
    }
  };

  return {
    ingest(payload: ForwardPayload): Incident | null {
      const event = payload.event;
      if (!event || !Number.isFinite(event.id) || typeof event.type !== 'string') {
        audit.record('ignored', { reason: 'no_event' });
        return null;
      }
      // The source retries; the same event id must never become a second incident or a second send.
      const existing = incidents.find((item) => item.eventId === event.id);
      if (existing) return structuredClone(existing);
      const tier = forwardTier(payload);
      if (tier === null) {
        audit.record('ignored', { reason: 'tier_none', eventId: event.id, eventType: event.type });
        return null;
      }
      const list = currentRecipients();
      if (list.length === 0) {
        audit.record('ignored', { reason: 'no_recipients', eventId: event.id });
        return null;
      }
      const at = now();
      const createdAt = new Date(at).toISOString();
      const id = `inc-${String(nextId).padStart(4, '0')}`;
      nextId += 1;
      const eventTime = parseIso(event.eventTime) ?? createdAt;
      const incident: Incident = {
        id,
        eventId: event.id,
        eventType: event.type,
        alarm: alarmName(payload),
        tier: tier as RelayTier,
        state: 'active',
        deviceId: Number.isFinite(event.deviceId) ? event.deviceId : 0,
        deviceName: boundedName(payload.device?.name),
        deviceSerialLast4: lastFour(payload.device?.uniqueId),
        geofenceName: boundedName(payload.geofence?.name),
        eventTime,
        createdAt,
        position: positionOf(payload, at),
        recipients: list,
        deliveries: list.map((recipient) => ({
          userId: recipient.userId, state: 'sent', sentAt: createdAt, deliveredAt: null, openedAt: null,
        })),
        currentRecipientUserId: list[0].userId,
        assigneeUserId: null,
        degraded: false,
        windowMs,
        deadlineAt: new Date(at + windowMs).toISOString(),
        atEnd: false,
        timeline: [],
      };
      timeline(incident, 'ingest', { eventId: event.id });
      incidents.push(incident);
      audit.record('ingest', { incidentId: id, eventId: event.id, eventType: event.type, tier });
      for (const recipient of list) audit.record('sent', { incidentId: id, userId: recipient.userId });
      return structuredClone(incident);
    },

    delivered(id: string, userId: number): Incident {
      const incident = find(id);
      const delivery = deliveryOf(incident, userId);
      if (delivery.state !== 'sent') return structuredClone(incident);
      const at = now();
      const iso = new Date(at).toISOString();
      delivery.deliveredAt = iso;
      delivery.state = 'delivered';
      audit.record('delivered', { incidentId: id, userId, inferred: false });
      timeline(incident, 'delivered', { userId });
      if (!incident.atEnd && !incident.degraded && incident.state === 'active' && incident.currentRecipientUserId === userId) {
        const next = at + incident.windowMs;
        if (incident.deadlineAt === null || next > Date.parse(incident.deadlineAt)) {
          incident.deadlineAt = new Date(next).toISOString();
        }
      }
      return structuredClone(incident);
    },

    opened(id: string, userId: number): Incident {
      const incident = find(id);
      const delivery = deliveryOf(incident, userId);
      if (delivery.state === 'opened') return structuredClone(incident);
      const at = now();
      const iso = new Date(at).toISOString();
      if (delivery.deliveredAt === null) {
        delivery.deliveredAt = iso;
        audit.record('delivered', { incidentId: id, userId, inferred: true });
        timeline(incident, 'delivered', { userId, inferred: true });
        if (!incident.atEnd && !incident.degraded && incident.state === 'active' && incident.currentRecipientUserId === userId) {
          const next = at + incident.windowMs;
          if (incident.deadlineAt === null || next > Date.parse(incident.deadlineAt)) {
            incident.deadlineAt = new Date(next).toISOString();
          }
        }
      }
      delivery.openedAt = iso;
      delivery.state = 'opened';
      audit.record('opened', { incidentId: id, userId });
      timeline(incident, 'opened', { userId });
      return structuredClone(incident);
    },

    ack(id: string, userId: number): { incident: Incident; changed: boolean } {
      const incident = find(id);
      deliveryOf(incident, userId);
      if (incident.assigneeUserId !== null && incident.assigneeUserId !== userId) {
        throw new RelayError('conflict', 409, 'another guardian already acknowledged this incident');
      }
      if (incident.assigneeUserId === userId) return { incident: structuredClone(incident), changed: false };
      incident.assigneeUserId = userId;
      if (!incident.degraded) {
        incident.state = 'assigned';
        incident.deadlineAt = null;
      }
      audit.record('ack', { incidentId: id, userId, assigneeUserId: userId, afterDegraded: incident.degraded });
      timeline(incident, 'ack', { userId });
      return { incident: structuredClone(incident), changed: true };
    },

    degradeOpen(reason: string): number {
      let count = 0;
      for (const incident of incidents) {
        if (incident.degraded) continue;
        const previousAssignee = incident.assigneeUserId;
        incident.degraded = true;
        incident.state = 'degraded';
        incident.assigneeUserId = null;
        incident.deadlineAt = null;
        incident.atEnd = true;
        if (incident.recipients.length > 0) {
          incident.currentRecipientUserId = incident.recipients[incident.recipients.length - 1].userId;
        }
        audit.record('degraded', { incidentId: incident.id, reason, previousAssignee });
        audit.record('escalation', {
          incidentId: incident.id, to: incident.currentRecipientUserId, reason: 'silence',
        });
        timeline(incident, 'degraded', { reason });
        count += 1;
      }
      return count;
    },

    tick(at: number = now()): void {
      for (const incident of incidents) advance(incident, at);
    },

    get(id: string): Incident {
      return structuredClone(find(id));
    },

    list(): Incident[] {
      return structuredClone(incidents.slice().reverse());
    },
  };
}

export type IncidentStore = ReturnType<typeof createIncidentStore>;
```

- [ ] **Step 4: Run the tests to verify they pass and raise the floor**

Run: `npm run test:relay --silent`
Expected: `ℹ tests 32`, `ℹ fail 0`.

Set `EXPECTED_MIN_TESTS` in `.github/workflows/m2-ci.yml` to the printed count (32 if unchanged).

- [ ] **Step 5: Commit**

```bash
git add relay/incidents.ts tests/relay/incidents.test.ts .github/workflows/m2-ci.yml
git commit -m "feat(relay): add the ack-window ladder and silence degradation"
```

---

### Task 3: Deterministic Arabic incident sheet

**Files:**
- Create: `relay/sheet.ts`
- Modify: `relay/incidents.ts` (add `sheet(id, atMs)` delegating to `renderIncidentSheet`)
- Test: `tests/relay/sheet.test.ts`

**Interfaces:**
- Consumes: `Incident` (Task 1), `IncidentStore` (Task 2).
- Produces: `renderIncidentSheet(incident, nowMs): string`, `MAX_SHEET_CHARS`, `IncidentStore.sheet(id, nowMs?)`.

- [ ] **Step 1: Write the failing tests**

`tests/relay/sheet.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog } from '../../relay/audit.ts';
import { createIncidentStore } from '../../relay/incidents.ts';
import { MAX_SHEET_CHARS, renderIncidentSheet } from '../../relay/sheet.ts';
import { fakeClock, forwardPayload } from './helpers.ts';

const T0 = 1_700_000_000_000;

function sheetFor(options: { alarm?: string; type?: string; serial?: string } = {}) {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const store = createIncidentStore({ audit, recipients: [{ userId: 1 }, { userId: 2 }], now: clock.now });
  const incident = store.ingest(forwardPayload({
    alarm: options.alarm ?? 'sos', type: options.type ?? 'alarm', serial: options.serial ?? '1234567890HMS8',
  }))!;
  return { clock, store, incident };
}

test('sheet: a P0 sheet names the incident, tier, coordinates, age, and the lab footer', () => {
  const { store, incident } = sheetFor();
  const text = renderIncidentSheet(store.get(incident.id), T0 + 12_000);
  assert.match(text, /inc-0001/);
  assert.match(text, /P0/);
  assert.match(text, /36\.75380/);
  assert.match(text, /3\.05880/);
  assert.match(text, /12/);
  assert.match(text, /بيانات مختبر/);
});

test('sheet: only the last four serial characters appear', () => {
  const { store, incident } = sheetFor({ serial: '1234567890HMS8' });
  const text = renderIncidentSheet(store.get(incident.id), T0);
  assert.match(text, /HMS8/);
  assert.doesNotMatch(text, /1234567890HMS8/);
});

test('sheet: a short serial is never printed, and no email can appear', () => {
  const { store, incident } = sheetFor({ serial: 'ABC1' });
  const text = renderIncidentSheet(store.get(incident.id), T0);
  assert.doesNotMatch(text, /ABC1/);
  assert.doesNotMatch(text, /@/);
});

test('sheet: an unknown accuracy is omitted; a valid speed is converted to km/h', () => {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const store = createIncidentStore({ audit, recipients: [{ userId: 1 }], now: clock.now });
  const payload = forwardPayload();
  payload.position!.accuracy = null;
  payload.position!.speed = 10; // knots
  const incident = store.ingest(payload)!;
  const text = renderIncidentSheet(store.get(incident.id), T0);
  assert.doesNotMatch(text, /±/);
  assert.match(text, /18\.5/);
});

test('sheet: assignment and the degraded state are visible', () => {
  const { store, incident } = sheetFor({ type: 'geofenceExit', alarm: null });
  store.ack(incident.id, 2);
  const assigned = renderIncidentSheet(store.get(incident.id), T0);
  assert.match(assigned, /#2/);
  store.degradeOpen('silence');
  const degraded = renderIncidentSheet(store.get(incident.id), T0);
  assert.match(degraded, /متدهور/);
});

test('sheet: the delivery sequence lists every recipient with its state', () => {
  const { store, incident, clock } = sheetFor({ type: 'geofenceExit', alarm: null });
  clock.advance(5_000);
  store.delivered(incident.id, 1);
  const text = renderIncidentSheet(store.get(incident.id), T0 + 5_000);
  assert.match(text, /#1/);
  assert.match(text, /#2/);
  assert.match(text, /وصل/);
  assert.match(text, /أُرسل/);
});

test('sheet: the AC-17 family word is named as not implemented', () => {
  const { store, incident } = sheetFor();
  assert.match(renderIncidentSheet(store.get(incident.id), T0), /AC-17/);
});

test('sheet: output is deterministic for the same incident and instant', () => {
  const { store, incident } = sheetFor();
  const first = renderIncidentSheet(store.get(incident.id), T0 + 1000);
  const second = renderIncidentSheet(store.get(incident.id), T0 + 1000);
  assert.equal(first, second);
});

test('sheet: output is bounded at 4000 characters and keeps the footer', () => {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const many = Array.from({ length: 60 }, (_, index) => ({ userId: index + 1, name: 'مستلم طويل جداً '.repeat(4) }));
  const store = createIncidentStore({ audit, recipients: many, now: clock.now });
  const incident = store.ingest(forwardPayload())!;
  for (let i = 0; i < 30; i += 1) {
    clock.advance(1000);
    store.delivered(incident.id, (i % 60) + 1);
  }
  const text = renderIncidentSheet(store.get(incident.id), clock.now());
  assert.ok(text.length <= MAX_SHEET_CHARS, `sheet length ${text.length}`);
  assert.match(text, /بيانات مختبر/);
});

test('sheet: truncation is honest — the marker appears exactly when timeline entries are omitted', () => {
  const partialClock = fakeClock(T0);
  const partialAudit = createAuditLog({ now: partialClock.now });
  const partialStore = createIncidentStore({
    audit: partialAudit, recipients: [{ userId: 1 }, { userId: 2 }], now: partialClock.now,
  });
  const partialIncident = partialStore.ingest(forwardPayload({ type: 'alarm', alarm: 'x'.repeat(3_450) }))!;
  partialClock.advance(1_000);
  partialStore.delivered(partialIncident.id, 1);
  partialClock.advance(1_000);
  partialStore.opened(partialIncident.id, 2);
  const partial = renderIncidentSheet(partialStore.get(partialIncident.id), partialClock.now());
  assert.ok(partial.length <= MAX_SHEET_CHARS, `sheet length ${partial.length}`);
  assert.match(partial, /اقتُطع/);
  assert.match(partial, /بيانات مختبر/);
  assert.equal((partial.match(/UTC — /g) ?? []).length, 2);

  const noneClock = fakeClock(T0);
  const noneAudit = createAuditLog({ now: noneClock.now });
  const noneStore = createIncidentStore({
    audit: noneAudit, recipients: [{ userId: 1 }, { userId: 2 }], now: noneClock.now,
  });
  const noneIncident = noneStore.ingest(forwardPayload({ type: 'alarm', alarm: 'x'.repeat(3_500) }))!;
  noneClock.advance(1_000);
  noneStore.delivered(noneIncident.id, 1);
  noneClock.advance(1_000);
  noneStore.opened(noneIncident.id, 2);
  const none = renderIncidentSheet(noneStore.get(noneIncident.id), noneClock.now());
  assert.ok(none.length <= MAX_SHEET_CHARS, `sheet length ${none.length}`);
  assert.match(none, /اقتُطع/);
  assert.match(none, /بيانات مختبر/);
  assert.doesNotMatch(none, /UTC — /);
});

test('sheet: no NaN or undefined reaches the text', () => {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const store = createIncidentStore({ audit, recipients: [{ userId: 1 }], now: clock.now });
  const payload = forwardPayload({ fixTime: 'not-a-date' });
  payload.position!.latitude = Number.NaN;
  payload.position!.longitude = 3.0588;
  payload.position!.speed = Number.NaN;
  const incident = store.ingest(payload)!;
  const text = renderIncidentSheet(store.get(incident.id), T0);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('sheet: the store exposes the same text through sheet()', () => {
  const { store, incident } = sheetFor();
  assert.equal(store.sheet(incident.id, T0), renderIncidentSheet(store.get(incident.id), T0));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:relay --silent`
Expected: FAIL — `Cannot find module '../../relay/sheet.ts'`.

- [ ] **Step 3: Implement the sheet and wire it into the store**

`relay/sheet.ts`:

```ts
// relay/sheet.ts — one deterministic Arabic incident sheet, computed from an Incident snapshot.
// Never an email, never a full serial, never NaN. Bounded at 4000 characters with the lab footer
// and the AC-17 honesty line always kept. Times are printed as UTC so the text does not depend on
// the machine's timezone.
import type { Incident } from './types.ts';

export const MAX_SHEET_CHARS = 4000;
const LAB_FOOTER = 'بيانات مختبر — ليست حادثة حقيقية';
const AC17 = 'كلمة التحقق العائلية: غير منفّذة في M2 (AC-17)';
const MAX_DELIVERY_LINES = 20;

const TIER_LABEL: Record<Incident['tier'], string> = {
  P0: 'P0 — استغاثة (SOS)',
  P1: 'P1 — أولوية عالية',
  P2: 'P2 — معلومة',
};

const STATE_LABEL: Record<Incident['state'], (incident: Incident) => string> = {
  active: () => 'نشط',
  assigned: (incident) => `مُسنَد إلى مستلم #${incident.assigneeUserId ?? '—'}`,
  degraded: () => 'متدهور',
};

const DELIVERY_LABEL = { sent: 'أُرسل', delivered: 'وصل', opened: 'فُتح' } as const;

const ACTION_LABEL: Record<string, string> = {
  ingest: 'أُنشئ الحادث',
  sent: 'أُرسل إلى جهة اتصال',
  delivered: 'وصل الإشعار',
  opened: 'فُتح في التطبيق',
  ack: 'أكّد المستلم',
  window_expired: 'انتهت مهلة التأكيد',
  escalation: 'تصعيد',
  degraded: 'أُعلن تدهور المصدر',
};

function clockOf(iso: string | null): string {
  if (iso === null) return '—';
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `${new Date(ms).toISOString().slice(11, 19)} UTC` : '—';
}

function ageLine(incident: Incident, nowMs: number): string {
  if (incident.position.fixTime === null) return 'عمر الموقع: غير معروف';
  const ms = Date.parse(incident.position.fixTime);
  if (!Number.isFinite(ms)) return 'عمر الموقع: غير معروف';
  return `عمر الموقع: ${Math.max(0, Math.round((nowMs - ms) / 1000))} ثانية`;
}

function coordinateLine(incident: Incident): string {
  const { latitude, longitude } = incident.position;
  if (latitude === null || longitude === null) return 'الموقع: غير معروف';
  return `الموقع: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function accuracyLine(incident: Incident): string | null {
  const accuracy = incident.position.accuracy;
  return accuracy === null ? null : `الدقة: ±${Math.round(accuracy)} م`;
}

function speedLine(incident: Incident): string | null {
  const knots = incident.position.speedKnots;
  if (knots === null) return null;
  return `السرعة: ${(knots * 1.852).toFixed(1)} كم/س`;
}

function deliveryLine(incident: Incident, index: number): string {
  const recipient = incident.recipients[index];
  const delivery = incident.deliveries[index];
  const name = recipient.name ? ` ${recipient.name}` : '';
  const parts = [`${index + 1}. #${recipient.userId}${name} — ${DELIVERY_LABEL[delivery.state]}`];
  parts.push(`أُرسل ${clockOf(delivery.sentAt)}`);
  if (delivery.deliveredAt !== null) parts.push(`وصل ${clockOf(delivery.deliveredAt)}`);
  if (delivery.openedAt !== null) parts.push(`فُتح ${clockOf(delivery.openedAt)}`);
  return parts.join('، ');
}

function assemble(incident: Incident, nowMs: number, timelineLimit: number, deliveryLimit: number): string {
  const lines: string[] = [
    'KidGuard — ورقة حادث',
    `المعرّف: ${incident.id}`,
    `الأولوية: ${TIER_LABEL[incident.tier]}`,
    `الحالة: ${STATE_LABEL[incident.state](incident)}`,
    `الحدث: ${incident.eventType}${incident.alarm ? ` / ${incident.alarm}` : ''} — ${clockOf(incident.eventTime)}`,
    `الجهاز: ${incident.deviceName ?? 'غير معروف'}${incident.deviceSerialLast4 ? ` (…${incident.deviceSerialLast4})` : ''}`,
    `المنطقة: ${incident.geofenceName ?? 'خارج أي منطقة معروفة'}`,
    coordinateLine(incident),
    ageLine(incident, nowMs),
  ];
  const accuracy = accuracyLine(incident);
  if (accuracy !== null) lines.push(accuracy);
  const speed = speedLine(incident);
  if (speed !== null) lines.push(speed);
  lines.push('', 'التسلسل:');
  const shownTimeline = timelineLimit === 0 ? [] : incident.timeline.slice(-timelineLimit);
  for (const entry of shownTimeline) {
    lines.push(`${clockOf(entry.at)} — ${ACTION_LABEL[entry.action] ?? entry.action}`);
  }
  if (shownTimeline.length < incident.timeline.length) lines.push('… (اقتُطع)');
  lines.push('', 'تسلسل التسليم:');
  const shown = Math.min(deliveryLimit, incident.recipients.length);
  for (let index = 0; index < shown; index += 1) lines.push(deliveryLine(incident, index));
  if (shown < incident.recipients.length) lines.push(`… و${incident.recipients.length - shown} مستلماً آخر`);
  lines.push('', AC17, LAB_FOOTER);
  return lines.join('\n');
}

export function renderIncidentSheet(incident: Incident, nowMs: number): string {
  let timelineLimit = 12;
  let deliveryLimit = Math.min(MAX_DELIVERY_LINES, incident.recipients.length);
  let text = assemble(incident, nowMs, timelineLimit, deliveryLimit);
  while (text.length > MAX_SHEET_CHARS && (timelineLimit > 0 || deliveryLimit > 0)) {
    if (timelineLimit > 0) timelineLimit -= 1;
    else deliveryLimit -= 1;
    text = assemble(incident, nowMs, timelineLimit, deliveryLimit);
  }
  if (text.length <= MAX_SHEET_CHARS) return text;
  // Last resort: keep the two honest closing lines and cut from the middle of the body.
  const tail = `\n… (اقتُطع)\n${AC17}\n${LAB_FOOTER}`;
  return `${text.slice(0, MAX_SHEET_CHARS - tail.length)}${tail}`;
}
```

Add to `relay/incidents.ts` — one import and one method:

```ts
import { renderIncidentSheet } from './sheet.ts';
```

and inside the returned object, after `get`:

```ts
    sheet(id: string, at: number = now()): string {
      return renderIncidentSheet(find(id), at);
    },
```

- [ ] **Step 4: Run the tests to verify they pass and raise the floor**

Run: `npm run test:relay --silent`
Expected: `ℹ tests 44`, `ℹ fail 0`.

Set `EXPECTED_MIN_TESTS` in `m2-ci.yml` to the printed count.

- [ ] **Step 5: Commit**

```bash
git add relay/sheet.ts relay/incidents.ts tests/relay/sheet.test.ts .github/workflows/m2-ci.yml
git commit -m "feat(relay): render a bounded, deterministic incident sheet"
```

---

### Task 4: Guardian auth and the relay HTTP/SSE server

**Files:**
- Create: `relay/auth.ts`
- Create: `relay/server.ts`
- Test: `tests/relay/auth.test.ts`
- Test: `tests/relay/server.test.ts`

**Interfaces:**
- Consumes: `createAuditLog` (Task 1), `createIncidentStore` (Tasks 2–3), `RelayError` (Task 1), `renderIncidentSheet` via `store.sheet`.
- Produces:
  - `createTokenVerifier({ apiUrl, fetchFn?, now?, ttlMs?, timeoutMs? }) → (token: string) => Promise<number | null>`
  - `createRelayServer({ audit, store, forwardToken, verifyToken, maxBodyBytes?, now?, heartbeatMs? }) → { handler, broadcast(), listen(port?, host?), close() }`
  - Routes: `POST /alert`, `GET /incidents`, `GET /incidents/:id`, `GET /incidents/:id/sheet`, `POST /incidents/:id/delivered`, `POST /incidents/:id/opened`, `POST /incidents/:id/ack`, `GET /stream`, `GET /health`.

- [ ] **Step 1: Write the failing tests**

`tests/relay/auth.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTokenVerifier } from '../../relay/auth.ts';
import { fakeClock } from './helpers.ts';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('auth: a valid token resolves to the Traccar user id through GET /session?token=', async () => {
  const calls: string[] = [];
  const verify = createTokenVerifier({
    apiUrl: 'http://127.0.0.1:8082/api',
    fetchFn: async (url) => { calls.push(String(url)); return response(200, { id: 7, email: 'lab@example.com' }); },
  });
  assert.equal(await verify('fixture-bearer'), 7);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/session\?token=fixture-bearer$/);
});

test('auth: a non-200 or an unusable body resolves to null, never to an assumed guardian', async () => {
  const unauthorized = createTokenVerifier({ apiUrl: 'http://x/api', fetchFn: async () => response(401, {}) });
  assert.equal(await unauthorized('fixture-bearer'), null);
  const noId = createTokenVerifier({ apiUrl: 'http://x/api', fetchFn: async () => response(200, { email: 'x' }) });
  assert.equal(await noId('fixture-bearer'), null);
});

test('auth: results are cached by a hash, and the cache expires', async () => {
  const clock = fakeClock();
  let calls = 0;
  const verify = createTokenVerifier({
    apiUrl: 'http://x/api',
    now: clock.now,
    ttlMs: 30_000,
    fetchFn: async () => { calls += 1; return response(200, { id: 7 }); },
  });
  assert.equal(await verify('fixture-bearer'), 7);
  assert.equal(await verify('fixture-bearer'), 7);
  assert.equal(calls, 1);
  clock.advance(30_001);
  assert.equal(await verify('fixture-bearer'), 7);
  assert.equal(calls, 2);
});

test('auth: an empty or absurdly long token is refused before any request', async () => {
  let calls = 0;
  const verify = createTokenVerifier({
    apiUrl: 'http://x/api',
    fetchFn: async () => { calls += 1; return response(200, { id: 7 }); },
  });
  assert.equal(await verify(''), null);
  assert.equal(await verify('x'.repeat(1025)), null);
  assert.equal(calls, 0);
});
```

`tests/relay/server.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog } from '../../relay/audit.ts';
import { createIncidentStore } from '../../relay/incidents.ts';
import { createRelayServer } from '../../relay/server.ts';
import { fakeClock, forwardPayload } from './helpers.ts';

const SIGN = 'fixture-sign';
const BEARER_1 = 'fixture-bearer-1';
const BEARER_2 = 'fixture-bearer-2';
const BEARER_3 = 'fixture-bearer-3';

async function start() {
  const clock = fakeClock();
  const audit = createAuditLog({ now: clock.now });
  let recipients = [{ userId: 1 }, { userId: 2 }];
  const store = createIncidentStore({ audit, recipients: () => recipients, now: clock.now });
  const relay = createRelayServer({
    audit,
    store,
    forwardToken: SIGN,
    now: clock.now,
    verifyToken: async (value) => (value === BEARER_1 ? 1 : value === BEARER_2 ? 2 : value === BEARER_3 ? 3 : null),
  });
  const { url } = await relay.listen();
  return {
    url, relay, audit, store, clock,
    setRecipients: (next: Array<{ userId: number }>) => { recipients = next; },
    close: () => relay.close(),
  };
}

function alert(url: string, body: unknown, signature: string | null = SIGN) {
  return fetch(`${url}/alert`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature === null ? {} : { 'x-lab-sign': signature }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function guardian(url: string, path: string, bearer: string, method = 'GET', body?: unknown) {
  return fetch(`${url}${path}`, {
    method,
    headers: { authorization: `Bearer ${bearer}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('server: a forward without the configured signature is refused before ingest', async () => {
  const s = await start();
  try {
    assert.equal((await alert(s.url, forwardPayload(), null)).status, 401);
    assert.equal((await alert(s.url, forwardPayload(), 'wrong')).status, 401);
    assert.equal(s.store.list().length, 0);
  } finally { await s.close(); }
});

test('server: a signed forward creates one P1 incident and returns its id', async () => {
  const s = await start();
  try {
    const response = await alert(s.url, forwardPayload());
    assert.equal(response.status, 202);
    const body = await response.json() as { incidentId: string };
    assert.match(body.incidentId, /^inc-\d{4}$/);
    assert.equal(s.store.get(body.incidentId).tier, 'P1');
  } finally { await s.close(); }
});

test('server: an ignored tier is accepted with 204 and creates nothing', async () => {
  const s = await start();
  try {
    assert.equal((await alert(s.url, forwardPayload({ type: 'geofenceEnter' }))).status, 204);
    assert.equal(s.store.list().length, 0);
  } finally { await s.close(); }
});

test('server: a body over the cap is refused with 413', async () => {
  const s = await start();
  try {
    const huge = JSON.stringify({ pad: 'x'.repeat(1024 * 1024 + 16) });
    const response = await alert(s.url, huge);
    assert.equal(response.status, 413);
    assert.equal(s.store.list().length, 0);
  } finally { await s.close(); }
});

test('server: invalid JSON is a 400, not an internal error', async () => {
  const s = await start();
  try {
    assert.equal((await alert(s.url, '{not json')).status, 400);
  } finally { await s.close(); }
});

test('server: every guardian route requires a valid bearer', async () => {
  const s = await start();
  try {
    assert.equal((await fetch(`${s.url}/incidents`)).status, 401);
    assert.equal((await guardian(s.url, '/incidents', 'fixture-wrong')).status, 401);
  } finally { await s.close(); }
});

test('server: the incident list is filtered to incidents where the caller is a recipient', async () => {
  const s = await start();
  try {
    const both = await (await alert(s.url, forwardPayload({ eventId: 1 }))).json() as { incidentId: string };
    s.setRecipients([{ userId: 1 }]);
    const onlyOne = await (await alert(s.url, forwardPayload({ eventId: 2 }))).json() as { incidentId: string };
    const forTwo = await (await guardian(s.url, '/incidents', BEARER_2)).json() as { incidents: Array<{ id: string }> };
    assert.deepEqual(forTwo.incidents.map((incident) => incident.id), [both.incidentId]);
    const forOne = await (await guardian(s.url, '/incidents', BEARER_1)).json() as { incidents: Array<{ id: string }> };
    assert.deepEqual(forOne.incidents.map((incident) => incident.id), [onlyOne.incidentId, both.incidentId]);
  } finally { await s.close(); }
});

test('server: a recipient delivery extends the current deadline over HTTP', async () => {
  const s = await start();
  try {
    const { incidentId } = await (await alert(s.url, forwardPayload())).json() as { incidentId: string };
    s.clock.advance(10_000);
    const response = await guardian(s.url, `/incidents/${incidentId}/delivered`, BEARER_1, 'POST', {});
    assert.equal(response.status, 200);
    const body = await response.json() as { incident: { deadlineAt: string; deliveries: Array<{ state: string }> } };
    assert.equal(body.incident.deadlineAt, new Date(s.clock.now() + 60_000).toISOString());
    assert.equal(body.incident.deliveries[0].state, 'delivered');
  } finally { await s.close(); }
});

test('server: a guardian who is not a recipient cannot act on the incident', async () => {
  const s = await start();
  try {
    s.setRecipients([{ userId: 1 }]);
    const { incidentId } = await (await alert(s.url, forwardPayload())).json() as { incidentId: string };
    assert.equal((await guardian(s.url, `/incidents/${incidentId}/delivered`, BEARER_2, 'POST', {})).status, 403);
  } finally { await s.close(); }
});

test('server: opening implies delivery and is audited as inferred', async () => {
  const s = await start();
  try {
    const { incidentId } = await (await alert(s.url, forwardPayload())).json() as { incidentId: string };
    const response = await guardian(s.url, `/incidents/${incidentId}/opened`, BEARER_1, 'POST', {});
    assert.equal(response.status, 200);
    const body = await response.json() as { incident: { deliveries: Array<{ state: string; deliveredAt: string | null }> } };
    assert.equal(body.incident.deliveries[0].state, 'opened');
    assert.notEqual(body.incident.deliveries[0].deliveredAt, null);
    assert.equal(s.audit.entries().find((entry) => entry.action === 'delivered')!.data.inferred, true);
  } finally { await s.close(); }
});

test('server: an ack assigns, and a second guardian ack is a 409 conflict', async () => {
  const s = await start();
  try {
    const { incidentId } = await (await alert(s.url, forwardPayload())).json() as { incidentId: string };
    const first = await guardian(s.url, `/incidents/${incidentId}/ack`, BEARER_2, 'POST', {});
    assert.equal(first.status, 200);
    const body = await first.json() as { incident: { assigneeUserId: number; state: string } };
    assert.equal(body.incident.assigneeUserId, 2);
    assert.equal(body.incident.state, 'assigned');
    const second = await guardian(s.url, `/incidents/${incidentId}/ack`, BEARER_1, 'POST', {});
    assert.equal(second.status, 409);
    const text = await second.text();
    assert.doesNotMatch(text, new RegExp(BEARER_2));
  } finally { await s.close(); }
});

test('server: the sheet route returns bounded plain text with the lab footer', async () => {
  const s = await start();
  try {
    const { incidentId } = await (await alert(s.url, forwardPayload({ type: 'alarm', alarm: 'sos' }))).json() as { incidentId: string };
    const response = await guardian(s.url, `/incidents/${incidentId}/sheet`, BEARER_2);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/plain/);
    const text = await response.text();
    assert.match(text, /بيانات مختبر/);
    assert.ok(text.length <= 4000);
    assert.equal((await guardian(s.url, `/incidents/${incidentId}/sheet`, BEARER_3)).status, 403);
  } finally { await s.close(); }
});

test('server: the SSE stream starts with a snapshot the caller may see', async () => {
  const s = await start();
  const controller = new AbortController();
  try {
    await alert(s.url, forwardPayload());
    const response = await fetch(`${s.url}/stream`, {
      headers: { authorization: `Bearer ${BEARER_1}` },
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = response.body!.getReader();
    const first = await reader.read();
    const chunk = new TextDecoder().decode(first.value);
    assert.match(chunk, /event: snapshot/);
    assert.match(chunk, /inc-\d{4}/);
    controller.abort();
  } finally { await s.close(); }
});

test('server: an unknown route is 404 and no response echoes a credential', async () => {
  const s = await start();
  try {
    const response = await guardian(s.url, '/nope', BEARER_1);
    assert.equal(response.status, 404);
    const text = await response.text();
    assert.doesNotMatch(text, new RegExp(BEARER_1));
    assert.doesNotMatch(text, new RegExp(SIGN));
  } finally { await s.close(); }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:relay --silent`
Expected: FAIL — `Cannot find module '../../relay/auth.ts'`.

- [ ] **Step 3: Implement auth and the server**

`relay/auth.ts`:

```ts
// relay/auth.ts — Traccar-minted bearer token → user id.
// The token travels only in memory: the cache key is its SHA-256 digest, the raw value is used for
// exactly one GET and never stored, printed, or audited. GET /api/session?token= is @PermitAll
// (SessionResource.java:78-105; evidence 007 §6.1), so no Basic credential is needed here.
import { createHash } from 'node:crypto';

const MAX_TOKEN_LENGTH = 1024;
const MAX_CACHE_ENTRIES = 500;

export type VerifyToken = (token: string) => Promise<number | null>;

export function createTokenVerifier({
  apiUrl,
  fetchFn = fetch,
  now = () => Date.now(),
  ttlMs = 30_000,
  timeoutMs = 5_000,
}: {
  apiUrl: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}): VerifyToken {
  const cache = new Map<string, { userId: number; expiresAt: number }>();
  const base = apiUrl.replace(/\/+$/, '');

  return async function verify(token: string): Promise<number | null> {
    if (typeof token !== 'string' || token === '' || token.length > MAX_TOKEN_LENGTH) return null;
    const key = createHash('sha256').update(token).digest('hex');
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.userId;
    let response: Response;
    try {
      response = await fetchFn(`${base}/session?token=${encodeURIComponent(token)}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return null;
    }
    const id = Number((body as { id?: unknown } | null)?.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (typeof oldest === 'string') cache.delete(oldest);
    }
    cache.set(key, { userId: id, expiresAt: now() + ttlMs });
    return id;
  };
}
```

`relay/server.ts`:

```ts
// relay/server.ts — the relay's only inbound surface.
// POST /alert keeps the Traccar forward template unchanged: JSON + X-Lab-Sign compared in constant
// time. Guardian routes take a Traccar bearer and are answered with status-only JSON; no response
// ever repeats the token, the signature, or a request body. SSE is used instead of EventSource on
// the client because EventSource cannot set Authorization.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type AuditLog } from './audit.ts';
import { RelayError } from './errors.ts';
import { renderIncidentSheet } from './sheet.ts';
import type { IncidentStore } from './incidents.ts';
import type { Incident } from './types.ts';

const DEFAULT_MAX_BODY = 1024 * 1024;
const DEFAULT_HEARTBEAT_MS = 15_000;

export type RelayServerOptions = {
  audit: AuditLog;
  store: IncidentStore;
  forwardToken: string;
  verifyToken: (token: string) => Promise<number | null>;
  maxBodyBytes?: number;
  now?: () => number;
  heartbeatMs?: number;
};

type Stream = { res: ServerResponse; userId: number };

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function sameSignature(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req: IncomingMessage, max: number): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > max) {
        settled = true;
        resolve(null);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => {
      if (settled) return;
      settled = true;
      resolve(null);
    });
  });
}

export function createRelayServer({
  audit, store, forwardToken, verifyToken,
  maxBodyBytes = DEFAULT_MAX_BODY,
  now = () => Date.now(),
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
}: RelayServerOptions) {
  const streams = new Set<Stream>();
  let server: ReturnType<typeof createServer> | null = null;

  const visible = (incident: Incident, userId: number): boolean =>
    incident.recipients.some((recipient) => recipient.userId === userId);

  const publicIncident = (incident: Incident): Incident & { sheetText: string } => ({
    ...incident,
    sheetText: renderIncidentSheet(incident, now()),
  });

  const broadcast = (): void => {
    const snapshot = store.list();
    for (const stream of streams) {
      const incidents = snapshot.filter((incident) => visible(incident, stream.userId)).map(publicIncident);
      stream.res.write(`event: snapshot\ndata: ${JSON.stringify({ incidents })}\n\n`);
    }
  };

  const bearer = async (req: IncomingMessage): Promise<number | null> => {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    if (token === '') return null;
    try {
      return await verifyToken(token);
    } catch {
      return null;
    }
  };

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://relay.local');
    const path = url.pathname;

    try {
      if (req.method === 'GET' && path === '/health') {
        json(res, 200, { ok: true, incidents: store.list().length });
        return;
      }

      if (req.method === 'POST' && path === '/alert') {
        const header = req.headers['x-lab-sign'];
        const given = Array.isArray(header) ? header[0] : header;
        if (typeof given !== 'string' || !sameSignature(given, forwardToken)) {
          json(res, 401, { error: 'unauthorized' });
          return;
        }
        const body = await readBody(req, maxBodyBytes);
        if (body === null) {
          res.writeHead(413, { 'content-type': 'application/json; charset=utf-8', connection: 'close' });
          res.end('{"error":"too_large"}');
          return;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'bad_payload' });
          return;
        }
        if (payload === null || typeof payload !== 'object') {
          json(res, 400, { error: 'bad_payload' });
          return;
        }
        const incident = store.ingest(payload as Parameters<IncidentStore['ingest']>[0]);
        if (incident === null) {
          res.writeHead(204);
          res.end();
          return;
        }
        broadcast();
        json(res, 202, { incidentId: incident.id });
        return;
      }

      if (path === '/stream' && req.method === 'GET') {
        const userId = await bearer(req);
        if (userId === null) {
          json(res, 401, { error: 'unauthorized' });
          return;
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        });
        const stream: Stream = { res, userId };
        streams.add(stream);
        const incidents = store.list().filter((incident) => visible(incident, userId)).map(publicIncident);
        res.write(`event: snapshot\ndata: ${JSON.stringify({ incidents })}\n\n`);
        const beat = setInterval(() => { res.write(': ping\n\n'); }, heartbeatMs);
        beat.unref();
        req.on('close', () => {
          clearInterval(beat);
          streams.delete(stream);
        });
        return;
      }

      const userId = await bearer(req);
      if (userId === null) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }

      if (req.method === 'GET' && path === '/incidents') {
        const incidents = store.list().filter((incident) => visible(incident, userId)).map(publicIncident);
        json(res, 200, { incidents });
        return;
      }

      const match = /^\/incidents\/([^/]+)(?:\/(sheet|delivered|opened|ack))?$/.exec(path);
      if (!match) {
        json(res, 404, { error: 'not_found' });
        return;
      }
      const incidentId = decodeURIComponent(match[1]);
      const action = match[2] ?? null;
      let incident: Incident;
      try {
        incident = store.get(incidentId);
      } catch {
        json(res, 404, { error: 'not_found' });
        return;
      }
      if (!visible(incident, userId)) {
        json(res, 403, { error: 'forbidden' });
        return;
      }

      if (req.method === 'GET' && action === null) {
        json(res, 200, { incident: publicIncident(incident) });
        return;
      }
      if (req.method === 'GET' && action === 'sheet') {
        text(res, 200, renderIncidentSheet(incident, now()));
        return;
      }
      if (req.method === 'POST' && action === 'delivered') {
        const updated = store.delivered(incidentId, userId);
        broadcast();
        json(res, 200, { incident: publicIncident(updated) });
        return;
      }
      if (req.method === 'POST' && action === 'opened') {
        const updated = store.opened(incidentId, userId);
        broadcast();
        json(res, 200, { incident: publicIncident(updated) });
        return;
      }
      if (req.method === 'POST' && action === 'ack') {
        const result = store.ack(incidentId, userId);
        broadcast();
        json(res, 200, { incident: publicIncident(result.incident), changed: result.changed });
        return;
      }
      json(res, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof RelayError) {
        json(res, error.status, { error: error.kind });
        return;
      }
      audit.record('internal_error', { name: error instanceof Error ? error.name : 'unknown' });
      if (!res.headersSent) json(res, 500, { error: 'relay_failed' });
      else res.end();
    }
  };

  const close = async (): Promise<void> => {
    for (const stream of streams) stream.res.end();
    streams.clear();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server.closeAllConnections?.();
      server = null;
    }
  };

  return {
    handler,
    broadcast,
    async listen(port = 0, host = '127.0.0.1'): Promise<{ url: string; close: () => Promise<void> }> {
      if (server) throw new Error('relay server is already listening');
      server = createServer((req, res) => { void handler(req, res); });
      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(port, host, () => resolve());
      });
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      return { url: `http://${host}:${actualPort}`, close };
    },
    close,
  };
}

export type RelayServer = ReturnType<typeof createRelayServer>;
```

- [ ] **Step 4: Run the tests to verify they pass and raise the floor**

Run: `npm run test:relay --silent`
Expected: `ℹ tests 62`, `ℹ fail 0` (10 + 22 + 12 + 18).

Set `EXPECTED_MIN_TESTS` in `m2-ci.yml` to the printed count.

- [ ] **Step 5: Commit**

```bash
git add relay/auth.ts relay/server.ts tests/relay/auth.test.ts tests/relay/server.test.ts .github/workflows/m2-ci.yml
git commit -m "feat(relay): authenticate guardians and expose the JSON/SSE surface"
```

---

### Task 5: Source silence monitor, env parsing, and the relay entry point

**Files:**
- Create: `relay/source.ts`
- Create: `relay/env.ts`
- Create: `relay/main.ts`
- Test: `tests/relay/source.test.ts`
- Test: `tests/relay/env.test.ts`

**Interfaces:**
- Consumes: `AuditLog` (Task 1), `createIncidentStore` (Task 2), `createTokenVerifier` (Task 4), `createRelayServer` (Task 4), `createTraccarClient` (M1 `src/services/traccar/client.ts`).
- Produces:
  - `createSourceMonitor({ audit, now?, staleMs? }) → { observe(positions), pollFailed(error), isDegraded() }`
  - `parseRelayEnv(env: NodeJS.ProcessEnv) → RelayEnv`
  - `npm run relay` starts the service on `127.0.0.1:${LAB_RELAY_PORT}`.

- [ ] **Step 1: Write the failing tests**

`tests/relay/source.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog } from '../../relay/audit.ts';
import { createSourceMonitor } from '../../relay/source.ts';
import { fakeClock } from './helpers.ts';

const T0 = 1_700_000_000_000;
const STALE = 300_000;

function setup() {
  const clock = fakeClock(T0);
  const audit = createAuditLog({ now: clock.now });
  const monitor = createSourceMonitor({ audit, now: clock.now, staleMs: STALE });
  return { clock, audit, monitor };
}

function positions(fixMs: number | null) {
  return [{ fixTime: fixMs === null ? 'not-a-date' : new Date(fixMs).toISOString() }];
}

test('source: a fresh fix is fresh and announces nothing', () => {
  const { monitor, audit } = setup();
  assert.equal(monitor.observe(positions(T0 - 1000)), 'fresh');
  assert.equal(monitor.isDegraded(), false);
  assert.equal(audit.entries().length, 0);
});

test('source: exactly five minutes of silence is stale (the boundary is inclusive)', () => {
  const { clock, monitor } = setup();
  clock.advance(STALE);
  assert.equal(monitor.observe(positions(T0)), 'stale');
  assert.equal(monitor.isDegraded(), true);
});

test('source: one millisecond before five minutes is still fresh', () => {
  const { clock, monitor } = setup();
  clock.advance(STALE - 1);
  assert.equal(monitor.observe(positions(T0)), 'fresh');
  assert.equal(monitor.isDegraded(), false);
});

test('source: recovery is audited but never un-degrades anything', () => {
  const { clock, monitor, audit } = setup();
  clock.advance(STALE);
  monitor.observe(positions(T0));
  clock.advance(1000);
  assert.equal(monitor.observe(positions(clock.now())), 'fresh');
  assert.equal(monitor.isDegraded(), false);
  assert.equal(audit.entries().filter((entry) => entry.action === 'source_recovered').length, 1);
});

test('source: an unreadable fixTime is unknown evidence — it neither degrades nor recovers', () => {
  const { clock, monitor, audit } = setup();
  clock.advance(STALE * 2);
  assert.equal(monitor.observe(positions(null)), 'unknown');
  assert.equal(monitor.isDegraded(), false);
  assert.equal(audit.entries().filter((entry) => entry.action === 'degraded').length, 0);
});

test('source: a poll failure is audited once per transition and is not silence', () => {
  const { monitor, audit } = setup();
  monitor.pollFailed(new Error('network down'));
  monitor.pollFailed(new Error('network down'));
  assert.equal(audit.entries().filter((entry) => entry.action === 'source_poll_failed').length, 1);
  assert.equal(monitor.isDegraded(), false);
});

test('source: a successful poll with stale data after a failure still degrades', () => {
  const { clock, monitor, audit } = setup();
  monitor.pollFailed(new Error('network down'));
  clock.advance(STALE);
  assert.equal(monitor.observe(positions(T0)), 'stale');
  assert.equal(monitor.isDegraded(), true);
  assert.equal(audit.entries().filter((entry) => entry.action === 'degraded').length, 1);
});

test('source: with several devices the oldest fix decides (conservative reading)', () => {
  const { clock, monitor } = setup();
  clock.advance(STALE);
  assert.equal(monitor.observe([
    { fixTime: new Date(clock.now()).toISOString() },
    { fixTime: new Date(T0).toISOString() },
  ]), 'stale');
});

test('source: no positions at all becomes stale only after the full window', () => {
  const { clock, monitor } = setup();
  clock.advance(60_000);
  assert.equal(monitor.observe([]), 'unknown');
  assert.equal(monitor.isDegraded(), false);
  clock.advance(STALE);
  assert.equal(monitor.observe([]), 'stale');
  assert.equal(monitor.isDegraded(), true);
});

test('source: staying stale announces degradation once, not on every poll', () => {
  const { clock, monitor, audit } = setup();
  clock.advance(STALE);
  monitor.observe(positions(T0));
  clock.advance(15_000);
  monitor.observe(positions(T0));
  assert.equal(audit.entries().filter((entry) => entry.action === 'degraded').length, 1);
});
```

`tests/relay/env.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRelayEnv } from '../../relay/env.ts';

const BASE = {
  LAB_API_URL: 'http://127.0.0.1:8082/api',
  LAB_ADMIN_EMAIL: 'lab-admin@example.com',
  LAB_ADMIN_PASSWORD: 'fixture-password',
  LAB_FORWARD_TOKEN: 'fixture-sign',
};

test('env: minimal names parse with documented defaults', () => {
  const env = parseRelayEnv({ ...BASE });
  assert.equal(env.apiUrl, BASE.LAB_API_URL);
  assert.equal(env.port, 8083);
  assert.equal(env.windowMs, 60_000);
  assert.equal(env.staleMs, 300_000);
  assert.equal(env.auditPath, 'lab/logs/relay-audit.ndjson');
  assert.equal(env.recipientIds, null);
});

test('env: missing names are reported by NAME only, never by value', () => {
  assert.throws(() => parseRelayEnv({}), (error: unknown) => {
    const message = (error as Error).message;
    assert.match(message, /LAB_API_URL/);
    assert.match(message, /LAB_FORWARD_TOKEN/);
    assert.doesNotMatch(message, /fixture-sign|fixture-password/);
    return true;
  });
});

test('env: a non-positive or non-numeric window is refused', () => {
  assert.throws(() => parseRelayEnv({ ...BASE, LAB_RELAY_WINDOW_MS: '0' }));
  assert.throws(() => parseRelayEnv({ ...BASE, LAB_RELAY_WINDOW_MS: 'soon' }));
  assert.throws(() => parseRelayEnv({ ...BASE, LAB_RELAY_PORT: '70000' }));
});

test('env: recipient ids parse, dedupe, and sort ascending', () => {
  const env = parseRelayEnv({ ...BASE, LAB_RELAY_RECIPIENT_IDS: '2, 1,2' });
  assert.deepEqual(env.recipientIds, [1, 2]);
  assert.throws(() => parseRelayEnv({ ...BASE, LAB_RELAY_RECIPIENT_IDS: '1,x' }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:relay --silent`
Expected: FAIL — `Cannot find module '../../relay/source.ts'`.

- [ ] **Step 3: Implement the monitor, env, and entry point**

`relay/source.ts`:

```ts
// relay/source.ts — interpret Traccar's latest positions as fresh, stale, unknown, or a failed poll.
// Five minutes without a fresh fix IS the alarm (§5, AC-5). A failed poll is not: it is audited and
// never degrades. An unreadable fixTime is not evidence either. The monitor never un-degrades an
// incident; it only stops announcing new degradation after a recovery.
import { type AuditLog } from './audit.ts';

const DEFAULT_STALE_MS = 300_000;
export type SourceReading = 'fresh' | 'stale' | 'unknown';

function fixMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function createSourceMonitor({
  audit, now = () => Date.now(), staleMs = DEFAULT_STALE_MS,
}: { audit: AuditLog; now?: () => number; staleMs?: number }) {
  if (!Number.isFinite(staleMs) || staleMs <= 0) throw new Error('staleMs must be a positive finite number');
  let degradedAnnounced = false;
  let emptySince: number | null = null;
  let lastState: 'fresh' | 'stale' | 'unknown' | 'poll_failed' = 'unknown';

  const announce = (at: number, kind: 'stale_fix' | 'no_positions', ageMs: number | null): SourceReading => {
    if (!degradedAnnounced) {
      degradedAnnounced = true;
      audit.record('degraded', { source: 'silence', kind, ageMs });
    }
    lastState = 'stale';
    void at;
    return 'stale';
  };

  return {
    observe(raw: unknown): SourceReading {
      const at = now();
      const list = Array.isArray(raw) ? raw : [];
      const times = list.map((item) => fixMs((item as { fixTime?: unknown } | null)?.fixTime)).filter((ms): ms is number => ms !== null);
      if (times.length === 0) {
        if (emptySince === null) emptySince = at;
        const age = at - emptySince;
        if (age >= staleMs) return announce(at, 'no_positions', age);
        lastState = 'unknown';
        return 'unknown';
      }
      emptySince = null;
      const age = at - Math.min(...times);
      if (age >= staleMs) return announce(at, 'stale_fix', age);
      if (degradedAnnounced || lastState === 'poll_failed') {
        audit.record('source_recovered', { from: lastState });
      }
      degradedAnnounced = false;
      lastState = 'fresh';
      return 'fresh';
    },

    pollFailed(_error: unknown): void {
      if (lastState !== 'poll_failed') {
        audit.record('source_poll_failed', { reason: 'fetch_failed' });
      }
      lastState = 'poll_failed';
    },

    isDegraded(): boolean {
      return degradedAnnounced;
    },
  };
}

export type SourceMonitor = ReturnType<typeof createSourceMonitor>;
```

`relay/env.ts`:

```ts
// relay/env.ts — the relay's environment contract. Names are reported when missing; values never are.
export type RelayEnv = {
  apiUrl: string;
  adminEmail: string;
  adminPassword: string;
  forwardToken: string;
  port: number;
  windowMs: number;
  staleMs: number;
  auditPath: string;
  recipientIds: number[] | null;
};

const REQUIRED = ['LAB_API_URL', 'LAB_ADMIN_EMAIL', 'LAB_ADMIN_PASSWORD', 'LAB_FORWARD_TOKEN'] as const;

function positiveInt(value: string | undefined, fallback: number, name: string, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function parseRelayEnv(env: NodeJS.ProcessEnv): RelayEnv {
  const missing = REQUIRED.filter((name) => typeof env[name] !== 'string' || env[name]!.trim() === '');
  if (missing.length > 0) throw new Error(`missing relay env: ${missing.join(', ')}`);
  let recipientIds: number[] | null = null;
  const rawIds = env.LAB_RELAY_RECIPIENT_IDS;
  if (typeof rawIds === 'string' && rawIds.trim() !== '') {
    const ids = rawIds.split(',').map((part) => Number(part.trim()));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error('LAB_RELAY_RECIPIENT_IDS must be a comma-separated list of positive integers');
    }
    recipientIds = Array.from(new Set(ids)).sort((a, b) => a - b);
  }
  return {
    apiUrl: env.LAB_API_URL!.trim().replace(/\/+$/, ''),
    adminEmail: env.LAB_ADMIN_EMAIL!,
    adminPassword: env.LAB_ADMIN_PASSWORD!,
    forwardToken: env.LAB_FORWARD_TOKEN!,
    port: positiveInt(env.LAB_RELAY_PORT, 8083, 'LAB_RELAY_PORT', 65_535),
    windowMs: positiveInt(env.LAB_RELAY_WINDOW_MS, 60_000, 'LAB_RELAY_WINDOW_MS'),
    staleMs: positiveInt(env.LAB_RELAY_STALE_MS, 300_000, 'LAB_RELAY_STALE_MS'),
    auditPath: env.LAB_RELAY_AUDIT_PATH?.trim() || 'lab/logs/relay-audit.ndjson',
    recipientIds,
  };
}
```

`relay/main.ts`:

```ts
// relay/main.ts — the runnable relay: file-backed audit, Traccar admin client, source poller, ladder
// ticker, and graceful shutdown. Nothing here prints a credential, a token, or an email.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTraccarClient } from '../src/services/traccar/client.ts';
import { createAuditLog } from './audit.ts';
import { createTokenVerifier } from './auth.ts';
import { parseRelayEnv, type RelayEnv } from './env.ts';
import { createIncidentStore } from './incidents.ts';
import { createRelayServer } from './server.ts';
import { createSourceMonitor } from './source.ts';
import type { ServerPosition, ServerUser } from '../src/services/traccar/types.ts';

const POLL_MS = 15_000;
const TICK_MS = 1_000;
const USERS_REFRESH_MS = 5 * 60_000;

export async function startRelay(env: RelayEnv) {
  mkdirSync(dirname(env.auditPath), { recursive: true });
  const audit = createAuditLog({
    write: (entry) => appendFileSync(env.auditPath, `${JSON.stringify(entry)}\n`),
  });
  const client = createTraccarClient({
    baseUrl: env.apiUrl,
    credentials: { email: env.adminEmail, password: env.adminPassword },
  });

  let recipients = env.recipientIds === null ? [] : env.recipientIds.map((userId) => ({ userId }));
  const refreshRecipients = async (): Promise<void> => {
    if (env.recipientIds !== null) return;
    try {
      const users = await client.get<ServerUser[]>('/users');
      recipients = users
        .filter((user) => Number.isFinite(user.id) && user.id > 0)
        .map((user) => (typeof user.name === 'string' && user.name !== '' ? { userId: user.id, name: user.name } : { userId: user.id }));
    } catch {
      // Keep the last known list: an empty list would silently stop contacting guardians, and the
      // failure is already visible as a missing incident in the app.
    }
  };
  await refreshRecipients();

  const store = createIncidentStore({ audit, recipients: () => recipients, windowMs: env.windowMs });
  const monitor = createSourceMonitor({ audit, staleMs: env.staleMs });
  const server = createRelayServer({
    audit,
    store,
    forwardToken: env.forwardToken,
    verifyToken: createTokenVerifier({ apiUrl: env.apiUrl }),
  });
  const { url } = await server.listen(env.port, '127.0.0.1');

  const poll = async (): Promise<void> => {
    try {
      const positions = await client.get<ServerPosition[]>('/positions');
      if (monitor.observe(positions) === 'stale') store.degradeOpen('silence');
    } catch (error) {
      monitor.pollFailed(error);
    }
  };

  const pollTimer = setInterval(() => { void poll(); }, POLL_MS);
  const usersTimer = setInterval(() => { void refreshRecipients(); }, USERS_REFRESH_MS);
  const tickTimer = setInterval(() => {
    const before = audit.entries().length;
    store.tick();
    if (audit.entries().length !== before) server.broadcast();
  }, TICK_MS);
  pollTimer.unref();
  usersTimer.unref();
  tickTimer.unref();
  void poll();

  const shutdown = async (): Promise<void> => {
    clearInterval(pollTimer);
    clearInterval(usersTimer);
    clearInterval(tickTimer);
    await server.close();
  };

  console.log(`relay listening on ${url} (lab-only, 127.0.0.1)`);
  return { url, server, store, monitor, audit, shutdown };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = parseRelayEnv(process.env);
  startRelay(env).then(({ shutdown }) => {
    const stop = () => { void shutdown().then(() => process.exit(0)); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }).catch((error: unknown) => {
    console.error(`relay failed to start: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass and raise the floor**

Run: `npm run test:relay --silent`
Expected: `ℹ tests 76`, `ℹ fail 0` (10 + 22 + 12 + 18 + 14).

Run: `npm run lint`
Expected: exit 0 (this is the first task that imports `node:fs`/`node:path`/`node:url` in `relay/`).

Set `EXPECTED_MIN_TESTS` in `m2-ci.yml` to the printed count.

- [ ] **Step 5: Commit**

```bash
git add relay/source.ts relay/env.ts relay/main.ts tests/relay/source.test.ts tests/relay/env.test.ts .github/workflows/m2-ci.yml
git commit -m "feat(relay): add the silence monitor, env contract, and entry point"
```

---

### Task 6: Ref-counted socket-token lease in the session layer

**Files:**
- Modify: `src/services/traccar/session.ts`
- Test: `tests/app/session.test.ts` (append a named block)

**Interfaces:**
- Consumes: existing `mintSocketToken`, `revokeWith`, `expirationIso`, `toEpochMs` (session.ts).
- Produces:
  - `leaseSocketToken(expiresAt?) → Promise<{ token: string; release: () => Promise<void> }>`
  - `resetSession()` and `signOut()` invalidate any in-flight lease mint.
  - `mintSocketToken` keeps its exact M1 contract (bare token, writes `active.token`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/app/session.test.ts`, and add `leaseSocketToken` to the existing import from `session.ts`:

```ts
// M2 lease: two live consumers (alerts socket and relay stream) must share ONE minted token, and the
// token must be revoked exactly once when the last consumer releases it. `mintSocketToken` keeps its
// M1 contract; the lease holds its own token so neither overwrites the other.
test('session lease (أ): concurrent acquisitions mint once and return the same token', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    srv.log.length = 0;
    const [first, second] = await Promise.all([
      leaseSocketToken(EXPIRES_AT),
      leaseSocketToken(EXPIRES_AT),
    ]);
    assert.equal(first.token, FAKE_TOKEN);
    assert.equal(second.token, FAKE_TOKEN);
    assert.equal(srv.log.filter((r) => r.url === '/api/session/token').length, 1);
    await first.release();
    await second.release();
  } finally { await srv.close(); resetSession(); }
});

test('session lease (ب): the token is revoked once, when the last lease is released', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const first = await leaseSocketToken(EXPIRES_AT);
    const second = await leaseSocketToken(EXPIRES_AT);
    srv.log.length = 0;
    await first.release();
    assert.equal(srv.log.filter((r) => r.url === '/api/session/token/revoke').length, 0);
    await second.release();
    const revoked = srv.log.filter((r) => r.url === '/api/session/token/revoke');
    assert.equal(revoked.length, 1);
    assert.equal(revoked[0].body, `token=${FAKE_TOKEN}`);
    await second.release();
    assert.equal(srv.log.filter((r) => r.url === '/api/session/token/revoke').length, 1);
  } finally { await srv.close(); resetSession(); }
});

test('session lease (ج): signing out revokes a live lease exactly once', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const lease = await leaseSocketToken(EXPIRES_AT);
    srv.log.length = 0;
    await signOut();
    const revoked = srv.log.filter((r) => r.url === '/api/session/token/revoke');
    assert.equal(revoked.length, 1);
    assert.equal(revoked[0].body, `token=${FAKE_TOKEN}`);
    await lease.release();
    assert.equal(srv.log.filter((r) => r.url === '/api/session/token/revoke').length, 1);
  } finally { await srv.close(); resetSession(); }
});

test('session lease (د): a failed mint leaves no lease, and a later attempt can succeed', async () => {
  resetSession();
  let fail = true;
  const srv = await withFakeTraccar((seen) => {
    if (seen.url === '/api/session/token') {
      return fail ? { status: 500, body: '{"error":"nope"}' } : { status: 200, body: FAKE_TOKEN };
    }
    return sessionRoutes()(seen);
  });
  try {
    await signIn({ baseUrl: srv.url, email: EMAIL, password: PASSWORD });
    const error = await leaseSocketToken(EXPIRES_AT).catch((e) => e as Error);
    assert.ok(error instanceof TraccarError);
    fail = false;
    const lease = await leaseSocketToken(EXPIRES_AT);
    assert.equal(lease.token, FAKE_TOKEN);
    await lease.release();
  } finally { await srv.close(); resetSession(); }
});

test('session lease (هـ): leasing without a session is refused before any request', async () => {
  resetSession();
  const srv = await withFakeTraccar(sessionRoutes());
  try {
    const error = await leaseSocketToken(EXPIRES_AT).catch((e) => e as Error);
    assert.ok(error instanceof TraccarError);
    assert.equal((error as TraccarError).kind, 'unauthorized');
    assert.equal(srv.log.length, 0);
  } finally { await srv.close(); resetSession(); }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:app --silent`
Expected: FAIL — `leaseSocketToken is not a function` / import error; test count 234 but 5 failing.

- [ ] **Step 3: Implement the lease**

In `src/services/traccar/session.ts`, add after the `active` declaration:

```ts
// Two independent live consumers (the alerts socket and the relay stream) share one minted token.
// A lease is ref-counted: the first acquisition mints, the last release revokes exactly once. The
// lease keeps its own token; `mintSocketToken` keeps writing `active.token`, so neither overwrites
// the other. `generation` invalidates any mint that was in flight when the session ended.
const LEASE_MIN_REMAINING_MS = 5 * 60 * 1000;
type TokenLease = { token: string; expiresAt: number; refs: number; generation: number };
let lease: TokenLease | null = null;
let leaseMint: { generation: number; promise: Promise<void> } | null = null;
let generation = 0;
```

Replace the body of `resetSession` with:

```ts
export function resetSession(): void {
  generation += 1;
  lease = null;
  leaseMint = null;
  active = null;
}
```

Replace the body of `signOut` with:

```ts
export async function signOut(): Promise<void> {
  const session = active;
  if (!session) return;
  const minted = session.token;
  const leased = lease?.token ?? null;
  // Invalidate in-flight mints BEFORE the record leaves memory: a token that arrives after this
  // point is revoked by its own mint closure instead of being attached to a dead session.
  generation += 1;
  lease = null;
  leaseMint = null;
  active = null;
  try {
    await session.client.remove('/session');
  } finally {
    if (minted !== null) await revokeWith(session.client, minted);
    if (leased !== null && leased !== minted) await revokeWith(session.client, leased);
  }
}
```

Replace `mintSocketToken` with a shared internal mint plus the unchanged public contract:

```ts
async function mintToken(expiresAt?: string | number | Date): Promise<{ token: string; expiresAt: number }> {
  const session = active;
  if (!session) throw new TraccarError('unauthorized', 401, 'sign in before minting a socket token');
  const expiration = expirationIso(expiresAt);
  const token = await session.client.postFormText('/session/token', { expiration });
  if (token === '') {
    throw new TraccarError('badpayload', 200, 'the server minted an empty socket token');
  }
  return { token, expiresAt: Date.parse(expiration) };
}

export async function mintSocketToken(expiresAt?: string | number | Date): Promise<string> {
  const minted = await mintToken(expiresAt);
  const session = active;
  if (!session) throw new TraccarError('unauthorized', 401, 'the session ended while minting a socket token');
  session.token = minted.token;
  return minted.token;
}

export type SocketTokenLease = { token: string; release: () => Promise<void> };

export async function leaseSocketToken(expiresAt?: string | number | Date): Promise<SocketTokenLease> {
  const session = active;
  if (!session) throw new TraccarError('unauthorized', 401, 'sign in before leasing a socket token');
  expirationIso(expiresAt); // a dead expiration is refused even when a cached lease exists
  const mine = generation;
  const nearExpiry = lease !== null && lease.expiresAt - Date.now() <= LEASE_MIN_REMAINING_MS;
  if (lease === null || lease.generation !== mine || (lease.refs === 0 && nearExpiry)) {
    if (leaseMint === null || leaseMint.generation !== mine) {
      const promise = (async () => {
        const minted = await mintToken(expiresAt);
        if (generation !== mine || active !== session) {
          await revokeWith(session.client, minted.token).catch(() => undefined);
          throw new TraccarError('unauthorized', 401, 'the session ended while minting a socket token');
        }
        lease = { token: minted.token, expiresAt: minted.expiresAt, refs: 0, generation: mine };
      })();
      leaseMint = { generation: mine, promise };
    }
    const pending = leaseMint;
    try {
      await pending.promise;
    } finally {
      if (leaseMint === pending) leaseMint = null;
    }
  }
  const current = lease;
  if (current === null || current.generation !== generation) {
    throw new TraccarError('unauthorized', 401, 'the session ended before the socket token was leased');
  }
  current.refs += 1;
  return {
    token: current.token,
    release: async () => {
      if (current.refs > 0) current.refs -= 1;
      if (current.refs > 0 || lease !== current) return;
      lease = null;
      const now = active;
      if (now !== null) await revokeWith(now.client, current.token);
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass and raise the floor**

Run: `npm run test:app --silent`
Expected: `ℹ tests 234`, `ℹ fail 0`.

Run: `npm run test:relay --silent` (must stay green), then `npm run lint`.

Set the app floor in `.github/workflows/m2-ci.yml` to the printed app count in the same commit. Leave `m1-ci.yml` at 229: that workflow runs only on `m1/**` and must keep guarding the branch it belongs to.

- [ ] **Step 5: Commit**

```bash
git add src/services/traccar/session.ts tests/app/session.test.ts .github/workflows/m2-ci.yml
git commit -m "feat(session): share one socket token through a ref-counted lease"
```

---

### Task 7: App relay client, SSE parser, and escalation controller

**Files:**
- Create: `src/services/relay/client.ts`
- Create: `src/services/relay/stream.ts`
- Create: `src/state/escalation.ts`
- Modify: `src/translations/catalog.ts` (eight failure keys)
- Test: `tests/app/relay.test.ts`

**Interfaces:**
- Consumes: `leaseSocketToken` (Task 6), `currentUser` (M1 session service), `Incident` (relay types).
- Produces:
  - `RelayClientError { kind: RelayClientErrorKind; status }` where `RelayClientErrorKind = 'unauthorized'|'forbidden'|'notfound'|'conflict'|'server'|'timeout'|'badpayload'|'network'`; `createRelayClient({baseUrl, token, fetchFn?, timeoutMs?}) → { listIncidents, delivered, opened, ack, sheet }`
  - `createSseParser(onEvent) → { push(chunk), end() }`, `streamIncidents({baseUrl, token, signal, onEvent, fetchFn?})`
  - `createEscalationController(deps?) → { getSnapshot, getServerSnapshot, subscribe, connect, disconnect, pollOnce, markOpened, ack, setLang }`
  - Catalog keys `relay.failed.*`.

- [ ] **Step 1: Write the failing tests**

`tests/app/relay.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog } from '../../relay/audit.ts';
import { createIncidentStore } from '../../relay/incidents.ts';
import type { Incident } from '../../relay/types.ts';
import { RelayClientError, createRelayClient } from '../../src/services/relay/client.ts';
import { createSseParser, streamIncidents } from '../../src/services/relay/stream.ts';
import { createEscalationController } from '../../src/state/escalation.ts';
import { translate } from '../../src/translations/catalog.ts';
import { forwardPayload } from '../relay/helpers.ts';

const TOKEN = 'fixture-lease-token';
const BASE = 'http://relay.test';

function fixture(overrides: { alarm?: string; type?: string } = {}): Incident {
  const audit = createAuditLog();
  const store = createIncidentStore({ audit, recipients: [{ userId: 1 }, { userId: 2 }] });
  const created = store.ingest(forwardPayload({ type: overrides.type ?? 'geofenceExit', alarm: overrides.alarm ?? null }))!;
  return store.get(created.id);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function deliveredCopy(incident: Incident): Incident {
  return {
    ...incident,
    deliveries: [
      { ...incident.deliveries[0], state: 'delivered', deliveredAt: new Date().toISOString() },
      incident.deliveries[1],
    ],
  };
}

test('relay client: requests carry the bearer and the incident list is parsed', async () => {
  const incident = fixture();
  const seen: Array<{ url: string; auth: string | undefined }> = [];
  const client = createRelayClient({
    baseUrl: BASE,
    token: TOKEN,
    fetchFn: async (url, init) => {
      seen.push({ url: String(url), auth: (init?.headers as Record<string, string> | undefined)?.authorization });
      return json({ incidents: [incident] });
    },
  });
  const list = await client.listIncidents();
  assert.equal(list.length, 1);
  assert.equal(seen[0].url, `${BASE}/incidents`);
  assert.equal(seen[0].auth, `Bearer ${TOKEN}`);
});

test('relay client: a 409 is a conflict kind and never repeats the relay body', async () => {
  const client = createRelayClient({
    baseUrl: BASE,
    token: TOKEN,
    fetchFn: async () => new Response('{"error":"another guardian"}', { status: 409 }),
  });
  const error = await client.ack('inc-0001').catch((e) => e as Error);
  assert.ok(error instanceof RelayClientError);
  assert.equal((error as RelayClientError).kind, 'conflict');
  assert.doesNotMatch(`${error.message}`, /another guardian|fixture-lease-token/);
});

test('relay client: a missing incident list is a bad payload, not an empty success', async () => {
  const client = createRelayClient({ baseUrl: BASE, token: TOKEN, fetchFn: async () => json({ incidents: 'nope' }) });
  await assert.rejects(() => client.listIncidents(), (error: unknown) => {
    assert.ok(error instanceof RelayClientError);
    assert.equal((error as RelayClientError).kind, 'badpayload');
    return true;
  });
});

test('stream: the parser survives an event split across chunks', () => {
  const events: Array<{ event: string; data: string }> = [];
  const parser = createSseParser((event) => events.push(event));
  parser.push('event: snap');
  parser.push('shot\ndata: {"incidents":[]}\n\n');
  assert.deepEqual(events, [{ event: 'snapshot', data: '{"incidents":[]}' }]);
});

test('stream: comments are ignored, multi-line data is joined, and end() flushes', () => {
  const events: Array<{ event: string; data: string }> = [];
  const parser = createSseParser((event) => events.push(event));
  parser.push(': ping\n\nevent: incident\ndata: line1\ndata: line2\n\n');
  parser.push('event: snapshot\ndata: {}');
  parser.end();
  assert.deepEqual(events, [
    { event: 'incident', data: 'line1\nline2' },
    { event: 'snapshot', data: '{}' },
  ]);
});

test('stream: a non-2xx response is a typed failure that never names the token', async () => {
  const error = await streamIncidents({
    baseUrl: BASE,
    token: TOKEN,
    signal: new AbortController().signal,
    onEvent: () => undefined,
    fetchFn: async () => new Response('{"error":"no"}', { status: 403 }),
  }).catch((e) => e as Error);
  assert.ok(error instanceof RelayClientError);
  assert.equal((error as RelayClientError).kind, 'forbidden');
  assert.doesNotMatch(`${error.message}`, new RegExp(TOKEN));
});

function controllerHarness(options: { ackStatus?: number; degraded?: boolean } = {}) {
  const store = createIncidentStore({ audit: createAuditLog(), recipients: [{ userId: 1 }, { userId: 2 }] });
  let incident = store.ingest(forwardPayload({ type: 'geofenceExit' }))!;
  if (options.degraded) {
    store.degradeOpen('silence');
    incident = store.get(incident.id);
  } else {
    incident = store.get(incident.id);
  }
  const calls: string[] = [];
  let released = 0;
  let failPolls = false;
  let streamSignal: AbortSignal | null = null;

  const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
    const target = String(url);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${target}`);
    if (target.endsWith('/incidents') && method === 'GET') {
      if (failPolls) throw new Error('offline');
      return json({ incidents: [incident] });
    }
    if (target.endsWith('/delivered')) return json({ incident: deliveredCopy(incident) });
    if (target.endsWith('/opened')) return json({ incident: { ...incident, deliveries: [{ ...incident.deliveries[0], state: 'opened', openedAt: new Date().toISOString() }, incident.deliveries[1]] } });
    if (target.endsWith('/ack')) {
      if (options.ackStatus !== undefined) return new Response('{"error":"conflict"}', { status: options.ackStatus });
      return json({ incident: { ...incident, assigneeUserId: 1, state: 'assigned' }, changed: true });
    }
    return json({});
  };

  const streamFn = ({ signal, onEvent }: { signal: AbortSignal; onEvent: (event: { event: string; data: string }) => void }) => {
    streamSignal = signal;
    void onEvent;
    return new Promise<void>((resolve) => { signal.addEventListener('abort', () => resolve()); });
  };

  const controller = createEscalationController({
    baseUrl: BASE,
    identity: () => 1,
    lease: async () => ({ token: TOKEN, release: async () => { released += 1; } }),
    fetchFn,
    streamFn,
  });

  return {
    controller, calls, incident,
    releaseCount: () => released,
    failPolls: (value: boolean) => { failPolls = value; },
    streamSignal: () => streamSignal,
  };
}

test('controller: connect loads the list, becomes live, and posts one delivery receipt', async () => {
  const h = controllerHarness();
  await h.controller.connect();
  await new Promise((resolve) => setImmediate(resolve));
  const snapshot = h.controller.getSnapshot();
  assert.equal(snapshot.status, 'live');
  assert.equal(h.calls.filter((call) => call.includes('/delivered')).length, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), new RegExp(TOKEN));
  await h.controller.disconnect();
});

test('controller: opening an incident is posted once', async () => {
  const h = controllerHarness();
  await h.controller.connect();
  await h.controller.markOpened(h.incident.id);
  await h.controller.markOpened(h.incident.id);
  assert.equal(h.calls.filter((call) => call.includes('/opened')).length, 1);
  await h.controller.disconnect();
});

test('controller: a conflicting ack says so and leaves the incident assigned as it was', async () => {
  const h = controllerHarness({ ackStatus: 409 });
  await h.controller.connect();
  await h.controller.ack(h.incident.id);
  assert.equal(h.controller.getSnapshot().lastAckError, translate('relay.failed.conflict', 'ar'));
  assert.equal(h.controller.getSnapshot().incidents[0].assigneeUserId, null);
  await h.controller.disconnect();
});

test('controller: a stream failure falls back, a good poll stays fallback, a bad poll fails', async () => {
  const h = controllerHarness();
  await h.controller.connect();
  // The harness stream never emits and never rejects, so force the failure path by disconnecting it
  // through the same code the real controller uses: a rejected stream promise.
  await h.controller.disconnect();
  const failing = createEscalationController({
    baseUrl: BASE,
    identity: () => 1,
    lease: async () => ({ token: TOKEN, release: async () => undefined }),
    fetchFn: h.controller.getSnapshot().status === 'idle' ? (async () => json({ incidents: [h.incident] })) : (async () => json({ incidents: [h.incident] })),
    streamFn: async () => { throw new RelayClientError('network', 0, 'the relay could not be reached'); },
  });
  await failing.connect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(failing.getSnapshot().status, 'fallback');
  await failing.pollOnce();
  assert.equal(failing.getSnapshot().status, 'fallback');
  h.failPolls(true);
  const offline = createEscalationController({
    baseUrl: BASE,
    identity: () => 1,
    lease: async () => ({ token: TOKEN, release: async () => undefined }),
    fetchFn: async () => { throw new Error('offline'); },
    streamFn: async () => { throw new RelayClientError('network', 0, 'down'); },
  });
  await offline.connect();
  assert.equal(offline.getSnapshot().status, 'failed');
  await failing.disconnect();
});

test('controller: a degraded incident is exposed to the screen', async () => {
  const h = controllerHarness({ degraded: true });
  await h.controller.connect();
  assert.equal(h.controller.getSnapshot().incidents[0].degraded, true);
  assert.equal(h.controller.getSnapshot().incidents[0].state, 'degraded');
  await h.controller.disconnect();
});

test('controller: no snapshot ever contains the lease token', async () => {
  const h = controllerHarness();
  await h.controller.connect();
  const serialized = JSON.stringify(h.controller.getSnapshot());
  assert.doesNotMatch(serialized, new RegExp(TOKEN));
  assert.doesNotMatch(serialized, /fixture-lease/);
  await h.controller.disconnect();
});

test('controller: disconnect aborts the stream and releases the lease exactly once', async () => {
  const h = controllerHarness();
  await h.controller.connect();
  await h.controller.disconnect();
  assert.equal(h.releaseCount(), 1);
  assert.equal(h.streamSignal()?.aborted, true);
  assert.equal(h.controller.getSnapshot().status, 'idle');
});

test('controller: no signed-in identity means failed-unauthorized before any lease', async () => {
  let leased = 0;
  const controller = createEscalationController({
    baseUrl: BASE,
    identity: () => null,
    lease: async () => { leased += 1; return { token: TOKEN, release: async () => undefined }; },
  });
  await controller.connect();
  assert.equal(controller.getSnapshot().status, 'failed');
  assert.equal(controller.getSnapshot().message, translate('relay.failed.unauthorized', 'ar'));
  assert.equal(leased, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:app --silent`
Expected: FAIL — `Cannot find module '../../src/services/relay/client.ts'`.

- [ ] **Step 3: Implement the client, parser, controller, and failure copy**

`src/services/relay/client.ts`:

```ts
// src/services/relay/client.ts — the guardian app's relay client.
// Bearer only; errors carry a status and a phrase written here, never the relay's body (which could
// echo a request) and never the token. `LiveIncident` is the server's serialized incident plus the
// computed sheet text.
import type { Incident } from '../../../relay/types.ts';

export type RelayClientErrorKind =
  | 'unauthorized' | 'forbidden' | 'notfound' | 'conflict'
  | 'server' | 'timeout' | 'badpayload' | 'network';

export class RelayClientError extends Error {
  readonly kind: RelayClientErrorKind;
  readonly status: number;

  constructor(kind: RelayClientErrorKind, status: number, message: string) {
    super(message);
    this.name = 'RelayClientError';
    this.kind = kind;
    this.status = status;
  }
}

export type LiveIncident = Incident & { sheetText?: string };

export function relayKindOfStatus(status: number): RelayClientErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notfound';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'server';
  return 'badpayload';
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function createRelayClient({
  baseUrl, token, fetchFn = fetch, timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  baseUrl: string;
  token: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}) {
  const base = baseUrl.replace(/\/+$/, '');

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(`${base}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(init.headers ?? {}) },
        signal: controller.signal,
      });
    } catch {
      throw new RelayClientError('network', 0, 'the relay could not be reached');
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new RelayClientError(relayKindOfStatus(response.status), response.status, `the relay answered ${response.status}`);
    }
    return response;
  }

  async function body(response: Response): Promise<Record<string, unknown>> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new RelayClientError('badpayload', response.status, 'the relay sent an unreadable body');
    }
  }

  return {
    async listIncidents(): Promise<LiveIncident[]> {
      const parsed = await body(await request('/incidents'));
      if (!Array.isArray(parsed.incidents)) {
        throw new RelayClientError('badpayload', 200, 'the relay sent no incident list');
      }
      return parsed.incidents as LiveIncident[];
    },
    async delivered(id: string): Promise<LiveIncident> {
      const parsed = await body(await request(`/incidents/${encodeURIComponent(id)}/delivered`, { method: 'POST' }));
      if (!parsed.incident) throw new RelayClientError('badpayload', 200, 'the relay sent no incident');
      return parsed.incident as LiveIncident;
    },
    async opened(id: string): Promise<LiveIncident> {
      const parsed = await body(await request(`/incidents/${encodeURIComponent(id)}/opened`, { method: 'POST' }));
      if (!parsed.incident) throw new RelayClientError('badpayload', 200, 'the relay sent no incident');
      return parsed.incident as LiveIncident;
    },
    async ack(id: string): Promise<{ incident: LiveIncident; changed: boolean }> {
      const parsed = await body(await request(`/incidents/${encodeURIComponent(id)}/ack`, { method: 'POST' }));
      if (!parsed.incident) throw new RelayClientError('badpayload', 200, 'the relay sent no incident');
      return { incident: parsed.incident as LiveIncident, changed: parsed.changed === true };
    },
    async sheet(id: string): Promise<string> {
      const response = await request(`/incidents/${encodeURIComponent(id)}/sheet`);
      return response.text();
    },
  };
}

export type RelayClient = ReturnType<typeof createRelayClient>;
```

`src/services/relay/stream.ts`:

```ts
// src/services/relay/stream.ts — SSE over fetch, because EventSource cannot send an Authorization
// header. The parser is pure so chunk boundaries are tested without a network.
import { RelayClientError, relayKindOfStatus } from './client.ts';

export type SseEvent = { event: string; data: string };

export function createSseParser(onEvent: (event: SseEvent) => void) {
  let buffer = '';

  const parseBlock = (block: string): void => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      if (field === 'data') data.push(value);
    }
    if (data.length > 0) onEvent({ event, data: data.join('\n') });
  };

  return {
    push(chunk: string): void {
      buffer += chunk.replace(/\r\n/g, '\n');
      let index = buffer.indexOf('\n\n');
      while (index !== -1) {
        parseBlock(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf('\n\n');
      }
    },
    end(): void {
      if (buffer.trim() !== '') parseBlock(buffer);
      buffer = '';
    },
  };
}

export async function streamIncidents({
  baseUrl, token, signal, onEvent, fetchFn = fetch,
}: {
  baseUrl: string;
  token: string;
  signal: AbortSignal;
  onEvent: (event: SseEvent) => void;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}): Promise<void> {
  const response = await fetchFn(`${baseUrl.replace(/\/+$/, '')}/stream`, {
    headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
    signal,
  });
  if (!response.ok || response.body === null) {
    throw new RelayClientError(relayKindOfStatus(response.status), response.status, `the relay stream answered ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onEvent);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.end();
}
```

`src/state/escalation.ts`:

```ts
// src/state/escalation.ts — the relay's app-side state machine: idle | connecting | live | fallback |
// failed. It leases ONE Traccar token through the session layer, posts a delivery receipt for every
// incident addressed to this guardian, and never puts the token in a snapshot. The hook owns connect
// and disconnect; the fallback poll interval lives in the component that renders the panel.
import { useSyncExternalStore } from 'react';
import type { SocketTokenLease } from '../services/traccar/session.ts';
import { currentUser, leaseSocketToken } from '../services/traccar/session.ts';
import {
  RelayClientError, createRelayClient, type LiveIncident, type RelayClient, type RelayClientErrorKind,
} from '../services/relay/client.ts';
import { streamIncidents, type SseEvent } from '../services/relay/stream.ts';
import { translate, type CatalogLang } from '../translations/catalog.ts';

export type EscalationStatus = 'idle' | 'connecting' | 'live' | 'fallback' | 'failed';

export type EscalationSnapshot = {
  status: EscalationStatus;
  kind: RelayClientErrorKind | null;
  message: string | null;
  incidents: LiveIncident[];
  myUserId: number | null;
  lastAckError: string | null;
};

const IDLE: EscalationSnapshot = {
  status: 'idle', kind: null, message: null, incidents: [], myUserId: null, lastAckError: null,
};

const FAILURE_COPY: Record<RelayClientErrorKind, string> = {
  unauthorized: 'relay.failed.unauthorized',
  forbidden: 'relay.failed.forbidden',
  notfound: 'relay.failed.notfound',
  conflict: 'relay.failed.conflict',
  server: 'relay.failed.server',
  timeout: 'relay.failed.timeout',
  badpayload: 'relay.failed.badpayload',
  network: 'relay.failed.network',
};

const KINDS: RelayClientErrorKind[] = ['unauthorized', 'forbidden', 'notfound', 'conflict', 'server', 'timeout', 'badpayload', 'network'];

function kindOf(error: unknown): RelayClientErrorKind {
  const kind = (error as { kind?: unknown } | null)?.kind;
  return typeof kind === 'string' && (KINDS as string[]).includes(kind) ? kind as RelayClientErrorKind : 'network';
}

export type StreamFn = (args: {
  baseUrl: string;
  token: string;
  signal: AbortSignal;
  onEvent: (event: SseEvent) => void;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}) => Promise<void>;

export type EscalationDeps = {
  lang?: CatalogLang;
  baseUrl?: string;
  identity?: () => number | null;
  lease?: (expiresAt?: string | number | Date) => Promise<SocketTokenLease>;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  streamFn?: StreamFn;
  now?: () => number;
};

export function createEscalationController(deps: EscalationDeps = {}) {
  let lang: CatalogLang = deps.lang ?? 'ar';
  let state: EscalationSnapshot = { ...IDLE };
  const listeners = new Set<() => void>();
  let client: RelayClient | null = null;
  let held: SocketTokenLease | null = null;
  let abort: AbortController | null = null;
  const receipts = new Set<string>();
  const opened = new Set<string>();

  const publish = (next: EscalationSnapshot): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  const failed = (kind: RelayClientErrorKind, incidents = state.incidents): EscalationSnapshot => ({
    status: 'failed', kind, message: translate(FAILURE_COPY[kind], lang), incidents,
    myUserId: state.myUserId, lastAckError: null,
  });

  const replace = (incident: LiveIncident): LiveIncident[] =>
    state.incidents.map((item) => (item.id === incident.id ? incident : item));

  const upsert = (incident: LiveIncident): void => {
    publish({ ...state, incidents: replace(incident) });
  };

  const applyList = (incidents: LiveIncident[], status: EscalationStatus): void => {
    publish({ ...state, status, kind: null, message: null, incidents });
  };

  async function sendReceipts(): Promise<void> {
    if (!client || state.myUserId === null) return;
    for (const incident of state.incidents) {
      const mine = incident.deliveries.find((delivery) => delivery.userId === state.myUserId);
      if (mine?.state !== 'sent' || receipts.has(incident.id)) continue;
      receipts.add(incident.id);
      try {
        upsert(await client.delivered(incident.id));
      } catch {
        receipts.delete(incident.id);
      }
    }
  }

  const handleEvent = (event: SseEvent): void => {
    if (event.event !== 'snapshot' && event.event !== 'incident') return;
    let parsed: { incidents?: unknown; incident?: unknown };
    try {
      parsed = JSON.parse(event.data) as typeof parsed;
    } catch {
      return;
    }
    if (event.event === 'snapshot' && Array.isArray(parsed.incidents)) {
      applyList(parsed.incidents as LiveIncident[], 'live');
      void sendReceipts();
      return;
    }
    if (event.event === 'incident' && parsed.incident && typeof parsed.incident === 'object') {
      upsert(parsed.incident as LiveIncident);
    }
  };

  const release = async (): Promise<void> => {
    const heldNow = held;
    held = null;
    if (heldNow !== null) {
      try { await heldNow.release(); } catch { /* the session may already have revoked it */ }
    }
  };

  return {
    getSnapshot: (): EscalationSnapshot => state,
    getServerSnapshot: (): EscalationSnapshot => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setLang(next: CatalogLang): void {
      lang = next;
      if (state.kind !== null) publish(failed(state.kind));
      else if (state.status === 'fallback' && state.message !== null) {
        publish({ ...state, message: translate(FAILURE_COPY.network, lang) });
      }
    },

    async connect(): Promise<EscalationSnapshot> {
      if (state.status === 'live' || state.status === 'connecting' || state.status === 'fallback') return state;
      const identity = deps.identity ?? (() => currentUser()?.id ?? null);
      const myUserId = identity();
      if (myUserId === null) {
        publish(failed('unauthorized', []));
        return state;
      }
      publish({ status: 'connecting', kind: null, message: null, incidents: [], myUserId, lastAckError: null });
      try {
        held = await (deps.lease ?? leaseSocketToken)(new Date((deps.now ?? Date.now)() + 60 * 60 * 1000).toISOString());
      } catch (error) {
        publish(failed(kindOf(error)));
        return state;
      }
      client = createRelayClient({
        baseUrl: deps.baseUrl ?? '/relay',
        token: held.token,
        fetchFn: deps.fetchFn,
      });
      const controller = new AbortController();
      abort = controller;
      try {
        applyList(await client.listIncidents(), 'live');
        await sendReceipts();
      } catch (error) {
        publish(failed(kindOf(error)));
        await release();
        return state;
      }
      const token = held.token;
      void (deps.streamFn ?? streamIncidents)({
        baseUrl: deps.baseUrl ?? '/relay',
        token,
        signal: controller.signal,
        onEvent: handleEvent,
        fetchFn: deps.fetchFn,
      }).catch(() => {
        if (!controller.signal.aborted) {
          publish({ ...state, status: 'fallback', kind: 'network', message: translate(FAILURE_COPY.network, lang) });
        }
      });
      return state;
    },

    async pollOnce(): Promise<EscalationSnapshot> {
      if (!client) {
        publish(failed('network'));
        return state;
      }
      try {
        applyList(await client.listIncidents(), state.status === 'fallback' ? 'fallback' : 'live');
        await sendReceipts();
      } catch (error) {
        publish(failed(kindOf(error)));
      }
      return state;
    },

    async markOpened(id: string): Promise<void> {
      if (!client || opened.has(id)) return;
      opened.add(id);
      try {
        upsert(await client.opened(id));
      } catch {
        opened.delete(id);
      }
    },

    async ack(id: string): Promise<EscalationSnapshot> {
      if (!client) return state;
      try {
        const result = await client.ack(id);
        publish({ ...state, incidents: replace(result.incident), lastAckError: null });
      } catch (error) {
        const kind = kindOf(error);
        publish({ ...state, lastAckError: translate(FAILURE_COPY[kind], lang) });
      }
      return state;
    },

    async disconnect(): Promise<void> {
      abort?.abort();
      abort = null;
      client = null;
      receipts.clear();
      opened.clear();
      const myUserId = state.myUserId;
      publish({ ...IDLE, myUserId });
      await release();
    },
  };
}

export type EscalationController = ReturnType<typeof createEscalationController>;

// `controller.ts` imports `useEffect`, `useRef`, and `useSyncExternalStore` from 'react'. One
// controller per hook instance keeps two mounted panels from sharing a token lease, and the ref
// survives renders. App drives connect/disconnect through `enabled`; this hook only projects the
// store and owns the lease's lifetime.
export function useEscalation(enabled: boolean, lang: CatalogLang = 'ar') {
  const ref = useRef<EscalationController | null>(null);
  if (ref.current === null) ref.current = createEscalationController({ lang });
  const controller = ref.current;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);

  useEffect(() => {
    controller.setLang(lang);
  }, [controller, lang]);

  useEffect(() => {
    if (enabled) void controller.connect();
    else void controller.disconnect();
    return () => { void controller.disconnect(); };
  }, [controller, enabled]);

  return {
    ...snapshot,
    markOpened: controller.markOpened,
    ack: controller.ack,
    pollOnce: controller.pollOnce,
  };
}
```

Add these eight keys to `catalog` (in the same section as the other relay keys Task 8 will extend):

```ts
  // M2 relay failures. Each is a failure in all three languages and none may soften into a claim
  // about the child. The relay's own body is never repeated here.
  'relay.failed.unauthorized': { ar: 'الجلسة غير صالحة — سجّل الدخول من جديد', fr: 'Session invalide — reconnectez-vous', en: 'Session invalid — sign in again' },
  'relay.failed.forbidden': { ar: 'هذا الحساب لا يملك حق الوصول إلى الحادثة', fr: "Ce compte n'a pas accès à l'incident", en: 'This account cannot access the incident' },
  'relay.failed.notfound': { ar: 'الحادثة غير موجودة على المرحل', fr: "L'incident n'existe pas sur le relais", en: 'The relay has no such incident' },
  'relay.failed.conflict': { ar: 'سبق أن أكّد مستلم آخر هذه الحادثة', fr: 'Un autre destinataire a déjà confirmé', en: 'Another recipient already acknowledged this' },
  'relay.failed.server': { ar: 'أخطأ المرحل في معالجة الطلب', fr: 'Le relais a échoué la requête', en: 'The relay failed the request' },
  'relay.failed.timeout': { ar: 'انتهت مهلة الاتصال بالمرحل', fr: 'Délai de connexion au relais dépassé', en: 'The relay took too long to answer' },
  'relay.failed.badpayload': { ar: 'استجابة المرحل غير مفهومة', fr: 'Réponse du relais illisible', en: 'Unreadable response from the relay' },
  'relay.failed.network': { ar: 'لا اتصال بالمرحل — لا بيانات جديدة', fr: 'Relais injoignable — aucune donnée nouvelle', en: 'Relay unreachable — no new data' },
```

- [ ] **Step 4: Run the tests to verify they pass and raise the floor**

Run: `npm run test:app --silent`
Expected: `ℹ tests 248`, `ℹ fail 0`.

Run: `npm run lint`, then `npm run test:relay --silent`.

Set the app floor in `m2-ci.yml` to the printed count.

- [ ] **Step 5: Commit**

```bash
git add src/services/relay src/state/escalation.ts src/translations/catalog.ts tests/app/relay.test.ts .github/workflows/m2-ci.yml
git commit -m "feat(app): stream relay incidents and lease one token for the session"
```

---

### Task 8: Relay panel, incident sheet, catalog, App wiring, and dev proxy

**Files:**
- Create: `src/components/RelayPanel.tsx`
- Create: `src/components/IncidentSheet.tsx`
- Modify: `src/translations/catalog.ts` (UI keys)
- Modify: `src/App.tsx`
- Modify: `vite.config.ts`
- Test: `tests/app/relay-ui.test.ts`

**Interfaces:**
- Consumes: `EscalationSnapshot`, `useEscalation` (Task 7), `LiveIncident` (Task 7), `translate`.
- Produces:
  - `<RelayPanel lang snapshot onAck onOpened />`, `<IncidentSheet lang incident onDismiss />`,
  - `copySheetText(text, clipboard?) → Promise<'copied'|'failed'>`,
  - `useEscalation(enabled, lang)` mounted from App's alerts view,
  - Vite `'/relay'` proxy to `127.0.0.1:8083`.

- [ ] **Step 1: Write the failing tests**

`tests/app/relay-ui.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createAuditLog } from '../../relay/audit.ts';
import { createIncidentStore } from '../../relay/incidents.ts';
import type { Incident } from '../../relay/types.ts';
import { RelayPanel } from '../../src/components/RelayPanel.tsx';
import { IncidentSheet, copySheetText } from '../../src/components/IncidentSheet.tsx';
import { catalog, translate } from '../../src/translations/catalog.ts';
import type { EscalationSnapshot } from '../../src/state/escalation.ts';
import { forwardPayload } from '../relay/helpers.ts';

function incident(overrides: { alarm?: string; type?: string; degraded?: boolean } = {}): Incident {
  const store = createIncidentStore({ audit: createAuditLog(), recipients: [{ userId: 1 }, { userId: 2 }] });
  const created = store.ingest(forwardPayload({ type: overrides.type ?? 'geofenceExit', alarm: overrides.alarm ?? null }))!;
  if (overrides.degraded) store.degradeOpen('silence');
  return store.get(created.id);
}

function snapshot(incidents: Incident[], status: EscalationSnapshot['status'] = 'live'): EscalationSnapshot {
  return { status, kind: null, message: null, incidents, myUserId: 1, lastAckError: null };
}

const readSource = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

test('panel: renders the title, the incident id, and its tier label', () => {
  const html = renderToStaticMarkup(React.createElement(RelayPanel, {
    lang: 'ar', snapshot: snapshot([incident()]), onAck: () => undefined, onOpened: () => undefined,
  }));
  assert.match(html, /التصعيد/);
  assert.match(html, /inc-0001/);
  assert.match(html, /أولوية عالية/);
});

test('panel: an empty list says so and claims nothing', () => {
  const html = renderToStaticMarkup(React.createElement(RelayPanel, {
    lang: 'ar', snapshot: snapshot([]), onAck: () => undefined, onOpened: () => undefined,
  }));
  assert.match(html, /لا حوادث تصعيد بعد/);
  assert.doesNotMatch(html, /بأمان|safe|guaranteed|حيّ/);
});

test('panel: a degraded incident shows the degraded banner', () => {
  const html = renderToStaticMarkup(React.createElement(RelayPanel, {
    lang: 'ar', snapshot: snapshot([incident({ degraded: true })]), onAck: () => undefined, onOpened: () => undefined,
  }));
  assert.match(html, /المصدر صامت منذ 5 دقائق/);
});

test('panel: the delivery table names each recipient state', () => {
  const html = renderToStaticMarkup(React.createElement(RelayPanel, {
    lang: 'ar', snapshot: snapshot([incident()]), onAck: () => undefined, onOpened: () => undefined,
  }));
  assert.match(html, /#1/);
  assert.match(html, /#2/);
  assert.match(html, /أُرسل/);
});

test('panel: a P0 incident opens the sheet automatically, a P1 does not', () => {
  const p0 = renderToStaticMarkup(React.createElement(RelayPanel, {
    lang: 'ar', snapshot: snapshot([incident({ type: 'alarm', alarm: 'sos' })]), onAck: () => undefined, onOpened: () => undefined,
  }));
  assert.match(p0, /role="dialog"/);
  const p1 = renderToStaticMarkup(React.createElement(RelayPanel, {
    lang: 'ar', snapshot: snapshot([incident()]), onAck: () => undefined, onOpened: () => undefined,
  }));
  assert.doesNotMatch(p1, /role="dialog"/);
});

test('sheet: the dialog is labelled and prints the server sheet text', () => {
  const item = { ...incident({ type: 'alarm', alarm: 'sos' }), sheetText: 'ورقة مختبر — AC-17 — بيانات مختبر' };
  const html = renderToStaticMarkup(React.createElement(IncidentSheet, {
    lang: 'ar', incident: item, onDismiss: () => undefined,
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-labelledby="incident-sheet-title"/);
  assert.match(html, /AC-17/);
});

test('copy: a successful write returns copied and passes the exact sheet text', async () => {
  const written: string[] = [];
  const result = await copySheetText('نص الورقة', { writeText: async (value: string) => { written.push(value); } });
  assert.equal(result, 'copied');
  assert.deepEqual(written, ['نص الورقة']);
});

test('copy: a rejected or missing clipboard returns failed and never throws', async () => {
  assert.equal(await copySheetText('x', { writeText: async () => { throw new Error('denied'); } }), 'failed');
  assert.equal(await copySheetText('x', undefined), 'failed');
  assert.equal(await copySheetText('', { writeText: async () => undefined }), 'failed');
});

test('catalog: every relay key exists in all three languages and claims no safety', () => {
  const keys = Object.keys(catalog).filter((key) => key.startsWith('relay.'));
  assert.ok(keys.length >= 24, `relay keys: ${keys.length}`);
  for (const key of keys) {
    for (const lang of ['ar', 'fr', 'en'] as const) {
      assert.ok(catalog[key][lang].trim() !== '', `${key}.${lang} is blank`);
    }
    for (const lang of ['ar', 'fr', 'en'] as const) {
      assert.doesNotMatch(catalog[key][lang], /بأمان|safe|guaranteed|حيّ/i, `${key}.${lang}`);
    }
  }
});

test('app: the alerts view mounts the relay panel and the escalation hook', () => {
  const source = readSource('../../src/App.tsx');
  assert.match(source, /RelayPanel/);
  assert.match(source, /useEscalation\(/);
  assert.match(source, /<RelayPanel/);
});

test('vite: /relay is proxied to the loopback relay port', () => {
  const source = readSource('../../vite.config.ts');
  assert.match(source, /['"]\/relay['"]/);
  assert.match(source, /127\.0\.0\.1:8083/);
});

test('panel: the ack control is a button and carries its copy', () => {
  const html = renderToStaticMarkup(React.createElement(RelayPanel, {
    lang: 'ar', snapshot: snapshot([incident()]), onAck: () => undefined, onOpened: () => undefined,
  }));
  assert.match(html, /<button/);
  assert.match(html, /أؤكد الاستلام/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:app --silent`
Expected: FAIL — `Cannot find module '../../src/components/RelayPanel.tsx'`.

- [ ] **Step 3: Implement the components, catalog keys, App wiring, and proxy**

Add to `catalog`:

```ts
  // M2 relay panel and incident sheet. The panel is a projection of the escalation snapshot; the
  // sheet text itself is rendered by the relay (deterministic Arabic) and only copied here.
  'relay.title': { ar: 'التصعيد', fr: 'Escalade', en: 'Escalation' },
  'relay.subtitle': { ar: 'كل مستلم يُبلَّغ فوراً، ثم ينتقل التأكيد إلى التالي بعد 60 ثانية', fr: 'Chaque destinataire est prévenu, puis la confirmation passe au suivant après 60 s', en: 'Every recipient is notified, then confirmation moves to the next after 60 s' },
  'relay.empty': { ar: 'لا حوادث تصعيد بعد', fr: "Aucun incident d'escalade", en: 'No escalation incidents yet' },
  'relay.status.idle': { ar: 'غير متصل', fr: 'Non connecté', en: 'Not connected' },
  'relay.status.connecting': { ar: 'جارٍ الاتصال بالمرحل…', fr: 'Connexion au relais…', en: 'Connecting to the relay…' },
  'relay.status.live': { ar: 'متصل مباشرة', fr: 'En direct', en: 'Live' },
  'relay.status.fallback': { ar: 'اتصال احتياطي كل 15 ثانية', fr: 'Repli toutes les 15 s', en: 'Fallback every 15 s' },
  'relay.status.failed': { ar: 'تعذّر الاتصال بالمرحل', fr: 'Connexion au relais impossible', en: 'Relay connection failed' },
  'relay.degradedBanner': { ar: 'المصدر صامت منذ 5 دقائق — أُعلن تدهور الحالة وصُعِّدت', fr: 'Source silencieuse depuis 5 min — état dégradé et escaladé', en: 'Source silent for 5 min — degraded and escalated' },
  'relay.state.active': { ar: 'بانتظار تأكيد', fr: 'En attente de confirmation', en: 'Awaiting acknowledgement' },
  'relay.state.assigned': { ar: 'أكّده المستلم #{userId}', fr: 'Confirmé par #{userId}', en: 'Acknowledged by #{userId}' },
  'relay.state.degraded': { ar: 'متدهور — المصدر صامت', fr: 'Dégradé — source silencieuse', en: 'Degraded — source silent' },
  'relay.delivery.sent': { ar: 'أُرسل', fr: 'Envoyé', en: 'Sent' },
  'relay.delivery.delivered': { ar: 'وصل', fr: 'Reçu', en: 'Delivered' },
  'relay.delivery.opened': { ar: 'فُتح', fr: 'Ouvert', en: 'Opened' },
  'relay.ack': { ar: 'أؤكد الاستلام', fr: 'Confirmer la réception', en: 'Acknowledge' },
  'relay.ack.hint': { ar: 'التأكيد ينقل المسؤولية، ولا يغلق الحادثة', fr: 'Confirmer attribue la responsabilité, sans clore l’incident', en: 'Acknowledging assigns responsibility; it does not close the incident' },
  'relay.sheet.title': { ar: 'ورقة الحادث', fr: "Fiche d'incident", en: 'Incident sheet' },
  'relay.sheet.copy': { ar: 'نسخ ورقة الحادث', fr: "Copier la fiche d'incident", en: 'Copy incident sheet' },
  'relay.sheet.copied': { ar: 'نُسخت ورقة الحادث', fr: 'Fiche copiée', en: 'Incident sheet copied' },
  'relay.sheet.copyFailed': { ar: 'تعذّر النسخ — انسخ النص يدوياً', fr: 'Copie impossible — copiez le texte', en: 'Copy failed — copy the text manually' },
  'relay.sheet.dismiss': { ar: 'إغلاق الورقة', fr: 'Fermer la fiche', en: 'Dismiss sheet' },
```

`src/components/IncidentSheet.tsx`:

```tsx
import React, { useState } from 'react';
import { translate, type CatalogLang } from '../translations/catalog.ts';
import type { LiveIncident } from '../services/relay/client.ts';

type Clipboard = { writeText: (value: string) => Promise<void> };

// The sheet text is produced and bounded by the relay. This component only displays and copies it;
// a failed copy says so instead of claiming success (R-M1-14: screen text degrades on data).
export async function copySheetText(text: string, clipboard?: Clipboard): Promise<'copied' | 'failed'> {
  const target = clipboard ?? (globalThis.navigator as { clipboard?: Clipboard } | undefined)?.clipboard;
  if (target === undefined || typeof text !== 'string' || text.trim() === '') return 'failed';
  try {
    await target.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function IncidentSheet({
  lang, incident, onDismiss,
}: { lang: CatalogLang; incident: LiveIncident; onDismiss: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const text = incident.sheetText ?? '';
  const copyLabel = copyState === 'copied'
    ? translate('relay.sheet.copied', lang)
    : copyState === 'failed' ? translate('relay.sheet.copyFailed', lang) : translate('relay.sheet.copy', lang);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="incident-sheet-title" className="rounded-2xl border border-rose-500/40 bg-slate-900 p-4">
      <h2 id="incident-sheet-title" className="text-lg font-bold text-rose-200">{translate('relay.sheet.title', lang)}</h2>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-200">{text}</pre>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => { void copySheetText(text).then(setCopyState); }}
          className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white"
        >
          {copyLabel}
        </button>
        <button type="button" onClick={onDismiss} className="rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-300">
          {translate('relay.sheet.dismiss', lang)}
        </button>
      </div>
    </div>
  );
}
```

`src/components/RelayPanel.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { translate, type CatalogLang } from '../translations/catalog.ts';
import type { EscalationSnapshot } from '../state/escalation.ts';
import { IncidentSheet } from './IncidentSheet.tsx';

export function RelayPanel({
  lang, snapshot, onAck, onOpened,
}: {
  lang: CatalogLang;
  snapshot: EscalationSnapshot;
  onAck: (id: string) => void;
  onOpened: (id: string) => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  // Opened is an explicit display event: every visible incident is reported once, and the P0 sheet
  // below reports its own incident too.
  useEffect(() => {
    for (const incident of snapshot.incidents) onOpened(incident.id);
  }, [snapshot.incidents, onOpened]);

  const sheet = snapshot.incidents.find((incident) => incident.tier === 'P0' && !dismissed.includes(incident.id));
  const degraded = snapshot.incidents.some((incident) => incident.degraded);

  return (
    <section className="space-y-3" aria-label={translate('relay.title', lang)}>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-bold text-slate-100">{translate('relay.title', lang)}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">{translate('relay.subtitle', lang)}</p>
        <p className="mt-2 text-xs text-slate-400">{translate(`relay.status.${snapshot.status}`, lang)}</p>
        {snapshot.message !== null && <p className="mt-1 text-xs text-amber-300">{snapshot.message}</p>}
        {snapshot.lastAckError !== null && <p className="mt-1 text-xs text-amber-300">{snapshot.lastAckError}</p>}
      </div>

      {degraded && (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          {translate('relay.degradedBanner', lang)}
        </p>
      )}

      {sheet !== undefined && (
        <IncidentSheet
          lang={lang}
          incident={sheet}
          onDismiss={() => setDismissed((current) => [...current, sheet.id])}
        />
      )}

      {snapshot.incidents.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-4 text-sm text-slate-400">
          {translate('relay.empty', lang)}
        </p>
      ) : (
        <ul className="space-y-3">
          {snapshot.incidents.map((incident) => (
            <li key={incident.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-400">{incident.id}</span>
                <span className="text-xs text-slate-300">{translate(`alerts.tier.${incident.tier.toLowerCase()}`, lang)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-200">
                {incident.eventType}{incident.alarm !== null ? ` / ${incident.alarm}` : ''}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {translate(`relay.state.${incident.state}`, lang, { userId: incident.assigneeUserId ?? '—' })}
              </p>
              <table className="mt-2 w-full text-right text-xs text-slate-300">
                <tbody>
                  {incident.recipients.map((recipient, index) => {
                    const delivery = incident.deliveries[index];
                    return (
                      <tr key={recipient.userId}>
                        <td className="py-0.5">#{recipient.userId}</td>
                        <td className="py-0.5">{translate(`relay.delivery.${delivery.state}`, lang)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {incident.assigneeUserId === null && (
                <button
                  type="button"
                  onClick={() => onAck(incident.id)}
                  className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                >
                  {translate('relay.ack', lang)}
                </button>
              )}
              <p className="mt-1 text-[11px] text-slate-500">{translate('relay.ack.hint', lang)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

In `src/App.tsx`:

1. Add imports next to the existing component imports:

```tsx
import { RelayPanel } from './components/RelayPanel.tsx';
import { useEscalation } from './state/escalation.ts';
```

2. Next to `const liveAlerts = useLiveAlerts(...)`:

```tsx
  // M2: the escalation channel lives only while the alerts view is open and a guardian is signed in.
  // It shares the session's leased token and never stores it (tests assert the snapshot is clean).
  const escalation = useEscalation(view === 'alerts' && session.status === 'signed-in', lang);
```

3. Replace the alerts-view render block with:

```tsx
        {view === 'alerts' && (
          <>
            <RelayPanel
              lang={lang}
              snapshot={escalation}
              onAck={(id) => { void escalation.ack(id); }}
              onOpened={(id) => { void escalation.markOpened(id); }}
            />
            <AlertsLog
              lang={lang}
              entries={liveAlerts.entries}
              devices={childrenState.children.map((child) => child.device)}
              connection={liveAlerts.connection}
            />
          </>
        )}
```

In `vite.config.ts`, add inside the existing `server` object:

```ts
      // The relay binds loopback; the dev server proxies it so the phone (adb reverse) sees one origin.
      proxy: {
        '/relay': {
          target: 'http://127.0.0.1:8083',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/relay/, ''),
        },
      },
```

- [ ] **Step 4: Run the tests to verify they pass and raise the floor**

Run: `npm run test:app --silent`
Expected: `ℹ tests 260`, `ℹ fail 0`.

Run: `npm run lint` and `npm run build`. If `build` is not runnable on this PC, record it as **NOT RUN locally** and let CI be the verifier; never claim a local build passed.

Set the app floor in `m2-ci.yml` to the printed count.

- [ ] **Step 5: Commit**

```bash
git add src/components/RelayPanel.tsx src/components/IncidentSheet.tsx src/translations/catalog.ts src/App.tsx vite.config.ts tests/app/relay-ui.test.ts .github/workflows/m2-ci.yml
git commit -m "feat(ui): show escalation incidents and copy the SOS sheet"
```

---

### Task 9: AC-4 / AC-5 / AC-6 harnesses, evidence, M2 report, and roadmap

**Files:**
- Create: `tools/m2/lib.mjs`
- Create: `tools/m2/ac4-ack-window.mjs`
- Create: `tools/m2/ac5-silence.mjs`
- Create: `tools/m2/ac6-sos.mjs`
- Test: `lab/tests/m2-harness.test.mjs`
- Create: `lab/report/evidence/013-m2-ac4-ack-window.md`
- Create: `lab/report/evidence/014-m2-ac5-silence.md`
- Create: `lab/report/evidence/015-m2-ac6-sos.md`
- Create: `lab/report/M2-REPORT.md`
- Modify: `docs/superpowers/plans/2026-10-05-roadmap.md`
- Modify: `.github/workflows/m2-ci.yml` (lab floor)

**Interfaces:**
- Consumes: the running relay (`npm run relay`), the running lab Traccar (`LAB_API_URL`), osmand injection (`lab/scripts/post-position.mjs`), and the measured forward shape.
- Produces: three harnesses that print one JSON line and exit 0/1; evidence built only from that output; M2 report with the gate verdict and the NOT RUN list.

- [ ] **Step 1: Write the failing harness tests**

`tools/m2/lib.mjs` (implementation is Step 3; the tests below define it):

`lab/tests/m2-harness.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForward, requireEnv, signForward, waitFor, guardianJson,
} from '../../tools/m2/lib.mjs';

test('m2 harness: an sos forward carries the alarm in both the event and the position', () => {
  const payload = buildForward({ eventId: 7, type: 'alarm', alarm: 'sos', serial: '1234567890HMS8' });
  assert.equal(payload.event.type, 'alarm');
  assert.equal(payload.event.attributes.alarm, 'sos');
  assert.equal(payload.position.attributes.alarm, 'sos');
  assert.equal(payload.device.uniqueId, '1234567890HMS8');
});

test('m2 harness: a geofence forward has no alarm attributes and names the zone', () => {
  const payload = buildForward({ eventId: 8, geofenceName: 'school' });
  assert.equal(payload.event.type, 'geofenceExit');
  assert.deepEqual(payload.position.attributes, {});
  assert.equal(payload.geofence.name, 'school');
});

test('m2 harness: the signature header is exactly what EventForwarderJson sends', () => {
  assert.deepEqual(signForward('fixture-sign'), { 'x-lab-sign': 'fixture-sign' });
});

test('m2 harness: waitFor returns the observed value and its elapsed time', async () => {
  let now = 0;
  const result = await waitFor(
    async () => ({ done: now >= 4000, value: now }),
    { timeoutMs: 10_000, intervalMs: 2000, now: () => now, sleep: async (ms) => { now += ms; } },
  );
  assert.equal(result.ok, true);
  assert.equal(result.value, 4000);
  assert.equal(result.elapsedMs, 4000);
});

test('m2 harness: requireEnv names what is missing and never prints a value', () => {
  assert.throws(() => requireEnv({ LAB_API_URL: 'http://x', LAB_FORWARD_TOKEN: 'fixture-sign' }, ['LAB_API_URL', 'LAB_FORWARD_TOKEN', 'LAB_ADMIN_EMAIL']), (error) => {
    assert.match(error.message, /LAB_ADMIN_EMAIL/);
    assert.doesNotMatch(error.message, /fixture-sign/);
    return true;
  });
});

test('m2 harness: guardianJson sends the bearer and parses a JSON body', async () => {
  const seen = [];
  const result = await guardianJson({
    url: 'http://relay.test',
    token: 'fixture-bearer',
    path: '/incidents/inc-0001',
    fetchFn: async (url, init) => {
      seen.push({ url: String(url), auth: init.headers.authorization });
      return new Response(JSON.stringify({ incident: { id: 'inc-0001' } }), { status: 200 });
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.incident.id, 'inc-0001');
  assert.equal(seen[0].auth, 'Bearer fixture-bearer');
});
```

- [ ] **Step 2: Run the lab tests to verify they fail**

Run: `npm run test:lab --silent`
Expected: FAIL — `Cannot find module '../../tools/m2/lib.mjs'` (and the lab count is still 97).

- [ ] **Step 3: Implement the harness library and the three scripts**

`tools/m2/lib.mjs`:

```js
// tools/m2/lib.mjs — shared, dependency-free helpers for the M2 acceptance harnesses.
// Nothing here prints a credential, an email, or a token: only labels, ids, timestamps, and counts.
export function requireEnv(env, names) {
  const missing = names.filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
  if (missing.length > 0) throw new Error(`missing env: ${missing.join(', ')}`);
}

export function relayUrl(env) {
  return (env.LAB_RELAY_URL ?? 'http://127.0.0.1:8083').replace(/\/+$/, '');
}

export function buildForward({
  eventId, type = 'geofenceExit', alarm = null, fixTime = new Date().toISOString(),
  deviceId = 1, deviceName = 'lab-child-1', serial = '', geofenceName = 'school',
  latitude = 36.7538, longitude = 3.0588, accuracy = 12, speedKnots = 0,
} = {}) {
  const attributes = alarm === null ? {} : { alarm };
  return {
    event: { id: eventId, type, eventTime: fixTime, deviceId, attributes },
    position: {
      fixTime, latitude, longitude, accuracy, speed: speedKnots, course: 0, attributes,
    },
    device: { id: deviceId, name: deviceName, uniqueId: serial },
    geofence: geofenceName === '' ? null : { id: 1, name: geofenceName },
  };
}

export function signForward(token) {
  return { 'x-lab-sign': token };
}

export async function postForward({ url, token, payload, fetchFn = fetch }) {
  const response = await fetchFn(`${url}/alert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...signForward(token) },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.text() };
}

export async function mintToken({ apiUrl, email, password, fetchFn = fetch, lifetimeMs = 3_600_000 }) {
  const expiration = new Date(Date.now() + lifetimeMs).toISOString();
  const basic = Buffer.from(`${email}:${password}`).toString('base64');
  const response = await fetchFn(`${apiUrl}/session/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: `expiration=${encodeURIComponent(expiration)}`,
  });
  if (!response.ok) throw new Error(`mint failed: ${response.status}`);
  return (await response.text()).trim();
}

export async function guardianJson({ url, token, path, method = 'GET', body, fetchFn = fetch }) {
  const response = await fetchFn(`${url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text === '' ? null : JSON.parse(text); } catch { parsed = null; }
  return { status: response.status, body: parsed, text };
}

export async function waitFor(check, {
  timeoutMs, intervalMs = 2000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now(),
} = {}) {
  const started = now();
  let value = null;
  for (;;) {
    const result = await check();
    value = result?.value ?? null;
    if (result?.done) return { ok: true, value, elapsedMs: now() - started };
    if (now() - started > timeoutMs) return { ok: false, value, elapsedMs: now() - started };
    await sleep(intervalMs);
  }
}
```

`tools/m2/ac4-ack-window.mjs`:

```js
// AC-4: with no ack, the relay must contact the NEXT guardian after the 60 s window and keep a
// sequence log. One signed forward; a real wait; no delivery receipt and no ack are sent.
import {
  requireEnv, relayUrl, buildForward, postForward, mintToken, guardianJson, waitFor,
} from './lib.mjs';

function fail(message) { console.error(`AC-4 FAIL: ${message}`); process.exit(1); }

const env = process.env;
try {
  requireEnv(env, ['LAB_FORWARD_TOKEN', 'LAB_API_URL', 'LAB_ADMIN_EMAIL', 'LAB_ADMIN_PASSWORD']);
} catch (error) { fail(error.message); }

const ids = String(env.LAB_RELAY_RECIPIENT_IDS ?? '').split(',').map((part) => Number(part.trim()))
  .filter((id) => Number.isInteger(id) && id > 0);
if (ids.length < 2) fail('LAB_RELAY_RECIPIENT_IDS must name at least two recipients');

const url = relayUrl(env);
const payload = buildForward({
  eventId: Date.now(), type: 'geofenceExit', serial: env.LAB_DEVICE_UNIQUE_ID ?? '',
});
const startedAt = Date.now();
const posted = await postForward({ url, token: env.LAB_FORWARD_TOKEN, payload });
if (posted.status !== 202) fail(`forward answered ${posted.status}`);
const { incidentId } = JSON.parse(posted.body);

const bearer = await mintToken({ apiUrl: env.LAB_API_URL, email: env.LAB_ADMIN_EMAIL, password: env.LAB_ADMIN_PASSWORD });
const observed = await waitFor(async () => {
  const result = await guardianJson({ url, token: bearer, path: `/incidents/${incidentId}` });
  if (result.status !== 200) return { done: false, value: null };
  const incident = result.body.incident;
  const escalated = incident.currentRecipientUserId !== ids[0];
  return { done: escalated, value: incident };
}, { timeoutMs: 90_000, intervalMs: 2_000 });

const incident = observed.value;
const expired = incident?.timeline?.find((entry) => entry.action === 'window_expired');
const hasAck = incident?.timeline?.some((entry) => entry.action === 'ack') ?? null;
const recipients = incident?.recipients?.map((recipient) => recipient.userId) ?? [];
const elapsedMs = Date.now() - startedAt;
const ok = observed.ok
  && incident?.currentRecipientUserId === ids[1]
  && elapsedMs >= 60_000 && elapsedMs <= 75_000
  && expired?.detail?.atEnd === false
  && hasAck === false
  && recipients.length >= 2
  && incident.deliveries.every((delivery) => delivery.sentAt === incident.createdAt);

console.log(JSON.stringify({
  ac: 'AC-4', incidentId, recipients, contactedSecond: incident?.currentRecipientUserId ?? null,
  elapsedMs, windowExpiredAtEnd: expired?.detail?.atEnd ?? null, anyAck: hasAck,
  windowsSentAtCreatedAt: incident?.deliveries?.every((delivery) => delivery.sentAt === incident.createdAt) ?? null,
  verdict: ok ? 'PASS' : 'FAIL',
}));
process.exit(ok ? 0 : 1);
```

`tools/m2/ac5-silence.mjs`:

```js
// AC-5: five minutes without a fresh fix is itself an alarm. Inject one real osmand position, open a
// P1 through a signed forward, then inject nothing and wait. The relay's own poller must degrade.
import { postPosition } from '../../lab/scripts/post-position.mjs';
import {
  requireEnv, relayUrl, buildForward, postForward, mintToken, guardianJson, waitFor,
} from './lib.mjs';

function fail(message) { console.error(`AC-5 FAIL: ${message}`); process.exit(1); }

const env = process.env;
try {
  requireEnv(env, [
    'LAB_FORWARD_TOKEN', 'LAB_API_URL', 'LAB_ADMIN_EMAIL', 'LAB_ADMIN_PASSWORD',
    'LAB_DEVICE_UNIQUE_ID',
  ]);
} catch (error) { fail(error.message); }

const deviceId = Number(env.LAB_RELAY_DEVICE_ID ?? '1');
const osmand = {
  host: env.LAB_OSMAND_HOST ?? '127.0.0.1',
  port: Number(env.LAB_OSMAND_PORT ?? '5055'),
  uniqueId: env.LAB_DEVICE_UNIQUE_ID,
};
try {
  await postPosition({
    host: osmand.host, port: osmand.port, uniqueId: osmand.uniqueId,
    reading: { latitude: 36.7538, longitude: 3.0588, accuracy: 12, speedKnots: 0 },
    absoluteTimeSec: Math.floor(Date.now() / 1000),
  });
} catch (error) { fail(`osmand injection failed: ${error.message}`); }

const url = relayUrl(env);
const startedAt = Date.now();
const payload = buildForward({
  eventId: Date.now(), type: 'geofenceExit', deviceId, serial: osmand.uniqueId,
  fixTime: new Date().toISOString(),
});
const posted = await postForward({ url, token: env.LAB_FORWARD_TOKEN, payload });
if (posted.status !== 202) fail(`forward answered ${posted.status}`);
const { incidentId } = JSON.parse(posted.body);

const bearer = await mintToken({ apiUrl: env.LAB_API_URL, email: env.LAB_ADMIN_EMAIL, password: env.LAB_ADMIN_PASSWORD });
const observed = await waitFor(async () => {
  const result = await guardianJson({ url, token: bearer, path: `/incidents/${incidentId}` });
  if (result.status !== 200) return { done: false, value: null };
  return { done: result.body.incident.degraded === true, value: result.body.incident };
}, { timeoutMs: 360_000, intervalMs: 5_000 });

const incident = observed.value;
const degraded = incident?.timeline?.find((entry) => entry.action === 'degraded');
const escalation = incident?.timeline?.find((entry) => entry.action === 'escalation');
const elapsedMs = Date.now() - startedAt;
const ok = observed.ok
  && elapsedMs >= 300_000 && elapsedMs <= 360_000
  && degraded?.detail?.reason === 'silence'
  && escalation?.detail?.reason === 'silence';

console.log(JSON.stringify({
  ac: 'AC-5', incidentId, elapsedMs, degraded: incident?.degraded ?? null,
  degradedReason: degraded?.detail?.reason ?? null,
  escalationReason: escalation?.detail?.reason ?? null,
  verdict: ok ? 'PASS' : 'FAIL',
}));
process.exit(ok ? 0 : 1);
```

`tools/m2/ac6-sos.mjs`:

```js
// AC-6: SOS → P0 and a sheet reachable in under 10 seconds. On-phone display and copy are NOT RUN
// here; this measures the relay-side path only.
import {
  requireEnv, relayUrl, buildForward, postForward, mintToken, guardianJson, waitFor,
} from './lib.mjs';

function fail(message) { console.error(`AC-6 FAIL: ${message}`); process.exit(1); }

const env = process.env;
try {
  requireEnv(env, ['LAB_FORWARD_TOKEN', 'LAB_API_URL', 'LAB_ADMIN_EMAIL', 'LAB_ADMIN_PASSWORD']);
} catch (error) { fail(error.message); }

const url = relayUrl(env);
const payload = buildForward({
  eventId: Date.now(), type: 'alarm', alarm: 'sos', serial: env.LAB_DEVICE_UNIQUE_ID ?? '',
});
const startedAt = Date.now();
const posted = await postForward({ url, token: env.LAB_FORWARD_TOKEN, payload });
if (posted.status !== 202) fail(`forward answered ${posted.status}`);
const { incidentId } = JSON.parse(posted.body);

const bearer = await mintToken({ apiUrl: env.LAB_API_URL, email: env.LAB_ADMIN_EMAIL, password: env.LAB_ADMIN_PASSWORD });
const observed = await waitFor(async () => {
  const result = await guardianJson({ url, token: bearer, path: `/incidents/${incidentId}/sheet` });
  const ok = result.status === 200 && result.text.includes('AC-17') && result.text.includes('بيانات مختبر');
  return { done: ok, value: { status: result.status, text: result.text } };
}, { timeoutMs: 10_000, intervalMs: 250 });

const read = await guardianJson({ url, token: bearer, path: `/incidents/${incidentId}` });
const incident = read.body?.incident ?? null;
const elapsedMs = Date.now() - startedAt;
const ok = observed.ok && incident?.tier === 'P0' && elapsedMs < 10_000;

console.log(JSON.stringify({
  ac: 'AC-6', incidentId, tier: incident?.tier ?? null, sheetStatus: observed.value?.status ?? null,
  elapsedMs, onDeviceCopy: 'NOT RUN', verdict: ok ? 'PASS' : 'FAIL',
}));
process.exit(ok ? 0 : 1);
```

- [ ] **Step 4: Run the lab tests and raise the floor**

Run: `npm run test:lab --silent`
Expected: `ℹ tests 103`, `ℹ fail 0`.

Set the lab floor in `m2-ci.yml` to the printed count (leave `m1-ci.yml` at 97).

- [ ] **Step 5: Start the relay and run the three acceptance harnesses**

Start the lab and relay in two shells. The env file is read by path only; its values are never printed:

```bash
set -a; source lab/traccar/fanout.env; set +a
export LAB_RELAY_RECIPIENT_IDS=1,2
export LAB_RELAY_URL=http://127.0.0.1:8083
export LAB_RELAY_WINDOW_MS=60000
npm run relay
```

Then, in a second shell with the same env:

```bash
set -a; source lab/traccar/fanout.env; set +a
export LAB_RELAY_RECIPIENT_IDS=1,2
export LAB_RELAY_URL=http://127.0.0.1:8083
node tools/m2/ac4-ack-window.mjs | tee lab/logs/m2-ac4.jsonl
node tools/m2/ac5-silence.mjs | tee lab/logs/m2-ac5.jsonl
node tools/m2/ac6-sos.mjs | tee lab/logs/m2-ac6.jsonl
```

If any harness exits 1, stop and fix the relay — do not write evidence for a failing run. If the lab is unreachable, record the harness as **NOT RUN** with the exact error in the M2 report; never mark the gate met.

- [ ] **Step 6: Write evidence from the measured output only**

For each harness, create the evidence file with: the command line (no values), the printed JSON verbatim, the observed numbers, and the NOT RUN list. Example shape for `lab/report/evidence/013-m2-ac4-ack-window.md`:

```markdown
# AC-4 — ack window escalates to the next guardian

- Command: `node tools/m2/ac4-ack-window.mjs` (env read by path from `lab/traccar/fanout.env`; values never printed)
- Run at: <ISO instant copied from the run>
- Measured output: `<the harness JSON line, verbatim>`

| Check | Measured | Required |
|---|---|---|
| Elapsed from signed forward to the second contact | <elapsedMs> ms | 60 000–75 000 ms |
| `window_expired` at end of ladder | <false> | false |
| Ack present | <false> | false |
| Every recipient sent at `createdAt` | <true> | true |

**Verdict:** PASS (measured) / FAIL / NOT RUN.

**NOT RUN:** on-phone UI, real guardian delivery channels, AC-13 window tuning (180 s / 900 s).
```

`014-m2-ac5-silence.md` and `015-m2-ac6-sos.md` follow the same shape with their own checks. `015` must state `onDeviceCopy: NOT RUN` and that only the relay-side sheet path was measured.

- [ ] **Step 7: Write `lab/report/M2-REPORT.md`**

Include, in this order:
1. Gate verdict with the three measured JSON lines (or NOT RUN + exact blocker).
2. A table of what was measured vs the §8 budgets (source→server, server→first delivery, full escalation ≤5 min, degraded after 5 min).
3. The design rulings actually shipped (parallel send, window basis, ack assigns, silence final, tier narrowing).
4. **NOT RUN** list verbatim: AC-13 window tuning; AC-14 named guardian, quorum-of-2, reopen; AC-15 single-guardian time escalation; AC-16 nearest guardian; AC-17 family verification word; AC-18; on-device banner/sheet/copy; real SOS hardware; mail/Telegram/FCM/SMS/voice delivery; real GPS source; multi-child/multi-device silence; 24/7/public-network operation; any public exposure.
5. CI note: Node 22 run URL/ID added **after** the workflow completes, in a follow-up docs commit, timestamped with the command that reproduced it. Never put a run ID in the same commit that triggers it.

- [ ] **Step 8: Close the roadmap row**

In `docs/superpowers/plans/2026-10-05-roadmap.md`, change the M2 row to done and add the measured evidence links and the NOT RUN list. Do not mark M3 as started; that needs a new owner decision.

- [ ] **Step 9: Commit**

```bash
git add tools/m2 lab/tests/m2-harness.test.mjs lab/report/evidence/013-m2-ac4-ack-window.md lab/report/evidence/014-m2-ac5-silence.md lab/report/evidence/015-m2-ac6-sos.md lab/report/M2-REPORT.md docs/superpowers/plans/2026-10-05-roadmap.md .github/workflows/m2-ci.yml
git commit -m "test(m2): measure AC-4/AC-5/AC-6 and close the M2 gate"
```

---

## Self-Review

Run this before handing the plan to execution:

- **Spec coverage:** AC-4 → Tasks 2, 4, 9; AC-5 → Tasks 2, 5, 9; AC-6 → Tasks 3, 4, 8, 9; §5.7 sent/delivered/opened → Tasks 2, 3, 4; §5.10 ack assigns not closes → Task 2; §5.12 single guardian → Task 2 (last-recipient `atEnd`); §5.13 family word → sheet AC-17 line, marked not implemented; §8 budgets → evidence tables; §13 AC-13..18 → explicit NOT RUN.
- **Placeholder scan:** every code step contains runnable code; the only bracketed values are evidence numbers that must come from a measured run, and the plan says so at each site.
- **Type consistency:** `Incident`, `Delivery`, `IncidentStore`, `RelayClientError`, `LiveIncident`, `EscalationSnapshot`, `SocketTokenLease` are defined once and reused with the same field names in every later task.
- **Floor discipline:** every task names the expected printed count and raises the floor in the same commit; `tests 0` can never pass a floor.
- **Honesty:** every unmeasured path in this plan is labeled NOT RUN in both the task and the report template.




---

