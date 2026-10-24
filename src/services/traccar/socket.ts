// src/services/traccar/socket.ts — the live channel to the server and its announced fallback.
//
// Three binding rules shape this file:
//  - The token comes from `mintSocketToken()` (session.ts) — never from storage, a screen, or a
//    constant — and rides the query of `ws(s)://…/socket?token=…`, percent-encoded once
//    (R-M1-30). The URL and the token are never logged, never put in an Error message, and never
//    exposed on the handle this function returns.
//  - `close`/`error` is not silence: `onDisconnect` fires exactly once, the connection state becomes
//    `fallback`, and a `GET /positions` poll starts every 15 s (injectable in tests). The screen shows
//    the badge and the no-data label (R-M1-34) — never a "safe" claim.
//  - Leaving the screen closes the socket, cancels the timer and calls `revokeSocketToken(token)`
//    once. A refused revoke is swallowed; it cannot throw into a screen and its message is not
//    printed. Every default below is imported from session.ts, which is the only owner of the
//    server address and the credentials.
import type { TraccarClient } from './client.ts';
import {
  activeClient,
  activeServerBaseUrl,
  mintSocketToken,
  revokeSocketToken,
} from './session.ts';
import type { ServerEvent, ServerPosition } from './types.ts';

// §4: the fallback that is announced when the live channel drops.
export const LIVE_POLL_INTERVAL_MS = 15_000;

export type ConnectionState = 'connecting' | 'live' | 'fallback' | 'closed';

// The tiny surface the code needs from a WebSocket. It is an interface so tests can hand in a fake
// without a browser, and so the adapter below is the only place that knows about the DOM object.
export type LiveSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onclose: (() => void) | null;
  close: () => void;
};

export type ConnectLiveOptions = {
  onEvent?: (event: ServerEvent) => void;
  onPositions?: (positions: ServerPosition[]) => void;
  onDisconnect?: () => void;
  // Optional, additive: lets a screen paint connecting/live/fallback/closed. Not a second contract.
  onState?: (state: ConnectionState) => void;
  // Test seams. Every default is the session.ts implementation, never a local fallback.
  createSocket?: (url: string) => LiveSocket;
  mintToken?: () => Promise<string>;
  baseUrl?: string | null;
  client?: TraccarClient | null;
  pollIntervalMs?: number;
  revokeToken?: (token: string) => Promise<void>;
};

export type LiveHandle = {
  close: () => void;
  state: () => ConnectionState;
};

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isServerPosition(value: unknown): value is ServerPosition {
  const row = value as Partial<ServerPosition> | null;
  return row !== null
    && typeof row === 'object'
    && finiteNumber(row.deviceId) !== null
    && finiteNumber(row.latitude) !== null
    && finiteNumber(row.longitude) !== null;
}

// The measured event field list is attributes,deviceId,eventTime,geofenceId,id,maintenanceId,
// positionId,type. `attributes.message` is deliberately NOT read: it is unmeasured (R-M1-33). The
// normaliser copies only the fields the app may hold, so no unknown object is passed onward whole.
function toServerEvent(value: unknown): ServerEvent | null {
  const row = value as Record<string, unknown> | null;
  if (row === null || typeof row !== 'object') return null;
  const id = finiteNumber(row.id);
  const deviceId = finiteNumber(row.deviceId);
  if (id === null || deviceId === null) return null;
  if (typeof row.type !== 'string' || row.type === '') return null;
  if (typeof row.eventTime !== 'string' || row.eventTime === '') return null;
  const event: ServerEvent = { id, type: row.type, eventTime: row.eventTime, deviceId };
  const positionId = finiteNumber(row.positionId);
  if (positionId !== null) event.positionId = positionId;
  const geofenceId = finiteNumber(row.geofenceId);
  if (geofenceId !== null) event.geofenceId = geofenceId;
  if (row.attributes !== null && typeof row.attributes === 'object') {
    event.attributes = row.attributes as Record<string, unknown>;
  }
  return event;
}

// Build the socket address from the session's base URL. The Traccar client treats its base as the
// API root (`/api` in the lab), so the socket appends `/socket` to that same root. http→ws,
// https→wss. The message of a refusal names neither the URL nor the token.
export function socketUrl(baseUrl: string, token: string): string {
  const base = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
  if (base === '') throw new Error('there is no server address for the live socket');
  let url: URL;
  try {
    const origin = typeof location !== 'undefined' && typeof location.href === 'string'
      ? location.href
      : 'http://localhost/';
    url = new URL(`${base}/socket`, origin);
  } catch {
    throw new Error('the server address cannot be used for the live socket');
  }
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
}

// The only place that touches the DOM WebSocket. A runtime without it gets the fallback, never a
// module-load crash.
function browserSocket(url: string): LiveSocket {
  if (typeof WebSocket === 'undefined') throw new Error('this runtime has no WebSocket');
  const ws = new WebSocket(url);
  const socket: LiveSocket = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    close: () => { ws.close(); },
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (event) => socket.onmessage?.({ data: event.data });
  ws.onerror = () => socket.onerror?.();
  ws.onclose = () => socket.onclose?.();
  return socket;
}

export async function connectLive(options: ConnectLiveOptions = {}): Promise<LiveHandle> {
  const baseUrl = options.baseUrl !== undefined ? options.baseUrl : activeServerBaseUrl();
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new Error('there is no signed-in server for the live socket');
  }

  const mint = options.mintToken ?? mintSocketToken;
  const revoke = options.revokeToken ?? revokeSocketToken;
  const client = options.client !== undefined ? options.client : activeClient();
  const createSocket = options.createSocket ?? browserSocket;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) && (options.pollIntervalMs ?? 0) > 0
    ? Number(options.pollIntervalMs)
    : LIVE_POLL_INTERVAL_MS;

  let state: ConnectionState = 'connecting';
  let token: string | null = null;
  let socket: LiveSocket | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let disconnected = false;

  const setState = (next: ConnectionState) => {
    state = next;
    try { options.onState?.(next); } catch { /* a screen callback must not break the channel */ }
  };

  const revokeQuietly = (value: string | null) => {
    if (value === null) return;
    // Fire-and-forget: leaving a screen must not wait on the network, and a refusal is silent. The
    // error object is dropped whole, so nothing it carries can reach a screen or a log.
    try { void Promise.resolve(revoke(value)).catch(() => {}); } catch { /* swallowed */ }
  };

  const stopSocket = () => {
    const dying = socket;
    socket = null;
    if (dying === null) return;
    dying.onopen = null;
    dying.onmessage = null;
    dying.onerror = null;
    dying.onclose = null;
    try { dying.close(); } catch { /* already closed */ }
  };

  const stopPolling = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  // The one exit from this module's lifetime: close the channel, cancel the timer, revoke the token
  // once. Idempotent by the `closed` flag, and safe to call from the failure paths below.
  const teardown = () => {
    if (closed) return;
    closed = true;
    state = 'closed';
    stopPolling();
    stopSocket();
    const revoking = token;
    token = null;
    revokeQuietly(revoking);
    try { options.onState?.('closed'); } catch { /* ignore a screen callback fault */ }
  };

  const poll = () => {
    if (closed || !client) return;
    client.get<ServerPosition[]>('/positions').then((rows) => {
      if (closed || !Array.isArray(rows)) return;
      const positions = rows.filter(isServerPosition);
      try { options.onPositions?.(positions); } catch { /* ignore a screen callback fault */ }
    }).catch(() => {
      // A poll that failed is still a poll that ran; the badge already says fallback. Nothing is
      // printed: a failed request can carry its address and the credential attached to it.
    });
  };

  const startPolling = () => {
    if (timer !== null || closed) return;
    poll();
    timer = setInterval(poll, pollIntervalMs);
  };

  // R-M1-34: one announcement, one poll timer, no second path.
  const announceFallback = () => {
    if (closed || disconnected) return;
    disconnected = true;
    stopSocket();
    setState('fallback');
    try { options.onDisconnect?.(); } catch { /* ignore a screen callback fault */ }
    startPolling();
  };

  const handleMessage = (message: { data: unknown }) => {
    if (closed) return;
    if (typeof message?.data !== 'string') return;
    let parsed: unknown;
    try { parsed = JSON.parse(message.data); } catch { return; }
    const frame = parsed as Record<string, unknown> | null;
    if (frame === null || typeof frame !== 'object') return;

    if (Array.isArray(frame.events)) {
      for (const raw of frame.events) {
        const event = toServerEvent(raw);
        if (event !== null) {
          try { options.onEvent?.(event); } catch { /* ignore a screen callback fault */ }
        }
      }
    }
    if (Array.isArray(frame.positions)) {
      const positions = frame.positions.filter(isServerPosition);
      try { options.onPositions?.(positions); } catch { /* ignore a screen callback fault */ }
    }
  };

  // Mint first. A refused mint falls back (the poll may still work) and never prints its error: an
  // injected mint could put the token in the message.
  try {
    const minted = await mint();
    if (typeof minted !== 'string' || minted === '') throw new Error('empty token');
    token = minted;
  } catch {
    announceFallback();
    return { close: teardown, state: () => state };
  }

  try {
    const opened = createSocket(socketUrl(baseUrl, token));
    socket = opened;
    opened.onopen = () => {
      if (closed || disconnected) return;
      setState('live');
    };
    opened.onmessage = handleMessage;
    opened.onerror = () => { announceFallback(); };
    opened.onclose = () => { announceFallback(); };
  } catch {
    // The factory can throw a URL-bearing message; it is swallowed and announced as fallback.
    announceFallback();
  }

  return { close: teardown, state: () => state };
}
