# المرحلة 1 — التغييرات

- نُقلت ملفات الاختبار إلى `tests/` (ومعها payroll-harness وrules-helper) فصارت مسارات السكربتات صحيحة.
- `firestore.rules` هو المصدر الوحيد للقواعد: `npm run rules:sync` يحدّث النص المضمّن في index.html، و`npm run rules:check` يتحقق. أُضيف اختبار tests/rules-sync.test.mjs.
- حُذف `manifest (1).json` (المكرر)، وبقي `manifest.json` بـ start_url "/".
- أُزيلت اعتماديات غير مستخدمة: express وdotenv و@google/genai و@types/express، وصُحّح سكربت clean.
- `openModal` يهرّب العنوان افتراضياً، ومن يحتاج HTML يمرر `titleHtml: true` (استُخدم لمسيّر الرواتب فقط).
- حدود أمان للاستعلامات: طلبات إجازات الموظف limit(500)، والقراءة الاحتياطية الكاملة للطلبات limit(3000).
- أُضيف `.github/workflows/ci.yml` (اختبارات الوحدة + تطابق القواعد + اختبارات القواعد).
