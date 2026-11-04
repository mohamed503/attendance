// S2: بريد المالك المثبّت في القواعد لا يمنح super_admin إلا إذا كان موثّقاً (email_verified).
// تشغيل: npm run test:rules  (يتطلب Firebase CLI + Java لمحاكي Firestore)
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { loadRules } from './rules-helper.mjs';

let env;
const OWNER = 'owner@example.com';
const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: 'meqat-rules-test-owner', firestore: { rules: loadRules(OWNER) } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'settings', 'general'), { orgName: 'org', tzOffset: 120 });
  });
});

test('S2: بريد المالك غير الموثّق لا يكتب الإعدادات (لا super_admin)', async () => {
  await assertFails(updateDoc(doc(as('attacker', { email: OWNER, email_verified: false }), 'settings', 'general'), { orgName: 'x' }));
});
test('S2: بريد المالك بلا claim التوثيق أصلاً لا يكتب الإعدادات', async () => {
  await assertFails(updateDoc(doc(as('attacker', { email: OWNER }), 'settings', 'general'), { orgName: 'x' }));
});
test('S2: بريد المالك غير الموثّق لا يقرأ admins/owner ولا ينشئ مشرفين', async () => {
  const db = as('attacker', { email: OWNER, email_verified: false });
  await assertFails(getDoc(doc(db, 'admins', 'owner')));
  await assertFails(setDoc(doc(db, 'admins', 'attacker'), { name: 'x', email: OWNER, role: 'super_admin' }));
});
test('S2: بريد المالك الموثّق يعمل كمدير عام', async () => {
  await assertSucceeds(updateDoc(doc(as('own', { email: OWNER, email_verified: true }), 'settings', 'general'), { orgName: 'y' }));
});
test('S2: المالك غير الموثّق لكن له admins/{uid} بدور super_admin (الترحيل) يعمل كمدير عام', async () => {
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'admins', 'own'), { name: 'المالك', email: OWNER, role: 'super_admin' }); });
  await assertSucceeds(updateDoc(doc(as('own', { email: OWNER, email_verified: false }), 'settings', 'general'), { orgName: 'z' }));
});
test('S2: المالك الموثّق يستطيع إنشاء مستند ترحيله admins/{uid}', async () => {
  await assertSucceeds(setDoc(doc(as('own', { email: OWNER, email_verified: true }), 'admins', 'own'), { name: 'المالك', email: OWNER, role: 'super_admin' }));
});
