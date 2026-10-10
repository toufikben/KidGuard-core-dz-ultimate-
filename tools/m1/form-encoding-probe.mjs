// tools/m1/form-encoding-probe.mjs — R-M1-11: measure a SPACE inside a @FormParam value on the
// shipped encoding path, plus the harder case the label cannot show: a token that itself contains
// a literal '+'.
// The body is built with the IDENTICAL expression client.ts:67 uses (`new URLSearchParams(...)`),
// so the bytes measured are the bytes the app puts on the wire. fetch is used directly here only
// because client.ts parses every non-empty response as JSON and /session/token answers text/plain
// — that parse failure is itself a measured finding, recorded below as probe-1 outcome.
// Prints statuses, lengths and booleans only — never a full token, cookie, credential or email.
import { createTraccarClient } from '../../src/services/traccar/client.ts';

const baseUrl = process.env.LAB_API_URL;
const email = process.env.LAB_ADMIN_EMAIL;
const password = process.env.LAB_ADMIN_PASSWORD;
if (!baseUrl || !email || !password) {
  console.log('ABORT: LAB_API_URL / LAB_ADMIN_EMAIL / LAB_ADMIN_PASSWORD missing in env');
  process.exit(2);
}

const line = (label, detail) => console.log(`${label}: ${detail}`);
const auth = 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(`${email}:${password}`)));

// Exactly the expression in client.ts:67 — this is the encoder under measurement.
const formBody = (params) => new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));

async function mint(params) {
  const body = formBody(params);
  const response = await fetch(`${baseUrl}/session/token`, {
    method: 'POST', headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await response.text();
  return { status: response.status, token: text.trim(), sentBody: body.toString() };
}

async function call(method, path, { params, body } = {}) {
  const url = `${baseUrl}${path}${params ? `?${new URLSearchParams(params)}` : ''}`;
  const response = await fetch(url, {
    method, headers: { authorization: auth, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body,
  });
  const text = await response.text();
  let json = null;
  try { json = text === '' ? null : JSON.parse(text); } catch { /* non-JSON */ }
  return { status: response.status, json, isJson: json !== null || text === '', textLength: text.length };
}

const expiration = () => new Date(Date.now() + 3600_000).toISOString();
const spacedLabel = 'lab guardian app'; // the space is the measurement: URLSearchParams sends '+'

// A. Does the shipped encoder put the space on the wire as '+', and does the server accept it?
const first = await mint({ expiration: expiration(), label: spacedLabel });
const spaceSentAs = first.sentBody.includes('label=lab+guardian+app') ? "'+' (form encoding)"
  : first.sentBody.includes('label=lab%20guardian%20app') ? "'%20'" : 'neither — see the mint status';
line('A-encoded-body-shape', `the space in the label went out as ${spaceSentAs} (body length ${first.sentBody.length})`);
line('A-mint-status', `HTTP ${first.status}, token length ${first.token.length}`);

// B. Does a token minted with a spaced value actually authenticate? (R-M1-8 identity route)
const who = await call('GET', '/session', { params: { token: first.token } });
line('B-token-authenticates', who.status === 200 && who.isJson
  ? `HTTP 200, fields: ${Object.keys(who.json ?? {}).sort().join(',')}`
  : `HTTP ${who.status} bodyIsJson=${who.isJson}`);

// C. Revocation of the same token through the shipped encoder (form body), then re-use must fail.
const revoke = await call('POST', '/session/token/revoke', { body: formBody({ token: first.token }) });
const reuse = await call('GET', '/session', { params: { token: first.token } });
line('C-revoke', `HTTP ${revoke.status}`);
line('C-reuse-after-revoke', `HTTP ${reuse.status} (a miss on the '+' encoding would leave this 200)`);

// D. Character census over minted tokens: does a token ever carry '+' (the one character a wrong
//    form encoder silently turns into a space), and does revoke still hit it when it does?
const census = { plus: 0, slash: 0, equals: 0, dash: 0, underscore: 0 };
let plusCase = 'no token carried a literal + in 40 mints';
for (let attempt = 1; attempt <= 40; attempt += 1) {
  const minted = await mint({ expiration: expiration(), label: spacedLabel });
  if (minted.status !== 200) { plusCase = `mint failed HTTP ${minted.status} at trial ${attempt}`; break; }
  const token = minted.token;
  for (const [char, key] of [['+', 'plus'], ['/', 'slash'], ['=', 'equals'], ['-', 'dash'], ['_', 'underscore']]) {
    if (token.includes(char)) census[key] += 1;
  }
  if (!token.includes('+')) continue;
  const authenticates = (await call('GET', '/session', { params: { token } })).status === 200;
  const revoked = (await call('POST', '/session/token/revoke', { body: formBody({ token }) })).status;
  const after = (await call('GET', '/session', { params: { token } })).status;
  plusCase = `trial ${attempt}: token carries '+'; authenticates=${authenticates} revoke=HTTP ${revoked} after-revoke=HTTP ${after} (${after === 200 ? 'REVOKE MISSED THE +' : 'revoke matched the + byte-for-byte'})`;
  break;
}
line('D-token-character-census', `tokens containing '+' ${census.plus}, '/' ${census.slash}, '=' ${census.equals}, '-' ${census.dash}, '_' ${census.underscore}`);
line('D-plus-token-round-trip', plusCase);

// E. The shipped client's own behaviour on this endpoint, measured for the record.
const client = createTraccarClient({ baseUrl, credentials: { email, password }, timeoutMs: 15000 });
let clientOutcome = 'no error';
try { const value = await client.postForm('/session/token', { expiration: expiration(), label: spacedLabel }); clientOutcome = `returned ${typeof value} of length ${String(value).length}`; }
catch (error) { clientOutcome = `${error.kind} HTTP ${error.status} — message carries a body excerpt: ${/HTTP 200 returned non-JSON \(/.test(error.message)}`; }
line('E-client-postForm-on-token-endpoint', clientOutcome);
const clean = await call('POST', '/session/token/revoke', { body: formBody({ token: (await mint({ expiration: expiration(), label: 'cleanup' })).token }) });
line('F-cleanup', `last mint revoked HTTP ${clean.status}`);
