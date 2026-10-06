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

النتيجة المقاسة (انظر `lab/report/evidence/003-scenario-run.txt`):
- **بوابة M0 مُنجزة:** `events.ndjson` يحوي أسطراً حقيقية `eventType":"geofenceExit"` مصدرها خادم
  عامل. **كلا المنطقتين خرجت منهما**: `school` (دائرة CIRCLE) **و**`walk-to-park` (خط `LINESTRING`)
  — برهان أن منطقة المسار تُقيَّم فعلاً، لا الدوائر وحدها.
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

## تنزيل الخادم المثبّت
خطوة قياس على الجهاز، منفصلة عن القالب والمولّد: تنزيل traccar-other-6.16.0.zip ثم إقلاع Traccar على
JDK 25. **قُطِعا فعلاً** في هذا الفرع: الدليل `001-download.txt` (SHA-256 للتنزيل) و`001b-jdk25-boot.txt`
(سجلّ الإقلاع على JDK 25)، وأُعيد التأكد منهما في `003-scenario-server-boot.txt` حيث أقلع الخادم على
JDK 25 وأجاب HTTP 200. java في PATH على جهاز التطوير هو Temurin 17 ولا يتحمّل حزم Traccar 6.16.0 (بايت
Java 21)، لذلك يفتحه run.sh عبر JDK 25 المثبّت محلياً.

```bash
mkdir -p lab/traccar/download && cd lab/traccar/download
curl -fsSLO https://github.com/traccar/traccar/releases/download/v6.16.0/traccar-other-6.16.0.zip
sha256sum traccar-other-6.16.0.zip | tee traccar-other-6.16.0.zip.sha256
unzip -q traccar-other-6.16.0.zip
ls traccar-other-6.16.0/tracker-server.jar   # إلى جانب conf/ و lib/
```

يلصق الناتج (بما فيه SHA-256) في lab/report/evidence/001-download.txt. إن اختلف اسم
الجذر المحدَّد، حدّث LAB_TRACCAR_DIR في run.sh ولا تغيّر أمر التشغيل.
