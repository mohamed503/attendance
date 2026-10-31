// قواعد المسيّرات المجمّدة. تشغيل: npm run test:rules (محاكي Firestore)
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { loadRules } from './rules-helper.mjs';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'meqat-rules-test-runs', firestore: { rules: loadRules('owner@example.com') } }); });
after(async () => { await env.cleanup(); });
const fs = uid => env.authenticatedContext(uid, { email: uid + '@example.com', email_verified: true }).firestore();
const by = uid => ({ uid, name: uid });
const HASH = 'a'.repeat(64);
const draft = (uid = 'pay', over = {}) => ({ from: '2026-10-01', to: '2026-10-31', status: 'draft', createdBy: by(uid), createdAt: serverTimestamp(), totals: { net: 100, count: 1 }, inputs: {}, empCount: 1, ...over });

async function seed(runStatus = null, extra = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [id, role] of [['sup', 'super_admin'], ['pay', 'payroll_admin'], ['hr', 'hr_admin'], ['aud', 'auditor'], ['mgr', 'manager']])
      await setDoc(doc(db, 'admins', id), { name: id, email: id + '@example.com', role, ...(role === 'manager' ? { deptScope: 'A' } : {}) });
    if (runStatus) {
      await setDoc(doc(db, 'payrollRuns', 'r1'), { from: '2026-10-01', to: '2026-10-31', status: runStatus, createdBy: by('pay'), createdAt: new Date(), totals: { net: 100, count: 1 }, empCount: 1, ...(runStatus !== 'draft' ? { rowsHash: HASH, rowsCount: 1, approvedBy: by('sup'), approvedAt: new Date() } : {}), ...extra });
      await setDoc(doc(db, 'payrollRuns', 'r1', 'rows', 'e1'), { empId: 'e1', net: 100, name: 'م' });
    }
  });
}
const run = (db, id = 'r1') => doc(db, 'payrollRuns', id);
const row = (db, id = 'e1') => doc(db, 'payrollRuns', 'r1', 'rows', id);

// ---- القراءة
test('الرواتب والمدير العام يقرآن المسيّر', async () => { await seed('draft'); await assertSucceeds(getDoc(run(fs('pay')))); await assertSucceeds(getDoc(run(fs('sup')))); });
for (const u of ['hr', 'aud', 'mgr']) test(`${u} لا يقرأ المسيّر ولا صفوفه`, async () => { await seed('draft'); await assertFails(getDoc(run(fs(u)))); await assertFails(getDoc(row(fs(u)))); });
test('الموظف المجهول لا يقرأ', async () => { await seed('draft'); await assertFails(getDoc(run(env.authenticatedContext('x', { firebase: { sign_in_provider: 'anonymous' } }).firestore()))); });

// ---- الإنشاء
test('محاسب الرواتب ينشئ مسودة', async () => { await seed(); await assertSucceeds(setDoc(run(fs('pay'), 'n1'), draft('pay'))); });
test('لا إنشاء بحالة معتمد', async () => { await seed(); await assertFails(setDoc(run(fs('pay'), 'n1'), draft('pay', { status: 'approved' }))); });
test('لا إنشاء بـcreatedBy مزيف', async () => { await seed(); await assertFails(setDoc(run(fs('pay'), 'n1'), draft('pay', { createdBy: by('sup') }))); });
test('لا إنشاء بـcreatedAt مزيف', async () => { await seed(); await assertFails(setDoc(run(fs('pay'), 'n1'), draft('pay', { createdAt: new Date('2020-01-01') }))); });
test('لا إنشاء بفترة معكوسة أو حقل زائد', async () => {
  await seed(); await assertFails(setDoc(run(fs('pay'), 'n1'), draft('pay', { from: '2026-11-01' })));
  await assertFails(setDoc(run(fs('pay'), 'n2'), draft('pay', { hacked: 1 })));
});
for (const u of ['hr', 'aud', 'mgr']) test(`${u} لا ينشئ`, async () => { await seed(); await assertFails(setDoc(run(fs(u), 'n1'), draft(u))); });

// ---- المسودة
test('تعديل المسودة (مجاميع) مسموح، وتغيير الفترة ممنوع', async () => {
  await seed('draft');
  await assertSucceeds(updateDoc(run(fs('pay')), { totals: { net: 120, count: 1 }, empCount: 1, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(run(fs('pay')), { from: '2026-09-01' }));
  await assertFails(updateDoc(run(fs('pay')), { createdBy: by('sup') }));
});
test('صفوف المسودة: كتابة وتعديل وحذف', async () => {
  await seed('draft');
  await assertSucceeds(setDoc(row(fs('pay'), 'e2'), { empId: 'e2', net: 5 }));
  await assertSucceeds(setDoc(row(fs('pay')), { empId: 'e1', net: 101 }));
  await assertSucceeds(deleteDoc(row(fs('pay'), 'e2')));
  await assertFails(setDoc(row(fs('pay'), 'e3'), { empId: 'WRONG', net: 5 }));
  await assertFails(setDoc(row(fs('pay'), 'e3'), { empId: 'e3', net: 'x' }));
});
test('حذف المسودة مسموح', async () => { await seed('draft'); await assertSucceeds(deleteDoc(run(fs('pay')))); });

// ---- الاعتماد
const approve = (uid, over = {}) => ({ status: 'approved', approvedBy: by(uid), approvedAt: serverTimestamp(), rowsHash: HASH, rowsCount: 1, ...over });
test('المدير العام يعتمد المسودة', async () => { await seed('draft'); await assertSucceeds(updateDoc(run(fs('sup')), approve('sup'))); });
test('محاسب الرواتب لا يعتمد', async () => { await seed('draft'); await assertFails(updateDoc(run(fs('pay')), approve('pay'))); });
test('لا اعتماد ببصمة قصيرة أو بعدد صفوف مخالف أو باسم معتمد مزيف', async () => {
  await seed('draft');
  await assertFails(updateDoc(run(fs('sup')), approve('sup', { rowsHash: 'abc' })));
  await assertFails(updateDoc(run(fs('sup')), approve('sup', { rowsCount: 2 })));
  await assertFails(updateDoc(run(fs('sup')), approve('sup', { approvedBy: by('pay') })));
  await assertFails(updateDoc(run(fs('sup')), { ...approve('sup'), totals: { net: 1 } }));
});

// ---- بعد الاعتماد: التجميد
test('المعتمد: لا تعديل للصفوف ولا الأرقام ولا الحذف ولا إعادة المسودة', async () => {
  await seed('approved');
  await assertFails(setDoc(row(fs('sup')), { empId: 'e1', net: 999 }));
  await assertFails(setDoc(row(fs('pay'), 'e9'), { empId: 'e9', net: 1 }));
  await assertFails(deleteDoc(row(fs('sup'))));
  await assertFails(updateDoc(run(fs('sup')), { totals: { net: 1 }, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(run(fs('sup')), { status: 'draft' }));
  await assertFails(deleteDoc(run(fs('sup'))));
  await assertFails(deleteDoc(run(fs('pay'))));
});
test('المعتمد → مصروف بواسطة الرواتب أو المدير', async () => {
  await seed('approved');
  await assertSucceeds(updateDoc(run(fs('pay')), { status: 'paid', paidBy: by('pay'), paidAt: serverTimestamp() }));
});
test('الصرف: لا بتغيير أرقام ولا باسم مزيف ولا من مسودة', async () => {
  await seed('approved');
  await assertFails(updateDoc(run(fs('pay')), { status: 'paid', paidBy: by('sup'), paidAt: serverTimestamp() }));
  await assertFails(updateDoc(run(fs('pay')), { status: 'paid', paidBy: by('pay'), paidAt: serverTimestamp(), totals: { net: 1 } }));
  await seed('draft'); await assertFails(updateDoc(run(fs('pay')), { status: 'paid', paidBy: by('pay'), paidAt: serverTimestamp() }));
});
test('المصروف نهائي: لا تعديل ولا حذف', async () => {
  await seed('paid');
  await assertFails(updateDoc(run(fs('sup')), { status: 'approved' }));
  await assertFails(updateDoc(run(fs('sup')), { payNote: 'x', totals: { net: 1 } }));
  await assertFails(deleteDoc(run(fs('sup')))); await assertFails(setDoc(row(fs('sup')), { empId: 'e1', net: 1 }));
});

// ---- تفاصيل التجميد: البصمة والمعتمد والتكرار
test('المعتمد: لا تغيير للبصمة ولا لبيانات المعتمد', async () => {
  await seed('approved');
  await assertFails(updateDoc(run(fs('sup')), { rowsHash: 'b'.repeat(64) }));
  await assertFails(updateDoc(run(fs('sup')), { approvedBy: by('pay') }));
  await assertFails(updateDoc(run(fs('sup')), { approvedAt: new Date('2020-01-01') }));
  await assertFails(updateDoc(run(fs('sup')), { rowsCount: 2 }));
});
test('لا إعادة اعتماد لمسيّر معتمد', async () => {
  await seed('approved');
  await assertFails(updateDoc(run(fs('sup')), { status: 'approved', approvedBy: by('sup'), approvedAt: serverTimestamp(), rowsHash: HASH, rowsCount: 1 }));
});
test('المعتمد: لا إضافة صفوف ولا حذفها حتى من المدير العام', async () => {
  await seed('approved');
  await assertFails(setDoc(row(fs('sup'), 'e2'), { empId: 'e2', net: 10 }));
  await assertFails(deleteDoc(row(fs('sup'), 'e1')));
});
test('المصروف: لا تغيير للبصمة ولا لبيانات الصرف ولا صرف ثانٍ', async () => {
  await seed('paid', { paidBy: by('pay'), paidAt: new Date() });
  await assertFails(updateDoc(run(fs('pay')), { rowsHash: 'c'.repeat(64) }));
  await assertFails(updateDoc(run(fs('pay')), { paidBy: by('sup') }));
  await assertFails(updateDoc(run(fs('pay')), { status: 'paid', paidBy: by('pay'), paidAt: serverTimestamp() }));
});
test('المصروف: لا تُضاف صفوف ولا تُعدَّل', async () => {
  await seed('paid');
  await assertFails(setDoc(row(fs('sup'), 'e2'), { empId: 'e2', net: 10 }));
  await assertFails(setDoc(row(fs('sup'), 'e1'), { empId: 'e1', net: 1 }));
});
