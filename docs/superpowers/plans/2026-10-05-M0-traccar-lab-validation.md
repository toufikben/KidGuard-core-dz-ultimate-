# M0 — معمل Traccar والتحقق (خطة تنفيذ)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** بناء معمل على حاسوب المالك يثبت بالأرقام أن سلسلة «مصدر موقع ← Traccar ← تقييم منطقة ← إنذار متعدد الأولياء ← سجل قياس» تعمل، ثم إصدار قرار M0 (بوابة) قبل كتابة أي كود إنتاج.

**Architecture:** خادم Traccar 6.16.0 قائم بـ`java -jar` + H2 على حاسوب المالك (معمل فقط، لا نشر). أجهزة الطرف الأولياء لا تُبنى بعد؛ بدلاً منها **آلة قياس** صغيرة (Node) تستقبل `event.forward.url` وتكتب NDJSON، وسكربتات تغذية اصطناعية ترفع إحداثيات عبر بروتوكول `osmand`. كل شيء داخل `lab/` وموسوم «أداة قياس» — لا شيء منه يدخل حزمة الإنتاج.

**Tech Stack:** Traccar 6.16.0 (Apache-2.0) + **Java ≥21 كما هو موجود فعلياً: JDK 25.0.2** (`/c/Program Files/Java/jdk-25.0.2`) — **تصحيح قياس في Task 1:** لا `jdk-21.0.7.6-hotspot` على هذا الجهاز، و`java` على PATH هو Temurin **17.0.20.1** ولا يشغّل بايت-كود 21 (`build.gradle:14-15` في مصدر Traccar يستهدف VERSION_21 ⇒ `UnsupportedClassVersionError`)؛ H2؛ Node 22 (CI) / Node 24 (محلي) بدون أي اعتمادية جديدة (`node:test`)؛ Git Bash + curl؛ GitHub Actions للتحقق؛ adb للتحقق البصري على Realme.

**Spec:** `docs/superpowers/specs/2026-10-05-parent-side-tracing-design.md` (المعتمدة 2026-10-05) — اقرأها مع هذه الخطة؛ كل مهمة تحتجّ بمادة منها.

---

## Global Constraints

- **الحاسوب لا يبني APK.** التحقق من أي بناء = GitHub Actions حصراً. الجهاز يخدم `java -jar` للمعمل فقط.
- **بوابة M0:** لا كود إنتاج قبل رؤية `geofenceExit` حقيقي من مصدر حقيقي (§14). المخرجات أدناه كلها أدوات قياس.
- Traccar **مثبّت على 6.16.0** (≥6.12 إلزامي لـCVE-2025-68930)، **Java ≥21 (على هذا الجهاز: JDK 25.0.2 — لا 21 مثبّت، وPATH يحمل 17 فلا تعتمد عليه)**، H2، **لا Docker ولا Postgres/Timescale** على هذا الجهاز (§10). تشغيل الجارفة على Java 25 **غير مُتحقَّق بعد** — يقيسه Task 2 عند أول تشغيل، ولا يُكتب «يعمل» قبل رؤية سجل الإقلاع.
- **لا أسرار في المستودع:** الإعداد الحقيقي يُولَّد محلياً من قالب؛ القالب يحوي `${VAR}` فقط.
- **لا بيانات حقيقية:** إحداثيات المركزة كلها حول نقطة اصطناعية `36.7538, 3.0588` (وسط الجزائر)، وأسماء الأجهزة `lab-child-*`، والبريد `lab@example.com`. لا أسماء أطفال ولا مواقع حقيقية (§9.10).
- **لا push إلى `main` أثناء M0:** الفرع `lab/m0`، وworkflow المعمل يعمل على مسارات `lab/**`. سببان: عدم استهلاك حصة الـartifacts (~500MB) بـAPK لا يحتاجها المعمل، وعدم إرسال كود إنتاج قبل البوابة.
- كل ادّعاء في التقرير يجب أن يكون مقيساً لا مروياً؛ ما لم يُختبر يُكتب **NOT RUN / UNVERIFIED** (§8، قاعدة المالك).
- **ترتيب التنفيذ ملزم:** المهام 1–5 و7 تُدفع وتُتحقق في CI قبل المهام 6 و8 و9 الميدانية (لا معنى لقياس أزمنة على خادم غير مهيّأ).

### حقائق Traccar المثبّتة من المصدر (لا تختلق بديلاً عنها)

كل قيمة أدناه قُرئت من نسخة 6.16.0 في `_research/traccar`:

| الحقيقة | المصدر |
|---|---|
| ملف الإعداد = **آخر** وسيط سطر أوامر؛ بلا وسائط يُبحث عن `./debug.xml`؛ وسائط تبدأ `--` = وضع خدمة ويندوز | `src/main/java/org/traccar/Main.java:77-90` |
| اسم الحزمة `tracker-server.jar`، التشغيل `java -jar tracker-server.jar conf/traccar.xml` | `setup/traccar.service` (`WorkingDirectory=/opt/traccar`)، `settings.gradle:1` |
| قالب H2: `database.driver=org.h2.Driver`, `database.url`, `database.user=sa`, `database.password` فارغ | `setup/traccar.xml` |
| `protocols.enable` يُفلتر البروتوكولات فعلاً | `config/Keys.java:1833`، `ServerManager.java:50-56` |
| المنافذ الافتراضية: `gt06` 5023، `osmand` 5055، `owntracks` 5144 | `config/PortConfigSuffix.java` |
| معالّمات `osmand` المقبولة: `id`/`deviceid`, `valid`, `timestamp` (ثوانٍ أو ms أو ISO), `lat`, `lon`, `location=lat,lon`, `cell`, `wifi`, `speed` (**عُقد kn**), `bearing`/`heading`, `altitude`, `accuracy`, `hdop`, `batt`, `charge` + أي مفتاح آخر كسمة | `protocol/OsmAndProtocolDecoder.java:95-172` |
| جهاز غير معروف ⇒ رد `400 BAD_REQUEST` والموضع يُهمل | `OsmAndProtocolDecoder.java:100-105,199-203` |
| شكل حمولة `event.forward.url`: `{"event":…,"position":…,"device":…,"geofence":…}` (تُحذف الحقول الفارغة) | `forward/EventForwarderJson.java`, `forward/EventData.java` |
| رؤوس التمرير الإضافية: المفتاح **`event.forward.header`** (مفرد)، سطر `Name: value` لكل رأس | `config/Keys.java:1189-1193` |
| `Event`: `type`, `eventTime`, `deviceId`, `positionId`, `geofenceId`, `attributes`؛ الأنواع: `geofenceExit`, `alarm`, `deviceOffline`, `deviceOverspeed`, `unaccompaniedMotion`, `deviceMoving`, `deviceStopped` | `model/Event.java:42-72` |
| `Position`: `serverTime`, `deviceTime`, `fixTime`, `valid`, `latitude`, `longitude`, `altitude`, `speed` (**knots**), `course`, `address`, `accuracy`, `geofenceIds`, `attributes` | `model/Position.java:161-317` |
| التواريخ تخرج **ISO-8601** (ليس طوابع رقمية) | `MainModule.java:153-158` (`disable(WRITE_DATES_AS_TIMESTAMPS)`) |
| التسجيل الذاتي يُغلق بسمة الخادم `registration=false` عبر `PUT /api/server`؛ وأول مستخدم يصبح admin تلقائياً عندما تكون القاعدة فارغة | `api/resource/UserResource.java:97-120`، `model/Server.java:26`، `api/resource/ServerResource.java:114` |
| `GET /api/server` عام (`@PermitAll`) ويعيد `newServer:true` حين لا مستخدمين | `ServerResource.java:94-112` |
| مصادقة REST: `Authorization: Bearer <token>` أو `Basic` (فصل الهيدر إلى جزئين ثم `login(scheme, credentials)`)، ورمز طويل العمر من `POST /api/session/token`، و`POST /api/session/token/revoke` | `api/security/SecurityRequestFilter.java:65-72`، `api/security/LoginService.java:96-121`، `SessionResource.java:150-176` |
| الدخول: `POST /api/session` بنموذج `email`+`password` (form-urlencoded) | `SessionResource.java:56-57,118-124` |
| **الإنذار لا يصل الولي بمجرد مشاركة الجهاز**: يجب أن يكون سجل `Notification` (بنوع الحدث وبقناة) مرتبطاً بالجهاز، وأن يكون الولي مصرّحاً على ذلك الـNotification وأيضاً على الجهاز | `database/NotificationManager.java:97-153`، `session/cache/CacheManager.java:119-133` |
| أحداث أقدم من `notificator.timeThreshold` (افتراضي **15 دقيقة**) تتجاوز التنبيهات («Skipping notifications for old event») بينما **التمرير يحدث قبل هذا الفحص** | `NotificationManager.java:90-95`، `Keys.java:1438-1441` |
| **شكل `/api/permissions`: خريطة من مفتاحين رقميين فقط، والترتيب هو الاتجاه** — `{"deviceId":8,"geofenceId":16}` يعني «الجهاز 8 مربوط بالمنطقة 16». **لا يوجد حقل `type`**، والثالث أو القيمة النصية تُرفض (`Invalid permission`). اسم جدول الربط يتولّد من الاتجاه (`tc_device_geofence`) فعكسه يفشل في SQL. أسماء المفاتيح = اسم الفئة مع `Id` لاحقاً: `userId`/`deviceId`/`geofenceId`/`notificationId` | `model/Permission.java:54-66,82-84`، `api/resource/PermissionsResource.java:77-88,111-113`، `schema/changelog-4.0-clean.xml:95` |
| ربط `Device→Notification` **إلزامي ما لم يكن `always:true`**: `getDeviceNotifications` يحذف كل تنبيه غير مربوط بالجهاز مباشرة ما لم يكن always | `CacheManager.java:126-133` |
| `POST` لأي كيان يُنشئ تلقائياً إذن `User→الكائن` للمُنشِئ؛ فلا يُرسل `userId` في الجسم، ولا حاجة لربط المدير بالمنطقة يدوياً | `api/BaseObjectResource.java:80-99` |
| `GET /api/permissions` **للمدير فقط** ولا بدّ من **سؤالين مرتّبين** في الـquery (`?userId=1&deviceId=7`)؛ بلاهما ينفجر تقسيم النص داخلياً | `PermissionsResource.java:76-88` |
| جسم `Notification` = `type` + `notificators` (سلاسل مفصولة بفواصل) + `always` + `description`؛ **لا `deviceId` ولا `userId` حقولاً فيه** (الروابط تُعمل عبر `/api/permissions`) | `model/Notification.java:25-90`، `model/BaseModel.java:19-27` |
| Telegram: `notificator.telegram.key` + `notificator.telegram.chatId` عالمياً، وتتبع الأولوية للسمة `telegramChatId` على المستخدم | `notificators/NotificatorTelegram.java:70-122` |
| اختبار قناة جاهز: `POST /api/notifications/test/{notificator}` و`GET /api/notifications/types` | `api/resource/NotificationResource.java:68,104-105` |
| **كل** أشكال WKT في Traccar بترتيب `lat lon` (عكس WKT القياسي): `CIRCLE(lat lon, r)`، و`LINESTRING(lat lon, lat lon)` | `geofence/GeofenceCircle.java:60-69`، `GeofencePolygon.java:134-149`، `GeofencePolyline.java:62-71,79-88` |
| منطقة مسار = `LINESTRING` + سمة `polylineDistance` (متر، افتراضي 25) | `model/Geofence.java:81-86` |
| ترميز whitelist = `database.registerUnknown` (اتركه `false`)، وكشف بروتوكول جهاز محتار = `database.saveOriginal` + منفذ 5001 | `Keys.java:613,627` |
| `/api/socket?token=` موجود ويصادق بالرمز | `web/WebModule.java:27`، `api/AsyncSocketServlet.java:62-66` |
| `osmand.minAccuracy` افتراضيه 10.0 | `Keys.java:327-330` |

**تصحيحات طُبّقت في المواصفة قبل التنفيذ** (لأن الدليل المصدرى خالف صياغتي السابقة):
1. §3: «إنذار واحد يصل كل الأولياء تلقائياً لمجرد مشاركة الجهاز» — **ساقطة**: يحتاج تصريحا على كائن `Notification` **وربطاً صريحاً بالجهاز** ما لم يكن `always:true` (الجدول أعلاه). المخطط يهيّئ الحالتين ويقيسهما.
2. §10: «جسر مؤقت رخيص بنفق» — **ساقط**: الأنفاق المجانية لا تنقل TCP خام لمنافذ الأجهزة، وCGNAT يقتل الاستضافة المنزلية (موثّق في `research/hosting-algeria.md` §3 من منتدى Traccar الرسمي). النفق يبقى خياراً لواجهة الويب فقط.
3. §6: كل WKT في Traccar بترتيب `lat lon` (عكس Leaflet/GeoJSON) — أُضيف قيد التحويل.
4. §10: قياس انعدام محوّل Wi‑Fi في جهاز المالك ⇒ مسار المعمل `adb reverse` فوق USB، وتصحيح أسعار/ترتيب مزوّدي VPS من ملف البحث.

---

## بنية الملفات (تُقرَّر الآن ولا تتغيّر أثناء التنفيذ)

```
lab/
  README.md                              كيف يشغَّل المعمل، وما يثبته وما لا يثبته
  .gitignore                             traccar/kidguard-lab.xml، artifacts/، lab-data/
  traccar/
    kidguard-lab.template.xml            قالب الإعداد (أسرار بصيغة ${VAR})
    run.sh                               تشغيل الشجرة المفكوكة من مجلد المعمل
  sink/
    sink.mjs                             خادم HTTP يستقبل /alert ويكتب NDJSON
    report.mjs                           CLI: NDJSON ← جدول أزمنة وتغطية
    lib/
      parse-event.mjs                    EventData ← سجل قياس مسطّح
      latency.mjs                        percentile + summarize
      geo.mjs                            مسافة + مولّدات WKT بترتيب Traccar
  scripts/
    render-config.mjs                    قالب + env ← kidguard-lab.xml
    check-config.mjs                     تحقق أن الإعداد يحوي المفاتيح الملزمة
    api.mjs                              طبقة fetch + Basic auth + أخطاء صريحة
    bootstrap.mjs                        admin، إغلاق التسجيل، جهاز، منطقة، مشترك ثانٍ، Notification
    post-position.mjs                    رفع موضع واحد عبر osmand
    scenario.mjs                         replay سيناريو مع مقياس زمني
    security-check.mjs                  _asserts_ أمان المعمل وتكتب النتيجة
  scenarios/
    school-exit.json                     3 داخل ثم 3 خارج دائرة المدرسة
    route-park.json                      LINESTRING لطريق نزهة + polylineDistance
  tests/
    config.test.mjs
    parse-event.test.mjs
    latency.test.mjs
    sink.test.mjs
    geo.test.mjs
    scenarios.test.mjs
    api.test.mjs
    security.test.mjs
  fixtures/
    event-geofence-exit.json             حمولة EventData كما يولّدها Traccar
    events.ndjson                        12 سطراً مع أزمنة معروفة
  artifacts/                             events.ndjson الناتج (مهمَل من git)
  report/
    M0-REPORT.md                         التقرير النهائي (يُملأ من القالب)
    M0-REPORT-template.md
    decision-hosting.md                  مذكرة قرار الاستضافة والدفع
    evidence/                            لقطات/مخرجات مرفقة بالأمر والتاريخ
docs/superpowers/plans/2026-10-05-roadmap.md
.github/workflows/lab-ci.yml
package.json                             +scripts للمعمل
```

**قاعدة التجزئة:** كل ملف مسؤوليته واحدة. `lib/*` دوال خالصة بلا I/O ⇒ تُختبر في CI. `sink.mjs` و`*.mjs` في `scripts/` هي قشرة I/O رقيقة فوقها، وتُجرى محلياً على الخادم. لا منطق سلامة في `lab/` يهاجر لاحقاً إلى الإنتاج — الإنتاج يُكتب في M1/M2 من الصفر ويستعمل هذه الاختبارات كمرجع.

---

## Task 1: تدفئة المستودع — CI المعمل، الحزم، القالب

**Files:**
- Create: `.github/workflows/lab-ci.yml`
- Create: `lab/.gitignore`, `lab/README.md`, `lab/traccar/run.sh`
- Modify: `package.json` (scripts فقط)
- Test: `lab/tests/config.test.mjs` (يُكتب في Task 2؛ هنا اختبار بنية أولي)

**Interfaces:**
- Consumes: لا شيء.
- Produces: أوامر npm ثابتة: `npm run test:lab`, `npm run lab:render`, `npm run lab:check`, `npm run lab:report`, `npm run lab:bootstrap`, `npm run lab:scenario`, `npm run lab:security`. كل مهمة لاحقة تستدعي أحد هذه الأسماء حرفياً.

- [ ] **Step 1: إنشاء فرع المعمل**

```bash
cd kidguard-core
git checkout -b lab/m0
```

- [ ] **Step 2: إضافة أوامر npm**

في `package.json`، حقل `scripts` يُضاف إليه (لا يُحذف شيء):

```json
    "test:lab": "node --test \"lab/tests/*.test.mjs\"",
    "lab:render": "node lab/scripts/render-config.mjs",
    "lab:check": "node lab/scripts/check-config.mjs --template lab/traccar/kidguard-lab.template.xml",
    "lab:report": "node lab/sink/report.mjs",
    "lab:bootstrap": "node lab/scripts/bootstrap.mjs",
    "lab:scenario": "node lab/scripts/scenario.mjs",
    "lab:security": "node lab/scripts/security-check.mjs"
```

- [ ] **Step 3: تشغيل الاختبار ليريه أن لا شيء بعد**

Run: `npm run test:lab`
Expected: FAIL برسالة `Could not find` أو `no test files found` — أي أن مجلد `lab/tests/` غير موجود. هذا هو **RED** المطلوب، وليس خطأ إعداد.

- [ ] **Step 4: `lab/.gitignore`**

```gitignore
traccar/kidguard-lab.xml
artifacts/
traccar/server-*.log
```

- [ ] **Step 5: `lab/traccar/run.sh`**

```bash
#!/usr/bin/env bash
# Lab-only: run the pinned Traccar tree (needs Java >= 21 bytecode; PATH java here is 17, so LAB_JAVA_BIN defaults to JDK 25).
set -euo pipefail
LAB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TREE_DIR="${LAB_TRACCAR_DIR:-$LAB_ROOT/traccar/traccar-other-6.16.0}"
JAVA_BIN="${LAB_JAVA_BIN:-/c/Program Files/Java/jdk-25.0.2/bin/java.exe}"
cd "$TREE_DIR"
exec "$JAVA_BIN" -Xmx512m -XX:+ExitOnOutOfMemoryError \
  -jar tracker-server.jar "$LAB_ROOT/traccar/kidguard-lab.xml"
```

ملاحظة للمنفّذ: الوسيط الأخير هو ملف الإعداد (`Main.java:77-90`)؛ ومسار Java بصيغة Git Bash. لو كان اسم مجلد التوزيع مختلفاً بعد الفكّ، عدّل `LAB_TRACCAR_DIR` ولا تغيّر أمر التشغيل.

- [ ] **Step 6: workflow المعمل**

`.github/workflows/lab-ci.yml`:

```yaml
name: Lab verification

on:
  push:
    branches: ["lab/**"]
    paths: ["lab/**", ".github/workflows/lab-ci.yml", "package.json"]
  pull_request:
    paths: ["lab/**"]

jobs:
  lab:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Syntax check lab shell scripts
        run: |
          find lab -name '*.sh' -print0 | xargs -0 -r -n1 bash -n

      - name: Install shellcheck if absent
        run: |
          if ! command -v shellcheck >/dev/null 2>&1; then
            sudo apt-get update -qq && sudo apt-get install -y -qq shellcheck
          fi

      - name: Shellcheck lab scripts
        run: |
          files=$(find lab -name '*.sh')
          if [ -n "$files" ]; then shellcheck -S warning $files; fi

      - name: Install dependencies
        run: npm ci --no-audit --no-fund || npm install --no-audit --no-fund

      - name: Fail if no lab tests exist
        run: test -n "$(ls lab/tests/*.test.mjs 2>/dev/null)"

      - name: Run lab tests
        run: npm run test:lab
```

**خطوتان مصححتان بالقياس (Task 1):** بلا خطوة «Fail if no lab tests exist» يصبح `npm run test:lab` **أخضر وهو صفر اختبارات** (`node --test "<glob لا يطابق>"` ⇒ `tests 0` وexit 0 على Node 24/win32) — وهو عين الإنذار الكاذب الذي يمنعته قاعدة «قِس لا تروِ». وشهادة الإعداد `npm run lab:check` **تنتقل إلى Task 2** لأن مستهدَفَيها (`check-config.mjs` والقالب) يُولَدان هناك؛ إدراجها في Task 1 يجعل بوابته حمراء. **القاعدة للمهام 2–10:** لا يعتبر أي تشغيل دليلاً إلا إن ظهر سطر `tests N` مع N ≥ عدد اختبارات المهمة، وإلا فهو NOT RUN.

- [ ] **Step 7: `lab/README.md`** (حدود ما يثبته المعمل)

```markdown
# معمل KidGuard (M0)

أدوات قياس فقط. لا شيء من هذا يدخل حزمة الإنتاج.

## يثبته
استقبال إحداثيات، تقييم منطقة على الخادم، حدث geofenceExit، تمرير event.forward.url،
وصول Telegram/بريد لكل الأولياء، أزمنة p50/p95، وسِمات أمان المعمل.

## لا يثبته (يُمنع ادّعاؤه قبل VPS)
استمرارية 24/7، وصول من شبكة الجوال عبر NAT، وضع SMS الحقيقي، زمن تسليم على الإنترنت العام،
عمر بطارية جهاز. الأنفاق المجانية لا تنقل TCP خام لمنافذ الأجهزة — راجع
docs/superpowers/specs (المادة 10) وresearch/hosting-algeria.md.

## تشغيل
npm run lab:render && npm run lab:check     # يولّد kidguard-lab.xml ويتحقق منه
bash lab/traccar/run.sh                      # نافذة واحدة تبقى مفتوحة
npm run lab:bootstrap                        # نافذة ثانية
```

- [ ] **Step 8: اختبار بنية أولي**

`lab/tests/config.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LAB_ROOT = fileURLToPath(new URL('../', import.meta.url));

test('lab tree skeleton exists', () => {
  for (const relative of ['README.md', 'traccar/run.sh', '.gitignore', 'tests']) {
    assert.ok(existsSync(`${LAB_ROOT}${relative}`), `missing lab/${relative}`);
  }
});
```

- [ ] **Step 9: تشغيل الاختبار محلياً**

Run: `npm run test:lab`
Expected: PASS (اختبار واحد).

- [ ] **Step 10: دفع الفرع وقراءة CI**

```bash
git add package.json .github/workflows/lab-ci.yml lab/.gitignore lab/README.md lab/traccar/run.sh lab/tests/config.test.mjs
git commit -m "chore(lab): add M0 lab tooling, CI workflow and npm entry points"
git push -u origin lab/m0
gh run list --branch lab/m0 --limit 3
```

Expected: `Lab verification` أخضر. **سجّل رقم الـrun** في رسالة للمالك. إن ظهر `Build & Release Pipeline` على هذا الفرع فلا تنتظره ولا تبني APK — هذا سبب إبقائه على `main`/`develop` فقط.

---

## Task 2: تثبيت Traccar 6.16.0 وقالب الإعداد والمولّد

**Files:**
- Create: `lab/traccar/kidguard-lab.template.xml`
- Create: `lab/scripts/render-config.mjs`, `lab/scripts/check-config.mjs`
- Modify: `lab/README.md` (قسم «تنزيل الخادم المثبّت»)
- Test: `lab/tests/config.test.mjs` (يُستبدل بالكامل)

**Interfaces:**
- Consumes: متغيّرات البيئة `LAB_ADMIN_EMAIL`, `LAB_ADMIN_PASSWORD`, `LAB_TELEGRAM_BOT_TOKEN`, `LAB_TELEGRAM_CHAT_ID`, `LAB_FORWARD_PORT` (5199 افتراضياً), `LAB_SINK_HOST` (127.0.0.1), `LAB_LAN_HOST` (فارغ).
- Produces: `renderConfig(templateText, env) -> string`؛ `validateConfig(xmlText, {allowPlaceholders}) -> {errors: string[]}`؛ ملف `lab/traccar/kidguard-lab.xml` المحلي.

- [ ] **Step 1: الاختبار الفاشل أولاً**

`lab/tests/config.test.mjs` (كامل، يستبدل ما في Task 1):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConfig } from '../scripts/render-config.mjs';
import { validateConfig } from '../scripts/check-config.mjs';
import { readFile } from 'node:fs/promises';

const template = await readFile(
  new URL('../traccar/kidguard-lab.template.xml', import.meta.url), 'utf8');

const env = {
  LAB_ADMIN_EMAIL: 'lab@example.com',
  LAB_ADMIN_PASSWORD: 'p@ss&w0rd',
  LAB_TELEGRAM_BOT_TOKEN: '123:ABC',
  LAB_TELEGRAM_CHAT_ID: '-100987',
  LAB_FORWARD_PORT: '5199',
};

test('template passes structural validation with placeholders allowed', () => {
  const { errors } = validateConfig(template, { allowPlaceholders: true });
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('render substitutes every placeholder, escapes XML and defaults the port', () => {
  const out = renderConfig(template, env);
  assert.ok(!out.includes('${'), 'no placeholder may survive');
  assert.ok(out.includes("<entry key='event.forward.url'>http://127.0.0.1:5199/alert</entry>"),
    'LAB_FORWARD_PORT must default to 5199');
  const { errors } = validateConfig(out, { allowPlaceholders: false });
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('render escapes XML metacharacters in injected values', () => {
  const escaped = renderConfig("<entry key='x'>${LAB_ADMIN_PASSWORD}</entry>", env);
  assert.equal(escaped, "<entry key='x'>p@ss&amp;w0rd</entry>");
});

test('render fails loudly on a missing secret', () => {
  assert.throws(() => renderConfig(template, {}), /missing env:/);
});

test('validation rejects a wrong protocols.enable', () => {
  const bad = template.replace(
    "<entry key='protocols.enable'>gt06,owntracks,osmand</entry>",
    "<entry key='protocols.enable'>tk103</entry>");
  const { errors } = validateConfig(bad, { allowPlaceholders: true });
  assert.ok(errors.some((e) => e.includes('protocols.enable')));
});

test('validation rejects a committed secret-shaped value', () => {
  const leaked = template.replace(
    "<entry key='notificator.telegram.key'>${LAB_TELEGRAM_BOT_TOKEN}</entry>",
    "<entry key='notificator.telegram.key'>123456:REAL-TOKEN</entry>");
  const { errors } = validateConfig(leaked, { allowPlaceholders: true });
  assert.ok(errors.some((e) => e.includes('placeholder')));
});
```

- [ ] **Step 2: تشغيله والتأكد أنه أحمر للسبب الصحيح**

Run: `node --test lab/tests/config.test.mjs`
Expected: FAIL عند `Cannot find module .../render-config.mjs` (الملفات غير موجودة بعد) — لا FAIL بسبب صياغة.

- [ ] **Step 3: القالب**

`lab/traccar/kidguard-lab.template.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE properties SYSTEM 'http://java.sun.com/dtd/properties.dtd'>
<!-- LAB ONLY. Not a deployment config. Values marked ${VAR} are injected locally. -->
<properties>

    <entry key='database.driver'>org.h2.Driver</entry>
    <entry key='database.url'>jdbc:h2:./lab-data/database</entry>
    <entry key='database.user'>sa</entry>
    <entry key='database.password' />

    <entry key='web.address'>127.0.0.1</entry>
    <entry key='web.port'>8082</entry>

    <entry key='protocols.enable'>gt06,owntracks,osmand</entry>
    <entry key='database.registerUnknown'>false</entry>

    <entry key='event.forward.url'>http://127.0.0.1:${LAB_FORWARD_PORT}/alert</entry>

    <entry key='notificator.telegram.key'>${LAB_TELEGRAM_BOT_TOKEN}</entry>
    <entry key='notificator.telegram.chatId'>${LAB_TELEGRAM_CHAT_ID}</entry>
    <entry key='notificator.telegram.sendLocation'>true</entry>

    <entry key='mail.smtp.host'></entry>

    <entry key='logger.console'>true</entry>
    <entry key='logger.fullStackTraces'>true</entry>

</properties>
```

- [ ] **Step 4: المولّد**

`lab/scripts/render-config.mjs`:

```js
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const REQUIRED = [
  'LAB_ADMIN_EMAIL', 'LAB_ADMIN_PASSWORD',
  'LAB_TELEGRAM_BOT_TOKEN', 'LAB_TELEGRAM_CHAT_ID',
];

const DEFAULTS = { LAB_FORWARD_PORT: '5199' };

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderConfig(template, env) {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`missing env: ${missing.join(', ')}`);
  }
  const values = { ...DEFAULTS, ...process.env, ...env };
  return template.replace(
    /\$\{([A-Z0-9_]+)\}/g,
    (marker, name) => (values[name] === undefined ? marker : escapeXml(values[name])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const template = await readFile(
    new URL('../traccar/kidguard-lab.template.xml', import.meta.url), 'utf8');
  const target = new URL('../traccar/kidguard-lab.xml', import.meta.url);
  await writeFile(target, renderConfig(template, process.env), 'utf8');
  console.log(`wrote ${fileURLToPath(target)} (lab-only, gitignored)`);
}
```

- [ ] **Step 5: المتحقّق**

`lab/scripts/check-config.mjs`:

```js
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const RULES = {
  'database.driver': (v) => v === 'org.h2.Driver' || 'must be org.h2.Driver',
  'database.url': (v) => v.startsWith('jdbc:h2:./lab-data/') || 'must stay inside ./lab-data/',
  'database.user': (v) => v === 'sa' || 'lab uses sa (H2, localhost only)',
  'web.address': (v) => v === '127.0.0.1' || 'lab web UI must bind localhost',
  'web.port': (v) => v === '8082' || 'expected 8082',
  'protocols.enable': (v) => v === 'gt06,owntracks,osmand' || 'expected gt06,owntracks,osmand',
  'database.registerUnknown': (v) => v === 'false' || 'whitelist required (spec 9.6)',
  'event.forward.url': (v) => /^http:\/\/127\.0\.0\.1:\$\{LAB_FORWARD_PORT\}\/alert$|^http:\/\/127\.0\.0\.1:\d+\/alert$/.test(v)
    || 'must POST to the lab sink on localhost',
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
    ? new URL(`file:///${pathArg.replace(/\\/g, '/')}`)
    : new URL('../traccar/kidguard-lab.xml', import.meta.url);
  const xml = await readFile(target, 'utf8');
  const { errors } = validateConfig(xml, { allowPlaceholders: allow });
  if (errors.length > 0) {
    for (const e of errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log(`config ok: ${fileURLToPath(target)}`);
}
```

- [ ] **Step 6: تشغيل الاختبارات**

Run: `npm run test:lab`
Expected: PASS — كل الاختبارات الخمسة. إن فشل `validation rejects a committed secret-shaped value` فذلك لأن القالب يحوي قيمة حقيقية؛ أعد النص إلى `${LAB_TELEGRAM_BOT_TOKEN}`.

- [ ] **Step 7: تثبيت التنزيل المحلي (خطوة جهاز، لا كود)**

```bash
mkdir -p lab/traccar/download && cd lab/traccar/download
curl -fsSLO https://github.com/traccar/traccar/releases/download/v6.16.0/traccar-other-6.16.0.zip
sha256sum traccar-other-6.16.0.zip | tee traccar-other-6.16.0.zip.sha256
unzip -q traccar-other-6.16.0.zip
ls traccar-other-6.16.0/tracker-server.jar
```

Expected: يوجد `tracker-server.jar` إلى جانب `conf/` و`lib/`. **الصق الـhash في `lab/report/evidence/001-download.txt`** — إن لم يوجد الـjar بهذا الاسم، حدّث `LAB_TRACCAR_DIR` في `run.sh` ولا تغيّر أمر التشغيل.

- [ ] **Step 8: Commit**

```bash
git add lab/tests/config.test.mjs lab/traccar/kidguard-lab.template.xml lab/scripts/render-config.mjs lab/scripts/check-config.mjs lab/README.md
git commit -m "feat(lab): pin Traccar 6.16.0 config template with structural validator"
```

---

## Task 3: آلة قياس الأحداث — sink يلتقط `event.forward.url`

**Files:**
- Create: `lab/sink/lib/parse-event.mjs`, `lab/sink/lib/latency.mjs`, `lab/sink/sink.mjs`, `lab/sink/report.mjs`
- Create: `lab/fixtures/event-geofence-exit.json`, `lab/fixtures/events.ndjson`
- Test: `lab/tests/parse-event.test.mjs`, `lab/tests/latency.test.mjs`, `lab/tests/sink.test.mjs`

**Interfaces:**
- Consumes: حمولة `EventData` من Traccar (الحقول في الجدول أعلاه).
- Produces:
  - `parseEventData(payload: object, receivedAtMs: number) -> Record` بـkeyset ثابت: `eventType, eventId, eventTimeIso, deviceName, uniqueId, deviceId, geofenceId, geofenceName, alarm, latitude, longitude, accuracyMeters, speedKnots, courseDegrees, fixTimeIso, serverTimeIso, receivedAtIso, forwardLatencyMs, ingestLatencyMs`
  - `percentile(sortedValues: number[], p: number) -> number|null`
  - `summarize(records: Record[], expectedTypes?: string[]) -> {total, byType, coverage}`
  - `createSink({eventsFile: string, log?}) -> http.Server`
  - NDJSON: سطر واحد لكل حدث، في `lab/artifacts/events.ndjson`.

- [ ] **Step 1: الاختبارات الفاشلة**

`lab/tests/parse-event.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEventData } from '../sink/lib/parse-event.mjs';

const fixture = JSON.parse(await readFile(
  new URL('../fixtures/event-geofence-exit.json', import.meta.url), 'utf8'));

test('parses a geofenceExit EventData into a flat measurement record', () => {
  const receivedAt = Date.parse('2026-10-05T10:00:03.400Z');
  const record = parseEventData(fixture, receivedAt);
  assert.equal(record.eventType, 'geofenceExit');
  assert.equal(record.deviceName, 'lab-child-1');
  assert.equal(record.uniqueId, 'lab-child-1');
  assert.equal(record.geofenceName, 'school');
  assert.equal(record.latitude, 36.75541);
  assert.equal(record.speedKnots, 3.4);
  assert.equal(record.accuracyMeters, 18);
  assert.equal(record.forwardLatencyMs, 3400);
  assert.equal(record.ingestLatencyMs, 3500);
});

test('alarm payload keeps the alarm name for tier mapping', () => {
  const sos = { ...fixture, geofence: undefined,
                 event: { ...fixture.event, type: 'alarm', geofenceId: 0 },
                 position: { ...fixture.position, attributes: { alarm: 'sos' } } };
  const record = parseEventData(sos, Date.parse('2026-10-05T10:00:01.000Z'));
  assert.equal(record.eventType, 'alarm');
  assert.equal(record.alarm, 'sos');
  assert.equal(record.geofenceName, null);
});

test('rejects a payload with no event type', () => {
  assert.throws(() => parseEventData({}, 0), /event.type/);
  assert.throws(() => parseEventData({ event: {} }, 0), /event.type/);
});

test('tolerates missing position (deviceOffline has none)', () => {
  const offline = { ...fixture, position: undefined,
                    event: { ...fixture.event, type: 'deviceOffline', positionId: 0 } };
  const record = parseEventData(offline, Date.parse('2026-10-05T10:05:00.000Z'));
  assert.equal(record.latitude, null);
  assert.equal(record.ingestLatencyMs, null);
  assert.ok(record.forwardLatencyMs >= 0);
});

test('accepts epoch millis as well as ISO timestamps', () => {
  const eventMs = Date.parse('2026-10-05T10:00:00.000Z');
  const millis = { ...fixture,
    event: { ...fixture.event, eventTime: eventMs },
    position: { ...fixture.position, fixTime: eventMs - 3000, serverTime: eventMs + 500 } };
  const record = parseEventData(millis, eventMs + 1000);
  assert.equal(record.forwardLatencyMs, 1000);
  assert.equal(record.ingestLatencyMs, 3500);
  assert.equal(record.fixTimeIso, '2026-10-05T09:59:57.000Z');
});
```

`lab/fixtures/event-geofence-exit.json` (بأسماء الحقول الحرفية من `Event.java`/`Position.java`/`ServerTime` ISO):

```json
{
  "event": {
    "id": 41,
    "type": "geofenceExit",
    "eventTime": "2026-10-05T10:00:00.000Z",
    "deviceId": 7,
    "positionId": 512,
    "geofenceId": 3,
    "attributes": {}
  },
  "position": {
    "id": 512,
    "deviceId": 7,
    "protocol": "osmand",
    "serverTime": "2026-10-05T10:00:00.500Z",
    "deviceTime": "2026-10-05T10:00:00.000Z",
    "fixTime": "2026-10-05T09:59:57.000Z",
    "valid": true,
    "latitude": 36.75541,
    "longitude": 3.05902,
    "altitude": 12.0,
    "speed": 3.4,
    "course": 141,
    "accuracy": 18,
    "network": null,
    "geofenceIds": [],
    "attributes": { "battery": 74 }
  },
  "device": { "id": 7, "name": "lab-child-1", "uniqueId": "lab-child-1", "groupId": 1, "attributes": {} },
  "geofence": { "id": 3, "name": "school", "area": "CIRCLE (36.7538 3.0588, 100)", "attributes": {} }
}
```

- [ ] **Step 2: تشغيلها**

Run: `node --test lab/tests/parse-event.test.mjs`
Expected: FAIL — `Cannot find module '../sink/lib/parse-event.mjs'`.

- [ ] **Step 3: المحوّل**

`lab/sink/lib/parse-event.mjs`:

```js
const toMillis = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());

const diff = (later, earlier) =>
  (later === null || earlier === null ? null : later - earlier);

export function parseEventData(payload, receivedAtMs) {
  const event = payload && payload.event;
  if (!event || typeof event.type !== 'string' || event.type.length === 0) {
    throw new Error('payload.event.type is required');
  }
  const position = payload.position ?? null;
  const device = payload.device ?? null;
  const geofence = payload.geofence ?? null;

  const eventTime = toMillis(event.eventTime);
  const fixTime = position ? toMillis(position.fixTime ?? position.deviceTime) : null;
  const serverTime = position ? toMillis(position.serverTime) : null;

  return {
    eventType: event.type,
    eventId: event.id ?? null,
    eventTimeIso: iso(eventTime),
    deviceId: event.deviceId ?? device?.id ?? null,
    deviceName: device?.name ?? null,
    uniqueId: device?.uniqueId ?? null,
    geofenceId: event.geofenceId ?? 0,
    geofenceName: geofence?.name ?? null,
    alarm: position?.attributes?.alarm ?? null,
    batteryLevel: position?.attributes?.battery ?? null,
    latitude: position?.latitude ?? null,
    longitude: position?.longitude ?? null,
    accuracyMeters: position?.accuracy ?? null,
    speedKnots: position?.speed ?? null,
    courseDegrees: position?.course ?? null,
    fixTimeIso: iso(fixTime),
    serverTimeIso: iso(serverTime),
    receivedAtIso: new Date(receivedAtMs).toISOString(),
    forwardLatencyMs: diff(receivedAtMs, eventTime),
    ingestLatencyMs: diff(serverTime, fixTime),
  };
}
```

- [ ] **Step 4: إحصاء الأزمنة**

`lab/sink/lib/latency.mjs`:

```js
export function percentile(sortedValues, p) {
  const values = sortedValues.filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const rank = Math.ceil((p / 100) * values.length);
  return values[Math.max(0, Math.min(values.length - 1, rank - 1))];
}

export function summarize(records, expectedTypes = []) {
  const byType = {};
  for (const record of records) {
    const bucket = byType[record.eventType] ?? {
      count: 0, forwardLatencyMs: [], ingestLatencyMs: [], withoutPosition: 0,
    };
    bucket.count += 1;
    if (Number.isFinite(record.forwardLatencyMs)) bucket.forwardLatencyMs.push(record.forwardLatencyMs);
    if (Number.isFinite(record.ingestLatencyMs)) bucket.ingestLatencyMs.push(record.ingestLatencyMs);
    if (record.latitude === null) bucket.withoutPosition += 1;
    byType[record.eventType] = bucket;
  }

  const report = {};
  for (const [type, bucket] of Object.entries(byType)) {
    const forward = bucket.forwardLatencyMs.slice().sort((a, b) => a - b);
    const ingest = bucket.ingestLatencyMs.slice().sort((a, b) => a - b);
    report[type] = {
      count: bucket.count,
      withoutPosition: bucket.withoutPosition,
      forwardP50Ms: percentile(forward, 50),
      forwardP95Ms: percentile(forward, 95),
      forwardMaxMs: forward.length ? forward[forward.length - 1] : null,
      ingestP95Ms: percentile(ingest, 95),
    };
  }

  return {
    total: records.length,
    byType: report,
    coverage: {
      expected: expectedTypes,
      missing: expectedTypes.filter((t) => !byType[t]),
      unexpected: Object.keys(byType).filter((t) => !expectedTypes.includes(t)),
    },
  };
}
```

اختبارها في `lab/tests/latency.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { percentile, summarize } from '../sink/lib/latency.mjs';

test('percentile uses nearest-rank', () => {
  const sorted = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  assert.equal(percentile(sorted, 50), 500);
  assert.equal(percentile(sorted, 95), 1000);
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([5, Number.NaN, 7], 50), 5);
});

const fixture = (await readFile(new URL('../fixtures/events.ndjson', import.meta.url), 'utf8'))
  .trim().split('\n').map((line) => JSON.parse(line));

test('summarize counts every type and reports the one that never arrived', () => {
  const summary = summarize(fixture, ['geofenceExit', 'alarm', 'deviceOverspeed']);
  assert.equal(summary.byType.geofenceExit.count, 5);
  assert.equal(summary.byType.alarm.count, 2);
  assert.equal(summary.byType.deviceOffline.withoutPosition, 2);
  assert.deepEqual(summary.coverage.missing, ['deviceOverspeed']);
  assert.equal(summary.byType.geofenceExit.forwardP95Ms, 4200);
  assert.deepEqual(summary.coverage.unexpected.sort(), ['deviceMoving', 'deviceOffline']);
});
```

`lab/fixtures/events.ndjson` (12 سطراً؛ الأزمنة مضبوطة لتعطي عددات أعلاه — 5×geofenceExit بأزمنة تمرير 900/1200/1800/2500/**4200**، 2×alarm، 3×deviceMoving، 2×deviceOffline بلا موضع):

```
{"eventType":"geofenceExit","eventTimeIso":"2026-10-05T10:00:00.000Z","forwardLatencyMs":900,"ingestLatencyMs":1200,"latitude":36.75541,"longitude":3.05902,"geofenceName":"school"}
{"eventType":"geofenceExit","eventTimeIso":"2026-10-05T10:04:00.000Z","forwardLatencyMs":1200,"ingestLatencyMs":1500,"latitude":36.75601,"longitude":3.05962,"geofenceName":"school"}
{"eventType":"geofenceExit","eventTimeIso":"2026-10-05T10:08:00.000Z","forwardLatencyMs":1800,"ingestLatencyMs":2000,"latitude":36.75661,"longitude":3.06022,"geofenceName":"school"}
{"eventType":"geofenceExit","eventTimeIso":"2026-10-05T10:12:00.000Z","forwardLatencyMs":2500,"ingestLatencyMs":2600,"latitude":36.75721,"longitude":3.06082,"geofenceName":"school"}
{"eventType":"geofenceExit","eventTimeIso":"2026-10-05T10:16:00.000Z","forwardLatencyMs":4200,"ingestLatencyMs":4000,"latitude":36.75781,"longitude":3.06142,"geofenceName":"school"}
{"eventType":"alarm","eventTimeIso":"2026-10-05T10:20:00.000Z","forwardLatencyMs":700,"ingestLatencyMs":900,"latitude":36.7580,"longitude":3.0620,"alarm":"sos"}
{"eventType":"alarm","eventTimeIso":"2026-10-05T10:22:00.000Z","forwardLatencyMs":800,"ingestLatencyMs":1000,"latitude":36.7582,"longitude":3.0622,"alarm":"sos"}
{"eventType":"deviceMoving","eventTimeIso":"2026-10-05T10:24:00.000Z","forwardLatencyMs":600,"ingestLatencyMs":800,"latitude":36.7590,"longitude":3.0630}
{"eventType":"deviceMoving","eventTimeIso":"2026-10-05T10:26:00.000Z","forwardLatencyMs":650,"ingestLatencyMs":820,"latitude":36.7595,"longitude":3.0635}
{"eventType":"deviceMoving","eventTimeIso":"2026-10-05T10:28:00.000Z","forwardLatencyMs":700,"ingestLatencyMs":900,"latitude":36.7600,"longitude":3.0640}
{"eventType":"deviceOffline","eventTimeIso":"2026-10-05T10:30:00.000Z","forwardLatencyMs":1100,"ingestLatencyMs":null,"latitude":null,"longitude":null}
{"eventType":"deviceOffline","eventTimeIso":"2026-10-05T10:35:00.000Z","forwardLatencyMs":1300,"ingestLatencyMs":null,"latitude":null,"longitude":null}
```

- [ ] **Step 5: sink**

`lab/sink/sink.mjs`:

```js
import { createServer } from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEventData } from './lib/parse-event.mjs';

const MAX_BODY_BYTES = 1024 * 1024;

export function createSink({ eventsFile, log = console }) {
  return createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/alert') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'POST /alert only' }));
      return;
    }

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'payload too large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    }

    let record;
    try {
      record = parseEventData(JSON.parse(Buffer.concat(chunks).toString('utf8')), Date.now());
    } catch (error) {
      log.error(`bad forward payload: ${error.message}`);
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    await mkdir(dirname(resolve(eventsFile)), { recursive: true });
    await appendFile(eventsFile, `${JSON.stringify(record)}\n`);
    log.log(`${record.eventType} forward=${record.forwardLatencyMs}ms`);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, eventType: record.eventType }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.LAB_FORWARD_PORT ?? 5199);
  const eventsFile = process.env.LAB_EVENTS_FILE
    ?? fileURLToPath(new URL('../artifacts/events.ndjson', import.meta.url));
  createSink({ eventsFile }).listen(port, '127.0.0.1', () => {
    console.log(`sink: http://127.0.0.1:${port}/alert -> ${eventsFile}`);
  });
}
```

- [ ] **Step 6: اختبار sink حقيقي (بدون Traccar)**

`lab/tests/sink.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSink } from '../sink/sink.mjs';

const silent = { log() {}, error() {} };

test('records a forwarded event and answers 200, rejects junk with 400', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kidguard-lab-sink-'));
  const eventsFile = join(dir, 'events.ndjson');
  const server = createSink({ eventsFile, log: silent });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;

  const payload = JSON.parse(await readFile(
    new URL('../fixtures/event-geofence-exit.json', import.meta.url), 'utf8'));

  const ok = await fetch(`${base}/alert`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, eventType: 'geofenceExit' });

  const junk = await fetch(`${base}/alert`, { method: 'POST', body: 'not json' });
  assert.equal(junk.status, 400);

  const missing = await fetch(`${base}/alert`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(missing.status, 400);

  const wrongPath = await fetch(`${base}/other`, { method: 'POST', body: '{}' });
  assert.equal(wrongPath.status, 404);

  const lines = (await readFile(eventsFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).eventType, 'geofenceExit');

  server.close();
  await rm(dir, { recursive: true, force: true });
});
```

Run: `node --test lab/tests/sink.test.mjs`
Expected: PASS.

- [ ] **Step 7: تقرير النص**

`lab/sink/report.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { summarize } from './lib/latency.mjs';

const TARGET_P95_MS = 30_000; // design spec section 8: source -> server <= 30s p95

export function toMarkdown(summary) {
  const rows = Object.entries(summary.byType).map(([type, m]) =>
    `| ${type} | ${m.count} | ${m.forwardP50Ms ?? '-'} | ${m.forwardP95Ms ?? '-'}`
    + ` | ${m.forwardMaxMs ?? '-'} | ${m.ingestP95Ms ?? '-'} | ${m.withoutPosition} |`);
  const verdict = Object.values(summary.byType).every((m) =>
    m.forwardP95Ms === null || m.forwardP95Ms <= TARGET_P95_MS)
    ? `PASS p95 <= ${TARGET_P95_MS} ms` : `FAIL p95 > ${TARGET_P95_MS} ms`;
  return [
    `# M0 measurement report`,
    ``,
    `records: ${summary.total}`,
    ``,
    `| event | count | p50 forward (ms) | p95 forward (ms) | max forward (ms) | p95 ingest (ms) | without position |`,
    `|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
    `verdict: ${verdict}`,
    `missing expected types: ${summary.coverage.missing.join(', ') || 'none'}`,
    `unexpected types: ${summary.coverage.unexpected.join(', ') || 'none'}`,
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
    ? new URL(`file:///${process.argv[2].replace(/\\/g, '/')}`)
    : new URL('../artifacts/events.ndjson', import.meta.url);
  const expected = (process.argv[3] ?? 'geofenceExit,alarm,deviceOffline').split(',');
  const records = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(toMarkdown(summarize(records, expected)));
}
```

وأضف في `lab/tests/latency.test.mjs`:

```js
test('markdown verdict flags a p95 above the 30s budget', async () => {
  const { toMarkdown } = await import('../sink/report.mjs');
  const md = toMarkdown(summarize(fixture, ['geofenceExit']));
  assert.match(md, /PASS p95/);
  const slow = fixture.map((r) => ({ ...r, forwardLatencyMs: 31_000 }));
  assert.match(toMarkdown(summarize(slow, ['geofenceExit'])), /FAIL p95/);
});
```

- [ ] **Step 8: CI ثم Commit**

```bash
npm run test:lab
git add lab/sink lab/fixtures lab/tests
git commit -m "feat(lab): event sink and latency summariser for event.forward.url"
git push
gh run list --branch lab/m0 --limit 1
```

Expected: CI أخضر برقم run مسجّل.

---

## Task 4: هندسة المناطق — مولّدات WKT بمقاييس Traccar وسيناريوهات القبول

**Files:**
- Create: `lab/sink/lib/geo.mjs`
- Create: `lab/scenarios/school-exit.json`, `lab/scenarios/route-park.json`
- Test: `lab/tests/geo.test.mjs`, `lab/tests/scenarios.test.mjs`

**Interfaces:**
- Consumes: لا شيء.
- Produces:
  - `distanceMeters(lat1, lon1, lat2, lon2) -> number`
  - `circleArea(centerLat, centerLon, radiusMeters) -> string` بصيغة `CIRCLE(lat lon, r)` (مرفوض إن `r < 50`)
  - `polylineArea(points, bufferMeters) -> {area: string, attributes: {polylineDistance: number}}`
  - `parseCircle(area: string) -> {lat, lon, radiusMeters}`
  - `validateScenario(obj) -> string[]`

- [ ] **Step 1: اختبار يرفض ترتيب WKT القياسي**

`lab/tests/geo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleArea, parseCircle, polylineArea, distanceMeters } from '../sink/lib/geo.mjs';

test('circle WKT is lat-lon order like Traccar, not standard WKT', () => {
  assert.equal(circleArea(36.7538, 3.0588, 100), 'CIRCLE (36.7538 3.0588, 100)');
  assert.deepEqual(parseCircle('CIRCLE (36.7538 3.0588, 100)'),
    { lat: 36.7538, lon: 3.0588, radiusMeters: 100 });
});

test('a 10 m circle is rejected: real-world exit detection needs >=50 m buffer', () => {
  assert.throws(() => circleArea(36.7538, 3.0588, 10), /50/);
});

test('route zones are LINESTRING with a polylineDistance buffer', () => {
  const zone = polylineArea(
    [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7548, lon: 3.0598 }], 80);
  assert.equal(zone.area, 'LINESTRING (36.7538 3.0588, 36.7548 3.0598)');
  assert.equal(zone.attributes.polylineDistance, 80);
  assert.throws(() => polylineArea([{ lat: 1, lon: 1 }]), /at least 2/);
});

test('haversine distance is metres and sane at 0.001 deg latitude', () => {
  assert.ok(Math.abs(distanceMeters(36.7538, 3.0588, 36.7548, 3.0588) - 111.2) < 2);
});
```

Run: `node --test lab/tests/geo.test.mjs`
Expected: FAIL — `Cannot find module '../sink/lib/geo.mjs'`.

- [ ] **Step 2: `lab/sink/lib/geo.mjs`**

```js
const EARTH_RADIUS_METERS = 6371000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function circleArea(centerLat, centerLon, radiusMeters) {
  if (!Number.isFinite(centerLat) || Math.abs(centerLat) > 90) throw new Error('centerLat out of range');
  if (!Number.isFinite(centerLon) || Math.abs(centerLon) > 180) throw new Error('centerLon out of range');
  if (!(radiusMeters >= 50)) throw new Error('radius must be >= 50 m (design spec section 6)');
  return `CIRCLE (${centerLat} ${centerLon}, ${radiusMeters})`;
}

export function parseCircle(area) {
  const match = /^CIRCLE \(([-\d.]+) ([-\d.]+), ([\d.]+)\)$/.exec(area.trim());
  if (!match) throw new Error(`cannot parse circle area: ${area}`);
  return { lat: Number(match[1]), lon: Number(match[2]), radiusMeters: Number(match[3]) };
}

export function polylineArea(points, bufferMeters = 100) {
  if (points.length < 2) throw new Error('a route zone needs at least 2 points');
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) throw new Error('point must have lat/lon');
  }
  return {
    area: `LINESTRING (${points.map((p) => `${p.lat} ${p.lon}`).join(', ')})`,
    attributes: { polylineDistance: bufferMeters },
  };
}
```

- [ ] **Step 3: السيناريوهات**

`lab/scenarios/school-exit.json` — ثلاث قراءات داخل دائرة المدرسة ثم ثلاث خارجها (نقطة المركزة اصطناعية؛ الإزاحة ≈111م لكل 0.001°):

```json
{
  "name": "school-exit",
  "expectEvent": "geofenceExit",
  "zone": { "type": "circle", "lat": 36.7538, "lon": 3.0588, "radiusMeters": 100, "name": "school" },
  "readings": [
    { "offsetSec": 0,   "lat": 36.75380, "lon": 3.05880, "accuracy": 12, "speedKnots": 0,   "course": 0 },
    { "offsetSec": 30,  "lat": 36.75395, "lon": 3.05890, "accuracy": 12, "speedKnots": 1.2, "course": 45 },
    { "offsetSec": 60,  "lat": 36.75410, "lon": 3.05900, "accuracy": 15, "speedKnots": 1.8, "course": 45 },
    { "offsetSec": 90,  "lat": 36.75475, "lon": 3.05955, "accuracy": 15, "speedKnots": 3.4, "course": 45 },
    { "offsetSec": 120, "lat": 36.75541, "lon": 3.06010, "accuracy": 18, "speedKnots": 3.4, "course": 45 },
    { "offsetSec": 150, "lat": 36.75610, "lon": 3.06070, "accuracy": 18, "speedKnots": 4.0, "course": 45 }
  ]
}
```

`lab/scenarios/route-park.json`:

```json
{
  "name": "route-park",
  "expectEvent": "geofenceExit",
  "zone": {
    "type": "polyline",
    "name": "walk-to-park",
    "points": [
      { "lat": 36.7538, "lon": 3.0588 },
      { "lat": 36.7552, "lon": 3.0605 },
      { "lat": 36.7568, "lon": 3.0621 }
    ],
    "bufferMeters": 80
  },
  "readings": [
    { "offsetSec": 0,   "lat": 36.75382, "lon": 3.05882, "accuracy": 10, "speedKnots": 1.5, "course": 40 },
    { "offsetSec": 60,  "lat": 36.75520, "lon": 3.06050, "accuracy": 10, "speedKnots": 1.5, "course": 40 },
    { "offsetSec": 120, "lat": 36.75680, "lon": 3.06210, "accuracy": 12, "speedKnots": 1.6, "course": 40 },
    { "offsetSec": 180, "lat": 36.75900, "lon": 3.06600, "accuracy": 12, "speedKnots": 5.0, "course": 60 }
  ]
}
```

- [ ] **Step 4: متحقّق السيناريوهات**

`lab/tests/scenarios.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validateScenario } from '../scripts/scenario-lib.mjs';

const KNOWN_TYPES = ['geofenceExit', 'geofenceEnter', 'alarm', 'deviceOffline',
  'deviceOverspeed', 'unaccompaniedMotion', 'deviceMoving', 'deviceStopped'];

for (const file of await readdir(new URL('../scenarios/', import.meta.url))) {
  test(`scenario ${file} is well formed and geometrically meaningful`, async () => {
    const scenario = JSON.parse(await readFile(
      new URL(`../scenarios/${file}`, import.meta.url), 'utf8'));
    assert.deepEqual(validateScenario(scenario, KNOWN_TYPES), []);
  });
}

test('school-exit really leaves the circle', async () => {
  const scenario = JSON.parse(await readFile(
    new URL('../scenarios/school-exit.json', import.meta.url), 'utf8'));
  const { distanceMeters } = await import('../sink/lib/geo.mjs');
  const { parseCircle } = await import('../sink/lib/geo.mjs');
  const circle = { lat: scenario.zone.lat, lon: scenario.zone.lon, radiusMeters: scenario.zone.radiusMeters };
  const first = scenario.readings[0];
  const last = scenario.readings[scenario.readings.length - 1];
  assert.ok(distanceMeters(first.lat, first.lon, circle.lat, circle.lon) < circle.radiusMeters);
  assert.ok(distanceMeters(last.lat, last.lon, circle.lat, circle.lon) > circle.radiusMeters + 50);
});
```

- [ ] **Step 5: `lab/scripts/scenario-lib.mjs`**

```js
import { circleArea, parseCircle } from '../sink/lib/geo.mjs';

export function validateScenario(scenario, knownTypes) {
  const errors = [];
  if (!scenario.name) errors.push('name is required');
  if (!knownTypes.includes(scenario.expectEvent)) errors.push(`unknown expectEvent: ${scenario.expectEvent}`);
  if (!Array.isArray(scenario.readings) || scenario.readings.length < 4) {
    errors.push('at least 4 readings are required');
  }
  let previous = -1;
  for (const [index, reading] of (scenario.readings ?? []).entries()) {
    if (!(reading.offsetSec > previous)) errors.push(`reading ${index}: offsetSec must increase`);
    previous = reading.offsetSec;
    if (!Number.isFinite(reading.lat) || !Number.isFinite(reading.lon)) errors.push(`reading ${index}: lat/lon`);
    if (!(reading.accuracy >= 0)) errors.push(`reading ${index}: accuracy required`);
  }
  if (scenario.zone?.type === 'circle') {
    try { parseCircle(circleArea(scenario.zone.lat, scenario.zone.lon, scenario.zone.radiusMeters)); }
    catch (error) { errors.push(`zone: ${error.message}`); }
  } else if (scenario.zone?.type === 'polyline') {
    if ((scenario.zone.points ?? []).length < 2) errors.push('polyline zone needs >= 2 points');
    if (!(scenario.zone.bufferMeters >= 50)) errors.push('polyline buffer must be >= 50 m');
  } else {
    errors.push('zone must be circle or polyline');
  }
  return errors;
}

export function toOsmAndParams(uniqueId, reading, absoluteTimeSec) {
  return [
    ['id', uniqueId],
    ['valid', 'true'],
    ['timestamp', String(Math.floor(absoluteTimeSec))],
    ['lat', reading.lat],
    ['lon', reading.lon],
    ['accuracy', reading.accuracy],
    ['speed', reading.speedKnots],
    ['bearing', reading.course ?? 0],
  ];
}
```

- [ ] **Step 6: CI ثم Commit**

```bash
npm run test:lab
git add lab/sink/lib/geo.mjs lab/scripts/scenario-lib.mjs lab/scenarios \
        lab/tests/geo.test.mjs lab/tests/scenarios.test.mjs
git commit -m "feat(lab): Traccar-ordered WKT builders and geofence scenario corpus"
git push && gh run list --branch lab/m0 --limit 1
```

---

## Task 5: تهيئة الخادم عبر API — admin، إغلاق التسجيل، جهاز، منطقة، وليّان

**Files:**
- Create: `lab/scripts/api.mjs`, `lab/scripts/bootstrap.mjs`
- Test: `lab/tests/api.test.mjs`

**Interfaces:**
- Consumes: `LAB_API_URL` (افتراضي `http://127.0.0.1:8082/api`), `LAB_ADMIN_EMAIL`, `LAB_ADMIN_PASSWORD`, `LAB_DEVICE_UNIQUE_ID` (افتراضي `lab-child-1`), `LAB_GUARDIAN2_EMAIL/PASSWORD`.
- Produces:
  - `createApiClient({baseUrl, email, password}) -> {get, post, put, remove}` حيث الأخطاء ترمي `ApiError(status, bodyText)`
  - `buildUserPayload({name, email, password})`, `buildDevicePayload({name, uniqueId})`, `buildCircleGeofencePayload({name, lat, lon, radiusMeters})`, `buildRouteGeofencePayload({name, points, bufferMeters})`, `buildNotificationPayload({type, notificators, always, description})` — كلها دوال خالصة.
  - `buildPermissionPayload(ownerKey, ownerId, propertyKey, propertyId)` يُرجع خريطة مفتاحين `{key1: id1, key2: id2}` — **أربعة وسائط مرتّبة لا كائن**: المالك أولاً ثم الخاصية، وهما مفتاحان فقط بلا `type` (`Permission.java:54-66`. الأمثلة: `('userId', g, 'deviceId', d)` لمشاركة ولي، `('deviceId', d, 'geofenceId', z)` لربط منطقة، `('deviceId', d, 'notificationId', n)` و`('userId', g, 'notificationId', n)` لاشتراك إنذار.
  - `bootstrap(env) -> {client, steps: [{name, result: 'created'|'exists'|'failed', detail}]}` وتُنشئ بالترتيب: admin ← registration-off ← device ← `school` (دائرة) ← `walk-to-park` (مسار) ← guardian-2 ← notification.
  - `GET /api/devices?...` و`POST /api/geofences` و`POST /api/notifications` و`POST /api/permissions` تُستعمل بأسماء المسارات المثبّتة (`DeviceResource.java:57`، `GeofenceResource.java:27`، `NotificationResource.java:53`، `PermissionsResource.java:45`). **تحذير من مصدر موثّق:** ملف `openapi.yaml` المرفق مع نسخة المصدر **غير كامل** — مخطط `Geofence` فيه يسرد `name/area/calendarId/attributes` فقط، ومخطط `Notification` لا يسرد `deviceId` إطلاقاً مع أن النموذج يملكه. لذا لا تُقرأ هذه الوثيقة كقائمة حقول إلزامية، ولا تُخترع حقول: أول تشغيل حيّ في Task 6 يسجّل الأجسام المرفوضة حرفياً في `002-permission-shape.txt`، وتُصحَّح البنّاءات لتطابق الخادم لا الوثيقة.

- [ ] **Step 1: اختبارات بنّاءات الحِمل**

`lab/tests/api.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserPayload, buildDevicePayload, buildCircleGeofencePayload,
  buildRouteGeofencePayload, buildNotificationPayload, buildPermissionPayload, ApiError,
} from '../scripts/api.mjs';

test('admin payload never carries a real child name', () => {
  const payload = buildUserPayload({ name: 'lab-admin', email: 'lab@example.com', password: 'secret' });
  assert.deepEqual(Object.keys(payload).sort(), ['name', 'password', 'email']);
});

test('device payload uses uniqueId as the stable key', () => {
  assert.deepEqual(buildDevicePayload({ name: 'lab-child-1', uniqueId: 'lab-child-1' }),
    { name: 'lab-child-1', uniqueId: 'lab-child-1', groupId: 1 });
});

test('circle geofence payload keeps Traccar WKT ordering and the 50 m floor', () => {
  const payload = buildCircleGeofencePayload({ name: 'school', lat: 36.7538, lon: 3.0588, radiusMeters: 100 });
  assert.equal(payload.area, 'CIRCLE (36.7538 3.0588, 100)');
  assert.equal(payload.name, 'school');
  assert.throws(() => buildCircleGeofencePayload({ name: 'x', lat: 1, lon: 1, radiusMeters: 10 }), /50/);
});

test('route geofence payload is a LINESTRING with a polylineDistance buffer', () => {
  const payload = buildRouteGeofencePayload({
    name: 'walk-to-park',
    points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7568, lon: 3.0621 }],
    bufferMeters: 80,
  });
  assert.equal(payload.area, 'LINESTRING (36.7538 3.0588, 36.7568 3.0621)');
  assert.equal(payload.attributes.polylineDistance, 80);
});

test('notification payload carries type + channels only, never a device or owner id', () => {
  assert.deepEqual(
    buildNotificationPayload({ type: 'geofenceExit', notificators: 'telegram,email' }),
    { type: 'geofenceExit', notificators: 'telegram,email', always: false });
});

test('permission payload is an ordered two-key id map with no type field', () => {
  assert.deepEqual(buildPermissionPayload('userId', 2, 'deviceId', 7), { userId: 2, deviceId: 7 });
  assert.deepEqual(buildPermissionPayload('deviceId', 7, 'notificationId', 3), { deviceId: 7, notificationId: 3 });
  assert.throws(() => buildPermissionPayload('userId', 2, 'user', 7), /Id/);
  assert.throws(() => buildPermissionPayload('userId', 2, 'userId', 7), /distinct/);
});

test('ApiError carries status and body', () => {
  const error = new ApiError(401, 'no session');
  assert.equal(error.status, 401);
  assert.match(error.message, /401/);
});
```

Run: `node --test lab/tests/api.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/api.mjs'`.

- [ ] **Step 2: `lab/scripts/api.mjs`**

```js
import { circleArea, polylineArea } from '../sink/lib/geo.mjs';

export class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${body.slice(0, 400)}`);
    this.status = status;
    this.body = body;
  }
}

export function buildUserPayload({ name, email, password }) {
  return { name, email, password };
}

export function buildDevicePayload({ name, uniqueId, groupId = 1 }) {
  return { name, uniqueId, groupId };
}

export function buildCircleGeofencePayload({ name, lat, lon, radiusMeters }) {
  return { name, area: circleArea(lat, lon, radiusMeters) };
}

export function buildNotificationPayload({ type, notificators, always = false, description }) {
  return { type, notificators, always, ...(description ? { description } : {}) };
}

// الإذن خريطة من مفتاحين رقميين فقط، والاتجاه = الترتيب (المالك ثم الخاصية): Permission.java:54-66
export function buildPermissionPayload(ownerKey, ownerId, propertyKey, propertyId) {
  if (!/Id$/.test(ownerKey) || !/Id$/.test(propertyKey)) {
    throw new Error('permission keys must end with Id (userId/deviceId/geofenceId/notificationId)');
  }
  if (ownerKey === propertyKey) throw new Error('permission needs two distinct keys');
  return { [ownerKey]: ownerId, [propertyKey]: propertyId };
}

export function createApiClient({ baseUrl, email, password }) {
  const basic = 'Basic ' + Buffer.from(`${email}:${password}`).toString('base64');

  async function request(method, path, body, { expectJson = true } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: basic, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, text);
    if (!expectJson || text === '') return null;
    return JSON.parse(text);
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    remove: (path) => request('DELETE', path),
  };
}
```

- [ ] **Step 3: `lab/scripts/bootstrap.mjs` — الهيكل + خطوة المدير**

```js
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createApiClient, buildUserPayload, buildDevicePayload,
  buildCircleGeofencePayload, buildRouteGeofencePayload,
  buildNotificationPayload, buildPermissionPayload,
} from './api.mjs';

async function runSteps(client, env) {
  const results = [];
  async function step(name, run) {
    try {
      results.push({ name, result: 'created', detail: await run() });
    } catch (error) {
      if (error.status === 400 || error.status === 409 || /already|exists/i.test(error.message ?? '')) {
        results.push({ name, result: 'exists', detail: String(error.body ?? error.message).slice(0, 120) });
      } else {
        results.push({ name, result: 'failed', detail: error.message });
        throw error;
      }
    }
  }

  // 1. أول مستخدم يصبح administrator تلقائياً ما دامت القاعدة فارغة (UserResource.java:113)
  let adminId;
  await step('admin', async () => {
    const server = await client.get('/server');
    if (server.newServer !== true) {
      const users = await client.get('/users');
      adminId = users.find((u) => u.email === env.LAB_ADMIN_EMAIL)?.id;
      return `already initialised, admin id=${adminId}`;
    }
    const user = await client.post('/users', buildUserPayload({
      name: 'lab-admin', email: env.LAB_ADMIN_EMAIL, password: env.LAB_ADMIN_PASSWORD }));
    adminId = user.id;
    return `id=${user.id}`;
  });

  return results;
}

export async function bootstrap(env) {
  const client = createApiClient({
    baseUrl: env.LAB_API_URL ?? 'http://127.0.0.1:8082/api',
    email: env.LAB_ADMIN_EMAIL,
    password: env.LAB_ADMIN_PASSWORD,
  });
  return { client, steps: await runSteps(client, env) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { steps } = await bootstrap(process.env);
  for (const r of steps) console.log(`${r.result.toUpperCase()} ${r.name}: ${r.detail ?? ''}`);
}
```

`GET /api/server` عام (`@PermitAll`، `ServerResource.java:94-112`) و`newServer:true` تعني «لا مستخدمين بعد»، لذا هذه الخطوة تعمل قبل أي مصادقة فعلية.

- [ ] **Step 4: بقية خطوات التهيئة — تُدرج داخل `runSteps` قبل `return results` بالترتيب**

```js
  // 2. close self-registration (Server.registration; UserResource.java:117)
  await step('registration-off', async () => {
    const server = await client.get('/server');
    if (server.registration === false) return 'already disabled';
    await client.put('/server', { ...server, registration: false });
    return 'registration=false';
  });

  // 3. the child device = one Traccar device, uniqueId is the stable identity (spec 3)
  let device;
  await step('device', async () => {
    const uniqueId = env.LAB_DEVICE_UNIQUE_ID ?? 'lab-child-1';
    const devices = await client.get('/devices');
    device = devices.find((d) => d.uniqueId === uniqueId);
    if (device) return `id=${device.id} exists`;
    device = await client.post('/devices', buildDevicePayload({ name: uniqueId, uniqueId }));
    return `id=${device.id}`;
  });

  // 4. the school zone, drawn from geometry not localStorage (spec 6)
  let geofence;
  await step('geofence-school', async () => {
    const zones = await client.get('/geofences');
    geofence = zones.find((z) => z.name === 'school');
    if (geofence) return `id=${geofence.id} exists`;
    geofence = await client.post('/geofences', buildCircleGeofencePayload({
      name: 'school', lat: 36.7538, lon: 3.0588, radiusMeters: 100 }));
    return `id=${geofence.id} area=${geofence.area}`;
  });

  // 4b. a route zone = LINESTRING + polylineDistance, never one big circle (spec 6)
  let park;
  await step('geofence-walk-to-park', async () => {
    const route = JSON.parse(await readFile(
      new URL('scenarios/route-park.json', new URL('../', import.meta.url)), 'utf8'));
    const zones = await client.get('/geofences');
    park = zones.find((z) => z.name === route.zone.name);
    if (park) return `id=${park.id} exists`;
    park = await client.post('/geofences', buildRouteGeofencePayload(route.zone));
    return `id=${park.id} buffer=${park.attributes?.polylineDistance}`;
  });

  // 4c. zones are only evaluated when linked to the device: Device -> Geofence, ترتيباً
  for (const zone of [{ name: 'school', ref: () => geofence }, { name: 'walk-to-park', ref: () => park }]) {
    await step(`link-${zone.name}`, async () => {
      const target = zone.ref();
      if (!target?.id) throw new Error(`${zone.name} has no id`);
      await client.post('/permissions',
        buildPermissionPayload('deviceId', device.id, 'geofenceId', target.id));
      return `device ${device.id} -> ${zone.name} ${target.id}`;
    });
  }

  // 5. second guardian, shared to the device (spec 3: 2-3 guardians)
  let guardian2;
  await step('guardian-2', async () => {
    const users = await client.get('/users');
    guardian2 = users.find((u) => u.email === env.LAB_GUARDIAN2_EMAIL);
    if (guardian2) return `id=${guardian2.id} exists`;
    guardian2 = await client.post('/users', buildUserPayload({
      name: 'lab-guardian-2', email: env.LAB_GUARDIAN2_EMAIL, password: env.LAB_GUARDIAN2_PASSWORD }));
    return `id=${guardian2.id}`;
  });

  // 5b. user -> device, always re-posted: running bootstrap twice must not leave a guardian unshared
  await step('guardian-2-device', async () => {
    await client.post('/permissions',
      buildPermissionPayload('userId', guardian2.id, 'deviceId', device.id));
    return `user ${guardian2.id} -> device ${device.id}`;
  });

  // 6. the notification subscription: proof that device sharing alone is not enough.
  //    always:false يجعل ربط Device->Notification إلزامياً (CacheManager.java:126-133)،
  //    وgetNotificationUsers يأخذ تقاطع مصرّحي الـNotification مع مستخدمي الجهاز (:119-124).
  await step('notification-geofenceExit', async () => {
    const notifications = await client.get('/notifications');
    const existing = notifications.find((n) => n.type === 'geofenceExit' && n.description === 'lab-geofenceExit');
    if (existing) return `id=${existing.id} exists`;
    const created = await client.post('/notifications', buildNotificationPayload({
      type: 'geofenceExit', notificators: 'telegram,email', description: 'lab-geofenceExit' }));
    return `id=${created.id} (owner ${adminId} is linked automatically by BaseObjectResource:91-96)`;
  });

  // 6b. two links, in this direction only
  await step('notification-links', async () => {
    const notification = (await client.get('/notifications'))
      .find((n) => n.type === 'geofenceExit' && n.description === 'lab-geofenceExit');
    if (!notification) throw new Error('notification missing after step 6');
    await client.post('/permissions',
      buildPermissionPayload('deviceId', device.id, 'notificationId', notification.id));
    await client.post('/permissions',
      buildPermissionPayload('userId', guardian2.id, 'notificationId', notification.id));
    return `device ${device.id} + guardian ${guardian2.id} -> notification ${notification.id}`;
  });

  return results;
```

ملاحظة للمنفّذ: شكل `/api/permissions` وأجسام `geofence`/`notification` **مصدرها الشيفرة لا التجربة**: خريطة مفتاحين مرتّبة بلا `type`، و`Notification` لا يحمل `deviceId`/`userId`، و`POST` يربط الكائن بمُنشِئه تلقائياً (`Permission.java:54-66`، `Notification.java:25-90`، `BaseObjectResource.java:80-99`). أما `openapi.yaml` المرفق مع نفس النسخة **فغير كامل** (يسرد `Geofence` بلا مالك، و`Notification` بلا جهاز)، فلا تعتمد عليه كقائمة حقول. يبقى التحقق الحيّ إلزامياً لأن شكل الاستجابة لا يُقرأ من الوثيقة: بعد أول `npm run lab:bootstrap` في Task 6 اسأل الخادم عن الروابط التي أنشأها فعلاً، واحفظ الجواب — ولاحظ أن `GET /api/permissions` **للمدير فقط ويجب أن يحمل وسطين مرتّبين** (`?deviceId=<الجهاز>&geofenceId=0`) وإلا انفجر التقسيم الداخلي:

```bash
LAB_ADMIN_EMAIL=... LAB_ADMIN_PASSWORD=... LAB_DEVICE_ID=... node --input-type=module -e "
const { createApiClient } = await import('./lab/scripts/api.mjs');
const c = createApiClient({baseUrl:'http://127.0.0.1:8082/api', email:process.env.LAB_ADMIN_EMAIL, password:process.env.LAB_ADMIN_PASSWORD});
const d = process.env.LAB_DEVICE_ID;
for (const [owner, property] of [['deviceId','geofenceId'],['deviceId','notificationId'],['userId','notificationId']]) {
  try { console.log(owner, property, JSON.stringify(await c.get(`/permissions?${owner}=${d}&${property}=0`))); }
  catch (e) { console.log(owner, property, 'ERR', String(e.message).slice(0, 160)); }
}" > lab/report/evidence/002-permission-shape.txt
```

`LAB_DEVICE_ID` يُقرأ من سطر `CREATED device: id=…` الذي يطبعه `npm run lab:bootstrap` (لا تُفترض قيمته). **الصفر يعني «بلا ترشيح»**: `DatabaseStorage.java:192-198` يضيف شرط المطابقة فقط حين `id > 0`، فـ`?deviceId=<الجهاز>&geofenceId=0` يعيد **كل** روابط الجهاز، ورجوع `[]` بعده يعني فعلاً أن خطوة الربط لم تُنشئ شيئاً (لا أن السؤال خاطئ). **حتى وجود هذا الملف يُعلَّم في التقرير «NOT RUN» إن لم يُلحق**، ثم عدّل البنّاءات لتطابق الخادم لا الوثيقة إن ظهر أي `FAILED <name>: HTTP 4xx …` في مخرجات bootstrap.

- [ ] **Step 5: CI ثم Commit**

```bash
npm run test:lab
git add lab/scripts/api.mjs lab/scripts/bootstrap.mjs lab/tests/api.test.mjs
git commit -m "feat(lab): bootstrap script for admin, registration lock, device, zone, guardians"
git push && gh run list --branch lab/m0 --limit 1
```

---

## Task 6: إثبات السلسلة الحيّة على المعمل — `geofenceExit` حقيقي (**بوابة M0**)

**Files:**
- Create: `lab/scripts/post-position.mjs`, `lab/scripts/scenario.mjs`
- Modify: `lab/README.md` (قسم «تشغيل السلسلة كاملة»)
- Test: امتداد `lab/tests/api.test.mjs` (بنّاء المعاملات) + تشغيل ميداني مُسجَّل

**Interfaces:**
- Consumes: `LAB_OSMAND_HOST` (افتراضي `127.0.0.1`)، `LAB_OSMAND_PORT` (5055)، `LAB_DEVICE_UNIQUE_ID`، ملف السيناريو من `lab/scenarios/`.
- Produces:
  - `osmandBody(params: [string, string|number][]) -> string` (urlencoded)
  - `postPosition({host, port, uniqueId, reading, absoluteTimeSec}) -> Promise<{status}>`
  - CLI: `npm run lab:scenario -- school-exit --speed=1` (السرعة دائماً بصيغة `--speed=N`)
  - سجلات: `lab/artifacts/events.ndjson` + `lab/report/evidence/003-scenario-*.txt`

- [ ] **Step 1: اختبار معاملة osmand بأسماء الحقول الحرفية**

أضف في `lab/tests/api.test.mjs`:

```js
test('osmand body uses the parameter names the decoder accepts', async () => {
  const { osmandBody, OSMAND_PARAM_NAMES } = await import('../scripts/post-position.mjs');
  const body = osmandBody([
    ['id', 'lab-child-1'], ['valid', 'true'], ['timestamp', '1791446400'],
    ['lat', 36.75541], ['lon', 3.0601], ['accuracy', 18], ['speed', 3.4], ['bearing', 45],
  ]);
  for (const name of ['id', 'timestamp', 'lat', 'lon', 'accuracy', 'speed', 'bearing']) {
    assert.ok(body.includes(`${name}=`), name);
  }
  assert.deepEqual(
    OSMAND_PARAM_NAMES.slice(0, 14),
    ['id', 'deviceid', 'notificationToken', 'valid', 'timestamp', 'lat', 'lon', 'location',
     'cell', 'wifi', 'speed', 'bearing', 'altitude', 'accuracy']);
  assert.equal(new URLSearchParams(body).get('speed'), '3.4');
});
```

Run: `node --test lab/tests/api.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/post-position.mjs'`.

- [ ] **Step 2: `lab/scripts/post-position.mjs`**

```js
// Parameter list mirrored from OsmAndProtocolDecoder.java:95-172 (Traccar 6.16.0).
export const OSMAND_PARAM_NAMES = [
  'id', 'deviceid', 'notificationToken', 'valid', 'timestamp', 'lat', 'lon', 'location',
  'cell', 'wifi', 'speed', 'bearing', 'altitude', 'accuracy', 'hdop', 'batt', 'charge',
];

export function osmandBody(params) {
  const unknown = params.map(([k]) => k).filter((k) => !OSMAND_PARAM_NAMES.includes(k));
  if (unknown.length > 0) throw new Error(`unknown osmand params: ${unknown.join(', ')}`);
  return new URLSearchParams(params.map(([k, v]) => [k, String(v)])).toString();
}

export async function postPosition({ host = '127.0.0.1', port = 5055, uniqueId, reading, absoluteTimeSec }) {
  const body = osmandBody([
    ['id', uniqueId],
    ['valid', 'true'],
    ['timestamp', String(Math.floor(absoluteTimeSec))],
    ['lat', reading.lat],
    ['lon', reading.lon],
    ['accuracy', reading.accuracy],
    ['speed', reading.speedKnots],
    ['bearing', reading.course ?? 0],
    ['batt', reading.battery ?? 75],
  ]);
  const response = await fetch(`http://${host}:${port}/`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  await response.text();
  if (!response.ok) {
    throw new Error(`position rejected: HTTP ${response.status} `
      + '(400 means the uniqueId is not registered — database.registerUnknown is false)');
  }
  return { status: response.status };
}
```

- [ ] **Step 3: `lab/scripts/scenario.mjs`**

```js
import { readFile } from 'node:fs/promises';
import { postPosition } from './post-position.mjs';

const [, , nameArg = 'school-exit', speedArg = '--speed=1'] = process.argv;
const speed = Number(speedArg.replace(/^--speed=/, ''));
if (!Number.isFinite(speed) || speed <= 0) {
  throw new Error(`bad --speed "${speedArg}" (use e.g. --speed=1, must be > 0)`);
}
const scenario = JSON.parse(await readFile(
  new URL(`../scenarios/${nameArg.replace(/\.json$/, '')}.json`, import.meta.url), 'utf8'));

const t0 = Math.floor(Date.now() / 1000);
console.log(`scenario ${scenario.name}: ${scenario.readings.length} readings, `
  + `device ${process.env.LAB_DEVICE_UNIQUE_ID ?? 'lab-child-1'}, expect ${scenario.expectEvent}`);

for (const reading of scenario.readings) {
  await postPosition({
    uniqueId: process.env.LAB_DEVICE_UNIQUE_ID ?? 'lab-child-1',
    reading,
    absoluteTimeSec: t0 + Math.round(reading.offsetSec / speed),
  });
  console.log(`  t+${reading.offsetSec}s -> ${reading.lat}, ${reading.lon}`);
  await new Promise((done) => setTimeout(done, Math.max(0, reading.offsetSec / speed - 1) * 1000));
}
console.log('sent. Now read lab/artifacts/events.ndjson and run npm run lab:report');
```

**فخّ معروف يجب احترامه:** `notificator.timeThreshold` = 15 دقيقة (`Keys.java:1438`)؛ أي قراءة بطابع زمني قديم تُمرَّر إلى sink لكن **لا تُنبّه**. لذلك `scenario.mjs` يرسل أزمنة الحالية دائماً، وإن أردت محاكاة تأخير فليكن أقل من 15 دقيقة وإلا فاذكر أن التنبيه مُنع بالسياسة لا بالعطل.

- [ ] **Step 4: تشغيل المعمل كاملاً (ميداني، بنفس الترتيب)**

نافذة 1 — sink:
```bash
mkdir -p lab/artifacts && rm -f lab/artifacts/events.ndjson
node lab/sink/sink.mjs
```
Expected: `sink: http://127.0.0.1:5199/alert -> .../lab/artifacts/events.ndjson`

نافذة 2 — Traccar:
```bash
npm run lab:render && npm run lab:check
bash lab/traccar/run.sh
```
Expected في السجل: أسطر `osmand: bound` و`web: http://127.0.0.1:8082`، وبلا استثناءات. **الصق أول 30 سطراً في `lab/report/evidence/003-scenario-server-boot.txt`.**

نافذة 3 — التهيئة والسيناريوهان:
```bash
npm run lab:bootstrap
npm run lab:scenario -- school-exit --speed=1
npm run lab:scenario -- route-park --speed=1
```
Expected: ستُقرأ 6 مواضع في الأول و4 في الثاني، وخلال ثوانٍ يظهر في نافذة sink سطر `geofenceExit` عن المنطقة `school` وسطر ثانٍ عن `walk-to-park` (دليل أن منطقة المسار `LINESTRING` تُقيَّم فعلاً، لا أن الدائرة وحدها تعمل):
```
geofenceExit forward=NNNNms
```
إن ظهر الأول دون الثاني: المنطقة لم تُربط بالجهاز أو الـbuffer أصغر من الانحراف — راجع سطر `link-walk-to-park` في bootstrap و`GET /api/permissions?deviceId=<id>&geofenceId=0`.

نافذة 4 — القياس:
```bash
npm run lab:report -- lab/artifacts/events.ndjson geofenceExit,deviceMoving
```
Expected: جدول فيه صفّ `geofenceExit` بعدّاد **≥2** (منطقة واحدة لكل سيناريو) وصفّ `deviceMoving`، وكلاهما `verdict: PASS p95 <= 30000 ms`، وعدد أسطر NDJSON لا يقل عن 8 (حدثان + تحركات). للتفريق بين المنطقتين اقرأ حقل `geofence.name` في `events.ndjson` مباشرة:
```bash
grep -o '"name":"[a-z-]*"' lab/artifacts/events.ndjson | sort | uniq -c
```
Expected: عدّاد لأسماء `school` و`walk-to-park` معاً.

- [ ] **Step 5: إن لم يظهر الحدث — لا تُخفِ الفشل، شخّصه بالأدلة**

| الملاحظ | السبب المرجّح | الفحص |
|---|---|---|
| sink لا يستقبل شيئاً | `event.forward.url` لم يُقرأ، أو الـsink ميت | `grep forward lab/traccar/kidguard-lab.xml` ثم `curl -s -X POST http://127.0.0.1:5199/alert -d '{}'` → يجب 400 لا اتصال مرفوض |
| 400 على إرسال الموضع | الـuniqueId غير مسجّل | `npm run lab:bootstrap`؛ تأكد `database.registerUnknown=false` مقصود |
| موضع يصل ولا `geofenceExit` | القراءة داخل الحدود، أو المنطقة لم تُربط بالجهاز | `curl` على `/api/geofences?deviceId=<id>` بـBasic auth؛ وقارن المسافة بـ`radiusMeters` |
| حدث يصل بلا تنبيه | لا سجل `Notification` مطابق أو الولي غير مصرّح عليه | راجع خطوة 6 في Task 5 و`CacheManager.java:119-133` |
| «Skipping notifications for old event» في السجل | طابع زمني أقدم من 15 دقيقة | أعد السيناريو بـ`--speed=1` دون تعديل يدوي للزمن |

- [ ] **Step 6: Commit**

```bash
git add lab/scripts/post-position.mjs lab/scripts/scenario.mjs lab/tests/api.test.mjs lab/README.md lab/report/evidence
git commit -m "feat(lab): synthetic osmand ingestion and scenario replay proving geofenceExit"
git push && gh run list --branch lab/m0 --limit 1
```

**بوابة:** لا تُغلق هذه المهمة إلا بـNDJSON يحوي سطراً حقيقياً `eventType: geofenceExit` من خادم يعمل. بدونه: **M0 لم يُنجز، ولا كود إنتاج**.

---

## Task 7: فحوص الأمان — whitelist، إغلاق التسجيل، رفض بلا مصادقة

**Files:**
- Create: `lab/scripts/security-check.mjs`
- Test: `lab/tests/security.test.mjs`

**Interfaces:**
- Consumes: `LAB_API_URL`, `LAB_OSMAND_HOST/PORT`, `LAB_ADMIN_EMAIL/PASSWORD`.
- Produces: `runSecurityChecks(deps) -> Promise<{checks: [{name, status: 'PASS'|'FAIL', observed}]}>` حيث `deps = {fetch, apiBaseUrl, osmandUrl}` — تُمرَّر التبعيات من الخارج حتى يعمل الاختبار بخادم وهمي بلا شبكة.

- [ ] **Step 1: الاختبار**

`lab/tests/security.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSecurityChecks, checkDefinitions } from '../scripts/security-check.mjs';

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
```

- [ ] **Step 2: `lab/scripts/security-check.mjs`**

```js
import { fileURLToPath } from 'node:url';

export const checkDefinitions = [
  {
    name: 'unauthenticated-devices-401',
    why: 'no anonymous read of children positions',
    async run({ fetch, apiBaseUrl }) {
      const response = await fetch(`${apiBaseUrl}/devices`);
      return { status: response.status === 401 ? 'PASS' : 'FAIL', observed: `HTTP ${response.status}` };
    },
  },
  {
    name: 'self-registration-closed',
    why: 'spec 9.4 — Traccar has no login throttle and registration must be off',
    async run({ fetch, apiBaseUrl }) {
      const response = await fetch(`${apiBaseUrl}/users`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'probe', email: 'probe@example.com', password: 'probe-pass' }),
      });
      const server = await (await fetch(`${apiBaseUrl}/server`)).json();
      const closed = server.registration === false;
      return {
        status: closed && response.status >= 400 ? 'PASS' : 'FAIL',
        observed: `POST /users HTTP ${response.status}; server.registration=${server.registration}`,
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
      return { status: response.status >= 400 ? 'PASS' : 'FAIL', observed: `HTTP ${response.status}` };
    },
  },
  {
    name: 'web-ui-on-localhost-only',
    why: 'lab hardening: the admin UI must not be reachable from the LAN',
    async run({ apiBaseUrl }) {
      const host = new URL(apiBaseUrl).hostname;
      return {
        status: host === '127.0.0.1' ? 'PASS' : 'FAIL',
        observed: `API host is ${host} (set web.address=127.0.0.1; use adb reverse for the phone)`,
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
      checks.push({ name: definition.name, why: definition.why, status: 'FAIL', observed: `error: ${error.message}` });
    }
  }
  return { checks };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const apiBaseUrl = env.LAB_API_URL ?? 'http://127.0.0.1:8082/api';
  const { checks } = await runSecurityChecks({
    fetch, apiBaseUrl,
    osmandUrl: `http://${env.LAB_OSMAND_HOST ?? '127.0.0.1'}:${env.LAB_OSMAND_PORT ?? '5055'}/`,
  });
  for (const check of checks) console.log(`${check.status}  ${check.name}  [${check.observed}]`);
  if (checks.some((c) => c.status !== 'PASS')) process.exit(1);
}
```

- [ ] **Step 3: محلياً وعلى CI**

```bash
node --test lab/tests/security.test.mjs      # Expected: PASS
npm run lab:security | tee lab/report/evidence/004-security.txt   # Expected: 4 PASS
npm run test:lab
```

- [ ] **Step 4: Commit**

```bash
git add lab/scripts/security-check.mjs lab/tests/security.test.mjs lab/report/evidence/004-security.txt
git commit -m "feat(lab): security checks for registration lock, whitelist ingest and API auth"
git push && gh run list --branch lab/m0 --limit 1
```

---

## Task 8: إثبات وصول الإنذار لكل الأولياء (توازي، لا تسلسل)

**Files:**
- Modify: `lab/README.md`, `lab/traccar/kidguard-lab.template.xml` (بريد فقط إن لزم)
- Create: `lab/report/evidence/005-fanout.md`

**Interfaces:**
- Consumes: bot تيليجرام يخصّ المالك، `LAB_TELEGRAM_CHAT_ID`، بريد SMTP عبر `mail.smtp.host` + حساب تطبيقي (ليس كلمة مروره الحقيقية).
- Produces: دليل «كل قناة وصلت لكل وليّ» + لقطات. لا يُنتج كوداً جديداً.

- [ ] **Step 1: قنوات اختبار جاهزة قبل أي سيناريو**

```bash
# من متصفح الخادم أو بالـAPI، مع ملاحظة أن الاختبار يستعمل مستخدم الجلسة الحالي
curl -s -u "$LAB_ADMIN_EMAIL:$LAB_ADMIN_PASSWORD" -X POST http://127.0.0.1:8082/api/notifications/test/telegram
curl -s -u "$LAB_ADMIN_EMAIL:$LAB_ADMIN_PASSWORD" http://127.0.0.1:8082/api/notifications/types | head -c 400
```
Expected: `200` وسجل Traccar بلا `Notification failed`. لو `401` فالمصادقة معطلة (ارفض وارجع لـTask 7).

- [ ] **Step 2: وصلات المستخدم لكل وليّ**

سجّل الولي الثاني بـ`telegramChatId` خاص به (أو بنفس الشات إن كان حساب الأسرة واحداً — واذكر أي الحالتين اختبرت). الـ`id` يُقرأ من سطر `CREATED guardian-2: id=…` الذي يطبعه `npm run lab:bootstrap` (عادةً 2 في قاعدة جديدة)، ولا يُفترض ثابتاً:

```bash
# المسار الصحيح للتحديث هو PUT /api/users/{id} (BaseObjectResource)، وليس /api/users
# LAB_GUARDIAN2_ID = الـid الذي طبعه `npm run lab:bootstrap` على سطر guardian-2 (عادةً 2)
curl -s -u "$LAB_ADMIN_EMAIL:$LAB_ADMIN_PASSWORD" \
  -X PUT "http://127.0.0.1:8082/api/users/${LAB_GUARDIAN2_ID}" \
  -H 'content-type: application/json' \
  -d "{\"id\":${LAB_GUARDIAN2_ID},\"name\":\"lab-guardian-2\",\"email\":\"$LAB_GUARDIAN2_EMAIL\",\"attributes\":{\"telegramChatId\":\"$LAB_GUARDIAN2_CHAT_ID\"}}"
```
Expected: `200` وجسم المستخدم يحوي السمة. **احفظ الرد (بدون رقم الشات الكامل عند النشر العام).** إن ردّ Traccar بأن الجسم ناقص حقولاً إلزامية، فأرسل المستخدم كامماً كما جلبته `GET /api/users/2` بعد تعديل السمة — ولا تخمّن حقلاً جديداً.

- [ ] **Step 3: التجربة الحاسمة — هل تكفي مشاركة الجهاز؟**

أعد Task 6 مع تسجيل الوقت على ساعتين: شاشة التيليجرام وسطر sink.

| الملاحظ | القرار |
|---|---|
| الولي الثاني يستقبل بعد مشاركة الجهاز فقط | توثيق: `CacheManager.getNotificationUsers` يعبر المستخدمين المشتركين؛ دوّن أن التصريح على Notification لم يكن لازماً في نسختك |
| لا يستقبل إلا بعد التصريح على `Notification` | توثيق: القاعدة الحاسمة هي ما في `CacheManager.java:119-124`. أعد خطوة 6 في Task 5 وتحقق، ثم صحّح المواصفة §3 عند إغلاق M0 |

في الحالتين اكتب في `005-fanout.md`: نوع الحدث، الوقت من سجل Traccar، وقت وصول التيليجرام (لقطة بشريط الساعة)، هل القناة البريدية وصلت، وكم ولياً استلم. **التوازي يُثبت بأنهما وصلا قبل انتهاء النافذة نفسها، لا بترتيب الإرسال.**

- [ ] **Step 4: honesty gates (لا تجمّل)**

- push/FCM: **NOT RUN** في M0 (لا خدمة Firebase مهيأة بعد) — يُكتب صراحةً في التقرير، ولا يُعد به.
- SMS/اتصال صوتي: **خارج M0** بقرار المالك (§5.6) — تُذكر كواجهة في M2 لا كإثبات.
- إن فشل البريد بسبب حظر Gmail/2FA: لا تستخدم كلمة المرور الحقيقية؛ أنشئ **App Password** وارفض إدراجه في أي ملف يُرفع.

- [ ] **Step 5: Commit**

```bash
git add lab/report/evidence/005-fanout.md lab/README.md
git commit -m "docs(lab): multi-guardian fan-out evidence and honest NOT RUN list"
git push && gh run list --branch lab/m0 --limit 1
```

---

## Task 9: الهاتف مصدرَ موقع حقيقي — تحقيق على Realme (المسار الأساسي USB/adb)

**Files:**
- Create: `lab/README.md` قسم «الهاتف مصدراً»؛ `lab/report/evidence/006-phone.md`
- Modify: لا كود.

**Interfaces:**
- Consumes: `adb`، منفذ osmand 5055، واجهة الإدارة 8082 على `127.0.0.1`.
- Produces: مقياس AC-1 على مصدر حقيقي (هاتف) لا اصطناعي، مع عمر قراءة ودقة.

**قياسات هذا الجهاز المأخوذة فعلاً (2026-10-05، بـ`ipconfig //all` و`route print` و`adb devices`) — لا تفترض شبكة WiFi:**
- **لا وجود لمحول Wi‑Fi في هذا الحاسوب.** الواجهتان الوحيدتان: `Realtek PCIe GbE` حالتها `Media disconnected`، و`Remote NDIS based Internet Sharing Device` = **ربط هاتفي عبر USB (tethering)**، عنوانه `10.220.50.85/24` وgateway `10.220.50.82` (هو الهاتف).
- `adb` **ليس على PATH**: استعمل `ADB="/c/Users/Administrator/AppData/Local/Android/Sdk/platform-tools/adb.exe"` (الإصدار 1.0.41 / 37.0.1). الجهاز ظاهر بسطر واحد حالته `device`. **لا تنشر رقم الجهاز الكامل في ملفات المستودع؛ اكتفِ بآخر أربع خانات.**
- النتيجة العملية: مسار المعمل الأساسي هو **`adb reverse` فوق USB** — لا يفتح منفذاً على أي شبكة ولا يحتاج قاعدة جدار حماية. عنوان الـtethering يتغيّر كل جلسة، فلا تُثبّته في أي ملف.

- [ ] **Step 1: وصل الهاتف بـUSB وجعل المسار خاصاً بلا جدار حماية**

```bash
ADB="/c/Users/Administrator/AppData/Local/Android/Sdk/platform-tools/adb.exe"
"$ADB" devices                    # Expected: سطر واحد حالته device (اكتفِ بآخر 4 خانات في الدليل)
netstat -ano | grep ":5055"       # Expected: استماع على 127.0.0.1:5055 (هذا كافٍ هنا، لا نحتاج 0.0.0.0)
"$ADB" reverse tcp:5055 tcp:5055  # الهاتف يرسل إلى 127.0.0.1:5055 فيُوصَل إلى خادم الحاسوب عبر USB
"$ADB" reverse tcp:8082 tcp:8082  # لوحة الإدارة تصل من متصفح الهاتف بلا كشفها لأي شبكة
"$ADB" reverse --list             # Expected: سطران 5055 و8082
```
`adb reverse` يجعل المنافذ مستضافة على `127.0.0.1` فقط داخل الهاتف، فلا تُضيف قاعدة جدار حماية ولا تغيّر `web.port` ولا تفتح 5055 للـLAN. هذا يثبت مسار «الهاتف ⇒ خادمنا ⇒ لوحة الولي» ولا يثبت الوصول من شبكة خلوية أو عنوان عام — تُترك تلك للحظة الاستضافة في Task 10.

- [ ] **Step 2: مصدر على الهاتف بلا بناء APK**

خيار M0: Traccar Client (Apache-2.0) من متجر رسمي أو ملف APK رسمي موقّع — لأنه يثبت المسار ولا يُنتج كوداً نملكه. اضبط: `Server host = 127.0.0.1`، `Server port = 5055`، صيغة البيانات OsmAnd، فترة 60ث، «بطارية/وضع منخفض» كما هو. **سجّل إصدار التطبيق ومصدر الـAPK في الدليل.**

- [ ] **Step 3: التحقق من اللوحة من متصفح الهاتف**

من الهاتف افتح `http://127.0.0.1:8082` ودخول بـadmin. إن رفضت اللوحة العمل عبر منفذ معكوس فلا تُصلحها بكشفها للـLAN؛ دوّن الفشل واكتفِ بـAPI من الحاسوب لإثبات القبول في Step 4.
لا تُدخل رقم قفل الشاشة في أي أمر أو ملف؛ اطلب من المالك فتح الجهاز يدوياً وتحقق من الحالة بنفسك.

- [ ] **Step 4: القبول (AC-1 على مصدر حقيقي)**

امشِ 30 متراً وسجّل:
```bash
wc -l lab/artifacts/events.ndjson
npm run lab:report -- lab/artifacts/events.ndjson deviceMoving,geofenceExit
```
Expected: مواضع من `protocol: osmand` باسم الجهاز `lab-child-1`، و`ingestP95Ms` حقيقي (الهاتف→الخادم). **لقطة قبل/بعد** للخريطة في متصفح الهاتف تُحفظ في `evidence/` — أسماء الأطفال الحقيقية ممنوعة في اللقطات.
**بديل إن تعذّر تطبيق خارجي:** أرسل من داخل الهاتف نفسه عبر adb (يستعمل نفس `adb reverse` من Step 1):
```bash
NOW=$("$ADB" shell date +%s | tr -d '\r')   # ثواني Unix الحالية؛ لا تاريخاً قديماً لأن Traccar يتجاهل المواضع الأقدم من 15 دقيقة في التنبيهات
"$ADB" shell curl -s "http://127.0.0.1:5055/?id=lab-child-1&lat=36.7538&lon=3.0588&timestamp=${NOW}&accuracy=12&speed=4.2&bearing=90"
```
تعذّر `curl` على Android شائع؛ حينها افتح الرابط نفسه في متصفح الهاتف بعد حساب `${NOW}` من الطرفية. (هذه أسماء المعلمات التي يقرأها `OsmAndProtocolDecoder` فعلاً: `id`/`lat`/`lon`/`timestamp`/`accuracy`/`speed`/`bearing`؛ و`timestamp` بثواني Unix يضاعفه المفسّر بالم ألف، و`id` مجهول يرد HTTP 400، و`speed` بعقد بحرية). كرر الطلب بمواضع متباعدة 30 متراً. يثبت المسار الفعلي من الجهاز، ويُعلَّم في التقرير أن مصدر المواضع يدوي لا تطبيق رسمي.

- [ ] **Step 5: قياس طزاجة معروضة (أساس §4)**

من نفس الشاشة، دوّن ما يظهر للولي مع كل موضع: عمر القراءة والدقة. إن لم يظهر العمر لأن لوحة Traccar لا تعرضه بالهيأة المطلوبة، فذاك **دليل M1** لا عيب M0 — اكتبه كملاحظة تصميم مؤكدة.

- [ ] **Step 6: إغلاق المعمل والتحقق من عدم بقاء شيء مفتوح (إلزامي)**

```bash
"$ADB" reverse --remove-all ; "$ADB" reverse --list   # Expected: فارغ
netstat -ano | grep ":5055\|:8082"                     # Expected: بعد إيقاف run.sh لا استماع خارج 127.0.0.1
netsh advfirewall firewall show rule name="kidguard-lab-osmand" 2>/dev/null || echo "NO-FIREWALL-RULE-LEFT"
```
استعملنا `adb reverse` فلا يُفترض أي قاعدة. إن اضطررت للوصول عبر tethering (عنوان يتغيّر كل جلسة) فاستعمل قاعدة **مؤقتة** بـ`profile=any` واحذفها فوراً: `netsh advfirewall firewall add rule name="kidguard-lab-osmand" dir=in action=allow protocol=TCP localport=5055 profile=any` ثم `netsh advfirewall firewall delete rule name="kidguard-lab-osmand"`. ألحق مخرجات الحذف في `006-phone.md` كدليل إغلاق.

- [ ] **Step 7: Commit**

```bash
git add lab/report/evidence/006-phone.md lab/README.md
git commit -m "docs(lab): phone-as-position-source over USB adb reverse with cleanup evidence"
git push && gh run list --branch lab/m0 --limit 1
```
الـCI هنا لا يبنى APK (خارج نطاق M0)؛ وظيفته إعادة تشغيل فحوص `lab-ci.yml` على ملفات الدليل المضافة. إن لم يُرجِع `gh` شيئاً فذاك لأن لا عمل على المسار المُفلتَر — دوّن ذلك ولا تعتبره PASS.

---

## Task 10: مذكرة قرار الاستضافة وتقرير M0 وإغلاق البوابة

**Files:**
- Create: `lab/report/decision-hosting.md`, `lab/report/M0-REPORT.md`
- Modify: `docs/superpowers/specs/2026-10-05-parent-side-tracing-design.md` (تصحيحات §3/§6/§10 مطبّقة سلفاً؛ يُضاف هنا ما تُثبته قياسات Task 5–9 فقط)
- Create: `docs/superpowers/plans/2026-10-05-roadmap.md`

**Interfaces:**
- Consumes: `research/hosting-algeria.md` (خارج المستودع — انقل النتائج الحاسمة إلى الداخل، لا تعتمد على مسار محلي)، أرقام Task 6–9.
- Produces: قرار مكتوب: `VPS-PATH` / `BANK-CARD-BLOCKED` / `LAB-ONLY`، وورقة A4 واحدة «ماذا يثبت المنتج حتى الآن».

- [ ] **Step 1: `lab/report/decision-hosting.md`** (محتواه من `research/hosting-algeria.md`، مع مصدر لكل سطر)

```markdown
# قرار الاستضافة — M0

**الحاسم تقنياً:** متتبع GT06 يحتاج TCP عاماً على منفذ ثابت. الأنفاق المجانية
(cloudflared/Tailscale Funnel) تنقل HTTP(S) فقط، ومنتدى Traccar الرسمي يصرّح بأنها
لا تصلح لحماية منافذ البروتوكول؛ وCGNAT لدى مزوّد الإنترنت يقتل الاستضافة المنزلية.
=> لا مسار نظيف بتكلفة صفر لاستقبال جهاز حقيقي. النفق يبقى لواجهة الويب فقط.

**الحاسم مالياً:** CIB/Edahabia لا تعملان لدى أي مزوّد أجنبي (KYC + بطاقة دولية).
خطة العمل: (1) سؤال البنك عن Visa/Mastercard مفعّلة للتجارة الإلكترونية،
(2) اختبار بدفعة ~$2 على دومين لإثبات البطاقة،
(3) تقديم KYC مبكراً بعد إثباتها: Contabo/Netcup أولاً، وHetzner CX22 (≈€3.79/شهر) لاحقاً
لأنه أعلى نسبة رفض حساب لمقيم جزائري،
(4) خطة طوارئ محلية: Cirtasoft Starter 3900 DZD/شهر (~29 يورو) — ليست «رخيصة».

**القرار المطلوب من المالك الآن:** هل تبدأ إجراءات البنك؟ (بند حاسم لـM3، لا لـM1/M2.)
```

- [ ] **Step 2: `lab/report/M0-REPORT.md`** — املأه بالأرقام فقط

```markdown
# تقرير M0 — <التاريخ>

## بوابة (§14): geofenceExit حقيقي من مصدر حقيقي
- [ ] NDJSON يحوي سطر geofenceExit حقيقي (ملف: lab/artifacts/events.ndjson)
- المصدر: [ ] اصطناعي osmand  [ ] هاتف المالك (Traccar Client)  [ ] جهاز بشريحة

## الأزمنة المقاسة (من npm run lab:report)
<الصق الجدول كما خرج، لا تُعِد كتابته>

## فحوص الأمان
<الصق مخرجات npm run lab:security>

## الوصول
- تيليجرام: PASS/FAIL — كم ولياً استلم، وهل كافية مشاركة الجهاز وحدها؟
- بريد: PASS/FAIL/NOT RUN
- push: NOT RUN
- SMS/voice: خارج M0 بقرار المالك

## ما ثبت وما لم يثبت
ثبت: ...
لم يثبت (يُمنع ادّعاؤه): استمرارية 24/7، وصول شبكة الجوال عبر NAT، وضع SMS،
عمر بطارية جهاز، زمن تسليم على الإنترنت العام.

## قرار الاستضافة
<من decision-hosting.md>

## قائمة تصحيحات المواصفة
طُبِّق قبل التنفيذ (2026-10-05): §3 «تلقائياً بلا كود منّا» صُحّح بقاعدتي التقاطع والربط بالجهاز،
§6 أُضيف ترتيب `lat lon`، §10 سقط «جسر رخيص» وأُضيف قياس انعدام Wi‑Fi وسُعِّرت الفودرات.
مطلوب الآن من قياسات هذه المرحلة:
1. §17 (ب/ج/د): قرارات المالك المفتوحة (الاسم، ANPDP/قانون 18-07، بوابة SMS/الصوت).
2. أي بند تُظهر Task 5/8 أن صيغته في §3 غير كافية (مثلاً إذن Notification لكل ولي).
3. الأرقام المقاسة في §8 التي لم تُقَس هنا تُعلَّم «NOT RUN» ولا تُحذف.
```

- [ ] **Step 3: `docs/superpowers/plans/2026-10-05-roadmap.md`**

```markdown
# خارطة الطريق — KidGuard v2 (من المواصفة المعتمدة 2026-10-05)

| المرحلة | الخطة | تُنتج | بوابة الخروج |
|---|---|---|---|
| M0 | `2026-10-05-M0-traccar-lab-validation.md` | معمل + أرقام + قرار استضافة | geofenceExit حقيقي + أمن المعمل PASS |
| M1 | لاحقاً: `…-M1-guardian-app.md` | تطبيق الأولياء (قراءة، رسم مناطق، طفل/ولي متعددون)؛ حذف طبقات §1.5 | AC-1..AC-3 |
| M2 | لاحقاً: `…-M2-escalation-relay.md` | المرحل: نوافذ ack، سلّم، صمت=إنذار، ورقة حادث | AC-4..AC-6 |
| M3 | لاحقاً: `…-M3-cellular-tracker.md` | شراء/تعرّف/اختبار جهاز بشريحة + ورقة SMS | AC-1 على شبكة الجوال |
| M4 | لاحقاً: `…-M4-field-trial.md` | 5–10 عائلات، مصفوفة سيناريوهات، ميزانية إنذار كاذب | AC-7/AC-8/AC-10 |
| M5 | لاحقاً: `…-M5-store-launch.md` | Play Families، سياسة عربية، صفحة المتجر | AC-11/AC-12 |

قاعدة: لا تُكتب خطة مرحلة قبل إغلاق بوابة سابقتها. لا كود إنتاج قبل بوابة M0.
```

- [ ] **Step 4: استكمال تصحيح المواصفة ثم Commit**

تصحيحا §3 و§10 و§6 مطبّقان في المواصفة قبل التنفيذ (قياسات 2026-10-05). هنا تُضيف فقط ما ظهر من Task 5–9: هل صيغة «مشاركة الجهاز تكفي» صحيحة؟ هل ثبتت أرقام §8 أو تُعلَّم `NOT RUN`؟ وهل يسقط §17 (أ) نهائياً؟ لا توسّع النص بما لم نقه فعلاً.

```bash
git add docs/superpowers/plans/2026-10-05-roadmap.md lab/report docs/superpowers/specs/2026-10-05-parent-side-tracing-design.md
git commit -m "docs(M0): measurement report, hosting decision, roadmap and spec corrections"
git push && gh run list --branch lab/m0 --limit 1
```

- [ ] **Step 5: قرار الدمج (لا ينفّذه الوكيل)**

إن تحققت البوابة: يفتح المالك PR من `lab/m0` إلى `main` ثم يدمج. هذه أول لحظة يُسمح فيها بـ`Build & Release Pipeline`، لأنه يبدأ استهلاك حصة الـartifacts. إن لم تتحقق: يبقى الفرع ويُكتب في التقرير «M0 لم يُنجز — السبب: …» ولا يبدأ M1.

---

## Self-Review مقابل المواصفة

**تغطية المواصفة بما يخص M0:**

| البند | مُغطى في |
|---|---|
| §10 معمل H2 على الجهاز، بلا Docker/Postgres | Task 1–2 (`run.sh`، `web.address`، H2) |
| §14 بوابة M0 (`geofenceExit` حقيقي) | Task 6 خطوة 4 + Task 10 خطوة 2 |
| §8 «تُقاس لا تُعلن» | Task 3 (`latency.mjs`)، Task 6/9 (`lab:report`) |
| §9.2–9.6 (لا throttle، H2 creds، لا تسجيل ذاتي، whitelist، HTTPS) | Task 7 + Task 2 (قالب الـconfig يمنع الانحراف). HTTPS/WSS نفسها **لا تثبت في المعمل** وتُعلَّم NOT RUN إلى ما بعد VPS |
| §6 مناطق من الخريطة ≥50م، وroutes | Task 4 (`circleArea` يرفض <50، و`LINESTRING + polylineDistance`)، وربط المنطقتين بالجهاز في Task 5 خطوة 4c، وتشغيل سيناريو المسار في Task 6 خطوة 4 |
| §3 أولياء متعددون ومشاركة الأجهزة | Task 5 (خطوات 4c–6b: الرّوابط الأربعة بترتيبها) + Task 8 (قياس أن مشاركة الجهاز وحدها لا تُنبّه) |

| §5.1 توازي القنوات | Task 8 خطوة 3 (بالملاحظة لا بالوعد) |
| §5.6 SMS ليس اللب | Task 8 خطوة 4 (`خارج M0`) |
| §11 ورقة SMS «المثبتة» | **ليست في هذه الخطة** — لا يوجد جهاز؛ تُرحل لـM3، وأي «ورقة أوامر» تُنتَج الآن بلا جهاز تكون غير مثبتة ويجب وسمها UNVERIFIED |
| §17 (أ) عُقدة الاستضافة والدفع | Task 10 خطوة 1 |
| §12/§13 تطبيق الأولياء وAC-2..AC-12 | **خارج M0** عمداً (بوابة §14) |

**تصحيحات مُطبَّقة في المواصفة قبل هذه الخطة (2026-10-05، من قراءة شيفرة 6.16.0 والقياس على الجهاز):** §3 — «الإنذار يصل كل الأولياء تلقائياً بمجرد مشاركة الجهاز» **ساقطة**: `getNotificationUsers` التقاطع، و`getDeviceNotifications` يستبعد غير المربوط بالجهاز إلا بـ`always`؛ §6 — ترتيب `lat lon` لأن Leaflet يعطي `lng, lat`؛ §10 — «جسر مؤقت رخيص بنفق» سقطت عن مسار الأجهزة، وأُضيف قياس انعدام Wi‑Fi ومسار `adb reverse`، وسُعِّرت الفودرات من `research/hosting-algeria.md`. الخطة تُنفّذ على المواصفة المصحّحة ولا تنتظر Task 10 لتدوين ما هو معروف الآن.

**فحص placeholders:** لا TBD ولا «أضف تحققاً». كل خطوة تحوي كوداً أو أمراً ومتوقعاً. حيث لم نعرف القيمة من المصدر كتبنا أمر استكشاف ينتج ملف دليل ويُصحَّح البناء بعده — لا خلط بين «استكشف» و«افترض». **مثال مُغلق في هذه الجولة:** شكل `/api/permissions` كان مجهولاً في المسودة الأولى (كان يحمل `type: 'Device'`)؛ قراءة `Permission.java:54-66` أغلقته: خريطة مفتاحين مرتّبة بلا `type`، فباتت البنّاءة والاختبار وأمر الدليل الحيّ ثلاث مواضع تُثبت نفس القاعدة.

**ثبات الأسماء والأنواع عبر المهام:** `parseEventData` يُرجع `forwardLatencyMs`/`ingestLatencyMs` ويستعملهما `summarize` و`toMarkdown` وfixtures بنفس الأسماء؛ ومن `lab/sink/lib/geo.mjs` يستورد `api.mjs` (و`api.test.mjs`) الدالتين اللتين يستعملهما فقط (`circleArea`, `polylineArea`)، ويستورد `scenario-lib.mjs` (`circleArea`, `parseCircle`)، ويستورد `geo.test.mjs` الأربعة — وكلها من نفس المُعرِّف `'../sink/lib/geo.mjs'`؛ أوامر npm في Task 1 تستعملها كل المهام اللاحقة حرفياً؛ ثابتة `OSMAND_PARAM_NAMES` في `post-position.mjs` وحدها.

**أربعة قرارات صريحة يجب أن يعرفها المالك قبل التنفيذ:**
1. **المهام 6–9 لا تعمل في CI إطلاقاً** (تحتاج الخادم على جهازه). CI يثبت البنية والمنطق الصافي فقط؛ الأدلة الميدانية تُرفق كملفات. أي ادّعاء «CI أخضر ⇒ المنتج يعمل» هنا كذب.
2. **الهاتف مصدرًا في Task 9 يعتمد على Traccar Client الرسمي**، وهو حل معمل لا منتج. الطبقة التي نملكها (رفع من تطبيقنا) تأتي في M1/M3، والقرار موثق في §1.3.
3. **`notificator.timeThreshold` = 15 دقيقة** سيبتلع أي اختبار بطيء أو معيد بإحداثيات قديمة؛ لذلك كل سيناريو يرسل زمن الآن.
4. **اتجاه الإذن مقصود ولا يُعكس**: اسم جدول الربط يتولّد من (المالك, الخاصية) ⇒ `{deviceId, geofenceId}` يكتب في `tc_device_geofence` الموجود، أما العكس فيطلب `tc_geofence_device` غير الموجود ويُسقط استثناء SQL. الجداول الموجودة المؤكّدة: `tc_device_geofence`، `tc_device_notification`، `tc_user_device`، `tc_user_notification` (`schema/changelog-4.0-clean.xml:95` وما بعده). لذا كل نداء في `bootstrap.mjs` مكتوب بالوسائط المرتّبة لا بكائن واحد، وأي «تحسين» لاحق يجمعها بصيغة كائن سيكسر الربط.
