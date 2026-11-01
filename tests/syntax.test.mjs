// يفحص أن السكربت المضمّن في index.html سليم نحوياً كوحدة ES (يلتقط await خارج دالة async وأخطاء الدمج).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('السكربت المضمّن في index.html يمرّ فحص النحو', () => {
  const h = readFileSync(join(root, 'index.html'), 'utf8');
  const a = h.indexOf('<script type="module">') + '<script type="module">'.length, b = h.lastIndexOf('</script>');
  assert.ok(a > 30 && b > a);
  const tmp = mkdtempSync(join(tmpdir(), 'meqat-syn-'));
  try {
    const f = join(tmp, 'mod.mjs'); writeFileSync(f, h.slice(a, b));
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
