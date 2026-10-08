# قرار الاستضافة — M0

وثيقة قرار مبنية على نتائج بحث الاستضافة الحاسمة؛ كل سطر حاسم يحمل مصدره (URL). ما لم يُتحقَّق منه
موسوم **[UNVERIFIED]** ولا يُرقَّى إلى حقيقة. هذه الوثيقة مكتفية بذاتها داخل المستودع؛ لا تعتمد على
ملفات خارجة عنه.

## الحالة الآن (سُجيلة القرار)

- **مقيس اليوم: `LAB-ONLY`.** المعمل يثبت المسار محليّاً فقط، ولا يثبت شيئاً عن تسليم عبر شبكة عامة:
  لا IPv4 عام، ولا TCP عام على منفذ ثابت، ولا استلام قناة حقيقية (تيليجرام/بريد) — راجع
  `lab/report/evidence/004-security.txt` و`lab/report/evidence/005-fanout.md` §8.
- **`VPS-PATH` تصبح ممكنة لحظة** نجاح بطاقة Visa/Mastercard دولية لدى المالك في دفعة اختبار ~$2 على
  دومين (تُثبت BIN+3DS). قبل هذا الاختبار لا يُشترى أي VPS ولا يُكتب أي كود إنتاج.
- **`BANK-CARD-BLOCKED`** هي الفرع الذي يثبت فيه أن لا بطاقة دولية صالحة للدفع الإلكتروني تُستخرج من
  بنك جزائري؛ عندئذٍ تبقى الملاذات المحلية المدفوعة بالدينار (خطة طوارئ لا «حل رخيص») أو يتوقف
  مشروع النشر العام.

> الفرق بين `VPS-PATH` و`BANK-CARD-BLOCKED` ليس تقنياً بل مصرفي، وهو **قرار المالك وحده** — لا يملك
> الوكيل أن يجيب عنه.

## الحاسم تقنياً — متتبع بشريحة يحتاج TCP عاماً على منفذ ثابت

- متتبع GT06-class يُضبط على `IP:port` ثابت ويرسل سطر TCP خام؛ يحتاج **مستقبِعاً دائماً على منفذ
  ثابت**، لا مسار HTTP عابر. (بنية الجهاز/البروتوكول؛ انظر `docs/superpowers/specs/2026-10-05-parent-side-tracing-design.md` §11 و§17أ.)
- **الأنفاق المجانية لا تنقل TCP خام لمنافذ الأجهزة**: `cloudflared` Tunnel المجاني لا يوفّر ingress
  لـTCP خام بأسلوب المتتبع، ومنتدى Traccar الرسمي يصرّح بأنه «لا يمكن استعمال أنفاق Cloudflare لحماية
  منافذ بروتوكول Traccar» (منفذ 5055/GT06) — تم الجلب والتحقق من المضمون:
  https://www.traccar.org/forums/topic/traccar-port-8082-and-port-5055-not-working-with-cloudflare-tunnel/
- **Tailscale Funnel** للـHTTP(S) فقط على 443/80/8443، لا يستقبل مقبس GT06 **[UNVERIFIED في هذا البحث — من معرفة عامة]**.
  و**ngrok free** يعطي منفذ TCP عشوائياً لكل إعادة تشغيل **[UNVERIFIED هنا]**، فأجهزة GT06 تُضبط على
  IP ثابت لا hostname ⇒ غير صالح للإنتاج.
- **CGNAT** لدى مزوّد الإنترنت يقتل الاستضافة المنزلية بلا IPv4 عام:
  https://www.traccar.org/forums/topic/self-hosted-server-with-cg-nat-problem/
- **الخلاصة:** لا مسار نظيف بتكلفة صفر لاستقبال جهاز حقيقي. يبقى النفق مفيداً **لواجهة الويب/التطبيق
  فقط** لتجربة الهاتف من الخارج، ولا يجوز بناؤه دليلاً على استقبال جهاز ولا مقياساً لزمن تسليم حقيقي.

## الحاسم مالياً — الجدار هو البطاقة الدولية وليس الفودر

- **CIB/Edahabia/ATM لا تعمل لدى أي مزوّد أجنبي** (منظومة تسوية محلية لا دولية) ⇒ لا تُقبل لدى
  Hetzner/Contabo/Netcup/OVH/Oracle/Fly/GCP — مصدر ثانوي تم الجلب: https://zoomalgerie.com/paypal-algerie/
- **بطاقة Visa/Mastercard دولية من بنك جزائري** هي الأفق الوحيد؛ الشروط الفعلية لفرد (عملة أجنبية، سقف،
  تفعيل للتجارة الإلكترونية) تختلف بين البنوك ⇒ **[UNVERIFIED — سؤال المالك لمصرفه هو المصدر الوحيد
  الموثوق]**. عملياً حتى البطاقات الصالحة تُرفض أحياناً لدى مزوّدات SaaS/كلاود بسبب BIN/3DS ⇒ **اختبرها
  بدفعة ~$2 قبل أي التزام**.
- **PayPal** للاستقبال يتطلب «بطاقة Visa مؤكَّدة أو حساب أمريكي»؛ الجزائر ليست دولة دعم كامل لدى
  PayPal **[متنازع — UNVERIFIED]**، والفودرات التي تقبله تشترط تمويلاً صالحاً لنفسها أصلاً.
- **Wise/Payoneer/crypto:** لا مصدر قوي؛ Wise لا يوفر حسابات/بطاقات لمقيمي الجزائر وPayoneer يتطلب
  نشاطاً تجارياً أجنبياً، والعملات المشفّرة كانت محظورة تشريعياً **[UNVERIFIED — لا تُبنَ الخطة عليها]**.

## المرشّحون وترتيبهم (السعر ليس العقبة؛ بوابتا KYC والدفع هما العقبة)

- **Contabo** — تحقّق إلزامي شبه عام لكل الطلب (هوية + إثبات عنوان)، ويتبعه غالباً manual verification:
  https://help.contabo.com/en/support/solutions/articles/103000348466-why-do-i-need-to-verify-my-purchase-
  ومشاكل دفع بالبطاقة موثّقة في KB الرسمي: https://contabo.com/blog/kb/103000342048-why-did-my-payment-fail/
  (رواية مستخدمين عن الإلزامية لا سياسة: https://www.reddit.com/r/VPS/comments/1b87wua/contabo_mandatory_verification/ **[نص الـthread UNVERIFIED]**). عملياً أكثر تساهلاً مع البطاقات الأجنبية من Hetzner، بشرط بطاقة دولية صالحة.
- **Netcup** (ألمانيا، رخيص) — صفحة طرق الدفع https://www.netcup.com/en/helpcenter/documentation/general/payment-methods
  **[لم تُجلب — JS-only ⇒ التفاصيل UNVERIFIED]**؛ مراجعة يدوية للحسابات الجديدة من خارج DE/EU (anecdotal
  **[UNVERIFIED]**). خيار ثانوي.
- **Hetzner CX22 ≈ €3.79/شهر** — أرخص المؤهَّلين تقنياً، لكن **أعلى نسبة رفض/تعطّل حساب لمقيم جزائري بلا
  بطاقة دولية مثبتة** (KYC جواز+فاتورة). FAQ مكافحة الاحتيال https://docs.hetzner.com/general/security-and-identify/fraud-prevention-faq/
  **[لم تُجلب — JS-only ⇒ المضمون التفصيلي UNVERIFIED]**؛ طلب جواز السفر موثّق حتى لمكتتبين غربيين:
  https://news.ycombinator.com/item?id=46050904 وتجربة رفض سلبية معروفة في المجال:
  https://www.reddit.com/r/VPS/comments/1pjyg4a/hetzner_banned_me_after_passport_verification/ **[anecdote — UNVERIFIED]**.
  ⇒ يُترك **بعد** إثبات البطاقة، لا كخيار أول.
- **ترتيب العمل:** Contabo/Netcup أولاً، وHetzner CX22 (≈€3.79) بعد إثبات البطاقة لأنه أعلى رفض.
- **خطة طوارئ محلية (مدفوعة بالدينار، ليست «رخيصة»):** Cirtasoft Starter **3900 DZD/شهر ≈ 29 €**
  (1 vCPU/2 GB؛ Advanced 2 vCPU/4 GB = 5900 DZD/شهر ≈ 44 €): https://www.cirtasoft.com/en/serveurs-vps-algerie
  (**طرق الدفع في الصفحة غير مذكورة — UNVERIFIED**). وUBIKO LS2 2 vCPU/4 GB = 93,600 DZD/سنة
  (≈7800 DZD/شهر ≈ 58 €): https://ubiko.host/hebergement-vps-algerie (**داتا سنتر معلَن USA/EU/ASIA لا
  الجزائر، وطرق الدفع المحلية غير مذكورة — UNVERIFIED**). Icosnet: https://icosnet.com.dz/vps-algerie/
  (**JS-only — الأسعار وطرق الدفع UNVERIFIED**). ⇒ أي «الأرخص نظرياً في الجزائر» هو فعلياً 9–13× ميزانية
  3–4 €/شهر.

## الدومين + HTTPS

- **.xyz** أول سنة ~$2: https://www.namecheap.com/domains/registration/gtld/xyz/ لكن **فخّ التجديد حقيقي**
  (~$12–14/سنة): https://gen.xyz/pricing وhttps://www.rayname.com/blog/xyz-domains-and-rising-renewal-costs-what-registrants-should-prepare-for
  وhttps://www.reddit.com/r/Domains/comments/1v6tc52/price_change_notice_for_xyz_domains_increasing/ ⇒ صمّم
  الميزانية السنوية على التجديد لا على السعر التعريفي. نمط .online/.site نفسه: تجديد 10–30$ بعد أول
  1–4$: https://blog.webhostmost.com/domain-renewal-cost/ **[مصدر ثانوي]**.
- **.dz** السجل الرسمي https://www.nic.dz/ ومصادر متضاربة عن أهلية الأفراد وتكلفتها (ادّعاء مجانية:
  https://octenium.com/domaine/extension/dz) ⇒ **[أهلية الأفراد والتكلفة الحالية UNVERIFIED — راسل DZ.NIC قبل أي وعد]**.
  عملياً: دومين أجنبي رخيص + Cloudflare DNS يكفي.
- **Cloudflare free**: DNS + proxy/HTTPS مجاني للوحة Traccar، لكن **سجل A الخاص بمنفذ TCP ضعه DNS-only
  (رمادي) بلا proxy** حتى لا يُحجب 5055 (توصية forum Traccar الموثّقة أعلاه).
- **Let's Encrypt**: يعمل عبر HTTP-01 (يتطلب 80/443 مفتوحين على VPS) أو DNS-01 مع Cloudflare (بلا منافذ
  مفتوحة) ⇒ مزوّد الإنترنت الجزائري ليس عائقاً **[معرفة عامة — لم تُجلب وثيقة — UNVERIFIED]**.

## قرار الاستضافة — ما قُرِّر مقابل ما لا يقرره إلا المالك

**قُرِّر (بالحقيقة التقنية الموثّقة):**
1. لا مسار عام نظيف بلا VPS ذي IPv4 ثابت لمنفذ TCP؛ الأنفاق المجانية للواجهة فقط.
2. الجدار الحقيقي بطاقة Visa/Mastercard دولية مفعّلة للتجارة الإلكترونية، لا الفودر.
3. ترتيب الشراء بعد إثبات البطاقة: Contabo/Netcup ثم Hetzner CX22؛ والملاذ المحلي Cirtasoft كخطة طوارئ ~29 €.
4. دومين أجنبي + Cloudflare DNS-only لمنفذ TCP + Let's Encrypt؛ احذر فخ تجديد .xyz.

**لم يُقرَّر — قرار المالك وحده (لا يجيب عنه الوكيل):**
- **هل تبدأ إجراءات البنك (طلب بطاقة Visa/Mastercard مفعّلة للدفع الإلكتروني)؟** هذا بند حاسم لـM3
  (شراء المتتبع وتجربة العائلة على شبكة الجوال)، وليس لـM1/M2 اللذين يُبنَهما منطقياً على نفس الواجهة.
- اختبار البطاقة بدفعة ~$2 على دومين هو الذي يقلب الحالة من `LAB-ONLY` إلى `VPS-PATH`. إن رُفض الدفع
  تثبت الحالة `BANK-CARD-BLOCKED` وتُفعَّل خطة الطوارئ المحلية أو يُراجَع نطاق النشر العام.

**القرار المطلوب من المالك الآن:** هل تبدأ إجراءات البنك؟ (بند حاسم لـM3، لا لـM1/M2.)
