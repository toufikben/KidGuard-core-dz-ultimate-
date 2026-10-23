// src/services/traccar/session.ts — sign-in, identity, sign-out, and the long-lived socket token.
//
// Three rulings decide this whole file, and all three come from measurement or from the 6.16.0
// source, not from memory:
//  - R-M1-8: `GET /api/session` under a Basic header alone is a MEASURED 404, not a 401
//    (SessionResource.java:78-105 accepts `?token=` or an HTTP session and throws NOT_FOUND for
//    anything else; lab/report/evidence/007-app-api-surface.md §6.1). So identity has exactly two
//    sanctioned sources: the User object `POST /api/session` returns at sign-in, and
//    `GET /api/session?token=<minted token>` (both measured 200 in 007 §9). A third — "if it 404s,
//    assume the local guardian" — is forbidden, so this module has no local fallback to fall into.
//  - The session routes are `@FormParam`, not JSON (SessionResource.java:119-141,150-173), so every
//    one of them rides the Task 3 client's form path. There is no second request path here: same
//    timeout, same abort, same secret-free errors.
//  - Nothing a guardian typed is ever persisted. The password pair lives only inside the client this
//    module builds, in memory, and is dropped before sign-out's own requests go out. No browser
//    storage is named in this file (a test spies on both storages and asserts the session layer
//    wrote zero records), nothing is logged, and every message this file can produce is a
//    TraccarError whose text is a status code or a phrase written here — never a credential.
import { createTraccarClient, TraccarError, type TraccarClient } from './client.ts';
import type { ServerUser } from './types.ts';
import { translate, type CatalogLang } from '../../translations/catalog.ts';

// TokenManager.java:39 gives an unspecified token seven days and SessionResource.java:154-157 only
// narrows that to the account's own expiry. A guardians' app that can be closed mid-session must not
// leave a week-long credential behind, so an expiration is always sent, defaulting to one hour;
// Task 10 passes a longer instant when it opens the socket.
const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

// A version string is whatever the server chose to send. It is printed inside these bounds only;
// anything else reads as unknown (R-M1-14: screen text degrades on data, it never throws and never
// repeats a server's noise as fact).
const MAX_SERVER_VERSION_LENGTH = 64;

type ActiveSession = { client: TraccarClient; user: ServerUser; token: string | null };

// The one in-memory session record — the only session state this app keeps.
let active: ActiveSession | null = null;

// The identity the screens may show, or null when nobody is signed in. Never the password, never
// the token: the object below is the whitelisted shape produced by toServerUser.
export function currentUser(): ServerUser | null {
  return active?.user ?? null;
}

// The client the signed-in guardian's requests ride — the SAME Task 3 client `signIn` built, so a
// zone write goes out under the identical timeout, abort and secret-free error path as every other
// call. It is exposed as an object, never destructured: the password stays closed over inside it and
// the minted token is not a property of it, so nothing a screen could render leaks a credential. A
// screen that needs to talk to the server (Task 8's zone service) takes this; when nobody is signed in
// there is no client and it returns null rather than a client pointed at nothing.
export function activeClient(): TraccarClient | null {
  return active?.client ?? null;
}

// Drops the local record without asking the server anything. This is the recovery path the state
// layer takes when an identity check proves the session is gone; it is NOT a logout, because the
// cookie session and any minted token are still alive on the server — signOut() is the route that
// cancels them.
export function resetSession(): void {
  active = null;
}

// The only User shape this app is allowed to hold. Traccar serialises `password` and `totpKey` in
// the very object POST /session returns (the field list measured in 007 §1), so the raw response is
// never handed onward: this copies out the four fields the app shows and drops every other key,
// including the ones whose names are secrets.
function toServerUser(value: unknown): ServerUser {
  const source = (value ?? {}) as Record<string, unknown>;
  const id = Number(source.id);
  const email = typeof source.email === 'string' ? source.email.trim() : '';
  if (!Number.isFinite(id) || id <= 0 || email === '') {
    // A half identity is worse than none: Task 8 gates admin writes and Task 10 gates the socket on
    // whoAmI(), so a User we cannot name must fail here rather than become a confident screen state.
    throw new TraccarError('badpayload', 200, 'the server returned a User with no usable id or email');
  }
  const user: ServerUser = { id, email };
  if (typeof source.name === 'string' && source.name !== '') user.name = source.name;
  // 007 §1 measured the live 6.16.0 User JSON: the admin bit is `administrator`, never `admin`.
  // Reading `admin` silently judged every real administrator a viewer and closed the Task 8 gate —
  // caught by the live AC-2 run (2026-10-23). The parsed shape this app holds keeps the short name.
  if (typeof source.administrator === 'boolean') user.admin = source.administrator;
  return user;
}

export function signIn({
  baseUrl, email, password, code, timeoutMs,
}: { baseUrl: string; email: string; password: string; code?: number; timeoutMs?: number }): Promise<ServerUser> {
  // The Credentials object is built from the two fields the guardian typed and is referenced only by
  // the client returned above; nothing here stores it separately.
  const client = createTraccarClient({ baseUrl, credentials: { email, password }, timeoutMs });
  // SessionResource.java:119-122 takes email/password/code as form fields; `code` is the TOTP, sent
  // only when the caller has one (a 401 + `WWW-Authenticate: TOTP` is when the screen collects it).
  const form: Record<string, string | number> = { email, password };
  if (code !== undefined) form.code = code;
  return client.postForm<unknown>('/session', form).then((raw) => {
    const user = toServerUser(raw);
    active = { client, user, token: null };
    return user;
  });
}

export async function signOut(): Promise<void> {
  const session = active;
  // No session, no request: inventing a DELETE for a server we never spoke to would be a lie about
  // having signed out.
  if (!session) return;
  // The record — and with it the password pair the client closes over — leaves memory BEFORE the
  // first logout call, so a logout that dies on the wire cannot leave the credential reachable.
  active = null;
  try {
    await session.client.remove('/session');   // DELETE /api/session (SessionResource.java:143-148)
  } finally {
    // A minted token the server still honours outlives the tab that minted it unless it is revoked
    // here; the 007 §9 probe revoked its own token for exactly this reason.
    if (session.token !== null) await revokeWith(session.client, session.token);
  }
}

export async function whoAmI(): Promise<ServerUser> {
  const session = active;
  if (!session) throw new TraccarError('unauthorized', 401, 'there is no signed-in guardian to ask the server about');
  if (session.token === null) {
    // Sanctioned source (1), and deliberately request-free: the only GET this module could send
    // without a token would be a Basic-header-only GET /session, which is the measured 404 R-M1-8
    // forbids building anything on.
    return session.user;
  }
  // Sanctioned source (2): GET /api/session?token=<minted token> ⇒ 200 with the User fields.
  const raw = await session.client.get<unknown>('/session', { token: session.token });
  const user = toServerUser(raw);
  session.user = user;
  return user;
}

function toEpochMs(value: string | number | Date | undefined): number {
  if (value === undefined) return Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  return Number(value);
}

// `expiration` is a date-time form field (SessionResource.java:152-153, openapi.yaml ⇒ string with
// format date-time; the 007 §9 probe sent an ISO instant and measured 200). Validated before the
// call: an already-dead expiration would mint a token the server rejects later, in the middle of the
// live socket Task 10 depends on, and the failure would arrive with no context.
function expirationIso(expiresAt?: string | number | Date): string {
  const ms = toEpochMs(expiresAt);
  if (!Number.isFinite(ms) || ms <= Date.now()) {
    throw new TraccarError('badpayload', 0, 'the requested token expiration is not a future instant');
  }
  return new Date(ms).toISOString();
}

export async function mintSocketToken(expiresAt?: string | number | Date): Promise<string> {
  const session = active;
  if (!session) throw new TraccarError('unauthorized', 401, 'sign in before minting a socket token');
  const expiration = expirationIso(expiresAt);
  const token = await session.client.postFormText('/session/token', { expiration });
  if (token === '') {
    // An empty body is a 200 that minted nothing; recording it would make every later call fail.
    throw new TraccarError('badpayload', 200, 'the server minted an empty socket token');
  }
  // Held in this record only. The state snapshot never sees it (a test asserts that), it is never
  // written to a store, and no message produced by this module repeats it.
  session.token = token;
  return token;
}

async function revokeWith(client: TraccarClient, token: string): Promise<void> {
  // `token` is the @FormParam name SessionResource.java:166-167 reads; 204 on success (measured).
  await client.postForm<null>('/session/token/revoke', { token });
}

export async function revokeSocketToken(token: string): Promise<void> {
  const session = active;
  if (!session) throw new TraccarError('unauthorized', 401, 'there is no session to revoke a token from');
  await revokeWith(session.client, token);
  if (session.token === token) session.token = null;
}

// R-M1-14: this is screen-facing, so it degrades instead of throwing. A version the guardian should
// see is printed; an absent, blank, absurd, or unreadable one becomes the words for "we do not know".
export function serverVersionLine(version: string | null | undefined, lang: CatalogLang): string {
  const usable = usableVersion(version);
  if (usable === null) return translate('login.serverUnknown', lang);
  return translate('login.serverVersion', lang, { version: usable });
}

function usableVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const version = value.trim();
  if (version === '' || version.length > MAX_SERVER_VERSION_LENGTH) return null;
  return version;
}

export async function probeServerVersion(baseUrl: string): Promise<string | null> {
  try {
    const client = createTraccarClient({ baseUrl, credentials: { email: '', password: '' } });
    const info = await client.get<unknown>('/server');
    return usableVersion((info as { version?: unknown } | null)?.version);
  } catch {
    // The footer is the announcement — a probe that could not read the server says "unknown server"
    // rather than handing a screen an exception. ServerResource.java:94 makes GET /api/server
    // @PermitAll, and SecurityRequestFilter.java:65-79 with LoginService.java:123-149 turns the
    // empty credential pair this client sends into an anonymous caller, which is the 200 the lab
    // measured for a header-less call. That chain is read from the 6.16.0 source; the live reading
    // of it with this header belongs to the human-run Step 4 measurement, and if it ever answers
    // anything other than 200 this call degrades to null, which is the honest line.
    return null;
  }
}
