// اختبارات المتصفح للتطبيق الحقيقي (index.html) مع Firebase وهمي. تشغيل: npm run test:e2e
// ثوابت الاختبار مقصودة: لا تعتمد على أسماء أصناف CSS الشكلية (قابلة للتغيير في التصميم) بل على data-* ومعرّفات الوظائف.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, startServer, openApp, sleep, buildSeed } from './harness.mjs';

let srv, url, browser;
before(async () => { ({ srv, url } = await startServer()); browser = await chromium.launch(); });
after(async () => { await browser.close(); srv.close(); });

const adminReady = async page => { await page.waitForSelector('[data-tab]', { timeout: 10000 }); await page.waitForSelector('#content', { timeout: 10000 }); await sleep(500); };
const noErrors = (errors, label) => assert.deepEqual(errors, [], label + ': ' + errors.join(' | '));

for (const [vpName, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 800 }]]) for (const theme of ['light', 'dark']) {
  test(`الإدارة (${vpName}/${theme}): تفتح كل التبويبات بلا أخطاء ولا تمرير أفقي`, async () => {
    const { page, ctx, errors } = await openApp(browser, url, { viewport, theme });
    await adminReady(page);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme || 'light'), theme);
    const tabs = await page.$$eval('[data-tab]', els => [...new Set(els.map(e => e.dataset.tab))]);
    assert.ok(tabs.length >= 6, 'عدد التبويبات ' + tabs.length);
    for (const t of tabs) {
      await page.click(`[data-tab="${t}"]`); await sleep(350);
      assert.ok((await page.$eval('#content', e => e.textContent.trim().length)) > 10, 'تبويب فارغ: ' + t);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 1, `تمرير أفقي ${over}px في ${t}`);
    }
    noErrors(errors, `${vpName}/${theme}`); await ctx.close();
  });
}

test('الإدارة: تسجيل الدخول بالبريد وكلمة المرور ثم الخروج', async () => {
  const { page, ctx, errors } = await openApp(browser, url, { user: false });
  await page.waitForSelector('#em'); await page.fill('#em', 'asmaa@alnoor.ly'); await page.fill('#pw', 'Passw0rd!'); await page.click('#go');
  await adminReady(page);
  await page.fill('#em', 'x').catch(() => {});
  await page.click('[data-act="logout"]').catch(() => {});
  noErrors(errors, 'login'); await ctx.close();
});

test('الإدارة: دخول بكلمة مرور خاطئة يعرض رسالة ولا يدخل', async () => {
  const { page, ctx, errors } = await openApp(browser, url, { user: false });
  await page.waitForSelector('#em'); await page.fill('#em', 'asmaa@alnoor.ly'); await page.fill('#pw', 'wrong'); await page.click('#go'); await sleep(400);
  assert.ok(await page.$('.toast.err'), 'لم تظهر رسالة الخطأ'); assert.equal(await page.$('[data-tab]'), null);
  noErrors(errors, 'bad login'); await ctx.close();
});

test('اليوم: يعرض الموظفين المزروعين وحالاتهم', async () => {
  const { page, ctx, errors } = await openApp(browser, url); await adminReady(page);
  const txt = await page.$eval('#content', e => e.textContent);
  for (const n of ['عبدالله الفيتوري', 'ريما الككلي', 'إبراهيم الجالي']) assert.ok(txt.includes(n), 'غائب عن اليوم: ' + n);
  noErrors(errors, 'today'); await ctx.close();
});

test('الطلبات: اعتماد طلب إجازة يمرّ عبر نافذة التأكيد ويُكتب في قاعدة البيانات', async () => {
  const { page, ctx, errors } = await openApp(browser, url); await adminReady(page);
  await page.click('[data-tab="reqs"]'); await sleep(500);
  const btn = await page.$('[data-act="appr"][data-id="r1"]'); assert.ok(btn, 'زر الاعتماد غير موجود');
  await btn.click();
  await page.waitForSelector('.mq-dlg #mqIn'); assert.equal(await page.$eval('#mqIn', i => i.value), '100', 'النسبة الافتراضية للإجازة السنوية'); await page.click('.mq-dlg [data-i="1"]');   // نافذة نسبة الدفع
  await page.waitForFunction(() => !document.querySelector('.mq-dlg #mqIn') && document.querySelector('.mq-dlg [data-i="1"]')); await page.click('.mq-dlg [data-i="1"]'); await sleep(600);   // نافذة التأكيد
  const st = await page.evaluate(() => window.__MQ.docs.get('employees/e1/requests/r1').status);
  assert.equal(st, 'approved'); assert.equal(await page.$('.mq-dlg'), null, 'نافذة التأكيد بقيت مفتوحة');
  noErrors(errors, 'approve'); await ctx.close();
});

test('الطلبات: رفض طلب ثم تراجع عن التأكيد لا يكتب شيئاً', async () => {
  const { page, ctx, errors } = await openApp(browser, url); await adminReady(page);
  await page.click('[data-tab="reqs"]'); await sleep(500);
  await page.click('[data-act="rej"][data-id="r2"]'); await page.waitForSelector('.mq-dlg [data-i="0"]'); await page.click('.mq-dlg [data-i="0"]'); await sleep(300);
  assert.equal(await page.evaluate(() => window.__MQ.docs.get('employees/e3/requests/r2').status), 'pending');
  noErrors(errors, 'reject-cancel'); await ctx.close();
});

test('الموظفون: فتح محرر الموظف وإغلاقه بلا أخطاء', async () => {
  const { page, ctx, errors } = await openApp(browser, url); await adminReady(page);
  await page.click('[data-tab="emps"]'); await sleep(400);
  const edit = await page.$('[data-act="editEmp"]'); assert.ok(edit, 'لا يوجد زر تعديل موظف');
  await edit.click().catch(async () => { await page.click('details.act-menu summary'); await page.click('[data-act="editEmp"]'); });
  await page.waitForSelector('.ov .modal', { timeout: 5000 }); await page.click('.ov [data-m="close"]'); await sleep(200);
  assert.equal(await page.$('.ov .modal'), null);
  noErrors(errors, 'emp editor'); await ctx.close();
});

test('الموظف: بصمة حضور تُكتب في السجل بالموقع الصحيح', async () => {
  const seed = buildSeed(); seed.user = { uid: 'u-e5', isAnonymous: true, emailVerified: false };
  const { page, ctx, errors } = await openApp(browser, url, { search: '?e=e5', seed, viewport: { width: 390, height: 800 } });
  await page.waitForSelector('#bIn', { timeout: 10000 }); await sleep(800);
  assert.equal(await page.$eval('#bIn', b => b.disabled), false, 'زر الحضور معطّل');
  await page.click('#bIn'); await sleep(1500);
  const recs = await page.evaluate(() => [...window.__MQ.docs.entries()].filter(([p]) => p.startsWith('employees/e5/records/')).map(([, d]) => d.type));
  assert.deepEqual(recs, ['in']);
  assert.equal(await page.$eval('#bIn', b => b.disabled), true, 'بعد الحضور يجب تعطيل زر الحضور');
  noErrors(errors, 'punch'); await ctx.close();
});

test('الموظف: بصمة انصراف لموظف حاضر', async () => {
  const seed = buildSeed(); seed.user = { uid: 'u-e1', isAnonymous: true, emailVerified: false };
  const { page, ctx, errors } = await openApp(browser, url, { search: '?e=e1', seed, viewport: { width: 390, height: 800 } });
  await page.waitForSelector('#bOut', { timeout: 10000 }); await sleep(800);
  assert.equal(await page.$eval('#bOut', b => b.disabled), false, 'زر الانصراف معطّل');
  await page.click('#bOut'); await sleep(1500);
  const types = await page.evaluate(() => [...window.__MQ.docs.entries()].filter(([p]) => p.startsWith('employees/e1/records/')).map(([, d]) => d.type).sort());
  assert.deepEqual(types, ['in', 'out']);
  noErrors(errors, 'punch out'); await ctx.close();
});

test('الموظف: نموذج طلب إجازة يظهر، وتبديل الوضع الداكن يعمل', async () => {
  const seed = buildSeed(); seed.user = { uid: 'u-e1', isAnonymous: true, emailVerified: false };
  const { page, ctx, errors } = await openApp(browser, url, { search: '?e=e1', seed, viewport: { width: 390, height: 800 } });
  await page.waitForSelector('#rqLeave', { timeout: 10000 }); await page.click('#rqLeave'); await page.waitForSelector('#rqType', { timeout: 5000 }); assert.ok(await page.$('#rqFrom') && await page.$('#rqTo'), 'حقول التاريخ'); await sleep(200);
  const before = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
  await page.click('.theme-toggle-btn'); await sleep(200);
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme || 'light'), before);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(over <= 1, 'تمرير أفقي ' + over);
  noErrors(errors, 'emp misc'); await ctx.close();
});
