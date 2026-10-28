// اختبارات حسابات الحضور والرواتب على الشيفرة الفعلية (computeSummary + payrollRows).
// الأرقام المتوقعة محسوبة يدويًا في التعليقات. فترة الاختبار: أكتوبر 2026 (31 يومًا، 21 يوم عمل أحد–خميس، 10 أيام راحة).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, punch, fixedSched, workDays, dayKeys, row, at } from './payroll-harness.mjs';

const near = (a, b, eps = 0.01, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} المتوقع ${b} والفعلي ${a}`);
const WD = workDays();                         // 21 يوم عمل
const MON = (over = {}) => ({ id: 'e1', name: 'موظف', active: true, payMode: 'monthly', payAmount: 3100, scheduleId: 'sc1', startDate: '2026-01-01', ...over });
const HR = (over = {}) => MON({ payMode: 'hourly', payAmount: 20, ...over });
function setup({ emp = MON(), sched = fixedSched(), days = WD, inH = 8, outH = 16, extraRecs = [], skip = [], S = {} } = {}) {
  const env = makeEnv(S);
  env.S.scheds = [sched]; env.S.emps = [emp];
  env.S.recs = [...days.filter(k => !skip.includes(k)).flatMap(k => punch(emp.id, k, inH, outH)), ...extraRecs];
  return env;
}
const leave = (from, to, payPct, id = 'e1') => ({ empId: id, kind: 'leave', from, to, payPct, type: payPct === 0 ? 'unpaid' : 'annual' });

/* ============ راتب شهري: 3100 د.ل ÷ 31 يومًا = 100 د.ل/يوم، وساعة الدوام (8 س) = 12.5 ============ */
test('شهري: حضور كامل = الراتب كاملًا', () => {
  const r = row(setup(), 'e1');
  near(r.base, 3100); near(r.net, 3100); assert.equal(r.absent, 0); assert.equal(r.payDays, 31);
});
test('شهري: غياب يومين = خصم 200', () => {
  const r = row(setup({ skip: [WD[3], WD[4]] }), 'e1');
  assert.equal(r.absent, 2); near(r.dedAbs, 200); near(r.net, 2900);
});
test('شهري: إجازة بلا راتب 3 أيام عمل (11–13 أكتوبر) = خصم 300', () => {
  const env = setup({ skip: ['2026-10-11', '2026-10-12', '2026-10-13'], S: { leaves: [leave('2026-10-11', '2026-10-13', 0)] } });
  const r = row(env, 'e1'); near(r.dedAbs, 300); assert.equal(r.unpaidDays, 3); assert.equal(r.absent, 0); near(r.net, 2800);
});
test('شهري: إجازة مدفوعة بالكامل بلا خصم', () => {
  const env = setup({ skip: ['2026-10-11', '2026-10-12'], S: { leaves: [leave('2026-10-11', '2026-10-12', 100)] } });
  near(row(env, 'e1').net, 3100);
});
test('شهري: إجازة بنصف الراتب يومان = خصم 100', () => {
  const env = setup({ skip: ['2026-10-11', '2026-10-12'], S: { leaves: [leave('2026-10-11', '2026-10-12', 50)] } });
  near(row(env, 'e1').dedAbs, 100);
});
test('شهري: إجازة تمتد على أيام راحة لا تُخصم عنها', () => {
  // 8–14 أكتوبر: أحد→أربعاء عمل (8 خميس.. نحسب): 8 خميس عمل، 9–10 جمعة/سبت راحة، 11–14 أحد→أربعاء عمل = 5 أيام عمل
  const skip = ['2026-10-08', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'];
  const r = row(setup({ skip, S: { leaves: [leave('2026-10-08', '2026-10-14', 0)] } }), 'e1');
  near(r.dedAbs, 500); assert.equal(r.unpaidDays, 5);
});
test('شهري: تأخير 30 دقيقة (دوام 08:00، سماح 10) = 6.25', () => {
  const env = setup({ days: WD.slice(1) , extraRecs: punch('e1', WD[0], 8.5, 16) });
  const r = row(env, 'e1'); near(r.dedLate, 6.25); near(r.net, 3093.75);
});
test('شهري: تأخير ضمن السماح (7 دقائق) بلا خصم', () => {
  const env = setup({ days: WD.slice(1), extraRecs: punch('e1', WD[0], 8 + 7 / 60, 16) });
  near(row(env, 'e1').dedLate, 0);
});
test('شهري: انصراف مبكر ساعة = 12.5', () => {
  const env = setup({ days: WD.slice(1), extraRecs: punch('e1', WD[0], 8, 15) });
  near(row(env, 'e1').dedEarly, 12.5); near(row(env, 'e1').net, 3087.5);
});
test('شهري: إضافي يوم عمل 10 ساعات (معامل 1.5) = ساعتان × 1.5 × 12.5 = 37.5', () => {
  const env = setup({ days: WD.slice(1), extraRecs: punch('e1', WD[0], 8, 18) });
  const r = row(env, 'e1'); near(r.otEq, 3); near(r.otPay, 37.5); near(r.net, 3137.5);
});
test('شهري: عمل يوم راحة (6 ساعات) بسياسة all معامل 2 = 12 س × 12.5 = 150', () => {
  const env = setup({ extraRecs: punch('e1', '2026-10-23', 8, 14) });
  near(row(env, 'e1').otPay, 150); near(row(env, 'e1').net, 3250);
});
test('شهري: عمل يوم راحة بسياسة normal = بلا إضافي', () => {
  const sc = fixedSched('08:00', '16:00', [0, 1, 2, 3, 4], { ot: { restMode: 'normal' } });
  const env = setup({ sched: sc, extraRecs: punch('e1', '2026-10-23', 8, 14) });
  near(row(env, 'e1').otPay, 0); near(row(env, 'e1').net, 3100);
});
test('شهري: عطلة رسمية لم يعمل فيها = لا غياب ولا خصم', () => {
  const env = setup({ skip: ['2026-10-14'], S: { holKeys: ['2026-10-14'] } });
  const r = row(env, 'e1'); assert.equal(r.absent, 0); near(r.net, 3100);
});
test('شهري: عمل في عطلة رسمية 8 ساعات بمعامل 2 = 16 × 12.5 = 200', () => {
  const env = setup({ S: { holKeys: ['2026-10-14'] } });
  near(row(env, 'e1').otPay, 200); near(row(env, 'e1').net, 3300);
});
test('شهري: نسيان انصراف — الافتراضي بلا خصم، 0.5 = خصم 50، 1 = خصم 100', () => {
  const mk = fd => setup({ days: WD.slice(1), extraRecs: punch('e1', WD[0], 8, null), S: { set: { forgotDeductDays: fd } } });
  let r = row(mk(undefined), 'e1'); assert.equal(r.absent, 0); near(r.dedForgot, 0); near(r.net, 3100);
  r = row(mk(0.5), 'e1'); near(r.dedForgot, 50); near(r.net, 3050);
  r = row(mk(1), 'e1'); near(r.dedForgot, 100); near(r.net, 3000);
});
test('شهري: تعيين منتصف الشهر (16 أكتوبر) = 16 يومًا × 100، ولا غياب قبل التعيين', () => {
  const env = setup({ emp: MON({ startDate: '2026-10-16' }), days: workDays([0, 1, 2, 3, 4], '2026-10-16') });
  const r = row(env, 'e1'); assert.equal(r.payDays, 16); near(r.base, 1600); assert.equal(r.absent, 0);
});
test('شهري: موظف أُوقف في 20 أكتوبر يُدفع له حتى 20 (وصفيًا: يوم الإيقاف محسوب)', () => {
  const emp = MON({ active: false, archivedAt: { toDate: () => at('2026-10-20', 12) } });
  const r = row(setup({ emp, days: workDays([0, 1, 2, 3, 4], '2026-10-01', '2026-10-19') }), 'e1');
  assert.equal(r.payDays, 20); near(r.base, 2000); assert.equal(r.absent, 0);
});
test('شهري: بدلات وعلاوة وجزاء وقسط سلفة', () => {
  const r = row(setup({ emp: MON({ allowance: 200, bonus: 100, penalty: 50, loanTotal: 500, loanInst: 150 }) }), 'e1');
  near(r.allowBonus, 300); near(r.dedLoan, 150); near(r.dedPen, 50); near(r.net, 3100 + 300 - 50 - 150);
});
test('شهري: قسط السلفة لا يتجاوز المتبقي', () => near(row(setup({ emp: MON({ loanTotal: 100, loanInst: 150 }) }), 'e1').dedLoan, 100));
test('شهري: الصافي لا يقل عن صفر', () => assert.equal(row(setup({ emp: MON({ payAmount: 1000, penalty: 5000 }) }), 'e1').net, 0));
test('شهري: جدول 7 أيام وغياب كل الشهر = الصافي صفر (الخصم لا يتجاوز الأساس)', () => {
  const sc = fixedSched('08:00', '16:00', [0, 1, 2, 3, 4, 5, 6]);
  const r = row(setup({ sched: sc, days: [] }), 'e1'); near(r.dedAbs, 3100); assert.equal(r.net, 0);
});
test('شهري: الفترة العابرة لشهرين تُوزَّع بأيام كل شهر (15 أكتوبر–14 نوفمبر، 3000)', () => {
  // 17 يومًا من أكتوبر (31) + 14 يومًا من نوفمبر (30): 17×3000/31 + 14×100
  const env = setup({ emp: MON({ payAmount: 3000 }), days: [], S: { from: '2026-10-15', to: '2026-11-14', leaves: [] } });
  env.S.recs = workDays([0, 1, 2, 3, 4], '2026-10-15', '2026-11-04').flatMap(k => punch('e1', k, 8, 16));
  near(row(env, 'e1').base, 17 * 3000 / 31 + 14 * 100, 0.01);
});
test('شهري: فبراير 28 يومًا — الخصم اليومي = الراتب ÷ 28', () => {
  const env = setup({ emp: MON({ payAmount: 2800 }), days: [], S: { from: '2026-02-01', to: '2026-02-28' } });
  const wd = workDays([0, 1, 2, 3, 4], '2026-02-01', '2026-02-28'); env.S.recs = wd.slice(1).flatMap(k => punch('e1', k, 8, 16));
  const r = row(env, 'e1'); near(r.base, 2800); near(r.dedAbs, 100); assert.equal(r.absent, 1);
});
test('شهري: الأيام المستقبلية بلا بصمات لا تُحتسب غيابًا (معاينة الشهر قبل انتهائه)', () => {
  // «الآن» = 5 نوفمبر؛ الفترة كل نوفمبر. الحضور من 1 إلى 5 فقط. الأيام بعد اليوم لا تُخصم.
  const env = setup({ emp: MON({ payAmount: 3000 }), days: [], S: { from: '2026-11-01', to: '2026-11-30' } });
  env.S.recs = workDays([0, 1, 2, 3, 4], '2026-11-01', '2026-11-04').flatMap(k => punch('e1', k, 8, 16)).concat(punch('e1', '2026-11-05', 8, null));
  const r = row(env, 'e1'); assert.equal(r.absent, 0); near(r.dedAbs, 0); near(r.net, 3000);
});

/* ============ راتب بالساعة: 20 د.ل/ساعة ============ */
test('بالساعة: 21 يومًا × 8 ساعات = 168 ساعة = 3360', () => {
  const r = row(setup({ emp: HR() }), 'e1'); near(r.paidH, 168); near(r.base, 3360); near(r.net, 3360); near(r.dedLate, 0);
});
test('بالساعة: دوام 12 ساعة (07–19) × 21 يومًا = 252 ساعة = 5040', () => {
  const r = row(setup({ emp: HR(), sched: fixedSched('07:00', '19:00'), inH: 7, outH: 19 }), 'e1');
  near(r.paidH, 252); near(r.net, 5040); near(r.otPay, 0);
});
test('بالساعة: دوام 24 ساعة (مرن) = 24 ساعة = 480 ولا يُعد نسيانًا', () => {
  const sc = fixedSched('08:00', '16:00', [0, 1, 2, 3, 4], { mode: 'flex' });
  Object.values(sc.days).forEach(d => { d.h = 24; });
  const env = setup({ emp: HR(), sched: sc, days: [], extraRecs: punch('e1', '2026-10-04', 8, 32) });
  const r = row(env, 'e1'); near(r.paidH, 24); near(r.base, 480); assert.equal(r.forgotDays ?? 0, 0);
});
test('بالساعة: وردية ليلية 22:00–06:00 × 3 أيام = 24 ساعة = 480 (تُنسب ليوم البدء)', () => {
  const sc = fixedSched('22:00', '06:00');
  const env = setup({ emp: HR(), sched: sc, days: [], extraRecs: ['2026-10-04', '2026-10-05', '2026-10-06'].flatMap(k => punch('e1', k, 22, 30)) });
  const r = row(env, 'e1'); near(r.paidH, 24); near(r.net, 480);
});
test('بالساعة: دوام مقسّم 08–12 و16–20 = 8 ساعات = 160', () => {
  const sc = fixedSched('08:00', '12:00'); Object.values(sc.days).forEach(d => { d.p = [{ s: '08:00', e: '12:00' }, { s: '16:00', e: '20:00' }]; });
  const env = setup({ emp: HR(), sched: sc, days: [], extraRecs: [...punch('e1', '2026-10-04', 8, 12), ...punch('e1', '2026-10-04', 16, 20)] });
  near(row(env, 'e1').paidH, 8); near(row(env, 'e1').net, 160);
});
test('بالساعة: استراحة 60 دقيقة تُخصم (9 ساعات خام = 8 صافي)', () => {
  const sc = fixedSched('08:00', '16:00', [0, 1, 2, 3, 4], { breakMin: 60 });
  const env = setup({ emp: HR(), sched: sc, days: [], extraRecs: punch('e1', '2026-10-04', 8, 17) });
  near(row(env, 'e1').paidH, 8);
});
test('بالساعة: إضافي يوم عمل 10 ساعات = 8 عادية (160) + 3 مكافئة (60) = 220', () => {
  const env = setup({ emp: HR(), days: [], extraRecs: punch('e1', '2026-10-04', 8, 18) });
  const r = row(env, 'e1'); near(r.paidH, 8); near(r.base, 160); near(r.otPay, 60); near(r.net, 220);
});
test('بالساعة: يوم راحة 6 ساعات: all = 240 إضافي بلا عادي، normal = 120 عادي', () => {
  let r = row(setup({ emp: HR(), days: [], extraRecs: punch('e1', '2026-10-23', 8, 14) }), 'e1');
  near(r.paidH, 0); near(r.otPay, 240); near(r.net, 240);
  const sc = fixedSched('08:00', '16:00', [0, 1, 2, 3, 4], { ot: { restMode: 'normal' } });
  r = row(setup({ emp: HR(), sched: sc, days: [], extraRecs: punch('e1', '2026-10-23', 8, 14) }), 'e1');
  near(r.paidH, 6); near(r.base, 120); near(r.otPay, 0);
});
test('بالساعة: يوم راحة 10 ساعات بسياسة afterBase = 8 عادية + ساعتان × 2 × 20 = 160 + 80', () => {
  const sc = fixedSched('08:00', '16:00', [0, 1, 2, 3, 4], { ot: { restMode: 'afterBase' } });
  const r = row(setup({ emp: HR(), sched: sc, days: [], extraRecs: punch('e1', '2026-10-23', 8, 18) }), 'e1');
  near(r.paidH, 8); near(r.base, 160); near(r.otPay, 80); near(r.net, 240);
});
test('بالساعة: إجازة مدفوعة يومان = 2 × 8 × 20 = 320، وبلا راتب = 0', () => {
  const skip = ['2026-10-11', '2026-10-12'];
  let env = setup({ emp: HR(), days: skip, skip, S: { leaves: [leave('2026-10-11', '2026-10-12', 100)] } });
  near(row(env, 'e1').base, 320);
  env = setup({ emp: HR(), days: skip, skip, S: { leaves: [leave('2026-10-11', '2026-10-12', 0)] } });
  near(row(env, 'e1').base, 0);
});
test('بالساعة: الغياب لا يُدفع ولا يُخصم', () => {
  const r = row(setup({ emp: HR(), days: WD.slice(0, 20) }), 'e1'); near(r.base, 3200); near(r.dedAbs, 0); assert.equal(r.absent, 1);
});
test('بالساعة: نسيان انصراف يوم واحد: يُدفع اليوم المخطط (160) ويُخصم الكسر المحدد', () => {
  const mk = fd => setup({ emp: HR(), days: [], extraRecs: punch('e1', '2026-10-04', 8, null), S: { set: { forgotDeductDays: fd } } });
  let r = row(mk(0), 'e1'); near(r.base, 160); near(r.dedForgot, 0); near(r.net, 160);
  r = row(mk(0.5), 'e1'); near(r.dedForgot, 80); near(r.net, 80);
  r = row(mk(1), 'e1'); near(r.net, 0);
});
test('بالساعة: جلسة مفتوحة اليوم (قبل المهلة) تُحتسب حتى «الآن» (8:00 → 12:00 = 4 س = 80)', () => {
  const env = setup({ emp: HR(), days: [], extraRecs: punch('e1', '2026-11-05', 8, null), S: { from: '2026-11-05', to: '2026-11-05' } });
  near(row(env, 'e1').paidH, 4); near(row(env, 'e1').net, 80);
});

/* ============ استقطاعات قانونية ============ */
test('استقطاعات ليبية: مثال محسوب يدويًا (3100، أعزب)', () => {
  // ضمان 5.125% = 158.875، تضامن 1% = 31، إعفاء 150 ← وعاء 2760.125
  // ضريبة = 1000×5% + 1760.125×10% = 226.0125 ؛ صافٍ مبدئي 2684.1125 ؛ دمغة 0.5% = 13.4205625
  const r = row(setup({ emp: MON({ lyStatutory: true, familyStatus: 'single' }) }), 'e1');
  const d = r.statDetail; near(d.inss, 158.875, 1e-6); near(d.solid, 31, 1e-6); near(d.incomeTax, 226.0125, 1e-6); near(d.stamp, 13.4205625, 1e-6);
  near(r.statDed, 429.3080625, 1e-6); near(r.net, 3100 - 429.3080625, 1e-6);
});
test('استقطاعات ليبية: الإعفاء العائلي 150/200/275', () => {
  const taxFor = ex => { const g = 3100, t = Math.max(0, g - g * 0.05125 - g * 0.01 - ex); return t <= 1000 ? t * 0.05 : 50 + (t - 1000) * 0.1; };
  for (const [fs, ex] of [['single', 150], ['married', 200], ['kids', 275]])
    near(row(setup({ emp: MON({ lyStatutory: true, familyStatus: fs }) }), 'e1').statDetail.incomeTax, taxFor(ex), 1e-6);
});
test('استقطاعات ليبية: راتب صغير بلا ضريبة دخل (100)', () => {
  const r = row(setup({ emp: MON({ payAmount: 100, lyStatutory: true }), days: [], S: { from: '2026-10-01', to: '2026-10-31' } }), 'e1');
  // إن غاب كل أيام العمل يُخصم الأساس كله فيكون الإجمالي 0؛ نختبر الدالة عبر حضور كامل
  const full = row(setup({ emp: MON({ payAmount: 100, lyStatutory: true }) }), 'e1');
  near(full.statDetail.incomeTax, 0); near(full.statDetail.total, 100 * 0.05125 + 1 + (100 - 5.125 - 1) * 0.005, 1e-6); assert.ok(r.net >= 0);
});

/* ============ مهام وعزل الموظفين ============ */
test('موظف مهام: الراتب = مجموع المهام المعتمدة داخل الفترة فقط', () => {
  const env = makeEnv(); env.S.scheds = [fixedSched()];
  env.S.emps = [{ id: 't1', name: 'م', active: true, empType: 'task' }];
  env.S.reqs = [
    { kind: 'task', status: 'approved', empId: 't1', from: '2026-10-05', amount: 100, qty: 2 },
    { kind: 'task', status: 'approved', empId: 't1', from: '2026-10-20', amount: 50.5, qty: 1 },
    { kind: 'task', status: 'pending', empId: 't1', from: '2026-10-06', amount: 999, qty: 9 },
    { kind: 'task', status: 'approved', empId: 't1', from: '2026-11-02', amount: 777, qty: 7 },
    { kind: 'task', status: 'approved', empId: 'other', from: '2026-10-06', amount: 888, qty: 8 }
  ];
  near(row(env, 't1').net, 150.5);
});
test('عزل الموظفين: غياب أحدهم لا يؤثر على الآخر', () => {
  const env = makeEnv(); env.S.scheds = [fixedSched()];
  env.S.emps = [MON({ id: 'a' }), MON({ id: 'b' })];
  env.S.recs = [...WD.flatMap(k => punch('a', k, 8, 16)), ...WD.slice(2).flatMap(k => punch('b', k, 8, 16))];
  near(row(env, 'a').net, 3100); near(row(env, 'b').net, 2900);
});

/* ============ خصائص عامة (عشوائية بذرة ثابتة) ============ */
test('خصائص: الصافي ≥ 0 ويطابق معادلة المكونات لأي سيناريو عشوائي', () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let n = 0; n < 60; n++) {
    const hourly = rnd() < 0.5, amt = hourly ? 5 + Math.floor(rnd() * 30) : 800 + Math.floor(rnd() * 4000);
    const emp = (hourly ? HR : MON)({ payAmount: amt, allowance: Math.floor(rnd() * 300), bonus: Math.floor(rnd() * 200), penalty: Math.floor(rnd() * 400), loanTotal: Math.floor(rnd() * 600), loanInst: Math.floor(rnd() * 300), lyStatutory: rnd() < 0.4, familyStatus: ['single', 'married', 'kids'][Math.floor(rnd() * 3)] });
    const env = makeEnv({ set: { forgotDeductDays: [0, 0.25, 0.5, 1][Math.floor(rnd() * 4)] } });
    env.S.scheds = [fixedSched('08:00', '16:00', [0, 1, 2, 3, 4], { ot: { restMode: ['all', 'afterBase', 'normal', 'tiered', 'fixed'][Math.floor(rnd() * 5)] } })]; env.S.emps = [emp];
    env.S.recs = dayKeys().flatMap(k => { const x = rnd(); if (x < 0.15) return []; const inH = 7 + rnd() * 2.5, outH = x < 0.2 ? null : 14 + rnd() * 6; return punch('e1', k, inH, outH); });
    const r = row(env, 'e1');
    const expected = Math.max(0, Math.max(0, r.base + r.otPay + r.allowBonus - r.dedLate - r.dedEarly - r.dedAbs - r.dedForgot) - r.statDed - r.dedPen - r.dedLoan);
    assert.ok(r.net >= 0 && r.paidH >= 0 && r.base >= 0 && r.otPay >= 0, `سالب في السيناريو ${n}`);
    near(r.net, expected, 1e-6, `المعادلة في السيناريو ${n}`);
    assert.ok(Number.isFinite(r.net));
  }
});
