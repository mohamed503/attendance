// تشغيل: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { loadRules } from './rules-helper.mjs';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'meqat-rules-test-dev', firestore: { rules: loadRules('owner@example.com') } }); });
after(async () => { await env.cleanup(); });

const fs = (uid, claims = {}) => env.authenticatedContext(uid, { email: uid + '@example.com', email_verified: true, ...claims }).firestore();
const anon = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const hours = h => Timestamp.fromMillis(Date.now() + h * 3600e3);
const PIN = 'ABCD2345';

async function seed({ employee = {}, pin = { pin: PIN, exp: hours(2), createdAt: Timestamp.now() }, joinFor = null } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', 'hr'), { name: 'hr', email: 'hr@example.com', role: 'hr_admin' });
    await setDoc(doc(db, 'admins', 'pay'), { name: 'pay', email: 'pay@example.com', role: 'payroll_admin' });
    await setDoc(doc(db, 'employees', 'e1'), { name: 'موظف', active: true, empType: 'staff', dept: 'A', deviceId: 'd1', devices: { d1: 'u1' }, ...employee });
    if (pin) await setDoc(doc(db, 'pins', 'e1'), pin);
    if (joinFor) await setDoc(doc(db, 'employees', 'e1', 'joins', joinFor), { pin: PIN, ua: 'x', at: Timestamp.now() });
  });
}
const join = (db, uid, pin = PIN) => setDoc(doc(db, 'employees', 'e1', 'joins', uid), { pin, ua: 'test', at: serverTimestamp() });
const addDev = (db, key, uid) => updateDoc(doc(db, 'employees', 'e1'), { ['devices.' + key]: uid, lastJoinAt: serverTimestamp() });

// ---- إصدار الرمز ----
test('HR يصدر رمزًا صالحًا', async () => { await seed({ pin: null }); await assertSucceeds(setDoc(doc(fs('hr'), 'pins', 'e1'), { pin: PIN, exp: hours(48), createdAt: serverTimestamp() })); });
for (const [label, data] of [
  ['بلا exp', () => ({ pin: PIN, createdAt: serverTimestamp() })],
  ['exp ماضٍ', () => ({ pin: PIN, exp: hours(-1), createdAt: serverTimestamp() })],
  ['exp أكثر من 7 أيام', () => ({ pin: PIN, exp: hours(24 * 8), createdAt: serverTimestamp() })],
  ['رمز قصير', () => ({ pin: '123456', exp: hours(48), createdAt: serverTimestamp() })],
  ['حقل زائد', () => ({ pin: PIN, exp: hours(48), createdAt: serverTimestamp(), x: 1 })],
]) test('HR لا يصدر رمزًا ' + label, async () => { await seed({ pin: null }); await assertFails(setDoc(doc(fs('hr'), 'pins', 'e1'), data())); });
test('الرواتب لا تكتب الرمز', async () => { await seed({ pin: null }); await assertFails(setDoc(doc(fs('pay'), 'pins', 'e1'), { pin: PIN, exp: hours(48), createdAt: serverTimestamp() })); });
test('الموظف المجهول لا يقرأ الرمز', async () => { await seed(); await assertFails(getDoc(doc(anon('u2'), 'pins', 'e1'))); });

// ---- الانضمام بالرمز ----
test('رمز صحيح وغير منتهٍ يُقبل', async () => { await seed(); await assertSucceeds(join(anon('u2'), 'u2')); });
test('رمز خاطئ يُرفض', async () => { await seed(); await assertFails(join(anon('u2'), 'u2', 'ZZZZ9999')); });
test('رمز منتهٍ يُرفض', async () => { await seed({ pin: { pin: PIN, exp: hours(-1), createdAt: Timestamp.now() } }); await assertFails(join(anon('u2'), 'u2')); });
test('رمز قديم بلا exp يُرفض', async () => { await seed({ pin: { pin: PIN } }); await assertFails(join(anon('u2'), 'u2')); });
test('لا رمز مصدَر = رفض', async () => { await seed({ pin: null }); await assertFails(join(anon('u2'), 'u2')); });

// ---- الحد الأقصى للأجهزة ----
test('الافتراضي 2: الجهاز الثاني يُقبل', async () => { await seed({ joinFor: 'u2' }); await assertSucceeds(addDev(anon('u2'), 'd2', 'u2')); });
test('الافتراضي 2: الثالث يُرفض', async () => { await seed({ employee: { devices: { d1: 'u1', d2: 'u2' } }, joinFor: 'u3' }); await assertFails(addDev(anon('u3'), 'd3', 'u3')); });
test('حد 1: الثاني يُرفض', async () => { await seed({ employee: { maxDevices: 1 }, joinFor: 'u2' }); await assertFails(addDev(anon('u2'), 'd2', 'u2')); });
test('حد 3: الثالث يُقبل', async () => { await seed({ employee: { maxDevices: 3, devices: { d1: 'u1', d2: 'u2' } }, joinFor: 'u3' }); await assertSucceeds(addDev(anon('u3'), 'd3', 'u3')); });
test('بلا وثيقة انضمام لا يضيف جهازًا', async () => { await seed(); await assertFails(addDev(anon('u2'), 'd2', 'u2')); });
test('lastJoinAt مزيف يُرفض', async () => { await seed({ joinFor: 'u2' }); await assertFails(updateDoc(doc(anon('u2'), 'employees', 'e1'), { 'devices.d2': 'u2', lastJoinAt: Timestamp.fromMillis(1) })); });
test('الإضافة القديمة بلا lastJoinAt ما زالت تعمل', async () => { await seed({ joinFor: 'u2' }); await assertSucceeds(updateDoc(doc(anon('u2'), 'employees', 'e1'), { 'devices.d2': 'u2' })); });

// ---- ضبط الحد وإلغاء جهاز ----
for (const v of [1, 2, 3]) test('HR يضبط الحد ' + v, async () => { await seed(); await assertSucceeds(updateDoc(doc(fs('hr'), 'employees', 'e1'), { maxDevices: v })); });
for (const v of [0, 4, 99]) test('HR لا يضبط الحد ' + v, async () => { await seed(); await assertFails(updateDoc(doc(fs('hr'), 'employees', 'e1'), { maxDevices: v })); });
test('الرواتب لا تضبط الحد', async () => { await seed(); await assertFails(updateDoc(doc(fs('pay'), 'employees', 'e1'), { maxDevices: 1 })); });
test('HR يلغي جهازًا ويحذف وثيقة انضمامه', async () => {
  await seed({ employee: { devices: { d1: 'u1', d2: 'u2' } }, joinFor: 'u2' });
  await assertSucceeds(updateDoc(doc(fs('hr'), 'employees', 'e1'), { devices: { d1: 'u1' } }));
  await assertSucceeds(deleteDoc(doc(fs('hr'), 'employees', 'e1', 'joins', 'u2')));
});
test('جهاز مُلغى بعد حذف انضمامه لا يعود بلا رمز', async () => { await seed({ employee: { devices: { d1: 'u1' } } }); await assertFails(addDev(anon('u2'), 'd2', 'u2')); });
