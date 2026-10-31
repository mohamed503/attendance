// وحدات المسيّر المجمّد: الترميز القانوني، البصمة، المجاميع، ولقطة الصف (مأخوذة حرفيًا من index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeEnv, punch, fixedSched, workDays, row } from './payroll-harness.mjs';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf('/*RUNS-START*/'), html.indexOf('/*RUNS-END*/'));
const R = new Function(src + '\nreturn { canon, runHash, runTotals, buildRunRow, sha256Hex };')();

test('canon: ترتيب المفاتيح لا يغيّر الناتج', () => {
  assert.equal(R.canon({ b: 1, a: [2, { d: 1, c: 2 }] }), R.canon({ a: [2, { c: 2, d: 1 }], b: 1 }));
  assert.equal(R.canon({ a: undefined }), '{"a":null}');
});
test('SHA-256 معروفة: "abc"', async () => {
  assert.equal(await R.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('runHash: مستقرة، لا تتأثر بترتيب الصفوف، وتتغير عند أي تعديل رقم', async () => {
  const rows = [{ id: 'b', data: { net: 10.5, name: 'ب' } }, { id: 'a', data: { net: 20, name: 'أ' } }];
  const h1 = await R.runHash(rows), h2 = await R.runHash([...rows].reverse());
  assert.equal(h1, h2); assert.match(h1, /^[0-9a-f]{64}$/);
  const tampered = [{ id: 'b', data: { net: 10.51, name: 'ب' } }, rows[1]];
  assert.notEqual(await R.runHash(tampered), h1);
  assert.notEqual(await R.runHash(rows.slice(0, 1)), h1);                  // حذف صف
  assert.notEqual(await R.runHash([...rows, { id: 'c', data: { net: 1 } }]), h1); // إضافة صف
});
test('runTotals: مجاميع مقرّبة لخانتين', () => {
  const t = R.runTotals([
    { base: 100.005, otPay: 10, allowBonus: 5, dedLate: 1, dedEarly: 2, dedAbs: 3, dedForgot: 4, statDed: 6, dedLoan: 7, dedPen: 8, net: 80.126 },
    { base: 50, net: 50 }
  ]);
  assert.equal(t.count, 2); assert.equal(t.base, 150.01); assert.equal(t.dedAtt, 10); assert.equal(t.net, 130.13); assert.equal(t.loan, 7);
});

function monthlyEnv(amount = 3100) {
  const env = makeEnv(); env.S.scheds = [fixedSched()];
  env.S.emps = [{ id: 'e1', name: 'موظف', active: true, payMode: 'monthly', payAmount: amount, scheduleId: 'sc1', startDate: '2026-01-01', loanTotal: 500, loanInst: 150, iban: 'LY00X' }];
  env.S.recs = workDays().flatMap(k => punch('e1', k, 8, 16)); return env;
}
test('لقطة الصف: JSON آمن وتحوي المدخلات وقت الحفظ', () => {
  const env = monthlyEnv(), live = row(env, 'e1');
  const snap = R.buildRunRow(live, env.S.emps[0], env.S.scheds);
  assert.equal(snap.net, live.net); assert.equal(snap.empId, 'e1');
  assert.equal(snap.inp.payAmount, 3100); assert.equal(snap.inp.loanInst, 150); assert.equal(snap.inp.sched.mode, 'fixed');
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);                 // لا undefined ولا دوال
  assert.ok(Object.values(snap).every(v => v === null || ['number', 'string', 'boolean', 'object'].includes(typeof v)));
});
test('التجميد: تغيير الراتب بعد الحفظ يغيّر الحساب الحي ولا يغيّر المسيّر المحفوظ', async () => {
  const env = monthlyEnv(3100), live = row(env, 'e1');
  const saved = R.buildRunRow(live, env.S.emps[0], env.S.scheds);
  const hashBefore = await R.runHash([{ id: 'e1', data: saved }]);
  env.S.emps[0].payAmount = 4000;                                           // رفع راتب بعد الإقفال
  const liveAfter = row(env, 'e1');
  assert.ok(liveAfter.net > live.net + 800);                                // الحي تغيّر (بأثر رجعي)
  assert.equal(saved.net, live.net);                                        // المحفوظ ثابت
  assert.equal(await R.runHash([{ id: 'e1', data: saved }]), hashBefore);   // والبصمة كذلك
  assert.equal(saved.inp.payAmount, 3100);                                  // وتُفسَّر الأرقام بالمدخل القديم
});
test('إجمالي المسيّر = مجموع صافي الموظفين الحيّ وقت الحفظ (عدة موظفين)', () => {
  const env = monthlyEnv();
  env.S.emps.push({ id: 'e2', name: 'ب', active: true, payMode: 'hourly', payAmount: 20, scheduleId: 'sc1', startDate: '2026-01-01' });
  env.S.recs.push(...workDays().flatMap(k => punch('e2', k, 8, 16)));
  const live = env.payrollRows().filter(r => r.pm !== 'none');
  const t = R.runTotals(live.map(r => R.buildRunRow(r, env.S.emps.find(e => e.id === r.empId), env.S.scheds)));
  assert.equal(t.count, 2); assert.ok(Math.abs(t.net - live.reduce((a, r) => a + r.net, 0)) < 0.011);
});
