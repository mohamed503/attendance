// يختبر منطق طرق الحضور (سياسة الموقع، رمز QR المتغيّر، توقيع WebAuthn، استيراد سجلات الأجهزة) المقتطع حرفياً من index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, createSign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const s = html.indexOf('/*AM-START*/'), e = html.indexOf('/*AM-END*/');
assert.ok(s > 0 && e > s, 'AM block missing');
const sha = 'const sha256Hex = async str => { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join(""); };';
const E = new Function(sha + html.slice(s, e) + '\nreturn { locMethods, locMode, methodsText, stepsFor, qrWindow, qrToken, qrPayload, parseQrPayload, newQrSecret, b64u, derToRaw, waVerify, devParseDT, devParseTime, devRowsFromText, devDetect, devParse, devBuild, devIdKey };')();

test('سياسة الموقع: الافتراضي GPS وحده، وتُنقّى القيم الدخيلة', () => {
  assert.deepEqual(E.locMethods({}), ['gps']);
  assert.deepEqual(E.locMethods({ methods: [] }), ['gps']);
  assert.deepEqual(E.locMethods({ methods: ['bio', 'x', 'qr'] }), ['qr', 'bio']);
  assert.equal(E.locMode({}), 'all'); assert.equal(E.locMode({ mode: 'any' }), 'any');
});
test('stepsFor: all تتطلب كل الطرق، any تكفي واحدة', () => {
  const all = { methods: ['gps', 'qr', 'bio'], mode: 'all' };
  assert.deepEqual(E.stepsFor(all, true), { ok: true, need: ['qr', 'bio'] });
  assert.equal(E.stepsFor(all, false).ok, false);
  const any = { methods: ['gps', 'qr', 'bio'], mode: 'any' };
  assert.deepEqual(E.stepsFor(any, true), { ok: true, need: [] });
  assert.deepEqual(E.stepsFor(any, false), { ok: true, need: ['qr'] });
  assert.deepEqual(E.stepsFor({ methods: ['gps', 'bio'], mode: 'any' }, false), { ok: true, need: ['bio'] });
  assert.equal(E.stepsFor({ methods: ['gps'] }, false).ok, false);
  assert.deepEqual(E.stepsFor({ methods: ['qr'] }, false), { ok: true, need: ['qr'] });
});
test('QR: الرمز يتغير كل 30 ثانية ويطابق sha256(سر:نافذة) كما في قواعد Firestore', async () => {
  const secret = 'abc123', t = 1_700_000_000_000, w = Math.floor(t / 30000);
  const expect = createHash('sha256').update(`${secret}:${w}`).digest('hex');
  assert.equal(await E.qrToken(secret, t), expect);
  assert.equal(await E.qrToken(secret, t + 29_000 - (t % 30000)), expect);
  assert.notEqual(await E.qrToken(secret, t + 30_000), expect);
  assert.notEqual(await E.qrToken('other', t), expect);
});
test('QR: التحليل يرفض أي نص غير مطابق', () => {
  const tok = 'a'.repeat(64);
  assert.deepEqual(E.parseQrPayload(E.qrPayload('Loc_1-x', tok)), { locId: 'Loc_1-x', tok });
  for (const bad of ['', 'hello', 'MQ1.loc.short', 'MQ2.loc.' + tok, 'MQ1.loc.' + tok.toUpperCase(), 'MQ1.a/b.' + tok]) assert.equal(E.parseQrPayload(bad), null);
  assert.equal(E.newQrSecret().length, 48);
});
test('WebAuthn: يقبل توقيعاً صحيحاً ويرفض التحدّي الخاطئ وغياب علَم التحقق البيومتري والتوقيع المعدَّل', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const rpId = 'meqat.example.com', ch = new TextEncoder().encode('emp|in|loc|1700000000');
  const mk = (flags, challenge = ch) => {
    const rp = createHash('sha256').update(rpId).digest();
    const ad = Buffer.concat([rp, Buffer.from([flags]), Buffer.alloc(4)]);
    const cdj = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: E.b64u.enc(challenge), origin: 'https://' + rpId }));
    const sig = createSign('SHA256').update(Buffer.concat([ad, createHash('sha256').update(cdj).digest()])).sign(privateKey);   // DER
    return { clientDataJSON: cdj.buffer.slice(cdj.byteOffset, cdj.byteOffset + cdj.length), authenticatorData: ad.buffer.slice(ad.byteOffset, ad.byteOffset + ad.length), signature: sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.length) };
  };
  const pk = E.b64u.enc(spki);
  assert.equal(await E.waVerify(pk, mk(0x05), ch, rpId), true);
  assert.equal(await E.waVerify(pk, mk(0x01), ch, rpId), false, 'بلا UV');
  assert.equal(await E.waVerify(pk, mk(0x05), new TextEncoder().encode('other'), rpId), false, 'تحدٍّ مختلف');
  assert.equal(await E.waVerify(pk, mk(0x05), ch, 'evil.example.com'), false, 'نطاق مختلف');
  const bad = mk(0x05); new Uint8Array(bad.signature)[10] ^= 0xff;
  assert.equal(await E.waVerify(pk, bad, ch, rpId), false, 'توقيع معدَّل');
});
test('b64u ذهاباً وإياباً', () => {
  const b = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 1, 2]);
  assert.deepEqual([...E.b64u.dec(E.b64u.enc(b))], [...b]);
});

/* ---- استيراد الأجهزة ---- */
const emps = [{ id: 'e1', name: 'أحمد', bioId: '101' }, { id: 'e2', name: 'سالم', bioId: '0102' }];
const byId = new Map(emps.map(x => [E.devIdKey(x.bioId), x]));
const run = (text, tz = 120) => { const rows = E.devRowsFromText(text); const cfg = E.devDetect(rows); return { cfg, ...E.devParse(rows, byId, tz, cfg) }; };

test('ZKTeco ATTLOG (Tab) مع الحالة: حضور/انصراف من عمود الحالة، والتوقيت يحوَّل بإزاحة المنشأة', () => {
  const t = ['101\t2026-10-25 08:00:05\t1\t0\t1\t0', '101\t2026-10-25 16:01:00\t1\t1\t1\t0', '102\t2026-10-25 08:10:00\t1\t0\t1\t0', '102\t2026-10-25 16:00:00\t1\t1\t1\t0', '999\t2026-10-25 08:00:00\t1\t0\t1\t0'].join('\n');
  const r = run(t);
  assert.equal(r.recs.length, 4); assert.equal(r.unmatched.get('999'), 1);
  const a = r.recs.filter(x => x.emp.id === 'e1');
  assert.deepEqual(a.map(x => x.type), ['in', 'out']);
  assert.equal(a[0].ms, Date.UTC(2026, 9, 25, 6, 0, 5));      // 08:00 بتوقيت +2 = 06:00 UTC
});
test('رقم الموظف بأصفار بادئة يطابق (0102 = 102) والأرقام العربية', () => {
  const r = run('102,25/10/2026 08:00,\n102,25/10/2026 16:00,');
  assert.equal(r.recs.length, 2);
  const r2 = run('١٠١\t٢٠٢٦-١٠-٢٥ ٠٨:٠٠:٠٠');
  assert.equal(r2.recs.length, 1);
});
test('CSV بعناوين وفصل التاريخ والوقت في عمودين وصيغة 12 ساعة', () => {
  const t = 'ID,Name,Date,Time\n101,Ahmed,25/10/2026,08:05 AM\n101,Ahmed,25/10/2026,04:30 PM';
  const r = run(t);
  assert.equal(r.cfg.header, true);
  assert.deepEqual(r.recs.map(x => x.ms), [Date.UTC(2026, 9, 25, 6, 5), Date.UTC(2026, 9, 25, 14, 30)]);
});
test('ملف بمسافات (ATTLOG القديم) يضمّ التاريخ والوقت', () => {
  const r = run('   101  2026-10-25 08:00:00  1  0\n   101  2026-10-25 17:00:00  1  0');
  assert.equal(r.recs.length, 2);
});
test('بلا عمود حالة مفيد: تناوب حضور/انصراف داخل اليوم، وحذف التكرار تحت دقيقة، وتاريخ شهر/يوم يُكتشف', () => {
  const r = run('101,10/25/2026 08:00:00\n101,10/25/2026 08:00:30\n101,10/25/2026 12:00:00\n101,10/25/2026 13:00:00\n101,10/26/2026 08:00:00');
  assert.equal(r.cfg.order, 'mdy');
  assert.deepEqual(r.recs.map(x => x.type), ['in', 'out', 'in', 'in']);
});
test('الرقم التسلسلي لـ Excel وصفوف التالفة', () => {
  const t = E.devParseDT('46320.3333333');           // 2026-10-... 08:00
  assert.equal(t.y, 2026); assert.equal(t.h, 8);
  const r = run('101,2026-10-25 08:00:00\n101,garbage\n101,2026-10-25 17:00:00');
  assert.equal(r.recs.length, 2); assert.equal(r.bad, 1);
});
test('إعادة الاستيراد حتمية: نفس الملف يعطي نفس الأوقات (معرّفات bio_ms ثابتة)', () => {
  const t = '101\t2026-10-25 08:00:00\n101\t2026-10-25 16:00:00';
  assert.deepEqual(run(t).recs.map(x => x.ms), run(t).recs.map(x => x.ms));
});
