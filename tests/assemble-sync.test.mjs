// index.html مُولَّد من src/ ؛ يمنع تعديله يدوياً أو نسيان إعادة التجميع (يحرس مصدر الحقيقة الواحد).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleHtml } from '../scripts/assemble.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('index.html مطابق لناتج التجميع من src/ (شغّل npm run assemble)', () => {
  assert.equal(readFileSync(join(root, 'index.html'), 'utf8') === assembleHtml(), true);
});
test('كل أجزاء parts.json موجودة ولا يوجد ملف في src/ خارج القائمة', async () => {
  const { readdirSync } = await import('node:fs');
  const { parts } = JSON.parse(readFileSync(join(root, 'src', 'parts.json'), 'utf8'));
  const onDisk = ['html', 'styles', 'js'].flatMap(d => readdirSync(join(root, 'src', d)).map(f => d + '/' + f)).sort();
  assert.deepEqual([...parts].sort(), onDisk);
});
