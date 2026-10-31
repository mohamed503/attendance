// يختبر مولّد رمز الأجهزة المأخوذ حرفيًا من index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const a = html.indexOf('const PIN_ALPHABET'), b = html.indexOf('const randToken');
const src = html.slice(a, b);
const P = new Function(src + '\nreturn { PIN_ALPHABET, PIN_TTL_H, genPin, fmtPin, normPin };')();

test('الرمز 8 خانات من الأبجدية فقط وبلا خانات ملتبسة', () => {
  for (let i = 0; i < 500; i++) {
    const p = P.genPin();
    assert.match(p, /^[A-HJ-NP-Z2-9]{8}$/);
  }
  assert.equal(P.PIN_ALPHABET.length, 32);
  assert.ok(!/[01IO]/.test(P.PIN_ALPHABET));
});
test('الرموز غير متكررة عمليًا', () => {
  const s = new Set(Array.from({ length: 2000 }, () => P.genPin())); assert.equal(s.size, 2000);
});
test('توزيع الأحرف غير منحاز بشكل ظاهر', () => {
  const c = {}; for (let i = 0; i < 4000; i++) for (const ch of P.genPin()) c[ch] = (c[ch] || 0) + 1;
  const vals = Object.values(c), mean = 32000 / 32;
  assert.ok(Math.min(...vals) > mean * 0.8 && Math.max(...vals) < mean * 1.2);
});
test('التنسيق والتطبيع', () => {
  assert.equal(P.fmtPin('ABCD2345'), 'ABCD-2345');
  assert.equal(P.normPin(' abcd-2345 '), 'ABCD2345');
  assert.equal(P.normPin(null), '');
});
test('مدة الصلاحية 48 ساعة', () => assert.equal(P.PIN_TTL_H, 48));
