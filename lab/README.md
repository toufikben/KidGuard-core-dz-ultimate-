# معمل KidGuard (M0)

أدوات قياس فقط. لا شيء من هذا يدخل حزمة الإنتاج.

## يثبته
استقبال إحداثيات، تقييم منطقة على الخادم، حدث geofenceExit، تمرير event.forward.url،
اختيار الخادم لمستقبِلي الإنذار (fan-out) **على مستوى القرار لا التسليم**: قِيس أن الوليّ الثاني
يصير مستقبلاً باجتماع `User -> Device` (المشاركة) **و**`User -> Notification` (التصريح)، ولا شيء
منهما يكفي وحده — الاتجاهان مقاسان (§6 حذف التصريح، §6b حذف المشاركة)؛ كما قيس أن
`Device -> Notification` لازم أيضاً لأن السجل `always:false`
(الدليل `lab/report/evidence/005-fanout.md` §5–§7). أمّا وصول ذلك الاختيار إلى قناة حقيقية
(تيليجرام/بريد) فـ**NOT RUN** — راجع §8 من نفس الملف.
أزمنة الوصول إلى الحوض/المستقبل المحلي (p50/p95)، وسِمات أمان المعمل.

## لا يثبته (يُمنع ادّعاؤه قبل VPS)
استمرارية 24/7، وصول من شبكة الجوال عبر NAT، وضع SMS الحقيقي، زمن تسليم على الإنترنت العام،
عمر بطارية جهاز. الأنفاق المجانية لا تنقل TCP خام لمنافذ الأجهزة — راجع
docs/superpowers/specs/2026-10-05-parent-side-tracing-design.md (المادة 10).
- `lab/scripts/check-config.mjs` فاحص بنائي لمفاتيح/أزواج `entry` وليس مُحلِّل XML (لا اعتماديات
  جديدة مسموح بها هنا)؛ لذا قد يمرَّر XML معطوب ما دام المفاتيح والأنماط تتطابق. البرهان الحقيقي
  هو سجل إقلاع الخادم (boot log): قُيس الآن على `tracker-server.jar` المثبّت، وسطر الأخطاء أثناء
  الإقلاع (SEVERE|ERROR|Exception|Caused by) = **0** — راجع `lab/report/evidence/003-scenario-server-boot.txt`.

## تشغيل
كل أوامر السلسلة قابلة للتنفيذ الآن وقِيست حيّاً على هذا الجهاز (بوابة M0): `lab:render` و
`lab:check` و خادم `run.sh` و `lab:bootstrap` و `lab:scenario` و `lab:report` و `lab:security`.

## تشغيل السلسلة كاملة (بوابة M0 — قِيست حيّاً 2026-10-06)
الترتيب الذي أنتج `geofenceExit` حقيقيّاً من خادم Traccar 6.16.0 عامل، مروراً بـ`event.forward.url`
إلى الحوض المحلي. تُمرَّر المتغيّرات بيئياً لكل أمر (لا تُكتب في أي ملف).

نافذة 1 — الحوض (سجلّ أحداث نظيف):
```bash
mkdir -p lab/artifacts && rm -f lab/artifacts/events.ndjson
LAB_FORWARD_PORT=5199 LAB_SINK_HOST=127.0.0.1 node lab/sink/sink.mjs
# sink: http://127.0.0.1:5199/alert -> .../lab/artifacts/events.ndjson
```

نافذة 2 — التوليد والتحقّق ثم إقلاع الخادم عبر JDK 25 (يبدأ الإقلاع قاعدة نظيفة فيجفّ فرع newServer:true):
```bash
LAB_ADMIN_EMAIL=… LAB_ADMIN_PASSWORD=… LAB_TELEGRAM_BOT_TOKEN=… LAB_TELEGRAM_CHAT_ID=… \
  npm run lab:render && npm run lab:check
LAB_JAVA_BIN="/c/Program Files/Java/jdk-25.0.2/bin/java.exe" bash lab/traccar/run.sh > boot.log 2>&1
# استطلِع http://127.0.0.1:8082/api/server بالانتظار (≈40–75 ث) حتى HTTP 200 — لا تفترض الجاهزية.
```

نافذة 3 — التهيئة (شغّلها مرّتين): المرّة الأولى `CREATED admin: id=1` ثم بقيّة الخطوات CREATED،
والمرّة الثانية كل الخطوات `EXISTS` (إعادة التشغيل idempotent). ثمّ السيناريوهان بسرعة 1:
```bash
LAB_API_URL=http://127.0.0.1:8082/api LAB_ADMIN_EMAIL=… LAB_ADMIN_PASSWORD=… \
LAB_GUARDIAN2_EMAIL=… LAB_GUARDIAN2_PASSWORD=… LAB_DEVICE_UNIQUE_ID=lab-child-1 npm run lab:bootstrap
LAB_DEVICE_UNIQUE_ID=lab-child-1 LAB_OSMAND_HOST=127.0.0.1 LAB_OSMAND_PORT=5055 \
  npm run lab:scenario -- school-exit --speed=1
LAB_DEVICE_UNIQUE_ID=lab-child-1 LAB_OSMAND_HOST=127.0.0.1 LAB_OSMAND_PORT=5055 \
  npm run lab:scenario -- route-park --speed=1
```

نافذة 4 — القياس:
```bash
npm run lab:report -- lab/artifacts/events.ndjson geofenceExit,deviceMoving
```
لا تُشغّل `npm run lab:report` بلا وسائط على جهازٍ فيه أثر البوابة: بدون وسيط يقرأ الأمر
`lab/artifacts/events.ndjson` (محليّ، غير متتبَّع) ويستخدم أنواع الأحداث الافتراضية
`geofenceExit,alarm,deviceOffline` — ونوعان منها لم يُولّدهما المعمل أصلاً، فيكون الحكم
`NO DATA p95 not measured for: alarm, deviceOffline` لا `PASS`. الوسائط أعلاه هي أمر البوابة المعتمد.
لإعادة إنتاج نصّ البوابة من المستودع وحده:
`npm run lab:report -- lab/fixtures/gate-events.ndjson geofenceExit,deviceMoving`.

النتيجة المقاسة (انظر `lab/report/evidence/003-scenario-run.txt`):
- **بوابة §14 — مُثبتة على المسار، مفتوحة على المصدر:** `events.ndjson` يحوي أسطراً حقيقية
  `eventType":"geofenceExit"` مصدرها خادم عامل. **كلا المنطقتين خرجت منهما**: `school` (دائرة CIRCLE)
  **و**`walk-to-park` (خط `LINESTRING`) — برهان أن منطقة المسار تُقيَّم فعلاً، لا الدوائر وحدها.
  لكنّ المواضع حُقنت يدويّاً، فلا GPS ولا شريحة حقيقيّين في هذه الجولة: **المسار مُثبت والمصدر غير
  مُثبت** (فجوة مسماة لـM1 بقرار المالك R35). لهذا **لا كود إنتاج قبل إغلاق §14 أو قرار صريح من
  المالك بتضييقها** — لا يُقرأ هذا القسم إذنًا ببدء M1.
- `geofenceExit`: 4 أسطر، `p95 source->sink = 3172ms` و`p95 ingest = 29ms` — حدث الاختطاف سريع وضمن الميزانية.
- **0 سجلّ منحرف الساعة** (الإصلاح R29 يعمل: لا طابع زمنى يسبق لحظة الإرسال، فصيغت المواضع بجدول
  مواعيد `sendSchedule` يعتمد على deadline لكل قراءة بدل نوم نسبي بعد الإرسال).
- **`verdict: PASS p95 <= 30000 ms (source->sink)`** (الحكم R30): ميزانية الـ30ث في المواصفة §8 تُقاس
  على **النقل من المصدر إلى الحوض** (`fixTime → استقبال الحوض`)، لا على عمر طابع Traccar المرجعي.
  سطر `deviceMoving` الواحد يُظهر الفرق: Traccar يعطي حدث الحركة طابعاً زمنياً `eventTime` أرجع من
  `fixTime` موضعها بنحو 60 ثانية (يرجع إلى لحظة بدء الحركة)، فيبلغ **عمر الحدث** ~63s بينما **نقل
  source->sink لنفس الحدث 3181ms** و`ingest = 12ms`. لا يُخفى هذا ولا يُجمَّد: يظهر في عمود
  `p95 event age` مع سطر `event-age note` يفسّره — العمرُ زمنُ طابعٍ مرجعي لا تأخيرٌ في السلسلة،
  والانحراف (R19) يُحسب على النقل فقط لأن نقلاً غير موجب مستحيل فيزيائياً بينما عمر موجب مُفسَّر ممكن.

## فحص الأمان على نفس النسخة المُهيَّأة
```bash
LAB_API_URL=http://127.0.0.1:8082/api LAB_OSMAND_HOST=127.0.0.1 LAB_OSMAND_PORT=5055 npm run lab:security
```
4/4 نجحت (`004-security.txt`). فحص `web-ui-on-localhost-only` يثبت أن المعمل **موجَّه** إلى loopback
لا أن Traccar **يرفض** اتصالات الشبكة المحلية؛ لذا قِسنا ذلك مباشرةً: `netstat` يربط `:8082` على
`127.0.0.1` فقط، والاتصال من عنوان LAN الخاص بالجهاز `…:8082` يُرفض (curl exit 7) بينما `:5055`
مفتوحٌ عمداً على `0.0.0.0` لأن الهاتف يجب أن يرسل المواضع. **NOT RUN:** اختبار من مضيف ثانٍ فعلي
(لا يوجد: لا Docker ولا CI ولا خادم ثانٍ). يبقى فتح `:5055` على LAN قراراً يُراجع قبل الإنتاج.

## الهاتف مصدراً — مسار USB/adb بلا تثبيت (Task 9، قرار المالك R35)
إثبات المسار: مواضع تُولَّد **من داخل الهاتف** ⇒ `127.0.0.1:5055` عبر `adb reverse` فوق USB ⇒
Traccar (`protocol: osmand`, الجهاز `lab-child-1`) ⇒ حدث `geofenceExit` حقيقي ⇒ الحوض. الدليل
الكامل بالأرقام: `lab/report/evidence/006-phone.md`. **لا يُثبَّت أي APK (Traccar Client خارج
النطاق بقرار المالك)، والمواضع يدوية الحقن لا GPS حقيقي — هذه فجوة مسماة لمهمة M1 لا ادّعاء.**

قواعد إلزامية قبل أي تنفيذ:
- **لا تُدخل رقم قفل الشاشة في أي أمر أو ملف، ولا تطلبه.** تحقّق أولاً:
  `adb shell dumpsys power | grep mWakefulness` (متوقع `Awake`) و`dumpsys window | grep mInputRestricted`
  (متوقع `false`). إن كان الجهاز مقفلاً: أوقف الخطوات التي تحتاج الشاشة واطلب من المالك فتحه يدويّاً.
- **لا تنشر المعرّف الكامل للجهاز في أي ملف مستودع؛ آخر أربع خانات فقط.**
- adb ليس على PATH: `ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"`
  (v1.0.41 / 37.0.1). لا Wi‑Fi في هذا الحاسوب؛ الوصول الوحيد هو USB — **لا تفتح منفذاً على LAN ولا
  تغيّر `web.port` ولا تضف قاعدة جدار حماية**؛ إن أُجبرت على tethering فاحذف قاعدتك في نفس الجلسة
  وألحق مخرج الحذف.
- **النفق فقط (`adb reverse`)**: لا نكشف نحن شيئاً للشبكة؛ المنافذ تبقى loopback داخل الهاتف.
  للتنويه: **Traccar نفسه** يربط ميناء الاستقبال على `0.0.0.0:5055` بسلوكه الافتراضي، و`004-security.txt`
  قاس أنه يقبل اتصالاً من LAN (بينما `:8082` مرفوض من LAN) — قرار كشف يُراجَع قبل الإنتاج، لا مهمة هذه الجولة.

```bash
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
"$ADB" devices -l                          # سطر واحد device (المعرّف يُحرَّف لآخر 4 خانات)
"$ADB" reverse tcp:5055 tcp:5055           # مواضع osmand
"$ADB" reverse tcp:8082 tcp:8082           # لوحة الإدارة من متصفح الهاتف
"$ADB" reverse --list                      # المتوقع: سطرانا النفق

# انحراف الساعة (قِس قبل الحقن؛ أزمنة AC-1 تُقرأ مع هذا الانحراف):
P=$("$ADB" shell date +%s | tr -d '\r'); C=$(date +%s); echo "phone-pc=$((P-C))"

# حقن موضع من داخل الهاتف (curl غير موجود على Android؛ صيغة sleep إلزامية مع toybox nc
# وإلا خرج nc قبل قراءة الرد بصفر بايت). NOW من ساعة الهاتف حيّاً — Traccar يتجاهل
# الأقدم من 15 دقيقة في التنبيهات. الزوج داخل/خارج المنطقة من lab/scenarios/school-exit.json:
NOW=$("$ADB" shell date +%s | tr -d '\r')
"$ADB" shell "{ printf 'GET /?id=lab-child-1&valid=true&timestamp=${NOW}&lat=36.75380&lon=3.05880&accuracy=12&speed=0&bearing=0 HTTP/1.0\r\n\r\n'; sleep 2; } | nc -w 5 127.0.0.1 5055"
# ثم بمسافة ~30م+ حتى تُطلق الخروج:
NOW=$("$ADB" shell date +%s | tr -d '\r')
"$ADB" shell "{ printf 'GET /?id=lab-child-1&valid=true&timestamp=${NOW}&lat=36.75475&lon=3.05955&accuracy=15&speed=3.4&bearing=45 HTTP/1.0\r\n\r\n'; sleep 2; } | nc -w 5 127.0.0.1 5055"
# المتوقع من مفسّر osmand: HTTP 200؛ وضابط سلبي: id مجهول يرد 400.

# القياس بعد كل ذلك كما في «تشغيل السلسلة كاملة»:
wc -l lab/artifacts/events.ndjson
npm run lab:report -- lab/artifacts/events.ndjson geofenceExit,deviceMoving
```

**الجيرجودر:** معطّل في **القالب** (`kidguard-lab.template.xml`) بسطر `geocoder.enable=false`، و
`check-config.mjs` يرفض أي قيمة أخرى أو أي غياب للسّطر، فلا يمكن لـ`npm run lab:render` أن يُسقِط
الحماية بصمت (كانت في المولَّد فقط، والمولَّد يُكتَب فوقه في كل توليد — وهذا كان الخلل). الدليل على
التعطيل: `/api/server` يقرأ `geocoderEnabled:false` ولا نداء nominatim في السجل (تسريب العنوان
موثّق في `005-fanout.md` §9.2). لا يُضاف هذا السطر يدويّاً إلى أي إعداد إنتاج؛ هو قرار معمل مُقيَّس.
**ولا تُكرّر المفتاح:** المحلّل يقرأ `key='…'` و`key="…"` معاً (النمطان كلاهما XML تقبله Spring) ويسجّل
**آخر تعريف** كما يحمّله الخادم، ويرفض أي مفتاح مكرّر — لأن سطرَي `false` ثم `true` لنفس المفتاح كانا
يطبعان `config ok` بينما يعمل الخادم بالجيرجودر مُفعّلاً. القياس بعد الإصلاح:
`FAIL geocoder.enable is defined twice in one config` + رسالة القاعدة معاً.

**التنظيف (إلزامي، بمخرجات ملصقة في الدليل):**

```bash
"$ADB" reverse --remove-all ; "$ADB" reverse --list    # المتوقع: فارغ
# أوقف الحوض والخادم، ثم تحقّق:
netstat -ano | grep -E ':(8082|5055|5199)' | grep LISTENING || echo "ALL LAB PORTS CLOSED (8082/5055/5199)"
powershell -NoProfile -Command "(Get-Process java -ErrorAction SilentlyContinue | Measure-Object).Count"  # المتوقع 0
netsh advfirewall firewall show rule name="kidguard-lab-osmand" 2>/dev/null || echo "NO-FIREWALL-RULE-LEFT"
```

## تنزيل الخادم المثبّت
خطوة قياس على الجهاز، منفصلة عن القالب والمولّد: تنزيل traccar-other-6.16.0.zip ثم إقلاع Traccar على
JDK 25. **قُطِعا فعلاً** في هذا الفرع: الدليل `001-download.txt` (SHA-256 للتنزيل) و`001b-jdk25-boot.txt`
(سجلّ الإقلاع على JDK 25)، وأُعيد التأكد منهما في `003-scenario-server-boot.txt` حيث أقلع الخادم على
JDK 25 وأجاب HTTP 200. java في PATH على جهاز التطوير هو Temurin 17 ولا يتحمّل حزم Traccar 6.16.0 (بايت
Java 21)، لذلك يفتحه run.sh عبر JDK 25 المثبّت محلياً.

```bash
mkdir -p lab/traccar
curl -fsSL -o lab/traccar/traccar-other-6.16.0.zip \
  https://github.com/traccar/traccar/releases/download/v6.16.0/traccar-other-6.16.0.zip
# القيمة المثبّتة المقاسة في هذا الفرع (الدليل 001-download.txt) — أوقف إن اختلفت:
#   حجم   166413827 بايت
#   sha256 87be9347090248747cf31ff00a554d59c28e50d1d41d1f68f7f16957976bde55
wc -c lab/traccar/traccar-other-6.16.0.zip
sha256sum lab/traccar/traccar-other-6.16.0.zip
# الأرشيف مُسطَّح: tracker-server.jar و conf/ و lib/ في جذر الأرشيف بلا مجلد باسم النسخة،
# لذلك يُفرَد مباشرة داخل lab/traccar/ ولا يُفرَد في مجلد download/:
unzip -q lab/traccar/traccar-other-6.16.0.zip -d lab/traccar
ls lab/traccar/tracker-server.jar   # المتوقع: يوجد (4210543 بايت عند هذا التثبيت)
```

يلصق الناتج (بما فيه SHA-256) في lab/report/evidence/001-download.txt. لا يغيَّر أمر التشغيل ولا
`LAB_TRACCAR_DIR`: `run.sh` يفحص الشجرة بنفسها ويتحقّق من `tracker-server.jar` قبل `cd`، فيردّ رسالة
مسماة إن وُضعت الشجرة في مكان آخر أو إن كان `LAB_JAVA_BIN` غير صالح.

**ملفات محليّة لا تُتبَّع (git-ignored):** `lab/artifacts/*` (ومنها `events.ndjson` الذي يكتبه الحوض
ولقطات الشاشة)، `lab/logs/*` (سجلّات قياسات الجهاز وجولة الـCI)، `lab/traccar/kidguard-lab.xml`
المُولَّد، وقاعدة `lab/traccar/lab-data/` وشجرة Traccar المُفرَدة. فلا تُحال أي نتيجة إلى هذه المسارات
وحدها: النظير المتتبَّع لأثر البوابة هو `lab/fixtures/gate-events.ndjson` (أسطر البوابة العشرة نفسها،
`md5 8c9bc250…` للطرفين)، وما لا نظيرَ له (كسجلّ `gh run list`) يُذكَر كأثر محليّ يُعاد قياسه
بأمر `gh` مسمّى، لا كمصدر معتمَد داخل المستودع.
