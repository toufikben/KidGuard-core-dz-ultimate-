# الدليل 005 — قرار التفرّع (fan-out) لكل وليّ على Traccar 6.16.0 (Task 8 — الجزء A)

**السؤال المقاس هنا، وهو الحاسم معماريّاً:** هل يجعل *مشاركة الجهاز* الوليَّ الثاني مستقبِلاً
للإنذار، أم أنّ تصريح `Notification` الصريح لازم؟ (المواصفة §3: إنذار لكل الأولياء 2–3).
الجواب قياساً في جدول «قرار Step 3» أدناه: **تصريح `Notification` لازم**، ومعه قياس إضافي:
رابط `Device -> Notification` لازم هو الآخر لأن السجل `always:false`.

**ما لم يُشتغَل (انظر قسم NOT RUN):** تسليم تيليجرام حقيقي، تسليم بريد حقيقي، لقطات بشريط الساعة،
إثبات التوازي الحقيقي، وpush/FCM. هذا الملف لا يدّعي شيئاً من ذلك، ولا يستنتجه.

---

## 0. قواعد الأمانة المطبَّقة

- لا قناة خارجية أُرسل إليها: التيليجرام أُقفِل في الإعدادات (دليل ذلك في §2)، والبريد وُجِّه إلى
  مُنفِّذ **داخلي في نفس عملية JVM** يسجّل الرسائل في السجل ولا يفتح أي مقبس SMTP (`mail.debug=true`).
  لا عنوان بريد حقيقي، ولا رقم chat id، ولا توكن صالح — التوكن في ملف المعمل هو
  `123456:FAKE-LAB-BOT-TOKEN` (مزيف) وبقي كما هو، ولم يُستعمَل.
- كل بريد/كلمة مرور مقنَّع في هذا الملف. صيغة التقنيع: `lab-a***@***` (المدير، `u:1`) و
  `lab-g***-2@***` (الولي الثاني، `u:2`). الهوية في كل سطر دليل مثبَتة بـ**معيار `u` المفكَّك من
  رمز unsubscribe الخاص بالرسالة نفسها** (وليس بمقارنة نص البريد)، وهو معرّف غير سرّي.
  كلمات المرور مُرِّرت بيئياً فقط، ولا تظهر في أي ملف مُتتبَّع؛ القيم الخام تبقى في
  `lab/traccar/fanout-boot-*.log` و`lab/logs/fanout-recipient-tally.txt` (كلاهما git-ignored).
- كل أمر فاشل مذكور كما وقع، بنصّه.

---

## 1. حفظ قاعدة بوابة M0 أولاً (خطوة إلزامية)

نُسخَت قاعدة المعمل قبل أي لمس، وتُحقِّق النسخ بمجموع MD5 متطابق:

```bash
$ cp -r lab/traccar/lab-data lab/traccar/lab-data-gate-backup
$ md5sum lab/traccar/lab-data/database.mv.db lab/traccar/lab-data-gate-backup/database.mv.db
4175d5f2f7385d29f95948f555a650df *lab/traccar/lab-data/database.mv.db
4175d5f2f7385d29f95948f555a650df *lab/traccar/lab-data-gate-backup/database.mv.db
```

ثم فُرِّغ `lab-data` لإعادة تهيئة نظيفة، وحُفظ ناقل البوابة أيضاً قبل الكتابة فوقه:

```bash
$ rm -f lab/traccar/lab-data/*
$ cp lab/artifacts/events.ndjson lab/artifacts/events-gate-backup.ndjson   # 4868 bytes
```

**ملاحظة عن حالة القاعدة:** هذه الجولة عملت على قاعدة **مُعادة التهيئة** (ليست قاعدة البوابة).
نسخة البوابة محفوظة في `lab/traccar/lab-data-gate-backup/` ولم تُحذف. وأُعيد ملف
`lab/artifacts/events.ndjson` إلى محتواه الأصلي للبوابة بعد القياس (تطابق MD5)، ودليل هذه الجولة
نُقل إلى `lab/artifacts/events-fanout-2026-10-06.ndjson`. كلا المسارين git-ignored؛ لا شيء يُرفَع.

---

## 2. الإعداد الحيّ (الأوامر الحقيقية وناتجها)

المتغيّرات مُرِّرت من ملف بيئة محلي `lab/traccar/fanout.env` (تحت `lab/traccar/*` = git-ignored؛
تحقّق: `git check-ignore -v` أعاد `lab/.gitignore:5:traccar/*`). الأسماء المستعملة:
`LAB_ADMIN_EMAIL LAB_ADMIN_PASSWORD LAB_GUARDIAN2_EMAIL LAB_GUARDIAN2_PASSWORD
LAB_TELEGRAM_BOT_TOKEN LAB_TELEGRAM_CHAT_ID LAB_DEVICE_UNIQUE_ID LAB_API_URL LAB_SINK_HOST
LAB_FORWARD_PORT LAB_FORWARD_TOKEN LAB_OSMAND_HOST LAB_OSMAND_PORT` — كلُّها قيَم معملية تركيبية
(نطاق `.lab` غير قابل للتوجيه، إحداثيات حول 36.7538, 3.0588).

```bash
$ npm run lab:render
wrote ...\lab\traccar\kidguard-lab.xml (lab-only, gitignored)
$ npm run lab:check
config ok: ...\lab\traccar\kidguard-lab.template.xml
```

**تعديلان أُضيفا إلى المُولَّد فقط** (`lab/traccar/kidguard-lab.xml` — ملف git-ignored؛ القالب
المُتبَّع `kidguard-lab.template.xml` **لم يُمسَّ**)، لأن القياس يحتاج قناة رصد لا قناة تسليم:

```xml
<entry key='mail.debug'>true</entry>
<entry key='notificator.types'>web,mail</entry>
```

التسويغ من بايت كود النسخة المُثبَّتين (قُريء بأداة `javap` على `tracker-server.jar` المثبّت):

- `MainModule.provideMailManager`: إن كان `mail.debug` صحيحاً يُرجَع `LogMailManager`، وإلا
  `SmtpMailManager`. و`LogMailManager.getEmailEnabled()` يرجع `true` و`sendMessage` يسجّل
  `Email sent\nTo: {}\nSubject: {}\nAttachment: {}\nBody:\n{}` عند مستوي INFO — أي **لا مقبس SMTP
  ولا شبكة**. هذا هو جهاز الرصد: سطر واحد لكل مستقبِل اختاره الخادم.
- `Keys.NOTIFICATOR_TYPES` اسمه `notificator.types` وقيمته الافتراضية `web,mail,command`؛
  `NotificatorManager.getNotificator(id)` يرمي `Failed to get notificator <id>` إذا لم يكن النوع
  في هذه القائمة. ضبطه على `web,mail` يُبقي بريد-السجل عاملاً ويقطع أي محاولة تيليجرام خارجية.

**الحوض ثم الخادم ثم الانتظار حتى HTTP 200 (لا افتراض للجاهزية):**

```bash
$ LAB_FORWARD_PORT=5199 LAB_SINK_HOST=127.0.0.1 node lab/sink/sink.mjs
sink: http://127.0.0.1:5199/alert -> ...\lab\artifacts\events.ndjson

$ LAB_JAVA_BIN="/c/Program Files/Java/jdk-25.0.2/bin/java.exe" bash lab/traccar/run.sh \
    > lab/traccar/fanout-boot-A.log 2>&1 &
READY after 15 polls (HTTP 200)          # ~45 ثانية، استطلاع كل 3ث على /api/server
$ curl -s http://127.0.0.1:8082/api/server | ...
newServer=true registration=false version=6.16.0     # قاعدة نظيفة فعلاً
```

**التهيئة (`npm run lab:bootstrap`) — الناتج الحرفي، والـids منه قُرِئت ولا فُترضت**
(النسخة الكاملة في `lab/logs/bootstrap-fanout-run1.txt`؛ أُعيد تشغيلها مرّة ثانية فكانت كل الخطوات
`EXISTS` كما في `lab/logs/bootstrap-fanout-run2.txt`):

```
CREATED admin: id=1
EXISTS registration-off: already disabled
CREATED device: id=1
CREATED geofence-school: id=1 area=CIRCLE (36.7538 3.0588, 100)
CREATED geofence-walk-to-park: id=2 buffer=80
CREATED link-school: device 1 -> school 1
CREATED link-walk-to-park: device 1 -> walk-to-park 2
CREATED guardian-2: id=2
CREATED guardian-2-device: user 2 -> device 1
CREATED notification-geofenceExit: id=1 (owner 1 is linked automatically by BaseObjectResource:91-96)
CREATED notification-links: device 1 + guardian 2 -> notification 1 (2 linked)
```

**الids المقاسة: guardian-2 = `id=2`، سجل Notification = `id=1`، الجهاز = `id=1`، المنطقتان = `1` و`2`.**

طوبولوجيا الأذونات بعد التهيئة (`GET /api/permissions`، إداري، بمعلمتين مرتّبتين):

```
userId=1&notificationId=0      [{"USERID":1,"NOTIFICATIONID":1}]     # المدير مالك السجل
userId=2&notificationId=0      [{"USERID":2,"NOTIFICATIONID":1}]     # تصريح Notification للولي 2
deviceId=1&notificationId=0    [{"DEVICEID":1,"NOTIFICATIONID":1}]   # رابط الجهاز بالسجل
userId=1&deviceId=0            [{"USERID":1,"DEVICEID":1}]           # مشاركة الجهاز (المالك)
userId=2&deviceId=0            [{"USERID":2,"DEVICEID":1}]           # مشاركة الجهاز (الولي 2)
```

---

## 3. إثبات قابلية الرصد أولاً (قبل أي استنتاج)

ما **سُجِّل فعلاً** في هذه النسخة عن «من اختير»:

| القناة | ما يعطي | ما قيس |
|---|---|---|
| `GET /api/notifications` (حسب المستخدم) | **رؤية** السجل لا اختياره: الولي 2 يراه ما دام رابط `user->notification` موجوداً، ويصبح `[]` بعد حذفه | نعم — القسمان في `lab/logs/fanout-probe-observability.txt` و`lab/logs/fanout-condB-removed.txt` |
| `GET /api/notifications/types` | قائمة أنواع الأحداث (23)؛ **لا** تذكر المستقبلين ولا حتى القناة | نعم: `[{"type":"commandResult"},…{"type":"geofenceExit"}…]` HTTP 200 للإداري وللولي 2 |
| سجلّ الخادم (INFO) | سطر `Event id: …, type: …, notifications: N` لكل حدث (`= عدد السجلات المطبَّقة على الجهاز`)، وسطر `Email sent / To: …` **لكل مستقبِل اختير** | نعم، §4–§6 |
| قاعدة H2 مباشرة | جداول **إعداد** فقط: `TC_NOTIFICATIONS`, `TC_USER_NOTIFICATION`, `TC_DEVICE_NOTIFICATION`, `TC_GROUP_NOTIFICATION` | نعم، §7 |
| `TC_EVENTS` | **عمود مستقبِل واحد ولا عمود مستقبِلين إطلاقاً**: أعمده `ID, TYPE, EVENTTIME, DEVICEID, POSITIONID, GEOFENCEID, ATTRIBUTES, MAINTENANCEID` | نعم، §7 — أي أن القاعدة **لا** تخزّن «من أُخطر» |

**الخلاصة الأمانةَ:** لا يوجد سجل «مستقبِلون لكل حدث» في التخزين؛ السبيل الوحيد لمشاهدة مجموعة
المختارين هو سجلّ الخادم. لذلك استُعملت قناة `mail` الداخلية-السجلاّئة (`LogMailManager`)؛ وهي
تُطلِق سطرًا واحدًا لكل `User` اختاره `CacheManager.getNotificationUsers`، مع رسالة مبنية لكل مستخدم
(يفكّك فيها معيار `u` لمعرّف المستخدم). لم تُستنتج أي نتيجة من قراءة الكود وحدها: كل حكم أدناه له
سطر سجل مُقتبَس.

**محاولتان فشلتا وذكرتا كما وقعتا:**

1. قراءة نسخة الحوض أثناء عمل الخادم مرفوضة (قفل H2 حصري):
   ```
   $ cp lab-data/database.mv.db tmp-h2/snap.mv.db
   cp: error reading 'lab-data/database.mv.db': Device or resource busy
   ```
   ⇒ القراءة المباشرة أُجِّلت إلى ما **بعد** إيقاف الخادم (وقيلت كذلك، §7).
2. `GET /api/permissions` بالاتجاه المعكوس ما زال مكسوراً في 6.16.0 (موثّق أصلاً في `002-permission-shape.txt`)؛
   لم يُعَد استعماله.

---

## 4. الحالة «كما هُيِّئت» (notificators = `telegram,email`) — التفرّع لا يحدث إطلاقاً

أُعيد السيناريو على السجل كما أنشأته Task 5 (`notificators":"telegram,email"`، `always:false`):

```
2026-10-06 21:46:44  INFO: Event id: lab-child-1, time: 2026-10-06 21:46:41, type: geofenceExit, notifications: 1
2026-10-06 21:47:14  WARN: Event handler failed - 
java.lang.RuntimeException: java.lang.RuntimeException: Failed to get notificator telegram
	at org.traccar.database.NotificationManager.updateEvents(NotificationManager.java:184)
…
Caused by: java.lang.RuntimeException: Failed to get notificator telegram
	at org.traccar.notification.NotificatorManager.getNotificator(NotificatorManager.java:77)
	at org.traccar.database.NotificationManager.lambda$updateEvent$6(NotificationManager.java:145)
	at java.base/java.util.ImmutableCollections$Set12.forEach(ImmutableCollections.java:1122)
```

الحصيلة: `grep -c 'Email sent' lab/traccar/fanout-boot-A.log` = **0**. أي أن `notifications: 1`
تعني أن السجل طُبِّق على الجهاز، لكن التفرّع **مات عند أوّل معرّف قناة**. والسببان مقاسان:

- معرّف القناة في 6.16.0 هو `mail` لا `email`؛ و`getNotificatorsTypes()` تقسم حقل `notificators`
  حرفيّاً، فلا يطابق أي شيء.
- و`telegram` ليس ضمن `notificator.types` (افتراضي `web,mail,command`).

**نتيجة جانبية مهمة لصاحب القرار:** كما هو مكتوب في Task 5، سجل الإنذار لا يُطلِق أي قناة على هذه
النسخة — عيب تصحيح في `buildNotificationPayload`/خطوة 6، وليس شيئاً يُصلَح في هذا الملف.

ثم كشف المسار الصحيح للتحديث بالقياس: `PUT /api/notifications` (مجموعة) = **HTTP 405**
(`jakarta.ws.rs.NotAllowedException`)، و`PUT /api/notifications/1` = **HTTP 200** (النصّ في
`lab/logs/fanout-probe-observability.txt`). عُدِّل السجل إلى `"notificators":"mail"` وبقي `always:false`.

---

## 5. الحالة A (مشاركة الجهاز **و** تصريح Notification) — مستقبِلان من حدث واحد

`npm run lab:scenario -- school-exit --speed=1` (6 قراءات/150ث، والنسخة الكاملة في
`lab/logs/fanout-replay3-condA-mail.txt`)، ثم من `lab/traccar/fanout-boot-A2.log`:

```
2026-10-06 22:04:14  INFO: Event id: lab-child-1, time: 2026-10-06 22:04:11, type: geofenceExit, notifications: 1
2026-10-06 22:04:14  INFO: Email sent
To: lab-g***-2@***            # (مقنَّع) معرّف المستخدم في الرسالة: "u":2
Subject: lab-child-1: has exited geofence
…
2026-10-06 22:04:14  INFO: Email sent
To: lab-a***@***              # (مقنَّع) معرّف المستخدم في الرسالة: "u":1
Subject: lab-child-1: has exited geofence
```

الكتلة الكاملة (بنصّها) في `lab/logs/fanout-condA-email-block.txt`؛ منها يفكّك رمز unsubscribe لكل
رسالة ويعطي `{"i":…,"u":2,"e":"2026-10-13T21:04:14.570+00:00"}` للأولى و`"u":1`
و`…21:04:14.940+00:00` للثانية — أي مستقبِلان مختلفان، **في الثانية نفسها 22:04:14**، للحدث نفسه
(نوع الحدث `geofenceExit`، زمن الحدث 22:04:11، زمن الاختيار/الإرسال 22:04:14 ⇒ **+3ث**).

**مجموعة مستقبِلي الحالة A = {u:1 المدير، u:2 الولي الثاني} = وليّان لحدث واحد.**

---

## 6. الحالة B (مشاركة الجهاز فقط، بلا تصريح Notification) + ضابط عكسي

الحذف — **بجسم JSON** لأن نموذج المعلمتين في الاستعلام مرفوض:

```bash
# محاولة فاشلة (نصها كما وقع):
$ curl -X DELETE 'http://127.0.0.1:8082/api/permissions?userId=2&notificationId=1'
HTTP 400
java.lang.NullPointerException: Cannot invoke "java.util.LinkedHashMap.keySet()" because "entity" is null
	at org.traccar.api.resource.PermissionsResource.checkPermissionTypes(PermissionsResource.java:69)
	at org.traccar.api.resource.PermissionsResource.remove(PermissionsResource.java:119)
# ومحاولة بقلب ترتيب المعاملات -> نفس HTTP 400/NPE؛ والمصادقة كولي-2 -> نفس الخطأ (lab/logs/fanout-condB-delete-attempts.txt)

# الحذف الناجح: حذف واحد فقط، مع إبقاء مشاركة الجهاز وبقاء الروابط الأخرى:
$ curl -X DELETE -H 'content-type: application/json' -d '{"userId":2,"notificationId":1}' \
    'http://127.0.0.1:8082/api/permissions'
HTTP 204

userId=2&notificationId=0      []                                      # أُزيل
userId=2&deviceId=0            [{"USERID":2,"DEVICEID":1}]             # المشاركة باقية
deviceId=1&notificationId=0    [{"DEVICEID":1,"NOTIFICATIONID":1}]     # باقٍ
userId=1&notificationId=0      [{"USERID":1,"NOTIFICATIONID":1}]       # باقٍ
GET /api/notifications كولي-2 -> []                                     # فقد الرؤية أيضاً
```

القياس في الحالات الثلاث (كلّها بعد نفس الحذف، وقبل الضابط):

| # | الحالة | التوقيت في السجل | الحدث | مستقبِلون مقاسون |
|---|---|---|---|---|
| B-1 | رابط `user2->notification` محذوف، دون إعادة إقلاع | `22:11:49` (event 22:11:46، **+3ث**) | `geofenceExit, notifications: 1` | `u:1` فقط |
| B-2 | بعد إعادة إقلاع الخادم (استبعاد القراءة الراكدة) | `22:19:30` (event 22:19:19، +11ث) | `geofenceExit, notifications: 1` | `u:1` فقط |
| B-3 | إعادة قياس ثالثة بعد إقلاع آخر | `22:23:43` (event 22:23:38، +5ث) | `geofenceExit, notifications: 1` | `u:1` فقط |

السطور الحرفية:

```
lab/traccar/fanout-boot-A2.log:249: … 22:11:49  INFO: Event id: lab-child-1, time: … 22:11:46, type: geofenceExit, notifications: 1
lab/traccar/fanout-boot-A2.log:250: … 22:11:49  INFO: Email sent
lab/traccar/fanout-boot-A2.log:251: To: lab-a***@***        # "u":1
lab/traccar/fanout-boot-B.log:58:   … 22:19:22  INFO: Event id: …, type: geofenceExit, notifications: 1
lab/traccar/fanout-boot-B.log:60:   To: lab-a***@***        # "u":1
lab/traccar/fanout-boot-C.log:60:   To: lab-a***@***        # "u":1
```

**لا سطر `To:` للولي الثاني في أيٍّ من الثلاث.** الحصيلة الكاملة لكل الأسطر مفكوكة المعرّفات في
`lab/logs/fanout-recipient-tally.txt` (7 إرسالات: 5 بـ`u:1`، 2 بـ`u:2`).

**الضابط العكسي (في نفس عملية JVM، بلا إعادة إقلاع):** أُعيد الرابط ثم أُعيد السيناريو:

```
### CONTROL: re-add user2->notification1 (no restart) ###
POST HTTP 204
userId=2&notificationId=0      [{"USERID":2,"NOTIFICATIONID":1}]
…
2026-10-06 22:27:59  INFO: Event id: lab-child-1, time: 2026-10-06 22:27:56, type: geofenceExit, notifications: 1
2026-10-06 22:27:59  INFO: Email sent
To: lab-a***@***                 # "u":1
2026-10-06 22:27:59  INFO: Email sent
To: lab-g***-2@***               # "u":2
```

رجعت المجموعة إلى `{u:1, u:2}` بتغيير المتغيّر الواحد وحده ⇒ العلاقة سببية لا صدفة حالة القاعدة.

**الحالة D (رابط `Device -> Notification` محذوف وحده، مع إبقاء تصريح الوليّين):**

```
$ curl -X DELETE -H 'content-type: application/json' -d '{"deviceId":1,"notificationId":1}' … -> HTTP 204
deviceId=1&notificationId=0      []
userId=2&notificationId=0      [{"USERID":2,"NOTIFICATIONID":1}]   # تصريح الولي 2 موجود
2026-10-06 22:32:36  INFO: Event id: lab-child-1, time: 2026-10-06 22:32:33, type: geofenceExit, notifications: 0
```

`notifications: 0` و**صفر** سطر `Email sent`: لأن السجل `always:false`، فلا يُقيَّم أساساً على الجهاز
بلا ذلك الرابط (وهذا ما يوثّقه تعليق `bootstrap.mjs:161-163`، والآن مقاس).

---

## 7. قرار Step 3 من الجدول + قراءة H2 المباشرة

**السطر الثاني من جدول المهمة هو الصحيح على هذه النسخة:** *لا يستقبل الولي الثاني إلا بعد التصريح
على `Notification`*. القاعدة الحاسمة هي تقاطع `CacheManager.getNotificationUsers(notificationId, deviceId)`
(المصادر التي ذكرها Brief: `CacheManager.java:119-124`)، والقياس يُظهر أن التصريح **لازم**، وأن رابط
`Device -> Notification` **لازم** أيضاً لأن `always:false` (الحالة D). أي أن المواصفة §3 يجب أن
تُغلَق على أن كل وليّ يحتاج **رابطَين** لا واحدًا: `user->device` (مشاركة) **و** `user->notification`
(تصريح)، مع `device->notification`. لا نتيجة null: المتغيّرة الوحيدة عكست النتيجة في الاتجاهين
(B ⇒ وليّ واحد؛ الضابط ⇒ وليّان).

قراءة H2 مباشرة بعد إيقاف الخادم (نسخة ملف + `org.h2.tools.RunScript`؛ لم تعمل أثناء التشغيل — §3):

```
$ cp lab-data/database.mv.db tmp-h2/snap.mv.db
$ java -cp lib/h2-2.5.252.jar org.h2.tools.RunScript -url "jdbc:h2:./tmp-h2/snap" -user sa -script tmp-h2/q3.sql -showResults
SELECT id, type, always, notificators, description FROM tc_notifications ORDER BY id;
--> 1 geofenceExit FALSE mail lab-geofenceExit
SELECT userid, notificationid FROM tc_user_notification ORDER BY userid;
--> 1 1                                   # الولي 2 مفقود: الحالة B مثبتة على القرص
SELECT deviceid, notificationid FROM tc_device_notification ORDER BY deviceid;
--> 1 1
SELECT userid, deviceid FROM tc_user_device ORDER BY userid;
--> 1 1
--> 2 1                                   # المشاركة بقيت
SELECT id, name, email, administrator FROM tc_users ORDER BY id;
--> 1 lab-admin     lab-a***@***  TRUE
--> 2 lab-guardian-2 lab-g***-2@*** FALSE
SELECT COUNT(*) AS event_rows FROM tc_events; --> 11
SELECT type, COUNT(*) FROM tc_events GROUP BY type;
--> deviceMoving 1 / deviceStopped 1 / geofenceEnter 5 / geofenceExit 4
SELECT column_name FROM information_schema.columns WHERE table_name='TC_EVENTS';
--> ID TYPE EVENTTIME DEVICEID POSITIONID GEOFENCEID ATTRIBUTES MAINTENANCEID   # لا عمود مستقبِل
SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%NOTIF%';
--> TC_GROUP_NOTIFICATION TC_DEVICE_NOTIFICATION TC_NOTIFICATIONS TC_USER_NOTIFICATION
```

(النصّ الكامل في `lab/logs/fanout-h2-dump-condB.txt`؛ مجلّد النسخة أُزيل بعد القراءة.)

---

## 8. NOT RUN — لم يُشتغَل (يتطلب بيانات المالك الحقيقية، ولا يجوز ادّعاؤه)

| البند | الحالة | السبب في سطر واحد |
|---|---|---|
| تسليم تيليجرام فعلي لوليَّين | **NOT RUN** | لا يوجد توكن حقيقي: `123456:FAKE-LAB-BOT-TOKEN`، و`notificator.types` ضُبِط على `web,mail` فمُنعت أي محاولة خارجية عمداً |
| `POST /api/notifications/test/telegram` (Step 1 من Brief) | **NOT RUN** | يستدعي `api.telegram.org` بتوكن مزيف؛ المالك لم يُعطِ توكن/Chat id صالحاً |
| `PUT /api/users/2` بـ`telegramChatId` حقيقي (Step 2) | **NOT RUN** | لا يوجد Chat id حقيقي لوليّ ثانٍ؛ لم تُختلَق قيمة |
| تسليم بريد فعلي (SMTP + App Password) | **NOT RUN** | `mail.smtp.host` فارغ في القالب، ولا حساب تطبيقي من المالك؛ البريد المستعمل هنا مُنفِّذ سجلي داخلي (`mail.debug=true`) لا يسلم شيئاً |
| لقطات بشريط الساعة (هاتفان/شاشة تيليجرام) | **NOT RUN** | لا أجهزة ولا قناة خارجية في هذا الجزء؛ لا لقطة زائفة |
| إثبات التوازي (تسليم متزامن لوليَّين) | **NOT RUN** | ما قيس هو توقيت **اختيار** الخادم للمستقبِلين في سطرَي سجلّ عند `22:04:14` لنفس الحدث (فرق 370ms بين فكّ رمزين)؛ وهذا تسلسل بناء حلقة داخلية على قناة سجلّ داخلية، **لا** إثبات وصول متزامن عبر قناة حقيقية |
| push / FCM | **NOT RUN** | لا خدمة Firebase مهيَّأة في M0 (`notificator.firebase.*` فارغة) |
| SMS / اتصال صوتي | **خارج M0** | بقرار المالك (§5.6)؛ تُذكر كواجهة M2 لا كإثبات |
| اختبار من مضيف ثانٍ/شبكة حقيقية | **NOT RUN** | لا Docker ولا CI ولا خادم ثانٍ على هذا الجهاز (كما في `004-security.txt`) |

---

## 9. شذوذ مقاس ومخاوف يقرّر فيها المالك/المشرف

1. **كتابات تضيع عند القتل القسري للخادم (مرتان، مقاستان).** `PUT /api/notifications/1` عند ~21:52
   رجع `HTTP 200` وقرأ `GET` القيمة `"mail"`، وبعد `Stop-Process -Force` + إقلاع جديد قرأ `GET`
   `"telegram,email"`؛ ومثلها `POST /permissions` (رابط الولي 2) عند ~22:21 رجع `204` و`GET` رآه،
   ثم بعد إعادة إقلاع كان `[]`. وفي المحاولة الثالثة نجحت الكتابة وعبرت الإقلاع (قرص H2 أظهر `mail`).
   الخلاصة العملية: هذا شذوذ تحمّل/إغلاق لا علاقة له بالتفرّع، لكنه يُبطل أي قياس بعد إقلاع لم
   يُتحقَّق منه. **العمل المستعمل:** بعد كل إقلاع، أعِِد قراءة السجل والطوبولوجيا بالـAPI (وإن لزم
   أعِد الـPUT) **قبل** القياس — وهو ما فُعِل في §6 (B-2) والضابط. يوصى بإيقاف ناعم بدل `-Force`
   في بوابات لاحقة.
2. **تسريب إحداثيات تركيبية إلى geocoder خارجي.** السجل أظهر أن الخادم حلّ عنواناً فعلياً من
   جغرافيا تركيبية: `Point: …Boulevard Nacera Nounou, Algiers, Algiers, DZ` داخل متن الرسالة، أي
   أن `geocoder` الافتراضي (nominatim) استُدعي خارجياً. لا يمنع هذا القياس، لكن قبل VPS/الإنتاج
   يوصى بـ`geocoder.enable=false` أو geocoder محلي — في منتج أمان أطفال هذا تسريب موقع.
3. **عيب في Task 5 (§4 أعلاه) — أُصلِح بعد هذا القياس:** `notificators":"telegram,email"` كان لا
   يُطلِق شيئاً على 6.16.0 (المعرّف الصحيح `mail`، و`telegram` خارج `notificator.types` افتراضياً)،
   أي أن «التفرّع لكل الأولياء» لم يكن يعمل كما هُيِّئت البوابة. أُصلِح بـ`LAB_NOTIFICATORS = 'mail'`
   في `lab/scripts/bootstrap.mjs`، وبمثبَّتَين في القالب: `notificator.types = web,mail` (يمنع أي
   محاولة خارجية على تيليجرام) و`mail.debug = true` (مرصد داخل JVM بلا مقبس SMTP)، وبحكم ثبات
   مُختبَر في `lab/tests/api.test.mjs` («every notificator the lab provisions is one the server is
   configured to resolve») يرفض كل معرّف ليس ضمن `notificator.types` ويرفض `email` تحديداً.
   المجموعة: `tests 87 / pass 87 / fail 0`.
4. **اختبار في مجموعة Lab كان يعتمد على ملف git-ignored — أُصلِح:** «report CLI re-renders the M0
   gate evidence» كان يقرأ `lab/artifacts/events.ndjson`، و`lab/.gitignore` يستثني `artifacts/`
   بالكامل، فكان دليل البوابة محليّاً على هذا الجهاز فقط ولا يعمل في CI. ثُبِّت نسخة مُتحكَّبان بها
   في `lab/fixtures/gate-events.ndjson` (MD5 مطابق لناقل البوابة المحفوظ) وأُعيد الاختبار ليشير
   إليها. يبقى ناقل `lab/artifacts/` حالة تشغيل غير مُتتبَّعة كما هو مقصود.
5. **`DELETE /api/permissions` لا يقبل صيغة الاستعلام** (§6) — أي كود مستقبلي للحذف يجب أن يرسل
   جسم JSON `{ownerKey:id, propertyKey:id}`.

---

## 10. الاختبارات والتنظيف (أرقام حقيقية)

لم يُمسَّ أي كود تحت `lab/` في هذا الجزء (التعديل الوحيد كان على ملف إعداد **مولَّد** git-ignored،
§2). أُعيد تشغيل المجموعة للتوثيق، من جذر المستودع وبصيغة الـglob المقتبسة الوحيدة الآمنة:

```
$ node --test "lab/tests/*.test.mjs"
ℹ tests 86
ℹ suites 0
ℹ pass 86
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

(مطابق للأساس 86/86/0؛ النصّ في `lab/logs/fanout-tests-summary.txt`. أُعيد بعد استعادة
`lab/artifacts/events.ndjson` إلى محتوى البوابة لأن §9.4.)

الإيقاف والتحقّق:

```
$ netstat -ano | grep -E ':(8082|5055|5199)' | grep LISTENING || echo "ALL LAB PORTS CLOSED (8082/5055/5199)"
ALL LAB PORTS CLOSED (8082/5055/5199)
$ powershell -NoProfile -Command "(Get-Process java -ErrorAction SilentlyContinue | Measure-Object).Count"
0
```

وأُزيل مجلّد النسخة `lab/traccar/tmp-h2`. الأثر المُستقبَل للقياس (كلّه git-ignored):
`lab/traccar/fanout-boot-{A,A2,B,C}.log`, `lab/traccar/fanout.env`, `lab/traccar/kidguard-lab.xml`,
`lab/artifacts/events-fanout-2026-10-06.ndjson`, و`lab/logs/fanout-*.txt`.

---

## 11. خلاصة في أسطر

- مشاركة الجهاز **وحدها لا تكفي**: بحذف `user2->notification` فقط بقي مدير واحد مستقبِلاً، وزال
  الولي الثاني (3 قياسات متكررة، إحداها بعد إقلاع)، وعاد بمعاودة الرابط (ضابط في نفس JVM).
- الحدث `geofenceExit` واحد اختار **وليَّين** في الحالة A وسجّلهما الخادم في الثانية نفسها `22:04:14`.
- `device->notification` لازم أيضاً (`always:false`): بدونه `notifications: 0` ولا أي مستقبِل.
- التسليم الحقيقي (تيليجرام/بريد/لقطات/توازي/push) = **NOT RUN** بانتظار بيانات المالك.
