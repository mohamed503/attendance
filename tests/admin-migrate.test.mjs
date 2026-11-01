// يختبر منطق التخطيط الصرف في أداة ترحيل المشرفين (بلا Firebase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'meqat-admin-migrate.html'), 'utf8');
const src = html.slice(html.indexOf('/*PURE-START*/'), html.indexOf('/*PURE-END*/'));
const L = new Function(src + '\nreturn { planRow, validateRow, rowIssues, planBlockers, cleanDoc, targetId, keyKind, isUid, ROLES };')();
const O = { ownerEmail: 'owner@x.com', depts: new Set(['المبيعات', 'IT']) };
const UID = 'a'.repeat(28);

test('وثيقة بلا role تصبح auditor مع تحذير', () => {
  const r = L.planRow(UID, { name: 'علي', email: 'Ali@X.com' }, O);
  assert.equal(r.role, 'auditor'); assert.equal(r.roleStatus, 'missing'); assert.equal(r.email, 'ali@x.com');
  assert.ok(L.rowIssues(r, O).some(i => i.level === 'warn' && i.text.includes('لا يوجد دور')));
});
test('دور صالح يُحفظ، ودور مجهول يعود auditor', () => {
  assert.equal(L.planRow(UID, { email: 'a@x.com', role: 'hr_admin' }, O).role, 'hr_admin');
  const bad = L.planRow(UID, { email: 'a@x.com', role: 'admin' }, O);
  assert.equal(bad.role, 'auditor'); assert.equal(bad.roleStatus, 'invalid');
});
test('بريد المالك يصبح super_admin دائمًا', () => {
  assert.equal(L.planRow(UID, { email: 'OWNER@x.com', role: 'auditor' }, O).role, 'super_admin');
});
test('نوع المفتاح', () => {
  assert.equal(L.keyKind('owner'), 'owner'); assert.equal(L.keyKind('a@b.com'), 'email'); assert.equal(L.keyKind(UID), 'uid');
});
test('مفتاح البريد يحذّر دون UID ويقبل UID صالحًا ويرفض الفاسد', () => {
  const r = L.planRow('ali@x.com', { name: 'ع', role: 'hr_admin' }, O);
  assert.equal(r.email, 'ali@x.com');
  assert.ok(L.rowIssues(r, O).some(i => i.text.includes('email_verified')));
  r.uid = UID; assert.deepEqual(L.validateRow(r), []); assert.equal(L.targetId(r), UID);
  r.uid = 'x/y'; assert.ok(L.validateRow(r).length);
});
test('مدير القسم: يرفض قسمًا فارغًا ويحذّر من عدم المطابقة الحرفية', () => {
  const r = L.planRow(UID, { email: 'm@x.com', role: 'manager', deptScope: '' }, O);
  assert.ok(L.validateRow(r).length);
  r.deptScope = 'مبيعات';
  assert.ok(L.rowIssues(r, O).some(i => i.text.includes('لا يطابق')));
  r.deptScope = 'المبيعات'; assert.deepEqual(L.validateRow(r), []);
  assert.ok(!L.rowIssues(r, O).some(i => i.level === 'warn' && i.text.includes('لا يطابق')));
});
test('الحقول الإضافية تُرصد وتُحذف من الوثيقة النظيفة', () => {
  const r = L.planRow(UID, { name: 'س', email: 's@x.com', role: 'manager', deptScope: ' IT ', legacy: 1, perms: ['x'] }, O);
  assert.deepEqual(r.extraKeys.sort(), ['legacy', 'perms']);
  const d = L.cleanDoc(r, 'T');
  assert.deepEqual(Object.keys(d).sort(), ['addedAt', 'deptScope', 'email', 'name', 'role']);
  assert.equal(d.deptScope, 'IT');
});
test('غير المدير لا يحمل deptScope في الوثيقة النظيفة', () => {
  const r = L.planRow(UID, { name: 'س', email: 's@x.com', role: 'hr_admin', deptScope: 'IT' }, O);
  assert.ok(!('deptScope' in L.cleanDoc(r, 'T')));
});
test('الاسم والبريد يُقصّان لحدود القواعد', () => {
  const r = L.planRow(UID, { name: 'ن'.repeat(150), email: 'a@x.com', role: 'auditor' }, O);
  assert.equal(L.cleanDoc(r, 'T').name.length, 100);
});
test('حاجز: فقدان صلاحية الحساب الحالي أو غياب بريد المالك', () => {
  const rows = [L.planRow(UID, { email: 'me@x.com', role: 'hr_admin' }, O)];
  assert.ok(L.planBlockers(rows, { uid: UID, email: 'me@x.com' }, O).some(b => b.includes('سيفقد')));
  assert.equal(L.planBlockers(rows, { uid: UID, email: 'owner@x.com' }, O).length, 0);
  assert.ok(L.planBlockers(rows, { uid: UID, email: 'owner@x.com' }, { ownerEmail: '' }).some(b => b.includes('بريد المالك')));
});
test('حاجز: UID مكرر بعد التحويل', () => {
  const a = L.planRow('a@x.com', { role: 'hr_admin' }, O), b = L.planRow('b@x.com', { role: 'hr_admin' }, O);
  a.uid = UID; b.uid = UID;
  assert.ok(L.planBlockers([a, b], { uid: 'z', email: 'owner@x.com' }, O).some(x => x.includes('مكرر')));
});
