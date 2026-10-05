# معمل KidGuard (M0)

أدوات قياس فقط. لا شيء من هذا يدخل حزمة الإنتاج.

## يثبته
استقبال إحداثيات، تقييم منطقة على الخادم، حدث geofenceExit، تمرير event.forward.url،
وصول Telegram/بريد لكل الأولياء، أزمنة p50/p95، وسِمات أمان المعمل.

## لا يثبته (يُمنع ادّعاؤه قبل VPS)
استمرارية 24/7، وصول من شبكة الجوال عبر NAT، وضع SMS الحقيقي، زمن تسليم على الإنترنت العام،
عمر بطارية جهاز. الأنفاق المجانية لا تنقل TCP خام لمنافذ الأجهزة — راجع
docs/superpowers/specs (المادة 10) وresearch/hosting-algeria.md.

## تشغيل
npm run lab:render && npm run lab:check     # يولّد kidguard-lab.xml ويتحقق منه
bash lab/traccar/run.sh                      # نافذة واحدة تبقى مفتوحة
npm run lab:bootstrap                        # نافذة ثانية
