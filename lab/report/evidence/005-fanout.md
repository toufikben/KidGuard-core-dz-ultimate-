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

**أُضيف التعديلان أثناء القياس إلى المُولَّد** (`lab/traccar/kidguard-lab.xml` — ملف git-ignored)
لأن القياس يحتاج قناة رصد لا قناة تسليم:

```xml
<entry key='mail.debug'>true</entry>
<entry key='notificator.types'>web,mail</entry>
```

**ثم نُقِلا إلى القالب المُتبَّع بعد القياس** ضمن إصلاح العيب R34 (§9.3)، فـ**هذا الالتزام يُغيّر
القالب** `lab/traccar/kidguard-lab.template.xml:20-34`. لا يُطلب إعادة توليد لتثبيت القياس لأن
القياس سبق النقل؛ لكن أي تشغيل لاحق لنفس القالب يعطي نفس الإعداد حرفيّاً (تحقّق: `grep -n
'mail.debug\|notificator.types' lab/traccar/kidguard-lab.xml`). قائمة ملفات git المُتبَّعة التي
مَسَّها هذا الالتزام هي في §10، وهي ليست «لا شيء».

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
# حلقة استطلاع /api/server كل 3ث حتى HTTP 200 (15 استطلاعاً، ~45ث) — خرجَ على الطرفية فقط،
# غير محفوظ في أثر؛ المُحفوظ المطابق لها في نفس السجل:
$ grep -n "Started oejs.Server" lab/traccar/fanout-boot-A.log
293:2026-10-06 21:39:11  INFO: Started oejs.ServerConnector@7af56b26{HTTP/1.1, (http/1.1)}{tempuri.org:8082}
294:2026-10-06 21:39:11  INFO: Started oejs.Server@3ea6faf0{STARTING}[12.1.13,sto=0] @14865ms
$ curl -s http://127.0.0.1:8082/api/server | ...
newServer=true registration=false version=6.16.0     # قراءة الطرفية؛ لم يُحفَظ مخرجها، لكن
                                                     # دلالتها مؤكَّدة بما حُفظ: bootstrap على قاعدة
                                                     # نظيفة أعطى CREATED admin: id=1 (وهو يفشل
                                                     # EXISTS لو كان المستخدم موجوداً)
```

(هذه السطور تُقرأ من الأثر المُحفَظ لا من الذاكرة: `lab/traccar/fanout-boot-A.log:9` للإصدار 6.16.0
و`:293-294` لبدء المستمع على 8082، فسطر `Started oejs.ServerConnector…8082` هو دليل الجاهزية المحفوظ.
وملاحظة R31 تنطبق هنا: لا سطر `web: http://127.0.0.1:8082` في سجل 6.16.0، فالمُعادِل الحقيقي هو
`ServerConnector…{tempuri.org:8082}`.)

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
بلا ذلك الرابط (وهذا ما يوثّقه تعليق `bootstrap.mjs:166-169`، والآن مقاس).

---

## 6b. الحالة E — الاتجاه المعكوس: تصريح `Notification` باقٍ، ومشاركة الجهاز محذوفة

**لماذا هذا القياس موجود:** مراجعة مستقلة على الالتزام `90cb465` وجدت أن §7 يدّعي «لا شيء من
الرابطَين يكفي وحده» بينما القياس الذي جرى اتجاهٌ واحد فقط (حذف التصريح مع إبقاء المشاركة).
النصف الثاني كان سيستند إلى دلالة كود `CacheManager` وحده، وهذا يخالف قاعدة §0. فأُجري القياس
الناقص قبل اعتماد النتيجة.

الحذف — بجسم JSON، وحذف **مشاركة الجهاز** وحدها هذه المرّة:

```bash
$ curl -X DELETE -H 'content-type: application/json' -d '{"userId":2,"deviceId":1}' \
    'http://127.0.0.1:8082/api/permissions'
DELETE HTTP 204
userId=2&notificationId=0      [{"USERID":2,"NOTIFICATIONID":1}]   # التصريح باقٍ
userId=2&deviceId=0            []                                  # المشاركة محذوفة
deviceId=1&notificationId=0    [{"DEVICEID":1,"NOTIFICATIONID":1}] # باقٍ
userId=1&notificationId=0      [{"USERID":1,"NOTIFICATIONID":1}]   # باقٍ
userId=1&deviceId=0            [{"USERID":1,"DEVICEID":1}]         # باقٍ
GET /api/devices كولي-2        []
GET /api/notifications كولي-2  [{"id":1,…,"type":"geofenceExit","notificators":"mail"}]
```

(النصّ الحرفي: `lab/logs/fanout-condE-state-before.txt` و`fanout-condE-state-after.txt`. لاحظ أن
الولي الثاني **ما زال يرى سجل التنبيه** ويملك التصريح، ولا يرى الجهاز — هذه بالضبط فرضية «التصريح
وحده».)

ثم أُعيد السيناريو نفسه (`lab/logs/fanout-replay9-condE.txt`) وقُرئ سجلّ الخادم
(`lab/traccar/fanout-boot-E.log`) بنفس طريقة §5 — معرّف المستقبِل من رمز unsubscribe لا من نص
الرسالة:

```
2026-10-06 23:45:23  INFO: Event id: lab-child-1, time: 2026-10-06 23:41:41, type: geofenceExit, notifications: 1
2026-10-06 23:47:17  INFO: Email sent
To: lab-a***@***                 # "u":1 (المدير) — السطر 264
```

**تقييد لازم بعد المراجعة الثانية:** ملف السجل `fanout-boot-E.log` يحمل **ثلاثة** أسطر `Email sent`
في الإجمالي (الأسطر 264 و304 و321)، والسطران الأخيران يعودان إلى الضابط أدناه في هذه الفقرة (نفس
عملية JVM، نفس الملف). فعبارة «ولا سطر آخر في كامل السجل» كانت خاطئة كما كُتبت، والصحيح المقاس: **في
مقطع تشغيل E (الأسطر 44–283، قبل الضابط عند `23:52`) لا يوجد سطر `Email sent` غير السطر 264**، وأثر
العدّ `fanout-condE-recipient-tally.txt` يفكّ رموز ذلك المقطع فقط (سطر واحد ⇒ `{u:1}`)، لا الملف كله.

فكّ رموز unsubscribe في مقطع تشغيل E يعطي `{u:1}` فقط ⇒ **التصريح وحده لا يجعل الولي الثاني
مستقبِلاً.** الآن الاتجاهان مقاسان: حذف التصريح مع إبقاء
المشاركة أعطى `{u:1}` (§6)، وحذف المشاركة مع إبقاء التصريح أعطى `{u:1}` (هنا)، والاجتماع أعطى
`{u:1,u:2}` (§5). أي أن علاقة الخادم هي **تقاطع** الرابطَين فعلاً، لا قراءة كود.

**ضابط الحالة E (نفس عملية JVM، بلا إعادة إقلاع):** أُعيد `user2 -> device1` وحده (§6b
الأثر `fanout-condE-control-restore.txt`: POST HTTP 204 ثم الطوبولوجيا كاملة) وأُعيد السيناريو
(`fanout-replay10-condE-control.txt`)، فالنصّ من سجلّ الخادم في `fanout-condE-control-email-block.txt`:

```
2026-10-06 23:52:42  INFO: Event id: lab-child-1, time: 2026-10-06 23:52:39, type: geofenceExit, notifications: 1
2026-10-06 23:52:43  INFO: Email sent
To: lab-a***@***                 # "u":1
2026-10-06 23:52:43  INFO: Email sent
To: lab-g***-2@***               # "u":2
```

رجعت المجموعة إلى `{u:1,u:2}` برابط واحد فقط ⇒ الاتجاه مقاس من الحذف والإرجاع معاً، ك§6 تماماً.

**وحدثا هذا التشغيل بلغا الحوض فعلاً** رغم أن الخادم سجلّ «فشل التمرير» لهما (`eventId` 98 خروج
و97 دخول، في `lab/artifacts/events-condE-2026-10-06.ndjson`) — القراءة الكاملة في
`lab/logs/fanout-condE-sink-receipt.txt`، وما يعنيه ذلك للإنتاج مسجَّل كشذوذ §9.6.

**أثر جانبي مقاس في هذا التشغيل، وهو أهم من التوقيت:** اختيار المستقبِلين لم يُسجَّل إلا بعد
**114 ثانية** من سطر الحدث (`23:45:23` → `23:47:17`)، بينما كان `+3ث` في §5 و§6. السبب في نفس
السجل: نداء الـgeocoder الخارجي إلى nominatim فشل بعد انتظار TLS طويل
(`SSLHandshakeException: Remote host terminated the handshake`، السطر 131 من نفس الملف)، ونصّ
الرسالة رجع إلى الإحداثيات الخام بدل العنوان (`Point: … 36.75475°, 3.05955°`). أي أن **تسليم
الإنذار معطَّل على نداء شبكة خارجي في نفس الخيط**: في منطقة لا يُبلَغ فيها nominatim يتأخر
الإنذار دقائق. والضابط في نفس السجل، بعد رابط واحد مستعاد وبدون إعادة إقلاع، أعاد `+4ث`
(`23:52:39` → `23:52:43`) حين رجعت الجيرجودر عنواناً — فالتأخير تابع لنداء الجيرجودر لا لطوبولوجيا
الروابط. هذا يُصلّب التوصية السابقة (§9.2) من «تسريب موقع» إلى «تسريب موقع + زمن تسليم غير
محدود»: `geocoder.enable=false` أو جيرجودر محلي شرط قبل أي تشغيل حقيقي، ويُقاس زمن التسليم بدونه
في الجزء B أو في مهمة الاستضافة. (لم يُقَس هنا مع geocoder معطَّل لأن ذلك يغيّر إعداد الخادم بعد
اكتمال قياس الجزء A، وهو خارج ما طُلب من هذا الجزء.)

---

## 7. قرار Step 3 من الجدول + قراءة H2 المباشرة

**السطر الثاني من جدول المهمة هو الصحيح على هذه النسخة:** *لا يستقبل الولي الثاني إلا بعد التصريح
على `Notification`*. مرشّح الخادم هو تقاطع `CacheManager.getNotificationUsers(notificationId, deviceId)`
(المصادر التي ذكرها Brief: `CacheManager.java:119-124`)، و**التقاطع قيس من الاتجاهين لا من قراءة
الكود**: حذف التصريح مع بقاء المشاركة ⇒ وليّ واحد (§6)، وحذف المشاركة مع بقاء التصريح ⇒ وليّ واحد
(§6b، حالة E)، والاجتماع ⇒ وليّان (§5)، وإرجاع الرابط المحذوف وحده في نفس عملية JVM يعيد الزوج (§6
ضابط، §6b ضابط). وأُضيف أن رابط `Device -> Notification` **لازم** أيضاً لأن `always:false` (الحالة
D). أي أن المواصفة §3 يجب أن تُغلَق على أن كل وليّ يحتاج **رابطَين** لا واحدًا: `user->device`
(مشاركة) **و** `user->notification` (تصريح)، مع `device->notification`. لا نتيجة null: في كل حالة
كان المتغيّر واحداً والنتيجة انعكست بعكسه.

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
SELECT column_name FROM information_schema.columns WHERE table_name='TC_EVENTS';
--> ID TYPE EVENTTIME DEVICEID POSITIONID GEOFENCEID ATTRIBUTES MAINTENANCEID   # لا عمود مستقبِل
SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%NOTIF%';
--> TC_GROUP_NOTIFICATION TC_DEVICE_NOTIFICATION TC_NOTIFICATIONS TC_USER_NOTIFICATION
```

(النصّ الكامل في `lab/logs/fanout-h2-dump-condB.txt`؛ مجلّد النسخة أُزيل بعد القراءة.)

**تصحيح صريح بعد المراجعة المستقلة (خطأ في هذه الوثيقة أصلاً):** هذا الملف المحفوظ **لا يحتوي**
أعداد صفّوف الأحداث ولا توزيعها بالنوع؛ الاستعلام عن `tc_events` في ذلك الأثر **فشل** لأن العمود
مكتوب `eventid`، والنصّ الحرفي من الأثر (`fanout-h2-dump-condB.txt:18-19`):

```
SELECT eventid, type, eventtime FROM tc_events ORDER BY eventid;Exception in thread "main"
org.h2.jdbc.JdbcSQLSyntaxErrorException: Column "EVENTID" not found; SQL statement: [42122-252]
```

**تصحيح ثانٍ على wording المراجعة الأولى (خطأ آخر هنا):** قلنا إن هذا الخطأ «أوقف `RunScript`» — وهذا
غير صحيح. `org.h2.tools.RunScript` لا يتوقف افتراضياً عند الخطأ؛ الأثر نفسه يثبت أنه **واصل** بعد
الاستثناء وطبع بقية السكربت: الأسطر 43–50 قائمة أعمدة `TC_EVENTS`، والسطر 51 `--> 4`، والأسطر 52–55
أسماء الجداول الأربعة التي تنتهي بـ`NOTIF`. فالسبب الحقيقي لغياب العدد عن ذلك الأثر أبسط: **استعلام
العدّ لم يكن مكتوباً في ذلك السكربت أصلاً**، لا أنه قُطع. (الفرق يهم: من يقرأ الأثر سيظن أن الأداة
انهارت، والحقيقة أن السكربت اكتمل ناقصاً.)

العمود اسمه `ID` لا `EVENTID` (§7 نفسه يذكر أعمدة الجدول أعلاه)، فالفشل من طرفنا لا من الخادم.
**الأرقام التي كانت مكتوبة هنا (`event_rows = 11` وتوزيع `5/4/1/1`) مسحوبة: لم تكن مخرجات أي أثر
محفوظ، ولا يجوز الاستشهاد بها.** أُعيد الاستعلام صحيحاً على نسخة من قاعدة الحالة النهائية بعد
انتهاء الجزء A (قبل أي قياس إضافي)، والمخرجات محفوظة في `lab/logs/fanout-h2-events-final.txt`:

```
$ cp lab-data/database.mv.db tmp-h2-e/snap.mv.db
$ java -cp lib/h2-2.5.252.jar org.h2.tools.RunScript -url "jdbc:h2:./tmp-h2-e/snap" -user sa -script tmp-h2-e/q.sql -showResults
SELECT COUNT(*) AS event_rows FROM tc_events;
--> 17
SELECT type, COUNT(*) AS n FROM tc_events GROUP BY type ORDER BY type;
--> deviceMoving 1 / deviceStopped 1 / geofenceEnter 8 / geofenceExit 7
```

**وعلى الـMD5 الذي استُشهد في المراجعة الأولى: مسحوب هو الآخر.** كان مكتوب هنا أن نسخة القراءة
والأصل تطابقا عند `3cbce2e84ad3088dbfa0a620c70b6f69`، ولا أثر محفوظ يحمل هذا الحرف، ومجلّد
`tmp-h2-e` حُذف بعد القراءة، فالتحقّق منه غير ممكن. الأرقام نفسها (17 والتوزيع `1/1/8/7`) تبقى
موثّقة بـ`fanout-h2-events-final.txt`؛ الذي لم يكن موثّقاً هو فحص النسخة نفسه، فأُعيدت قياسه الآن
ونُقلت المخرجات إلى `lab/logs/fanout-h2-fixround2-recount.txt`: النسخة مطابقة للأصل **قبل** القراءة
(`e3ac1aeca09d0ed69825c97ebb3c7b6c` للطرفين)، والملف الحيّ لم يتغيّر **بعدَها** (تتغيّر النسخة فقط
لأن فتح ملف H2 يعيد تنفيذ سجلّه)، والقاعدة في حالتها النهائية الآن **21 صفاً** (`1/1/10/9`) — أي
نموّ 17 ← 21 بأربعة صفوف §6b، كما يذكر §10؛ والأثر نفسه يسجّل أيضاً فخّ المسار الذي وقّع فيه
القياس (`jdbc:h2:/tmp/...` تحت Git Bash يفتح قاعدة **فارغة** بصمت بدل أن يقرأ النسخة).

هذه **حصيلة القاعدة التراكمية لكل تشغيلات الجزء A** — ثمانية تشغيلات، لا حصيلة الحالة B وحدها.
التوقيتات في نفس الأثر تُنسِب كل صفّوف إلى حالته: `21:45:11` (دخولان: منطقة المدرسة + مسار
المشي، تشغيل المُهيَّأ) و`21:46:11` `deviceMoving` و`21:46:41` exit (نفس التشغيل) و`21:57:25` +
`21:58:55` (`deviceStopped` وexit، الحالة A أولى) و`22:02:41` + `22:04:11` (A المُقاسة بمستقبِلَين)
و`22:10:16` + `22:11:46` (B-1) و`22:22:08` + `22:23:38` (B-3) و`22:26:26` + `22:27:56` (الضابط)
و`22:31:03` + `22:32:33` (D). **وملاحظة مهمة عن البند (a) في §9:** لا صفّ في القاعدة لتشغيل الحالة
B-2 كلّه (الدخول `22:17:49` والخروج `22:19:19`) — القوائم أعلاه تقفز من `22:11:46` إلى `22:22:08`.
السجل والـforward والحوض أثبتوا وقوع الحدث، فالصفّوف ضائعة مع الكتابة عند الإيقاف القسري، لا أن
الحدث لم يحدث. القياس المعتمد للمستقبِلين يقرأ **سجل الخادم** لا جدول الأحداث، فلا تأثير لهذا
الضياع على نتيجة §5–§6؛ لكنه دليل إضافي على أن الإيقاف بـ`-Force` يُفقد كتابات، وأن أي بوابة لاحقة
يجب أن تعتمد القراءة من السجل أو إيقافاً ناعماً.

---

## 8. NOT RUN — لم يُشتغَل (يتطلب بيانات المالك الحقيقية، ولا يجوز ادّعاؤه)

| البند | الحالة | السبب في سطر واحد |
|---|---|---|
| تسليم تيليجرام فعلي لوليَّين | **NOT RUN** | لا يوجد توكن حقيقي: `123456:FAKE-LAB-BOT-TOKEN`، و`notificator.types` ضُبِط على `web,mail` فمُنعت أي محاولة خارجية عمداً |
| `POST /api/notifications/test/telegram` (Step 1 من Brief) | **NOT RUN** | يستدعي `api.telegram.org` بتوكن مزيف؛ المالك لم يُعطِ توكن/Chat id صالحاً |
| `PUT /api/users/2` بـ`telegramChatId` حقيقي (Step 2) | **NOT RUN** | لا يوجد Chat id حقيقي لوليّ ثانٍ؛ لم تُختلَق قيمة |
| تسليم بريد فعلي (SMTP + App Password) | **NOT RUN** | `mail.smtp.host` فارغ في القالب، ولا حساب تطبيقي من المالك؛ والبريد المستعمل هنا مُنفِّذ سجلي داخلي لا يسلم شيئاً. **قبل أي اختبار تسليم حقيقي يجب قلب `mail.debug` إلى `false`** (القالب المُتبَّع سطر 34 يحمل هذا التحذير الآن): ما دام `true` فسيسجّل الخادم `Email sent / To:` لكل مستقبِل اختاره وهو لم يرسل شيئاً، فتكون تلك السطور جاهزة لقراءة PASS زائف |
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
   في بوابات لاحقة. دليل إضافي من §6b: صفّا حدث B-2 فُقدا من `tc_events` (§7) بينما كُتبت كتابات
   E والضابط وعبرت الإيقاف القسري (`lab/logs/fanout-condE-h2-persistence.txt`) — أي أن الفقد
   متقطّع لا حتمي، فلا تُعلَّق بوابة على قراءة القرص وحدها.
2. **تسريب إحداثيات تركيبية إلى geocoder خارجي + زمن تسليم غير محدود.** السجل أظهر أن الخادم حلّ
   عنواناً فعلياً من جغرافيا تركيبية: `Point: …Boulevard Nacera Nounou, Algiers, Algiers, DZ` داخل
   متن الرسالة، أي أن `geocoder` الافتراضي (nominatim) استُدعي خارجياً. وقياس §6b أظهر الوجه
   الثاني لنفس النداء: حين فشل TLS (`SSLHandshakeException`) تأخر سطر اختيار المستقبِلين من `+3ث`
   إلى `+114ث`. في منتج أمان أطفال هذا **تسريب موقع + إنذار يتأخر بدقائق** معاً؛ قبل VPS/الإنتاج
   يوصى بـ`geocoder.enable=false` أو geocoder محلي، ويُقاس زمن التسليم بدونه (جزء B / مهمة
   الاستضافة).
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
   في `lab/fixtures/gate-events.ndjson` وأُعيد الاختبار ليشير إليها (المطابقة مقاسة ومحفوظة في
   `lab/logs/fanout-carrier-md5.txt`: MD5 واحد للناقل والـfixture
   `8c9bc25076c3ebb69eae8a8bbd88a760` و10 أسطر في كلٍّ منهما). يبقى ناقل `lab/artifacts/` حالة
   تشغيل غير مُتتبَّعة كما هو مقصود.
5. **`DELETE /api/permissions` لا يقبل صيغة الاستعلام** (§6) — أي كود مستقبلي للحذف يجب أن يرسل
   جسم JSON `{ownerKey:id, propertyKey:id}`.
6. **«فشل التمرير» المُعلَن قد يكون تسليماً ناجحاً — مقاس في §6b، وللمالك/المشرف.** سجلّ الخادم قال
   مرتين `Event forwarding failed` (`fanout-boot-E.log:60 و:95`) والسبب `SocketTimeoutException: Read
   timed out` بعد 16–23 ث من إنشائي الحدثَين، بينما الحوض كان قد كتب السجلَّين فعلاً بعد 18.9 ث و20.2 ث من
   تخلّي الخادم (`22:45:57.887Z` و`22:45:59.233Z`). أي أن **سطر «فشل» في هذا المسار لا يثبت أن
   الإنذار لم يصل، وسطر «نجح» لا يوجد أصلاً بلا قراءة الرد** — فلو كان الحوض خلف شبكة أبطأ، سيكون
   عندنا سجلّ تحذيرات عن تنبيهات مُسلَّمة، وأخطر من ذلك: أي منطق لاحق «أعد الإرسال عند الفشل» سيقرأ
   هذا فشلاً **فيُرسل الإنذار مرّتين للأهل**. المطلوب قبل الإنتاج: (أ) زمن انتظار قابل للضبط
   لـ`event.forward`، (ب) معرّف حدث في الرأس/الرد يُتحقَّق منه بدل الاعتماد على نجاح HTTP، (ج) منع
   التكرار بمعرّف الحدث. سبب بطء ردّ الحوض على هذا الجهاز **لم يُقَس** (نواتان + HDD + نفس الجهاز
   ينفّذ إعادة السيناريو) — يبقى بنداً مفتوحاً يُقاس في مهمة الاستضافة أو الجزء B.
7. **موارد الحوض بعد §6b — تسمية تُضلّل إن لم تُقرأ:** `lab/artifacts/events-condE-2026-10-06.ndjson`
   نسخة الناقل كاملة (14 سطراً = صفوف البوابة 1–10 + أربعة من §6b) لا سطور الحالة E وحدها، و
   `lab/logs/fanout-condE-sink-records.txt` كان سطرُه الأول يقول «سجلّان»؛ صُحّح بأعلى نفس الملف
   بتاريخ اليوم بدل حذفه، لأن الأثر الأصلي جزء من سجلّ القياس.

---

## 10. الاختبارات والتنظيف (أرقام حقيقية)

**تصحيحات الجولة الثانية من المراجعة (2026-10-07) — ما تغيّر في كلام هذه الوثيقة لا في قياسها:**

| ما كان مكتوباً | الصحيح المقاس | أين |
|---|---|---|
| «ولا سطر `Email sent` آخر في كامل السجل» | ثلاثة أسطر في الملف؛ السطران الأخيران من الضابط. الصواب مقصور على مقطع تشغيل E (الأسطر 44–283) | §6b |
| «الاستعلام فشل **وأوقف** `RunScript`» | الأداة واصلت بعد الخطأ وطبعت بقية السكربت (الأسطر 43–55)؛ العدد غائب لأن استعلام العدّ لم يكن في السكربت | §7 |
| «تشغيل E الأول لم يبلغ الحوض أصلاً» | بلغه: صفّا `eventId=98/97` مكتوبان في الناقل؛ الخادم أعلن `Read timed out` لتسليم نجح | §10 و§9.6 |
| MD5 نسخة الـsnapshot `3cbce2e8…` | **مسحوب**: لا أثر محفوظ له ومجلّد القراءة حُذف. إعادة قياس الطريقة محفوظة في `fanout-h2-fixround2-recount.txt` | §7 |
| استطلاع التغيير `23/22/1` ومقاييس الناقل | كانا بلا أثر محفوظ؛ أُعيد إجراءُهما وحُفظا في `fanout-mutation-probe.txt` و`fanout-carrier-md5.txt` | §10 |

لا ملف كود مُتبَّع غيّرته هذه الجولة: المتتبَّع الوحيد هنا هو هذا الملف نفسه (وكل ما عدا ذلك أثارات
git-ignored).

**ما مَسَّه هذا الجزء من ملفات مُتبَّعة (git) — لا «لا شيء»:**

| ملف | التغيير |
|---|---|
| `lab/report/evidence/005-fanout.md` | هذا الملف (أثر جديد) |
| `lab/README.md` | فقرة «يثبته»: قرار التفرّع §5–§7 |
| `lab/traccar/kidguard-lab.template.xml` | `notificator.types = web,mail` و`mail.debug = true` + تعليقين، ثم تعليق الجزء B على `mail.debug` (§9.3، إصلاح R34) |
| `lab/scripts/bootstrap.mjs` | `export const LAB_NOTIFICATORS = 'mail'` (سطر 13) واستعماله في خطوة التنبيه (سطر 175) بدل `telegram,email` |
| `lab/tests/api.test.mjs` | حكم الثبات «كل منبِّه يُهيِّئه المعمل يجب أن يكون ضمن `notificator.types`» + منع `telegram` في القالب + مثال حمولة التنبيه صار `web,mail` |
| `lab/tests/latency.test.mjs` | اختبار التقرير يشير إلى الـfixture المُثبَّت بدل ملف git-ignored (§9.4) |
| `lab/fixtures/gate-events.ndjson` | ملف جديد: ناقل البوابة مُثبَّت (R33) |

الحالة قبل الجولة الأولى من المراجعة: 86 ناجحاً، موثَّق في أثرَين محفوظَين
(`lab/logs/fanout-tests-final.txt` و`fanout-tests-summary.txt` — الطرفان يقولان 86/86/0؛ كان يجب
توثيق هذا الفرق لأن نصّ §9.3 ذكر 87 قبل أن يوجد أثرُها). بعد إصلاحات الجولة (تعليق
`mail.debug`، منع `telegram`، تصحيح مثال `api.test.mjs`، ثم قياس الحالة E) أُعيد التشغيل كاملاً
والنصّ الحرفي في `lab/logs/fanout-tests-fixround1.txt`:

```
$ node --test "lab/tests/*.test.mjs"
ℹ tests 87
ℹ suites 0
ℹ pass 87
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

وأُعيد التشغيل بعد الجولة الثانية (وهي تعديل وثيقة وأثارات فقط، لا كود) فخرج النصّ نفسه في
`lab/logs/fanout-tests-fixround2.txt`: `tests 87 / pass 87 / fail 0`، مع عدّة لكل ملف حتى لا يكون
الرقم مجرّد سطر أخضر: `api 23 / config 10 / geo 5 / latency 14 / parse-event 8 / scenarios 5 /
security 20 / sink 2` = 87.

**الحكم الجديد مُثبت بالتغيير (لا مجرد تشغيل أخضر):** بإضافة `telegram` إلى `notificator.types` في
القالب فقط: `tests 23 / pass 22 / fail 1` بالنصّ «the lab template must keep telegram out of
notificator.types…»، ثم رُجِّع القالب وتَحقَّق السطر 23 منه: `<entry key='notificator.types'>web,mail</entry>`،
وأعاد `npm run lab:check` قوله: `config ok: …\kidguard-lab.template.xml`. المراجعة الأولى استشهدت هذه
الأرقام بلا أثر محفوظ، **فأُعيد إجراء الاستطلاع كاملاً وحُفظ نصّه** في
`lab/logs/fanout-mutation-probe.txt` (التعديل على السطر 23 ← `node --test lab/tests/api.test.mjs` ←
الرسالة الحرفية للاختبار الفاشل ← رجوع القالب)، وتحقّق الإرجاع بأن MD5 قبل التعديل وبعده واحد:
`b314ef93a36c0a704d227e1187b744c7`.

**CI هذه الجولة: NOT RUN — CI unavailable (account billing)** — الدفعتان `37545499282` و`37545971137`
على `lab/m0` سقطتا في ~3ث بلا أي خطوة (`steps: []`) كما في R14؛ كل أرقام الاختبارات أعلاه محلية من
هذا الجهاز.

الإيقاف والتحقّق — مرة بعد قياس §5–§8 ومرة بعد قياس §6b؛ النصّ الحرفي للإيقاف الأخير:

```
$ netstat -ano | grep -E ':(8082|5055|5199)' | grep LISTENING || echo "ALL LAB PORTS CLOSED (8082/5055/5199)"
ALL LAB PORTS CLOSED (8082/5055/5199)
$ powershell -NoProfile -Command "(Get-Process java -ErrorAction SilentlyContinue | Measure-Object).Count"
0
```

وناقل البوابة رُجِّع إلى حالة البوابة بعد تشغيل §6b أيضاً، **وكان وصف هذه الفقرة في المراجعة الأولى
خاطئاً في نقطتين، وهذا هو التصحيح المقاس:**

1. لم يُضَف سجلّان بل **أربعة**: تشغيل E أضاف `eventId=98` (geofenceExit، استُلم عند `22:45:59.233Z`)
   و`eventId=97` (geofenceEnter، عند `22:45:57.887Z`)، والضابط أضاف `eventId=99` (دخول، `22:51:13.338Z`)
   و`eventId=100` (خروج، `22:52:42.120Z`) — التسلسل الكامل في الناقل صار
   `2,1,3,4,5,6,7,8,9,10,98,97,99,100` (14 سطراً، MD5 `7ff428094847a30f071a2006fe1d79cb`).
2. قلنا إن «تشغيل E الأول لم يبلغ الحوض أصلاً» استناداً إلى سطري `Event forwarding failed`
   (`fanout-boot-E.log:60 و:95`) — **وهذا غير صحيح**. السطران `SocketTimeoutException: Read timed
   out` أي أن الخادم **توقّف عن قراءة الرد**، بينما السجلّان 98 و97 مكتوبان في ناقل الحوض فعلاً
   (`lab/logs/sink-condE.log` أربعة أسطر، لا اثنين). النتيجة الأهم للإنتاج ليست «ضياع تسليم» بل
   عكسها الخطر: **مسار التمرير يعلن فشلاً لتسليمٍ نجح** — بند §9.6.

الأثر الكامل للقراءة من جديد: `lab/logs/fanout-condE-sink-receipt.txt` (سطور الحوض + سطور الخادم
برقماتها + كيف تُقرأ الأزمنة). نُقلت السطور الأربعة جانباً إلى
`lab/artifacts/events-condE-2026-10-06.ndjson` — **انتبه لاسم الملف:** هو نسخة الناقل كاملة بعد
§6b، أي أنه يحمل صفوف البوابة العشرة أيضاً، لا سطور الحالة E وحدها؛ ثم رُجِّع الناقل من
`lab/fixtures/gate-events.ndjson` حتى طابقه بالـMD5 `8c9bc25076c3ebb69eae8a8bbd88a760`. هذه
المقاييس الثلاثة (الناقل المُرجَّع = الـfixture، وملف §6b، وعدد الأسطر) أُعيد قياسها وحُفظت في
`lab/logs/fanout-carrier-md5.txt` لأن المراجعة الأولى استشهدتها بلا أثر.

وقراءة H2 على نسخة بعد الإيقاف (`lab/logs/fanout-condE-h2-persistence.txt`) تُظهر أن الطوبولوجيا
المستعادة كُتبت على القرص (`tc_user_device`: `1 1` و`2 1`) وأن الأحداث نما من 17 إلى 21 صفاً —
**وهو نموّ تأكّد اليوم**: القراءة الجديدة في `lab/logs/fanout-h2-fixround2-recount.txt` تعطي 21 صفاً
بتوزيع `deviceMoving 1 / deviceStopped 1 / geofenceEnter 10 / geofenceExit 9` وتُدرج الصفوف الأربعة
ذات التوقيتات `23:40:11` و`23:41:41` و`23:51:09` و`23:52:39` (§6b). فالإيقاف القسري هذه المرة **لم**
يُفقد كتابات، ولا نقطع بأن فقد B-2 كان من الإيقاف وحده؛ يبقى بند §9.1 مفتوحاً على إيقاف ناعم.

وأُزيلت مجلّدات النسخة `lab/traccar/tmp-h2` و`tmp-h2-e` و`tmp-h2-fix2` و`tmp-h2-fix2b` (الأخيران من
قراءة هذه الجولة)، وأُزيلت النسخة المؤقتة التي خلّفها فحص الـMD5 في `/tmp`. بقية الأثر (كلّه
git-ignored): `lab/traccar/fanout-boot-{A,A2,B,C,E}.log`, `lab/traccar/fanout.env`,
`lab/traccar/kidguard-lab.xml`, `lab/artifacts/events-fanout-2026-10-06.ndjson`,
`lab/artifacts/events-condE-2026-10-06.ndjson`, `lab/logs/sink-condE.log`, و`lab/logs/fanout-*.txt`
— وأربعة منها أُضيف في هذه الجولة: `fanout-condE-sink-receipt.txt` (القراءة الصحيحة لسطور الحوض
وسطور الخادم برقماتها) و`fanout-h2-fixround2-recount.txt` (إعادة عدّ القاعدة + فحص النسخة)
و`fanout-carrier-md5.txt` (المقاييس الثلاثة للناقل/الـfixture/ملف §6b)
و`fanout-mutation-probe.txt` (استطلاع تغيير القالب).

---

## 11. خلاصة في أسطر

- مشاركة الجهاز **وحدها لا تكفي**: بحذف `user2->notification` فقط بقي مدير واحد مستقبِلاً، وزال
  الولي الثاني (3 قياسات متكررة، إحداها بعد إقلاع)، وعاد بمعاودة الرابط (ضابط في نفس JVM).
- الحدث `geofenceExit` واحد اختار **وليَّين** في الحالة A وسجّلهما الخادم في الثانية نفسها `22:04:14`.
- `device->notification` لازم أيضاً (`always:false`): بدونه `notifications: 0` ولا أي مستقبِل.
- **الاتجاه المعكوس مقاس أيضاً** (§6b، بعد مراجعة مستقلة وجدت أن هذا النصف كان استنتاجاً من كود
  `CacheManager` وحده): تصريح `Notification` بلا مشاركة جهاز ⇒ `{u:1}` وحده، وضابط في نفس JVM
  أعاد `{u:1,u:2}` برابط واحد. فعبارة «لا شيء من الرابطَين يكفي وحده» الآن مقاسة لا مقروءة.
- **زمن تسليم الإنذار معطَّل على الجيرجودر**: نفس المسار أعطى `+3–4ث` عندما تُرجِع nominatim
  عنواناً، و`+114ث` عندما تعذّر TLS — مع تسريب العنوان المُحلّ من إحداثيات تركيبية داخل متن
  الرسالة. `geocoder.enable=false` أو جيرجودر محلي قبل أي تشغيل حقيقي، ويقاس الزمان بدونه في
  الجزء B.
- **سطر «Event forwarding failed» لا يعني أن الإنذار لم يصل** (§9.6): في §6b تخلّى الخادم عن
  قراءتَي الردّ بعد 16–23 ث، والحوض كتب السجلَّين بعد 18.9 ث و20.2 ث من تخلّيه عن القراءة. قبل أي منطق «إعادة إرسال عند
  الفشل» يجب ربط التمرير بمعرّف حدث يُتحقَّق منه، وإلا سيصل الإنذار للأهل مرّتين.
- التسليم الحقيقي (تيليجرام/بريد/لقطات/توازي/push) = **NOT RUN** بانتظار بيانات المالك،
  وCI لهذه الجولة = **NOT RUN — CI unavailable (account billing)**.
