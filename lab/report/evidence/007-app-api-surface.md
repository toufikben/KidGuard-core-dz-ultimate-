# الدليل 007 — سطح API الخادم الحيّ (Traccar 6.16.0): قياسٌ لا توقّع

**الغرض:** جدول الحقائق الذي يبني عليه Task 3–10 تسمية الحقول بدل التخمين. كل سطر هنا من
مخرجات أداة `tools/m1/api-probe.mjs` على الخادم القائم — **لا شيء من الذاكرة**.

**تاريخ القياس:** `2026-10-08T21:20:13Z` (UTC). الفرع `m1/guardian-app` عند `8f8ea6e` (رأس ما قبل
التزام مهمة-2). الخادم: **Traccar 6.16.0** الحيّ على `http://127.0.0.1:8082/api` — مُختبَر
`GET /api/server`→200 قبل القياس، **لم يُقلَّع ولم يُطفأ ولم تُمَسّ `lab/traccar/lab-data/`**.

**كيف قِيست نافذة المقبس (صدفة واحدة — قرار المُشغِّل):** أُطلقت الأداة في الخلفية
(`> /tmp/api-probe.txt`)، ثم بعد ~3ث شُغِّل `npm run lab:scenario -- school-exit --speed=1` في
المقدّمة، ثم انتُظر خروج الأداة: `PROBE_EXIT=0` و`SCENARIO_EXIT=0`. لا تخمين لشكل إطار — انظر §5.

**البيئة والأسرار:** صُدِّرت المتغيّرات من `lab/traccar/fanout.env` (المسار يُذكر، **لا يُطبع
المحتوى أبداً**)، ولم تُكتب أي كلمة مرور داخل أي سطر أمر. Node `v24.19.0`، و`typeof WebSocket ===
'function'` (عالميّ) — **بلا أي اعتمادية جديدة**.

## §0 بيان أمانة أوّلاً: ما لم يُقَس
- **شكل إطار حدث `geofenceExit` عبر المقبس لم يُقَس.** سيناريو `school-exit` بسرعة 1 يضع موضع
  الخروج عند `t+90s`، أي **بعد** إغلاق نافذة الـ20ث. **يُمنع تخمينه**؛ الأشدّ ضرراً أن يُبنى Task 10
  على شكل مُختلَق. الحكم: **NOT RUN** — انظر §5.
- `/session` و`/events` رجعا **404 حيّاً**. مُقاس كما هو، لا يُجمَّل — انظر §6.

## §1 جدول «المسار ⇐ الحقول المُرجَعة»
كل القيم من `fields:` و`count:` في §8. أسماء الحقول كما أعادها الخادم (نصّ الأداة يُرتّبها أبجديّاً).

| المسار (GET إلا ما عُلِّم) | HTTP | أسماء الحقول العائدة | عدد |
|---|---|---|---|
| `/api/session` | **404** | *(نصّ استثناء، لا قائمة حقول — §6)* | — |
| `/api/devices` | 200 | `attributes,calendarId,category,contact,disabled,expirationTime,groupId,id,lastUpdate,model,name,phone,positionId,status,uniqueId` | 1 |
| `/api/positions` (الكلّ الأحدث) | 200 | `accuracy,address,altitude,attributes,course,deviceId,deviceTime,fixTime,geofenceIds,id,latitude,longitude,network,protocol,serverTime,speed,valid` | 1 |
| `/api/positions?deviceId=1` | 200 | *(نفس حقول الموضع أعلاه)* | 1 |
| `/api/positions?deviceId=1&from=…&to=…` (تاريخ) | 200 | *(نفس حقول الموضع)* | 3 |
| `/api/geofences` | 200 | `area,attributes,calendarId,description,id,name` | 2 |
| `/api/events?from=…&to=…` | **404** | *(نصّ استثناء، لا قائمة حقول — §6)* | — |
| `POST /api/session/token` | 200 | *(قيمة الرمز غير مطبوعة؛ طولها 184)* | — |
| `POST /api/session/token/revoke` | 204 | — | — |
| `OPTIONS /api/positions` (preflight) | 200 | *(ترويسات CORS — §4)* | — |

**ما يلزم التطبيق من الأسماء المُقاسة (لا تأويل، فقط ملاحظة البنية):**
- **الموضع:** يُرجع `latitude` و`longitude` **حقلين منفصلين** (لا حقل `location` مُدمج). ثلاثة أزمنة
  مختلفة: `deviceTime`، `fixTime`، `serverTime` (درس M0 R29/R30: لا تخلط عمرَ الطابع بزمن النقل).
  `geofenceIds` مصفوفة، `speed` و`course` و`altitude` و`accuracy` أرقام، `address` نصّ (غالباً فارغ
  لأنّ الجيرجودر معطَّل في المعمل)، و`valid`، و`protocol`، و`attributes` خريطة.
- **الجهاز:** فيه `positionId` (مرجع آخر موضع)، `uniqueId`، `groupId`، `status`، `disabled`،
  `lastUpdate` — أي أن قائمة الأجهزة وحدها تكفي لربط كلّ جهاز بآخر موضعه دون نداء إضافي.
- **المنطفة:** `area` نصّ WKT (انظر §2 لترتيبه)، و`name`، و`description`، و`attributes`، و`calendarId`.

## §2 ترتيب الإحداثيات العائد حرفيّاً (الفخّ §6) — مُقاس
سطرا `area=` كما خرجا (وكلاهما في §8):
```
geofence 1 "school" area=CIRCLE (36.7538 3.0588, 100)
geofence 2 "walk-to-park" area=LINESTRING (36.7538 3.0588, 36.7552 3.0605, 36.7568 3.0621)
```
المصدر الحسّي (من `lab/scenarios/school-exit.json`): منطقة مدرسة بـ`lat=36.7538`, `lon=3.0588`,
`radiusMeters=100`. فالزوج العائد `36.7538 3.0588` هو **(lat, lon)** بالترتيب.

**الحكم المُقاس:** نصّ `area` من Traccar 6.16.0 مرتَّب **`lat lon`** — **لا** `lon lat` القياسي في
WKT/GeoJSON (حيث x=lon, y=lat). ينطبق هذا على `CIRCLE (lat lon, radius)` (نصف القطر وسيط ثالث)
**و**على `LINESTRING (lat lon, lat lon, …)`.

**القرار لـ`wkt.ts`:** **يحتاج فكّاً صريحاً لا تمريراً.** لا يجوز تمرير نصّ `area` الخام إلى أي
مستهلك يتوقّع GeoJSON `[lon,lat]`/`[x,y]` (Leaflet/turf افتراضهما القياسي) — وإلا انقلب المحوران.
`wkt.ts` مُلزَم بتفسير كل زوج كـ(lat, lon) وإعادة ترتيبه عند التسليم.

## §3 شكل 401 المجهول (مسار بلا مصادقة) — مُقاس
```
== anonymous == HTTP 401 body=jakarta.ws.rs.WebApplicationException: HTTP 401 Unauthorized
	at org.traccar.api.security.SecurityRequestFilter.filter(
```
**الحكم:** نداء غير مُصادَق عليه يرد **HTTP 401** وجسمه **نصّ استثناء Java خام (stack trace) —
وليس JSON**. لذا يتفرّع مسار 401 في التطبيق على **رمز الحالة** فقط، و**لا يُطبَّق عليه `JSON.parse`**
(لا `{"message":…}` ولا أي شكل مُهيكل — لا تفترضه). الأداة طبعَت أوّل 120 حرفاً من الجسم كما هي.

## §4 ترويسات CORS الفعلية + `web.origin` المستنتَجة — مُقاسة
```
== cors == HTTP 200 allow-origin=null allow-credentials=true
```
المُرسَل في الطلب: `origin: http://127.0.0.1:3000`، `access-control-request-method: GET`.

**الحكم المُقاس:** الـpreflight يُجيب **200 لكن بلا ترويسة `Access-Control-Allow-Origin`**
(عادت `null` = غائبة)، بينما `Access-Control-Allow-Credentials: true` موجودة. تركيبة
credentials=true **دون** ACAO مطابق ترفضها المتصفّحات للاتصال العابر للأصول ⇒ **قائمة
`web.origin` على الخادم لا تضمّ `http://127.0.0.1:3000`** (افتراضي Keys.java لا يفتح أصل التطبيق).

**العبارة المُلزِمة:** **المسار المُستعمَل في المعمل هو proxy نفس الأصل (same-origin)، فلا CORS على
المسار الحرج.** التطبيق يصل الـAPI عبر وسيط على نفس الأصل، فلا يحتاج منح `web.origin` عابر للأصول
في هذه البيئة.

## §5 المقبس الحيّ `/api/socket` (اعتماد Task 10) — مُقاس جزئيّاً
```
== token == HTTP 200 length=184
== socket == OPEN
== socket frames == positions | 
== token revoke == HTTP 204
```
- **الرمز:** `POST /api/session/token`→200، طول القيمة 184 (**لا تُطبع القيمة**)؛ ثمّ
  `POST /api/session/token/revoke`→204. لا يبقى رمزٌ بعد الأداة.
- **المصافحة تنجح فعلاً:** `== socket == OPEN` — المقبس فُتح بمصادقة عبر معامل الاستعلام
  `?token=…` (AsyncSocketServlet)، مستعملاً WebSocket العالمي في Node 24 **بلا اعتمادية**.
- **الإطارات داخل النافذة (حرفيّ):** السطر `== socket frames == positions | ` هو
  `[...shapes].join(' | ')`، أي **شكلان مختلفان بالضبط**: (1) كائنٌ مفتاحه العلويّ الوحيد
  `positions` ⇒ غلاف الإطار المُقاس هو **`{"positions":[…]}`**؛ (2) **كائن فارغ `{}`** (الرمز الفارغ
  بعد ` | `). هذا مقاس بايت-ببايت (§8) وليس تأويلاً.
- **ما يعنيه لـTask 10 (المُقاس فقط):** رسائل المقبس كائنات JSON مُغلَّفة بمفتاحٍ علويّ واحد يُسمّي
  نوع الحِمل (المُلاحَظ: `positions`). وصل داخل النافذة إطارُ بثّ الموضع (قراءة `t+0` من السيناريو)
  على هيئة `{"positions":[…]}`.
- **لم يُقَس — لا تُخمِّنه:** إطار **حدث/`geofenceExit`** (غلاف `{"events":[…]}` وحقوله الداخليّة).
  خروج المنطقة يقع عند `t+90s` خارج نافذة الـ20ث. **الحكم: NOT RUN.** على Task 10 إعادة القياس
  بوضع موضع الخروج داخل النافذة (سيناريو أسرع أو نافذة أوسع) قبل تفرّع الإنذار — ولا يُبنى على
  شكلٍ مُفترَض.
- معنى الإطار الفارغ `{}` لم يُفكَّك بعد؛ يُسجَّل شكله كما قِيس دون ادّعاء تفسيره.

## §6 قراءتان 404 تُغيِّران خطة التطبيق (مُقاستان، لا تُجمَّلان)
```
== session == GET /session -> HTTP 404
fields: jakarta.ws.rs.WebApplicationException: HTTP 404 Not Found
	at org.traccar.api.resource.SessionResource.get(SessionResou
count: 1
```
```
== events == GET /events?from=2026-10-07T21:11:29.901Z&to=2026-10-08T21:11:34.913Z -> HTTP 404
fields: jakarta.ws.rs.NotFoundException: HTTP 404 Not Found
	at org.glassfish.jersey.server.ServerRuntime$1.run(ServerRuntime.j
count: 1
```
- **`GET /api/session` تحت Basic (بلا Cookie) → 404** لا ملفّ المستخدم. implication: لا يتفرّع الـUI
  على حقل الدور المقروء من `GET /session` برأس Basic وحده في هذه النسخة؛ يجب إنشاء جلسة كوكيز
  (`POST /api/session`) أو استعمال الرمز، ثمّ إعادة قياس ما يرجع فعلاً للهويّة/الدور. (سطر
  `count: 1` هنا أثرٌ للأداة — فرع `parsed==null` يطبع 1 — لا عدد سجلّات حقيقي.)
- **`GET /api/events?from&to` → 404** (Jersey NotFoundException). نفس صيغة `from/to` الأُيزوِيّة
  عملت على `/positions` لكنّها **لم تُحلّ** على `/events`. implication: مصدر أحداث الشاشة
  «التنبيهات» عبر REST **غير مؤكَّد** بهذه المعاملات؛ على Task 10 إعادة قياس المسار/المعاملات/الصيغة،
  أو قيادة التنبيهات من المقبس (§5) — لا يفترض أن `/events` يعمل كما كُتب.

## §7 أمر التشغيل + فحص عدم التسريب + التنظيف
```bash
set -a; source lab/traccar/fanout.env; set +a
node tools/m1/api-probe.mjs > /tmp/api-probe.txt 2>&1 &      # الأداة في الخلفية
sleep 3
npm run lab:scenario -- school-exit --speed=1 > /tmp/scenario.txt 2>&1   # المقدّمة، داخل نافذة المقبس
wait %1; echo "PROBE_EXIT=$?"                                # PROBE_EXIT=0
grep -c 'PASSWORD\|Basic ' /tmp/api-probe.txt               # المتوقع 0
```
**فحص عدم التسريب المقاس:** `'PASSWORD\|Basic '` = **0**، `authorization` = **0**، `@` (بريد) = **0**.
قيمة الرمز لم تُطبع (فقط `length=184`). **التنظيف:** الرمز سحبتْه الأداة نفسها (204)؛ لا سرّ في
الأثر؛ `lab-data/` لم تُمَسّ (لا إعادة إقلاع ولا حذف).

## §8 الخرج الخام للأداة (حرفيّ، بايت-ببايت من `/tmp/api-probe.txt`)
```text

== session == GET /session -> HTTP 404
fields: jakarta.ws.rs.WebApplicationException: HTTP 404 Not Found
	at org.traccar.api.resource.SessionResource.get(SessionResou
count: 1

== devices == GET /devices -> HTTP 200
fields: attributes,calendarId,category,contact,disabled,expirationTime,groupId,id,lastUpdate,model,name,phone,positionId,status,uniqueId
count: 1

== all-latest == GET /positions -> HTTP 200
fields: accuracy,address,altitude,attributes,course,deviceId,deviceTime,fixTime,geofenceIds,id,latitude,longitude,network,protocol,serverTime,speed,valid
count: 1

== device-latest == GET /positions?deviceId=1 -> HTTP 200
fields: accuracy,address,altitude,attributes,course,deviceId,deviceTime,fixTime,geofenceIds,id,latitude,longitude,network,protocol,serverTime,speed,valid
count: 1

== history == GET /positions?deviceId=1&from=2026-10-07T21:11:29.901Z&to=2026-10-08T21:11:29.902Z -> HTTP 200
fields: accuracy,address,altitude,attributes,course,deviceId,deviceTime,fixTime,geofenceIds,id,latitude,longitude,network,protocol,serverTime,speed,valid
count: 3

== geofences == GET /geofences -> HTTP 200
fields: area,attributes,calendarId,description,id,name
count: 2
geofence 1 "school" area=CIRCLE (36.7538 3.0588, 100)
geofence 2 "walk-to-park" area=LINESTRING (36.7538 3.0588, 36.7552 3.0605, 36.7568 3.0621)

== events == GET /events?from=2026-10-07T21:11:29.901Z&to=2026-10-08T21:11:34.913Z -> HTTP 404
fields: jakarta.ws.rs.NotFoundException: HTTP 404 Not Found
	at org.glassfish.jersey.server.ServerRuntime$1.run(ServerRuntime.j
count: 1

== anonymous == HTTP 401 body=jakarta.ws.rs.WebApplicationException: HTTP 401 Unauthorized
	at org.traccar.api.security.SecurityRequestFilter.filter(

== cors == HTTP 200 allow-origin=null allow-credentials=true

== token == HTTP 200 length=184
== socket == OPEN
== socket frames == positions | 
== token revoke == HTTP 204
```
