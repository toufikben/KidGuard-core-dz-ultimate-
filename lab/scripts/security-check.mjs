// فحوص الأمان الذاتية للمعمل (spec 9.4 و9.6). كل فحص يلاحظ سلوك HTTP حقيقيًا، والتبعيات تُحقن
// من الخارج (fetch / apiBaseUrl / osmandUrl) حتى يعمل الاختبار بخادم وهمي بلا شبكة، وحتى يبقى
// الاستيراد خاملًا. القاعدة الحاكمة: لا PASS بلا دليل — استجابة ترمي استثناءً، أو لا تحمل حالة
// HTTP رقمية، أو تحمل جسمًا غير قابل للتحليل، أو تفتقد الحقل المطلوب = FAIL يشرح ما قُرئ فعلاً.
import { fileURLToPath } from 'node:url';

const PASS = 'PASS';
const FAIL = 'FAIL';

function describe(value) {
  if (typeof value === 'string') return JSON.stringify(value.slice(0, 80));
  if (value === undefined || value === null || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return Array.isArray(value) ? `array(${value.length})` : typeof value;
}

// استجابة بلا حالة HTTP رقمية (كائن مختزل، أو وسيط أرجع نصًا) لا تُقرأ أبدًا «رُفض الطلب»:
// المقارنة الحرفية مع 401 أو `>= 400` تسقط بلا دليل، فنسمّي ما قُرئ ونفشل.
function readStatus(response) {
  if (response === null || typeof response !== 'object') {
    return { status: null, observed: `the response is not an object (${describe(response)})` };
  }
  if (!Number.isInteger(response.status)) {
    return { status: null, observed: `no numeric HTTP status in the response (status=${describe(response.status)})` };
  }
  return { status: response.status, observed: `HTTP ${response.status}` };
}

// أفضل-جهد: في التشغيل الحي يجب استهلاك الجسم وإلا أبقت undici الاتصال مفتوحًا وأخّرت إنهاء
// العملية. يُتخطى بصمت حين لا يوجد text() إطلاقًا (أوصاف اختبار مختزلة)، فهو تنظيفٌ لا دليل.
async function readBodySnippet(response) {
  if (response === null || typeof response !== 'object' || typeof response.text !== 'function') return null;
  try {
    const text = await response.text();
    return typeof text === 'string' && text !== '' ? text.slice(0, 80) : null;
  } catch {
    return null; // الجسم استُهلك بالفعل (json()) أو فشل القراءة: لا دليل هنا، والفحص لا يعتمد عليه
  }
}

// قراءة أعلام /server: json() أولًا لأنه ما تختبره الأوصاف المختزلة، والنص يُقرأ فقط لبيان سبب
// الفشل. كل مسار لا يقدّم إشارة صريحة يرجع ok:false مع detail يسمّي ما قُرئ — لا PASS ضمني.
async function readServerFlags(response) {
  if (typeof response?.json !== 'function') {
    const body = await readBodySnippet(response);
    return { ok: false, detail: `no registration evidence (${readStatus(response).observed} exposes no JSON body${body ? `; body: ${describe(body)}` : ''})` };
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    const body = await readBodySnippet(response);
    return {
      ok: false,
      detail: `/server body is not JSON (${error.message})${body ? `; body: ${describe(body)}` : ' (body already consumed or unreadable)'}`,
    };
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, detail: `no registration evidence (the /server payload is not an object: ${describe(payload)})` };
  }
  if (typeof payload.registration !== 'boolean') {
    return {
      ok: false,
      detail: `no registration evidence (the /server payload has no boolean registration field; `
        + `registration=${describe(payload.registration)}, keys: ${Object.keys(payload).slice(0, 10).join(',') || 'none'})`,
    };
  }
  return { ok: true, registration: payload.registration, detail: `server.registration=${payload.registration}` };
}

export const checkDefinitions = [
  {
    name: 'unauthenticated-devices-401',
    why: 'no anonymous read of children positions',
    async run({ fetch, apiBaseUrl }) {
      const response = await fetch(`${apiBaseUrl}/devices`);
      const read = readStatus(response);
      if (read.status === null) return { status: FAIL, observed: `GET /devices: ${read.observed}` };
      if (read.status === 401) {
        return { status: PASS, observed: `GET /devices anonymous -> HTTP 401 (refused before any data)` };
      }
      return {
        status: FAIL,
        observed: `GET /devices anonymous -> HTTP ${read.status}, expected 401: the REST surface answered an unauthenticated position read`,
      };
    },
  },
  {
    name: 'self-registration-closed',
    why: 'spec 9.4 — Traccar has no login throttle and registration must be off',
    async run({ fetch, apiBaseUrl }) {
      // probe صناعي بالكامل ولا يُنشئ حسابًا حقيقيًا: رفضُه هو النتيجة المتوقعة، فإن قُبل كان ذلك
      // هو العطل. لا تمرّ هنا أي بيانات اعتماد حقيقية ولا أي بريد وليّ حقيقي.
      const response = await fetch(`${apiBaseUrl}/users`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'probe', email: 'probe@example.com', password: 'probe-pass' }),
      });
      const probe = readStatus(response);
      const probeBody = await readBodySnippet(response);
      const probeEvidence = probe.status === null
        ? `POST /users ${probe.observed}`
        : `POST /users HTTP ${probe.status}${probeBody ? ` ${describe(probeBody)}` : ''}`;
      const serverResponse = await fetch(`${apiBaseUrl}/server`);
      const serverStatus = readStatus(serverResponse);
      if (serverStatus.status === null) {
        return { status: FAIL, observed: `${probeEvidence}; GET /server ${serverStatus.observed}` };
      }
      const flags = await readServerFlags(serverResponse);
      if (!flags.ok) return { status: FAIL, observed: `${probeEvidence}; ${flags.detail}` };
      const closed = flags.registration === false;
      const rejected = probe.status !== null && probe.status >= 400;
      const whyNot = [];
      if (!closed) whyNot.push('expected registration=false');
      if (!rejected) whyNot.push(`expected the probe POST to be refused with HTTP >= 400 (got ${describe(probe.status)})`);
      return {
        status: closed && rejected ? PASS : FAIL,
        observed: `${probeEvidence}; ${flags.detail}${whyNot.length ? ` — ${whyNot.join('; ')}` : ''}`,
      };
    },
  },
  {
    name: 'unknown-device-rejected',
    why: 'whitelist ingest (spec 9.6) — database.registerUnknown stays false',
    async run({ fetch, osmandUrl }) {
      const response = await fetch(osmandUrl, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `id=lab-not-registered&valid=true&lat=36.75&lon=3.06&timestamp=${Math.floor(Date.now() / 1000)}`,
      });
      const read = readStatus(response);
      await readBodySnippet(response); // تحرير الاتصال في التشغيل الحي
      if (read.status === null) return { status: FAIL, observed: `osmand POST / with an unknown uniqueId: ${read.observed}` };
      if (read.status >= 400) {
        return {
          status: PASS,
          observed: `unknown uniqueId POST / -> HTTP ${read.status} (expected >= 400: unregistered devices are not created)`,
        };
      }
      return {
        status: FAIL,
        observed: `unknown uniqueId POST / -> HTTP ${read.status}, expected >= 400: the ingest port accepted an unregistered device, so database.registerUnknown is not false`,
      };
    },
  },
  {
    name: 'web-ui-on-localhost-only',
    // صراحةً: هذا السطر يقرأ المضيف المضبوط في LAB_API_URL، أي أن المعمل موجَّه إلى loopback.
    // لا يُثبت أن الخادم يرفض اتصالات الشبكة المحلية — ذلك يحتاج قياسًا من مضيف آخر (المهمّة 6).
    why: 'lab hardening: reads the host this lab is configured to talk to — it shows the lab points at loopback, it does NOT prove the admin UI is unreachable from the LAN',
    async run({ apiBaseUrl }) {
      let host;
      try {
        host = new URL(apiBaseUrl).hostname;
      } catch {
        return { status: FAIL, observed: `apiBaseUrl is not a parseable URL (${describe(apiBaseUrl)}), so there is no host evidence` };
      }
      const caveat = 'this proves only that the lab is pointed at loopback, NOT that Traccar refuses LAN clients (verify web.address=127.0.0.1 from another host; use adb reverse for the phone)';
      return {
        status: host === '127.0.0.1' ? PASS : FAIL,
        observed: `configured API host is ${host}; ${caveat}`,
      };
    },
  },
];

export async function runSecurityChecks(deps) {
  const checks = [];
  for (const definition of checkDefinitions) {
    try {
      checks.push({ name: definition.name, why: definition.why, ...(await definition.run(deps)) });
    } catch (error) {
      // استثناء داخل فحص لا يُسقِط التقرير كله ولا يُحوَّل إلى PASS: الفشل هنا هو الدليل المتاح
      checks.push({ name: definition.name, why: definition.why, status: FAIL, observed: `error: ${error.message}` });
    }
  }
  return { checks };
}

// منطق الخروج في دالة نقية قابلة للاختبار: ما ليس PASS حرفيًا يُحسب فشلًا، وصفر فحوص ليس نجاحًا.
export function formatCheckResults({ checks }) {
  const lines = checks.map((check) => `${check.status}  ${check.name}  [${check.observed}]`);
  const failures = checks.filter((check) => check.status !== PASS).length;
  return {
    lines,
    failures,
    total: checks.length,
    exitCode: checks.length > 0 && failures === 0 ? 0 : 1,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const apiBaseUrl = env.LAB_API_URL ?? 'http://127.0.0.1:8082/api';
  const { checks } = await runSecurityChecks({
    fetch, apiBaseUrl,
    osmandUrl: `http://${env.LAB_OSMAND_HOST ?? '127.0.0.1'}:${env.LAB_OSMAND_PORT ?? '5055'}/`,
  });
  const summary = formatCheckResults({ checks });
  for (const line of summary.lines) console.log(line);
  console.log(`${summary.total - summary.failures}/${summary.total} security checks passed`);
  // process.exitCode بدل process.exit: يُنهي بعد تفريغ stdout على Windows ولا يبتر السطور
  process.exitCode = summary.exitCode;
}
