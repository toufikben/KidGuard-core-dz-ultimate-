# معمل KidGuard (M0)

أدوات قياس فقط. لا شيء من هذا يدخل حزمة الإنتاج.

## يثبته
استقبال إحداثيات، تقييم منطقة على الخادم، حدث geofenceExit، تمرير event.forward.url،
تفرّع الحدث (fan-out) إلى كل الأولياء المسجّلين وصولاً إلى مستقبل المعمل،
أزمنة الوصول إلى الحوض/المستقبل المحلي (p50/p95)، وسِمات أمان المعمل.

## لا يثبته (يُمنع ادّعاؤه قبل VPS)
استمرارية 24/7، وصول من شبكة الجوال عبر NAT، وضع SMS الحقيقي، زمن تسليم على الإنترنت العام،
عمر بطارية جهاز. الأنفاق المجانية لا تنقل TCP خام لمنافذ الأجهزة — راجع
docs/superpowers/specs/2026-10-05-parent-side-tracing-design.md (المادة 10).

## تشغيل
(اعتباراً من المهمة 2: lab:render و lab:check قابلان للتنفيذ؛ بقية الأوامر — الخادم نفسه و
lab:bootstrap و lab:report و lab:security — تُضاف في المهام التالية.)
npm run lab:render && npm run lab:check     # يولّد kidguard-lab.xml ويتحقق منه
bash lab/traccar/run.sh                      # نافذة واحدة تبقى مفتوحة
npm run lab:bootstrap                        # نافذة ثانية

## تنزيل الخادم المثبّت
هذه خطوة قياس على الجهاز، منفصلة عن القالب والمولّد: تنزيل traccar-other-6.16.0.zip
وفحص إقلاع Traccar على JDK 25 لم يُنفَّذا بعد في هذا الفرع — NOT RUN — ولا يُدّعى نجاح
أحدهما قبل تسجيل الدليل. java في PATH على جهاز التطوير هو Temurin 17 ولا يتحمّل حزم
Traccar 6.16.0 (بايت Java 21)، لذلك يفتحه run.sh عبر JDK 25 المثبّت محلياً.

```bash
mkdir -p lab/traccar/download && cd lab/traccar/download
curl -fsSLO https://github.com/traccar/traccar/releases/download/v6.16.0/traccar-other-6.16.0.zip
sha256sum traccar-other-6.16.0.zip | tee traccar-other-6.16.0.zip.sha256
unzip -q traccar-other-6.16.0.zip
ls traccar-other-6.16.0/tracker-server.jar   # إلى جانب conf/ و lib/
```

يلصق الناتج (بما فيه SHA-256) في lab/report/evidence/001-download.txt. إن اختلف اسم
الجذر المحدَّد، حدّث LAB_TRACCAR_DIR في run.sh ولا تغيّر أمر التشغيل.
