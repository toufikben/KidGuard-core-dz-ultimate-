# 008 — قياس R-M1-11: مسافة داخل قيمة `@FormParam`، ومسار الرمز على الخادم الحيّ

**النسخة:** Traccar 6.16.0 (`tracker-server.jar`، نفس الشجرة المثبَتة في `lab/traccar/`).
**التاريخ:** 2026-10-10، إقلاع 01:33:11 (JDK 25، ‑Xmx512m، H2 في `lab/traccar/lab-data/database`).
**المقيس به:** `tools/m1/form-encoding-probe.mjs` — يبني جسم الطلب بالتعبير الحرفي نفسه المستعمل في
`src/services/traccar/client.ts:67` (`new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)]))`).
**لماذا يقيس المتحكِّم لا المنفِّذ:** هذه نتيجةٌ تُحدِّد واجهة تُستهلَك في Task 6؛ تُترَك تخميناً كانت
ستُنتج جولة تصحيح كاملة على كود لم يُكتب بعد. حالة الخادم قبل: `SERVER_HTTP=000` (مقيس بـcurl).
**حالة الخادم بعد:** أُطفئت العملية (PID 6116، `java`، StartTime 10/10 01:33:11) بـ`Stop-Process -Id 6116 -Force`
ثم قِيس: `curl http://localhost:8082/api/server` ⇒ `SERVER_HTTP=000` ولا سطر `LISTENING` على 8082.

لا قيمة رمز ولا كوكيز ولا بريد ولا كلمة مرور في هذا الملف ولا في خرج الأداة: الطول والحالة وأسماء
الحقول وقيم منطقية فقط.

---

## 1) الخرج الحرفي

```
A-encoded-body-shape: the space in the label went out as '+' (form encoding) (body length 62)
A-mint-status: HTTP 200, token length 186
B-token-authenticates: HTTP 200, fields: administrator,attributes,coordinateFormat,deviceLimit,deviceReadonly,disableReports,disabled,email,expirationTime,fixedEmail,id,latitude,limitCommands,login,longitude,map,name,password,phone,poiLayer,readonly,temporary,totpKey,userLimit,zoom
C-revoke: HTTP 204
C-reuse-after-revoke: HTTP 401 (a miss on the '+' encoding would leave this 200)
D-token-character-census: tokens containing '+' 0, '/' 0, '=' 0, '-' 33, '_' 31
D-plus-token-round-trip: no token carried a literal + in 40 mints
E-client-postForm-on-token-endpoint: badpayload HTTP 200 — message carries a body excerpt: true
F-cleanup: last mint revoked HTTP 204
```

وقياسات تالية على نفس الإقلاع (جسم/ترويسة فقط):

```
content-type-of-token-response: application/json
token-length-only: 186
GET /session with a BOGUS token -> 400
revoke -> 204 content-type-of-revoke-body: null
GET /session with the REVOKED token -> 401
DELETE /session under Basic only -> 204 body-len 0
POST /session form login -> 200 cookie names JSESSIONID
DELETE /session with cookie session -> 204
GET /session after delete -> 404
POST /session wrong password -> 401 bodyIsJson: false body-len 5824 names-the-account: false
```

وسطر من سجلّ الخادم يطابق قياس كلمة المرور الخاطئة (بدون أي معرِّف):

```
2026-10-10 01:38:20  INFO: login failed from: 127.0.0.1
```

## 2) R-M1-11 نفسها: **مغلَقة — المسافة تعمل**

- المسافة داخل وسيط نصّي `@FormParam` تخرج **`+`** كما تصنع `application/x-www-form-urlencoded`، والخادم
  **يقبلها**: `POST /api/session/token` بـ`label=lab guardian app` ⇒ **200** ورمز بطول 186 (سطر A).
- الرمز المُولَّد مع تلك القيمة **يُتحقّق منه فعلياً**: `GET /api/session?token=…` ⇒ **200** وقائمة حقول
  `User` نفسها المقاسة في 007 §9 (سطر B). هذا يعيد تأكيد R-M1-8 بمسارَين مستقلَّين.
- و`:` داخل `expiration` بصيغة ISO يخرج **`%3A`** ويُقبل (طول الجسم 62 هو الأثر: 11+24+23 مع تزويد
  حرفَين ⇒ الترميز النسبي ممرور لا مكسور).
- **البدائل التي لم تعد مطروحة:** لا سبب لتغيير `postForm` إلى `%20`. الترميز الحالي صحيح على الخادم الحيّ.
- ما **لم يُقَس** (مسجَّل لا مُخمَّن): كيف فكّ الخادم وسم `label` إلى نصّ — لا يوجد مسار REST يعدّ رموز
  المقبس (`GET /api/statistics?type=session` ⇒ **200** مع `[]`)، والرموز ليست كائناً محفوظاً تُقرأ حقوله.
  وكذلك لم تُمرَّ `+` **داخل قيمة الرمز** لأن 40 رمزاً مُنتَجاً لم يحمل أياً منها `+` ولا `/` ولا `=`
  (عُرف الترميز base64url: `-` في 33 من 40، `_` في 31). مطابقة الإلغاء لذلك قِيست على `-`/`_` وهي
  محارف لا تحتاج ترميزاً: سطر C ⇒ إلغاء ثم **401** عند إعادة الاستعمال، أي أن `postForm` طابقت الرمز
  حرفياً. مخاطر `+` داخل رمز نظريّة على هذه النسخة، والاختبار المقتضى في Task 6 يثبّت الترميز لا يفترضه.

## 3) ما كشفه القياس: عيبان في الكود المُصدَّر، لا في الخادم

### 3.1 `/api/session/token` يعيد **سلسلة خام** وترويستُها `application/json` — فـ`postForm` لا تصلح له

الخرج: `content-type: application/json` وجسمٌ ليس JSON (سلسلة الرمز بلا علامات اقتباس)، و`client.ts:85`
يُخضع كل جسم غير فارغ لـ`JSON.parse` ⇒ `badpayload` على **نجاح** 200 (سطر E). أي أن بند Task 6 (ح)
بما هو مكتوب — «`mintSocketToken` عبر `postForm` حصراً» — **غير قابل للتنفيذ** على الخادم الحيّ: كان
سيُنتج رمزاً لا يُقرأ أبداً. القرار **R-M1-15** يدونه (مسار `postFormText` مشاركٌ لنفس المهلة
والأخطاء، لا `fetch` خام موازٍ).

### 3.2 رسالة `badpayload` **تسرِب أول 40 حرفاً من الجسم** — وعلى هذا المسار تلك الأحرف رمزٌ صالح

`src/services/traccar/client.ts:86`:

```ts
catch { throw new TraccarError('badpayload', response.status, `HTTP ${response.status} returned non-JSON (${text.slice(0, 40)})`); }
```

على `/session/token` الـ40 حرفاً هي **بداية رمز مُنتَج**. الدليل الحيّ على حجم الأثر: الجولة الأولى من
هذه الأداة كانت تطبع `error.message` عند الفشل، فطبعت فعلاً 40 حرفاً من رمز lab في ملف مُخرجات مؤقت
وفي سجلّ الجلسة. القيم لا تُكرَّر هنا؛ الرمز أُلغي في نفس الجلسة (`revoke` ⇒ 204) وعمرّه الافتراضي ساعة
على مستخدم معمل في H2 محليّ. وفيها (جزء من R-M1-15):** رسالة الخطأ لا تحمل شيئاً من الجسم
إطلاقاً — الحالة ونوع المحتوى فقط. الاختبار المقتضى: استجابة وهمية غير JSON تحمل قيمة شكلها سرّي،
والـassert أن أياً من أوائل محارفها لا يظهر في `message`، مع تخريب يستهدف هذا الفرع حصراً (R-M1-12).

## 4) جدول حالات الجلسة المقاس — يُربط به Task 6 دون إعادة قياس

| الطلب (على الخادم الحيّ) | الحالة | ما يعنيه للتطبيق |
| --- | --- | --- |
| `POST /api/session/token` بـ`expiration` + `label` فيه مسافة | **200** (سلسلة خام) | الرمز يُصدر؛ القراءة بنصّ لا JSON |
| `GET /api/session?token=<رمز صالح>` | **200** + حقول `User` | مسار الهُويّة الأول (R-M1-8) |
| `GET /api/session?token=<رمز ملغى/منتهي>` | **401** | انتهاء الجلسة ⇒ `unauthorized` |
| `GET /api/session?token=<رمز مُخلَّق غير قابل للتحليل>` | **400** | خطأ برمجي عندنا، لا حالة مستخدم |
| `GET /api/session` بلا رأس ولا كوكيز | **404** (من 007 §6.1) | لا جلسة ⇒ `notfound`؛ **ممنوع** أن يتفرّع «وليّ محلي» |
| `POST /api/session` بكلمة مرور خاطئة | **401** وجسم 5824 بايت **ليس JSON** ولا يسمّي الحساب | النص من القاموس لا من الجسم؛ ولا محاولة تحليل للجسم |
| `POST /api/session/token/revoke` | **204** وجسم فارغ | `revokeSocketToken` بلا تحليل |
| `DELETE /api/session` تحت Basic فقط | **204** | بند (هـ) قابل للتنفيذ كما كُتب |
| `DELETE /api/session` مع جلسة كوكيز ثم `GET /session` | **204** ثم **404** | الخروج يُسقط الجلسة فعلاً لا شكلياً |

## 5) إعادة الإنتاج

```bash
# إقلاع (JDK 25 افتراضي في run.sh؛ H2 يُقلَع في ~14ث):
bash lab/traccar/run.sh > lab/traccar/logs/rm111-boot.log 2>&1 &
until [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 http://localhost:8082/api/server)" = 200 ]; do sleep 5; done
# الأسرار من env فقط، لا في سطر الأامر ولا فيخرج المقيس:
set -a; . lab/traccar/fanout.env; set +a
node --import tsx tools/m1/form-encoding-probe.mjs
# الإطفاء (WMI معطوب على هذا الجهاز ⇒ taskkill/Get-CimInstance يرجعان «Invalid namespace»):
netstat -ano | grep ':8082' | grep LISTENING      # → PID
powershell -NoProfile -Command 'Stop-Process -Id <PID> -Force'
curl -s -o /dev/null -w 'SERVER_HTTP=%{http_code}\n' http://localhost:8082/api/server   # → 000
```
