// يضمن أن البناء ينتج ملفات النشر كاملة وبلا تحويل (index.html مطابق للمصدر، وsw.js وmanifest والأيقونة في الجذر).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, APP_FILES } from '../scripts/build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('البناء ينسخ ملفات التطبيق كما هي', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'meqat-build-'));
  try {
    const { out } = build(join(tmp, 'dist'));
    for (const f of APP_FILES) {
      assert.ok(existsSync(join(out, f)), 'مفقود في dist: ' + f);
      assert.equal(readFileSync(join(out, f), 'utf8'), readFileSync(join(root, f), 'utf8'), f + ' يجب أن يطابق المصدر');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('index.html يشير إلى sw.js وmanifest.json وicon.svg بمسارات موجودة في ملفات النشر', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /serviceWorker\.register\('sw\.js'\)/);
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  assert.match(html, /<link rel="icon"[^>]*href="icon\.svg">/);
  for (const f of ['sw.js', 'manifest.json', 'icon.svg']) assert.ok(APP_FILES.includes(f), f);
});
