# الدليل 006 — الهاتف مصدرُ مواضع: مسار USB/adb بلا تثبيت (Task 9، قرار المالك R35)

**تاريخ القياس:** 2026-10-08 (كل التوقيتات UTC ما لم يُذكر خلاف). الجهاز: Realme `RMX3910`،
معرّف الجهاز **بآخر أربع خانات فقط: `HMS8`** — لا يُنشر المعرّف الكامل في أي ملف مستودع.

## 0. بيان صريح أولاً: المواضع لم تُقرأ من GPS الهاتف

**المواضع الثلاثة حُقنت يدويّاً من داخل الهاتف** (عملية `nc` في صدفة Android عبر `adb shell`)،
**ولم تُقرأ من حسّاس GPS في الهاتف ولا من أي تطبيق تتبّع**. ما يثبته هذا الملف هو **المسار** من
جهاز حقيقي (ساعة الجهاز الحقيقية تُستعمل في كل طابع زمني، وصدفة Android حقيقية على الجهاز، ونفق USB
حقيقي) إلى خادم Traccar إلى الحوض — لا دقّة
موضع حقيقي. قرار المالك R35: «بلا تثبيت — إثبات المسار فقط»؛ لذا:

- **Step 2 من Brief (تركيب Traccar Client / APK) مُ_skip صراحةً بقرار المالك.** متغيّر «مصدر GPS
  حقيقي على الجهاز» يبقى **فجوة مسماة لمهمة M1** (مهمة المصدر الحقيقي للتطبيق)، ولا يُدّعى هنا شيء
  بخصوصه. لا إصدار APK ولا مصدره مسجَّلان لأنه لم يُثبَّت شيء.
- **بديل Brief (الإرسال من داخل الهاتف نفسه) هو المسار الأساسي هنا**، لا بديلاً.

## 1. قواعد الأمانة المطبَّقة أثناء القياس

- **لم يُقبل رقم قفل الشاشة ولم يُكتب في أي أمر أو ملف.** تحقّق قبل كل خطوة هاتفية:
  `mWakefulness=Awake`، `mInputRestricted=false`، `mCurrentFocus=com.nabd.journal/…MainActivity`
  (أي الجهاز مفتوح وجاهز بلا شاشة قفل؛ لم يُستعمل `input` لفتح قفل ولا طُلب من أحد فتحه عبر adb).
- **لا قاعدة جدار حماية أُضيفت إطلاقاً** — استُعمل `adb reverse` فقط كما يلزم المسار. دليل الفحص
  حرفيّاً (بعد القياس): `netsh advfirewall firewall show rule name="kidguard-lab-osmand"` →
  `No rules match the specified criteria.` ثم `NO-FIREWALL-RULE-LEFT` (الأثر
  `lab/logs/phone-cleanup-verify.txt`، كله git-ignored).
- **لا منفذ فُتح على LAN**: الخادم على `127.0.0.1:8082`، والحوض على `127.0.0.1:5199`؛ وصول الهاتف
  إليهما حصراً عبر نفق USB (`adb reverse`)، أي من عنوان loopback **داخل الهاتف نفسه**.
- كل أثر مذكور أدناه موجود فعلاً تحت `lab/logs/` أو `lab/artifacts/` أو `lab/traccar/` —
  **وجميعها git-ignored** (`lab/.gitignore:1 artifacts/`، `lab/.gitignore:5 traccar/*`،
  `.gitignore:9 lab/logs/`). المتتبَّع من هذا الدليل: هذا الملف، وقسم «الهاتف مصدراً» في
  `lab/README.md`، فقط. لقطة الشاشة المذكورة في §5 محفوظة تحت `lab/artifacts/` غير المتتبَّع، لا تحت
  `evidence/` — قرار خصوصية لا نطاق رفع؛ انظر §5 و§9.

## 2. الأدوات والإعداد (قيم مقاسة لا مفترضة)

- adb **ليس على PATH**؛ المستعمل: `ADB="/c/Users/Administrator/AppData/Local/Android/Sdk/platform-tools/adb.exe"`
  — المخرجات: `Android Debug Bridge version 1.0.41 / Version 37.0.1-15733141`.
- `adb devices -l`: سطر واحد حالته `device`، product `RMX3910` (المعرّف الكامل محرَّف عمداً؛ آخر
  أربع خانات `HMS8`).
- node v24.19.0؛ الخادم Traccar 6.16.0 على JDK 25 عبر `lab/traccar/run.sh`؛ المتغيّرات من ملف بيئة
  محلي `lab/traccar/fanout.env` (git-ignored، قيم معملية تركيبية كما وُصف في `005-fanout.md` §2).
- **إعادة تهيئة القاعدة قبل التشغيل (كما تقتضي البوابة):** نُسخ `lab/traccar/lab-data` إلى
  `lab-data-fanout-backup` بتطابق MD5 `e3ac1aeca09d0ed69825c97ebb3c7b6c` للطرفين (وهو نفسه MD5
  الحالة النهائية الموثَّق في `005-fanout.md` §10 — تطابق متقاطع)، ثم `rm -f lab/traccar/lab-data/*`.
  boot جديد أكّد `newServer=true` من `/api/server`، فbootstrap أعطى `CREATED admin: id=1`.
- **فحص الجيرجودر (تكليف صريح):** القالب `lab/traccar/kidguard-lab.template.xml` **لا يحمل أي مفتاح
  `geocoder`** (`grep -n geocoder` على القالب = صفر أسطر). لم أُعدِّل القالب المتتبَّع؛ أُضيف
  `<entry key='geocoder.enable'>false</entry>` **إلى المُولَّد فقط** (`lab/traccar/kidguard-lab.xml`
  سطر 36، ملف git-ignored) ثم `node lab/scripts/check-config.mjs lab/traccar/kidguard-lab.xml` →
  `config ok`. الأدلة أن التعطيل فعّل فعلياً في هذا التشغيل:
  1. `/api/server` يقرأ `"geocoderEnabled":false` — والنداء جاء **من داخل الهاتف** (الأثر
     `lab/logs/phone-get-8082.txt`).
  2. `grep -acE 'nominatim|geocode|OpenStreetMap' lab/traccar/phone-boot.log` = **0** — لا نداء
     جيرجودر خارجي واحد في السجل كله.
  3. متن رسالة الإنذار طبع الإحداثيات الخام `Point: … 36.75475&deg;, 3.05955&deg;` لا عنواناً محلولاً
     (phone-boot.log عند `09:44:08` بالتوقيت المحلي) — أي لا تسريب عنوان كما حدث في §9.2 من
     `005-fanout.md` عند التشغيل بالافتراضي.
- **اختبارات قبل التغيير:** `node --test "lab/tests/*.test.mjs"` → `tests 87 / pass 87 / fail 0`
  (النص الكامل في `lab/logs/phone-tests-before.txt`).

## 3. السلسلة الحيّة: الهاتف ⇒ reverse/USB ⇒ osmand:5055 ⇒ geofenceExit ⇒ الحوض

التهيئة (كلّها بأثر محفوظ): تشغيل الحوض على `127.0.0.1:5199`؛ إقلاع الخادم (READY بعد 6 استطلاعات
≈18ث، HTTP 200، `newServer=true version=6.16.0`)؛ `npm run lab:bootstrap` مرّتين —
**run1: كل الخطوات CREATED** (device id=1، `geofence-school id=1 area=CIRCLE (36.7538 3.0588, 100)`)،
**run2: كل الخطوات EXISTS** (idempotent) — الأثران `lab/logs/bootstrap-phone-run{1,2}.txt`.
طوبولوجيا الأذونات أُعيد قراءتها **بعد** الإقلاع من الـAPI الحيّ (`lab/logs/phone-topology-after-boot.txt`):
`userId=1&deviceId=0 → [{1,1}]`، `userId=2&deviceId=0 → [{2,1}]`، `deviceId=1&notificationId=0 → [{1,1}]`،
`deviceId=1&geofenceId=0 → [{1,1},{1,2}]` — مطابقة لما هيّأته Task 5/8، والمنطقة المستعملة هنا هي
`school` نفسها، لم تُخترع إحداثيات جديدة: داخل/خارج الزوج مأخوذان من `lab/scenarios/school-exit.json`
(القراءة 1 مركز المنطقة، والقراءة 4 على بُعد ~125م منها).

النفق:

```
$ adb reverse tcp:5055 tcp:5055 ; adb reverse tcp:8082 tcp:8082 ; adb reverse --list
UsbFfs tcp:5055 tcp:5055
UsbFfs tcp:8082 tcp:8082
```

(أُضيف أثناء التشخيص `adb reverse tcp:5199 tcp:5199` لتأكيد تدفق البيانات عبر النفق من الحوض نفسه؛
رُفع مع بقية الأنفاق بـ`--remove-all` في التنظيف §8، ولم يبقَ أي منفذ معكوس بعد القياس.)

**انحراف الساعة هاتف⇄PC (قيس قبل الحقن، 5 أزواج متتابعة `adb shell date +%s` مقابل `date +%s`):**
`phone_minus_pc = -1, -1, -2, -1, -1` ثوانٍ. القراءة الحاسوبية تجري دائماً **بعد** قراءة الهاتف
(تأخير adb ثوانٍ جزئية)، فالتقدير الأعلى (`-1`) هو الحدّ الأعلى للانحراف الحقيقي:
**انحراف ساعة الهاتف بين −1ث و0ث من ساعة الحاسوب**. الأثر في الطرفية؛ يُذكر في §5 ما يعنيه هذا
للأزمنة.

**أوامر الحقن الحرفية من داخل الهاتف** (بديل Brief وهو هنا المسار الأساسي؛ `curl` غير موجود على
الجهاز — تحقّق: `which curl` بلا إخراج، و`/system/bin/nc -> toybox` موجود):

```
$ NOW=$(adb shell date +%s | tr -d '\r')   # NOW(phone)=1791448957  PC=1791448958
$ adb shell "{ printf 'GET /?id=lab-child-1&valid=true&timestamp=${NOW}&lat=36.75380&lon=3.05880&accuracy=12&speed=0&bearing=0 HTTP/1.0\r\n\r\n'; sleep 2; } | nc -w 5 127.0.0.1 5055"
HTTP/1.1 200 OK
content-length: 0
```

ومثله الموضعان الثاني والثالث بعد ~40ث و~106ث من الأول (`NOW` يُحسب من ساعة الهاتف قبل كل إرسال؛
`phone=1791448997/1791449043`) — الثلاثة رجعت `HTTP/1.1 200 OK` (الأثر
`lab/logs/phone-post-{1-inside,2-inside,3-outside}.txt`).

**ضابطان سلبيان/إيجابيان على نفس النفق يثبتان أن الاستجابة من مفسّر osmand نفسه:**

- `id=does-not-exist` → `HTTP/1.1 400 Bad Request` (كما يوثّقه Brief: معرّف مجهول يرد 400 لأن
  `database.registerUnknown=false`) — أي الطلبات الثلاثة السابقة **قُبلت لهويتها المسجّلة** لا لأي سبب.
- منفذ مغلقة (5056، بلا reverse) → `nc: connect: Connection refused` — أي أن نجاح 5055/8082/5199
  يعود للنفق لا لصدفة.
- ملاحظة تقنية صريحة: `nc` من toybox ينهي الاتصال عند EOF على stdin قبل قراءة الرد؛ لذا حُلّت صيغة
  `{ printf …; sleep 2; } | nc` — بدونها يظهر نجاح بصفر بايت (المحاولتان الأوليان خرجتا بـ`EXIT=0`
  وبلا أي بايت رد، وطُبعتا في الطرفية فقط أثناء التشخيص ولم تُحفظ؛ الدليل المحفوظ هو ما بعدها:
  صيغة sleep رجّعت ردوداً كاملة — 404 من الحوض و400 من osmand — في الطرفية وناقل الأحداث).

**ما سجّله الخادم (`lab/traccar/phone-boot.log`، التوقيت المحلي UTC+1؛ الأسطر المفكوكة في
`lab/logs/phone-server-event-lines.txt`):**

```
09:42:43 INFO: Event id: lab-child-1, time: 09:42:37, type: geofenceEnter, notifications: 0   (school)
09:42:43 INFO: Event id: lab-child-1, time: 09:42:37, type: geofenceEnter, notifications: 0   (walk-to-park)
09:42:43 INFO: [T4aa5abb8] id: lab-child-1, time: 09:42:37, lat: 36.75380, lon: 3.05880, course: 0.0, accuracy: 12.0
09:43:22 INFO: [T65bf6eb7] id: lab-child-1, time: 09:43:17, lat: 36.75395, lon: 3.05890, speed: 1.2, course: 45.0, accuracy: 12.0
09:44:07 INFO: Event id: lab-child-1, time: 09:44:03, type: geofenceExit, notifications: 1
09:44:08 INFO: [T29c9f138] id: lab-child-1, time: 09:44:03, lat: 36.75475, lon: 3.05955, speed: 3.4, course: 45.0, accuracy: 15.0
```

و**الحوض استلم ثلاث سجلات** (`lab/artifacts/events-phone-2026-10-08.ndjson` — ناقل حالة تشغيل
git-ignored، MD5 `aa85f367ddcd51925afc7118750dff73`، 3 أسطر: `geofenceEnter`×2 ثم `geofenceExit`
بمعرف `eventId:3` ومنطقة `school` وإحداثيات الموضع الثالث نفسها وحقل `uniqueId:"lab-child-1"`).
**لا سطر `Event forwarding failed` ولا أي `SEVERE|ERROR|Exception|Caused by` في سجل الإقلاع كله**
(grep خرج بصفر أسطر، `grep_exit=1` — الأثر `lab/logs/phone-cleanup-verify.txt`؛ ومع ذلك نُفّذ تحذير
§5 من تعليمات الجولة: لو ظهر سطر «فشل» لما حُكم عليه قبل مطابقة ناقل الحوض، وقد طابقه: 3/3).

## 4. أرقام AC-1 على مصدر حقيقي (مع ما تعنيه وما لا تعنيه)

`npm run lab:report -- lab/artifacts/events-phone-2026-10-08.ndjson geofenceExit,deviceMoving`
(النص الكامل في `lab/logs/phone-report.txt`):

```
records: 3
clock-skewed records (source->sink latency <= 0): 0
| event        | count | p50 source->sink | p95 source->sink | max source->sink | p95 event age | p95 ingest server |
| geofenceEnter| 2     | 7554             | 7633             | 7633             | 7633          | 1968              |
| geofenceExit | 1     | 4750             | 4750             | 4750             | 4750          | 1685              |
verdict: PASS p95 <= 30000 ms (source->sink)
missing expected types: deviceMoving
```

- **geofenceExit (الحدث المطلوب):** source→sink = **4750ms**؛ ingest (fixTime→serverTime) =
  **1685ms**؛ عمر الحدث = النقل نفسه هنا لأن Traccar لم يؤرّخ الخروج بمرجع أرجع (خلافاً
  لـ`deviceMoving` في بوابة M0). `deviceMoving` لم يُنتَج لأن القراءات الثلاث لم تُنشئ نمط «بدء
  حركة» المكوّر المطلوب — مذكور كما هو لا مجمَّل.
- **تفسير الأرقام بصدق:** (أ) هذه أزمنة **حلقة USB loopback-equivalent** (الهاتف→adbd→PC على نفس
  الجهاز)، لا مسار خلوي/شبكة؛ ميزانية §8 الحقيقية (≤30ث من GPS الطفل حتى وليّه) تُقاس على مسار
  حقيقي في مهمة الاستضافة. (ب) انحراف الساعة (−1ث..0) يدخل **بالإضافة** إلى هذه الأرقام، أي أنها
  متحيزة للعلوّ بمقدار ≤1ث لا للنقص. (ج) فارق ~5.6ث بين استقبال الخادم للموضع (serverTime) وتسليم
  حدث الدخول للحوض هو **زمن تقييم الأحداث وبناء الرسالة داخل Traccar** لا زمن السلك — وهو داخل
  الميزانية مقاساً من fix حتى الحوض كما تقبله البوابة (R30).
- **ما تحكّمتُ فيه وما لم أتحكّم:** `timestamp` = ثواني Unix من ساعة الهاتف لحظة الإرسال (لا تاريخ
  قديماً — Traccar يتجاهل الأقدم من 15د في التنبيهات، وقد استُعمل الوقت الحيّ في كل إرسال)؛
  `accuracy` = **رقم كتبته في الرابط** (12/15م) يمرّره المفسّر ويخزّنه الخادم كما هو (ظهر في السجل
  `accuracy: 12.0/15.0` وفي الحوض `accuracyMeters`) — أي أن المسار **يحمل** الدقة، لا أن القيمة
  قياس GPS حقيقي. `speed` بعقد بحرية كما يفسّرها المفسّر، و`bearing` كذلك. **لم يكن لأي حقل مصدره
  حسّاس.**

## 5. اللوحة من متصفح الهاتف (Step 3) والطزاجة المعروضة (Step 5)

- **API الإدارة يصل من داخل الهاتف عبر النفق:** `GET /api/server` من `nc` داخل صدفة الهاتف على
  `127.0.0.1:8082` → `HTTP/1.1 200 OK` + JSON كامل (فيه `geocoderEnabled:false`، `version 6.16.0`)
  — الأثر `lab/logs/phone-get-8082.txt`.
- **متصفح الهاتف يفتح اللوحة:** فُتح `http://127.0.0.1:8082` في Chrome على الجهاز
  (`am start -a VIEW -p com.android.chrome`) فظهرت **صفحة دخول Traccar** بشريط عنوان
  `127.0.0.1:8082/log…` — لقطة الشاشة محفوظة في
  `lab/artifacts/006-phone-browser-8082-login.png` (PNG، MD5
  `7d02f3a4fef7da43e02384e2d9fe1449`)، **غير مرفوعة إلى المستودع عمداً**: اللقطة تحمل شريط حالة جهاز
  المالك (ساعة، بطارية، أيقونات إشعارات) ولو لم تحمل اسماً، فتُحفظ محليّاً ويُذكر مسارها وبصمتها هنا.
  لا أسماء أطفال حقيقية فيها: لا شيء سوى واجهة دخول فارغة.
- **ضمانة خصوصية وقعت فعلاً وأُبلغ عنها:** أول محاولة لقطة التقطت **ستارة الإشعارات** وفيها إشعارات
  شخصية للمالك (بريد، أسماء مراسلين). **حُذفت فوراً ولم تُرفع ولم تُنشَر** (`rm` قبل أي commit)،
  وأُعيد القياس بعد التأكد أن `mCurrentFocus=com.android.chrome`؛ لا نسخة منها في أي مكان.
- **دخول اللوحة فعليّاً (بريد+كلمة مرور المدير) — NOT RUN:** يتطلب كتابة بيانات دخول في واجهة
  جهاز المالك الشخصي بنقر/إدخال آلي، وهو ما يتجاوز قرار R35 (حد أدنى من ملامسة الجهاز؛ لا PIN
  يُلمَس ولا تثبيت). لذلك **لقطة «قبل/بعد» للخريطة (Step 4 من Brief) — NOT RUN** لنفس السبب؛
  القبول في الخادم أُثبت بالـHTTP الحيّ (200/400) وبالحوض، وهو المطلوب برهانه.
- **طزاجة معروضة:** لوحة Traccar لا تعرض «عمر القراءة» بالهيأة المطلوبة للولي؛ ما قيس أن **البيانات
  موجودة في API**: `GET /positions?deviceId=1` أعاد الموضع الأحدث (`id: 3`) وفيه `fixTime`
  `08:44:03.000Z` و`deviceTime` مثله و`serverTime` `08:44:04.685Z` و`accuracy: 15` و
  **`protocol: "osmand"`** — أي أن الحقل الذي يميّز المصدر يصلح للعرض وللتفريع (الأثر
  `lab/logs/phone-positions-api.txt`، 243 بايتاً، موضع واحد لا ثلاثة: الاستعلام بلا `from/to` يرجع
  الأحدث فقط، ولم يُستعلم عن البقية). وفق Brief: هذا **دليل تصميم لـM1** (تطبيق الولي يحسب العمر من
  `fixTime` ويعرض الدقة) لا عيب M0.

## 6. التنظيف (إلزامي — مخرجات حرفية)

```
$ adb reverse --remove-all ; adb reverse --list
(قائمة فارغة — exit=0 بلا أسطر)
$ powershell -NoProfile -Command "Stop-Process -Id 4504,2420 -Force"     # الحوض ثم الخادم
exit=0
$ netstat -ano | grep -E ':(8082|5055|5199)' | grep LISTENING
ALL LAB PORTS CLOSED (8082/5055/5199)
$ powershell -NoProfile -Command "(Get-Process java -ErrorAction SilentlyContinue | Measure-Object).Count"
0
$ netsh advfirewall firewall show rule name="kidguard-lab-osmand"
No rules match the specified criteria.
NO-FIREWALL-RULE-LEFT
```

(الأثران الحرفيان: `lab/logs/phone-cleanup-reverse.txt`، `phone-cleanup-stop.txt`،
`phone-cleanup-verify.txt`، `phone-cleanup-verify2.txt`.) **ملاحظة أمانة عن الإيقاف:**
`taskkill //PID … //F` فشل على هذه البيئة بـ`ERROR: Invalid namespace` (نُقل نصّه كما وقع)،
فاستُعمل `Stop-Process -Force`؛ و§9.1 من `005-fanout.md` يوثّق أن القتل القسري قد يُفقد كتابات H2 —
أدلة هذه الجولة كلها من سجل الخادم وناقل الحوض لا من جدول القاعدة، فلا قياس هنا يعتمد على كتابة
لم يتأكد عبورها. لم تُفتح أي منفذ LAN ولم تُضف ثم تُحذف أي قاعدة جدار حماية (لم تُستعمل الـtethering
كطريق وصول أصلاً؛ USB reverse غنىً عنه).

## 7. الاختبارات بعد التغيير

`node --test "lab/tests/*.test.mjs"` → `tests 87 / pass 87 / fail 0` (مثلها قبل التغيير؛
`lab/logs/phone-tests-after.txt`) — التغيير في هذه الجولة وثائق وأدلة فقط، لا كود.

## 8. CI

**NOT RUN — CI unavailable (account billing).** دفعة هذا العمل على `lab/m0` رقمها **`37752677759`**
(لـcommit `8377adb`)؛ تحقّق بـ`gh run view 37752677759 --repo toufikben/KidGuard-core-dz-ultimate- --json jobs`:
`{"name":"lab","conclusion":"failure","steps":0}` — صفر خطوات في 3ث (`08:51:52Z → 08:51:55Z`)، وهو
نفس عطل الفوترة الموثق لسبع دفعات سابقة في `005-fanout.md` §10. لا يُكتب PASS للـCI أبداً؛ كل
أرقام الاختبارات في هذا الملف محلية من هذا الجهاز.

## 9. ما لا يثبته هذا الملف إطلاقاً

| البند | الحالة | لماذا |
|---|---|---|
| GPS حقيقي من حسّاس الجهاز | **فجوة مسماة لـM1 — غير مدّعى** | المواضع حُقنت يدويّاً من صدفة الهاتف (§0)؛ لا تطبيق تتبّع رُكّب (R35) |
| Traccar Client / أي APK | **SKIP بقرار المالك** | Step 2 خارج النطاق؛ لا إصدار ولا مصدر APK مسجل لأنه لم يُثبَّت شيء |
| الوصول من LAN/شبكة خلوية إلى 5055 | **غير مثبت** | `adb reverse` يعرّض المنافذ على loopback داخل الهاتف فقط؛ لا شيء مكشوف للشبكة (قيس في 004: 8082 على loopback وحده) |
| تسليم إشعار فعلي (تيليجرام/بريد) | **NOT RUN — الجزء B موقوف** | سطرا `Email sent` (09:44:08) من `mail.debug=true` = **سجل اختيار داخل JVM لا تسليم**؛ لا يُقرأان أبداً دليل وصول (فخّ R7) |
| لقطة خريطة قبل/بعد من اللوحة | **NOT RUN** | تتطلب إدخال بيانات دخول اللوحة في واجهة جهاز المالك؛ خارج قرار R35 (§5) |
| دقة/طزاجة قياسيتين | **غير مثبتتين** | `accuracy` رقم مكتوب في الرابط؛ `timestamp` من ساعة يدوية الضبط بانحراف حتى ثانية |
| ناقل الحوض كدليل مُثبَّت | **محلي فقط** | `lab/artifacts/` git-ignored؛ الأدلة المثبَّتة تبقى `lab/fixtures/gate-events.ndjson` (بوابة M0) وهذا الملف؛ لقطة الشاشة PNG تحت `lab/artifacts/` وغير مرفوعة بقرار خصوصية (شريط حالة جهاز المالك)، وتُراجع ببصمتها |
