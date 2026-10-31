// معرض لقطات لكل شاشات التطبيق (إدارة/موظف/دخول/نوافذ) بالوضعين والحجمين، للمراجعة البصرية. node tests/e2e/gallery.mjs <مجلد>
import { mkdirSync } from 'node:fs';
import { chromium, startServer, openApp, sleep, buildSeed } from './harness.mjs';
const out = process.argv[2] || '/tmp/gallery'; mkdirSync(out, { recursive: true });
const only = process.argv[3] || '';
const { srv, url } = await startServer(); const b = await chromium.launch();
const VPS = { desk: { width: 1280, height: 800 }, mob: { width: 390, height: 800 } };
const empSeed = id => { const s = buildSeed(); s.user = { uid: 'u-' + id, isAnonymous: true, emailVerified: false }; return s; };
const shot = (page, name, full = true) => page.screenshot({ path: `${out}/${name}.png`, fullPage: full, mask: [page.locator('.clock'), page.locator('#clk')], maskColor: '#888' });
const report = [];
for (const [vn, vp] of Object.entries(VPS)) for (const theme of ['light', 'dark']) {
  const tag = `${vn}-${theme}`;
  const run = async (name, fn, o = {}) => {
    if (only && !name.includes(only)) return;
    const { page, ctx, errors } = await openApp(b, url, { viewport: vp, theme, ...o });
    try { await fn(page); } catch (e) { errors.push('SCENARIO: ' + e.message.split('\n')[0]); }
    await sleep(250); await shot(page, `${name}-${tag}`); await ctx.close(); if (errors.length) report.push(`${name}-${tag}: ${errors.join(' | ')}`);
  };
  const admin = async (page) => { await page.waitForSelector('[data-tab]', { timeout: 10000 }); await sleep(700); };
  const tab = (t, sub) => async page => { await admin(page); await page.click(`[data-tab="${t}"]`); await sleep(450); if (sub) { await page.click(sub); await sleep(450); } };
  await run('a-today', admin);
  await run('a-emps', tab('emps')); await run('a-emps-admins', tab('emps', '[data-esub="admins"]')); await run('a-emps-audit', tab('emps', '[data-esub="audit"]'));
  await run('a-sched', tab('sched')); await run('a-sched-leaves', tab('sched', '[data-ssub="leaves"]')); await run('a-sched-settings', tab('sched', '[data-ssub="settings"]'));
  await run('a-locs', tab('locs')); await run('a-reqs', tab('reqs')); await run('a-tasks', tab('tasks'));
  await run('a-recs', tab('recs')); await run('a-recs-payroll', tab('recs', '[data-rsub="payroll"]')); await run('a-recs-raw', tab('recs', '[data-rsub="raw"]'));
  await run('a-modal-emp', async page => { await tab('emps')(page); const e = await page.$('[data-act="editEmp"]'); await e.click().catch(async () => { await page.click('details.act-menu summary'); await page.click('[data-act="editEmp"]'); }); await page.waitForSelector('.ov .modal'); await sleep(400); }, {});
  await run('a-dialog-confirm', async page => { await tab('reqs')(page); await page.click('[data-act="rej"][data-id="r2"]'); await page.waitForSelector('.mq-dlg'); await sleep(200); });
  await run('login', async page => { await page.waitForSelector('#em'); }, { user: false });
  await run('e-present', async page => { await page.waitForSelector('#bOut'); await sleep(1200); }, { search: '?e=e1', seed: empSeed('e1') });
  await run('e-absent', async page => { await page.waitForSelector('#bIn'); await sleep(1200); }, { search: '?e=e5', seed: empSeed('e5') });
  await run('e-leaveform', async page => { await page.waitForSelector('#rqLeave'); await page.click('#rqLeave'); await sleep(500); }, { search: '?e=e1', seed: empSeed('e1') });
}
console.log(report.length ? 'ERRORS:\n' + report.join('\n') : 'no errors'); await b.close(); srv.close();
