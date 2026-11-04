// S3: عند settings/general.bindPin == true لا يُربط أول جهاز إلا برمز الإدارة. تشغيل: npm run test:rules (محاكي Firestore)
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, Timestamp, serverTimestamp } from 'firebase/firestore';
import { loadRules } from './rules-helper.mjs';

let env;
const anon = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const PIN = 'ABCD2345';
const seed = async (bindPin, pin = true) => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'settings', 'general'), { orgName: 'o', tzOffset: 120, ...(bindPin === undefined ? {} : { bindPin }) });
    await setDoc(doc(db, 'employees', 'e1'), { name: 'م', active: true, deviceId: null, empType: 'staff' });
    if (pin) await setDoc(doc(db, 'pins', 'e1'), { pin: PIN, exp: Timestamp.fromMillis(Date.now() + 86400000), createdAt: Timestamp.now() });
  });
};
before(async () => { env = await initializeTestEnvironment({ projectId: 'meqat-rules-test-bindpin', firestore: { rules: loadRules('owner@example.com') } }); });
after(async () => { await env.cleanup(); });
const claim = (db, uid) => ({ deviceId: 'D1', devices: { D1: uid } });

test('S3: بلا bindPin يُربط الجهاز بالرابط فقط', async () => { await seed(undefined, false); await assertSucceeds(updateDoc(doc(anon('u1'), 'employees', 'e1'), claim(0, 'u1'))); });
test('S3: bindPin=false يُربط بالرابط فقط', async () => { await seed(false); await assertSucceeds(updateDoc(doc(anon('u1'), 'employees', 'e1'), claim(0, 'u1'))); });
test('S3: bindPin=true بلا رمز مرفوض', async () => { await seed(true); await assertFails(updateDoc(doc(anon('u1'), 'employees', 'e1'), claim(0, 'u1'))); });
test('S3: bindPin=true مع رمز صحيح في الدفعة نفسها ينجح ويُختم الرمز', async () => {
  await seed(true); const db = anon('u1'); const b = writeBatch(db);
  b.set(doc(db, 'employees', 'e1', 'joins', 'u1'), { pin: PIN, ua: 'x', at: serverTimestamp() });
  b.update(doc(db, 'pins', 'e1'), { usedBy: 'u1', usedAt: serverTimestamp() });
  b.update(doc(db, 'employees', 'e1'), claim(0, 'u1'));
  await assertSucceeds(b.commit());
});
test('S3: رمز خاطئ يُفشل الدفعة كلها', async () => {
  await seed(true); const db = anon('u1'); const b = writeBatch(db);
  b.set(doc(db, 'employees', 'e1', 'joins', 'u1'), { pin: 'WRONG123', ua: 'x', at: serverTimestamp() });
  b.update(doc(db, 'employees', 'e1'), claim(0, 'u1'));
  await assertFails(b.commit());
});
test('S3: رمز استعمله جهاز آخر لا يصلح لجهاز ثانٍ', async () => {
  await seed(true);
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'pins', 'e1'), { pin: PIN, exp: Timestamp.fromMillis(Date.now() + 86400000), createdAt: Timestamp.now(), usedBy: 'other', usedAt: Timestamp.now() }); });
  const db = anon('u2'); const b = writeBatch(db);
  b.set(doc(db, 'employees', 'e1', 'joins', 'u2'), { pin: PIN, ua: 'x', at: serverTimestamp() });
  b.update(doc(db, 'employees', 'e1'), claim(0, 'u2'));
  await assertFails(b.commit());
});
test('S3: رمز منتهي مرفوض', async () => {
  await seed(true);
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'pins', 'e1'), { pin: PIN, exp: Timestamp.fromMillis(Date.now() - 1000), createdAt: Timestamp.now() }); });
  const db = anon('u1'); const b = writeBatch(db);
  b.set(doc(db, 'employees', 'e1', 'joins', 'u1'), { pin: PIN, ua: 'x', at: serverTimestamp() });
  b.update(doc(db, 'employees', 'e1'), claim(0, 'u1'));
  await assertFails(b.commit());
});
test('S3: مستند joins لجهاز آخر لا يفتح الربط (uid مختلف)', async () => {
  await seed(true);
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'employees', 'e1', 'joins', 'u9'), { pin: PIN, ua: 'x' }); });
  await assertFails(updateDoc(doc(anon('u1'), 'employees', 'e1'), claim(0, 'u1')));
});
