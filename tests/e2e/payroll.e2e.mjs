// اختبارات متصفح لمسار المسيّر والسلف (المرحلة 0): B1 وB4 وB6. تشغيل: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, startServer, openApp, sleep, buildSeed } from './harness.mjs';

let srv, url, browser;
before(async () => { ({ srv, url } = await startServer()); browser = await chromium.launch(); });
after(async () => { await browser.close(); srv.close(); });

const T = ms => ({ $ts: ms });
const adminReady = async page => { await page.waitForSelector('[data-tab]', { timeout: 10000 }); await page.waitForSelector('#content', { timeout: 10000 }); await sleep(500); };
const payrollTab = async page => { await page.click('[data-tab="recs"]'); await sleep(400); await page.click('[data-rsub="payroll"]'); await sleep(600); };
/* يوافق على كل نوافذ التأكيد/التنبيه التي تظهر حتى تهدأ الشاشة */
async function confirmAll(page, max = 6) {
  for (let i = 0; i < max; i++) {
    const dlg = await page.waitForSelector('.mq-dlg', { timeout: 2500 }).catch(() => null);
    if (!dlg) break;
    const btns = await page.$$('.mq-dlg [data-i]');
    await btns[btns.length - 1].click(); await sleep(450);
  }
}
const seedWithRun = (patchEmp = {}, rowPatch = {}) => {
  const seed = buildSeed();
  Object.assign(seed.docs['employees/e1'], { loanTotal: 500, loanInst: 150 }, patchEmp);
  seed.docs['payrollRuns/run1'] = { from: '2026-09-01', to: '2026-09-30', status: 'draft', empCount: 1, createdBy: 'asmaa', createdAt: T(Date.UTC(2026, 9, 1)), totals: { count: 1, net: 2250 }, inputs: { loanCount: 1, build: 'runs-2' } };
  seed.docs['payrollRuns/run1/rows/e1'] = { empId: 'e1', name: 'عبدالله الفيتوري', dept: 'المالية', base: 2400, otPay: 0, allowBonus: 300, dedLate: 0, dedEarly: 0, dedAbs: 0, dedForgot: 0, dedLoan: 150, dedPen: 0, statDed: 0, net: 2550, pm: 'monthly', ...rowPatch };
  return seed;
};

test('B1: اعتماد مسيّر فيه قسط سلفة يسجّل قيد القسط وينقص الرصيد', async () => {
  const { page, ctx, errors } = await openApp(browser, url, { seed: seedWithRun() }); await adminReady(page);
  await payrollTab(page);
  await page.click('[data-act="runApprove"][data-id="run1"]'); await confirmAll(page); await sleep(800);
  const st = await page.evaluate(() => ({
    run: window.__MQ.docs.get('payrollRuns/run1').status,
    led: window.__MQ.docs.get('employees/e1/loanLedger/inst_run1') || null,
    bal: window.__MQ.docs.get('employees/e1').loanTotal
  }));
  assert.equal(st.run, 'approved');
  assert.ok(st.led, 'لم يُسجَّل قيد القسط inst_run1');
  assert.equal(st.led.delta, -150); assert.equal(st.led.balanceAfter, 350); assert.equal(st.bal, 350);
  assert.deepEqual(errors, [], errors.join(' | ')); await ctx.close();
});

/* ---------- B3: وردية ليلية تبدأ في آخر يوم من الفترة ---------- */
const nightSeed = () => {
  const seed = buildSeed(); const days = {}; for (let i = 0; i < 7; i++) days[i] = { on: true, p: [{ s: '22:00', e: '06:00' }], h: 8 };
  seed.docs['schedules/night'] = { name: 'ليلي', mode: 'fixed', days, shifts: [], cycle: [], anchor: '2026-09-01', breakMin: 0, graceLate: 10, graceEarly: 10, graceMode: 'forgive' };
  seed.docs['employees/e7'] = { name: 'ليلى الليلي', dept: 'الأمن', jobTitle: 'حارس', phone: '218910000007', active: true, empType: 'staff', scheduleId: 'night', locs: [], uid: 'u-e7', devices: { 'dev-e7': 'u-e7' }, deviceId: 'dev-e7', maxDevices: 2, startDate: '2026-01-01', payMode: 'monthly', payAmount: 1800, state: 'out', createdAt: T(Date.UTC(2026, 0, 1)) };
  const rec = (id, type, ms) => { seed.docs['employees/e7/records/' + id] = { type, time: T(ms), lat: 32.8872, lng: 13.1913, accuracy: 12, distance: 20, locationId: 'loc1', locationName: 'المقر الرئيسي', empName: 'ليلى الليلي', deviceId: 'dev-e7' }; };
  rec('in1', 'in', Date.UTC(2026, 8, 30, 20, 0));    // 30/09 22:00 طرابلس
  rec('out1', 'out', Date.UTC(2026, 9, 1, 4, 0));    // 01/10 06:00 طرابلس
  return seed;
};
const setRange = async (page, from, to) => {
  await page.click('[data-tab="recs"]'); await sleep(400);
  await page.fill('#fFrom', from); await page.fill('#fTo', to); await page.click('[data-act="filter"]'); await sleep(900);
};
const rowOf = (page, name) => page.$$eval('#content tbody tr', (trs, n) => trs.filter(t => t.textContent.includes(n)).map(t => t.textContent.replace(/\s+/g, ' ').trim()), name);

test('B3: وردية 22:00–06:00 في آخر يوم من الفترة لا تُحسب «نسي الانصراف»', async () => {
  const { page, ctx, errors } = await openApp(browser, url, { seed: nightSeed() }); await adminReady(page);
  await setRange(page, '2026-09-30', '2026-09-30');
  const rows = await rowOf(page, 'ليلى الليلي');
  assert.equal(rows.length, 1, 'صف واحد فقط (الذيل لا يضيف يوماً خارج الفترة): ' + rows.join(' | '));
  assert.ok(!rows.some(r => r.includes('نسي الانصراف')), 'احتُسبت نسياناً: ' + rows.join(' | '));
  assert.ok(rows.some(r => r.includes('حضور')), 'متوقع حالة حضور: ' + rows.join(' | '));
  assert.deepEqual(errors, [], errors.join(' | ')); await ctx.close();
});

/* ---------- B6: فشل تحميل الماليات لا يتحول إلى «محمّلة وفارغة» ---------- */
const finSeed = () => {
  const seed = buildSeed();
  Object.assign(seed.docs['employees/e1'], { finIsolated: true, payMode: null, payAmount: null, allowance: null });
  seed.docs['empFinance/e1'] = { payMode: 'monthly', payAmount: 2400, allowance: 300 };
  return seed;
};
test('B6: عند فشل تحميل empFinance يُمنع حفظ المسيّر ولا تُنشأ مسودة ببيانات ناقصة', async () => {
  const { page, ctx } = await openApp(browser, url, { seed: finSeed(), failPaths: ['empFinance'] }); await adminReady(page);
  await payrollTab(page);
  const btn = await page.$('[data-act="runSave"]'); assert.ok(btn, 'زر حفظ المسودة غير موجود');
  await btn.click(); await sleep(900);
  const created = await page.evaluate(() => [...window.__MQ.docs.keys()].filter(k => k.startsWith('payrollRuns/')));
  assert.deepEqual(created, [], 'أُنشئ مسيّر رغم فشل تحميل الماليات: ' + created.join(','));
  const toastTxt = await page.evaluate(() => document.body.textContent);
  assert.match(toastTxt, /تعذر تحميل البيانات المالية/, 'لم تظهر رسالة الخطأ');
  await ctx.close();
});
test('B6: عند نجاح التحميل يعمل حفظ المسودة كالمعتاد', async () => {
  const { page, ctx } = await openApp(browser, url, { seed: finSeed() }); await adminReady(page);
  await payrollTab(page);
  await page.click('[data-act="runSave"]'); await sleep(1200);
  const created = await page.evaluate(() => [...window.__MQ.docs.keys()].filter(k => /^payrollRuns\/[^/]+$/.test(k)));
  assert.equal(created.length, 1, 'لم تُنشأ مسودة: ' + created.join(','));
  await ctx.close();
});

/* ---------- B5: السلف عبر معاملات (Transactions) ---------- */
const loanReqSeed = (extraEmp = {}) => {
  const seed = buildSeed();
  Object.assign(seed.docs['employees/e1'], { loanTotal: 500, loanInst: 150 }, extraEmp);
  seed.docs['employees/e1/requests/loan1'] = { kind: 'loan', type: '200', typeName: '100', from: '2026-10-28', to: '2026-10-28', status: 'pending', empName: 'عبدالله الفيتوري', note: '', createdAt: T(Date.UTC(2026, 9, 27)) };
  return seed;
};
test('B5: منح سلفة يقرأ الرصيد طازجاً (لا يطغى على تعديل مدير آخر حدث بعد تحميل الصفحة)', async () => {
  const { page, ctx, errors } = await openApp(browser, url, { seed: loanReqSeed() }); await adminReady(page);
  // مدير آخر رفع الرصيد إلى 800 بعد أن حمّلت هذه الصفحة 500
  await page.evaluate(() => { window.__MQ.docs.get('employees/e1').loanTotal = 800; });
  await page.click('[data-tab="reqs"]'); await sleep(500);
  await page.click('[data-act="appr"][data-id="loan1"]'); await confirmAll(page); await sleep(900);
  const st = await page.evaluate(() => ({
    req: window.__MQ.docs.get('employees/e1/requests/loan1').status,
    emp: window.__MQ.docs.get('employees/e1'),
    led: window.__MQ.docs.get('employees/e1/loanLedger/grant_loan1') || null
  }));
  assert.equal(st.req, 'approved');
  assert.equal(st.emp.loanTotal, 1000, 'الرصيد الجديد = 800 الطازج + 200 (وليس 500 + 200)');
  assert.equal(st.emp.loanInst, 100);
  assert.ok(st.led && st.led.delta === 200 && st.led.balanceAfter === 1000, 'قيد المنح: ' + JSON.stringify(st.led));
  assert.deepEqual(errors, [], errors.join(' | ')); await ctx.close();
});
test('B5: طلب سلفة لم يعد معلّقاً لا يُمنح مرتين', async () => {
  const { page, ctx } = await openApp(browser, url, { seed: loanReqSeed() }); await adminReady(page);
  await page.click('[data-tab="reqs"]'); await sleep(500);
  // مدير آخر اعتمد الطلب قبل ضغطتنا
  await page.evaluate(() => { window.__MQ.docs.get('employees/e1/requests/loan1').status = 'approved'; });
  await page.click('[data-act="appr"][data-id="loan1"]'); await confirmAll(page); await sleep(800);
  const emp = await page.evaluate(() => window.__MQ.docs.get('employees/e1'));
  assert.equal(emp.loanTotal, 500, 'لم يجب أن يتغير الرصيد');
  assert.equal(await page.evaluate(() => window.__MQ.docs.has('employees/e1/loanLedger/grant_loan1')), false);
  await ctx.close();
});
test('B5: قسط المسيّر مع ماليات معزولة (empFinance) يُحدّث الرصيد في empFinance ويصفّر نسخة الموظف', async () => {
  const seed = seedWithRun({ finIsolated: true, loanTotal: null, loanInst: null });
  seed.docs['empFinance/e1'] = { payMode: 'monthly', payAmount: 2400, loanTotal: 500, loanInst: 150 };
  const { page, ctx, errors } = await openApp(browser, url, { seed }); await adminReady(page);
  await payrollTab(page);
  await page.click('[data-act="runApprove"][data-id="run1"]'); await confirmAll(page); await sleep(900);
  const st = await page.evaluate(() => ({ fin: window.__MQ.docs.get('empFinance/e1'), emp: window.__MQ.docs.get('employees/e1'), led: window.__MQ.docs.get('employees/e1/loanLedger/inst_run1') || null, run: window.__MQ.docs.get('payrollRuns/run1').status }));
  assert.equal(st.run, 'approved');
  assert.equal(st.fin.loanTotal, 350); assert.equal(st.emp.loanTotal, null);
  assert.ok(st.led && st.led.balanceAfter === 350, JSON.stringify(st.led));
  assert.deepEqual(errors, [], errors.join(' | ')); await ctx.close();
});
test('B5: إعادة تشغيل «قيود السلف» لا تكرر القسط', async () => {
  const { page, ctx } = await openApp(browser, url, { seed: seedWithRun() }); await adminReady(page);
  await payrollTab(page);
  await page.click('[data-act="runApprove"][data-id="run1"]'); await confirmAll(page); await sleep(900);
  await page.click('[data-act="runLedger"][data-id="run1"]'); await confirmAll(page); await sleep(800);
  assert.equal(await page.evaluate(() => window.__MQ.docs.get('employees/e1').loanTotal), 350, 'لا يُخصم القسط مرتين');
  await ctx.close();
});
