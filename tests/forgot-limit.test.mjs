// يحرس توحيد مهلة «نسيان الانصراف» بين الجهاز واللوحة والتقارير والقواعد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const consoleHtml = readFileSync(join(root, 'meqat-console.html'), 'utf8');
const line = p => { const i = html.indexOf(p); assert.ok(i >= 0, p); return html.slice(i, html.indexOf('\n', i)); };
const i1 = html.indexOf('const addDays = '), cd = html.indexOf('function calcDay');
const src = ['const FORGOT_MS = 14 * 3600e3; const TZ_OFFSET_MIN = 120;', line('const pad = n'), line('let TZOFF'), line('const L = d'), line('const dayKey = d'), line('const dayStart = key'),
  html.slice(i1, html.indexOf('\n}\n', cd) + 3), 'return { forgotMsOf, forgotLimitMs, pairSessions, FORGOT_MS };'].join('\n');
const E = new Function(src)();
const H = 3600e3, T0 = Date.UTC(2026, 9, 25, 5);   // 07:00 بتوقيت UTC+2
const rec = (type, h) => ({ type, t: new Date(T0 + h * H) });
const fixed = (s, e) => ({ mode: 'fixed', days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, { on: true, p: [{ s, e }] }])) });

test('رقم القواعد (50400000) = FORGOT_MS = 14 ساعة', () => {
  assert.equal(E.FORGOT_MS, 14 * H);
  for (const [name, text] of [['index.html', html], ['meqat-console.html', consoleHtml]]) {
    assert.ok(text.includes('>= 50400000'), name + ': رقم 14 ساعة غير موجود في القواعد');
  }
  assert.equal(50400000, E.FORGOT_MS);
});
test('المهلة لا تقل أبدًا عن 14 ساعة لأي جدول (فالقاعدة لا تمنع ما يسمح به التطبيق)', () => {
  const cases = [null, {}, fixed('08:00', '16:00'), fixed('07:00', '19:00'), fixed('22:00', '06:00'),
    { mode: 'flex', days: { 0: { on: true, h: 3 } } }, { mode: 'flex', days: { 0: { on: true, h: 24 } } },
    { mode: 'rotation', shifts: [{ s: '20:00', e: '08:00' }] }];
  for (const c of cases) assert.ok(E.forgotLimitMs(c) >= E.FORGOT_MS);
});
test('قيم المهلة: عادي 14، دوام 12 ساعة 16، مرن 24 ساعة 28، وردية ليلية 12 ساعة 16', () => {
  assert.equal(E.forgotLimitMs(fixed('08:00', '16:00')), 14 * H);
  assert.equal(E.forgotLimitMs(fixed('07:00', '19:00')), 16 * H);
  assert.equal(E.forgotLimitMs({ mode: 'flex', days: { 0: { on: true, h: 24 } } }), 28 * H);
  assert.equal(E.forgotLimitMs({ mode: 'rotation', shifts: [{ s: '20:00', e: '08:00' }] }), 16 * H);
  assert.equal(E.forgotLimitMs(null), 14 * H);
});
test('لا مسار يستعمل 14 ساعة ثابتة بعد الآن', () => {
  assert.ok(!html.includes('Math.min(FORGOT_MS'));
  assert.ok(html.includes('const forgotLim = forgotLimitMs(sched)'));
  const calls = [...html.matchAll(/pairSessions\(([^;\n]*?)\)(?:;|\s*$|\.)/g)].map(m => m[1]);
  const real = calls.filter(c => !/^rs, lim = FORGOT_MS/.test(c));
  for (const c of real) assert.ok(/\b(lim|forgotLim)\b/.test(c), 'استدعاء pairSessions بلا مهلة موحّدة: ' + c);
  assert.ok(real.length >= 3);
});
test('دوام 12 ساعة: حضور ثانٍ بعد 15 ساعة يُتجاهل (مهلة 16) فلا يظهر «نسيان» مبكر على الجهاز', () => {
  const sc = fixed('07:00', '19:00'), lim = E.forgotLimitMs(sc);
  const rows = [rec('in', 0), rec('in', 15)];
  const unified = E.pairSessions(rows, lim);
  assert.equal(unified.length, 1); assert.equal(unified[0].end, null);
  const old = E.pairSessions(rows, E.FORGOT_MS);          // ما كان يحسبه الجهاز سابقًا
  assert.equal(old.length, 2);                            // انقسام مبكر = اختلاف عن اللوحة
});
test('دوام 24 ساعة (مرن): انصراف بعد 26 ساعة يُحتسب جلسة كاملة', () => {
  const lim = E.forgotLimitMs({ mode: 'flex', days: { 0: { on: true, h: 24 } } });
  const ses = E.pairSessions([rec('in', 0), rec('out', 26)], lim);
  assert.equal(ses.length, 1); assert.ok(ses[0].end);
});
test('وردية ليلية 8 ساعات تكتمل عبر منتصف الليل، ونسيان الانصراف يُكتشف بعد 14 ساعة', () => {
  const sc = fixed('22:00', '06:00'), lim = E.forgotLimitMs(sc);
  const ok = E.pairSessions([rec('in', 15), rec('out', 23)], lim);            // 22:00 -> 06:00
  assert.equal(ok.length, 1); assert.ok(ok[0].end);
  const forgot = E.pairSessions([rec('in', 15), rec('in', 15 + 15)], lim);    // حضور جديد بعد 15 س
  assert.equal(forgot.length, 2); assert.equal(forgot[0].end, null);
});
