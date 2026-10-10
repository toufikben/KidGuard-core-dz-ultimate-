# M1 — تطبيق الأولياء (خطة تنفيذ)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** بناء تطبيق الأولياء (وحدة 4 في المواصفة §2) بحيث يكون **خادم Traccar هو مصدر الحقيقة**: قراءة المواضع والأحداث، ورسم مناطق الأمان وحفظها على الخادم، وطفل واحد → أطفال متعددون ووليّ واحد → أولياء متعددون — مع حذف طبقات §1.5 التي أسقطت المحاولتين السابقتين.

**Architecture:** طبقة بيانات واحدة (`src/services/traccar/`) تتكلم REST + WebSocket مع الخادم، فوقها خطّاف حالة (`useServer*)`)، فوقها الشاشات. لا `localStorage` كسجلّ إطلاقاً؛ المنطقة المرسومة تذهب إلى `POST /api/geofences` والخادم هو الذي يقيّم. التطبيق يعمل في المصفح على حاسوب المالك وفي متصفح هاتف Realme عبر نفق `adb reverse` — وهو المسار المُثبت في M0 (R35/R37)، فلا APK مطلوب لهذه المرحلة.

**Tech Stack:** React 19 + TypeScript ~5.8 + Vite 6.4 (`vite build` مقيس: 1716 وحدة في **42.41 ث** على جهاز المالك) + Leaflet 1.9.4 + Tailwind 4 + Capacitor 7 (بلا بناء APK في M1)؛ اختبارات الوحدة: `node --test` عبر `tsx` (**بدون أي اعتمادية اختبار جديدة**)؛ Node 24.19 محليّاً.

**Spec:** `docs/superpowers/specs/2026-10-05-parent-side-tracing-design.md` — تُقرأ مع هذه الخطة؛ كل مهمة تحتجّ بمادة منها. **قرار المالك الحاكم:** R37 (2026-10-08، §14) الذي أذن بكود M1 على فرع `m1/guardian-app` بعد تضييق بوابة §14.

---

## Global Constraints

- **الفرع:** كل كود M1 على `m1/guardian-app`، مُشتقّ من رأس `lab/m0` **بعد** التزام هذه الخطة (لا من `main`). يُدفع إلى الأصل. **لا دمج إلى `main` ولا PR** — الدمج فعل المالك وحده. نقطة الاشتقاق تُقاس بـ`git rev-parse origin/lab/m0` وتُدرَج في السجل، ولا تُكتب هنا كـsha ثابت (أي التزام توثيقي بعدها يفسّخها).
- **حدود R37 (لا تُتجاوز ولا تُلمَّح):** لا ادّعاء تسليم على قناة حقيقية (Telegram/mail = **NOT RUN** حتى يقدّم المالك الأسرار)، لا ادّعاء استمرارية 24/7، لا ادّعاء عمل فوق شبكة عامة أو استضافة (الحالة `LAB-ONLY`)، لا شراء عتاد M3، لا اختبار ميداني M4. **شقّ المصدر ما زال مفتوحاً (R35):** AC-1 تُقاس **نقلاً** بمصدر مُحقَن، لا GPS حقيقي.
- **AC-3 في هذه المرحلة على قناة `web` وحدها** (قناة Traccar `web` قناة حقيقية مُثبَتة التخزين والتوصيل)، والبريد/تيليجرام يُكتب بجانبها **NOT RUN** لا FAIL.
- **بوابة محلية لها أنياب (R-M1-7، قرار بعد مراجعة Task 1):** «أعداد مرئية» وحدها لا تكفي — مقيس: إنْ تغيّر glob الـ`test:app` أو حُذف آخر ملف اختبارات، يرجع العدّاء `ℹ tests 0` ويخرج **صفرّاً**، والحرّاس داخل `tests/app/` لا يستطيع معاقبة جمعِه نفسه (لن يُجمَّع). لذا ملزمان: (١) كل كتلة بوابات في كل مهمة تُشغّل **سطر الأرضية نفسه المستعمل في `m1-ci.yml`** محليّاً وتلصق خرجه (`npm run test:app --silent | tee /tmp/app.log` ثم `grep '^ℹ tests ' | awk '{print $3}'` ومقارنتها بـ`EXPECTED_MIN_TESTS`) — لا اعتمادية جديدة ولا ملف إضافي؛ و(٢) من Task 3 فصاعداً يكون الفحص الآلي في `npm test` (الملف الوحيد الذي يُنفَّذ دائماً مهما كان الـglob) عبر `tests/core.test.ts` كما هو مفصّل في Task 3 Step 6.
- **كل اختبار «يُثبت فرعاً» يُقاس على التخريب الذي يستهدفه لا على خضاره (R-M1-12، درس Task 4):** مقيس مرّتين — اختباران أُضيفا ليقبلا رفض `polylineDistance: 0` بقيا **أخضرَين** تحت حذف الشرط نفسه (`22/22`)، لأن الـregex المستعمل `/polylineDistance|هامش/` يطابق أيضاً رسالة «الهامش أقل من 100 م» من فرع آخر؛ أي أن الاختبار نجح للسبب الخطأ. القاعدة: لا يُحتسب اختبارٌ في أرضية العدد حتى يُشغَّل عليه التخريب المحدّد الذي وُجد لأجله، ويُلزَم أن يحمرّ بسبب مسمّى، ثم تُرمَّم الشجرة وتُعاد الخضرة. ومطابقة «كلمة عامة في الرسالة» عيب: الرسالة تُطابق **بفرعها** (`/polylineDistance/`) ويُضاف assert أنّها **ليست** رسالة الفرع المجاور. الحرّاس النصّيّون (مثل حارس `Buffer`) يخضعون للتحقيق نفسه: حذف ما يحرسونه يجب أن يحمرّهم.
- **ما يُطبع على الشاشة لا يرمي ولا يكذب بعدد (R-M1-14، قرار بعد مراجعة Task 5):** الدوالُ primitives صارمة ومن يريد التفريع يملك السبب — `ageSeconds` ترمي على `fixTime` غير مقروء أو `now` غير محدود أو مستقبل مستحيل، و`freshnessOf` لا يعتبر عمراً غير محدود `fresh` بل `silent`. لكن **دالة النص الذي تستهلكه الشاشة لا ترمي على البيانات** (`formatPositionLabel` تتردّى إلى جملة انعدام البيانات (`position.noDataFromServer — position.locationMayNotBeCurrent`))، ولا تطبع نصف قطر غير قابل للقياس: `accuracy` سالب أو غير محدود يُحذف ويُطبع العمر وحده، لأن `±-25 م` الجملةُ نفسها كذبٌ لا أنقصُ دقة. التقييد «على البيانات» مقصود بحرفه: الوسيط `lang` ليس بيانات، و`translate` ما زال يرمي على لغة خارج `ar|fr|en` — والواقع المقيس أن `src/App.tsx:83` يقرأ المستودع المحلي ويصطبغه `as Language` بلا أي تحقق، فالحارس يكون هناك (المهمة 7 تملك هذا السطر) لا داخل الطابعة؛ الطابعة تدافع عن نفسها ضد ما يرسله الخادم فقط. مقيس قبل التصحيح: `formatPositionLabel(pos, NaN, 'ar')` كان يطبع **`منذ NaN ثانية ±25 م`** ويصنّف مصدراً لا قراءة له «fresh» — أبهج جملة ممكنة في منتج سلامة، لأن NaN لا يُرضي أيّاً من مقارنتَي البوابة فيسقط في `fresh`؛ و`fixTime` تالف كان يرمي من داخلها. السبب أن هذا الإدخال واقعٌ لا خيال: المهمة 10 تجلب `now` ومواقعها من مقبض حيّ، وشاشةُ ترمي = وليٌّ لا يرى شيئاً لحظة الخطر. **ما يلزم المهام 7/9/10:** لا تُغلَّف `formatPositionLabel` بـ`try/catch` (هي تتكفّل)، ولا يحسب أي مكوّن عمراً يدوياً ولا يطبع رقماً من بيانات الخادم قبل فحص محدوديته، وكلمة `NaN` ممنوعة في أي نص ظاهر ويُبحث عنها في اختبارها. الحدود تُقاس كما تُقاس كل قاعدة فرع: `isSourceConflict(300) === false` لأن §3 يقول «أكثر من 300» — مقيس أن `>` إلى `>=` يُحمّر اختباراً واحداً مسمّى بعد أن كان تخريبُ المراجع نفسه أخضرَ `36/36`.
- **مسار الرمز يقرأ نصّاً، ورسالة الخطأ لا تحمل جسماً (R-M1-15، قرار بعد قياس 008 على الخادم الحيّ — يُغلق R-M1-11):** مقيس في `lab/report/evidence/008-form-encoding-and-token-route.md`: (١) **المسافة داخل قيمة `@FormParam` تعمل** — تخرج `+` كما يفرض `application/x-www-form-urlencoded` والخادم يقبلها (`POST /session/token` بـ`label=lab guardian app` ⇒ 200)، والرمز يُتحقّق منه عبر `GET /session?token=` ⇒ 200؛ فلا بديل ترميزي يُطلب ولا جولة تصحيح على `postForm`. (٢) لكن `/api/session/token` **يعيد سلسلة خام وترويسته `application/json`**، فـ`client.ts:85` الذي يحلّل كل جسم غير فارغ كـJSON يرجع `badpayload` على نجاح 200 ⇒ بند Task 6 (ح) كما كُتب **غير قابل للتنفيذ**: تُضاف `postFormText` في `client.ts` تشارك `request()` نفسها المهلةَ والإلغاءَ وخريطة الأخطاء وتعيد `string`، ويستعملها `mintSocketToken` — تبقى القاعدة «لا `fetch` خام موازٍ في `session.ts`» لأن مقصد (ح) ضمانات المهلة والأخطاء لا تحليل JSON. (٣) **تسريب مقيس:** `client.ts:86` يطبع `text.slice(0, 40)` داخل رسالة `badpayload` — وعلى مسار الرمز تلك الأربعون حرفاً **بداية رمز صالح** (الجولة الأولى من أداة القياس طبعتها فعلاً في ملف مؤقت؛ الرمز أُلغي في نفس الجلسة). الرسالة تصبح الحالة ونوع المحتوى فقط، ويُثبَّت ذلك باختبار يحمل جسماً وهمياً على شكل سرّ ويـassert أن لا شيء من مقدّمته يظهر في `message`، ويُقاس على التخريب الذي يستهدفه (R-M1-12). (٤) حالات الجلسة مقيسة فلا تُخمَّن: رمز ملغى/منتهي **401**، رمز مُخلَّق **400**، بلا جلسة **404**، كلمة مرور خاطئة **401** بجسم 5824 بايت ليس JSON ولا يسمّي الحساب، `DELETE /session` **204** (تحت Basic ومع جلسة) ثم `GET /session` **404**.
- **CI:** `build-release.yml` يعمل على `main`/`develop` فقط، والحساب معطّل أصلاً (الر14: «recent account payments have failed»). لذا **بوابة التحقق الأساسية محلية**: `npm run lint` + `npm run build` + `npm test` + `npm run test:app` بأعداد مرئية. أي خطوة CI تُذكر تُكتب **NOT RUN — CI unavailable (account billing)**، ولا تُعلَّق بوابة مهمة عليها. **قراءة CI صحيحة (مقيسة في Task 1):** التشغيل يُدرَج بحالة `completed / failure` في ≈3ث مع `steps: []` — هذه بصمة انقطاع الدفع، ولا تُقرأ إطلاقاً «اختبارات فشلت». والأمر `gh run view --json jobs` غير مدعوم في نسخة الـCLI هنا، فلا يُستخدم كـ«دليل» (يسقط في `|| echo "no run yet"`)؛ المستعمل: `gh run list --branch <فرع> --limit 3` ثم `gh run view <id>` والتفتيش عن `steps: []`.
- **الاعتماديات:** لا اعتمادية إنتاج جديدة ولا اعتمادية اختبار جديدة. ‏`npm ci` مقيس على هذا الجهاز: **188 حزمة في ≈5 دقائق**، وتحذير `allow-scripts` على `esbuild` **غير مانع للبناء** (BUILD_EXIT=0 مقيس بعده مباشرة).
- **لا أسرار في المستودع ولا في الطرفية:** بيانات دخول مستخدمَي المعمل تُدخل من واجهة التطبيق وقت التشغيل؛ لا `VITE_*` لكلمة مرور، ولا كلمة مرور في سطر أوامر، ولا في لقطة شاشة، ولا في سجلّ.
- **لا بيانات حقيقية:** أسماء `lab-child-*` و`lab-guardian-*`، إحداثيات حول `36.7538, 3.0588`، بريد `@example.com`. **لا أسماء أطفال حقيقية** في أي ملف أو لقطة (§9.10). **لا رقم تسلسل الجهاز كاملاً** — آخر أربع خانات فقط. **لقطات الشاشة لا تُرفع** (شريط حالة المالك): تبقى في `lab/artifacts/` مع بصمة MD5 في النص.
- **الصدق في الواجهة (قاعدة المالك الملزمة §4/§12):** لا كلمة «حيّ/مضمون» منفردة؛ كل موضع مع عمر القراءة والدقة؛ الصمت «لا بيانات» لا «الطفل بأمان»؛ لا جملة توحي بأن غياب حدث المغادرة = أمان (§6).
- **العربية أولاً:** النصوص من `src/translations/` بثلاث لغات (ar افتراضياً، fr، en) بقاموس مفحوص الأنواع، وRTL للعربية. لا نصوص مبعثرة داخل المكوّنات (§12).
- **فخّ الإحداثيات ملزم (§6):** WKT في Traccar يقرأ **`lat lon`**؛ Leaflet/GeoJSON يعطيان **`[lng, lat]`**. دالة تحويل واحدة مُختبَرة (§6 «يُبنى كدالة واحدة مُختبرة في M1») لا تحويل مبعثر.
- **مصفوفة القبول:** بوابة M1 = **AC-1..AC-3** فقط (§14). AC-4 وما بعدها ملك M2/M3 — لا تُلمَّح كأنها مُنجزَة.
- **الأثر الخام نصّ حرفي بعقد:** ملفات `lab/report/evidence/*` لا تُحرَّر لإخفاء حكم قديم أو مسار.
- **لا رقم تشغيل CI دائري يُكتب كحقيقة:** كل قراءة مؤرَّخة بطابع زمني مع الأمر الذي يعيد إنتاجها.

---

## حقائق مُثبتة من المصدر ومن الجهاز (لا تختلق بديلاً عنها)

من شجرة `6.16.0` المقروءة محليّاً في `_research/traccar` (خارج المستودع، المرجع نفسه الذي استعملته خطة M0):

| الحقيقة | المصدر |
|---|---|
| `GET /api/positions` بلا وسائط ⇒ آخر مواضع كل أجهزة المستخدم؛ `?deviceId=N` بلا from/to ⇒ `Condition.LatestPositions(deviceId)`؛ `?deviceId&from&to` ⇒ تاريخ (يتطلب عدم إعاقة `disableReports`) | `api/resource/PositionResource.java:73-106` |
| `@Path("events")` **بـ`@GET` واحد فقط هو `{id}`** مع فحص `checkPermission(Device…, event.getDeviceId())` — **لا مجموعة أحداث عبر REST**؛ 404 على `/events?from&to` **مقيس** في 007 §8 | `api/resource/EventResource.java:35-46` + قياس 007 |
| الجلسة: `POST /api/session` (نموذج)، `DELETE /api/session`، `GET /api/session?token=`، **`POST /api/session/token`** (توليد رمز طويل العمر) و`POST /api/session/token/revoke` | `api/resource/SessionResource.java:78-168` |
| المقبس مسجَّل على **`/api/socket`**؛ المصادقة: معامل استعلام `token` وإلا جلسة HTTP؛ المستقبِل مربوط بـ`userId` | `web/WebModule.java:27`، `api/AsyncSocketServlet.java:58-74` |
| رؤوس CORS تُبنى من مفتاح الإعداد **`web.origin`** (`CorsResponseFilter` يضيف Allow-Headers/Allow-Credentials/Allow-Methods/Allow-Origin) | `api/CorsResponseFilter.java:32-59`، `config/Keys.java:1003` |
| `Position`: `fixTime`/`deviceTime`/`serverTime` (ISO‑8601)، `latitude`، `longitude`، `altitude`، **`speed` بالعقد (kn)**، `course`، `accuracy`، `geofenceIds`، `attributes` | `model/Position.java:161-317` + `MainModule.java:153-158` (مُثبَّت في خطة M0) |
| `Event`: `type`, `eventTime`, `deviceId`, `positionId`, `geofenceId`, `attributes` | `model/Event.java:42-72` (مُثبَّت في خطة M0) |
| الدخول `POST /api/session` يقرأ **`@FormParam`** (`email`, `password`, `code`) لا JSON؛ ونجاحه يربط جلسة HTTP ويعيد `User`؛ والفشل 401 (ومع TPR مطلوب: 401 + ترويسة `WWW-Authenticate: TOTP`) | `api/resource/SessionResource.java:119-141` |
| ترويسة `Authorization` تُقرأ قبل أي مسار آخر، و`OPTIONS` **يتجاوز المصادقة** (ولذلك فحص CORS ممكن بلا سرّ)؛ وبلا ترويسة وبلا جلسة ⇒ 401 لكل مورد غير `@PermitAll` | `api/security/SecurityRequestFilter.java:57-59,65-107` |
| رمز المقبس يُولَّد بـ`POST /api/session/token` (form `expiration`) ويُبطَل بـ`POST /api/session/token/revoke`؛ ويُقرأ بـ`GET /api/session?token=` | `api/resource/SessionResource.java:79-105,150-173` |
| **`GET /api/session` برأس Basic وحده ⇒ 404 (مصمَّم لا عطل)**؛ المشروع: `?token=` أو جلسة HTTP، و`POST /api/session` يبني الجلسة ويعيد `User` (كلاهما 200 مقيس في 007 §9) | `api/resource/SessionResource.java:78-105` + قياس 007 (R-M1-8) |
| `/api/notifications` **لا يقبل `from`/`to`** ويعيد **سجلات اشتراكات** (`always,attributes,calendarId,commandId,description,id,notificators,type`) — ليس سجل تنبيهات؛ `PUT` على المجموعة بلا id ⇒ 405 مقيس، وبـ`{id}` ⇒ 200 | `api/ExtendedObjectResource.java:46-52`، `api/resource/NotificationResource.java:53-56` + قياس 007 |
| **حدث لا يصل إلى المقبض إلا إذا كان في الاشتراك notificator اسمه `web`** (`NotificatorWeb` هو وحده من ينادي `connectionManager.updateEvent`)؛ مغلفات المقبض أربعة: `devices`/`positions`/`events`/`logs` | `notificators/NotificatorWeb.java:43-58`، `api/AsyncSocket.java:45-46,110-126` + قياس 007 §5.1 (R-M1-10) |
| حقول حدث `geofenceExit` **كما أعادها الخادم حرفيّاً**: `attributes,deviceId,eventTime,geofenceId,id,maintenanceId,positionId,type` (أمّا `attributes.message` فغير مقيس) | قياس 007 §9؛ `api/AsyncSocket.java:119-121` |
| **صيغ WKT التي يكتبها Traccar نفسه** (مرجع التنسيق، لأن `parseWkt` لا بد أن يقبلها): `CIRCLE (lat lon, r)` و`POLYGON ((lat lon, lat lon, …))` و`LINESTRING (lat lon, …)` — الفاصل `", "` دائماً، والمُحلِّل يقسم على `,` ثم على `\s` ⇒ المسافة الزائدة مقبولة عند القراءة | `geofence/GeofenceCircle.java:55-67,71-99`، `geofence/GeofencePolygon.java:121-132,134-170`، `geofence/GeofencePolyline.java:60-70,72-105` |
| هامش خط المسار **ليس** داخل الـWKT: يُقرأ من السمة `polylineDistance` وافتراضها `25.0` م | `model/Geofence.java:86` (`new GeofencePolyline(area, getDouble("polylineDistance", 25.0))`) |
| مضلّع بنقطتين يرفضه الخادم (`commaTokens.length < 3` ⇒ `ParseException`) ⇒ قاعدة «≥3 نقاط» ليست ذوقنا المحلي | `geofence/GeofencePolygon.java:146-149` |
| مُبقّى المعمل يُطابق نفس التنسيق ⇒ لا تعارض مصدرين: `circleArea`/`polylineArea` تُخرج `CIRCLE (…) وLINESTRING (…, …)` و`polylineDistance` **رقم بالمتر** | `lab/sink/lib/geo.mjs:12-18,26-35` + `lab/tests/geo.test.mjs:18` (`'LINESTRING (36.7538 3.0588, 36.7548 3.0598)'`) |

ومن قياس هذا الجهاز بتاريخ 2026-10-08 (قبل كتابة الخطة، لأن الخطة لا تُبنى على توقّع):

| القياس | النتيجة |
|---|---|
| `npm ci --no-audit --no-fund` | **added 188 packages in 5m**، `CI_EXIT=0`؛ تحذير `allow-scripts` على `esbuild@0.25.12`/`0.28.2` |
| `npm run lint` (`tsc --noEmit`) | **`LINT_EXIT=0`** على الكود الحالي |
| `npm run build` (`vite build`) | **`BUILD_EXIT=0`**، `✓ 1716 modules transformed`، `built in 42.41s`، `dist/assets/index-*.js 531.15 kB` |
| `npm test` (`tsx tests/core.test.ts`) | **`NPM_TEST_EXIT=0`** و`core unit tests passed` (أسطر `[OfflineQueueService] …HTTP 503` جزء من مسار الاختبار المقصود، لا فشل) |
| عدّاء اختبارات TS | `node --import tsx --test "tests/app/*.test.ts"` ⇒ `ℹ tests 1 / pass 1 / fail 0` (مقيس بملف فحص حُذف بعد القياس؛ والملف نفسه تحت `tsx --test` يعطي نفس العدد) |
| **حالة «لا ملفات» في العدّاء** | مجلد `tests/app` غائب أو فارغ ⇒ `ℹ tests 0 / pass 0 / fail 0` و**شفرة الخروج ٠** (مقيس بالحالتين: `NOFILES_EXIT=0` و`EMPTYDIR_EXIT=0`) ⇒ شفرة الخروج وحدها لا تثبت شيئاً، والأرضية العددية هي الحارس |
| **ملف اختبار يستورد شيئاً غير موجود** | ⇒ `ℹ tests 1 / pass 0 / fail 1` و`ERR_MODULE_NOT_FOUND` وشفرة الخروج ١ (مقيس بملف فحص حُذف بعد القياس) — أي أن ملف RED الكامل يُجمَّع في «اختبار واحد» لا N؛ لا تقرأ العدد كعدد اختبارات مهمة |
| `WebSocket` العام في Node | `node -e "console.log('WebSocket:', typeof WebSocket)"` ⇒ **`function`** على Node 24.19 (و`fetch` دالة عامة أيضاً) ⇒ فحص المقبس وقياسه بلا أي اعتمادية جديدة |
| نفق الهاتف الموثّق | `lab/README.md:138-140` (`adb reverse tcp:5055` للمواضع و`tcp:8082` للوحة من متصفح الهاتف) |

**لا شيء من هذا يدّعي أن التطبيق يعمل على الجهاز بعد** — تلك المهمة 12.

---

## خريطة ملفات M1

**تُنشأ:**

| الملف | المسؤولية الوحيدة |
|---|---|
| `src/services/traccar/types.ts` | أنواع كيانات Traccar فقط (Position/Event/Geofence/Device/User/Server) — لا منطق |
| `src/services/traccar/wkt.ts` | تحويل واحد بين هندسة التطبيق و`lat lon` WKT + قواعد الهندسة (§6) |
| `src/services/traccar/client.ts` | مصادقة + طلبات REST + أخطاء معرّفة + مهلة |
| `src/services/traccar/positions.ts` | Position خام ← حالة عرض (سرعة km/h، عمر، دقة، تصنيف طزاجة) |
| `src/services/traccar/socket.ts` | WS `/api/socket` + تراجع إلى استطلاع `/api/positions` كل 15ث (§4) |
| `src/services/traccar/zones.ts` | قراء/يكتب مناطق الخادم (`/api/geofences`) مع وصلات الأطفال |
| `src/services/traccar/permissions.ts` | قراء/يكتب وصلات المستخدم↔الجهاز والمنطقة↔الجهاز (§3، الروابط الثلاثة) |
| `src/services/traccar/events.ts` | أحداث المقبض الحيّة وربطها بسُلَّم التنبيهات (tiers §5) + سجلّ الجلسة — **بلا نافذة REST تاريخية في 6.16.0** (R-M1-9) |
| `src/services/traccar/zones.ts` | حفظ/حذف المناطق على الخادم + `ensureAlertSubscription` الذي يضمن `web` في `notificators` (R-M1-10) |
| `src/services/traccar/session.ts` | دخول/خروج/هوية + توليد رمز المقبس وبطلانه (Task 6) — لا تخزين للرمز في أي مخزن دائم |
| `src/components/map/childIcon.ts` | HTML أيقونة الطفل (§12): اتجاه، دائرة دقة بقياسها الحقيقي، نغمة الطزاجة (Task 7) |
| `src/components/ZonesScreen.tsx` | رسم المنطقة (دائرة/مضلّع/مسار) وحفظها على الخادم (Task 8) |
| `src/components/ChildScreen.tsx` | عرض طفل واحد بمصدره وتسميته وحالته من الخادم (Task 9) |
| `src/state/session.ts` | حالة الجلسة (من هو الوليّ، الدور، الأطفال المرئيون) |
| `src/state/children.ts` | خطّاف أطفال متعددون + تعدد المصادر وقاعدة الحسم (§3) |
| `src/components/LoginScreen.tsx` | دخول وحيدة الخروج؛ لا كلمة مرور مخزّنة |
| `src/components/AlertsLog.tsx` | شاشة «التنبيهات والسجل» (§12) من أحداث الخادم |
| `src/components/ContactsScreen.tsx` | شاشة «من يتّصل به» (§12) للقراءة والتعديل (admin) |
| `src/translations/catalog.ts` | القاموس المفحوص: أنواع + توفّر المفاتيح في اللغات الثلاث (يُنشئه Task 5، وتُضاف المفاتيح في 6–11) |
| `tests/app/wkt.test.ts` … `tests/app/*.test.ts` | اختبارات الوحدة لـM1 (تُضاف مهمة بمهمة) |
| `tools/m1/api-probe.mjs` | قياس سطح API من الخادم الحيّ ⇒ أثر مرفوع |
| `tools/m1/ac1-transport.mjs` | قياس AC-1 نقلاً على نفس كود العميل |
| `.github/workflows/m1-ci.yml` | lint + build + `test:app` بأرضية عدد على `m1/**` (NOT RUN أثناء انقطاع الحساب) |

**تُعدَّل:** `package.json` (سكريبت `test:app`)، `vite.config.ts` (proxy المعمل + `allowedHosts`)، `src/App.tsx` (إزالة الدور/`localStorage`، تركيب الشاشات)، `src/components/{MapView,ParentDashboard,SafeZoneForm,Navbar,SettingsModal}.tsx`، `src/types/index.ts`، `src/translations/index.ts`، `tests/core.test.ts`، `lab/README.md` (قسم M1)، `docs/superpowers/plans/2026-10-05-roadmap.md`.

**تُحذف (المهمة 11، لا قبلها) — قائمة §1 بند 5 حصراً، لا أكثر:** نموذج الأدوار (`DeviceRole` في `src/types/index.ts` وفروعه في `App.tsx`/`Navbar.tsx`/`SettingsModal.tsx`)، `localStorage` **بوصفه سجلاً** (مفاتيح السجلّ الخمسة في Task 11 Step 1)، `server/index.mjs` + سكريبت `server`، طبقة Supabase (**مُوصوفة كموجود‑عدم**: مقيس صفر نتيجة في الكود و`package-lock.json`، فلا «حذف طبقة Supabase» يُدّعى)، ومفاتيح المحاكاة (`isSimulatingOutside`/`testModeEnabled`/`setMockBatteryLevel`/`method:'simulated'`).

**لا تُحذف — قائمة §1 بند 6 ملزمة (الرقم ستّة، والحارس في Task 11 Step 1 يرفض اختفاء أي منها):** `GeofenceMonitor`، `RiskEngine`، `GpsFreshnessService`، `OfflineQueueService`، `AlertPolicyManager`، `PrivacyDataService` **واختباراتها**. هذه طبقات محلية سريعة (§7) وتبقى؛ وما يتغيّر فيها هو **مصدر البيانات** (من `localStorage` إلى الخادم) لا وجودها. أي حذف لأحدها = تجاوز للمواصفة، لا تنظيف.

**قاعدة الترتيب:** لا حذف قبل أن توجد البدالة المختبَرة. المهمة 11 أخيرة لهذا السبب.

---

## Task 1: أرضية التحقق على فرع M1

> **ملاحظة بعد القياس (R-M1-7):** هذا Task قُبل بمفظوم معلن — لا شيء في هذه المهمة يمنع محليّاً حالة «أخضر بلا اختبارات» (`tests 0` تخرج صفرّاً، والحرّاس داخل `tests/app/` لا يرون جمع أنفسهم، وأرضية `m1-ci.yml` لا تُنفَّذ على حساب معطّل). الأنياب الآلية تُبنى في Task 3 Step 5، وقاعدة «شغّل سطر الأرضية محليّاً في كل كتلة بوابات» سارية من الآن في كل مهمة.

**Files:**
- Create: `.github/workflows/m1-ci.yml`, `tests/app/harness.test.ts`
- Modify: `package.json` (سطر `test:app` بعد سطر `test:lab`)
- لا تعديل على `tsconfig.json` — **مقيس**: فيه `allowImportingTsExtensions: true` و`moduleResolution: bundler`، فاستيراد `../../src/.../client.ts` بصيغة `.ts` يمرّ `tsc --noEmit` دون إعداد إضافي.

**Interfaces:**
- Consumes: لا شيء.
- Produces: `npm run test:app` ⇒ يشغّل `node --import tsx --test "tests/app/*.test.ts"` ويطبع `ℹ tests N`. كل مهمة لاحقة تستعمله.

- [ ] **Step 1: أنشئ الفرع من `lab/m0` عند HEAD المرفوع**

```bash
git fetch origin
git rev-parse origin/lab/m0        # نقطة الاشتقاق — الصق الناتج حرفيّاً في أول سطر بالسجل
git rev-list --count origin/lab/m0 # تأكد أن رأس lab/m0 هو التزام الخطة (docs(M1): implementation plan …)
git checkout -b m1/guardian-app origin/lab/m0
```

- [ ] **Step 2: أضف السكريبت** في `package.json` بعد سطر `test:lab:16`:

```json
    "test:app": "node --import tsx --test \"tests/app/*.test.ts\"",
```

- [ ] **Step 3: أُثبِت أن العدّاء يفشل للسبب الصحيح، لا أنه يعمل فقط.** أنشئ `tests/app/harness-probe.test.ts` فحصاً مؤقتاً (اختبار ينجح + اختبار يفشل بعمد):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('probe: the runner executes real assertions', () => {
  const one: number = 1;
  assert.equal(one, 1);
});

test('probe: deliberately red so we see the exit code move', () => {
  assert.equal(1, 2);
});
```

شغّله وتحقّق من ثلاثتهم:

```bash
npm run test:app > /tmp/probe.log 2>&1; rc=$?; echo "PROBE_EXIT=$rc"; grep -E '^ℹ (tests|pass|fail)' /tmp/probe.log
```

المتوقع: `tests 2`، `pass 1`، `fail 1`، و**`PROBE_EXIT=1`**. السبب: قاعدة M0 المستخلَصة (ملف بلا `test()` يطبع `tests 1 / pass 1 / fail 0` ويخرج ٠) — إن خرج ٠ مع `fail 1` فالبوابة كاذبة وتُوقَف المهمة.

- [ ] **Step 4: قياس حالة «لا ملفات» — ثم استبدال الفحص بحارس دائم**

```bash
rm tests/app/harness-probe.test.ts
npm run test:app > /tmp/nofiles.log 2>&1; rc=$?; echo "NOFILES_EXIT=$rc"; grep -E '^ℹ (tests|pass|fail)' /tmp/nofiles.log
```

**النتيجة مقيسة على هذا الجهاز بتاريخ 2026-10-08 (لا تُترك للمفاجأة لاحقاً):** لا يوجد ملف مطابق ⇒ `ℹ tests 0 / pass 0 / fail 0` و**`NOFILES_EXIT=0`**. نفس الشيء بالضبط إن كان المجلد موجوداً وفارغاً (`EMPTYDIR_EXIT=0`). أي أن «البوابة خضراء» وحدها لا تعني شيئاً: **أرضية العدد هي الحارس، لا شفرة الخروج** (درس M0 نفسه). ولأن المجلد الفارغ لا يتتبّعه git، لا `.gitkeep` — بل يُترك ملف حارس دائم بدل الفحص.

أنشئ `tests/app/harness.test.ts` (هذا هو أول اختبار حقيقي في `tests/app`، ويُبقى المجلد غير فارغ في الأصل):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The gate is the count floor in .github/workflows/m1-ci.yml. This test guards the thing
// that floor depends on: if the test:app script or its glob changes, files stop being
// collected and the run goes green with zero real tests (measured: tests 0 exits 0).
test('npm run test:app still points at the tests/app glob the CI floor counts', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['test:app'], 'node --import tsx --test "tests/app/*.test.ts"');
});
```

- [ ] **Step 4b: تحقّق أن الحارس يدري** — عدّل `package.json` مؤقتاً (اقلب `tests/app` إلى `tests/apx`)، وشغّل `npm run test:app`، وتوقّع فشله بـ`AssertionError` على هذا السطر، ثم أرجِعه. لا تُثبِت حارساً لم يَرَّ يوماً.

- [ ] **Step 5: اكتب `m1-ci.yml` (بوابة معلّقة على انقطاع الحساب، لا زائفة)**

```yaml
name: m1
on:
  push:
    branches: ['m1/**']
jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install dependencies
        run: npm ci --no-audit --no-fund || npm install --no-audit --no-fund
      - name: Type-check
        run: npm run lint
      - name: Build the web bundle
        run: npm run build
      # نفس درس M0: ملف *.test.mjs/‎.test.ts بلا test() يطبع tests 1 ويخرج ٠،
      # فالبوابة أرضية عدد لا شفرة خروج. تُرفع الأرقام في نفس الالتزام الذي يزيد الاختبارات.
      - name: Run app tests with a measured count floor
        env:
          EXPECTED_MIN_TESTS: '1'
        run: |
          set -o pipefail
          npm run test:app --silent | tee /tmp/app.log
          n=$(grep -E '^ℹ tests ' /tmp/app.log | awk '{print $3}')
          echo "detected tests=$n (floor $EXPECTED_MIN_TESTS)"
          awk -v n="$n" -v f="$EXPECTED_MIN_TESTS" 'BEGIN { exit (n+0 >= f+0) ? 0 : 1 }'
      - name: Lab suite must not regress
        env:
          EXPECTED_MIN_TESTS: '97'
        run: |
          set -o pipefail
          npm run test:lab --silent | tee /tmp/lab.log
          n=$(grep -E '^ℹ tests ' /tmp/lab.log | awk '{print $3}')
          awk -v n="$n" -v f="$EXPECTED_MIN_TESTS" 'BEGIN { exit (n+0 >= f+0) ? 0 : 1 }'
```

**الأرضية = العدد المقيس بعد هذا الالتزام، لا رقم مخمّن.** الأرقام المكتوبة هنا محبوكة من عدّ الاختبارات في خطوات هذه الخطة (Task 1 ⇒ `1` حارس العدّاء؛ Task 3 ⇒ `7` (+6 عميل REST)؛ Task 4 ⇒ `17` (+10 هندسة WKT)؛ Task 5 ⇒ `26` (+8 طزاجة و+1 حارس القاموس))، **لكن المرجع دائماً سطر `ℹ tests N` الفعلي**: من صمم اختباراً أكثر أو أقل يرفع الأرضية إلى عدّه المقيس في نفس الالتزام. ولأن `tests 0` تخرج صفرّاً (قيس في Step 4) فإن الأرضية هي الحارس الوحيد ضد «أخضر بلا اختبارات».

**قاعدة سارية على Task 6–11 وإن لم تُكرَّر في خطواتها:** كل التزام يضيف اختبارات تحت `tests/app/` يرفع `EXPECTED_MIN_TESTS` إلى العدد المقيس **في نفس الالتزام**، ولا التزام يحذف اختبارات ويترك الأرضية أعلى مما يُقاس (بوابة حمراء بلا سبب = مغريات لتخفيضها لاحقاً بلا قياس).

- [ ] **Step 6: تحقّق محليّاً من البوابات الأربع ثم ادفع**

```bash
npm run lint && echo LINT_OK ; npm run build >/tmp/b.log 2>&1; echo "BUILD_EXIT=$?" ; grep -E 'modules transformed|built in' /tmp/b.log
npm run test:app 2>&1 | grep -E '^ℹ (tests|pass|fail)'
npm run test:lab 2>&1 | grep -E '^ℹ (tests|pass|fail)'
git add package.json .github/workflows/m1-ci.yml tests/app/harness.test.ts
git commit -m "chore(m1): app test runner, m1 CI gate, and proof that the runner fails for real reasons"
git push -u origin m1/guardian-app
gh run list --branch m1/guardian-app --limit 5 --json databaseId,conclusion,jobs 2>/dev/null || echo "no run yet"
```

المتوقع (المقيس على هذا الجهاز 2026-10-08): `LINT_OK`، `BUILD_EXIT=0` مع `✓ 1716 modules transformed`، `tests 1 / pass 1 / fail 0` للتطبيق، **`97 / 97 / 0` للمعمل** (أُعيد قياسها الآن؛ أي رقم أقل بعد مهمة لاحقة = انحدار). خطوة CI: **NOT RUN — CI unavailable (account billing)**؛ يُرفق إن كان هناك تشغيل وكيف يبدو (`steps: []`) ولا يُدّعى نجاحه.

---

## Task 2: سطح API من الخادم الحيّ — دليل لا توقّع

**Files:**
- Create: `tools/m1/api-probe.mjs`
- Create (أثر): `lab/report/evidence/007-app-api-surface.md`
- Modify: `lab/README.md` (قسم «M1 — التطبيق قارئاً»: أمر التشغيل والتنظيف)

**Interfaces:**
- Consumes: خادم المعمل القائم (`lab/traccar/run.sh`) + طبولوجيا `npm run lab:bootstrap` (جهاز `lab-child-1`، منطقتا `school` و`walk-to-park`، مستخدما `admin` و`lab-guardian-2`).
- Produces: جدول الحقائق التي تُكتب من مخرجات، لا من الذاكرة، ويستعمله Task 3–10 في تسمية الحقول: مسارات الطلبات، أسماء الحقول، شكل خطأ المصادقة، ترويسات CORS، و**شكل رسالة `/api/socket`** (بلا هذا لا يملك Task 10 ما يبنيه).

- [ ] **Step 1: شغّل السلسلة حتى نقطة القياس** (مرجع الأوامر: `lab/README.md:36-55`)

```bash
npm run lab:render && npm run lab:check
npm run lab:bootstrap   # بيانات من env المحلي، لا من الطرفية المنسوخة
```

المتوقع: `config ok` ثم سطور bootstrap التي تطبع ids المستخدم/الجهاز/المنطقة. **انتظر `:8082` بالاستطلاع لا بافتراض الجاهزية** (`lab/README.md:44`).

- [ ] **Step 2: اكتب أداة الفحص** بحيث لا تخزّن أي سرّ: تقرأ من env وتطبع **أسماء الحقول وقيم غير حساسة فقط** (ids، أنواع، طوابع زمنية، عدد السطور). لا كلمات مرور، لا ترويسة `authorization` كاملة، لا بريد مستخدم.

```js
// tools/m1/api-probe.mjs — records the SHAPE of the API the guardians' app will consume.
// Prints field names and non-sensitive values only. Secrets are read from env and never echoed.
const base = process.env.LAB_API_URL || 'http://127.0.0.1:8082/api';

const auth = 'Basic ' + Buffer.from(`${process.env.LAB_ADMIN_EMAIL}:${process.env.LAB_ADMIN_PASSWORD}`).toString('base64');

const keysOf = (value) =>
  Array.isArray(value) ? (value.length === 0 ? '[]' : keysOf(value[0]))
    : value && typeof value === 'object' ? Object.keys(value).sort().join(',') : typeof value;

async function show(label, path, options = {}) {
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { authorization: auth, ...(options.headers || {}) },
      method: options.method || 'GET',
      body: options.body,
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text === '' ? null : JSON.parse(text); } catch { /* non-JSON kept as a note */ }
    console.log(`\n== ${label} == ${options.method || 'GET'} ${path} -> HTTP ${response.status}`);
    console.log(`fields: ${parsed === null ? text.slice(0, 120) : keysOf(parsed)}`);
    if (options.fields) console.log(`count: ${Array.isArray(parsed) ? parsed.length : 1}`);
    return parsed;
  } catch (error) {
    console.log(`\n== ${label} == ${path} -> FETCH FAILED ${error.message}`);
    return null;
  }
}

// 1. who am I + the role field the UI will branch on
await show('session', '/session', { fields: true });
// 2. the child devices a guardian can actually see
const devices = await show('devices', '/devices', { fields: true });
const deviceId = devices?.[0]?.id;
// 3. latest positions, three query shapes (PositionResource.java:73-106)
await show('all-latest', '/positions', { fields: true });
if (deviceId) await show('device-latest', `/positions?deviceId=${deviceId}`, { fields: true });
const dayAgo = new Date(Date.now() - 86400000).toISOString();
if (deviceId) await show('history', `/positions?deviceId=${deviceId}&from=${dayAgo}&to=${new Date().toISOString()}`, { fields: true });
// 4. geofences: the area string comes back in WHICH order? (the §6 trap, measured not assumed)
const fences = await show('geofences', '/geofences', { fields: true });
for (const fence of fences || []) console.log(`geofence ${fence.id} "${fence.name}" area=${fence.area}`);
// 5. events window the alerts screen will read
await show('events', `/events?from=${dayAgo}&to=${new Date().toISOString()}`, { fields: true });
// 6. what an unauthenticated call actually returns (the UI's 401 path)
const anonymous = await fetch(`${base}/positions`);
console.log(`\n== anonymous == HTTP ${anonymous.status} body=${(await anonymous.text()).slice(0, 120)}`);
// 7. CORS as configured (Keys.java:1003 default; the lab path uses a same-origin proxy).
//    OPTIONS bypasses authentication entirely (SecurityRequestFilter.java:57-59), so this needs no secret.
const preflight = await fetch(`${base}/positions`, {
  method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:3000', 'access-control-request-method': 'GET' },
});
console.log(`\n== cors == HTTP ${preflight.status} allow-origin=${preflight.headers.get('access-control-allow-origin')} allow-credentials=${preflight.headers.get('access-control-allow-credentials')}`);

// 8. the live socket the alerts screen will use (Task 10). Authentication is a `token` query
//    parameter (AsyncSocketServlet.java:58-74); the token is minted by POST /api/session/token
//    (SessionResource.java:150-162) and revoked again at the end of this probe.
//    Node 24 ships a global WebSocket — measured on this machine: `WebSocket: function` — so no dependency.
const tokenResponse = await fetch(`${base}/session/token`, {
  method: 'POST',
  headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
  body: `expiration=${encodeURIComponent(new Date(Date.now() + 3600000).toISOString())}`,
});
const token = (await tokenResponse.text()).trim();
console.log(`\n== token == HTTP ${tokenResponse.status} length=${token.length}`); // the value is never printed

if (tokenResponse.ok && token.length > 20) {
  const wsBase = (process.env.LAB_WS_URL || base.replace(/^http/, 'ws'));
  const socket = new WebSocket(`${wsBase}/socket?token=${encodeURIComponent(token)}`);
  const shapes = new Set();
  socket.addEventListener('open', () => console.log('== socket == OPEN'));
  socket.addEventListener('message', (event) => {
    try { shapes.add(keysOf(JSON.parse(String(event.data)))); }
    catch { shapes.add(`non-json(${String(event.data).slice(0, 40)})`); }
  });
  socket.addEventListener('error', (event) => console.log(`== socket == ERROR ${event.message}`));
  // Idle frames only prove the handshake; a real frame needs an event. While this 20 s window is
  // open, run in a second shell: npm run lab:scenario -- school-exit --speed=1
  await new Promise((done) => setTimeout(done, 20000));
  socket.close();
  await new Promise((done) => setTimeout(done, 500));
  console.log(`== socket frames == ${shapes.size === 0 ? 'NONE IN WINDOW (run the scenario while it is open)' : [...shapes].join(' | ')}`);
  const revoke = await fetch(`${base}/session/token/revoke`, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
    body: `token=${encodeURIComponent(token)}`,
  });
  console.log(`== token revoke == HTTP ${revoke.status}`); // the token must not outlive the probe
} else {
  console.log('== socket == SKIPPED, no token issued (record NOT RUN, do not guess the frame shape)');
}
```

- [ ] **Step 3: شغّله واحفظ المخرجات حرفيّاً** — الوسائط تأتي من ملف env المحلي المُتتبَّع بـgit-ignore الذي يستعمله المعمل أصلاً (`lab/traccar/fanout.env`، سطور `export KEY=value`؛ **المسار يُذكر ولا يُطبع المحتوى أبداً**، ولا تُنسخ كلمة المرور داخل سطر الأمر حتى لا تستقرّ في سجلّ الطرفية):

```bash
set -a; source lab/traccar/fanout.env; set +a
node tools/m1/api-probe.mjs > /tmp/api-probe.txt 2>&1; echo "PROBE_EXIT=$?"
grep -c 'PASSWORD\|Basic ' /tmp/api-probe.txt   # المتوقع 0 — لا سرّ في المخرجات
```

المتوقع: لا سطر `FETCH FAILED` (الخادم قائم). إن وُجد فالحكم **NOT RUN** لا نتيجة — لا يجوز استخراج جدول حقول من خادم غير قائم.

- [ ] **Step 4: اكتب `lab/report/evidence/007-app-api-surface.md`** بأربعة أقسام، كلها من مخرجات الخطوة 3: (١) جدول «المسار ⇐ الحقول المُرجَعة»؛ (٢) **ترتيب الإحداثيات العائد حرفيّاً** من سطور `area=` (وهذا يقرّر إن كان `wkt.ts` يحتاج فكّاً أم تمريراً)، مع ملاحظة صريحة إن ظهر `CIRCLE (36.7538 3.0588, 120)` أي `lat lon`؛ (٣) شكل 401 المجهول؛ (٤) ترويسات CORS الفعلية مع قيمة `web.origin` المستنتَجة، وعبارة «المسار المُستعمَل في المعمل هو proxy نفس الأصل، فلا CORS على المسار الحرج».

- [ ] **Step 5: أضف قسم M1 إلى `lab/README.md`** (أمر تشغيل الفحص مع `source lab/traccar/fanout.env` + النفق + التنظيف)، وأضِفاً `lab/traccar/fanout.env` إلى قائمة «ملفات محليّة لا تُتبَّع» (القائمة الحالية عند `lab/README.md:216-219` لا تذكره، وهو يحوي أسراراً — وهذا وثيق لا تجميل)، ثم:

```bash
git add tools/m1/api-probe.mjs lab/report/evidence/007-app-api-surface.md lab/README.md
git commit -m "docs(m1): measured Traccar API surface the guardians' app will consume (007)"
git push
```

---

## Task 3: كيانات Traccar وعميل REST

**Files:**
- Create: `src/services/traccar/types.ts`, `src/services/traccar/client.ts`
- Modify: `tests/core.test.ts` (فحص الأرضية المحلي — Step 5، R-M1-7ب)، `.github/workflows/m1-ci.yml` (الأرضية `1` ⇒ `7`)
- Test: `tests/app/client.test.ts`

**Interfaces:**
- Consumes: جدول الحقول من `007-app-api-surface.md` (Task 2).
- Produces:
  - `type ServerPosition = { id: number; deviceId: number; fixTime: string; serverTime: string; latitude: number; longitude: number; speed: number; course: number; accuracy: number | null; attributes: Record<string, unknown> }` (الحقول فعلاً كما أعادها الفحص)
  - `type Credentials = { email: string; password: string }` (يُصدَّر من `types.ts` لأن `client.ts` يستورده — اكتبه هناك فعلاً، لا في `client.ts`)
  - `createTraccarClient({ baseUrl, credentials, timeoutMs? }) ⇒ { get<T>(path, params?): Promise<T>; post<T>(path, body): Promise<T>; put<T>(path, body): Promise<T>; remove(path, params?): Promise<null> }` — **الاسم `remove` لا `delete`** عمداً: `delete` كلمة محجوزة في موضع الاستدعاء `.delete()` داخل TS بلا خطأ لكنها تُربك القارئ؛ وكل من `zones.ts`/`permissions.ts` ينادي `client.remove(...)` بنفس الاسم. (الاسم المرجعي للمهام اللاحقة هو ما في كتلة التنفيذ أدناه حرفيّاً.)
  - `class TraccarError extends Error { status: number; kind: 'unauthorized' | 'forbidden' | 'notfound' | 'server' | 'network' | 'timeout' | 'badpayload' }`
  - لا `any` خارج `types.ts`؛ ولا كلمة مرور في أي نوع يُطبع.

- [ ] **Step 1: RED — اكتب الاختبارات قبل التنفيذ** (`tests/app/client.test.ts`) على خادم Node وهمي محلي (لا شبكة خارجية، ولا خادم المعمل مطلوب هنا):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTraccarClient, TraccarError } from '../../src/services/traccar/client.ts';

function withServer(handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void) {
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as import('node:http').AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}/api`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test('GET sends Basic auth built from the credentials it was given', async () => {
  let seen: string | undefined;
  const srv = await withServer((req, res) => {
    seen = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('[]');
  });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    assert.deepEqual(await client.get('/positions'), []);
    assert.equal(seen, 'Basic ' + Buffer.from('a@b.example:x').toString('base64'));
  } finally { await srv.close(); }
});

test('a 401 body becomes kind=unauthorized, not a generic error', async () => {
  const srv = await withServer((_req, res) => { res.writeHead(401); res.end('{"error":"Unauthorized login"}'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    await assert.rejects(client.get('/positions'), (error: unknown) => {
      assert.ok(error instanceof TraccarError);
      assert.equal((error as TraccarError).kind, 'unauthorized');
      assert.equal((error as TraccarError).status, 401);
      return true;
    });
  } finally { await srv.close(); }
});

test('the password and the auth header never appear in the error message', async () => {
  const srv = await withServer((_req, res) => { res.writeHead(401); res.end('nope'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'sup3rs3cret' } });
    const error = await client.get('/positions').catch((e) => e as Error);
    assert.ok(error instanceof TraccarError);
    assert.doesNotMatch(error.message, /sup3rs3cret|authorization/i, error.message);
  } finally { await srv.close(); }
});

test('a query object becomes a sorted, repeated-free query string', async () => {
  let url = '';
  const srv = await withServer((req, res) => { url = req.url ?? ''; res.writeHead(200); res.end('[]'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    await client.get('/positions', { deviceId: 7, to: '2026-10-08T00:00:00Z', from: '2026-10-07T00:00:00Z' });
    assert.match(url, /^\/positions\?deviceId=7&from=/);
    assert.ok(url.indexOf('from') < url.indexOf('to'), url);
  } finally { await srv.close(); }
});

test('a 200 with a non-JSON body is kind=badpayload, not a silent null', async () => {
  const srv = await withServer((_req, res) => { res.writeHead(200); res.end('<html>login</html>'); });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' } });
    await assert.rejects(client.get('/positions'), (error: unknown) => (error as TraccarError).kind === 'badpayload');
  } finally { await srv.close(); }
});

test('a hung server becomes kind=timeout, not an infinite spinner', async () => {
  const srv = await withServer(() => { /* never answers */ });
  try {
    const client = createTraccarClient({ baseUrl: srv.url, credentials: { email: 'a@b.example', password: 'x' }, timeoutMs: 120 });
    await assert.rejects(client.get('/positions'), (error: unknown) => (error as TraccarError).kind === 'timeout');
  } finally { await srv.close(); }
});
```

- [ ] **Step 2: شغّلها وترقَّبت أن تفشل لأن الملف غير موجود**

```bash
npm run test:app 2>&1 | tail -12
```

المتوقع: فشل باستحالة استيراد `client.ts` (وليس خطأ صياغة)، ثم **التصميم من مخرجات الفحص**: إن أعاد `/positions` حقل `speed` بالعقد فليُذكر في `types.ts` كتعليق وحدة واحد فقط.

- [ ] **Step 3: نفّذ `types.ts` و`client.ts`** — الحد الأدنى الذي يمرّ الستة. أولاً `types.ts` (كيان واحد لكل مورد + `Credentials` الذي يستورده `client.ts`؛ الحقول تُنسخ من جدول `007-app-api-surface.md`، وما يضيفه الخادم لاحقاً لا يُختلَق):

```ts
// src/services/traccar/types.ts — entity shapes only; no logic lives here.
// Field names are copied from lab/report/evidence/007-app-api-surface.md, which copied them
// from the live server. If the probe did not show a field, it does not go in this file.
export type Credentials = { email: string; password: string };

export type ServerPosition = {
  id: number;
  deviceId: number;
  fixTime: string;   // ISO-8601 (MainModule.java:153-158 disables WRITE_DATES_AS_TIMESTAMPS)
  serverTime: string;
  latitude: number;
  longitude: number;
  speed: number;     // KNOTS as delivered by Traccar (model/Position.java) — the UI shows km/h
  course: number;
  accuracy: number | null;
  geofenceIds?: number[];
  attributes: Record<string, unknown>;
};

export type ServerEvent = {
  id: number;
  type: string;      // 'geofenceExit' | 'alarm' | 'deviceOffline' | … (model/Event.java:42-72)
  eventTime: string;
  deviceId: number;
  positionId?: number;
  geofenceId?: number;
  maintenanceId?: number;   // ظهر في قياس 007 §9 داخل إطار {"events":[…]} — الحقل السابع بلا استعمال عندنا
  attributes?: Record<string, unknown>;  // رسالة NotificatorWeb غير مقيسة: لا تعتمد عليها
};

export type ServerGeofence = {
  id: number;
  name: string;
  description?: string;
  area: string;                        // WKT, `lat lon` — handled only by wkt.ts
  attributes?: Record<string, unknown>;
};

export type ServerDevice = { id: number; name: string; uniqueId: string; status?: string; lastUpdate?: string };
export type ServerUser = { id: number; name?: string; email: string; admin?: boolean };
```

ثم `client.ts`:

```ts
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
```

‏`Buffer` متوفّر لأن `@types/node` مثبّت والمحرّك Node؛ إن رفض `tsc` الاستعمال في سياق المتصفح فاستبدله بـ`btoa(unescape(encodeURIComponent(...)))` **واعدّل الاختبار الذي يطالب Basic** في نفس الالتزام (لا تترك اختباراً يتهم سلوكاً غير الموجود).

- [ ] **Step 4: GREEN + بوابات المرحلة**

```bash
npm run test:app 2>&1 | grep -E '^ℹ (tests|pass|fail)'
npm run lint && npm run build >/tmp/b.log 2>&1; echo "BUILD_EXIT=$?"; grep 'built in' /tmp/b.log
```

المتوقع: `tests 7 / pass 7 / fail 0` (6 عميل + حارس العدّاء من Task 1)، lint وbuild صفر.

- [ ] **Step 5: أنياب محلية للفحص الآلي (R-M1-7ب) — `tests/core.test.ts`** — هذا أول مهمة تضيف اختبارات إنتاج حقيقية، وهي التي تُغلق الثقب الذي تركه Task 1 بمقيسه: الحرّاس داخل `tests/app/` لا يرون جمعَ أنفسهم، وCI لا ينفّذ شيئاً. `npm test` هو الأمر المحلي الوحيد الذي يعمل دائماً مهما يكن الـglob، فنجعل فيه الفحص. **بدون أي اعتمادية جديدة**: يُطلق العدّاء الفرعي، يقرأ `ℹ tests N`/`ℹ fail M`، ويقارن N بأرضية **مقروءة من `m1-ci.yml` نفسها** (مصدر واحد للحقيقة، فلا رقم يُنقل بين ملفين ويسقط التحديث):

```ts
// App-runner floor, enforced where it is always executed. A test inside tests/app/ cannot
// police its own collection: when the glob matches nothing the runner prints `tests 0` and
// exits 0, so the guard file is never run. npm test is the local gate that always runs.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/m1-ci.yml', import.meta.url), 'utf8');
const floorMatch = workflow.match(/Run app tests with a measured count floor[\s\S]*?EXPECTED_MIN_TESTS: '(\d+)'/);
assert(floorMatch !== null, 'm1-ci.yml lost the app count floor step');
const floor = Number(floorMatch![1]);

const run = spawnSync('npm', ['run', 'test:app', '--silent'], { encoding: 'utf8', shell: true });
const counted = /ℹ tests (\d+)/.exec(run.stdout);
const failed = /ℹ fail (\d+)/.exec(run.stdout);
assert(counted !== null && failed !== null, `app runner printed no summary: ${run.stdout.slice(-400)}`);
console.log(`app floor check: tests ${counted[1]} >= ${floor}, fail ${failed[1]}`);
assert(Number(counted[1]) >= floor, `app tests de-collected or shrank: ${counted[1]} < ${floor}`);
assert(Number(failed[1]) === 0, `app runner reports ${failed[1]} failures`);
```

ثم **قيس الحارس كما يُقاس أي حرّاس** (درس Task 1 Step 4b): (أ) مرّر كما هو؛ (ب) ارفع الأرضية في `m1-ci.yml` إلى `999` مؤقتاً وتأكد أن `npm test` يفشل برسالة `de-collected or shrank`؛ (ج) غيّر الـglob في `package.json` إلى `tests/apx/*` مؤقتاً (وهي بالضبط حالة فقد الجمع التي لا يراها Task 1) وتأكد أن `npm test` **لا يزال** يفشل؛ ثم رجّع الاثنين و`git status --porcelain` فارغ. الصق الثلاثة في الأثر.

- [ ] **Step 6: ارفع أرضية CI في نفس الالتزام** — بعد هذا commit يكون `ℹ tests 7` مقيساً (1 حارس العدّاء + 6 عميل REST)، فتُكتب `EXPECTED_MIN_TESTS: '7'` في `.github/workflows/m1-ci.yml` بدل `1`. **لا ترفعها على أمل ما سيأتي**، ولا تتركها على الرقم القديم بعد إضافة اختبارات: في الحالتين تفقد البوابة معناها (وهي البوابة الوحيدة ما دام CI معطلاً) ثم:

```bash
npm run test:app --silent | tee /tmp/app.log; n=$(grep -E '^ℹ tests ' /tmp/app.log | awk '{print $3}'); awk -v n="$n" -v f=7 'BEGIN { exit (n+0 >= f+0) ? 0 : 1 }'; echo "LOCAL_FLOOR_EXIT=$?"
npm test 2>&1 | tail -4
git add src/services/traccar tests/app/client.test.ts tests/core.test.ts .github/workflows/m1-ci.yml
git commit -m "feat(m1): Traccar REST client with typed error kinds; secret-safe failures (6 tests, app floor 7)"
git push
```

---

## Task 4: دالة WKT الواحدة — فخّ `lat lon` مقفول بالاختبار

**Files:**
- Create: `src/services/traccar/wkt.ts`
- Test: `tests/app/wkt.test.ts`

**Interfaces:**
- Consumes: `lab/scenarios/school-exit.json` كعيّنة إحداثيات حقيقية؛ و`007-app-api-surface.md` لترتيب `area` العائد.
- Produces:
  - `toCircleWkt({ lat, lon, radiusMeters }): string` ⇒ `CIRCLE (lat lon, r)`
  - `toPolygonWkt(points: Array<{lat, lon}>): string` ⇒ `POLYGON((lat lon, …))` مغلق
  - `toRouteWkt({ points, bufferMeters }): { area: string; attributes: { polylineDistance: number } }` ⇒ `LINESTRING (lat lon, …)` — والهامش **متر عدد** في السمة لا داخل الـWKT (`Geofence.java:86`)
  - `parseWkt(area: string): Geometry` (لكي لا تُعاد كتابة المنطقة عند كل تعديل — وإلا ضاع الشكل)؛ يقبل صيغتنا وصيغة الخادم معاً، ويرمي خطأً مسمّى على أي شكل آخر
  - `toWktOf(geometry): string` — المُخرج العام لكل الأشكال (يستعمله الحارس الدائري في `zones.ts` ولا يُصدَّر للمكوّنات)
  - `validateZone({ type, geometry }): string[]` — قواعد §6: حواف ≥50م للمدرسة/البيت، 100م للطرق، لا دائرة <50م لأي نوع، ومضلّع ≥3 نقاط مغلقة، ومسار بلا `polylineDistance` مرفوض.
  - **قاعدة صارمة:** لا يكتب أي مكوّن نص WKT بيده؛ يستدعي هذه الدوال فقط (يُفرض باختبار بحث في §٥ من تقرير المهمة).

- [ ] **Step 1: RED — الاختبارات، وأهمها الاختبار الذي يقتل العكس**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toCircleWkt, toPolygonWkt, toRouteWkt, toWktOf, parseWkt, validateZone,
} from '../../src/services/traccar/wkt.ts';

// 36.7538/3.0588 = وسط الجزائر. لو خرج "lon lat" لوقعت المنطقة في الصحراء شرقاً (المواصفة §6).
test('circle WKT is lat-then-lon, and a swapped pair is a different, wrong area', () => {
  assert.equal(toCircleWkt({ lat: 36.7538, lon: 3.0588, radiusMeters: 120 }), 'CIRCLE (36.7538 3.0588, 120)');
  const wrong = toCircleWkt({ lat: 3.0588, lon: 36.7538, radiusMeters: 120 });
  assert.notEqual(wrong, 'CIRCLE (36.7538 3.0588, 120)', 'a swapped pair must not read as the school zone');
});

test('polygon closes itself and stays lat-then-lon per vertex', () => {
  const wkt = toPolygonWkt([{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.05 }, { lat: 36.76, lon: 3.06 }]);
  assert.equal(wkt, 'POLYGON((36.75 3.05, 36.76 3.05, 36.76 3.06, 36.75 3.05))');
});

test('route zones are LINESTRING + a metre polylineDistance, never one big circle', () => {
  const { area, attributes } = toRouteWkt(
    { points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }], bufferMeters: 120 });
  assert.equal(area, 'LINESTRING (36.7538 3.0588, 36.7545 3.0595)');
  // Geofence.java:86 reads polylineDistance as METRES (default 25.0) — it is not in the WKT.
  assert.equal(attributes.polylineDistance, 120);
});

test('parse round-trips every shape we emit', () => {
  const cases = [
    toCircleWkt({ lat: 36.7538, lon: 3.0588, radiusMeters: 120 }),
    toPolygonWkt([{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.05 }, { lat: 36.76, lon: 3.06 }]),
    toRouteWkt({ points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }], bufferMeters: 120 }).area,
  ];
  for (const area of cases) {
    assert.equal(toWktOf(parseWkt(area)), area, `round-trip must be byte-identical: ${area}`);
  }
});

test("parse also accepts the form Traccar's own toWkt emits (space before the ring)", () => {
  // GeofencePolygon.java:121-132 writes "POLYGON ((lat lon, ...))"; we write "POLYGON((...))".
  // A zone the server re-serialised must still load into the editor instead of losing its shape.
  const fromServer = 'POLYGON ((36.75 3.05, 36.76 3.05, 36.76 3.06, 36.75 3.05))';
  assert.deepEqual(parseWkt(fromServer), {
    kind: 'polygon',
    points: [{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.05 }, { lat: 36.76, lon: 3.06 }, { lat: 36.75, lon: 3.05 }],
  });
});

test('an unknown geometry type is a named error, not an empty zone', () => {
  assert.throws(() => parseWkt('MULTIPOLYGON (((36.75 3.05)))'), /unknown|unsupported/i);
});

test('a school circle smaller than the 50 m edge is refused with the reason', () => {
  const errors = validateZone({ type: 'school', geometry: { kind: 'circle', lat: 36.7538, lon: 3.0588, radiusMeters: 25 } });
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.match(errors[0], /≥\s*50|>=\s*50/, errors[0]);
});

test('route zones need 100 m of edge, not the school default', () => {
  const errors = validateZone({ type: 'route', geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }], bufferMeters: 60 } });
  assert.ok(errors.some((e) => /100/.test(e)), errors.join('\n'));
});

test('a route zone with no declared buffer is refused, not silently given the server 25 m default', () => {
  const errors = validateZone({ type: 'route', geometry: { kind: 'linestring', points: [{ lat: 36.7538, lon: 3.0588 }, { lat: 36.7545, lon: 3.0595 }] } });
  assert.ok(errors.some((e) => /polylineDistance|هامش/.test(e)), errors.join('\n'));
});

test('a two-point polygon is refused by us before the server refuses it (GeofencePolygon.java:146)', () => {
  const errors = validateZone({ type: 'park', geometry: { kind: 'polygon', points: [{ lat: 36.75, lon: 3.05 }, { lat: 36.76, lon: 3.06 }] } });
  assert.ok(errors.some((e) => /3/.test(e)), errors.join('\n'));
});
```

**صيانة التنسيق (لا تُترك للاتفاق اللفظي):** الفاصل في الأشكال الثلاثة هو `", "` حرفيّاً كما في مُخرِجات Traccar، وصيغة القطع العشرية تُوحَّد بستّة خانات كحدّ أقصى بلا أصفار لاحقة (`36.75` لا `36.750000`) — وإلا فشل اختبار «الذهاب والإياب بايت ببايت» عند أول منطقة يُعيدها الخادم بعد إعادة تسلسلها.

- [ ] **Step 2: شغّلها وارتقِب السبب**

```bash
npm run test:app 2>&1 | grep -E 'wkt|ERR_MODULE_NOT_FOUND|# fail|ℹ (tests|pass|fail)' | head
```

المتوقع — **بأرقام مقيسة لا متوقَّعة**: ملف اختبار يعجز عن استيراد وحدة غير موجودة يُجمَّع عند Node كـ**`ℹ tests 1 / pass 0 / fail 1`** مع `ERR_MODULE_NOT_FOUND: Cannot find module …/wkt.ts` وشفرة خروج ١ (قِس هذا بنفسك في Task 1 Step 3؛ لا تقرأ `fail 1` على أنه «اختبار واحد فقط فشل» ثم تفرح بأن البقية خضراء). **تحقّق من رسالة الخطأ نفسها قبل أن تفرح بالفشل** — درس M0 الر36: فشلٌ يشترط نتيجة ضعيفة يُرضى بكلمة «required». وإن ظهر فشلٌ بصيغة `SyntaxError` أو `ERR_UNKNOWN_FILE_EXTENSION` فالمهمة متوقفة: تلك أخطاء عدّاء لا RED، وتُصلَح قبل أي كود.

- [ ] **Step 3: نفّذ `wkt.ts`** بأربع دوال + `validateZone`؛ الأرقام من §6 حرفيّاً:

```ts
// src/services/traccar/wkt.ts — the ONE place that knows Traccar reads `lat lon` (spec 6).
// Leaflet hands [lat, lng] positionally and GeoJSON hands [lng, lat]; neither may build WKT itself.
export type LatLng = { lat: number; lon: number };
export type Geometry =
  | { kind: 'circle'; lat: number; lon: number; radiusMeters: number }
  | { kind: 'polygon'; points: LatLng[] }
  | { kind: 'linestring'; points: LatLng[]; bufferMeters?: number };
export type ZoneType = 'school' | 'home' | 'park' | 'route' | 'mosque' | 'activity' | 'relative' | 'outing';

const MIN_EDGE: Record<string, number> = { school: 50, home: 50, route: 100 };
const DEFAULT_EDGE = 50;

// fmt keeps the round-trip byte-identical: 36.75 must not come back as 36.750000.
const fmt = (n: number) => Number(n.toFixed(6)).toString();
const pair = ({ lat, lon }: LatLng) => `${fmt(lat)} ${fmt(lon)}`;
const SEPARATOR = ', '; // exactly what GeofenceCircle/Polygon/Polyline toWkt() emit

export function toCircleWkt({ lat, lon, radiusMeters }: { lat: number; lon: number; radiusMeters: number }) {
  return `CIRCLE (${fmt(lat)} ${fmt(lon)}, ${fmt(radiusMeters)})`;
}
export function toPolygonWkt(points: LatLng[]) {
  const ring = [...points];
  if (pair(ring[0]) !== pair(ring[ring.length - 1])) ring.push(ring[0]);
  return `POLYGON((${ring.map(pair).join(SEPARATOR)}))`;
}
export function toRouteWkt({ points, bufferMeters }: { points: LatLng[]; bufferMeters?: number }) {
  return {
    area: `LINESTRING (${points.map(pair).join(SEPARATOR)})`,
    // Geofence.java:86 — the buffer is an attribute in METRES, defaulting to 25.0 if we omit it.
    attributes: { polylineDistance: bufferMeters ?? 0 },
  };
}
export function toWktOf(geometry: Geometry): string {
  if (geometry.kind === 'circle') return toCircleWkt(geometry);
  if (geometry.kind === 'polygon') return toPolygonWkt(geometry.points);
  return toRouteWkt(geometry).area;
}

const NUM = '(-?\\d+(?:\\.\\d+)?)';
export function parseWkt(area: string): Geometry {
  const text = area.trim().replace(/\s+/g, ' ');
  const circle = new RegExp(`^CIRCLE \\(${NUM} ${NUM}, ${NUM}\\)$`).exec(text);
  if (circle) {
    return { kind: 'circle', lat: Number(circle[1]), lon: Number(circle[2]), radiusMeters: Number(circle[3]) };
  }
  // `POLYGON((…))` is what we write; `POLYGON ((…))` is what GeofencePolygon.toWkt writes.
  const polygon = /^POLYGON ?\(\((.+)\)\)$/.exec(text);
  if (polygon) return { kind: 'polygon', points: parsePoints(polygon[1]) };
  const line = /^LINESTRING ?\((.+)\)$/.exec(text);
  if (line) return { kind: 'linestring', points: parsePoints(line[1]) };
  throw new Error(`unsupported WKT area (unknown shape or broken pair): ${text.slice(0, 40)}`);
}
function parsePoints(body: string): LatLng[] {
  return body.split(',').map((chunk) => {
    const tokens = chunk.trim().split(' ');
    if (tokens.length !== 2) throw new Error(`each vertex must be "lat lon", got "${chunk.trim()}"`);
    const [lat, lon] = tokens.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`non-numeric vertex "${chunk.trim()}"`);
    return { lat, lon };
  });
}

export function validateZone({ type, geometry }: { type: ZoneType; geometry: Geometry }): string[] {
  const errors: string[] = [];
  const need = MIN_EDGE[type] ?? DEFAULT_EDGE;
  if (geometry.kind === 'circle') {
    if (geometry.radiusMeters < need) {
      errors.push(`منطقة ${type} يجب أن يكون نصف قطرها ≥ ${need} م (المواصفة §6: الدوائر الصغيرة تُنتج حواف زائفة)`);
    }
  } else if (geometry.kind === 'polygon') {
    // GeofencePolygon.java:146 rejects fewer than 3 comma-tokens server-side; we say why first.
    if (geometry.points.length < 3) errors.push('المضلّع يحتاج 3 نقاط على الأقل');
  } else {
    if (geometry.points.length < 2) errors.push('خط المسار يحتاج نقطتين على الأقل');
    if (geometry.bufferMeters === undefined || geometry.bufferMeters === 0) {
      errors.push('منطقة مسار بلا polylineDistance: الخادم سيتخذ 25 م افتراضاً (Geofence.java:86) — حدّد الهامش صراحةً');
    } else if (geometry.bufferMeters < (type === 'route' ? 100 : need)) {
      errors.push(`هامش المسار يجب أن يكون ≥ ${type === 'route' ? 100 : need} م`);
    }
  }
  return errors;
}
```

لا سطر «يُكتب لاحقاً» أعلاه: كل دالة مكتملة، و`parseWkt` مقصود به أن يقرأ ما يكتبه **الخادم** أيضاً لا ملفنا وحده — لأن `GET /api/geofences` يعيد `area` كما خزّنه هو، ولا يجوز أن يفشل المحرّر عند أول منطقة أنشأها المعمل.

- [ ] **Step 4: GREEN، ثم قياس مضاد للحشو:** أعد تشغيل اختبار الدائرة الصغيرة بعد تغيير الرقم إلى 55م وتأكد أنه **يمرّ**، ثم رجّعه. دوّن السطرين في التقرير (الأرضية بلا قياس مضاد = اختبار لا يحمي شيئاً).

- [ ] **Step 5: التزمام (ملزمة §6):**

```bash
grep -rn "CIRCLE (\|LINESTRING (\|POLYGON((" src/ | grep -v "services/traccar/wkt.ts" || echo "OK: only wkt.ts writes WKT"
```

المتوقع: سطر `OK: only wkt.ts writes WKT`. إن وُجدت كتابة WKT في مكوّن فذلك عيب يُصلَح في نفس الالتزام.

- [ ] **Step 6: ارفع الأرضية ثم ادفع** — بعد هذا commit يكون `ℹ tests 17` مقيساً (7 + 10 هندسة)، فتُرفع `EXPECTED_MIN_TESTS` في وظيفة `app` إلى `17`:

```bash
npm run test:app 2>&1 | grep -E '^ℹ (tests|pass|fail)'   # الرقم المقيس هو المرجع، لا 17 المكتوبة
git add src/services/traccar/wkt.ts tests/app/wkt.test.ts .github/workflows/m1-ci.yml
git commit -m "feat(m1): single tested WKT serializer for the lat-lon trap + spec 6 geometry edges (app floor 17)"
git push
```

---

## Task 5: الموضع وطزاجته — عرض صادق لا «حيّ»

**Files:**
- Create: `src/services/traccar/positions.ts`, `src/translations/catalog.ts`
- Modify: `src/translations/index.ts` (تصدير القاموس المفحوص بدل الكائن المسطّح حيث يلزم)
- Test: `tests/app/positions.test.ts`

**Interfaces:**
- Consumes: `ServerPosition` من Task 3؛ و`GpsFreshnessService` المُبقّى (§1 بند 6).
- Produces:
  - `kmPerHour(position): number` — تحويل العقد إلى km/h **بحساب واحد مركزي** (القياس M0: `speed` بالعقد)
  - `ageSeconds(position, now): number` من **`fixTime`** لا من `serverTime` (الر30: النقل لا العمر)
  - `freshnessOf(ageSeconds): 'fresh' | 'aging' | 'silent'` بحدود §12: متقادم >180ث، صامت >300ث
  - `formatPositionLabel(position, now, lang): string` ⇒ «منذ 55 ثانية ±25 م» بالعربية/الفرنسية/الإنجليزية، و**صفر** ظهور لكلمة «حيّ/مضمون» منفردة
  - `resolveSourceReadings(positions): { chosen: ServerPosition | null; conflict: boolean }` — قاعدة §3: الأحدث عمراً يفوز، وتعارض مصدرين حيّين >300م ⇒ `conflict: true` بلا اختيار صامت
  - `src/translations/catalog.ts` ⇒ `catalog: Record<string, { ar: string; fr: string; en: string }>` — مفاتيح التسميات التي تستعملها `formatPositionLabel` ثلاثيّاً. كل مهمة لاحقة (6–11) تضيف مفاتيحها **هنا** لا داخل المكوّن، وحارس التكافؤ في Step 1 يُفشل أيّ مفتاح ناقص في أي لغة.

- [ ] **Step 1: RED** — اختبارات تحمل الأرقام الحرفية:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { kmPerHour, ageSeconds, freshnessOf, formatPositionLabel, resolveSourceReadings } from '../../src/services/traccar/positions.ts';
import type { ServerPosition } from '../../src/services/traccar/types.ts';

const now = Date.parse('2026-10-08T12:00:00Z');
const pos = (over: Partial<ServerPosition>): ServerPosition => ({
  id: 1, deviceId: 7, fixTime: '2026-10-08T12:00:00Z', serverTime: '2026-10-08T12:00:01Z',
  latitude: 36.7538, longitude: 3.0588, speed: 0, course: 0, accuracy: 25, attributes: {}, ...over,
});

test('speed comes from the server in knots and is shown in km/h', () => {
  assert.equal(Math.round(kmPerHour(pos({ speed: 10 }))), 19, '10 kn = 18.52 km/h');
});

test('age is read off fixTime, not serverTime (ruling R30)', () => {
  const late = pos({ fixTime: '2026-10-08T11:59:00Z', serverTime: '2026-10-08T12:00:30Z' });
  assert.equal(ageSeconds(late, now), 60, 'the reading is 60 s old no matter when the server stored it');
});

test('freshness thresholds are the spec 12 numbers', () => {
  assert.equal(freshnessOf(ageSeconds(pos({ fixTime: '2026-10-08T11:59:50Z' }), now)), 'fresh');
  assert.equal(freshnessOf(ageSeconds(pos({ fixTime: '2026-10-08T11:56:40Z' }), now)), 'aging');   // 200 s > 180
  assert.equal(freshnessOf(ageSeconds(pos({ fixTime: '2026-10-08T11:54:00Z' }), now)), 'silent');  // 360 s > 300
});

test('the label carries age and accuracy, and never says live alone', () => {
  const ar = formatPositionLabel(pos({ accuracy: 25, fixTime: '2026-10-08T11:59:05Z' }), now, 'ar');
  assert.match(ar, /منذ\s*55/); assert.match(ar, /±\s*25\s*م/);
  assert.doesNotMatch(ar, /حيّ|مضمون|live|guaranteed/i, ar);
});

test('a silent source is announced as no-data, not as safety', () => {
  const label = formatPositionLabel(pos({ fixTime: '2026-10-08T11:40:00Z' }), now, 'ar');
  assert.match(label, /لا بيانات|قد لا يكون/);
  assert.doesNotMatch(label, /بأمان|safe/i, label);
});

test('two live sources over 300 m apart are a conflict, not a silent pick', () => {
  const near = pos({ id: 1, attributes: { source: 'phone' } });
  const far = pos({ id: 2, attributes: { source: 'tracker' }, latitude: 36.7638 });
  const { conflict, chosen } = resolveSourceReadings([near, far]);
  assert.equal(conflict, true); assert.equal(chosen, null, 'conflict must not quietly render one of them');
});

test('two live sources within 300 m resolve to the freshest reading', () => {
  const older = pos({ id: 1, fixTime: '2026-10-08T11:59:40Z', attributes: { source: 'phone' } });
  const fresher = pos({ id: 2, fixTime: '2026-10-08T11:59:55Z', latitude: 36.7539, attributes: { source: 'tracker' } });
  const { conflict, chosen } = resolveSourceReadings([older, fresher]);
  assert.equal(conflict, false); assert.equal(chosen?.id, 2);
});

test('a future fixTime is rejected as impossible, same rule as the lab (M0 R19 lineage)', () => {
  assert.throws(() => ageSeconds(pos({ fixTime: '2026-10-08T12:05:00Z' }), now), /future|clock/i);
});

test('every copy key used by the labels exists in ar, fr and en', async () => {
  const { catalog } = await import('../../src/translations/catalog.ts');
  for (const [key, entry] of Object.entries(catalog)) {
    for (const lang of ['ar', 'fr', 'en'] as const) {
      assert.ok(typeof entry[lang] === 'string' && entry[lang].length > 0, `${key}.${lang} is missing`);
    }
  }
});
```

- [ ] **Step 2: فشل مسمّى** (`Cannot find module …/positions.ts`).
- [ ] **Step 3: تنفيذ** — `positions.ts` (تحويل العقد `* 1.852`؛ `haversine` يُعاد استخدامه من `GpsFreshnessService`/يُنقل كدالة مشتركة واحدة **لا نسختان** — درس M0 في الإسقاط الصامت) و`catalog.ts` بمفاتيح التسميات التي يقرأها `formatPositionLabel` («منذ N ثانية»، «±N م»، «لا بيانات من الخادم»، «قد لا يكون الموقع الحالي»)، والقيم تُنسخ من `src/translations/index.ts` الموجود حيث تكون موجودة حرفيّاً، وإلا تُضاف بثلاث لغات معاً.
- [ ] **Step 4: GREEN + بحث عن النص المخالف:**

```bash
grep -rniE "حيّ مضمون|موقع مضمون|live guaranteed|يمنع الاختطاف" src/ || echo "OK: no over-claim copy"
```

- [ ] **Step 5: ارفع الأرضية ثم ادفع** — بعد هذا commit يكون `ℹ tests 26` مقيساً (17 + 8 طزاجة و+1 حارس القاموس)، فتُرفع `EXPECTED_MIN_TESTS` في وظيفة `app` إلى `26` في نفس الالتزام (الرقم المقيس من الطرفية هو المرجع لا 26 المكتوبة):

```bash
npm run test:app 2>&1 | grep -E '^ℹ (tests|pass|fail)'
git add src/services/traccar/positions.ts src/translations/catalog.ts tests/app/positions.test.ts .github/workflows/m1-ci.yml
git commit -m "feat(m1): honest position freshness — knots→km/h, fixTime age, silent=لا بيانات (app floor 26)"
git push
```

---

## Task 6: الجلسة — دخول، هوية، خروج

**Files:**
- Create: `src/services/traccar/session.ts`, `src/state/session.ts`, `src/components/LoginScreen.tsx`
- Modify: `src/services/traccar/client.ts` (تضيف `postFormText` وتُزيل مقتطف الجسم من رسالة `badpayload` — R-M1-15)، و`tests/app/client.test.ts` (اختبارا الترميز وعدم التسريب)
- Test: `tests/app/session.test.ts`

**Interfaces:**
- Consumes: `createTraccarClient({ baseUrl, credentials })` و`Credentials` (Task 3) — `signIn` تبني `Credentials` من الحقلين ولا تخزّنها؛ و`007-app-api-surface.md` لسطر `POST /api/session` (نموذج مقابل JSON — **يُقرَّر من الفحص، لا من الذاكرة**؛ المرجع المثبَت في الخطة: `SessionResource.java:119-141` بوسائط `email`/`password`/`code`).
- **قرار مُلزم من قياس 007 (R-M1-8) — لا تُجرِّبه ولا تُعيد فرضه:** `GET /api/session` **بترخيص Basic فقط يعيد 404 مقاساً لا 401**، وهذا سلوك مصمَّم لا عطل معمل: `SessionResource.java:78-105` يقبل `?token=` أو جلسة HTTP، ولا يجعل ترويسة `authorization` وحدها جلسة، وإلا يرمي `NOT_FOUND`. لذلك **لا** تُبنَى `whoAmI()` على `GET /session` برأس Basic. المصدران المشروعان للهوية، وكلاهما مقيس في 007 §9: (١) كائن `User` العائد من **`POST /api/session`** (نموذج) عند الدخول، و(٢) **`GET /api/session?token=<رمز مُولَّد>`** ⇒ 200 + حقول `User` للتحقق دون جلسة كوكيز. أي ثالث (كود «إن رجعت 404 فاعتمد حالة محلية») ممنوع: لا مصدرَين للواقع.
- Produces: `signIn({ baseUrl, email, password }) ⇒ ServerUser`؛ `signOut()`؛ `whoAmI() ⇒ ServerUser` **عبر المسارين المقيسَين أعلاه حصراً**؛ **`mintSocketToken(expiresAt?) ⇒ string`** عبر `POST /api/session/token` (وسيط `expiration`، `SessionResource.java:150-162`) **بـ`postFormText` لا `postForm`** — مقيس 008: الطرف يعيد سلسلة خام وترويسته `application/json`، فأي تحليل JSON يُرجع `badpayload` على نجاح 200 — مع منع طباعة القيمة (`toString`/log لا يُخرجان النص)، و`revokeSocketToken(token)` عبر `POST /api/session/token/revoke` (204 وجسم فارغ، مقيس)؛ وخطّاف `useSession()` بحالة `idle | signing-in | signed-in | failed(kind)`. Task 10 يستهلك `mintSocketToken` ولا يخترع مساراً ثانياً للرمز.

- [ ] **Step 1: RED** على خادم وهمي: (أ) نجاح الدخول يُنتج User ويخفي كلمة المرور من أي مخرج؛ (ب) 401 ⇒ حالة `failed('unauthorized')` ونص عربي واحد من القاموس لا من جسم الخادم؛ (ج) لا تخزين لكلمة المرور في `sessionStorage`/`localStorage` (اختبار يقرأ المخزن وي assert أنه خالٍ من كلمة المرور ومن الحقل `password`)؛ (د) قطع الشبكة ⇒ حالة `failed('network')` مع نص «لا بيانات من الخادم» لا «الطفل بأمان»؛ (هـ) `signOut` يُنادي `DELETE /api/session` مرة واحدة؛ (و) `mintSocketToken` يعيد نصاً غير فارغ، و**أي** رسالة خطأ أو كائن يُطبع في حالة الفشل لا يحتوي الرمز (assert على أن نص الخطأ لا يضم القيم السبعة الأولى من الرمز) — الرمز لا يخرج إلى اللوغ؛ (ز) **حراسة R-M1-8**: اختبار يطالب أن `whoAmI()` لا تُرسل `GET /session` برأس Basic وحدها (تُرسل `?token=` أو تعتمد ناتج `POST /session`)، وي assert أن مسار 404 المقيس لا يمرّ أبداً بدالة «افتراض الوليّ محليّاً»؛ (ح) **مسار الرمز عبر طبقة النموذج حصراً** (مهمة 3، وبـ`postFormText` بعد قياس 008 — R-M1-15) — لا `fetch` خام موازٍ في `session.ts`، وإلا ضاعت ضمانات المهلة والأخطاء الخالية من الأسرار؛ والاختبار يطالب بـ`content-type: application/x-www-form-urlencoded` وبجسم `expiration=…` حرفيّاً، ويثبّت أن المسافة تخرج `+` (مقيس أنها مقبولة على الخادم الحيّ، لا أن يُعاد افتراضها)؛ و(ط) **الرمز لا يخرج من رسالة خطأ**: استجابة وهمية غير JSON جسماً على شكل سرّ ⇒ لا تظهر مقدّمتها في `message` (يُخَرَّب `client.ts:86` بحذف المقتطف فيُحمّر هذا الاختبار مسمّىً، R-M1-12).
- [ ] **Step 2: فشل مسمّى.**
- [ ] **Step 3: تنفيذ** — `LoginScreen` بحقلين وزر؛ **لا** «تذكاني» بكتابة كلمة المرور؛ الرسالة السفلية تعرض `server.version` من `/api/server` إن تحقّق، وإلا «الخادم غير معروف».
- [ ] **Step 4: GREEN + تحقّق يدوي على المتصفح** ببيانات المعمل (يُدخَلها المالك/المشغّل، لا أكتبها أنا في أي مكان): لقطة بعد الدخول تُحفَظ في `lab/artifacts/` بلا رفع، وبصمتها في التقرير. **أما قياس R-M1-11 فقد أداه المتحكِّم وأُغلِق** في `lab/report/evidence/008-form-encoding-and-token-route.md` (2026-10-10، خادم حيّ): المسافة داخل قيمة `@FormParam` تخرج `+` والخادم يقبلها (200) والرمز يُتحقّق عبر `GET /api/session?token=` (200)، فلا جولة ترميز مطلوبة ولا استبدال داخل `postForm`؛ والباقي هنا هو التحقّق اليدوي بالمتصفح وحده. إن ظهر سلوك حيّ غير ما في 008 فالسبب يُسجَّل في التقرير لا يُخمَّن، وتُفتح جولة تصحيح على الترميز مع اختبار يُثبّت الترميز العائد.
- [ ] **Step 5: ادفع** (`feat(m1): session sign-in against the measured API, no credential storage`).

---

## Task 7: الخريطة من الخادم — أيقونة §12 بمواصفتها

**Files:**
- Modify: `src/components/MapView.tsx` (الموجود: init L93-97، marker L181-197، circle L240-251، zones L268-325، fitBounds L429-435)، `src/App.tsx` (فرع الدور L714)
- Create: `src/components/map/childIcon.ts`
- Test: `tests/app/childIcon.test.ts`

**Interfaces:**
- Consumes: `positions.ts` (Task 5) و`wkt.ts` (Task 4) وقراءة `/api/geofences`.
- Produces: `childIconHtml({ course, freshness, hasFix }): { html: string; shape: 'arrow' | 'dot'; tone: string }` و`scaleForZoom`: دائرة الدقة **بقياسها الحقيقي** لا بحجم بكسلي ثابت.

- [ ] **Step 1: RED**: (أ) عند غياب `course` ⇒ نقطة لا سهم؛ (ب) مع `course: 90` ⇒ دوران 90 درجة مكتوب في الـHTML؛ (ج) `freshness: 'silent'` ⇒ رمادي + علامة استفهام (اسم الحقل `freshness` حرفيّاً كما أنتجه Task 5 — لا `fresh`)؛ (د) `freshness: 'aging'` ⇒ كهرماني؛ (هـ) اللون وحده لا يكفي (§12 عمى الألوان) ⇒ الاختبار assert أن هناك فرق **شكل** بين الطازج والصامت (سهم/نقطة/استفهام) لا لون فقط؛ (و) لا صورة وجه طفل؛ (ز) تباين: النصوص داخل الـHTML لا تحمل أبيض على فاتح (اختبار يحرس قائمة الرموز المستخدمة من القاموس).
- [ ] **Step 2: فشل مسمّى.**
- [ ] **Step 3: تنفيذ** + استبدال مصدر البيانات في `MapView` من الحالة المحلية القديمة إلى **props فقط**: `App.tsx` يمرّر مانتجه Task 5 (`resolveSourceReadings` + `formatPositionLabel` + `freshnessOf`) و`wkt.ts`. **لا** `useChildren()` هنا: الخطّاف يولده Task 9، والخطة لا تحمل خطوة «إن لم يُبنَّ بعد فافعل كذا…وإلا كذا». قرار مُلزم: Task 7 يعرض props ويُختبر عليها، وTask 9 يستبدل مصدر الـprops في `App.tsx` وحده. لا مصدرَين للواقع في نفس الشاشة (درس §1.5).
- [ ] **Step 4: GREEN + تحقّق بصري**: `npm run lint && npm run build`، ثم متصفح على `http://127.0.0.1:3000` مع خادم المعمل قائم، ولقطة قبل/بعد (زوم 14 و17 لتُرى دائرة الدقة مختلفة القياس) في `lab/artifacts/` + MD5.
- [ ] **Step 5: ادفع** (`feat(m1): map child icon per spec 12 — heading, true-scale accuracy ring, freshness tones`).

---

## Task 8: المناطق — رسم على الخريطة وحفظ على الخادم (AC-2)

**Files:**
- Create: `src/services/traccar/zones.ts`, `src/services/traccar/permissions.ts`, `src/components/ZonesScreen.tsx`
- Modify: `src/components/SafeZoneForm.tsx` (الحالي يكتب `localStorage` عبر `App.saveSafeZones` L64-70/L469-479)، `src/App.tsx`
- Test: `tests/app/zones.test.ts`, `tests/app/permissions.test.ts`

**Interfaces:**
- Consumes: **عقد** الأجسام الذي قاسه M0 في `lab/scripts/api.mjs` (`buildCircleGeofencePayload`، `buildRouteGeofencePayload`، `buildPermissionPayload`) — **يُنقل العقد إلى `src/` ولا يُستورد من `lab/`**: لا `import … from '../../lab/…'` في أي ملف تحت `src/` (قاعدة M0: لا شيء من المعمل يدخل حزمة الإنتاج؛ و`lab/` ليس في `tsconfig` ولا في شجرة Vite). الأشكال تُعاد كتابتها في `zones.ts`/`permissions.ts` وتُثبَت باختبارات تقارن السلسلة النصية مع عيّنة M0 الحرفية، و`wkt.ts` من Task 4.
- Produces: `listZones(): Promise<ServerGeofence[]>`, `createZone(zone)`, `updateZone(zone)`, `deleteZone(id)` (تنادي `client.remove('/geofences', { id })` — الاسم `remove` من Task 3، لا `.delete()`)، `linkZoneToDevice(geofenceId, deviceId)`, `linkUserToDevice(userId, deviceId)`, `zoneOwners()`؛ بوابتها admin تُقرأ من `whoAmI()` (Task 6) لا من حالة محلية؛ وكل كتابة **تعيد القراءة من الخادم** بعد النجاح عبر `listZones()` (لا حالة محلية احتياطية تُعرض كحقيقة). و**`ensureAlertSubscription(geofenceId, userIds)`** — لأن القياس أثبت (R-M1-10، 007 §5.1) أن منطقة بلا اشتراك `geofenceExit` يحمل `web` في `notificators` **لا يولد أي حدث وصولاً إلى التطبيق**: تقرأ `GET /api/notifications`، وتوحد `web` على القيم الموجودة **ولا تستبدلها** (`PUT /api/notifications/{id}` بجسم الاشتراك نفسه + `web`؛ المجموعة بلا id أعادت 405 مقيساً ⇒ المحدد بـ`{id}` هو المسار)، ثم **تعيد القراءة** للتأكيد. تُنادى بعد `createZone` مباشرة، وفشلها يُعلَن في الواجهة ولا يُبتلع (منطقة محفوظة بلا تنبيهات = كذبة §4).

- [ ] **Step 1: RED (وحدات، خادم وهمي)**: (أ) منطقة مدرسة بنصف قطر 30م تُرفض قبل أي طلب (رسالة `validateZone`، وassert عدد الطلبات = 0 بمتغيّر عدّاد في الوهمي)؛ (ب) رسم دائرة ⇒ `POST /api/geofences` بجسم `{ name, area: 'CIRCLE (36.7538 3.0588, 120)' }` حرفيّاً؛ (ج) منطقة مسار ⇒ `LINESTRING` + `attributes.polylineDistance`؛ (د) بعد حفظ ناجح تُنادى `GET /api/geofences` (لا يُعرض الكائن المحلي)؛ (هـ) **الروابط الثلاث من §3** تُرسَل بالترتيب الصحيح: `buildPermissionPayload('userId', …, 'deviceId', …)` ثم `'geofenceId'→'deviceId'` — واختبار يطالب أن اتجاه خريطة الإذن معكوس-حساس (تسمية المفاتيح في العيّنة، لأن `Permission.java:54-66` قرّر الاتجاه بالترتيب)؛ (و) محاولة حذف منطقة بينما لا تزال موصولة بجهاز تعرض تحذيراً مفهوماً ولا تترك الواجهة بحالة نصف-حفظ؛ (ز) **AC-2**: اختبار وحدة ي assert أن مسار الحفظ لا يسمّي `localStorage` (فحص باستعمال spy على `globalThis.localStorage` يُعطي صفر استدعاء أثناء `createZone`)؛ (ح) **`ensureAlertSubscription`**: اشتراك قيمته `mail` ⇒ يُرسل `PUT` بـ`mail,web` (**توحيد لا استبدال** — اختبار يطالب أن قيمة سابقة غير `mail` تبقى موجودة)، واشتراك مفقود تماماً ⇒ رسالة «لا اشتراك تنبيه لهذه المنطقة» **لا** «موجود مسبقاً»، و`PUT` فاشل ⇒ الحالة تُعلَن ولا تُبتلع.
- [ ] **Step 2: فشل مسمّى.**
- [ ] **Step 3: تنفيذ** `zones.ts` + `permissions.ts` + شاشة المناطق: زر «دائرة» بالسحب، «مضلّع» بالنقر، «مسار» بالنقاط المتتالية، قائمة أنواع §6 السبعة (مدرسة/بيت/حديقة/نزهة/مسجد/نشاط/بيت قريب) مع الأوقات الفعّالة كسمة، وزر «من يعدّل» معطّل لغير admin.
- [ ] **Step 4: GREEN** + `npm run lint && npm run build`، ثم حارس الحدود (لا معمل في حزمة الإنتاج):

```bash
grep -rn "\.\./lab\|@/lab\|from 'lab/" src/ && echo "FAIL: src/ imports lab/" || echo "OK: src/ imports nothing from lab/"
```
- [ ] **Step 5: قياس AC-2 على الحيّ** (خادم المعمل قائم). من المتصفح (ببيانات يُدخلها المشغّل، لا من ملف ولا من الطرفية): ارسم مدرسة جديدة باسم `lab-zone-m1-1` بنصف قطر **90 م** واحفظها. ثم، **قبل أي تشغيل جديد للأداة**، أصلح فيها ثلاث ملاحظات من مراجعة 007 (كلها في `tools/m1/api-probe.mjs`، وبلا أي تغيير في شكل الأثر): (١) فرع `else` يطبع «already present, no change» حتى حين لا يوجد الاشتراك أصلاً — افصل الحالات واطبع `NOT FOUND` مستقلاً؛ (٢) `PUT` يكتب `mail,web` حرفياً فيستبدل أي قيمة سابقة — اجعله **اتحاداً** على القيمة الموجودة؛ (٣) لا تنظيف للرمز عند استثناء غير متوقع (`new WebSocket` يرمي فيبقى رمز ساعة حيّاً) — لفّ الالتقاط في `finally` ينادي `token/revoke`. ثم أَعِد تشغيل أداة الفحص من Task 2 — فهي مطبوعة سطر `geofence <id> "<name>" area=<area>` لكل منطقة، فتكون هي الدليل بدون أي سرّ في سطر الأوامر:

**R-M1-13 — قياسان تركهما مراجعة Task 4 بلا تأكيد (هنا يُقاسان، ولا يُورَّثان لافتراضين):** (١) هل يقبل محلّل Traccar كتابةَنا بلا مسافة `POLYGON((…`؟ الأثر المطبوع من الأداة يعيد `area=` كما خزّنه الخادم، فتكون النتيجة مقيسة: إن رجع المحلّل النصَّ بصيغة الخادم `POLYGON ((…` فقد قبله؛ وإن لم تُخزَّن المنطقة أصلاً (أو رجع `400`) فالكتابة يجب أن تضع المسافة، ويُصحَّح `toPolygonWkt` مع اختبار يُثبّت الصيغة العائدة. (٢) ماذا يفعل الخادم بـ`polylineDistance: 0` الصريح — يراه 0 متراً (نفق لا يدخله أحد أبداً) أم يسقطه ويأخذ 25؟ يُقاس بإنشاء مسار بـ0 ثم قراءة المنطقة مرّة أخرى بطريق الأداة وتسجيل **القيمة العائدة** رقميّاً، وبلا أي تشغيل سيناريو (لا حاجة له). كلا القياسين يُكتب أثرُهما في 008 بحروفه، وإن تعذّر أحدهما فالحكم **NOT RUN** لا نتيجة، ولا يصحّ أن تُقرأ ورقة المواصفة دليلاً على سلوك المفسّر. **وتُضاف الصيغتان إلى «حقائق مُثبَتة من المصدر/مقيسة»** في رأس الخطة إن تحقّقتا، وإلا بقيتا ثغرة مسمّاة في تقرير AC-2.

```bash
set -a; source lab/traccar/fanout.env; set +a   # نفس نافذة الفحص من Task 2، مسار بلا محتوى
node tools/m1/api-probe.mjs > /tmp/ac2.txt 2>&1; echo "AC2_EXIT=$?"
grep -n 'lab-zone-m1-1' /tmp/ac2.txt
```

المتوقع: سطر مطابق لـ`geofence <id> "lab-zone-m1-1" area=CIRCLE (36.7538 3.0588, 90)` **حرفيّاً** (`lat lon`، والـ90 كما رُسمت لا كما خُمّنت) — وهذا يُثبت أن الخادم قبل ما كتبته دالتنا، لا أننا نخمّن أنه يقبله. و`localStorage` للتطبيق **خالٍ من أي سجلّ مناطق** (يُقاس من طرفية المتصفح بعد الحفظ: `Object.keys(localStorage)`، ويُُلصق مخرجه حرفيّاً في الأثر مع قائمة المفاتيح الباقية وحيثيتها الإعدادية لا السجلّية).

**لا تُستعمل `curl -u "$LAB_ADMIN_EMAIL:$LAB_ADMIN_PASSWORD"` هنا** — كلمة المرور في وسائط العملية ترى ضوء الشمس في سجلّ الطرفية و`netstat`؛ أداة الفحص تقرأ env ولا تطبع السر، وهي المرجع الوحيد في هذه الخطة.

إن تعذّر تشغيل الخادم فهذا **NOT RUN** ولا تُكتب AC-2 مُحقَّقة.
- [ ] **Step 6: الأثر والدفعة** → `lab/report/evidence/008-m1-ac2-zone-on-server.md` + `feat(m1): zones drawn on the map and saved to the server (AC-2)`.

---

## Task 9: أطفال متعددون وأولياء متعددون

**Files:**
- Create: `src/state/children.ts`, `src/components/ContactsScreen.tsx`, `src/components/ChildScreen.tsx`
- Modify: `src/App.tsx` (تبديل التبعية عن `localStorage` في L38-62/148)، `src/components/Navbar.tsx` (فرع الدور L74-94)
- Test: `tests/app/children.test.ts`

**Interfaces:**
- Consumes: `/api/devices`، `/api/users`، `/api/permissions`، `positions.ts:resolveSourceReadings` (Task 5)، و`ServerDevice`/`ServerUser` من `types.ts` (Task 3) بأسمائها حرفيّاً، وهوية `whoAmI()` (Task 6) للتمييز بين admin وviewer.
- Produces: `useChildren(): { loading, error, children: Child[] }` حيث `Child = { device: ServerDevice, readings: ServerPosition | null, label: string, freshness: 'fresh' | 'aging' | 'silent' | null }` — القيم الثلاث حرفيّاً من `freshnessOf` (Task 5) ولا رابعة من عندي: `null` تعني «لا قراءة إطلاقاً» وتطابق `hasFix: false` في Task 7؛ و`assignGuardian(deviceId, userId)`/`unassignGuardian(...)` (admin فقط، عبر `client.remove` لا `.delete`). هذه هي التغذية التي تستبدل props شاشة الخريطة في `App.tsx` (قرار Task 7: الشاشة props فقط، والمصدر يُوصَل هنا).

- [ ] **Step 1: RED**: (أ) طفلان = جهازان ⇒ طفلان في القائمة، وكل واحد بمصدره التسمية («من المتتبع، منذ 40ث»)؛ (ب) جهاز غير مشترك لوليّ viewer **لا يظهر إطلاقاً** (اختبار: `/api/devices` يعيد ما يراه المستخدم فقط — والمحاكاة الوهمية تعيد قائمتين)؛ (ج) دور admin وحده يستطيع `assignGuardian`؛ (د) «بلا ولي ثانٍ» — حالة الولي الواحد تُعرض كما في §5 بند 12 (لا تصويت، تصعيد زمني) ولا تُعطّل الشاشة؛ (هـ) تسمية الجهاز المعروضة تأتي من الخادم لا من إعداد محلي؛ (و) **لا اسم طفل حقيقي في أي عيّنة اختبار** (اختبار حرّاس: كل عينات الأسماء تبدأ بـ`lab-`).
- [ ] **Step 2: فشل مسمّى.**
- [ ] **Step 3: تنفيذ** الشاشتين + شريط تنقّل بلا فرع `role === 'PARENT'`.
- [ ] **Step 4: قياس على الحيّ**: دخول بـ`lab-guardian-2` (وليّ ثانٍ) ⇒ يرى الطفل نفسه؛ ثم ألغِ المشاركة من admin ⇒ يختفي؛ ثم أعِدها ⇒ يظهر. الأثر: أربع لقطات `lab/artifacts/` + MD5 + مخرجات `GET /api/permissions`.
- [ ] **Step 5: ادفع** (`feat(m1): multi-child, multi-guardian from the server; viewer sees only what is shared`).

---

## Task 10: التنبيهات والسجل من أحداث الخادم + المقبس

**Files:**
- Create: `src/services/traccar/events.ts`, `src/services/traccar/socket.ts`, `src/components/AlertsLog.tsx`
- Test: `tests/app/events.test.ts`, `tests/app/socket.test.ts`

**Interfaces:**
- Consumes: فحص صلاحية الجهاز على كل حدث (`EventResource.java:40-46` — المسار الموجود هو `GET /api/events/{id}` فقط) و`/api/socket` (`AsyncSocketServlet.java:58-74`: `token` أو جلسة) وtiers §5، و`ServerEvent` من `types.ts` (Task 3) **بالأسماء الحرفية التي قاسها 007 §9: `attributes,deviceId,eventTime,geofenceId,id,maintenanceId,positionId,type`**، و`ServerPosition` (Task 5) لتحديث الخريطة عبر المقبس.
- **قرار مُلزم من قياس 007 (R-M1-9) — الخطة كانت خطأً هنا وتصُحَّح قبل الاستعمال:** **لا تاريخ أحداث عبر REST في Traccar 6.16.0.** `EventResource.java` كل ما فيه `@GET` هو `@Path("{id}")`، و`/api/notifications` — وهو وحده المقيس 200 — إرث `ExtendedObjectResource.java:46-52` الذي **لا يقبل `from`/`to`** ويعيد **سجلات اشتراكات** (`always,attributes,calendarId,commandId,description,id,notificators,type`) لا سجل تنبيهات. ⇒ **لا** `fetchEvents({ from, to })` في هذه المهمة (كانت مذكورة قبل القياس، وحُذفت به). مصدر الحدث الحيّ وحده المقبض بمغلّف `{"events":[…]}` (`AsyncSocket.java:45-46,119-121`)، والسجلّ التراكمي durable ملك المرحل في M2 (§2 جدول وحدة 3) لا التطبيق.
- **شرط وصول مسبق، مقيس (R-M1-10):** حدث `geofenceExit` **لا يصل إلى المقبض إطلاقاً** إن لم يكن في اشتراك التنبيه notificator اسمه `web` — `NotificatorWeb.java:43-58` هو وحده الذي ينادي `connectionManager.updateEvent(...)`. القياس: اشتراك المعمل كان `mail` وحده ⇒ صفر إطار حدث؛ بعد `mail,web` ⇒ الإطار وصل. تُضمن هذه الحالة في Task 8 (`ensureAlertSubscription`)، ومهمتها هنا أن الفشل في رؤيتها **يعني «لا أحداث» لا «لا تنبيهات»**: إن لم يأتِ أي إطار خلال نافذة الاختبار، الحكم NOT RUN مع فحص `GET /api/notifications` (بلا سرّ في الطرفية، `source lab/traccar/fanout.env`).
- Produces: `connectLive({ onEvent, onPositions, onDisconnect })` — الرمز من `mintSocketToken()` (Task 6) حصراً ويوضع في `wss://…/api/socket?token=…` ولا يُطبع، مع تراجع استطلاع `/api/positions` كل 15ث (§4)؛ و`eventLog` **في ذاكرة الجلسة وحدها** (لا `localStorage` كسجلّ — §1 بند 5) مع حقل `sinceOpened` يُعرض في الشاشة بصريح العبارة «منذ فتح الجلسة» ولا توحي بتاريخ كامل؛ و`tierOf(event): 'P0' | 'P1' | 'P2' | 'none'`؛ و`pendingAck(events)`. ولا صمت بلا إعلان: عند سقوط المقبس تُعرض شارة حالة الاتصال، و`close()`/`revokeSocketToken()` عند مغادرة الشاشة. **`attributes.message`** (وضعه `NotificatorWeb.java:53`) **غير مقيس حتى الآن** — لا يجوز الاعتماد على نصّه؛ أي عرض له يجب أن يحتمل غيابه (assert في الاختبار).

- [ ] **Step 1: RED**: (أ) `geofenceExit` بعد استيفاء debounce (٣ قراءات خارج الحدود، §6) ⇒ P1؛ (ب) `alarm` ⇒ P0؛ (ج) `deviceOffline` منفرداً ⇒ P2 **بلا جرس وبلا اتصال وبلا ذكر شرطة** — assert أن `tierOf` لا يرجع نصاً فيه «شرطة» لـP2 (§5 بند 3)؛ (د) قراءة واحدة خارج الحدود ⇒ لا إنذار (debounce)؛ (هـ) حدث **متقادم** (`fixTime` أقدم من 15د) لا يدخل العدّاد الحيّ (سابقة R19/الجرّة)؛ (و) عند سقوط المقبس: `onDisconnect` تُستدعى والاستطلاع يبدأ، مع assert على أن آخر معرفة تُعرض بشارة «لا بيانات» لا كـ«آمن»؛ (ز) «حدث واحد لم يُؤكد — افتح التفاصيل» بدل إغراق السجل (§12)؛ (ح) **السجل جلستي لا تاريخي**: بعد «إعادة فتح» الجلسة يُعرض السجل فارغاً مع شارة `sinceOpened`، واختبار يطالب أن لا طلب `from/to` لأي مسار (حراسة R-M1-9 — لا نبني تاريخاً وهميّاً ولا نستورده من `localStorage`)؛ (ط) إطار `{"events":[…]}` بلا `attributes.message` لا يسقط الشاشة (حراسة «غير مقيس» أعلاه).
- [ ] **Step 2: فشل مسمّى.**
- [ ] **Step 3: تنفيذ** `events.ts` و`socket.ts` و`AlertsLog.tsx`؛ **لا** منطق تصعيد هنا (M2) — الشاشة تعرض حالة الحدث من الخادم فقط.
- [ ] **Step 4: GREEN + قياس AC-3 على قناة `web`** (خادم قائم، طبولوجيا bootstrap، مستخدمَان):

```bash
set -a; source lab/traccar/fanout.env; set +a   # المسار بلا محتوى — شرط R-M1-10 قبل أي قياس
node tools/m1/api-probe.mjs > /tmp/ac3-pre.txt 2>&1; echo "PRE_EXIT=$?"
grep -n 'notificators' /tmp/ac3-pre.txt          # المتوقع أن يظهر web ضمن قيم الاشتراك
npm run lab:scenario -- school-exit --speed=1
# ثم في كلتا جلستي الوليّين: سجّل الزمن الذي ظهر فيه سطر geofenceExit في الشاشَة.
```

**إن لم يكن `web` ضمن `notificators` فالسيناريو لن يولّد إطار حدث على المقبض، ونتيجة AC-3 تكون NOT RUN لا فشلاً في التطبيق** (R-M1-10؛ مقيس في 007 §5.1، ويُعاد ضمانه في Task 8).

المتوقع: سطر حدث واحد عند **وليَّين**، بوصول مستقلّين (لا انتظار فشل قناة للأخرى، §5 بند 1)، وزمن وصول كل منهما مكتوب في `009-m1-ac3-web-fanout.md`. والبريد/تيليجرام في الأثر نفسه: **NOT RUN — بانتظار أسرار المالك (R37)**. لا `Email sent / To:` كدليل تسليم (الحارس `mail.debug=true` ثابت بـ`lab/scripts/check-config.mjs`).
- [ ] **Step 5: ادفع** (`feat(m1): alerts and log read from server events, live socket with announced fallback`).

---

## Task 11: حذف طبقات §1.5 — بعد أن توجد البدائل لا قبلها

**Files:**
- Delete: `server/index.mjs`؛ وفروع نموذج الأدوار ومفاتيح المحاكاة فقط — **الحذف محصور بقائمة §1 بند 5 أعلاه**، لا بـ«خدمة لم تعد مستعملة» (قائمة الإبقاء §1 بند 6 تُبقي الستّ وختباراتها، وما ليس في القائمتين يُترك ويُدرَج كدين مسمّى)
- Modify: `package.json:8` (سكريبت `server`)، `src/types/index.ts` (إزالة `DeviceRole` L1)، `src/App.tsx` (L38-70/73-79/109/148/674-712)، `src/components/Navbar.tsx:74-94`، `src/components/SettingsModal.tsx:28,45`، `tests/core.test.ts` (عينات `localStorage` L160-168 وحالات المحاكاة)، `src/services/*` المُبدَّلة
- Test: `tests/app/noLocalRecord.test.ts`

**Interfaces:**
- Consumes: كل ما سبق.
- Produces: لا واجهة جديدة؛ **مُنظِّم**: `PrivacyDataService` يبقى (§1 بند 6) لكنه يعمل على ما هو محليّ فعلاً (الإعدادات والتصدير)، لا كسجلّ.

- [ ] **Step 1: RED بثلاثة حرّاس، لا بحذفٍ سريع**: (أ) اختبار يقرأ **مفاتيح `localStorage` المكتوبة** أثناء تشغيل التدفقات الحرجة (حفظ منطقة، تبديل طفل) ثم يُثبت أنها خالية من مفاتيح السجلّ: `kidguard_role`، `kidguard_safe_zones`، `kidguard_device_pairing`، `kidguard_protection_state`، `kidguard_offline_queue`، `kidguard_alert_history`؛ (ب) اختبار على شجرة `src/` كلها يرفض ظهور `DeviceRole` أو `'PARENT'|'CHILD'` في الأنواع (grep-based test مُسمّى، لا تعليق)؛ (ج) رفض أي مفتاح محاكاة: `isSimulatingOutside`/`testModeEnabled`/`setMockBatteryLevel`/`method:'simulated'` (§3 من ملاحظات الاستطلاع: `testModeEnabled` لا يُقرأ أصلاً — يُحذف لا يُوصَل)؛ (د) **حارس قائمة الإبقاء**: اختبار يُثبت أن الملفات الستّة من §1 بند 6 موجودة ولا تزال تُستورَد (`GeofenceMonitor`, `RiskEngine`, `GpsFreshnessService`, `OfflineQueueService`, `AlertPolicyManager`, `PrivacyDataService`) — هذا الحرّاس يمنع «تنظيفاً» يمسّ ما أمرت المواصفة بإبقائه؛ (هـ) حارس الاختبارات: `tests/core.test.ts` (مقيس: عدّاء `tsx` مكتوب باليد، سطر 282 يطبع `core unit tests passed`، لا `node:test`) يبقى أخضر بعد كل حذف، ولا يُحذف منه سطر يغطي منطقاً باقياً.

**قرار مُلزم (R-M1-4) عن الحدود:** المفاتيح التسعة المكتوبة في `src/` مقيَسة بحروفها؛ ثلاثة منها إعداد محض ويبقى لها `localStorage`: `kidguard_lang`، `kidguard_theme`، `kidguard_alert_policy` (سياسة وليٍّ محليّة، و§1 بند 6 يُبقي `AlertPolicyManager`؛ المرحل في M2 يقرر لاحقاً إن كانت تُقرأ من الخادم). المحظور هو **السجلّ** لا **الإعداد**، والحرّاس (أ) يميّز بينهما بقائمة أسماء لا بقاعدة عامة.
- [ ] **Step 2: فشل الحرّاس بالسبب الصحيح** (يجب أن يروا الموجود اليوم، وإلا كان الحرّاس وهماً — قِس وادرج في التقرير سطراً لكل حرّاس: أي مفتاح/أي ملف رأى، وكم عدد المطابقات في `src/`).
- [ ] **Step 3: حذف/استبدال** بالتدريج، وكل حذف بمفرده في الالتزام حتى يبقى `git diff` مقروءاً؛ واستبدال `tests/core.test.ts` للحذف ببدائل تغطي السلوك الجديد (**الإبقاء على الاختبارات التي تغطي منطقاً حقيقياً، وحذف ما يغطي شطباً**). §1 بند 6 يُلزم بإبقاء `GeofenceMonitor` و`RiskEngine` و`GpsFreshnessService` و`OfflineQueueService` و`AlertPolicyManager` و`PrivacyDataService` **واختباراتها**: القرار لكل وحدة ليس «تبقى أم تُشطب» (هي باقية بحكم المواصفة) بل **من أين تأتي ببياناتها** — من `localStorage` إلى الخادم، مع بقاء منطقها المحلي السريع كما في §7. وما ليس في قائمة الإبقاء ولا في قائمة §1 بند 5 (مثل `SmsService`/`EmailService`/`BackgroundLocationService`) **لا يُمسّ في M1**: قراره ملك M2 (المرحل) ويُدرَج في التقرير كدين مسمّى.
- [ ] **Step 4: الحرّاس الخمسة يمرّون** + `npm run lint && npm run build && npm test && npm run test:app` كلها خضراء، و`npm run test:lab` لا ينحدر (97).
- [ ] **Step 5: تحقّق على الهاتف** (المسار المُثبت نفقاً):

```bash
"$ADB" reverse tcp:3000 tcp:3000 ; "$ADB" reverse tcp:8082 tcp:8082 ; "$ADB" reverse --list
# في متصفح الهاتف: http://127.0.0.1:3000 — ادخل ببيانات المعمل، قِس، ثم نظّف:
"$ADB" reverse --remove-all ; "$ADB" reverse --list    # المتوقع: فارغ
```

لقطات قبل/بعد لكل شاشة في `lab/artifacts/` (بلا رفع، MD5 في الأثر `010-m1-phone-check.md`)؛ لا رقم تسلسل كامل؛ لا اسم طفل حقيقي.
- [ ] **Step 6: ادفع** (`refactor(m1)!: delete spec 1.5 layers — role model, localStorage-as-record, stub server, simulation switches`).

---

## Task 12: بوابة M1 — AC-1..AC-3 مقاسة، وتقرير، وتنظيف

**Files:**
- Create: `tools/m1/ac1-transport.mjs`, `lab/report/M1-REPORT.md`, `lab/report/evidence/009-m1-ac3-web-fanout.md`, `lab/report/evidence/010-m1-phone-check.md`, `lab/report/evidence/011-m1-ac1-transport.md`
- Modify: `docs/superpowers/plans/2026-10-05-roadmap.md` (صف M1)، `lab/README.md`

**Interfaces:**
- Consumes: كل ما سبق + نفق الهاتف (R35).
- Produces: تقرير M1 بنفس صيغة `lab/report/M0-REVIEW.md` (ادّعاء ← قياس ← ملف/سطر).

- [ ] **Step 1: AC-1 (نقلي، بمصدر محقَن — لا GPS):** استعمل نفس كود العميل في Node، وحقن موضعاً من **داخل الهاتف** عبر `adb reverse tcp:5055` كما في `lab/README.md:145-153`، وقيس `fixTime → ظهوره في /api/positions كما يقرأه التطبيق` لـ≥10 دفعات:

```bash
LAB_API_URL=http://127.0.0.1:8082/api node tools/m1/ac1-transport.mjs --device=lab-child-1 --samples=10
```

المتوقع: جدول p50/p95/max + سطر `verdict:` **بنفس منطق** `lab/sink/report.mjs` (أي نوع غير مقاس ⇒ `NO DATA` لا `PASS` — درس المراجعة النهائية بند 1). الحكم المسموح: «AC-1 **نقلاً**: p95 ≤ 30000 ms» مع سطر صريح: **المصدر مُحقَن يدويّاً؛ لا GPS حقيقي (R35/R37)**. وإن أردت عمر الحدث فافصل العمودين كما فعلت R30.
- [ ] **Step 2: AC-2** — من Task 8 Step 5 (المنطقة على الخادم + `localStorage` خالٍ)؛ يُعاد قياسها الآن لا يُنقل نصّها.
- [ ] **Step 3: AC-3 على `web`** — من Task 10 Step 4، بوليَّين، زمني وصول مستقلَّين + ملاحظة صريحة أن البريد/تيليجرام NOT RUN.
- [ ] **Step 4: `lab/report/M1-REPORT.md`** — الأقسام: البوابة (ثلاث خانات AC-1..AC-3 وكل واحد مقيس أو NOT RUN)، الأزمنة، ما يثبته المنتج، **ما لا يثبته ويُمنع ادعاؤه** (تسليم قناة حقيقية، استمرارية 24/7، شبكة عامة، مصدر GPS، AC-4+ للمرحلة M2)، الديون المسماة، وقراءة CI موقّتة بالطابع الزمني.
- [ ] **Step 5: بوابات محلية كاملة ملصقة**: `npm run lint`، `npm run build`، `npm run test:app` (بالعدد)، `npm run test:lab` (97)، `npm run lab:check`، وأمر البوابة المعملية. وأرضية `m1-ci.yml` تُرفَع للأرقام المقيسة في نفس الالتزام.
- [ ] **Step 6: تنظيف إلزامي** — `"$ADB" reverse --remove-all` (والمتوقع `--list` فارغ)، إيقاف الحوض والخادم، و`netstat -ano | grep -E ':(8082|5055|5199|3000)' | grep LISTENING || echo "ALL LAB PORTS CLOSED"`.
- [ ] **Step 7: ادفع الفرع** — **ولا دمج، ولا PR** (فعل المالك وحده). `gh run list --branch m1/guardian-app` → الحكم **NOT RUN — CI unavailable (account billing)** مع رقم التشغيل إن وُجد.

---

## تغطية البوابة (مراجعة ذاتية: كل AC ⇒ مهمة، وكل مهمة ⇒ AC أو أساس)

| البند من المواصفة | يُنفَّذ في | يُقاس في |
|---|---|---|
| AC-1 (الموضع يصل ≤30ث p95) | Task 3 (عميل) + Task 5 (عرض صادق) + Task 7 (الخريطة) | Task 12 Step 1 — **نقلاً** بمصدر مُحقَن عبر `adb reverse` (R35/R37)، جدول p50/p95/max بمنطق `lab/sink/report.mjs` |
| AC-2 (منطقة مرسومة تُحفظ في الخادم وتخرج من `localStorage`) | Task 4 (WKT) + Task 8 (مناطق + إذن) | Task 8 Step 5 سطر `geofence … area=CIRCLE (…)` حرفيّاً + `Object.keys(localStorage)`؛ ويُعاد القياس في Task 12 Step 2 |
| AC-3 (خروج مؤكد ⇒ P1 يصل كل الأولياء بالتوازي) | Task 10 (أحداث + tiers + مقبس) + Task 9 (تعدد الأولياء) | Task 10 Step 4 على قناة `web` بوليَّين وزمنَي وصول مستقلَّين؛ البريد/تيليجرام **NOT RUN**؛ ويُعاد في Task 12 Step 3 |
| AC-12 (لا جملة تتعدّى الصدق) | Task 5 (القاموس + التسميات) + Task 7 (نغمة الصمت) | Task 5 Step 4 `grep` بلا نتيجة، وحارس القاموس في Task 5 Step 1 |
| §6 فخّ الإحداثيات + حدود الهندسة | Task 4 (دالة واحدة) | Task 4 Steps 1–6 (اختبار التكافؤ + قياس مضاد للحشو + `grep` أن `wkt.ts` وحده يكتب WKT) |
| §1.5 حذف الطبقات | Task 11 | Task 11 Steps 1–2 (حرّاس يرون الموجود اليوم ثم يمرّان) |

بنود لا تملك هذه الخطة سطراً فيها عمداً: AC-4..AC-9 (M2/M2.5)، AC-10/AC-11 (M3 والمُلحقات)، AC-13..AC-18 (M2 وما بعده). أي ذكر لها في تقرير M1 يكون «غير مُنفَّذ في هذه المرحلة»، لا «مُنجَز».

---

## ما لا تفعله هذه الخطة (صراحةً)

- **لا تبني APK، ولا تتحقق من سلوك الغلاف الأصلي (Capacitor) على الجهاز في هذه المرحلة.** البناء على جهاز المالك محظور بالقياس (2 نوى / 4GB / HDD)، و`build-release.yml` لا يعمل على فرع `m1/**` أصلاً، وانقطاع الحساب قائم. التحقق في M1 هو **شاشة المصفح عبر نفق `adb reverse`** على هاتف Realme — لا سلوك الغلاف الأصلي (إشعارات النظام، خدمة الموقع في الخلفية، الأذونات)؛ تلك تُدرَج في الأثر كـ**NOT RUN (needs APK)**، ولا تُكتب مُحقَّقة لأن المصفح عمل.
- **لا تصعيد، ولا نوافذ ack، ولا ورقة حادث، ولا حزمة شرطة** — كلها M2/M2.5 (§14). لا تكتب سطر «التصعيد يعمل» في أي تقرير.
- **لا شراء عتاد (M3) ولا اختبار ميداني (M4)**، ولا ادّعاء وصول شبكة عامة أو استضافة: الحالة `LAB-ONLY` حتى يقلبها اختبار البطاقة (~$2) بيد المالك.
- **لا `mail.debug=false` ولا تفعيل تليجرام**: الحارسان ثابتان باختبارات، والقرار قرار المالك المسجَّل (المهمة 8 Part B في M0)، وقناة `web` وحدها هي المُثبَتة في AC-3.
- **لا `geocoder.enable=true`**: القرار موثّق §9.12 (تسريب العنوان)، وإن كان لازمًا لـ«مَن يتّصل به» فليُناقَش كقرار مستقل لا كتعديل عابر.
- **لا تعديل على `lab/m0` ولا دمج أي فرع إلى `main`** — الدمج فعل المالك وحده، ولا PR تُفتح من الآلة.
