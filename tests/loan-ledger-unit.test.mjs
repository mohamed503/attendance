// دفتر السلف: التخطيط والتحقق، ومحاكاة سداد سلفة عبر عدة مسيّرات بالحساب الفعلي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeEnv, punch, fixedSched, workDays, row } from './payroll-harness.mjs';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const src = 'const r2 = v => Math.round((+v || 0) * 100) / 100;\n' + cut('/*LEDGER-START*/', '/*LEDGER-END*/') + '\nreturn { planInstallments, verifyLedger };';
const { planInstallments, verifyLedger } = new Function(src)();
const BY = { uid: 'sup', name: 'sup' };

test('خطة قسط: delta = −القسط المحفوظ، والرصيد بعده = الرصيد − القسط، والمعرّف حتمي', () => {
  const p = planInstallments([{ empId: 'e1', name: 'م', dedLoan: 150 }], { e1: { loanTotal: 500 } }, 'run1', BY);
  assert.equal(p.problems.length, 0); assert.equal(p.items.length, 1);
  const it = p.items[0];
  assert.equal(it.id, 'inst_run1'); assert.equal(it.entry.delta, -150); assert.equal(it.entry.balanceAfter, 350); assert.equal(it.newBalance, 350);
  assert.equal(planInstallments([{ empId: 'e1', dedLoan: 150 }], { e1: { loanTotal: 500 } }, 'run1', BY).items[0].id, it.id);   // نفس المعرّف عند التكرار = رفض القاعدة للمكرر
});
test('صفوف بلا قسط لا تنتج قيودًا', () => {
  assert.equal(planInstallments([{ empId: 'e1', dedLoan: 0 }, { empId: 'e2' }], { e1: { loanTotal: 5 }, e2: {} }, 'r', BY).items.length, 0);
});
test('رصيد أقل من القسط المحفوظ أو موظف مفقود = مشكلة تمنع الاعتماد', () => {
  const p = planInstallments([{ empId: 'e1', name: 'أ', dedLoan: 150 }, { empId: 'e2', name: 'ب', dedLoan: 10 }], { e1: { loanTotal: 100 }, e2: null }, 'r', BY);
  assert.equal(p.problems.length, 2); assert.equal(p.items.length, 0);
});
test('القسط الأخير يصفّر الرصيد بلا سالب', () => {
  const p = planInstallments([{ empId: 'e1', dedLoan: 50 }], { e1: { loanTotal: 50 } }, 'r', BY);
  assert.equal(p.items[0].newBalance, 0);
});
const E = (type, delta, balanceAfter, atMs) => ({ type, delta, balanceAfter, atMs });
test('verifyLedger: سلسلة سليمة تطابق الرصيد الحالي', () => {
  const v = verifyLedger([E('opening', 500, 500, 1), E('installment', -150, 350, 2), E('grant', 200, 550, 3), E('adjust', -50, 500, 4)], 500);
  assert.equal(v.ok, true); assert.equal(v.balance, 500);
});
test('verifyLedger: تلاعب بالرصيد الحالي أو بقيد يُكشف', () => {
  assert.equal(verifyLedger([E('opening', 500, 500, 1), E('installment', -150, 350, 2)], 340).ok, false);       // رصيد معدّل يدويًا
  assert.equal(verifyLedger([E('opening', 500, 500, 1), E('installment', -150, 300, 2)], 300).ok, false);       // قيد لا يتبع سابقه
  assert.equal(verifyLedger([], 120).ok, false);                                                                   // رصيد بلا افتتاحي
  assert.equal(verifyLedger([], 0).ok, true);
});
test('verifyLedger: قيود بنفس الوقت تُرتَّب افتتاحي ثم سلفة ثم تسوية ثم قسط', () => {
  assert.equal(verifyLedger([E('installment', -100, 400, 5), E('opening', 500, 500, 5)], 400).ok, true);
});

/* ---- محاكاة: سلفة 500 بقسط 150 تُسدَّد عبر مسيّرات متتالية بالحساب الفعلي ---- */
function dedFor(loanTotal, loanInst) {
  const env = makeEnv(); env.S.scheds = [fixedSched()];
  env.S.emps = [{ id: 'e1', name: 'م', active: true, payMode: 'monthly', payAmount: 3100, scheduleId: 'sc1', startDate: '2026-01-01', loanTotal, loanInst }];
  env.S.recs = workDays().flatMap(k => punch('e1', k, 8, 16));
  return row(env, 'e1');
}
test('سلفة 500 بقسط 150: 150 ثم 150 ثم 150 ثم 50 ثم لا شيء، والرصيد يصل صفرًا بالضبط', () => {
  let bal = 500; const log = [], entries = [{ type: 'opening', delta: 500, balanceAfter: 500, atMs: 0 }];
  for (let m = 1; m <= 5; m++) {
    const r = dedFor(bal, 150), plan = planInstallments([r], { e1: { loanTotal: bal } }, 'run' + m, BY);
    const d = r.dedLoan; log.push(d);
    if (d > 0) { assert.equal(plan.items.length, 1); bal = plan.items[0].newBalance; entries.push({ ...plan.items[0].entry, atMs: m }); }
    else assert.equal(plan.items.length, 0);
    assert.ok(r.net > 0);
  }
  assert.deepEqual(log, [150, 150, 150, 50, 0]); assert.equal(bal, 0);
  const v = verifyLedger(entries, bal); assert.equal(v.ok, true, v.problems.join('|'));
});
test('تكرار الاعتماد/الطباعة لا يخصم مرتين: المعرّف واحد لكل (مسيّر، موظف)', () => {
  const a = planInstallments([{ empId: 'e1', dedLoan: 150 }], { e1: { loanTotal: 500 } }, 'runX', BY).items[0].id;
  const b = planInstallments([{ empId: 'e1', dedLoan: 150 }], { e1: { loanTotal: 350 } }, 'runX', BY).items[0].id;
  assert.equal(a, b);       // القاعدة تقبل أول create فقط
});
