// اختبار متصفح للوحة التسليم (meqat-console.html): كل التبويبات + توليد حزمة عميل والتحقق من محتواها.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = { '/meqat-console.html': 'text/html; charset=utf-8', '/index.html': 'text/html; charset=utf-8', '/sw.js': 'text/javascript', '/manifest.json': 'application/json', '/icon.svg': 'image/svg+xml' };
let srv, url, browser;
before(async () => {
  srv = http.createServer((q, r) => { const p = new URL(q.url, 'http://x').pathname; if (!FILES[p]) { r.writeHead(404); return r.end('no'); } r.writeHead(200, { 'Content-Type': FILES[p] }); r.end(readFileSync(join(root, p))); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); url = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
after(async () => { await browser.close(); srv.close(); });

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const CLIENTS = () => [
  { id: 'c1', company: 'شركة النور', contact: 'أحمد', phone: '218911112222', ownerEmail: 'owner@alnoor.ly', planId: 'company', kind: 'paid', start: today(), durationDays: 365, domain: 'https://alnoor.example', projectId: 'alnoor-prod', apiKey: 'AIzaSyTESTKEY1234567', appId: '1:123456789:web:abcdef', createdAt: today() },
  { id: 'c2', company: 'مؤسسة الأمل', ownerEmail: 'a@amal.ly', planId: 'starter', kind: 'trial', start: '2020-01-01', projectId: 'amal-trial', apiKey: 'AIzaSyTESTKEY7654321', appId: '1:987654321:web:fedcba', createdAt: today() },
  { id: 'c3', company: 'نسخة عرض', kind: 'demo', planId: 'company', start: today(), createdAt: today() }
];
async function open(vp = { width: 1280, height: 800 }, theme = 'light') {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true, locale: 'ar' }); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.addInitScript(([c, th]) => { localStorage.setItem('mc_clients', JSON.stringify(c)); if (th === 'dark') localStorage.setItem('mc_theme', JSON.stringify('dark')); }, [CLIENTS(), theme]);
  await page.goto(url + '/meqat-console.html'); await page.waitForSelector('#tabbar .tab'); await page.waitForTimeout(200);
  return { page, ctx, errors };
}
const unzip = buf => { const out = {}; let p = 0; while (buf.readUInt32LE(p) === 0x04034b50) { const sz = buf.readUInt32LE(p + 18), nl = buf.readUInt16LE(p + 26), el = buf.readUInt16LE(p + 28); const name = buf.slice(p + 30, p + 30 + nl).toString('utf8'); out[name] = buf.slice(p + 30 + nl + el, p + 30 + nl + el + sz); p += 30 + nl + el + sz; } return out; };

for (const [n, vp] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 800 }]]) test(`اللوحة (${n}): كل التبويبات تفتح بلا أخطاء ولا تمرير أفقي`, async () => {
  const { page, ctx, errors } = await open(vp);
  const tabs = await page.$$eval('#tabbar .tab', els => els.map(e => e.dataset.t));
  assert.ok(tabs.length >= 7, 'التبويبات: ' + tabs);
  for (const t of tabs) {
    await page.click(`#tabbar .tab[data-t="${t}"]`); await page.waitForTimeout(250);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 1, `تمرير أفقي ${over}px في ${t}`);
  }
  assert.deepEqual(errors, [], errors.join(' | ')); await ctx.close();
});

test('اللوحة: العملاء الثلاثة بحالاتهم الصحيحة (مفعّل/منتهٍ/ديمو)', async () => {
  const { page, ctx, errors } = await open();
  const txt = await page.$eval('#content', e => e.textContent);
  for (const s of ['شركة النور', 'مؤسسة الأمل', 'نسخة عرض']) assert.ok(txt.includes(s), s);
  assert.ok(/منتهٍ/.test(txt), 'تجربة قديمة يجب أن تظهر منتهية');
  assert.deepEqual(errors, []); await ctx.close();
});

test('المولّد: حزمة العميل تحوي ترخيصه وإعداداته وقواعد مطابقة لـ firestore.rules', async () => {
  const { page, ctx, errors } = await open();
  await page.click('#tabbar .tab[data-t="generator"]'); await page.waitForSelector('#gClient');
  await page.selectOption('#gClient', 'c1'); await page.fill('#tplUrl', url + '/index.html');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#gRun')]);
  await page.waitForSelector('#gOut .res-ok', { timeout: 15000 });
  const buf = readFileSync(await dl.path()), files = unzip(buf), names = Object.keys(files);
  const idx = names.find(n => /site\/index\.html$/.test(n)), rl = names.find(n => /firestore\.rules/.test(n));
  assert.ok(idx && rl, 'ملفات الحزمة: ' + names.join(', '));
  const html = files[idx].toString('utf8'), rules = files[rl].toString('utf8');
  assert.ok(html.includes('"projectId": "alnoor-prod"') && html.includes('window.MEQAT_LICENSE'), 'الإعداد/الترخيص');
  assert.ok(/"company": "شركة النور"/.test(html) && /"maxEmployees": 50/.test(html), 'حدود الباقة');
  const src = readFileSync(join(root, 'firestore.rules'), 'utf8').replace(/(token\.get\('email', ''\) == ')[^']*(')/, '$1owner@alnoor.ly$2').trimEnd();
  assert.equal(rules.trim(), src.trim(), 'قواعد الحزمة يجب أن تطابق firestore.rules مع بريد المالك');
  assert.deepEqual(errors, []); await ctx.close();
});

test('الأرشيف: استيراد ملف يحوي معرّفاً مكرراً لا يفسد السجلات', async () => {
  const { page, ctx, errors } = await open();
  const clash = { app: 'meqat-console', version: 1, exportedAt: today(), clients: [{ id: 'c1', company: 'عميل آخر بنفس المعرّف', planId: 'company', kind: 'paid', start: today(), projectId: 'other-proj1', apiKey: 'AIzaSyOTHERKEY123', appId: '1:1:web:x' }] };
  let native = 0; page.on('dialog', d => { native++; d.dismiss(); });
  await page.setInputFiles('#impFile', { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(clash)) });
  await page.click('.mbg [data-r="1"]'); await page.waitForTimeout(500);
  assert.equal(native, 0, 'لا حوارات متصفح أصلية');
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('mc_clients')).map(c => c.id));
  assert.equal(new Set(ids).size, ids.length, 'معرّفات مكررة: ' + ids);
  assert.ok(ids.length === 4, 'يجب أن يُضاف العميل الجديد: ' + ids.length);
  assert.deepEqual(errors, []); await ctx.close();
});

test('الحذف: حوار التأكيد يلغي ويؤكد بلا حوارات أصلية', async () => {
  const { page, ctx, errors } = await open();
  let native = 0; page.on('dialog', d => { native++; d.dismiss(); });
  const count = () => page.evaluate(() => JSON.parse(localStorage.getItem('mc_clients')).length);
  await page.click('[data-cli][data-act="delCli"]'); await page.click('.mbg [data-r="0"]'); await page.waitForTimeout(150);
  assert.equal(await count(), 3, 'الإلغاء لا يحذف');
  await page.click('[data-cli][data-act="delCli"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  assert.equal(await count(), 3, 'Esc لا يحذف');
  await page.click('[data-cli][data-act="delCli"]'); await page.click('.mbg [data-r="1"]'); await page.waitForTimeout(300);
  assert.equal(await count(), 2, 'التأكيد يحذف');
  assert.equal(native, 0); assert.deepEqual(errors, []); await ctx.close();
});

/* ===== انحدار: إصلاحات مراجعة اللوحة ===== */
const FB = { apiKey: 'AIzaSyTESTKEY1234567', projectId: 'noemail-proj', appId: '1:123456789:web:abcdef' };
async function openWith(clients, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, locale: 'ar' }); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.addInitScript(([c, x]) => { localStorage.setItem('mc_clients', JSON.stringify(c)); for (const k in x) localStorage.setItem(k, JSON.stringify(x[k])); }, [clients, extra]);
  await page.goto(url + '/meqat-console.html'); await page.waitForSelector('#tabbar .tab'); await page.waitForTimeout(200);
  return { page, ctx, errors };
}
const toasts = page => page.$$eval('.toast', e => e.map(x => x.textContent));

test('الأمان: لا تُولَّد حزمة ولا قواعد دون بريد مالك (يمنع منح الموظفين super_admin)', async () => {
  const { page, ctx, errors } = await openWith([{ id: 'n1', company: 'بلا بريد', planId: 'company', kind: 'paid', start: today(), ...FB }], { mc_tpl: url + '/index.html' });
  await page.click('#tabbar .tab[data-t="generator"]'); await page.waitForSelector('#gClient');
  assert.ok(!(await page.$eval('#rBox', e => e.textContent)).includes("== ''"), 'المعاينة الافتراضية لا تحوي بريداً فارغاً');
  let dl = 0; page.on('download', () => dl++);
  await page.selectOption('#gClient', 'n1'); await page.click('#gRun'); await page.waitForTimeout(500);
  assert.equal(dl, 0, 'لا تنزيل'); assert.ok((await toasts(page)).some(t => /بريد المالك/.test(t)));
  await page.click('#rDl'); await page.waitForTimeout(300); assert.equal(dl, 0, 'لا تنزيل للقواعد');
  assert.deepEqual(errors, []); await ctx.close();
});

test('المولّد: اختيار عميل يحدّث معاينة القواعد، والتوليد دون اختيار يعطي الرسالة الصحيحة', async () => {
  const { page, ctx } = await openWith([{ id: 'o1', company: 'له بريد', ownerEmail: 'owner@x.ly', planId: 'company', kind: 'paid', start: today() }]);
  await page.click('#tabbar .tab[data-t="generator"]'); await page.waitForSelector('#gRun');
  await page.click('#gRun'); await page.waitForTimeout(200); assert.ok((await toasts(page)).some(t => /اختر العميل/.test(t)));
  await page.selectOption('#rClient', 'o1'); await page.waitForTimeout(150);
  assert.ok((await page.$eval('#rBox', e => e.textContent)).includes("== 'owner@x.ly'"));
  await ctx.close();
});

test('الأرشيف: تاريخ بداية فاسد لا يُفرغ تبويب العملاء', async () => {
  const { page, ctx, errors } = await openWith([{ id: 'ok1', company: 'سليم', planId: 'company', kind: 'paid', start: today() }, { id: 'bad1', company: 'فاسد', planId: 'company', kind: 'paid', start: '2026-13-45' }]);
  assert.ok((await page.$eval('#content', e => e.textContent)).includes('سليم'));
  assert.deepEqual(errors, []); await ctx.close();
});

test('الديمو: التعديل يحافظ على النوع، والتوليد من قائمة العملاء يعمل بإعدادات الديمو', async () => {
  const demo = { apiKey: 'AIzaSyDEMOKEY12345', projectId: 'meqat-demo-1', appId: '1:555666777:web:demo01', email: 'demo@meqat.app', pass: 'x', org: 'عرض' };
  const { page, ctx, errors } = await openWith([{ id: 'd1', company: 'نسخة عرض', planId: 'company', kind: 'demo', start: today() }], { mc_tpl: url + '/index.html', mc_demo: demo });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('[data-act="licGen"]')]);
  const names = Object.keys(unzip(readFileSync(await dl.path()))); assert.ok(names.includes('site/index.html') && names.includes('firestore.rules.txt'), 'محتوى الحزمة: ' + names);   // (متصفح بلا واجهة يعيد اسم «download» للأسماء العربية، فنفحص المحتوى)
  await page.click('#tabbar .tab[data-t="clients"]'); await page.click('[data-act="editCli"]'); await page.click('#mSave'); await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mc_clients'))[0].kind), 'demo');
  assert.deepEqual(errors, []); await ctx.close();
});

test('الوصول: Esc يغلق قائمة التسليم ونافذة التعديل، والتركيز يبقى على الخانة', async () => {
  const { page, ctx } = await openWith([{ id: 'c1', company: 'شركة النور', planId: 'company', kind: 'paid', start: today() }]);
  await page.click('[data-act="checkCli"]'); await page.focus('input[data-k="fbProject"]'); await page.keyboard.press('Space'); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'fbProject');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); assert.equal(await page.$('.mbox'), null);
  await page.click('[data-act="editCli"]'); await page.waitForSelector('#mSave'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.equal(await page.$('#mSave'), null); await ctx.close();
});

test('0.15: مفتاح App Check للعميل يصل إلى firebaseConfig في الحزمة المولَّدة (وبدونه لا يظهر)', async () => {
  const KEY = '6LcTESTKEYabcdefghijklmnopqrstuvwxyz1';
  for (const withKey of [true, false]) {
    const { page, ctx, errors } = await open();
    await page.evaluate(([k, on]) => { const l = JSON.parse(localStorage.getItem('mc_clients')); l.find(c => c.id === 'c1').appCheckKey = on ? k : ''; localStorage.setItem('mc_clients', JSON.stringify(l)); }, [KEY, withKey]);
    await page.click('#tabbar .tab[data-t="generator"]'); await page.waitForSelector('#gClient');
    await page.selectOption('#gClient', 'c1'); await page.fill('#tplUrl', url + '/index.html');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#gRun')]);
    await page.waitForSelector('#gOut .res-ok', { timeout: 15000 });
    const files = unzip(readFileSync(await dl.path())), idx = Object.keys(files).find(n => /site\/index\.html$/.test(n));
    const html = files[idx].toString('utf8');
    assert.equal(html.includes('"appCheckSiteKey": "' + KEY + '"'), withKey, withKey ? 'المفتاح غائب من الحزمة' : 'مفتاح ظهر بلا إعداد');
    assert.deepEqual(errors, []); await ctx.close();
  }
});
test('0.15: نموذج إضافة العميل يرفض مفتاح App Check بصيغة غير صالحة', async () => {
  const { page, ctx } = await open();
  await page.click('#tabbar .tab[data-t="clients"]'); await page.waitForSelector('#content details.fold summary'); await page.click('#content details.fold summary'); await page.waitForSelector('#cCompany', { state: 'visible' });
  await page.fill('#cCompany', 'شركة اختبار'); await page.fill('#cAppCheck', 'bad key <script>');
  await page.click('#cAdd');
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('mc_clients')).filter(c => c.company === 'شركة اختبار').length);
  assert.equal(n, 0, 'حُفظ عميل بمفتاح غير صالح');
  await ctx.close();
});

test('1أ: رابط خادم الحافة للعميل يصل إلى firebaseConfig (وبدونه لا يظهر)', async () => {
  const EDGE = 'https://meqat-edge.acme.workers.dev';
  for (const on of [true, false]) {
    const { page, ctx, errors } = await open();
    await page.evaluate(([e, on]) => { const l = JSON.parse(localStorage.getItem('mc_clients')); l.find(c => c.id === 'c1').edgeUrl = on ? e : ''; localStorage.setItem('mc_clients', JSON.stringify(l)); }, [EDGE, on]);
    await page.click('#tabbar .tab[data-t="generator"]'); await page.waitForSelector('#gClient');
    await page.selectOption('#gClient', 'c1'); await page.fill('#tplUrl', url + '/index.html');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#gRun')]);
    await page.waitForSelector('#gOut .res-ok', { timeout: 15000 });
    const files = unzip(readFileSync(await dl.path())), idx = Object.keys(files).find(n => /site\/index\.html$/.test(n));
    assert.equal(files[idx].toString('utf8').includes('"edgeUrl": "' + EDGE + '"'), on);
    assert.deepEqual(errors, []); await ctx.close();
  }
});

test('1أ: تبويب «خادم الحافة» يعرض 12 خطوة بروابط مباشرة وقيم العميل، ويعمل زر النسخ والانتقال', async () => {
  const { page, ctx, errors } = await open();
  await page.click('#tabbar .tab[data-t="edge"]'); await page.waitForSelector('#eClient');
  assert.equal(await page.$$eval('#eSteps .step-row', r => r.length), 12);
  const c = await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('mc_clients')).find(x => x.id === 'c1'); return { pid: l.projectId, dom: l.domain }; });
  await page.selectOption('#eClient', 'c1'); await page.waitForTimeout(200);
  const links = await page.$$eval('#eSteps .s-link a', a => a.map(x => x.href));
  assert.ok(links.includes(`https://console.firebase.google.com/project/${c.pid}/settings/serviceaccounts/adminsdk`), 'رابط مفتاح حساب الخدمة');
  assert.ok(links.includes(`https://console.firebase.google.com/project/${c.pid}/firestore/rules`), 'رابط القواعد');
  assert.ok(links.some(h => h.startsWith('https://dash.cloudflare.com/sign-up')), 'رابط Cloudflare');
  assert.ok(links.every(h => h.startsWith('https://')), 'كل الروابط https');
  const txt = await page.textContent('#eSteps');
  for (const s of ['npx wrangler login', 'npx wrangler secret put SA_PRIVATE_KEY', 'npx wrangler deploy', 'FIREBASE_PROJECT_ID = "' + c.pid + '"', 'ALLOWED_ORIGINS = "']) assert.ok(txt.includes(s), s);
  await page.click('#eSteps [data-copy] >> nth=0');
  await page.click('[data-goto="generator"]'); await page.waitForSelector('#gClient');
  assert.deepEqual(errors, []); await ctx.close();
});
