// يثبت أن ملخص الشهر يعتمد على كل سجلات الشهر لا آخر 15 فقط (دوال مأخوذة حرفيًا من index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const src = 'const FORGOT_MS = 14 * 3600e3;\n' + cut('function pairSessions', 'const localMin') ;
const { pairSessions, mergeRecs } = new Function(src + '\nreturn { pairSessions, mergeRecs };')();

const day = (d, h, m = 0) => new Date(Date.UTC(2026, 9, d, h, m));
const rec = (type, t) => ({ type, t });
const dk = d => d.toISOString().slice(0, 10);

function workMonth(days) {
  const rows = [];
  for (let d = 1; d <= days; d++) { rows.push(rec('in', day(d, 8))); rows.push(rec('out', day(d, 16))); }
  return rows;
}

test('الطريقة القديمة (آخر 15) تُنقص الأيام، والجديدة تحسبها كاملة', () => {
  const all = workMonth(20);                              // 40 تسجيلًا
  const old = all.slice(-15);                             // ما كان يُجلب سابقًا
  const oldDays = new Set(pairSessions(old).map(s => dk(s.start))).size;
  const newDays = new Set(pairSessions(all).map(s => dk(s.start))).size;
  assert.ok(oldDays <= 8); assert.equal(newDays, 20);
});
test('ساعات الشهر الكاملة تُجمع من كل الجلسات', () => {
  const ses = pairSessions(workMonth(22));
  const hours = ses.reduce((a, s) => a + (s.end - s.start) / 3600e3, 0);
  assert.equal(ses.length, 22); assert.equal(hours, 22 * 8);
});
test('دمج الكاش مع الجديد يزيل التكرار ويرتّب', () => {
  const cached = [rec('in', day(1, 8)), rec('out', day(1, 16))];
  const fresh = [rec('out', day(1, 16)), rec('in', day(2, 8))];
  const m = mergeRecs(cached, fresh);
  assert.equal(m.length, 3); assert.deepEqual(m.map(r => r.type), ['in', 'out', 'in']);
  assert.ok(m[0].t < m[1].t && m[1].t < m[2].t);
});
test('دمج يتجاهل سجلات بلا زمن صالح', () => {
  assert.equal(mergeRecs([{ type: 'in', t: null }, { type: 'in', t: new Date('x') }], [rec('in', day(1, 8))]).length, 1);
  assert.deepEqual(mergeRecs(null, undefined), []);
});
test('جلسة ليلية عابرة لحدّ الشهر تكتمل عند جلب اليوم السابق', () => {
  const rows = [rec('in', new Date(Date.UTC(2026, 8, 30, 22))), rec('out', new Date(Date.UTC(2026, 9, 1, 6)))];
  const ses = pairSessions(mergeRecs([], rows));
  assert.equal(ses.length, 1); assert.ok(ses[0].end);
  const withoutPrev = pairSessions([rows[1]]);           // لو لم يُجلب اليوم السابق: انصراف يتيم
  assert.equal(withoutPrev.length, 0);
});
test('القراءة التزايدية: كاش + سجل جديد = نفس نتيجة القراءة الكاملة', () => {
  const full = workMonth(10);
  const inc = mergeRecs(full.slice(0, 18), full.slice(18));
  assert.deepEqual(inc.map(r => r.t.getTime()), full.map(r => r.t.getTime()));
});
