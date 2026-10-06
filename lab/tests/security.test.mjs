import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkDefinitions, runSecurityChecks, formatCheckResults } from '../scripts/security-check.mjs';

const runChild = promisify(execFile);

// كل العناوين في هذا الملف loopback، منفصلة عن منفذ الـsink (5199) وعن منفذ Traccar الحقيقي.
const DEPS = { apiBaseUrl: 'http://127.0.0.1:8082/api', osmandUrl: 'http://127.0.0.1:5055/' };
const NETWORK_CHECKS = ['unauthenticated-devices-401', 'self-registration-closed', 'unknown-device-rejected'];

const checkByName = (result, name) => result.checks.find((check) => check.name === name);
const passedNames = (result) => result.checks.filter((c) => c.status === 'PASS').map((c) => c.name);

// الخادم «المتعاون»: يرفض بلا مصادقة، ويغلق التسجيل، ويرفض جهازاً غير مسجّل.
const cooperativeFetch = async (url, options = {}) => {
  if (url.endsWith('/api/devices') && !options.headers) return { status: 401 };
  if (url.endsWith('/api/users') && options.method === 'POST') return { status: 403, text: async () => 'Registration disabled' };
  if (url.endsWith('/api/server')) return { status: 200, json: async () => ({ registration: false }), text: async () => '' };
  if (url.endsWith('/')) return { status: 400, text: async () => '' };
  throw new Error(`unexpected ${options.method ?? 'GET'} ${url}`);
};

// response من وصف حرفي: rawBody يعني جسماً غير قابل للتحليل، تماماً كما تفعل Response الحقيقية
function respond(spec) {
  const response = { status: spec.status };
  if ('rawBody' in spec) {
    response.json = async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); };
    response.text = async () => spec.rawBody;
  } else if ('json' in spec) {
    response.json = async () => spec.json;
    response.text = async () => JSON.stringify(spec.json);
  }
  return response;
}

// fake للشبكة من أوصاف المسارات الأربعة، بلا أي شبكة حقيقية
const makeFetch = (specs = {}) => async (url) => {
  if (url.endsWith('/api/devices')) return respond(specs.devices ?? { status: 401 });
  if (url.endsWith('/api/users')) return respond(specs.users ?? { status: 403 });
  if (url.endsWith('/api/server')) return respond(specs.server ?? { status: 200, json: { registration: false } });
  return respond(specs.osmand ?? { status: 400 });
};

test('the check list covers the design spec obligations', () => {
  const names = checkDefinitions.map((c) => c.name);
  for (const required of ['unauthenticated-devices-401', 'self-registration-closed',
    'unknown-device-rejected', 'web-ui-on-localhost-only']) {
    assert.ok(names.includes(required), required);
  }
});

test('all checks pass against a cooperative fake server', async () => {
  const fetchStub = async (url, options = {}) => {
    if (url.endsWith('/api/devices') && !options.headers) return { status: 401 };
    if (url.endsWith('/api/users') && options.method === 'POST') return { status: 403, text: async () => 'Registration disabled' };
    if (url.endsWith('/api/server')) return { status: 200, json: async () => ({ registration: false }), text: async () => '' };
    if (url.endsWith('/')) return { status: 400, text: async () => '' };
    throw new Error(`unexpected ${options.method ?? 'GET'} ${url}`);
  };
  const result = await runSecurityChecks({
    fetch: fetchStub, apiBaseUrl: 'http://127.0.0.1:8082/api', osmandUrl: 'http://127.0.0.1:5055/',
  });
  for (const check of result.checks) assert.equal(check.status, 'PASS', `${check.name}: ${check.observed}`);
});

test('every definition carries a rationale and is named uniquely', () => {
  const names = checkDefinitions.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, `duplicate check names: ${names.join(', ')}`);
  for (const definition of checkDefinitions) {
    assert.equal(typeof definition.run, 'function', definition.name);
    assert.ok(definition.why && definition.why.length > 20, `${definition.name} needs a why`);
  }
});

test('no network check can PASS on an empty response object', async () => {
  // استجابة بلا status وبلا body: لا دليل إطلاقاً، فيجب أن تُقيَّم فشلاً لا «لا شيء»
  const result = await runSecurityChecks({ ...DEPS, fetch: async () => ({}) });
  assert.deepEqual(passedNames(result), ['web-ui-on-localhost-only']);
  for (const name of NETWORK_CHECKS) {
    const check = checkByName(result, name);
    assert.equal(check.status, 'FAIL', `${name} passed with no evidence: ${check.observed}`);
    assert.ok(check.observed.length > 10, `${name} observed is not explanatory: ${check.observed}`);
    assert.doesNotMatch(check.observed, /HTTP undefined/, `${name} leaked a missing status: ${check.observed}`);
  }
});

test('a status that is not a number is never read as a rejection', async () => {
  // وسيط أرجع status نصياً: مقارنة حرفية كانت ستمنح PASS زائفاً على المسار الحساس
  const result = await runSecurityChecks({ ...DEPS, fetch: async () => ({ status: '401' }) });
  assert.deepEqual(passedNames(result), ['web-ui-on-localhost-only']);
  assert.match(checkByName(result, 'unauthenticated-devices-401').observed, /no numeric HTTP status/);
});

test('a successful response carrying no usable signal is a FAIL, not a skip', async () => {
  // 200 بلا أي حقل registration: أقرب صيغة لـ «لا بيانات»، والمحرك ملزم بأن يفشل
  const result = await runSecurityChecks({ ...DEPS, fetch: makeFetch({ server: { status: 200 } }) });
  const check = checkByName(result, 'self-registration-closed');
  assert.equal(check.status, 'FAIL');
  assert.match(check.observed, /no registration evidence/);
});

test('unauthenticated-devices-401 fails when the anonymous read succeeds', async () => {
  // 200 مع قائمة الأجهزة = تسريب مواضع الأطفال، وهو بالضبط ما يُفحص لأجله
  const leaked = await runSecurityChecks({
    ...DEPS,
    fetch: makeFetch({ devices: { status: 200, json: [{ id: 1, name: 'lab-child-1' }] } }),
  });
  const check = checkByName(leaked, 'unauthenticated-devices-401');
  assert.equal(check.status, 'FAIL');
  assert.match(check.observed, /HTTP 200/);
  assert.match(check.observed, /401/);
  // نتيجة المتعاون تبقى دليلاً إيجابياً: 401 حرفية لا كلمة «غير مصادَق عليه» الغامضة
  const good = await runSecurityChecks({ ...DEPS, fetch: cooperativeFetch });
  assert.equal(checkByName(good, 'unauthenticated-devices-401').status, 'PASS');
});

test('self-registration-closed fails when the /server body is not JSON', async () => {
  const result = await runSecurityChecks({
    ...DEPS, fetch: makeFetch({ server: { status: 200, rawBody: '<html>502 Bad Gateway</html>' } }),
  });
  const check = checkByName(result, 'self-registration-closed');
  assert.equal(check.status, 'FAIL');
  assert.match(check.observed, /not JSON/i);
  assert.match(check.observed, /502 Bad Gateway/); // الدليل الحرفي الذي قُرئ، لا رسالة عامة
});

test('self-registration-closed fails when the registration field is absent', async () => {
  // `{}` استجابة ناجحة بلا أي حقل: يجب ألا تُفهم أبداً «تسجيلٌ مغلق» لأن undefined !== false وحسب
  const result = await runSecurityChecks({ ...DEPS, fetch: makeFetch({ server: { status: 200, json: {} } }) });
  const check = checkByName(result, 'self-registration-closed');
  assert.equal(check.status, 'FAIL');
  assert.match(check.observed, /no boolean registration field/);
});

test('self-registration-closed fails when registration is true even if the probe is refused', async () => {
  const result = await runSecurityChecks({ ...DEPS, fetch: makeFetch({ server: { status: 200, json: { registration: true } } }) });
  const check = checkByName(result, 'self-registration-closed');
  assert.equal(check.status, 'FAIL');
  assert.match(check.observed, /registration=true/);
});

test('self-registration-closed fails when the probe POST is accepted', async () => {
  // registration=false لكن المنفذ ما زال ينشئ حسابات = الفحص يجب أن يفشل
  const result = await runSecurityChecks({ ...DEPS, fetch: makeFetch({ users: { status: 200, json: { id: 99 } } }) });
  const check = checkByName(result, 'self-registration-closed');
  assert.equal(check.status, 'FAIL');
  assert.match(check.observed, /POST \/users HTTP 200/);
});

test('unknown-device-rejected fails when the osmand port accepts an unregistered id', async () => {
  const result = await runSecurityChecks({ ...DEPS, fetch: makeFetch({ osmand: { status: 200 } }) });
  const check = checkByName(result, 'unknown-device-rejected');
  assert.equal(check.status, 'FAIL');
  assert.match(check.observed, /HTTP 200/);
});

test('web-ui-on-localhost-only fails on a non-loopback or unparseable API URL', async () => {
  const lan = await runSecurityChecks({ ...DEPS, apiBaseUrl: 'http://192.168.1.20:8082/api', fetch: cooperativeFetch });
  const lanCheck = checkByName(lan, 'web-ui-on-localhost-only');
  assert.equal(lanCheck.status, 'FAIL');
  assert.match(lanCheck.observed, /192\.168\.1\.20/);

  const broken = await runSecurityChecks({ ...DEPS, apiBaseUrl: 'not-a-url', fetch: cooperativeFetch });
  const brokenCheck = checkByName(broken, 'web-ui-on-localhost-only');
  assert.equal(brokenCheck.status, 'FAIL');
  assert.match(brokenCheck.observed, /not a parseable URL/);

  // ولا تُقرأ 'localhost' كدليل على loopback: قد تُحلّ إلى ::1 أو إلى عنوان LAN بحسب /etc/hosts
  const named = await runSecurityChecks({ ...DEPS, apiBaseUrl: 'http://localhost:8082/api', fetch: cooperativeFetch });
  assert.equal(checkByName(named, 'web-ui-on-localhost-only').status, 'FAIL');
});

test('a PASS row always states the concrete evidence a human can audit', async () => {
  const result = await runSecurityChecks({ ...DEPS, fetch: cooperativeFetch });
  const expected = {
    'unauthenticated-devices-401': /HTTP 401/,
    'self-registration-closed': /POST \/users HTTP 403[\s\S]*registration=false/,
    'unknown-device-rejected': /HTTP 400/,
    'web-ui-on-localhost-only': /127\.0\.0\.1/,
  };
  for (const [name, pattern] of Object.entries(expected)) {
    assert.match(checkByName(result, name).observed, pattern, name);
  }
  // فحص 4 يصرّح بما لا يُثبته، وإلا قرأه أحدهم كأنه «جدار حماية»
  assert.match(checkByName(result, 'web-ui-on-localhost-only').observed, /NOT/);
});

test('a rejecting fetch fails only its own check and never aborts the run', async () => {
  const seen = [];
  const result = await runSecurityChecks({
    ...DEPS,
    fetch: async (url, options = {}) => {
      seen.push(url);
      if (url.endsWith('/api/devices')) throw new TypeError('fetch failed');
      if (url.endsWith('/api/users') && options.method === 'POST') return { status: 403 };
      if (url.endsWith('/api/server')) return { status: 200, json: async () => ({ registration: false }), text: async () => '' };
      return { status: 400 };
    },
  });
  assert.equal(result.checks.length, checkDefinitions.length, 'the loop must still finish every check');
  const dead = checkByName(result, 'unauthenticated-devices-401');
  assert.equal(dead.status, 'FAIL');
  assert.match(dead.observed, /error: fetch failed/);
  assert.equal(checkByName(result, 'self-registration-closed').status, 'PASS');
  assert.equal(checkByName(result, 'unknown-device-rejected').status, 'PASS');
  assert.ok(seen.includes(`${DEPS.apiBaseUrl}/server`));
});

test('one missing dependency fails every check instead of skipping them', async () => {
  // deps ناقص: لا PASS بلا بيانات، ولا استثناء يطيح بالتقرير كله
  const result = await runSecurityChecks({ apiBaseUrl: DEPS.apiBaseUrl });
  assert.deepEqual(passedNames(result), ['web-ui-on-localhost-only']);
  for (const name of NETWORK_CHECKS) assert.equal(checkByName(result, name).status, 'FAIL', name);
});

test('the checks stay anonymous and never create a real account', async () => {
  const requests = [];
  const result = await runSecurityChecks({
    ...DEPS,
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method ?? 'GET', headers: options.headers, body: options.body });
      return cooperativeFetch(url, options);
    },
  });
  for (const check of result.checks) assert.equal(check.status, 'PASS', `${check.name}: ${check.observed}`);
  assert.equal(requests.length, 4, `expected exactly the 4 planned probes, got ${JSON.stringify(requests.map((r) => r.url))}`);
  // لا مصادقة: الفحوص تقيس السطح المجهول، فلا تحتاج ولا تُسرّب أي كلمة مرور
  for (const request of requests) {
    assert.equal(request.headers?.authorization, undefined, request.url);
    assert.doesNotMatch(JSON.stringify(request.headers ?? {}), /authorization/i, request.url);
    assert.match(new URL(request.url).hostname, /^127\.0\.0\.1$/, request.url);
  }
  const userPosts = requests.filter((r) => r.method === 'POST' && r.url.endsWith('/api/users'));
  assert.equal(userPosts.length, 1);
  assert.deepEqual(JSON.parse(userPosts[0].body), { name: 'probe', email: 'probe@example.com', password: 'probe-pass' });
  const osmandPost = requests.find((r) => r.method === 'POST' && r.url === DEPS.osmandUrl);
  assert.match(osmandPost.body, /id=lab-not-registered/);
  assert.doesNotMatch(osmandPost.body, /lab-child/); // لا يلمس معرّف جهاز الطفل الحقيقي
});

test('a single FAIL drives the CLI summary to a nonzero exit', async () => {
  const clean = await runSecurityChecks({ ...DEPS, fetch: cooperativeFetch });
  const cleanSummary = formatCheckResults(clean);
  assert.equal(cleanSummary.exitCode, 0);
  assert.equal(cleanSummary.failures, 0);
  assert.equal(cleanSummary.lines.length, checkDefinitions.length);
  assert.deepEqual(cleanSummary.lines.map((line) => line.slice(0, 4)), ['PASS', 'PASS', 'PASS', 'PASS']);

  // المسار الموصول: تسريب /devices وحده يقلب الخروج
  const leaky = await runSecurityChecks({ ...DEPS, fetch: makeFetch({ devices: { status: 200, json: [] } }) });
  const summary = formatCheckResults(leaky);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.failures, 1);
  assert.equal(summary.lines.filter((line) => line.startsWith('FAIL')).length, 1);
  assert.match(summary.lines.find((line) => line.startsWith('FAIL')), /unauthenticated-devices-401/);
});

test('formatCheckResults never reads a missing or odd verdict as success', () => {
  // صفر فحوص ليس نجاحاً، وما ليس 'PASS' حرفياً ليس نجاحاً
  assert.equal(formatCheckResults({ checks: [] }).exitCode, 1);
  assert.equal(formatCheckResults({ checks: [{ name: 'x', observed: '' }] }).exitCode, 1);
  assert.equal(formatCheckResults({ checks: [{ name: 'x', status: 'pass', observed: 'HTTP 401' }] }).exitCode, 1);
  assert.equal(formatCheckResults({ checks: [{ name: 'x', status: 'PASS', observed: 'HTTP 401' }] }).exitCode, 0);
});

test('importing the module performs no live work', async () => {
  const moduleUrl = new URL('../scripts/security-check.mjs', import.meta.url).href;
  const child = [
    'globalThis.fetch = async (url) => { throw new Error(`live network during import: ${url}`); };',
    `const m = await import(${JSON.stringify(moduleUrl)});`,
    "if (typeof m.runSecurityChecks !== 'function' || !Array.isArray(m.checkDefinitions)) { console.error('missing exports'); process.exit(3); }",
    "console.log('imported-clean');",
  ].join('\n');
  try {
    const { stdout, stderr } = await runChild(process.execPath, ['--input-type=module', '-e', child], {
      env: { ...process.env, LAB_API_URL: DEPS.apiBaseUrl },
    });
    assert.equal(stderr, '');
    assert.equal(stdout.trim(), 'imported-clean');
  } catch (error) {
    assert.fail(`import must stay inert: exit=${error.code} stdout=${error.stdout} stderr=${error.stderr}`);
  }
});
