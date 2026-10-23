// src/services/traccar/client.ts
import type { Credentials } from './types.ts';

export type ErrorKind = 'unauthorized' | 'forbidden' | 'notfound' | 'server' | 'network' | 'timeout' | 'badpayload';

export class TraccarError extends Error {
  readonly kind: ErrorKind;
  readonly status: number;
  constructor(kind: ErrorKind, status: number, message: string) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

const kindFor = (status: number): ErrorKind =>
  status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'notfound' : 'server';

export function createTraccarClient({
  baseUrl, credentials, timeoutMs = 10000,
}: { baseUrl: string; credentials: Credentials; timeoutMs?: number }) {
  // Key order is the CALLER's and is never rewritten. Measured on the live 6.16.0 lab (2026-10-23):
  // GET /permissions resolves the relation from the pair's FIRST key — `?userId=2&notificationId=0`
  // answers 200 while the alphabetically sorted `?notificationId=0&userId=2` answers 400 ("Table
  // TC_NOTIFICATION_USER not found"). A helper that sorts would flip a working read into a broken one.
  const withQuery = (path: string, params?: Record<string, string | number>) => {
    if (!params || Object.keys(params).length === 0) return path;
    const search = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return `${path}?${search}`;
  };

  async function request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | number>;
      body?: unknown;
      // Form fields for Traccar's @FormParam endpoints (POST /api/session, /api/session/token,
      // /api/session/token/revoke). Kept separate from `body` so the content-type below can never
      // disagree with the encoding actually put on the wire.
      form?: Record<string, string | number>;
      // Reads the body as text rather than JSON. Used by the long-lived-token route: measured on the
      // live lab (008 §3.1) that `POST /api/session/token` answers **a bare string whose declared
      // content-type is `application/json`** — so JSON.parse turns that 200 into badpayload. (The
      // openapi description says `200 text/plain string`; the running server's header says otherwise,
      // and the header is what this client has to agree with.) 008 measured the round trip too: the
      // minted token authenticates through `GET /session?token=` with 200, and a revoked one with 401.
      text?: boolean;
    } = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // btoa, not Node's base64 helper: this bundle runs in a browser (owner's PC + a phone over
    // `adb reverse`) where the Node global is undefined and the first request would throw
    // ReferenceError. btoa exists in both runtimes (Node >= 16, measured on Node 24.19 here), so
    // there is exactly one encoding path. The guard test in tests/app/client.test.ts enforces it.
    // TextEncoder first because btoa is byte-oriented: an Arabic password (the product is
    // Arabic-first) makes bare btoa throw InvalidCharacterError, while the server decodes the
    // header as UTF-8 — so the bytes handed to btoa below are UTF-8, as the Node helper produced.
    const authorization = 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(`${credentials.email}:${credentials.password}`)));
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${withQuery(path, options.params)}`, {
        method,
        headers: {
          authorization,
          ...(options.form !== undefined
            ? { 'content-type': 'application/x-www-form-urlencoded' }
            : options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        // URLSearchParams applies form encoding (spaces as `+`, per application/x-www-form-urlencoded)
        // and coerces numbers; key order is the caller's, since the server matches fields by name.
        body: options.form !== undefined
          ? new URLSearchParams(Object.entries(options.form).map(([key, value]) => [key, String(value)]))
          : options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      const timedOut = controller.signal.aborted;
      // Never forward error.message here: a fetch failure can carry the request URL.
      throw new TraccarError(timedOut ? 'timeout' : 'network', 0, timedOut ? `request timed out after ${timeoutMs}ms` : 'network unreachable');
    }
    clearTimeout(timer);

    const text = await response.text();
    if (!response.ok) {
      // The status code and nothing else. Measured (008 §4): a wrong password answers 401 with a
      // 5824-byte body that is not JSON — it does not name the account, but no error body is read
      // into a message here either, so nothing a future server puts in one can reach a log.
      throw new TraccarError(kindFor(response.status), response.status, `HTTP ${response.status}`);
    }
    // Trimmed on the way out: the 007 §9 probe had to trim this body before using it, and a token
    // carrying a trailing newline is a token the socket will not accept.
    if (options.text) return text.trim() as T;
    if (text === '') return null as T;
    try { return JSON.parse(text) as T; }
    // Body length and content-type only — never any of the body's own characters. This branch fires
    // on a SUCCESSFUL token mint (008 §3.1: /session/token answers a bare string under
    // `application/json`), where the first characters of the body are the first characters of a live
    // credential. The excerpt that used to be interpolated here was 40 such characters.
    catch {
      const contentType = response.headers.get('content-type') ?? 'unknown';
      throw new TraccarError('badpayload', response.status, `HTTP ${response.status} returned non-JSON (${text.length} bytes, content-type ${contentType})`);
    }
  }

  return {
    get: <T>(path: string, params?: Record<string, string | number>) => request<T>('GET', path, { params }),
    post: <T>(path: string, body: unknown) => request<T>('POST', path, { body }),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
    remove: (path: string, params?: Record<string, string | number>) => request<null>('DELETE', path, { params }),
    // Session routes are @FormParam, not JSON: same timeout, same abort, same secret-free errors.
    postForm: <T>(path: string, params: Record<string, string | number>) => request<T>('POST', path, { form: params }),
    // POST /api/session/token is also @FormParam, but its 200 body is the token itself — 008 measured
    // it as a bare string declared `application/json`, which the JSON path cannot read. Text comes
    // back through this same request path, never through a second fetch call outside the client.
    postFormText: (path: string, params: Record<string, string | number>) => request<string>('POST', path, { form: params, text: true }),
  };
}

export type TraccarClient = ReturnType<typeof createTraccarClient>;
