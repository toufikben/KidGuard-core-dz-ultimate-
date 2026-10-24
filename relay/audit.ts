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
