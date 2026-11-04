// اختبارات متصفح للمرحلة 0 (واجهة): U1 وS8 وغيرها. تشغيل: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, startServer, openApp, sleep, buildSeed } from './harness.mjs';

let srv, url, browser;
before(async () => { ({ srv, url } = await startServer()); browser = await chromium.launch(); });
after(async () => { await browser.close(); srv.close(); });
const adminReady = async page => { await page.waitForSelector('[data-tab]', { timeout: 10000 }); await page.waitForSelector('#content', { timeout: 10000 }); await sleep(500); };

/* يحاكي التطبيق المثبّت (display-mode: standalone) ووجود Notification */
const STANDALONE = () => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null } : orig(q);
  if (!('Notification' in window)) window.Notification = { permission: 'default', requestPermission: async () => 'denied' };
};

test('U1: زر إشعارات الإدارة ظاهر حتى بلا حدث تثبيت (لا يتبع أزرار التثبيت)', async () => {
  const { page, ctx, errors } = await openApp(browser, url); await adminReady(page);
  const vis = await page.evaluate(() => {
    const d = el => el && getComputedStyle(el).display !== 'none';
    return { notif: d(document.getElementById('admNotifBtn')), install: [...document.querySelectorAll('.pwa-btn')].some(d) };
  });
  assert.equal(vis.notif, true, 'زر الإشعارات مخفي');
  assert.equal(vis.install, false, 'زر التثبيت يظهر فقط عند توفر التثبيت');
  assert.deepEqual(errors, [], errors.join(' | ')); await ctx.close();
});
test('U1: في تطبيق الموظف المثبّت يظهر زر الإشعارات', async () => {
  const seed = buildSeed(); seed.user = { uid: 'u-e5', isAnonymous: true, emailVerified: false };
  const { page, ctx } = await openApp(browser, url, { seed, search: '?e=e5', initScript: STANDALONE });
  await page.waitForSelector('#empNotifBtn', { timeout: 10000 }); await sleep(400);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('empNotifBtn')).display !== 'none'), true);
  await ctx.close();
});

/* ---------- T1: أداة البذر تعمل فعلياً وقابلة للتكرار ---------- */
test('T1: بذر كامل مرتين لا يضاعف المستندات، ولا يكتب فوق settings/general الموجودة', async () => {
  const seed = { docs: { 'settings/general': { orgName: 'اسم قائم لا يُمس', tzOffset: 120 } }, user: null };
  const { page, ctx, errors } = await openApp(browser, url, { seed, user: false });
  await page.goto(url + '/meqat-seed.html'); await sleep(500);
  page.on('dialog', d => d.accept());
  const run = async () => {
    await page.fill('#cfg', 'const firebaseConfig = {\n apiKey: "AIzaTEST",\n projectId: "demo-seed",\n appId: "1:123:web:abc"\n};');
    await page.fill('#email', 'asmaa@alnoor.ly'); await page.fill('#pass', 'Passw0rd!');
    await page.click('#bInit'); await page.waitForFunction(() => !document.querySelector('#bAll').disabled, null, { timeout: 15000 });
    await page.click('#bAll'); await page.waitForFunction(() => /اكتمل البذر الكامل|توقّف/.test(document.querySelector('#log').textContent), null, { timeout: 60000 });
    return page.evaluate(() => ({ n: window.__MQ.docs.size, log: document.querySelector('#log').textContent }));
  };
  const a = await run();
  assert.doesNotMatch(a.log, /توقّف|خطأ|فشل/, a.log.slice(-400));
  const org = await page.evaluate(() => window.__MQ.docs.get('settings/general').orgName);
  assert.equal(org, 'اسم قائم لا يُمس');
  const b = await run();
  assert.doesNotMatch(b.log, /توقّف|فشل الاتصال/, b.log.slice(-400));
  assert.ok(a.n > 100, 'عدد المستندات بعد الأولى: ' + a.n);
  assert.equal(b.n, a.n, `تضاعف البذر: ${a.n} ← ${b.n}`);
  assert.deepEqual(errors.filter(e => !/meqat-seed/.test(e)), []);
  await ctx.close();
});

/* ---------- 0.16: لا تسمية مضلّلة «كاملة» للنسخة الاحتياطية ---------- */
test('0.16: شاشة النسخ الاحتياطي لا تدّعي أنها «كاملة» وتذكر ما لا تشمله', async () => {
  const { page, ctx } = await openApp(browser, url); await adminReady(page);
  await page.click('[data-tab="sched"]'); await sleep(400);
  await page.click('[data-ssub="settings"]'); await sleep(500);
  const txt = await page.evaluate(() => { const b = document.querySelector('[data-act="backupDB"]'); return b ? b.closest('.card').textContent : ''; });
  assert.ok(txt, 'لم تُوجد بطاقة النسخ الاحتياطي');
  assert.doesNotMatch(txt, /نسخة احتياطية كاملة/); assert.match(txt, /لا تشمل/); assert.match(txt, /سجلات الحضور/);
  await ctx.close();
});

/* ---------- S8: لا ماليات في localStorage ---------- */
test('S8: ماليات الموظف (IBAN) لا تُخزَّن في localStorage وتُمسح النسخ القديمة', async () => {
  const seed = buildSeed(); seed.user = { uid: 'u-e5', isAnonymous: true, emailVerified: false };
  Object.assign(seed.docs['employees/e5'], { finIsolated: true });
  seed.docs['empFinance/e5'] = { payMode: 'monthly', payAmount: 2000, iban: 'LY83002048000020100120361', nationalId: '119900112233' };
  const { page, ctx } = await openApp(browser, url, { seed, search: '?e=e5', initScript: () => { try { localStorage.setItem('att_emp_fin_e5', JSON.stringify({ at: Date.now(), d: { iban: 'LEGACY-IBAN-XYZ' } })); } catch {} } });
  await page.waitForSelector('#empNotifBtn', { timeout: 10000 }); await sleep(800);
  const dump = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  assert.doesNotMatch(dump, /LY83002048000020100120361|119900112233|LEGACY-IBAN-XYZ|att_emp_fin_/, 'مالية أو مفتاح قديم بقي في localStorage');
  await ctx.close();
});

/* ---------- S2: بريد المالك يتطلب توثيقاً؛ ترحيل المالك إلى مستند uid وشاشة تأكيد البريد ---------- */
test('S2: المالك الذي يدخل بقواعد تعترف به يُثبَّت تلقائياً في admins/{uid} (ليبقى بعد تشديد القاعدة)', async () => {
  const seed = buildSeed(); delete seed.docs['admins/adm1'];
  seed.docs['admins/owner'] = { name: 'المالك', email: 'owner@alnoor.ly' };
  seed.user = { uid: 'own1', email: 'owner@alnoor.ly', emailVerified: false, isAnonymous: false };
  const { page, ctx, errors } = await openApp(browser, url, { seed }); await adminReady(page);
  const d = await page.evaluate(() => window.__MQ.docs.get('admins/own1') || null);
  assert.ok(d, 'لم يُنشأ admins/own1'); assert.equal(d.role, 'super_admin'); assert.equal(d.email, 'owner@alnoor.ly');
  assert.deepEqual(errors, [], errors.join(' | ')); await ctx.close();
});
test('S2: مشروع جديد ببريد مالك غير موثّق ⇒ شاشة تأكيد البريد، ثم الدخول بعد التوثيق', async () => {
  const seed = buildSeed(); delete seed.docs['admins/adm1'];
  seed.user = { uid: 'own2', email: 'owner@alnoor.ly', emailVerified: false, isAnonymous: false };
  const { page, ctx } = await openApp(browser, url, { seed, denyPaths: ['admins/owner'] });
  await page.waitForSelector('#vgSend', { timeout: 10000 });
  assert.equal(await page.$('[data-tab]'), null, 'لوحة الإدارة ظهرت لبريد غير موثّق');
  await page.click('#vgSend'); await sleep(300);
  assert.equal(await page.evaluate(() => window.__MQ.verifyMails), 1, 'لم يُرسَل رابط التأكيد');
  // «تحقّقت» قبل التوثيق الفعلي ⇒ تبقى الشاشة
  await page.click('#vgDone'); await sleep(400);
  assert.ok(await page.$('#vgSend'), 'يجب أن تبقى شاشة التأكيد قبل توثيق البريد');
  // توثيق البريد ثم السماح بقراءة admins/owner (كما تفعل القواعد لبريد موثّق)
  await page.evaluate(() => { window.__MQ.user.emailVerified = true; window.__MOCK_DENY = []; });
  await page.click('#vgDone'); await page.waitForSelector('[data-tab]', { timeout: 10000 });
  await ctx.close();
});
test('S2: مدير عادي (له مستند uid) لا يرى شاشة التأكيد حتى لو بريده غير موثّق', async () => {
  const seed = buildSeed(); seed.user = { uid: 'adm1', email: 'asmaa@alnoor.ly', emailVerified: false, isAnonymous: false };
  const { page, ctx } = await openApp(browser, url, { seed }); await adminReady(page);
  assert.equal(await page.$('#vgSend'), null); await ctx.close();
});

/* ---------- S3 (0.4): رمز تفعيل لأول ربط جهاز ---------- */
const unboundSeed = (bindPin) => {
  const seed = buildSeed(); seed.user = { uid: 'u-e9', isAnonymous: true, emailVerified: false };
  seed.docs['employees/e9'] = { name: 'موظف جديد', phone: '218911111111', active: true, deviceId: null, empType: 'staff', scheduleId: '', rotOffset: 0, startDate: '2026-01-01' };
  seed.docs['settings/general'] = { ...seed.docs['settings/general'], ...(bindPin ? { bindPin: true } : {}) };
  seed.docs['pins/e9'] = { pin: 'ABCD2345', exp: { seconds: Math.floor(Date.now() / 1000) + 86400 * 2, nanoseconds: 0 } };
  return seed;
};
test('S3: بلا bindPin يُربط أول جهاز بالرابط فقط (السلوك الحالي)', async () => {
  const { page, ctx } = await openApp(browser, url, { seed: unboundSeed(false), search: '?e=e9' });
  await page.waitForFunction(() => { const d = window.__MQ && window.__MQ.docs.get('employees/e9'); return d && d.devices; }, null, { timeout: 10000 });
  assert.equal(await page.$('#pinIn'), null, 'لا يجب طلب رمز');
  await ctx.close();
});
test('S3: مع bindPin تظهر شاشة الرمز ولا يُربط الجهاز قبل إدخاله، وبعده يُربط ويُختم الرمز', async () => {
  const { page, ctx, errors } = await openApp(browser, url, { seed: unboundSeed(true), search: '?e=e9' });
  await page.waitForSelector('#pinIn', { timeout: 10000 });
  assert.match(await page.textContent('.emp-wrap'), /رمز التفعيل/);
  assert.equal(await page.evaluate(() => !!(window.__MQ.docs.get('employees/e9') || {}).devices), false, 'رُبط الجهاز قبل الرمز');
  await page.fill('#pinIn', 'abcd-2345'); await page.click('#pinGo');
  await page.waitForFunction(() => { const d = window.__MQ.docs.get('employees/e9'); return d && d.devices; }, null, { timeout: 10000 });
  const r = await page.evaluate(() => ({ join: !!window.__MQ.docs.get('employees/e9/joins/u-e9'), used: (window.__MQ.docs.get('pins/e9') || {}).usedBy }));
  assert.equal(r.join, true); assert.equal(r.used, 'u-e9');
  assert.deepEqual(errors.filter(e => !/permission|Missing/i.test(e)), []); await ctx.close();
});
test('S3: المدير العام يفعّل «ربط أول جهاز برمز» من الإعدادات فيُحفظ bindPin', async () => {
  const { page, ctx } = await openApp(browser, url); await adminReady(page);
  await page.click('[data-tab="sched"]'); await sleep(400); await page.click('[data-ssub="settings"]'); await sleep(500);
  await page.selectOption('#sBindPin', '1'); await page.click('[data-act="saveSet"]'); await sleep(700);
  assert.equal(await page.evaluate(() => window.__MQ.docs.get('settings/general').bindPin), true);
  await ctx.close();
});

/* ---------- 1أ: التحقق من البصمة عبر خادم الحافة (meqat-edge) ---------- */
const EDGE = 'https://edge.test';
const withEdge = html => html.replace('const firebaseConfig = {', `const firebaseConfig = { edgeUrl: "${EDGE}",`);
const FAKE_WA = () => { navigator.credentials.get = async () => ({ response: { clientDataJSON: new Uint8Array([1, 2]).buffer, authenticatorData: new Uint8Array([3, 4]).buffer, signature: new Uint8Array([5, 6]).buffer } }); };
const bioSeed = (edgeRequired) => {
  const seed = buildSeed(); seed.user = { uid: 'u-e5', isAnonymous: true, emailVerified: false };
  Object.assign(seed.docs['locations/loc1'], { methods: ['gps', 'bio'], mode: 'all' });
  Object.assign(seed.docs['employees/e5'], { bio: { cid: 'Y2lk', pk: 'cGs' } });
  seed.docs['settings/general'] = { ...seed.docs['settings/general'], ...(edgeRequired ? { edgeRequired: true } : {}) };
  seed.docs['punchTickets/u-e5'] = { nonce: 'T123', empId: 'e5', locId: 'loc1', type: 'in', m: ['bio'] };
  return seed;
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
async function edgeStub(page, mode, seen) {
  await page.route(EDGE + '/**', async r => {
    const q = r.request();
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (mode === 'down') return r.abort();
    seen.push({ url: q.url(), auth: q.headers()['authorization'], body: q.postDataJSON() });
    if (q.url().endsWith('/challenge')) return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ challenge: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', exp: Date.now() + 60000 }) });
    return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ ticket: 'T123', exp: Date.now() + 60000 }) });
  });
}
const punch = async page => { await page.waitForSelector('#bIn', { timeout: 10000 }); await sleep(800); await page.click('#bIn'); await sleep(1800); };
const recsOf = page => page.evaluate(() => [...window.__MQ.docs.entries()].filter(([p]) => p.startsWith('employees/e5/records/')).map(([, d]) => d));

test('P1أ: البصمة تمر عبر الخادم: تحدٍّ ثم تذكرة، والسجل يحمل ticket بلا wa، وتُحذف التذكرة في الدفعة نفسها', async () => {
  const seen = []; const { page, ctx } = await openApp(browser, url, { seed: bioSeed(true), search: '?e=e5', viewport: { width: 390, height: 800 }, initScript: FAKE_WA, htmlPatch: withEdge });
  await edgeStub(page, 'ok', seen); await punch(page);
  const recs = await recsOf(page);
  assert.equal(recs.length, 1, 'لم يُكتب سجل'); assert.equal(recs[0].ticket, 'T123'); assert.equal('wa' in recs[0], false); assert.match(recs[0].m, /bio/);
  assert.equal(await page.evaluate(() => window.__MQ.docs.has('punchTickets/u-e5')), false, 'التذكرة لم تُستهلك');
  assert.deepEqual(seen.map(s => s.url.replace(EDGE, '')), ['/v1/punch/challenge', '/v1/punch/ticket']);
  assert.equal(seen[0].auth, 'Bearer mock-id-token'); assert.deepEqual(seen[0].body, { empId: 'e5', locId: 'loc1', type: 'in' });
  assert.equal(seen[1].body.challenge.length > 20, true); assert.ok(seen[1].body.assertion.signature);
  await ctx.close();
});
test('P1أ: edgeRequired والخادم متعطل ⇒ لا سجل ورسالة واضحة', async () => {
  const { page, ctx } = await openApp(browser, url, { seed: bioSeed(true), search: '?e=e5', viewport: { width: 390, height: 800 }, initScript: FAKE_WA, htmlPatch: withEdge });
  await edgeStub(page, 'down', []); await punch(page);
  assert.equal((await recsOf(page)).length, 0); assert.match(await page.textContent('body'), /خادم التحقق من البصمة غير متاح/);
  await ctx.close();
});
test('P1أ: edgeRequired بلا edgeUrl مُعدّ ⇒ لا سجل ورسالة «غير مُعدّ»', async () => {
  const { page, ctx } = await openApp(browser, url, { seed: bioSeed(true), search: '?e=e5', viewport: { width: 390, height: 800 }, initScript: FAKE_WA });
  await punch(page);
  assert.equal((await recsOf(page)).length, 0); assert.match(await page.textContent('body'), /غير مُعدّ/);
  await ctx.close();
});
test('P1أ: الخادم متعطل وedgeRequired مُعطّل ⇒ يعود للتحقق داخل التطبيق (لا تذكرة)', async () => {
  const { page, ctx } = await openApp(browser, url, { seed: bioSeed(false), search: '?e=e5', viewport: { width: 390, height: 800 }, initScript: FAKE_WA, htmlPatch: withEdge });
  await edgeStub(page, 'down', []); await punch(page);
  assert.equal((await recsOf(page)).length, 0); // التوقيع الوهمي يفشل في التحقق المحلي = دليل أن المسار القديم هو الذي عمل
  assert.match(await page.textContent('body'), /فشل التحقق من بصمة الجهاز/); await ctx.close();
});
test('P1أ: المدير العام يفعّل edgeRequired من الإعدادات', async () => {
  const { page, ctx } = await openApp(browser, url); await adminReady(page);
  await page.click('[data-tab="sched"]'); await sleep(400); await page.click('[data-ssub="settings"]'); await sleep(500);
  await page.selectOption('#sEdge', '1'); await page.click('[data-act="saveSet"]'); await sleep(700);
  assert.equal(await page.evaluate(() => window.__MQ.docs.get('settings/general').edgeRequired), true); await ctx.close();
});
