// T1: أداة البذر بلا eval، وقراءة الإعداد آمنة، والبذر قابل للتكرار (معرّفات ثابتة) والدفعات تُنتظر.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'meqat-seed.html'), 'utf8');
const a = html.indexOf('function parseFirebaseConfig'), b = html.indexOf('\n}\n', a) + 3;
const sidLine = html.slice(html.indexOf('const sid = '), html.indexOf('\n', html.indexOf('const sid = ')));
const { parseFirebaseConfig, sid } = new Function(sidLine + '\n' + html.slice(a, b) + '\nreturn { parseFirebaseConfig, sid };')();

test('T1: لا eval ولا new Function في أداة البذر', () => {
  assert.doesNotMatch(html, /\beval\s*\(/); assert.doesNotMatch(html, /new Function\s*\(/);
});
test('T1: قراءة بلوك firebaseConfig العادي (مفاتيح بلا اقتباس وبنصوص مزدوجة/مفردة)', () => {
  const c = parseFirebaseConfig(`const firebaseConfig = {\n  apiKey: "AIzaXYZ",\n  authDomain: 'demo.firebaseapp.com',\n  projectId: "demo",\n  appId: "1:123:web:abc"\n};`);
  assert.deepEqual(c, { apiKey: 'AIzaXYZ', authDomain: 'demo.firebaseapp.com', projectId: 'demo', appId: '1:123:web:abc' });
});
test('T1: كود ضار داخل الإعداد لا يُنفَّذ ولا يظهر كقيمة', () => {
  globalThis.__pwned = 0;
  const c = parseFirebaseConfig('{ apiKey: "k", projectId: "p", evil: (globalThis.__pwned = 1), x: fetch("http://x") }');
  assert.equal(globalThis.__pwned, 0); assert.equal(c.apiKey, 'k'); assert.equal(c.projectId, 'p'); assert.equal(c.evil, undefined);
});
test('T1: نص بلا قوسين أو فارغ ⇒ null', () => { assert.equal(parseFirebaseConfig('hello'), null); assert.equal(parseFirebaseConfig(''), null); assert.equal(parseFirebaseConfig('{}'), null); });
test('T1: معرّفات ثابتة وآمنة للمسار', () => {
  assert.equal(sid('emp', 3), 'seed_emp_3'); assert.equal(sid('2026-10-01', 'in'), 'seed_2026-10-01_in');
  assert.equal(sid('a/b', 'c d'), 'seed_a-b_c-d'); assert.equal(sid('emp', 3), sid('emp', 3));
});
test('T1: لا addDoc ولا معرّفات عشوائية ولا flush غير مُنتظر', () => {
  assert.doesNotMatch(html, /\baddDoc\(/); assert.doesNotMatch(html, /uid10\(\)/); assert.doesNotMatch(html, /Math\.random/); assert.doesNotMatch(html, /[^t]\bflush\(\)/);
  assert.match(html, /await b\.commit\(\)/);
});
test('T1: تأكيد المشروع قبل الكتابة وعدم الكتابة فوق settings/general الموجودة', () => {
  assert.match(html, /confirm\([^)]*projectId/);
  assert.match(html, /\(await getDoc\(gRef\)\)\.exists\(\)/);
});
