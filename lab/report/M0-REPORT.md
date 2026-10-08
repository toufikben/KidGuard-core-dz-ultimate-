# تقرير M0 — 2026-10-08

ورقة A4 واحدة: «ماذا يثبت المنتج حتى الآن». الأرقام كلها مقاسة على معمل هذا الجهاز (Traccar 6.16.0،
JDK 25، H2)؛ ما لم يُقَس موسوم **NOT RUN** ولا يُدّعى. لا كود إنتاج قبل بوابة §14.

## بوابة (§14): geofenceExit حقيقي — المسار مُثبت، المصدر غير مُثبت (انظر أدناه)

- [x] NDJSON يحوي سطر `geofenceExit` حقيقي (ملف: `lab/artifacts/events.ndjson` — 10 أسطر، منها 4
  أسطر `geofenceExit` مُنتِجة من خادم Traccar 6.16.0 عامِل ومارّة عبر `event.forward.url` إلى الحوض).
  `lab/artifacts/` محليّ وغير مرفوع، فيقابل أثرين مرفوعين يُراجَعان من نسخة مستنسخة:
  `lab/fixtures/gate-events.ndjson` (نفس السطور العشرة، والبصمتان متطابقتان: `md5sum` لهما
  `8c9bc250…`) و`lab/report/evidence/003-scenario-run.txt`
  (مخرجات العدّاد نفسها).
- المصدر: [x] اصطناعي osmand  [ ] هاتف المالك (Traccar Client)  [ ] جهاز بشريحة

**قراءة دقيقة للبوابة (سؤال «المسار» ينفصل عن سؤال «المصدر»):**
- **سؤال المسار: مُثبت.** جولة Task 9 مرّت **بجهاز حقيقي** (هاتف Realme معرّف بآخر أربع خانات `HMS8`) فوق
  نفق USB (`adb reverse`) ⇒ خادم Traccar حقيقي ⇒ حدث `geofenceExit` حقيقي ⇒ الحوض، تحت 30ث
  (الدليل `lab/report/evidence/006-phone.md`؛ أزمنته في §4 منه: `geofenceExit` source→sink **4750ms**).
- **سؤال المصدر: غير مثبت.** إحداثيات جولة الهاتف **حُقنت يدويّاً من صدفة Android** (أمر `nc`)، لا من
  حسّاس GPS ولا من تطبيق تتبّع؛ وTraccar Client **لم يُثبَّت** بقرار المالك R35 («بلا تثبيت — إثبات
  المسار فقط»). لذا «هاتف المالك (Traccar Client)» أعلاه **غير مُعلَّم**: ما قيس هو نفق+خادم+حدث، لا
  مصدر GPS. المتتبع بشريحة **غير موجود بعد**. أي أن **المصدر الحقيقي (GPS/شريحة) فجوة مسماة لـM1 بقرار
  المالك، لا سهو**. الملف `events.ndjson` نفسه مصدره osmand اصطناعي (أسطر السيناريو)، ولهذا عُلم الصندوق
  الأول وحده.

## الأزمنة المقاسة (من `npm run lab:report`)

النص الحرفي لمخرجات الطرفية (لا إعادة كتابة) — أمر البوابة المعتمد في `lab/README.md` و`lab/.github`
على ملف أسطر البوابة العشرة:

```
npm run lab:report -- lab/artifacts/events.ndjson geofenceExit,deviceMoving
```

```
# M0 measurement report

records: 10
clock-skewed records (source->sink latency <= 0): 0
budget metric: source->sink (fix time -> sink receipt); event age (eventTime -> sink receipt) is shown for reference only

| event | count | p50 source->sink (ms) | p95 source->sink (ms) | max source->sink (ms) | p95 event age (ms) | p95 ingest server (ms) | without position |
|---|---|---|---|---|---|---|---|
| geofenceEnter | 5 | 4360 | 9557 | 9557 | 9557 | 3642 | 0 |
| geofenceExit | 4 | 3146 | 3172 | 3172 | 3172 | 29 | 0 |
| deviceMoving | 1 | 3181 | 3181 | 3181 | 63181 | 12 | 0 |

verdict: PASS p95 <= 30000 ms (source->sink)
event-age note: deviceMoving p95 63181 ms exceeds the budget while its source->sink p95 is 3181 ms — Traccar back-dates deviceMoving eventTime to the motion onset, so this is the age of a reference timestamp, not a delay in the chain
budget not measured for: none
missing expected types: none
unexpected types: geofenceEnter
```

الجدول يعرض كل نوعٍ موجود في الملف لا الوسائط وحدها؛ الوسائط تحدّد **ميزانية الحكم** فقط، ولهذا
يظهر `geofenceEnter` في العمود مع `unexpected types: geofenceEnter` وأسفله.

- **الحكم `PASS p95 <= 30000 ms (source->sink)`** هو ميزانية §8 (≤30ث من طابع الإصلاح حتى استلام الحوض).
  `geofenceExit`: p95 **3172ms** وingest p95 **29ms**.
- `geofenceExit` خرج من **كلا المنطقتين**: `school` (دائرة CIRCLE) و`walk-to-park` (خط `LINESTRING`) ⇒
  منطقة المسار تُقيَّم فعلاً (المصدر: `lab/report/evidence/003-scenario-run.txt`).
- **تشغيل الأمر بلا وسائط لا يعطي هذا الحكم.** افتراض `report.mjs` هو
  `geofenceExit,alarm,deviceOffline`، والمعمل لم يولّد `alarm` ولا `deviceOffline` (لم يولّدهما
  السيناريو في M0)، فصار الحكم — بعد إصلاح المراجعة النهائية —:

```
$ node lab/sink/report.mjs lab/artifacts/events.ndjson
verdict: NO DATA p95 not measured for: alarm, deviceOffline (budgeted types: geofenceExit, alarm, deviceOffline)
budget not measured for: none
missing expected types: alarm, deviceOffline
unexpected types: geofenceEnter, deviceMoving
```

  هذا **ليست إخفاقاً ولا ادّعاءً**: هو التقرير يقول إن نوعين من قائمة الميزانية الافتراضية لم
  يُقاسا. وهو أيضاً تصحيحُ خطأٍ كان موجوداً: كانت نسخة سابقة من هذا التقرير تلصق تشغيلَ بلا وسائط
  وتحت حكم `PASS`، أي أن البوابة كانت تُقرأ من مجموعة أنواع لم يُولّد المعمل اثنين منها. المراجعة
  النهائية (المُراجِع أ) وجدت ذلك في `lab/sink/report.mjs:33-49`؛ صار الحكم يُشترط لكل نوعٍ في قائمة
  الميزانية، وأُضيف اختباران يرفضان PASS حين يكون النوع المُوازَن غائباً أو بلا قياس
  (`lab/tests/latency.test.mjs:101-117`). الجدول المُلصق أعلاه هو أمر البوابة المعتمد، وتحقّقت أداةٌ
  من مطابقته لمخرجات الطرفية سطراً بسطر (949 بايت للطرفين).
- **تنبيه لقارئ ينسخ المستودع:** الأثر المرفوع `lab/report/evidence/003-scenario-run.txt` (السطر 73 منه)
  يحمل جدولاً قديماً بحكم **`verdict: FAIL p95 > 30000 ms`** — وهو لا يناقض الجدول أعلاه: أُنتج قبل قرار
  R30 حين كان التقرير يقيس **عمر الحدث** (`p95 forward`) بدل **النقل مصدر→حوض**، فظهر `deviceMoving`
  بـ63181ms وأُخذ الحكم منه؛ بنفس الأسطر العشرة وحساب النقل الصحيح صار `deviceMoving` بـ**3181ms**
  والحكم **PASS** (الفرق يشرح نفسه في سطر `event-age note` داخل الجدول أعلاه وفي §4 من `006-phone.md`).
  الأثرُ لم يُعدَّل — سجلّ تشغيل يبقى كما خرج.

## فحوص الأمان

الملصق من الأثر المحفوظ `lab/report/evidence/004-security.txt` (قِيست والخادم **عامل** على نفس
النسخة المُهيَّأة التي أنتجت `geofenceExit` — web `127.0.0.1:8082`، osmand `:5055`):

```
PASS  unauthenticated-devices-401  [GET /devices anonymous -> HTTP 401 (refused before any data)]
PASS  self-registration-closed  [POST /users HTTP 400 "java.lang.SecurityException: Registration disabled\r\n\tat org.traccar.api.resource"; server.registration=false]
PASS  unknown-device-rejected  [unknown uniqueId POST / -> HTTP 400 (expected >= 400: unregistered devices are not created)]
PASS  web-ui-on-localhost-only  [configured API host is 127.0.0.1; this proves only that the lab is pointed at loopback, NOT that Traccar refuses LAN clients (verify web.address=127.0.0.1 from another host; use adb reverse for the phone)]
4/4 security checks passed
```

**إعادة تشغيل بلا الخادم ليست نتيجة أمان:** شغّلت `npm run lab:security` والخادم مُتوقِف فأعطى 3 فحوص
`[error: fetch failed]` وسطر `1/4 security checks passed` — هذا غيابُ الخادم لا مقياسُ أمان ولا
انتكاسة؛ الفحص الرابع (اتجاه loopback) وحده لا يحتاج شبكة. **العدد المعتمد هو 4/4 من الأثر أعلاه.**
حدود صريحة تبقى موثّقة في نفس الأثر: فحص `web-ui-on-localhost-only` يثبت أن المعمل **موجَّه** إلى
loopback لا أن Traccar **يرفض** عملاء LAN؛ والاختبار من مضيف ثانٍ فعلي = **NOT RUN** (لا ثاني مضيف).

## الوصول

- **تيليجرام: NOT RUN** — `notificator.types=web,mail` يُبقي `telegram` خارج القائمة عمداً فلا يستطيع أي
  تشغيل معملّي أن يطلب api.telegram.org بتوكن مزيف (`123456:FAKE-LAB-BOT-TOKEN`، لم يُستعمَل)؛ والمالك لم
  يورّد توكن بوت ولا chat id لكل ولي. **مقيسٌ قرارُ اختيار المستقبِل لا التسليم**: المستقبِل = تقاطع
  `user→device` **و** `user→notification`، و`device→notification` لازم ما دام السجل `always:false` —
  **مشاركة الجهاز وحدها لا تُنبّه** (قِيس من الاتجاهين في `lab/report/evidence/005-fanout.md` §5–§6b).
- **بريد: NOT RUN** — سطرا `Email sent` في سجلّ الخادم مصدرهما `mail.debug=true` = مُنفِّذ داخلي في نفس
  JVM يسجّل اختيار المستقبِل (`LogMailManager`) ولا يفتح مقبس SMTP؛ ولا `mail.smtp.host` مضبوط ولا app
  password من المالك. **ليس أبداً دليلاً على تسليم.**
- **push (FCM): NOT RUN** — لا خدمة Firebase مهيَّأة في M0 (`notificator.firebase.*` فارغة).
- **SMS/اتصال صوتي: خارج M0 بقرار المالك** — §5.6 «SMS ليس اللب»؛ الواجهة محفوظة لـM2، بلا مزوّد يخدم
  الجزائر ولا مصدر دفع بعد.

## CI

**NOT RUN — CI unavailable (account billing).** أي دفع إلى `lab/m0` يفشل في 3–4ث بمصفوفة `steps` فارغة
(فوترة الحساب). **العدد لا يُدوَّن كثابت**: كل دفعة جديدة تضيف واحداً بنفس التوقيع، وهذا النص نفسه
يُدفع بدفعة، فالرقم الثابت يكذب خلال دقائق. **القراءة المعادة من نسخة مستنسخة حديثة**، وهذه لقطة
بلحظتها: عند `2026-10-08T11:12:58Z` أعاد `gh run list --branch lab/m0 --limit 100` **23** دفعة كلها
`failure` (أقدمها `37376389740` عند `2026-10-05T21:31:20Z`، أحدثها `37764956927` على `98b2fad` عند
`2026-10-08T10:39:56Z`)؛ و`gh run view 37764956927 --json jobs` على الأحدث أعاد `conclusion: failure`
مع `steps: []` — أي لم تُنفَّذ خطوة واحدة، لا «فشلت خطوة». **القراءات الأقدم في نفس اليوم:** 18 عند
`09:44:46Z` (`--limit 20` كان يسقف القائمة)، 20 عند `09:57Z` (بعد `4bd0cf0`/`fc3e8f3`)، 21 عند
`10:29Z` (بعد `dabc003`). **لا يُقال PASS للـCI أبداً،** وكل أرقام الاختبارات أعلاه محليّة من هذا
الجهاز. `lab/logs/phone-ci-runs-audit.txt` **لقطة محليّة غير متتبَّعة** (`git check-ignore -v` →
`.gitignore:9:lab/logs/`) فلا يصل إلى نسخة مستنسخة ولا يصلح مرجعاً لهذا الادّعاء؛ تُعاد القراءة بأمرَي
`gh` أعلاه.

## ما ثبت وما لم يثبت

**ثبت (بالأثر):**
- استقبال خادم Traccar 6.16.0 إحداثيات، تقييم منطقة على الخادم، وإنتاج `geofenceExit` حقيقي مرّ عبر
  `event.forward.url` إلى حوضنا المحلي تحت الميزانية (p95 3172ms؛ الدليل `003-scenario-run.txt`).
- المناطق تُقيَّم بنوعيها: `school` (CIRCLE) و`walk-to-park` (LINESTRING).
- قاعدة fan-out **مقاسة من الاتجاهين**: لا يشارك إلا بمجموعة الروابط، والتقاطع `user→device`∩`user→notification`
  مع `device→notification` لازم (`005-fanout.md` §5–§7).
- المسار الكامل من **جهاز حقيقي** (هاتف المالك عبر `adb reverse`/USB) إلى خادم إلى حدث إلى حوض
  (`006-phone.md`) — **المسار فقط**، لا المصدر.
- أمان المعمل 4/4 على النسخة المُهيَّأة (`004-security.txt`).

**لم يثبت (يُمنع ادّعاؤه):** استمرارية 24/7، وصول شبكة الجوال عبر NAT/عنوان عام، وضع SMS الحقيقي،
عمر بطارية جهاز، زمن تسليم على الإنترنت العام، **مصدر GPS حقيقي من حسّاس** (جولة الهاتف حقن يدوي)،
تسليم فعلي لأي قناة (تيليجرام/بريد/push = NOT RUN أعلاه)، HTTPS/WSS للإنتاج (تُعلَّم NOT RUN إلى ما بعد
VPS)، اختبار أمان من مضيف ثانٍ فعلي.

## قرار الاستضافة

المُوجَز من `lab/report/decision-hosting.md` (كل سطر هناك مُسند بمصدره): متتبع GT06 يحتاج **TCP عاماً
على منفذ ثابت**؛ الأنفاق المجانية (cloudflared/Tailscale Funnel/ngrok) تنقل HTTP(S) أو بمنفذ عشوائي
فلا تصلح لمسار الأجهزة، وCGNAT يقتل الاستضافة المنزلية ⇒ **لا مسار صفر‑التكلفة لاستقبال جهاز حقيقي**.
الجدار **مالي لا تقني**: CIB/Edahabia لا تعمل لدى أي مزوّد أجنبي، والرهان الوحيد بطاقة Visa/Mastercard
دولية مفعّلة للتجارة الإلكترونية تُختبر بدفعة ~$2. **الحالة المقيسة اليوم: `LAB-ONLY`**؛ تصبح
`VPS-PATH` لحظة نجاح ذلك الاختبار. **السؤال المفتوح المتبقي للمالك: هل تبدأ إجراءات البنك؟** (بند حاسم
لـM3، لا لـM1/M2.)

## قائمة تصحيحات المواصفة

طُبِّق قبل التنفيذ (2026-10-05): §3 «تلقائياً بلا كود منّا» صُحّح بقاعدتي التقاطع والربط بالجهاز،
§6 أُضيف ترتيب `lat lon`، §10 سقط «جسر رخيص» وأُضيف قياس انعدام Wi‑Fi وسُعِّرت الفودرات.
مطلوب الآن من قياسات هذه المرحلة (أُضيفت إلى المواصفة بحدّها المقيس فقط):
1. **§3** — قِيَست Task 8 قاعدة التقاطع من **الاتجاهين** لا من قراءة كود `CacheManager` وحدها (حذف
   التصريح مع بقاء المشاركة ⇒ وليّ واحد؛ حذف المشاركة مع بقاء التصريح ⇒ وليّ واحد؛ الاجتماع ⇒ وليّان)،
   وأكّدت أن `device→notification` **لازم** ما دام السجل `always:false`؛ ونطاق `notificator.timeThreshold`
   = 15 دقيقة يكبت الإصلاحات القديمة (فلا يُقاس زمن التسليم من لوحة Traccar). الأثر: `005-fanout.md`.
2. **§8** — لم يُقَس في المعمل إلا ساق **النقل مصدر→حوض** (PASS ≤30ث على osmand وفي جولة الهاتف)؛
   السيق التي تعتمد على تسليم قناة حقيقية (خادم→ولي بـ`delivered` ≤45ث، نسبة إيصال الوصول، تصعيد كامل
   ≤5د، إعلان «حالة متدهورة» بعد 5د صمت) تُعلَّم **NOT RUN** لا تُحذف. انحراف الساعة في جولة الهاتف مقاس
   **0..2ث ومنحاز للعلوّ** (قراءة الحاسوب تأتي بعد قراءة الهاتف)، والهامش إلى 30ث بقي ~28ث فلا حكم يتغيّر.
   الأثر: `006-phone.md` §3–§4.
3. **§9** — أُضيفت نتيجة إنتاج مقيسة: تسليم التنبيه يستدعي **الجيرجودر (geocoder) بشكل متزامن** ويُسرّب
   عنواناً محلّولاً من إحداثيات (حتى تركيبية)، لذا `geocoder.enable=false` في إعداد المعمل المُولَّد فقط؛
   و**Traccar يربط منفذ الاستقبال على `0.0.0.0:5055` بسلوكه الافتراضي** وقِيس أنه **يقبل** اتصال LAN بينما
   `:8082` **مرفوض** من LAN ⇒ قرار كشف يُراجَع قبل الإنتاج لا إنجاز هذا المعمل. الأثر: `005-fanout.md`
   §6b/§9.2 و`004-security.txt` و`006-phone.md` §1.
4. **§17 (ب/ج/د)** — قرارات المالك المفتوحة تبقى مفتوحة: الاسم والعلامة، الدفعة القانونية
   ANPDP/قانون 18‑07، وبوابة SMS/الصوت؛ لا يغلِقها هذا التقرير.
5. **§17 (أ) عُقدة الاستضافة/الدفع** — لا تسقط؛ تنتقل من «مفتوح بحثاً» (أُغلق بحثياً في
   `lab/report/decision-hosting.md`) إلى «مفتوح **قراراً مصرفيّاً** عند المالك».

**بوابة §14 للحكم النهائي:** المسار مُثبت من جهاز حقيقي تحت الميزانية؛ **المصدر الحقيقي (GPS/شريحة)
غير مثبت** بفجوة مسماة لـM1 بقرار المالك (R35: «بلا تثبيت — إثبات المسار فقط»). لا كود إنتاج قبل إغلاق
§14 أو قرار صريح من المالك بتضييقها، ولا ادّعاء «كشف اختطاف» أو وصول شبكة عامة. المخرج: هذا التقرير +
`decision-hosting.md` + `2026-10-05-roadmap.md` + التصحيحات أعلاه. **دمج `lab/m0` إلى `main` قرار المالك
وحده** (Task 10 Step 5)، ولا يُدمَج ولا يُفتح PR بغير أمره.
