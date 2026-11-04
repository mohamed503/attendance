// W1: تفعيل Service Worker يحذف caches ميقات القديمة فقط، ولا يمس caches غيرها في نفس النطاق.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'sw.js'), 'utf8');

async function runActivate(existing) {
  const store = new Set(existing), handlers = {}, deleted = [];
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, clients: { claim: async () => {} }, skipWaiting() {}, registration: {} };
  const caches = { keys: async () => [...store], delete: async k => { deleted.push(k); return store.delete(k); }, open: async () => ({ put: async () => {} }) };
  new Function('self', 'caches', 'fetch', sw)(self, caches, async () => ({ ok: false }));
  let p; handlers.activate({ waitUntil: x => { p = x; } }); await p;
  return { deleted, left: [...store] };
}
test('W1: يحذف meqat-v1..v5 القديمة ويُبقي الحالية', async () => {
  const ver = /const VER = '([^']+)'/.exec(sw)[1];
  const r = await runActivate(['meqat-v1', 'meqat-v5', ver]);
  assert.deepEqual(r.deleted.sort(), ['meqat-v1', 'meqat-v5']); assert.ok(r.left.includes(ver));
});
test('W1: لا يمس caches تطبيقات أخرى على نفس النطاق', async () => {
  const r = await runActivate(['other-app-v1', 'workbox-precache-v2', 'meqat-old']);
  assert.deepEqual(r.deleted, ['meqat-old']); assert.deepEqual(r.left.sort(), ['other-app-v1', 'workbox-precache-v2']);
});
