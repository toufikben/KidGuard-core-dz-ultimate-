import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const RULES = {
  'database.driver': (v) => v === 'org.h2.Driver' || 'must be org.h2.Driver',
  'database.url': (v) => v.startsWith('jdbc:h2:./lab-data/') || 'must stay inside ./lab-data/',
  'database.user': (v) => v === 'sa' || 'lab uses sa (H2, localhost only)',
  'web.address': (v) => v === '127.0.0.1' || 'lab web UI must bind localhost',
  'web.port': (v) => v === '8082' || 'expected 8082',
  'protocols.enable': (v) => v === 'gt06,owntracks,osmand' || 'expected gt06,owntracks,osmand',
  'database.registerUnknown': (v) => v === 'false' || 'whitelist required (spec 9.6)',
  // Both rules below guard a fact the M0 evidence measured, not a style preference:
  // telegram in the channel list would let a lab run open a socket to api.telegram.org, and an
  // enabled geocoder blocks delivery and returns an address resolved from the coordinates
  // (spec §9.12, evidence 005 §6b).
  'notificator.types': (v) => {
    const types = v.split(',').map((t) => t.trim()).filter(Boolean);
    if (types.length === 0) return 'the lab must name at least one notification channel';
    if (types.includes('telegram')) {
      return 'telegram must stay out of the list: it would dial api.telegram.org with the lab token';
    }
    return true;
  },
  'geocoder.enable': (v) => v === 'false'
    || 'must be false in the lab (delivery blocks on it and leaks an address resolved from the coordinates)',
  'event.forward.url': (v) => /^http:\/\/(127\.0\.0\.1|\$\{LAB_SINK_HOST\}|localhost):\$\{LAB_FORWARD_PORT\}\/alert$|^http:\/\/(127\.0\.0\.1|localhost|\d{1,3}(\.\d{1,3}){3}):\d+\/alert$/.test(v)
    || 'must POST to the lab sink on http://<host>:<port>/alert',
  'event.forward.header': (v) => {
    // Traccar EventForwarderJson.java: line.split(":", 2) then values[1].trim(); a value
    // without a colon throws ArrayIndexOutOfBoundsException inside forward(). The header
    // must therefore be a "Name: value" pair with both halves non-empty. In template
    // (placeholder) mode the value half may be a ${VAR}; a bare ${VAR} with no "Name:"
    // prefix is rejected.
    if (/[<>&]/.test(v)) return 'header must not contain XML metacharacters';
    const idx = v.indexOf(':');
    if (idx === -1) return 'must be a "Name: value" pair; a colon-less header crashes Traccar EventForwarderJson';
    const name = v.slice(0, idx).trim();
    const value = v.slice(idx + 1).trim();
    if (name === '') return 'header name (left of the colon) must not be empty';
    if (value === '') return 'header value (right of the colon) must not be empty';
    return true;
  },
  'logger.console': (v) => v === 'true' || 'lab must log to console',
  'notificator.telegram.key': (v) => v === '${LAB_TELEGRAM_BOT_TOKEN}' || /^\d+:[\w-]+$/.test(v)
    || 'must be the placeholder or a bot token',
};

const FORBIDDEN_KEYS = ['web.path', 'web.debug', 'web.mcp.enable', 'web.register'];

export function validateConfig(xml, { allowPlaceholders = false } = {}) {
  const errors = [];
  const entries = new Map();
  const re = /<entry\s+key='([^']+)'>\s*([^<]*?)\s*<\/entry>/g;
  for (const match of xml.matchAll(re)) entries.set(match[1], match[2]);
  if (/<entry\s+key='([^']+)'\s*\/>/.test(xml)) {
    for (const match of xml.matchAll(/<entry\s+key='([^']+)'\s*\/>/g)) entries.set(match[1], '');
  }

  if (!xml.includes('LAB ONLY')) errors.push('missing the LAB ONLY marker');

  for (const [key, check] of Object.entries(RULES)) {
    if (!entries.has(key)) { errors.push(`${key} is required`); continue; }
    const result = check(entries.get(key));
    if (result !== true) errors.push(`${key}: ${result}`);
  }

  for (const key of FORBIDDEN_KEYS) {
    if (entries.has(key)) errors.push(`${key} must not appear in the lab config`);
  }

  if (!allowPlaceholders && xml.includes('${')) errors.push('unrendered placeholder present');
  if (allowPlaceholders) {
    for (const [, value] of entries) {
      if (value && !value.includes('${') && /(REAL|[0-9]{9}:[A-Za-z0-9_-]{20,})/.test(value)) {
        errors.push('secret-shaped value in template: replace with a ${VAR} placeholder');
      }
    }
  }
  return { entries, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const allow = args.includes('--allow-placeholders') || args.includes('--template');
  const pathArg = args.find((a) => !a.startsWith('--'));
  const target = pathArg
    ? pathToFileURL(resolve(process.cwd(), pathArg))
    : new URL('../traccar/kidguard-lab.xml', import.meta.url);
  const xml = await readFile(target, 'utf8');
  const { errors } = validateConfig(xml, { allowPlaceholders: allow });
  if (errors.length > 0) {
    for (const e of errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log(`config ok: ${fileURLToPath(target)}`);
}
