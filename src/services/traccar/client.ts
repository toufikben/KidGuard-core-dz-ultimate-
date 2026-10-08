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
  // Query keys are sorted so a test can assert the exact string and a cache sees one shape.
  const withQuery = (path: string, params?: Record<string, string | number>) => {
    if (!params || Object.keys(params).length === 0) return path;
    const search = Object.entries(params)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return `${path}?${search}`;
  };

  async function request<T>(method: string, path: string, options: { params?: Record<string, string | number>; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${withQuery(path, options.params)}`, {
        method,
        headers: {
          authorization: 'Basic ' + Buffer.from(`${credentials.email}:${credentials.password}`).toString('base64'),
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
      // status + a short, secret-free excerpt only (401 bodies can name the account).
      throw new TraccarError(kindFor(response.status), response.status, `HTTP ${response.status}`);
    }
    if (text === '') return null as T;
    try { return JSON.parse(text) as T; }
    catch { throw new TraccarError('badpayload', response.status, `HTTP ${response.status} returned non-JSON (${text.slice(0, 40)})`); }
  }

  return {
    get: <T>(path: string, params?: Record<string, string | number>) => request<T>('GET', path, { params }),
    post: <T>(path: string, body: unknown) => request<T>('POST', path, { body }),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
    remove: (path: string, params?: Record<string, string | number>) => request<null>('DELETE', path, { params }),
  };
}

export type TraccarClient = ReturnType<typeof createTraccarClient>;
