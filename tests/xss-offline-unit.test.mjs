// انحدار S1: ملاحظة البصمة الأوفلاين يتحكم بها الموظف، ولا يجوز أن تُحقن في HTML شاشة المدير.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const a = html.indexOf('function parseOfflineNote'), b = html.indexOf('/*SPOOF-END*/');
assert.ok(a > 0 && b > a, 'parseOfflineNote غير موجودة');
const parse = new Function(html.slice(a, b) + '; return parseOfflineNote;')();
const m = html.indexOf('const mapLink');
const mapLink = new Function(html.slice(m, html.indexOf('\n', m)) + '; return mapLink;')();

const mk = o => '[GPS-OFFLINE]' + JSON.stringify(o);

test('S1: dist/acc النصية الخبيثة تصبح null', () => {
  const r = parse(mk({ dist: '<img src=x onerror=alert(1)>', acc: '"><script>x</script>', lat: 1, lng: 2 }));
  assert.equal(r.dist, null); assert.equal(r.acc, null);
});
test('S1: lat/lng الخبيثة لا تصل إلى href', () => {
  const r = parse(mk({ lat: '1" onmouseover="alert(2)', lng: 0 }));
  assert.equal(r.lat, null);
  assert.equal(mapLink(r.lat, r.lng), '#');
});
test('S1: القيم خارج النطاق ترفض (null)', () => {
  const r = parse(mk({ lat: 91, lng: -181, acc: -1, dist: 1e9 }));
  assert.deepEqual([r.lat, r.lng, r.acc, r.dist], [null, null, null, null]);
});
test('S1: القيم السليمة (أرقام أو نصوص رقمية) تمرّ', () => {
  const r = parse(mk({ lat: 32.8872, lng: '13.1913', acc: 12, dist: '40' }));
  assert.deepEqual([r.lat, r.lng, r.acc, r.dist], [32.8872, 13.1913, 12, 40]);
  assert.match(mapLink(r.lat, r.lng), /^https:\/\/www\.google\.com\/maps\?q=32\.8872,13\.1913$/);
});
test('S1: locId وsig تُقصّ، والحقول الزائدة تُهمل', () => {
  const r = parse(mk({ locId: 'x'.repeat(100), sig: 'y'.repeat(100), evil: '<b>' }));
  assert.equal(r.locId.length, 32); assert.equal(r.sig.length, 16); assert.equal('evil' in r, false);
});
test('S1: ملاحظة بلا بادئة أو JSON تالف ⇒ null', () => {
  assert.equal(parse('hello'), null);
  assert.equal(parse('[GPS-OFFLINE]{bad}'), null);
});
test('S1: قالب شاشة الطلبات يهرّب data-id/data-e ولا يحقن meta خاماً', () => {
  assert.doesNotMatch(html, /data-act="(appr|rej)" data-id="\$\{r\.id\}"/);
  assert.doesNotMatch(html, /\$\{meta\.dist\}م/);
  assert.doesNotMatch(html, /href="\$\{mapLink\(meta\.lat, meta\.lng\)\}"/);
});
