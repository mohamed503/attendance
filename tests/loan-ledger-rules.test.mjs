// قواعد دفتر السلف. تشغيل: npm run test:rules (محاكي Firestore)
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { loadRules } from './rules-helper.mjs';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'meqat-rules-test-ledger', firestore: { rules: loadRules('owner@example.com') } }); });
after(async () => { await env.cleanup(); });
const fs = uid => env.authenticatedContext(uid, { email: uid + '@example.com', email_verified: true }).firestore();
const by = uid => ({ uid, name: uid });
const led = (db, lid, empId = 'e1') => doc(db, 'employees', empId, 'loanLedger', lid);
const entry = (uid, over = {}) => ({ by: by(uid), at: serverTimestamp(), ...over });

async function seed(runStatus = 'approved', dedLoan = 150) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [id, role] of [['sup', 'super_admin'], ['pay', 'payroll_admin'], ['hr', 'hr_admin'], ['aud', 'auditor']]) await setDoc(doc(db, 'admins', id), { name: id, email: id + '@example.com', role });
    await setDoc(doc(db, 'employees', 'e1'), { name: 'م', active: true, empType: 'staff', loanTotal: 500, loanInst: 150 });
    await setDoc(doc(db, 'payrollRuns', 'r1'), { from: '2026-10-01', to: '2026-10-31', status: runStatus, createdBy: by('pay'), createdAt: new Date(), totals: { net: 1 }, empCount: 1 });
    await setDoc(doc(db, 'payrollRuns', 'r1', 'rows', 'e1'), { empId: 'e1', net: 2000, dedLoan });
  });
}
const inst = (uid, over = {}) => entry(uid, { type: 'installment', delta: -150, balanceAfter: 350, runId: 'r1', ...over });

// ---- القراءة
test('الرواتب والمدير يقرآن الدفتر', async () => {
  await seed(); await assertSucceeds(setDoc(led(fs('sup'), 'opening'), entry('sup', { type: 'opening', delta: 500, balanceAfter: 500 })));
  await assertSucceeds(getDoc(led(fs('pay'), 'opening'))); await assertSucceeds(getDocs(collection(fs('sup'), 'employees', 'e1', 'loanLedger')));
});
for (const u of ['hr', 'aud']) test(`${u} لا يقرأ الدفتر`, async () => {
  await seed(); await env.withSecurityRulesDisabled(async c => setDoc(led(c.firestore(), 'opening'), { type: 'opening', delta: 500, balanceAfter: 500, by: by('sup'), at: new Date() }));
  await assertFails(getDoc(led(fs(u), 'opening')));
});

// ---- الافتتاحي
test('قيد افتتاحي صحيح بمعرّف opening', async () => { await seed(); await assertSucceeds(setDoc(led(fs('sup'), 'opening'), entry('sup', { type: 'opening', delta: 500, balanceAfter: 500 }))); });
test('الافتتاحي: معرّف خاطئ أو delta≠balance يُرفض', async () => {
  await seed();
  await assertFails(setDoc(led(fs('sup'), 'x1'), entry('sup', { type: 'opening', delta: 500, balanceAfter: 500 })));
  await assertFails(setDoc(led(fs('sup'), 'opening'), entry('sup', { type: 'opening', delta: 500, balanceAfter: 400 })));
});
test('لا تكرار: قيد افتتاحي ثانٍ يُرفض (تعديل ممنوع)', async () => {
  await seed(); await assertSucceeds(setDoc(led(fs('sup'), 'opening'), entry('sup', { type: 'opening', delta: 500, balanceAfter: 500 })));
  await assertFails(setDoc(led(fs('sup'), 'opening'), entry('sup', { type: 'opening', delta: 900, balanceAfter: 900 })));
});

// ---- السلفة الجديدة
test('سلفة بمعرّف grant_<طلب>', async () => { await seed(); await assertSucceeds(setDoc(led(fs('pay'), 'grant_q1'), entry('pay', { type: 'grant', delta: 200, balanceAfter: 700, reqId: 'q1' }))); });
test('سلفة: معرّف لا يطابق الطلب أو مبلغ سالب يُرفض', async () => {
  await seed();
  await assertFails(setDoc(led(fs('pay'), 'grant_zzz'), entry('pay', { type: 'grant', delta: 200, balanceAfter: 700, reqId: 'q1' })));
  await assertFails(setDoc(led(fs('pay'), 'grant_q1'), entry('pay', { type: 'grant', delta: -200, balanceAfter: 300, reqId: 'q1' })));
});

// ---- القسط
test('قسط مطابق لصف المسيّر المعتمد', async () => { await seed('approved'); await assertSucceeds(setDoc(led(fs('sup'), 'inst_r1'), inst('sup'))); });
test('قسط على مسيّر مصروف أيضًا مقبول', async () => { await seed('paid'); await assertSucceeds(setDoc(led(fs('pay'), 'inst_r1'), inst('pay'))); });
test('قسط على مسودة مرفوض', async () => { await seed('draft'); await assertFails(setDoc(led(fs('sup'), 'inst_r1'), inst('sup'))); });
test('قسط بمبلغ يخالف صف المسيّر مرفوض', async () => { await seed('approved'); await assertFails(setDoc(led(fs('sup'), 'inst_r1'), inst('sup', { delta: -100, balanceAfter: 400 }))); });
test('قسط بمعرّف لا يطابق المسيّر أو بقيمة موجبة مرفوض', async () => {
  await seed('approved');
  await assertFails(setDoc(led(fs('sup'), 'inst_other'), inst('sup')));
  await assertFails(setDoc(led(fs('sup'), 'inst_r1'), inst('sup', { delta: 150, balanceAfter: 650 })));
});
test('لا خصم مرتين: القسط الثاني لنفس المسيّر يُرفض', async () => {
  await seed('approved'); await assertSucceeds(setDoc(led(fs('sup'), 'inst_r1'), inst('sup')));
  await assertFails(setDoc(led(fs('sup'), 'inst_r1'), inst('sup')));
});
test('تكرار القسط لا يترك قيدًا ثانيًا ولا يغيّر الرصيد', async () => {
  await seed('approved');
  await assertSucceeds(setDoc(led(fs('pay'), 'inst_r1'), inst('pay')));
  await assertFails(setDoc(led(fs('pay'), 'inst_r1'), inst('pay', { balanceAfter: 200 })));
  await assertFails(updateDoc(led(fs('pay'), 'inst_r1'), { delta: -50, balanceAfter: 450 }));
  const snap = await getDocs(collection(fs('sup'), 'employees', 'e1', 'loanLedger'));
  assert.equal(snap.size, 1);
  assert.equal(snap.docs[0].data().balanceAfter, 350);
  assert.equal(snap.docs[0].data().delta, -150);
});
test('بعد القسط يبقى الرصيد قابلًا للحركة: سلفة جديدة تُبنى على الرصيد الناتج', async () => {
  await seed('approved');
  await assertSucceeds(setDoc(led(fs('pay'), 'inst_r1'), inst('pay')));
  await assertSucceeds(setDoc(led(fs('pay'), 'grant_q2'), entry('pay', { type: 'grant', delta: 200, balanceAfter: 550, reqId: 'q2' })));
  const snap = await getDocs(collection(fs('sup'), 'employees', 'e1', 'loanLedger'));
  assert.equal(snap.size, 2);
  assert.deepEqual(snap.docs.map(d => d.data().balanceAfter).sort((a, b) => a - b), [350, 550]);
});
test('قسط على مسيّر مصروف: مرة واحدة فقط', async () => {
  await seed('paid');
  await assertSucceeds(setDoc(led(fs('pay'), 'inst_r1'), inst('pay')));
  await assertFails(setDoc(led(fs('sup'), 'inst_r1'), inst('sup')));
});
test('قسط لموظف ليس له صف في المسيّر مرفوض', async () => {
  await seed('approved'); await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'employees', 'e2'), { name: 'ب', active: true }));
  await assertFails(setDoc(led(fs('sup'), 'inst_r1', 'e2'), inst('sup')));
});

// ---- التسوية
test('تسوية بسبب مكتوب', async () => { await seed(); await assertSucceeds(setDoc(led(fs('pay'), 'a1'), entry('pay', { type: 'adjust', delta: -50, balanceAfter: 450, note: 'تصحيح خطأ إدخال' }))); });
test('تسوية بلا سبب أو بسبب قصير أو بقيمة صفر مرفوضة', async () => {
  await seed();
  await assertFails(setDoc(led(fs('pay'), 'a1'), entry('pay', { type: 'adjust', delta: -50, balanceAfter: 450 })));
  await assertFails(setDoc(led(fs('pay'), 'a2'), entry('pay', { type: 'adjust', delta: -50, balanceAfter: 450, note: 'x' })));
  await assertFails(setDoc(led(fs('pay'), 'a3'), entry('pay', { type: 'adjust', delta: 0, balanceAfter: 500, note: 'لا تغيير' })));
});

// ---- عام
test('لا تعديل ولا حذف لأي قيد حتى للمدير العام', async () => {
  await seed(); await assertSucceeds(setDoc(led(fs('sup'), 'a1'), entry('sup', { type: 'adjust', delta: 10, balanceAfter: 510, note: 'سبب مكتوب' })));
  await assertFails(updateDoc(led(fs('sup'), 'a1'), { delta: 99 })); await assertFails(deleteDoc(led(fs('sup'), 'a1')));
});
test('by/at مزيفان أو رصيد سالب أو حقل زائد مرفوض', async () => {
  await seed();
  await assertFails(setDoc(led(fs('pay'), 'a1'), entry('pay', { type: 'adjust', delta: 5, balanceAfter: 505, note: 'سبب مكتوب', by: by('sup') })));
  await assertFails(setDoc(led(fs('pay'), 'a2'), entry('pay', { type: 'adjust', delta: -900, balanceAfter: -400, note: 'سبب مكتوب' })));
  await assertFails(setDoc(led(fs('pay'), 'a3'), entry('pay', { type: 'adjust', delta: 5, balanceAfter: 505, note: 'سبب مكتوب', hacked: 1 })));
  await assertFails(setDoc(led(fs('pay'), 'a4'), { type: 'adjust', delta: 5, balanceAfter: 505, note: 'سبب مكتوب', by: by('pay'), at: new Date('2020-01-01') }));
});
for (const u of ['hr', 'aud']) test(`${u} لا يكتب في الدفتر`, async () => { await seed(); await assertFails(setDoc(led(fs(u), 'a1'), entry(u, { type: 'adjust', delta: 5, balanceAfter: 505, note: 'سبب مكتوب' }))); });
