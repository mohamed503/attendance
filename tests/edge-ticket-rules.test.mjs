// 1أ: عند settings/general.edgeRequired لا تُقبل بصمة الجهاز إلا بتذكرة خادم الحافة تُستهلك في دفعة التسجيل.
// تشغيل: npm run test:rules (محاكي Firestore). لم تُشغَّل أثناء التطوير لعدم توفر المحاكي.
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, Timestamp, serverTimestamp } from 'firebase/firestore';
import { loadRules } from './rules-helper.mjs';

let env;
const UID = 'u1';
const anon = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const WA = 'x'.repeat(60);
const rec = (o = {}) => ({ type: 'in', time: serverTimestamp(), lat: 0, lng: 0, accuracy: 0, distance: 0, locationId: 'L1', locationName: 'م', empName: 'أحمد', deviceId: 'D1', m: 'bio', ...o });

async function seed({ edge = true, ticket = {}, noTicket = false, methods = ['bio'] } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'settings', 'general'), { orgName: 'o', tzOffset: 120, ...(edge ? { edgeRequired: true } : {}) });
    await setDoc(doc(db, 'locations', 'L1'), { name: 'م', lat: 32.8, lng: 13.1, kx: 93500, ky: 111000, radius: 100, active: true, methods, mode: 'all' });
    await setDoc(doc(db, 'employees', 'e1'), { name: 'أحمد', active: true, empType: 'staff', deviceId: 'D1', devices: { D1: UID }, bio: { cid: 'c', pk: 'p', at: Timestamp.now() } });
    if (!noTicket) await setDoc(doc(db, 'punchTickets', UID), { nonce: 'N1', empId: 'e1', locId: 'L1', type: 'in', m: ['bio'], exp: Timestamp.fromMillis(Date.now() + 60000), ...ticket });
  });
}
async function punch(data, { delTicket = true } = {}) {
  const db = anon(UID), b = writeBatch(db), rr = doc(db, 'employees', 'e1', 'records', 'r1');
  b.set(rr, data);
  b.update(doc(db, 'employees', 'e1'), { state: 'in', lastAt: serverTimestamp(), lastRecId: 'r1' });
  if (delTicket) b.delete(doc(db, 'punchTickets', UID));
  return b.commit();
}
before(async () => { env = await initializeTestEnvironment({ projectId: 'meqat-rules-test-edge', firestore: { rules: loadRules('owner@example.com') } }); });
after(async () => { await env.cleanup(); });

test('1أ: تذكرة صالحة تُستهلك في الدفعة ⇒ ينجح', async () => { await seed(); await assertSucceeds(punch(rec({ ticket: 'N1' }))); });
test('1أ: edgeRequired وبصمة wa نصية بلا تذكرة ⇒ مرفوض (لا يكفي نص مزوَّر)', async () => { await seed(); await assertFails(punch(rec({ wa: WA }))); });
test('1أ: تذكرة بـ nonce خاطئ ⇒ مرفوض', async () => { await seed(); await assertFails(punch(rec({ ticket: 'WRONG' }))); });
test('1أ: تذكرة منتهية ⇒ مرفوض', async () => { await seed({ ticket: { exp: Timestamp.fromMillis(Date.now() - 1000) } }); await assertFails(punch(rec({ ticket: 'N1' }))); });
test('1أ: تذكرة لموقع آخر أو لنوع آخر أو لموظف آخر ⇒ مرفوض', async () => {
  for (const t of [{ locId: 'L2' }, { type: 'out' }, { empId: 'e2' }]) { await seed({ ticket: t }); await assertFails(punch(rec({ ticket: 'N1' }))); }
});
test('1أ: عدم حذف التذكرة في الدفعة (إعادة استخدام) ⇒ مرفوض', async () => { await seed(); await assertFails(punch(rec({ ticket: 'N1' }), { delTicket: false })); });
test('1أ: تذكرة لا تحوي bio ⇒ مرفوض', async () => { await seed({ ticket: { m: ['qr'] } }); await assertFails(punch(rec({ ticket: 'N1' }))); });
test('1أ: بلا edgeRequired يبقى السلوك القديم (wa نصية تكفي) والتذكرة غير لازمة', async () => { await seed({ edge: false, noTicket: true }); await assertSucceeds(punch(rec({ wa: WA }), { delTicket: false })); });
test('1أ: بلا edgeRequired لكن تذكرة صالحة تُقبل بلا wa، وتذكرة خاطئة تُرفض', async () => {
  await seed({ edge: false }); await assertSucceeds(punch(rec({ ticket: 'N1' })));
  await seed({ edge: false }); await assertFails(punch(rec({ ticket: 'WRONG' })));
});
test('1أ: لا عميل يكتب أو يقرأ punchTickets، ولا أحد يحذف تذكرة غيره', async () => {
  await seed({ noTicket: true }); const db = anon(UID);
  await assertFails(setDoc(doc(db, 'punchTickets', UID), { nonce: 'FORGED', empId: 'e1', locId: 'L1', type: 'in', m: ['bio'], exp: Timestamp.fromMillis(Date.now() + 60000) }));
  await seed(); await assertFails(getDoc(doc(db, 'punchTickets', UID)));
  await assertFails(updateDoc(doc(db, 'punchTickets', UID), { nonce: 'X' }));
  await assertFails(deleteDoc(doc(anon('other'), 'punchTickets', UID)));
  await assertSucceeds(deleteDoc(doc(db, 'punchTickets', UID)));
});
