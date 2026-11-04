// S5: قاعدة locations تمنع حفظ سياسة طرق حضور غير صالحة. تشغيل: npm run test:rules (يتطلب محاكي Firestore)
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { loadRules } from './rules-helper.mjs';

let env;
const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const base = { name: 'م', lat: 32.8, lng: 13.1, radius: 100, active: true };

before(async () => { env = await initializeTestEnvironment({ projectId: 'meqat-rules-test-loc', firestore: { rules: loadRules('owner@example.com') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', 'sa'), { name: 'sa', email: 'sa@x.com', role: 'super_admin' });
    await setDoc(doc(db, 'admins', 'hr'), { name: 'hr', email: 'hr@x.com', role: 'hr_admin' });
    await setDoc(doc(db, 'admins', 'pay'), { name: 'pay', email: 'pay@x.com', role: 'payroll_admin' });
    await setDoc(doc(db, 'locations', 'L1'), { ...base, methods: ['gps'], mode: 'all' });
  });
});
const sa = () => as('sa', { email: 'sa@x.com', email_verified: true });

test('S5: مدير عام ينشئ موقعاً بلا methods (الافتراضي gps)', async () => { await assertSucceeds(setDoc(doc(sa(), 'locations', 'N1'), base)); });
test('S5: methods صالحة + mode any', async () => { await assertSucceeds(setDoc(doc(sa(), 'locations', 'N2'), { ...base, methods: ['gps', 'qr', 'bio'], mode: 'any' })); });
test('S5: methods فارغة مرفوضة', async () => { await assertFails(setDoc(doc(sa(), 'locations', 'N3'), { ...base, methods: [], mode: 'all' })); });
test('S5: methods بقيمة غير معروفة مرفوضة', async () => { await assertFails(setDoc(doc(sa(), 'locations', 'N4'), { ...base, methods: ['gps', 'sms'] })); });
test('S5: methods ليست قائمة مرفوضة', async () => { await assertFails(setDoc(doc(sa(), 'locations', 'N5'), { ...base, methods: 'qr' })); });
test('S5: mode غير صالح مرفوض', async () => { await assertFails(setDoc(doc(sa(), 'locations', 'N6'), { ...base, methods: ['gps'], mode: 'none' })); });
test('S5: تحديث methods إلى قائمة فارغة مرفوض', async () => { await assertFails(updateDoc(doc(sa(), 'locations', 'L1'), { methods: [] })); });
test('S5: تحديث صالح ينجح', async () => { await assertSucceeds(updateDoc(doc(sa(), 'locations', 'L1'), { methods: ['gps', 'qr'], mode: 'all' })); });
test('S5: مدير الموارد ينشئ ويحذف', async () => {
  const hr = as('hr', { email: 'hr@x.com', email_verified: true });
  await assertSucceeds(setDoc(doc(hr, 'locations', 'H1'), { ...base, methods: ['qr'] }));
  await assertSucceeds(deleteDoc(doc(hr, 'locations', 'H1')));
});
test('S5: مدير الرواتب لا يكتب المواقع', async () => {
  await assertFails(setDoc(doc(as('pay', { email: 'pay@x.com', email_verified: true }), 'locations', 'P1'), base));
});
test('S5: الحذف لا يتأثر بالتحقق', async () => { await assertSucceeds(deleteDoc(doc(sa(), 'locations', 'L1'))); });
test('S5: أي مستخدم مصادَق يقرأ المواقع', async () => { await assertSucceeds(getDoc(doc(as('emp', {}), 'locations', 'L1'))); });
