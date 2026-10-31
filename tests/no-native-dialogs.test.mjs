// يمنع عودة prompt/confirm/alert الأصلية (سيئة على الجوال وRTL)؛ البديل: mqConfirm/mqPrompt/mqAlert/mqChoice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('لا استدعاءات أصلية لـ prompt/confirm/alert في index.html', () => {
  const h = readFileSync(join(root, 'index.html'), 'utf8');
  const bad = [];
  h.split('\n').forEach((l, i) => { if (/(?<![\w.$])(prompt|confirm|alert)\(/.test(l)) bad.push((i + 1) + ': ' + l.trim().slice(0, 90)); });
  assert.deepEqual(bad, []);
});
