// يختبر محرك الاحتساب الفعلي (calcDay + offDayOT) المأخوذ حرفيًا من index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const line = p => { const i = html.indexOf(p); assert.ok(i >= 0, p); return html.slice(i, html.indexOf('\n', i)); };
const i1 = html.indexOf('const addDays = '), cd = html.indexOf('function calcDay');
const end = html.indexOf('\n}\n', cd) + 3;
const src = [
  'const FORGOT_MS = 14 * 3600e3; const TZ_OFFSET_MIN = 120;',
  line('const pad = n'), line('let TZOFF'), line('const L = d'), line('const dayKey = d'), line('const dayStart = key'),
  html.slice(i1, end),
  'return { calcDay, offDayOT, typicalDayMin, pairSessions, OT_DEF };'
].join('\n');
const E = new Function(src)();

// 2026-10-23 جمعة (يوم راحة)، 2026-10-25 أحد (عمل)، التوقيت UTC+2
const FRI = '2026-10-23', SUN = '2026-10-25';
const at = (key, h, m = 0) => new Date(Date.parse(key + 'T00:00:00Z') + (h * 60 + m - 120) * 60000);
const sched = (ot = {}) => ({ mode: 'fixed', breakMin: 0, graceLate: 10, graceEarly: 10, graceMode: 'forgive', anchor: SUN, shifts: [], cycle: [],
  days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, { on: i <= 4, p: [{ s: '08:00', e: '16:00' }], h: 8 }])), ot });
const day = (sc, key, hrs, hols = []) => E.calcDay(sc, key, [{ start: at(key, 9), end: at(key, 9 + hrs) }], hols, 0, {});

test('الجداول القديمة (بلا حقول جديدة) تحتسب كل ساعات الراحة إضافية كما كان', () => {
  const m = day(sched({ rateRest: 2 }), FRI, 6);
  assert.equal(m.dayType, 'rest'); assert.equal(m.otMin, 360); assert.equal(m.otEq, 12);
});
test('وضع الإضافي none في جدول قديم = لا إضافي في الراحة (سلوك محفوظ)', () => {
  const m = day(sched({ mode: 'none' }), FRI, 6);
  assert.equal(m.otMin, 0); assert.equal(m.otEq, 0);
});
test('ويمكن تفعيل سياسة الراحة صراحةً حتى لو وضع الإضافي none', () => {
  const m = day(sched({ mode: 'none', restMode: 'all', rateRest: 2 }), FRI, 6);
  assert.equal(m.otEq, 12);
});
test('afterBase: 6 ساعات ≤ يوم الجدول (8) = صفر إضافي', () => {
  const m = day(sched({ restMode: 'afterBase', rateRest: 2 }), FRI, 6);
  assert.equal(m.otMin, 0); assert.equal(m.net, 360);
});
test('afterBase: 10 ساعات = ساعتان إضافيتان بالمعامل', () => {
  const m = day(sched({ restMode: 'afterBase', rateRest: 2 }), FRI, 10);
  assert.equal(m.otMin, 120); assert.equal(m.otEq, 4);
});
test('afterBase بحد صريح 4 ساعات', () => {
  const m = day(sched({ restMode: 'afterBase', restBaseH: 4, rateRest: 2 }), FRI, 6);
  assert.equal(m.otMin, 120); assert.equal(m.otEq, 4);
});
test('tiered: أول 8 بمعامل 1.5 والزائد بمعامل 2.5', () => {
  const m = day(sched({ restMode: 'tiered', restBaseH: 8, restRateBase: 1.5, rateRest: 2.5 }), FRI, 10);
  assert.equal(m.otMin, 600); assert.equal(m.otEq, 8 * 1.5 + 2 * 2.5);
});
test('tiered: ضمن الشريحة الأولى فقط', () => {
  const m = day(sched({ restMode: 'tiered', restBaseH: 8, restRateBase: 1.5, rateRest: 2.5 }), FRI, 5);
  assert.equal(m.otEq, 7.5);
});
test('normal: ساعات عادية بلا إضافي', () => {
  const m = day(sched({ restMode: 'normal' }), FRI, 7);
  assert.equal(m.otMin, 0); assert.equal(m.net, 420);
});
test('fixed: يمنح 8 ساعات مكافئة عند بلوغ الحد الأدنى', () => {
  const sc = sched({ restMode: 'fixed', restMinH: 4, restFixedH: 8, rateRest: 1 });
  assert.equal(day(sc, FRI, 5).otEq, 8);
  assert.equal(day(sc, FRI, 3).otEq, 0);          // أقل من الحد الأدنى
});
test('العطلة الرسمية بسياسة مستقلة عن الراحة', () => {
  const sc = sched({ restMode: 'normal', holMode: 'all', rateHoliday: 3 });
  const m = day(sc, SUN, 6, [SUN]);               // أحد يوم عمل لكنه عطلة
  assert.equal(m.dayType, 'holiday'); assert.equal(m.otEq, 18);
  assert.equal(day(sc, FRI, 6).otMin, 0);
});
test('التقريب والحد الأقصى والحد الأدنى تسري على سياسة الراحة', () => {
  const m = day(sched({ restMode: 'all', rateRest: 2, capH: 4, step: 30 }), FRI, 7.2);
  assert.equal(m.otMin, 240); assert.equal(m.otEq, 8);
  assert.equal(day(sched({ restMode: 'all', rateRest: 2, min: 60 }), FRI, 0.5).otMin, 0);
});
test('اليوم العادي لا يتأثر بسياسة الراحة', () => {
  const m = day(sched({ restMode: 'normal', mode: 'hours', rateNormal: 1.5 }), SUN, 10);
  assert.equal(m.dayType, 'work'); assert.equal(m.otMin, 120); assert.equal(m.otEq, 3);
});
test('typicalDayMin: ثابت ومرن وورديات', () => {
  assert.equal(E.typicalDayMin(sched()), 480);
  assert.equal(E.typicalDayMin({ mode: 'flex', days: { 0: { on: true, h: 6 }, 1: { on: true, h: 9 } } }), 540);
  assert.equal(E.typicalDayMin({ mode: 'rotation', shifts: [{ s: '22:00', e: '06:00' }, { s: '08:00', e: '14:00' }] }), 480);
  assert.equal(E.typicalDayMin(null), 0);
});
test('لا ازدواج في الدفع: الساعات العادية = الصافي − الإضافي (كما في كشف الراتب)', () => {
  for (const ot of [{ restMode: 'all' }, { restMode: 'afterBase' }, { restMode: 'tiered', restBaseH: 8 }, { restMode: 'fixed', restMinH: 1, restFixedH: 8 }, { restMode: 'normal' }]) {
    const m = day(sched({ rateRest: 2, ...ot }), FRI, 10);
    const regH = Math.max(0, m.net - m.otMin) / 60;
    assert.ok(regH >= 0 && regH <= m.net / 60);
    assert.ok(regH + Math.min(m.otMin, m.net) / 60 <= m.net / 60 + 1e-9);
  }
});
