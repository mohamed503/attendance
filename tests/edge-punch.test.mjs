// اختبارات خادم الحافة (بلا شبكة): ID Token، التحدي الأحادي، تحقق WebAuthn، كتابة التذكرة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as wc } from 'node:crypto';
import { b64uEnc, utf8 } from '../edge/src/b64.js';
import { handleChallenge, handleTicket, HttpError } from '../edge/src/punch.js';

const PROJECT = 'proj-x', ORIGIN = 'https://app.example.pages.dev', UID = 'u1';
const rsa = await wc.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await wc.subtle.exportKey('jwk', rsa.publicKey)), kid: 'k1' };
const sign = async (claims, kid = 'k1', key = rsa.privateKey) => {
  const h = b64uEnc(utf8(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))), p = b64uEnc(utf8(JSON.stringify(claims)));
  return h + '.' + p + '.' + b64uEnc(await wc.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(h + '.' + p)));
};
const idTok = (over = {}) => sign({ aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: UID, iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 3000, ...over });
const req = tok => ({ headers: { get: k => (k.toLowerCase() === 'authorization' && tok ? 'Bearer ' + tok : '') } });

// مفتاح بصمة الموظف + محاكاة جهاز WebAuthn
const ec = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const spki = b64uEnc(await wc.subtle.exportKey('spki', ec.publicKey));
const rawToDer = raw => { const enc = v => { let i = 0; while (i < v.length - 1 && v[i] === 0) i++; v = v.slice(i); if (v[0] & 0x80) v = Uint8Array.from([0, ...v]); return [0x02, v.length, ...v]; }; const r = enc(raw.slice(0, 32)), s = enc(raw.slice(32)); return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]); };
async function assertion(challenge, o = {}) {
  const cd = utf8(JSON.stringify({ type: 'webauthn.get', challenge, origin: o.origin || ORIGIN }));
  const ad = new Uint8Array(37); ad.set(new Uint8Array(await wc.subtle.digest('SHA-256', utf8(new URL(o.origin || ORIGIN).hostname)))); ad[32] = o.flags ?? 5;
  const cdh = new Uint8Array(await wc.subtle.digest('SHA-256', cd)); const data = new Uint8Array(37 + 32); data.set(ad); data.set(cdh, 37);
  const sig = new Uint8Array(await wc.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, o.key || ec.privateKey, data));
  return { clientDataJSON: b64uEnc(cd), authenticatorData: b64uEnc(ad), signature: b64uEnc(rawToDer(sig)) };
}

function mk(over = {}) {
  const docs = { 'employees/e1': { active: true, devices: { D1: UID }, bio: { cid: 'c', pk: spki } }, 'locations/L1': { active: true, methods: ['gps', 'bio'] }, ...(over.docs || {}) };
  const writes = [], chs = new Map(); let issued = 0;
  let t = over.now || Date.now();
  const deps = {
    env: { FIREBASE_PROJECT_ID: PROJECT, ALLOWED_ORIGINS: ORIGIN }, now: () => t, getKeys: async () => [jwk],
    store: {
      issue: async (uid, rec) => { if (over.limit && ++issued > over.limit) return { ok: false }; chs.set(uid + ':' + rec.challenge, rec); return { ok: true }; },
      take: async (uid, c, now) => { const k = uid + ':' + c, r = chs.get(k); chs.delete(k); return r && r.exp > now ? r : null; }
    },
    fs: { getDoc: async p => docs[p] || null, putDoc: async (p, f) => { writes.push([p, f]); } }
  };
  return { deps, writes, docs, setNow: x => { t = x; } };
}
const err = async (p, status, code) => { try { await p; assert.fail('expected HttpError'); } catch (e) { assert.ok(e instanceof HttpError, String(e)); assert.equal(e.status, status); if (code) assert.match(e.code, code); } };
const flow = async (m, tok, aOver) => {
  const c = await handleChallenge(req(tok), { empId: 'e1', locId: 'L1', type: 'in' }, m.deps);
  return { c, a: await assertion(c.challenge, aOver) };
};

test('تدفق كامل ناجح: تحدٍّ ثم تذكرة تُكتب في punchTickets/{uid} بحقول صحيحة', async () => {
  const m = mk(), tok = await idTok(); const { c, a } = await flow(m, tok);
  const r = await handleTicket(req(tok), { challenge: c.challenge, assertion: a }, m.deps);
  assert.match(r.ticket, /^[0-9a-f]{32}$/); assert.equal(m.writes.length, 1);
  const [path, f] = m.writes[0]; assert.equal(path, 'punchTickets/' + UID);
  assert.equal(f.nonce.stringValue, r.ticket); assert.equal(f.empId.stringValue, 'e1'); assert.equal(f.locId.stringValue, 'L1'); assert.equal(f.type.stringValue, 'in');
  assert.deepEqual(f.m.arrayValue.values, [{ stringValue: 'bio' }]); assert.ok(f.exp.timestampValue);
});
test('بلا توكن أو بتوكن مزوَّر أو منتهٍ أو لمشروع آخر ⇒ 401', async () => {
  const m = mk(); const body = { empId: 'e1', locId: 'L1', type: 'in' };
  await err(handleChallenge(req(''), body, m.deps), 401);
  await err(handleChallenge(req(await idTok({ exp: Math.floor(Date.now() / 1000) - 10 })), body, m.deps), 401);
  await err(handleChallenge(req(await idTok({ aud: 'other' })), body, m.deps), 401);
  const other = await wc.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  await err(handleChallenge(req(await sign({ aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: UID, iat: 1, exp: 9999999999 }, 'k1', other.privateKey)), body, m.deps), 401);
});
test('التحدي يُستهلك مرة واحدة: إعادة الإرسال نفسها مرفوضة ولا تذكرة ثانية', async () => {
  const m = mk(), tok = await idTok(); const { c, a } = await flow(m, tok);
  await handleTicket(req(tok), { challenge: c.challenge, assertion: a }, m.deps);
  await err(handleTicket(req(tok), { challenge: c.challenge, assertion: a }, m.deps), 403, /challenge/);
  assert.equal(m.writes.length, 1);
});
test('تحدٍّ منتهٍ (بعد 60 ثانية) مرفوض', async () => {
  const m = mk(), tok = await idTok(); const { c, a } = await flow(m, tok);
  m.setNow(Date.now() + 61000);
  await err(handleTicket(req(tok), { challenge: c.challenge, assertion: a }, m.deps), 403, /challenge/);
});
test('تحدٍّ أُصدر لمستخدم لا يصلح لآخر', async () => {
  const m = mk(), tok = await idTok(), tok2 = await idTok({ sub: 'u2' }); const { c, a } = await flow(m, tok);
  await err(handleTicket(req(tok2), { challenge: c.challenge, assertion: a }, m.deps), 403, /challenge/);
});
test('توقيع بمفتاح غير مفتاح الموظف ⇒ رفض ولا كتابة', async () => {
  const m = mk(), tok = await idTok(); const bad = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const { c, a } = await flow(m, tok, { key: bad.privateKey });
  await err(handleTicket(req(tok), { challenge: c.challenge, assertion: a }, m.deps), 403, /signature/); assert.equal(m.writes.length, 0);
});
test('تحدٍّ مختلف داخل clientData، origin غير مسموح، وغياب علم التحقق البيومتري ⇒ رفض', async () => {
  const m = mk(), tok = await idTok();
  let { c } = await flow(m, tok);
  await err(handleTicket(req(tok), { challenge: c.challenge, assertion: await assertion('AAAA') }, m.deps), 403, /challenge/);
  ({ c } = await flow(m, tok));
  await err(handleTicket(req(tok), { challenge: c.challenge, assertion: await assertion(c.challenge, { origin: 'https://evil.example' }) }, m.deps), 403, /origin/);
  ({ c } = await flow(m, tok));
  await err(handleTicket(req(tok), { challenge: c.challenge, assertion: await assertion(c.challenge, { flags: 1 }) }, m.deps), 403, /flags/);
  assert.equal(m.writes.length, 0);
});
test('موظف لا يملك الحساب، أو بلا بصمة مسجّلة، أو غير نشط، أو موقع لا يشترط بصمة ⇒ رفض', async () => {
  const cases = [
    [{ 'employees/e1': { active: true, devices: { D1: 'someone' }, bio: { pk: spki } } }, /not-owner/],
    [{ 'employees/e1': { active: true, devices: { D1: UID } } }, /no-bio/],
    [{ 'employees/e1': { active: false, devices: { D1: UID }, bio: { pk: spki } } }, /employee/],
    [{ 'locations/L1': { active: true, methods: ['gps'] } }, /location/],
    [{ 'employees/e1': { active: true, devices: { D1: UID }, bio: { pk: spki }, locs: ['L2'] } }, /loc-not-allowed/]
  ];
  for (const [docs, re] of cases) {
    const m = mk({ docs }), tok = await idTok(); const { c, a } = await flow(m, tok);
    await err(handleTicket(req(tok), { challenge: c.challenge, assertion: a }, m.deps), 403, re); assert.equal(m.writes.length, 0);
  }
});
test('حد المعدل: تجاوز طلبات التحدي ⇒ 429، ومدخلات خاطئة ⇒ 400', async () => {
  const m = mk({ limit: 2 }), tok = await idTok(); const body = { empId: 'e1', locId: 'L1', type: 'in' };
  await handleChallenge(req(tok), body, m.deps); await handleChallenge(req(tok), body, m.deps);
  await err(handleChallenge(req(tok), body, m.deps), 429);
  await err(handleChallenge(req(tok), { empId: '../x', locId: 'L1', type: 'in' }, mk().deps), 400);
  await err(handleChallenge(req(tok), { empId: 'e1', locId: 'L1', type: 'zzz' }, mk().deps), 400);
});
