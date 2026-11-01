// تشغيل: npm run test:rules  (يتطلب Firebase CLI + Java لمحاكي Firestore)
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { loadRules } from './rules-helper.mjs';

let env;
const OWNER = 'owner@example.com';
const ctx = (uid, role) => env.authenticatedContext(uid, { email: uid + '@example.com', email_verified: true }).firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'meqat-rules-test', firestore: { rules: loadRules(OWNER) } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    const admin = (id, role, extra = {}) => setDoc(doc(db, 'admins', id), { name: id, email: id + '@example.com', role, ...extra });
    await admin('sup', 'super_admin'); await admin('hr', 'hr_admin'); await admin('pay', 'payroll_admin');
    await admin('aud', 'auditor'); await admin('mgr', 'manager', { deptScope: 'A' });
    await setDoc(doc(db, 'employees', 'e1'), { name: 'موظف', active: true, empType: 'staff', dept: 'A', payMode: 'none', payAmount: 0, deviceId: null });
    await setDoc(doc(db, 'settings', 'general'), { orgName: 'org', tzOffset: 120, forgotDeductDays: 0 });
  });
});

const basic = () => ({ name: 'موظف جديد', phone: '218900000000', active: true, deviceId: null, scheduleId: '', empType: 'staff',
  payMode: 'none', payAmount: 0, rotOffset: 0, startDate: '2026-10-28', createdAt: serverTimestamp() });
const create = (db, data, id = 'new1') => setDoc(doc(db, 'employees', id), data);

test('HR ينشئ ملف موظف أساسيًا', async () => { await assertSucceeds(create(ctx('hr'), basic())); });
test('HR ينشئ موظف مهام بـ payMode=task', async () => { await assertSucceeds(create(ctx('hr'), { ...basic(), empType: 'task', payMode: 'task' })); });
for (const [label, extra] of [
  ['iban', { iban: 'LY00' }], ['nationalId', { nationalId: '1' }], ['bankName', { bankName: 'x' }],
  ['payAmount > 0', { payAmount: 500 }], ['payMode=monthly', { payMode: 'monthly' }],
  ['allowance', { allowance: 10 }], ['bonus', { bonus: 10 }], ['loanTotal', { loanTotal: 100 }],
  ['taskPrices', { taskPrices: { t1: 5 } }], ['uid', { uid: 'x' }], ['devices', { devices: { d: 'x' } }],
  ['deviceId غير null', { deviceId: 'abc' }], ['state', { state: 'in' }], ['active=false', { active: false }],
  ['empType غير صالح', { empType: 'boss' }], ['createdAt مزيف', { createdAt: new Date('2020-01-01') }],
]) {
  test('HR لا ينشئ موظفًا مع ' + label, async () => { await assertFails(create(ctx('hr'), { ...basic(), ...extra })); });
}
test('المدير العام ينشئ موظفًا بحقول مالية', async () => { await assertSucceeds(create(ctx('sup'), { ...basic(), iban: 'LY00', payMode: 'monthly', payAmount: 900 })); });
for (const r of ['pay', 'aud', 'mgr']) test(`${r} لا ينشئ موظفًا`, async () => { await assertFails(create(ctx(r), basic())); });

test('HR لا يعدّل taskPrices', async () => { await assertFails(updateDoc(doc(ctx('hr'), 'employees', 'e1'), { taskPrices: { t1: 9 } })); });
test('الرواتب تعدّل taskPrices', async () => { await assertSucceeds(updateDoc(doc(ctx('pay'), 'employees', 'e1'), { taskPrices: { t1: 9 } })); });
test('HR يعدّل القسم', async () => { await assertSucceeds(updateDoc(doc(ctx('hr'), 'employees', 'e1'), { dept: 'B' })); });
test('الرواتب لا تعدّل القسم', async () => { await assertFails(updateDoc(doc(ctx('pay'), 'employees', 'e1'), { dept: 'B' })); });
test('HR لا يعدّل iban', async () => { await assertFails(updateDoc(doc(ctx('hr'), 'employees', 'e1'), { iban: 'LY1' })); });
test('الرواتب تعدّل iban', async () => { await assertSucceeds(updateDoc(doc(ctx('pay'), 'employees', 'e1'), { iban: 'LY1' })); });

test('HR لا يغيّر forgotDeductDays', async () => { await assertFails(updateDoc(doc(ctx('hr'), 'settings', 'general'), { forgotDeductDays: 1 })); });
test('HR يغيّر orgName', async () => { await assertSucceeds(updateDoc(doc(ctx('hr'), 'settings', 'general'), { orgName: 'new' })); });
test('المدير العام يغيّر forgotDeductDays', async () => { await assertSucceeds(updateDoc(doc(ctx('sup'), 'settings', 'general'), { forgotDeductDays: 1 })); });
test('مالك البريد يعمل كمدير عام', async () => {
  const db = env.authenticatedContext('own', { email: OWNER, email_verified: true }).firestore();
  await assertSucceeds(updateDoc(doc(db, 'settings', 'general'), { forgotDeductDays: 0.5 }));
});
