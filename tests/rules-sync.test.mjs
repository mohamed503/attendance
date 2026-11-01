// يضمن أن القواعد المضمّنة في index.html مطابقة لـ firestore.rules (المصدر الوحيد).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inSync, rulesToTemplate, syncedHtml, TARGETS } from '../scripts/rules-sync.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');

test('القواعد المضمّنة في index.html مطابقة لـ firestore.rules', () => {
  assert.ok(inSync(html, rules), 'شغّل: npm run rules:sync');
});
test('بريد المالك يُستبدل بمتغيّر القالب ${email}', () => {
  const t = rulesToTemplate(rules);
  assert.ok(t.includes("== '${email}'"));
  assert.ok(!t.includes('@gmail.com'));
});
test('المزامنة idempotent', () => {
  assert.equal(syncedHtml(html, rules), html);
});

for (const t of TARGETS) test(`القواعد المضمّنة في ${t} مطابقة لـ firestore.rules (لا نسخة قديمة تُسلَّم للعملاء)`, () => {
  const txt = readFileSync(join(root, t), 'utf8');
  assert.ok(inSync(txt, rules), 'شغّل: npm run rules:sync');
  assert.equal(syncedHtml(txt, rules), txt);
});
