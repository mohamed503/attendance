// اختبارات عميل Firestore REST والموجّه وكائن التحديات (بلا شبكة).
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as wc } from 'node:crypto';
import { createFirestore, S, T, A } from '../edge/src/firestore.js';
import worker, { ChallengeStore } from '../edge/src/index.js';

const kp = await wc.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const der = Buffer.from(await wc.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
const PEM = '-----BEGIN PRIVATE KEY-----\n' + der.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';

test('Firestore REST: يطلب رمز OAuth موقّعاً RS256 مرة واحدة ويخزّنه، ويفك قيم المستند', async () => {
  const calls = [];
  const fetchFn = async (url, o = {}) => {
    calls.push([url, o]);
    if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }));
    if (o.method === 'PATCH') return new Response('{}');
    if (url.endsWith('/employees/none')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ fields: { active: { booleanValue: true }, n: { integerValue: '5' }, devices: { mapValue: { fields: { D: { stringValue: 'u1' } } } }, locs: { arrayValue: { values: [{ stringValue: 'L1' }] } } } }));
  };
  const fs = createFirestore({ projectId: 'p', clientEmail: 'sa@p.iam', privateKey: PEM.replace(/\n/g, '\\n'), fetchFn });
  const d = await fs.getDoc('employees/e1');
  assert.deepEqual(d, { active: true, n: 5, devices: { D: 'u1' }, locs: ['L1'] });
  assert.equal(await fs.getDoc('employees/none'), null);
  await fs.putDoc('punchTickets/u1', { nonce: S('x'), exp: T(0), m: A(['bio']) });
  assert.equal(calls.filter(c => c[0].includes('oauth2')).length, 1, 'الرمز يُخزَّن مؤقتاً');
  const tokReq = calls[0][1].body; assert.match(tokReq, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
  const jwt = /assertion=([^&]+)/.exec(tokReq)[1].split('.');
  assert.equal(JSON.parse(Buffer.from(jwt[0], 'base64url')).alg, 'RS256');
  assert.equal(JSON.parse(Buffer.from(jwt[1], 'base64url')).iss, 'sa@p.iam');
  const ok = await wc.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, Buffer.from(jwt[2], 'base64url'), new TextEncoder().encode(jwt[0] + '.' + jwt[1]));
  assert.equal(ok, true);
  const put = calls.find(c => c[1].method === 'PATCH'); assert.match(put[0], /\/documents\/punchTickets\/u1$/);
  assert.equal(JSON.parse(put[1].body).fields.exp.timestampValue, '1970-01-01T00:00:00.000Z');
  assert.equal(put[1].headers.authorization, 'Bearer AT');
});

const fakeEnv = () => {
  const stores = new Map();
  const mkStore = () => { const m = new Map(); return new ChallengeStore({ storage: { get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } } }); };
  return { FIREBASE_PROJECT_ID: 'p', ALLOWED_ORIGINS: 'https://a.example', SA_CLIENT_EMAIL: 'x', SA_PRIVATE_KEY: PEM,
    CHALLENGES: { idFromName: n => n, get: n => { if (!stores.has(n)) stores.set(n, mkStore()); const s = stores.get(n); return { fetch: (u, o) => s.fetch(new Request(u, o)) }; } } };
};
test('الموجّه: OPTIONS لأصل مسموح يضيف CORS، ولأصل غريب لا يضيفه؛ GET مرفوض؛ مسار مجهول 404', async () => {
  const env = fakeEnv();
  const ok = await worker.fetch(new Request('https://e/v1/punch/ticket', { method: 'OPTIONS', headers: { origin: 'https://a.example' } }), env);
  assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), 'https://a.example');
  const bad = await worker.fetch(new Request('https://e/v1/punch/ticket', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), env);
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  assert.equal((await worker.fetch(new Request('https://e/v1/punch/ticket'), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://e/zzz', { method: 'POST', body: '{}' }), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://e/v1/punch/challenge', { method: 'POST', body: '{}' }), env)).status, 401);
});
test('كائن التحديات: issue ثم take مرة واحدة فقط، وحد 12 طلباً/دقيقة', async () => {
  const m = new Map(); const st = new ChallengeStore({ storage: { get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } } });
  const call = o => st.fetch(new Request('https://do/', { method: 'POST', body: JSON.stringify(o) })).then(r => r.json());
  const now = 1000000, rec = c => ({ challenge: c, exp: now + 60000 });
  assert.equal((await call({ op: 'issue', rec: rec('c1'), now })).ok, true);
  assert.deepEqual((await call({ op: 'take', challenge: 'c1', now: now + 1 })).challenge, 'c1');
  assert.equal(await call({ op: 'take', challenge: 'c1', now: now + 2 }), null);
  await call({ op: 'issue', rec: rec('c2'), now });
  assert.equal(await call({ op: 'take', challenge: 'c2', now: now + 61000 }), null, 'منتهٍ');
  let last; for (let i = 0; i < 12; i++) last = await call({ op: 'issue', rec: rec('x' + i), now });
  assert.equal(last.ok, false);
  assert.equal((await call({ op: 'issue', rec: rec('late'), now: now + 61000 })).ok, true, 'نافذة جديدة');
});
