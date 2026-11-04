# meqat-edge — خادم التحقق من بصمة الجهاز (Cloudflare Workers، مجاني)

يتحقق من توقيع WebAuthn فعلياً ثم يكتب «تذكرة» قصيرة العمر في `punchTickets/{uid}`؛ وقواعد Firestore تشترط التذكرة لقبول البصمة عندما يفعّل المدير العام «التحقق على خادم الحافة».

## النقاط
- `POST /v1/punch/challenge` `{empId, locId, type}` ⇒ `{challenge, exp}` (60 ثانية، استعمال واحد، 12 طلباً/دقيقة لكل مستخدم).
- `POST /v1/punch/ticket` `{challenge, assertion}` ⇒ `{ticket, exp}`.
- الترويسة في الاثنين: `Authorization: Bearer <Firebase ID Token>`.

## الإعداد (لكل عميل)
1. أنشئ حساب خدمة في مشروع Firebase للعميل (Project settings ‣ Service accounts ‣ Generate new private key). الدور `Cloud Datastore User` يكفي.
2. عدّل `wrangler.toml`: `FIREBASE_PROJECT_ID` و`ALLOWED_ORIGINS` (نطاق التطبيق بالضبط، بلا `/` أخيرة؛ يجب أن يطابق `origin` داخل توقيع البصمة).
3. الأسرار (لا تُكتب في الملف):
   `npx wrangler secret put SA_CLIENT_EMAIL` ثم `npx wrangler secret put SA_PRIVATE_KEY` (محتوى حقل private_key كما هو).
4. `npx wrangler deploy` ⇒ يظهر عنوان مثل `https://meqat-edge.<حسابك>.workers.dev`.
5. الكونسول ‣ العميل ‣ «رابط خادم الحافة» ثم أعد توليد حزمة العميل.
6. انشر `firestore.rules` الجديدة (لا أثر لها حتى تفعّل الخيار).
7. جرّب بصمة بموظف اختبار، ثم فعّل «الإعدادات ‣ التحقق من بصمة الجهاز ‣ على خادم الحافة».

## السلوك عند التعطل
- الخيار مفعّل ⇒ البصمة مرفوضة برسالة واضحة (لا بديل).
- الخيار غير مفعّل ⇒ إن تعطل الخادم يعود التطبيق للتحقق داخله كما كان.

## ما يتحقق منه الخادم
ID Token (RS256 بمفاتيح Google، `aud/iss/exp`)، التحدي (مرتبط بالمستخدم والموظف والموقع والنوع، يُستهلك ذرّياً)، ملكية الموظف للحساب، وجود مفتاح بصمة، سماح الموقع، التوقيع، `origin` و`rpIdHash` وعلمي UP/UV.

## حدود
- لا يفحص `signCount` (مفاتيح المنصات المتزامنة لا تزيده غالباً).
- لا يغطي بعد: تسجيل المفتاح على الخادم، QR المحلي، مؤشرات التزوير، التذكير المجدول.
- رمز QR يُتحقق منه أصلاً في القواعد عبر `locQr`؛ هذا الخادم لا يغيّر ذلك.
- لم يُنشر ولم يُجرَّب على Cloudflare/Google الحقيقيين أثناء التطوير؛ الاختبارات بمحاكاة الشبكة (`npm run test:unit`).
