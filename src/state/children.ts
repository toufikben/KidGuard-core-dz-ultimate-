// src/state/children.ts — the children the SERVER says this guardian may see, and the guardian links
// on their devices (Task 9, R-M1-21). Same shape as src/state/session.ts: a React-free controller
// (`createChildrenController`) plus thin React bindings (`useChildren`, `refreshChildren`), so every
// decision below is testable without a DOM.
//
// What this layer owns and what it refuses:
//  - The child list is `GET /api/devices` alone. The server decides visibility (a viewer only
//    receives devices shared with them), so there is no client-side union, no local device table and
//    no reading of `kidguard_*` storage. A device that is not in the answer does not exist here.
//  - A label is server data: «from {device.name}, {formatPositionLabel}». The device name is never
//    `alertPolicy.childName` (a local setting), and a device the server did not name is announced as
//    unnamed — the `uniqueId` is never used as a name, and only its last four characters may appear
//    on screen (R-M1-26).
//  - Freshness is the three measured values from positions.ts, plus `null` meaning "no usable
//    reading". A conflicting pair of sources is NOT resolved by picking one: readings, label and
//    freshness all become the no-data state, exactly as §3 requires.
//  - The admin bit is read by `identity()` on EVERY assign/unassign call — never cached. A viewer is
//    refused before any POST/DELETE. The module also never talks to a second request path: every
//    request rides the Task 3 client (`client.removeWithBody`, not a `.delete` that does not exist).
//  - `unassignGuardian` sends `{ userId, deviceId }` as a JSON body because the first key of a
//    Traccar permission map is the owner (Permission.java:54-66, R-M1-20) and because the measured
//    wire only revokes in that form: DELETE /permissions with query params is a 400 NPE, while a
//    JSON body answers 204 (005-fanout §6/§6b, R-M1-24). Reversing the pair names a different table.
import { useSyncExternalStore } from 'react';
import { TraccarError, type TraccarClient } from '../services/traccar/client.ts';
import { activeClient, whoAmI } from '../services/traccar/session.ts';
import { createPermissionService, notAdministrator } from '../services/traccar/permissions.ts';
import {
  ageSeconds,
  formatPositionLabel,
  freshnessOf,
  noDataLabel,
  resolveSourceReadings,
  type Freshness,
} from '../services/traccar/positions.ts';
import type { ServerDevice, ServerPosition, ServerUser } from '../services/traccar/types.ts';
import { translate, type CatalogLang } from '../translations/catalog.ts';

// null is the fourth state the screen may show: there is no reading at all. It is not a freshness
// value positions.ts can produce, and it must not be turned into 'silent' — 'silent' means the
// server reported an old fix, while null means it reported nothing usable.
export type ChildFreshness = Freshness | null;

export type Child = {
  device: ServerDevice;
  readings: ServerPosition | null;
  label: string;
  freshness: ChildFreshness;
};

export type ChildrenSnapshot = {
  loading: boolean;
  error: string | null;
  children: Child[];
};

export type ChildrenController = {
  getSnapshot: () => ChildrenSnapshot;
  getServerSnapshot: () => ChildrenSnapshot;
  subscribe: (listener: () => void) => () => void;
  setLang: (lang: CatalogLang) => void;
  refresh: () => Promise<ChildrenSnapshot>;
  assignGuardian: (deviceId: number, userId: number) => Promise<void>;
  unassignGuardian: (deviceId: number, userId: number) => Promise<void>;
  listGuardiansFor: (deviceId: number) => Promise<ServerUser[]>;
};

// Dependencies a test may inject. `identity` is always the SANCTIONED source of the admin bit
// (whoAmI in production); it is called on every write, never stored.
export type ChildrenDeps = {
  client?: TraccarClient | null;
  identity?: () => Promise<ServerUser>;
};

const EMPTY: ChildrenSnapshot = { loading: false, error: null, children: [] };

// The name every screen shows for one device. The name is the server's; a device the server did not
// name is announced as unnamed — the uniqueId is NEVER substituted, and no local childName exists.
export function deviceDisplayName(device: ServerDevice, lang: CatalogLang): string {
  const name = typeof device.name === 'string' ? device.name.trim() : '';
  return name !== '' ? name : translate('children.unnamedDevice', lang);
}

// One device + its latest positions ⇒ the one Child the screens may show. Broken timestamps and
// conflicts degrade into the no-data sentence; they never throw and never pick a source silently.
function buildChild(device: ServerDevice, positions: ServerPosition[], at: number, lang: CatalogLang): Child {
  const resolved = resolveSourceReadings(positions);
  const chosen = resolved.chosen;
  if (resolved.conflict || chosen === null) {
    return { device, readings: null, label: noDataLabel(lang), freshness: null };
  }
  let age: number;
  try {
    age = ageSeconds(chosen, at);
  } catch {
    // An unreadable (or impossibly future) fixTime is not a usable reading: the map may not draw it.
    return { device, readings: null, label: noDataLabel(lang), freshness: null };
  }
  return {
    device,
    readings: chosen,
    label: translate('children.sourceFromDevice', lang, {
      source: deviceDisplayName(device, lang),
      reading: formatPositionLabel(chosen, at, lang),
    }),
    freshness: freshnessOf(age),
  };
}

function isServerDevice(value: unknown): value is ServerDevice {
  const row = value as Partial<ServerDevice> | null;
  return row !== null && typeof row === 'object' && Number.isInteger(row.id) && Number(row.id) > 0;
}

// The whole server read: the visible devices, then the latest positions for each. Array.isArray is
// checked before use: a non-list answer is a bad payload, not an empty list (the empty list is a true
// answer — "the server shared nothing with this account").
async function loadChildren(
  client: TraccarClient,
  lang: CatalogLang,
  now: () => number,
): Promise<Child[]> {
  const devices = await client.get<ServerDevice[]>('/devices');
  if (!Array.isArray(devices)) {
    throw new TraccarError('badpayload', 200, 'the server returned no device list');
  }
  const visible = devices.filter(isServerDevice);
  return Promise.all(visible.map(async (device) => {
    const positions = await client.get<ServerPosition[]>('/positions', { deviceId: device.id });
    if (!Array.isArray(positions)) {
      throw new TraccarError('badpayload', 200, 'the server returned no position list');
    }
    return buildChild(device, positions, now(), lang);
  }));
}

function failureSnapshot(lang: CatalogLang): ChildrenSnapshot {
  // One catalog sentence. The server body never reaches the screen (a 401 body can name the account,
  // and a 500 body is server noise, not a fact about the child).
  return { loading: false, error: translate('children.loadFailed', lang), children: [] };
}

export function createChildrenController({
  client,
  identity = whoAmI,
  lang = 'ar',
  now = Date.now,
}: {
  client: TraccarClient;
  identity?: () => Promise<ServerUser>;
  lang?: CatalogLang;
  now?: () => number;
}): ChildrenController {
  let currentLang: CatalogLang = lang;
  let state: ChildrenSnapshot = { ...EMPTY };
  const listeners = new Set<() => void>();

  const publish = (next: ChildrenSnapshot) => {
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => state,
    getServerSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setLang: (next) => { currentLang = next; },
    async refresh() {
      publish({ ...state, loading: true });
      try {
        const children = await loadChildren(client, currentLang, now);
        publish({ loading: false, error: null, children });
      } catch {
        // A failed read clears the list: keeping the previous children would show a stale list as
        // if it were the server's current answer.
        publish(failureSnapshot(currentLang));
      }
      return state;
    },
    assignGuardian: (deviceId, userId) => assignWith(client, identity, deviceId, userId),
    unassignGuardian: (deviceId, userId) => unassignWith(client, identity, deviceId, userId),
    listGuardiansFor: (deviceId) => readGuardiansFor(client, deviceId),
  };
}

// ── guardian links ───────────────────────────────────────────────────────────────────────────────

// The admin answer is asked EVERY time (R-M1-8): a cached flag would survive a server-side demotion.
// Identity comes first, so a viewer never reaches the network for a write at all.
async function requireAdmin(identity: () => Promise<ServerUser>): Promise<void> {
  const me = await identity();
  if (me.admin !== true) throw notAdministrator();
}

async function assignWith(
  client: TraccarClient,
  identity: () => Promise<ServerUser>,
  deviceId: number,
  userId: number,
): Promise<void> {
  await requireAdmin(identity);
  // Owner-first grant {"userId":…,"deviceId":…}; the permission service skips an existing link.
  await createPermissionService({ client }).linkUserToDevice(userId, deviceId);
}

async function unassignWith(
  client: TraccarClient,
  identity: () => Promise<ServerUser>,
  deviceId: number,
  userId: number,
): Promise<void> {
  await requireAdmin(identity);
  // Owner first (R-M1-20) inside a JSON body: query params were measured 400/NPE, the body 204 (R-M1-24).
  await client.removeWithBody('/permissions', { userId, deviceId });
}

// The user id behind one permission row. Live rows carry UPPERCASE columns ({USERID:…}); a
// lower-case-only reader would report "no guardian" for a link that exists.
function rowUserId(row: Record<string, unknown>): number | null {
  const value = Number(row.userId ?? row.USERID);
  return Number.isInteger(value) && value > 0 ? value : null;
}

// Only the fields the app is allowed to show; a name is copied only when the server sent one. A
// link whose user is absent from /users is skipped, never filled in from anywhere else.
function toServerUser(value: unknown): ServerUser | null {
  const row = (value ?? {}) as Record<string, unknown>;
  const id = Number(row.id);
  const email = typeof row.email === 'string' ? row.email.trim() : '';
  if (!Number.isInteger(id) || id <= 0 || email === '') return null;
  const user: ServerUser = { id, email };
  if (typeof row.name === 'string' && row.name !== '') user.name = row.name;
  if (typeof row.administrator === 'boolean') user.admin = row.administrator;
  else if (typeof row.admin === 'boolean') user.admin = row.admin;
  return user;
}

async function readGuardiansFor(client: TraccarClient, deviceId: number): Promise<ServerUser[]> {
  // User-first: the first key names the relation table `tc_user_device` (there is no tc_device_user),
  // and the sharing direction was measured as userId=N&deviceId=0 (005 §2, R-M1-25).
  const rows = await client.get<Record<string, unknown>[]>('/permissions', { userId: 0, deviceId });
  if (!Array.isArray(rows)) {
    throw new TraccarError('badpayload', 200, 'the server returned no permission list');
  }
  const ids: number[] = [];
  for (const row of rows) {
    const id = rowUserId(row);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  const users = await client.get<ServerUser[]>('/users');
  if (!Array.isArray(users)) {
    throw new TraccarError('badpayload', 200, 'the server returned no user list');
  }
  const byId = new Map<number, ServerUser>();
  for (const raw of users) {
    const user = toServerUser(raw);
    if (user !== null) byId.set(user.id, user);
  }
  const guardians: ServerUser[] = [];
  for (const id of ids) {
    const user = byId.get(id);
    if (user !== undefined) guardians.push(user);
  }
  return guardians;
}

function clientOrThrow(deps: ChildrenDeps): TraccarClient {
  const client = deps.client ?? activeClient();
  if (!client) throw new TraccarError('unauthorized', 401, 'sign in before reading or changing guardians');
  return client;
}

// Readable by any signed-in account; the server decides whose links are visible.
export function listGuardiansFor(deviceId: number, deps: ChildrenDeps = {}): Promise<ServerUser[]> {
  return readGuardiansFor(clientOrThrow(deps), deviceId);
}

// Every user `/users` returns, whitelisted. The contacts screen offers these as candidates; the
// server still owns who may be linked.
export async function listServerUsers(deps: ChildrenDeps = {}): Promise<ServerUser[]> {
  const client = clientOrThrow(deps);
  const rows = await client.get<ServerUser[]>('/users');
  if (!Array.isArray(rows)) {
    throw new TraccarError('badpayload', 200, 'the server returned no user list');
  }
  return rows.map(toServerUser).filter((user): user is ServerUser => user !== null);
}

export async function assignGuardian(
  deviceId: number,
  userId: number,
  deps: ChildrenDeps = {},
): Promise<void> {
  const identity = deps.identity ?? whoAmI;
  const client = clientOrThrow(deps);
  await assignWith(client, identity, deviceId, userId);
}

export async function unassignGuardian(
  deviceId: number,
  userId: number,
  deps: ChildrenDeps = {},
): Promise<void> {
  const identity = deps.identity ?? whoAmI;
  const client = clientOrThrow(deps);
  await unassignWith(client, identity, deviceId, userId);
}

// §5.12: one guardian is a fully usable configuration — there is no voting, escalation is time-based.
// `single` is exactly count === 1; it is never a claim that the child is watched by anyone.
export function guardianSummary(guardians: ServerUser[]): { count: number; single: boolean } {
  const count = guardians.length;
  return { count, single: count === 1 };
}

// The selection rule App.tsx uses: the chosen device id, otherwise the first visible child, otherwise
// no child at all (and then ZonesScreen is not rendered — R-M1-21).
export function pickSelectedChild(children: Child[], selectedId: number | null): Child | null {
  return children.find((child) => child.device.id === selectedId) ?? children[0] ?? null;
}

// ── the app-wide store ──────────────────────────────────────────────────────────────────────────

let moduleState: ChildrenSnapshot = { ...EMPTY };
let moduleLang: CatalogLang = 'ar';
let generation = 0;
const moduleListeners = new Set<() => void>();

function publishModule(next: ChildrenSnapshot) {
  moduleState = next;
  for (const listener of moduleListeners) listener();
}

export function setChildrenLang(lang: CatalogLang): void {
  moduleLang = lang;
}

// Clears the list without a request — used when the session ends. Stale server children must not
// outlive the session that was allowed to see them.
export function clearChildren(lang: CatalogLang = moduleLang): ChildrenSnapshot {
  moduleLang = lang;
  generation += 1;
  publishModule({ ...EMPTY });
  return moduleState;
}

// Called by App when `session.status === 'signed-in'` (and on a language change). No client means no
// session: the store clears instead of keeping the previous guardian's children. A generation counter
// makes the last call win, so a slow earlier response cannot overwrite a newer one.
export async function refreshChildren(lang: CatalogLang = moduleLang): Promise<ChildrenSnapshot> {
  moduleLang = lang;
  const client = activeClient();
  const ticket = ++generation;
  if (!client) {
    publishModule({ ...EMPTY });
    return moduleState;
  }
  publishModule({ ...moduleState, loading: true });
  try {
    const children = await loadChildren(client, moduleLang, Date.now);
    if (ticket === generation) publishModule({ loading: false, error: null, children });
  } catch {
    if (ticket === generation) publishModule(failureSnapshot(moduleLang));
  }
  return moduleState;
}

export function useChildren(): ChildrenSnapshot {
  return useSyncExternalStore(
    (listener) => {
      moduleListeners.add(listener);
      return () => { moduleListeners.delete(listener); };
    },
    () => moduleState,
    () => moduleState,
  );
}
