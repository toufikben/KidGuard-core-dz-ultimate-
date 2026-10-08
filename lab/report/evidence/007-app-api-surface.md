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
'function'` (عالميّ) — **بلا أي اعتمادية جديدة**. في جولة التصحيح يُبنى جسم `POST /session`
**داخل عملية الأداة** من env (`URLSearchParams`)، فلا يمرّ عبر الطرفية ولا يُطبع أبداً.

**جولة التصحيح 1 (fix round) — تاريخ القياس المُحدَّث `2026-10-08T21:54Z` (UTC):** الأداة وُسِّعت
لسدّ ثلاث فجوات أبلغت عنها الجولة الأولى: (أ) نافذة المقبس صارت ~150ث فالتقطت إطار
`geofenceExit` الحقيقي مع **أسماء حقوله الداخليّة** (§5.1 و§9)، (ب) مسارات الهُويّة
`GET /session?token=` و`POST /session` (نموذج) و`GET /session` بلا رأس ولا كوكيز قِيست جميعها (§1
و§6.1)، (ج) مسار `/events?from&to` الميت استُبدل بـ`/api/notifications?from&to` وقِيس (§6.1).
**الخرج الخام للجولة الأولى بقي حرفيّاً كما هو في §8، والخرج الخام للجولة المُصحَّحة في §9** — لا
تحرير لسطر خام؛ التصحيحات تُكتب حولَه لا داخله. مصدر النسخة 6.16.0 (نسخ محليّة خارج المستودع تحت
`_research/traccar/src/main/java/org/traccar/…`) يُذكر مع كل ادّعاء ويوسم: **(من المصدر)** مقابل **(مقيس)**.

## §0 بيان أمانة أوّلاً: ما لم يُقَس
- **شكل إطار حدث `geofenceExit` عبر المقبس لم يُقَس.** سيناريو `school-exit` بسرعة 1 يضع موضع
  الخروج عند `t+90s`، أي **بعد** إغلاق نافذة الـ20ث. **يُمنع تخمينه**؛ الأشدّ ضرراً أن يُبنى Task 10
  على شكل مُختلَق. الحكم: **NOT RUN** — انظر §5.
  *(تصحَّح في جولة التصحيح 1: النافذة وُسِّعت إلى ~150ث وأُشبع شرط مُشعِر `web`، فالإطار صار
  **مقيساً** بأسماء حقوله — انظر §5.1 و§9؛ يبقى هذا السطر أثراً لتاريخ الجولة الأولى كما قِيست.)*
- `/session` و`/events` رجعا **404 حيّاً**. مُقاس كما هو، لا يُجمَّل — انظر §6.

## §1 جدول «المسار ⇐ الحقول المُرجَعة»
كل القيم من `fields:` و`count:` في §8 (الجولة الأولى) و§9 (جولة التصحيح — السطور المعلَّمة FIX).
أسماء الحقول كما أعادها الخادم (نصّ الأداة يُرتّبها أبجديّاً).

| المسار (GET إلا ما عُلِّم) | HTTP | أسماء الحقول العائدة | عدد |
|---|---|---|---|
| `/api/session` تحت رأس Basic فقط | **404** | *(نصّ استثناء، لا قائمة حقول — §6)* | — |
| `/api/devices` | 200 | `attributes,calendarId,category,contact,disabled,expirationTime,groupId,id,lastUpdate,model,name,phone,positionId,status,uniqueId` | 1 |
| `/api/positions` (الكلّ الأحدث) | 200 | `accuracy,address,altitude,attributes,course,deviceId,deviceTime,fixTime,geofenceIds,id,latitude,longitude,network,protocol,serverTime,speed,valid` | 1 |
| `/api/positions?deviceId=1` | 200 | *(نفس حقول الموضع أعلاه)* | 1 |
| `/api/positions?deviceId=1&from=…&to=…` (تاريخ) | 200 | *(نفس حقول الموضع)* | 21 (كان 3 في §8 — تحرّك المعمل بين الجولتين) |
| `/api/geofences` | 200 | `area,attributes,calendarId,description,id,name` | 2 |
| `/api/events?from=…&to=…` | **404** | *(لا قائمة حقول — §6: لا وجود لمجموعة GET على `/events` في 6.16.0، من المصدر)* | — |
| `/api/notifications?from=…&to=…` **FIX** | 200 | `always,attributes,calendarId,commandId,description,id,notificators,type` | 1 |
| `GET /api/session?token=<رمز مُنتَج>` **FIX** (whoAmI) | 200 | `administrator,attributes,coordinateFormat,deviceLimit,deviceReadonly,disableReports,disabled,email,expirationTime,fixedEmail,id,latitude,limitCommands,login,longitude,map,name,password,phone,poiLayer,readonly,temporary,totpKey,userLimit,zoom` | 1 |
| `POST /api/session` (نموذج `email`+`password` من env) **FIX** | 200 | *(نفس حقول User أعلاه)* + اسم الكوكيز العائد: `JSESSIONID` (الاسم فقط، لا القيمة) | 1 |
| `GET /api/session` **بلا رأس Basic وبلا كوكيز** **FIX** | **404** | *(نصّ استثناء `SessionResource.get` — §6.1)* | — |
| `PUT /api/notifications/1` (ضمان مُشعِر `web`) **FIX** | 200 | — | — |
| `POST /api/session/token` | 200 | *(قيمة الرمز غير مطبوعة؛ طولها 184 في الجولتين)* | — |
| `POST /api/session/token/revoke` | 204 | — | — |
| `OPTIONS /api/positions` (preflight) | 200 | *(ترويسات CORS — §4)* | — |

**تفصيل نزيه عن سطر `/api/notifications`:** الحقول العائدة (**مقيس**) هي حقول **اشتراك** التنبيه
(`type`,`notificators`,`always`,`calendarId`,`commandId`,`description`…) — أي قواعد «مَن يُبلَّغ عن
ماذا»، وليست سجلّ أحداث مرسلة؛ ومعاملّا `from/to` **غير مُعرَّفَين** في GET المجموعة الموروثة
(`ExtendedObjectResource.java:46-52` — المعاملات هي `all,userId,groupId,deviceId,excludeAttributes,limit,offset,keyword`)
**(من المصدر)**، فالعدد العائد (1) هو عدد الاشتراكات كلّه لا عدد سجلّات النافذة الزمنية. انظر §6.1.

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
  *(فُكِّك في جولة التصحيح — انظر §5.1: الإطار الفارغ هو رسالة البقاء على قيد الاتصال/الإبقاء،
  `AsyncSocket.java:104-105` يرسل `sendData(new HashMap<>())` أي `{}` عند كل keepalive، من المصدر.)*

## §5.1 إطار الحدث الحيّ عبر `/api/socket` — **مقيس** (جولة التصحيح 1؛ اعتماد Task 10 المباشر)
السطران الحرفيّان من §9 (لا تحرير):
```
== socket event frame == envelope=events type=geofenceExit fields=attributes,deviceId,eventTime,geofenceId,id,maintenanceId,positionId,type
== socket frames == positions |  | devices | events
```
- **الغلاف المُقاس:** `{"events":[…]}` — مفتاح علويّ وحيد `events` (**مقيس**، ويطابق تعريف
  `AsyncSocket.java:46 KEY_EVENTS = "events"` والإرسال `onUpdateEvent → sendData(Map.of(KEY_EVENTS,
  List.of(event)))` عند `AsyncSocket.java:119-120` — **من المصدر**؛ الملف يطبع أيضاً `positions`
  و`devices` و`logs` في `AsyncSocket.java:44-49,110-126`).
- **أسماء الحقول داخل عنصر `events` (حرفيّاً، مُقاسة — وهذا ما يحتاجه Task 10 ليعرض التنبيه):**
  `attributes, deviceId, eventTime, geofenceId, id, maintenanceId, positionId, type`.
  القيم غير مطبوعة (معرفات وطوابع زمنية). **تحذير مصدر موثوق:** مُشعِر الويب يضع نصّ التنبيه
  المُهيَّأ داخل `attributes` تحت مفتاح `message` (`NotificatorWeb.java:53 copy.set("message",
  message.digest())` — **من المصدر**)؛ الأداة لم تفكّك أسماء حقول `attributes` الداخليّة ولا طبعت
  قيماً — تبقى مقاسة لاحقاً إن احتاجها العرض.
- **شرط لم يكن معلوماً في الجولة الأولى (سبب عدم وصول أي إطار رغم توسيع النافذة):** الأحداث تدفع إلى
  المقبس **فقط** عبر مُشعِر الويب — `NotificatorWeb.java:49 connectionManager.updateEvent(true,
  user.getId(), copy)` (**من المصدر**)؛ واشتراك المعمل كان بـ`notificators:'mail'`
  (`lab/scripts/bootstrap.mjs:13,175`) فلا شيء يصل المقبس أياً كانت النافذة. الضمان الآن داخل
  الأداة: `GET /notifications` ثم `PUT /notifications/{id}` لإضافة `web` (مُقاس: `PUT
  /notifications/1 -> HTTP 200`؛ مسار التحديث `@Path("{id}") @PUT` في `BaseObjectResource.java:101-103`
  — محاولة PUT على المجموعة بلا id أعادت **405 مقيسة** في هذه الجولة). admin مستلمٌ لأن منشئ
  الكيان يُربط به تلقائيّاً (`BaseObjectResource.java:91-96` — **من المصدر**)، وتقاطع مصرّحي
  الاشتراك مع مستخدمي الجهاز قائم (`CacheManager.java:119-133`، موثَّق في تعليق bootstrap).
- **الأشكال الأربعة في سطر frames (مقيس):** `positions` (بث المواضع، وأوّل إطار عند الفتح يرسل
  أحدث المواضع `AsyncSocket.java:65-70`)، `{}` الفارغ (keepalive — `AsyncSocket.java:104-105`)،
  `devices` (تغيّر حالة الجهاز `AsyncSocket.java:110`)، `events` (الحدث أعلاه).
- **مطابقة التوقيت:** مع `--speed=1` يبدأ السيناريو بعد ~3ث من إطلاق الأداة، وقراءة `t+90s`
  (الرابعة: 36.75475/3.05955 ≈ 125م عن المركز خارج دائرة 100م) هي التي ولّدت `geofenceExit` —
  ووقع داخل نافذة الـ150ث **(مقيس: الإطار وصل)**.

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

### §6.1 الخلاصة المُصحَّحة (جولة التصحيح 1) — كل ادّعاء مَوسوم (من المصدر) أو (مقيس)
ثلاثة ادّعاءات، بمصادرها. نسخ محليّة خارج المستودع تحت `_research/traccar/src/main/java/org/traccar/`.

1. **`/api/session` يعيد 404 تحت رأس Basic وحده — وهذا سلوك مصمَّم لا عيب معمل.**
   `api/resource/SessionResource.java:77-104` (@PermitAll @GET): يحلّل `?token=` عبر
   `loginService.login(token)` (:84)، وإلا يقرأ `request.getSession(false)` (:95)؛ فإن لم يوجد سمة
   جلسة **يرمي NOT_FOUND/404** (:104). رأس Basic وحده لا يُنشئ سمة الجلسة — لذلك `/positions`
   و`/devices` و`/geofences` تعمل بنفس الرأس بينما `/session` تعيد 404 **(من المصدر)**، والـ404
   مقاسة حيّاً في الجولتين (§8 و§9) **(مقيس)**.
   - **بديل الهُويّة الذي يبني عليه Task 6 (مقيس هذه الجولة):** `GET /api/session?token=<رمز مُنتَج>`
     → **200** وحقول User الكاملة (§1؛ القيمة لا تُطبع والمعامل يُحجب من المطبوعة) — مرشّح `whoAmI()`.
   - **إنشاء جلسة كوكيز (مقيس):** `POST /api/session` بـ`content-type:
     application/x-www-form-urlencoded` وجسم `email=…&password=…` **يُبنى داخل عملية الأداة من env**
     (لا يمرّ عبر الطرفية ولا يُطبع) → **200** وحقول User + `set-cookie` باسم **`JSESSIONID` فقط**
     (الاسم مطبوع، القيمة لا).
   - **الحالة التي يراها التطبيق حين تموت جلسته (مقيس):** `GET /api/session` **بلا Basic وبلا كوكيز**
     → **404** (نص استثناء `SessionResource.get`) — لا 401؛ لأن المسار `@PermitAll` **(من المصدر،
     وقيس مطابق)**.
2. **`/api/events` في 6.16.0 قراءةُ كائن واحد بالمعرّف فقط — لا مجموعة زمنيّة إطلاقاً.**
   `api/resource/EventResource.java` كل الملف ~52 سطراً، و`@GET` الوحيد فيه هو `@Path("{id}")`
   (:40-41) **(من المصدر)**؛ 404 على `/events?from&to` **مقيس** في §8. قراءة «التنبيهات» المستقرة
   تتم عبر **`/api/notifications`** — المجموعة الموروثة من `ExtendedObjectResource<Notification>`
   (`api/resource/NotificationResource.java:53-56` `@Path("notifications")` + الامتداد) **(من
   المصدر)**، وقِيس حيّاً: **200** بأسماء حقول الاشتراك `always,attributes,calendarId,commandId,
   description,id,notificators,type` وعدّ 1 **(مقيس)** — لكن مع ملاحظة §1: `from/to` غير مُعرَّفَين
   في GET الموروثة (`ExtendedObjectResource.java:46-52`) فتُتجاهل بصمت **(من المصدر)**؛ أي أن
   «نافذة زمنية» على `/api/notifications` ليست تصفية زمنية مقاسة، والفرق بين «اشتراك» و«سجل حدث
   مُرسَل» موثّق هناك.
3. **التنبيه الحيّ يصل كمقبس:** `{"events":[…]}` بغلاف مفتاحه `events` وحقول العنصر
   `attributes,deviceId,eventTime,geofenceId,id,maintenanceId,positionId,type` — **مقيس الآن** (§5.1
   و§9)، ومطابق للتظهير في `api/AsyncSocket.java:45-46` (`KEY_POSITIONS="positions"`،
   `KEY_EVENTS="events"`) والإرسال `:110-126` **(من المصدر)**؛ إطار `{}` هو مسار الفتح/الإبقاء
   (`AsyncSocket.java:65,104-105` — من المصدر) وقد قِيس **(مقيس)**. **لا يجوز** لـTask 10 أن يستعمل
   حقول `Event.java` نظريّاً بدل هذه القائمة المُقاسة؛ الحقول الداخليّة لـ`attributes` (بما فيها
   `message` الذي يضعه `NotificatorWeb.java:53`) بقيت **غير مقاسة** — تُقاس عند الحاجة.

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

**أمر جولة التصحيح 1 (كما نُفِّذ فعليّاً — نافذة 150ث والسيناريو داخلها):**
```bash
set -a; source lab/traccar/fanout.env; set +a            # المحتوى لا يُطبع
node tools/m1/api-probe.mjs > /tmp/api-probe.txt 2>&1 & PROBE_PID=$!
sleep 3
npm run lab:scenario -- school-exit --speed=1 > /tmp/scenario.txt 2>&1   # SCENARIO_EXIT=0
wait $PROBE_PID; echo "PROBE_EXIT=$?"                                     # PROBE_EXIT=0
grep -c 'PASSWORD\|Basic ' /tmp/api-probe.txt      # -> 0
grep -c 'authorization'    /tmp/api-probe.txt      # -> 0
grep -c 'JSESSIONID='      /tmp/api-probe.txt      # -> 0 (الاسم مطبوع بلا قيمة)
grep -c '@'                /tmp/api-probe.txt      # -> 0 (لا بريد)
```
**الأثر الجانبي المعلن على حالة المعمل:** الأداة تضمن مُشعِر `web` على اشتراك `lab-geofenceExit`
عبر `PUT /notifications/1` (عملية idempotent طبيعية، لا تحذف شيئاً ولا تمسّ `lab-data/` مباشرة).
إعادة تشغيل `lab:bootstrap` بعد ذلك تطبع EXISTS لنفس السطر لأن المطابقة على
`type+description` لا على `notificators`.

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

## §9 الخرج الخام للأداة — جولة التصحيح 1 (من /tmp/api-probe.txt؛ 3071 بايت مطابقة للخراج حرفيّاً
عدا 3 بايت CR داخل نصّ stack-trace الذي تُرجِم على Windows — وهي نفس القاعدة المطبَّقة في §8
المؤكَّدة برمجيّاً؛ لا معنى ضاع). سطور المصادقة هنا أسماءُ حقول وحالاتِ استثناء مقطوعة عند 120 حرفاً؛ لا قيمة رمز ولا قيمة كوكيز
ولا بريد — السطر `set-cookie names: JSESSIONID` اسمٌ بلا قيمة، و`token=<redacted>` حجبته
الأداة نفسها. إطار الحدث في `== socket event frame ==` هو ضالة Task 10.
```text

== session-basic == GET /session -> HTTP 404
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

== history == GET /positions?deviceId=1&from=2026-10-07T21:54:01.904Z&to=2026-10-08T21:54:01.905Z -> HTTP 200
fields: accuracy,address,altitude,attributes,course,deviceId,deviceTime,fixTime,geofenceIds,id,latitude,longitude,network,protocol,serverTime,speed,valid
count: 21

== geofences == GET /geofences -> HTTP 200
fields: area,attributes,calendarId,description,id,name
count: 2
geofence 1 "school" area=CIRCLE (36.7538 3.0588, 100)
geofence 2 "walk-to-park" area=LINESTRING (36.7538 3.0588, 36.7552 3.0605, 36.7568 3.0621)

== notifications-history == GET /notifications?from=2026-10-07T21:54:01.904Z&to=2026-10-08T21:54:11.269Z -> HTTP 200
fields: always,attributes,calendarId,commandId,description,id,notificators,type
count: 1

== anonymous == HTTP 401 body=jakarta.ws.rs.WebApplicationException: HTTP 401 Unauthorized
	at org.traccar.api.security.SecurityRequestFilter.filter(

== cors == HTTP 200 allow-origin=null allow-credentials=true

== notifications == GET /notifications -> HTTP 200
fields: always,attributes,calendarId,commandId,description,id,notificators,type
count: 1
== ensure-web-notificator == PUT /notifications/1 -> HTTP 200

== token == HTTP 200 length=184

== whoAmI-token == GET /session?token=<redacted> -> HTTP 200
fields: administrator,attributes,coordinateFormat,deviceLimit,deviceReadonly,disableReports,disabled,email,expirationTime,fixedEmail,id,latitude,limitCommands,login,longitude,map,name,password,phone,poiLayer,readonly,temporary,totpKey,userLimit,zoom
count: 1

== login-form == POST /session -> HTTP 200
fields: administrator,attributes,coordinateFormat,deviceLimit,deviceReadonly,disableReports,disabled,email,expirationTime,fixedEmail,id,latitude,limitCommands,login,longitude,map,name,password,phone,poiLayer,readonly,temporary,totpKey,userLimit,zoom
count: 1
set-cookie names: JSESSIONID

== session-no-header-no-cookie == GET /session -> HTTP 404
fields: jakarta.ws.rs.WebApplicationException: HTTP 404 Not Found
	at org.traccar.api.resource.SessionResource.get(SessionResou
count: 1
== socket == OPEN
== socket event frame == envelope=events type=geofenceExit fields=attributes,deviceId,eventTime,geofenceId,id,maintenanceId,positionId,type
== socket frames == positions |  | devices | events
== token revoke == HTTP 204
```
