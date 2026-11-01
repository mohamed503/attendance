// تبويب «أجهزة البصمة»: يفتح، ويفتح محرر الجهاز بحسب البروتوكول، بلا أخطاء وبلا تمرير أفقي.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, startServer, openApp, sleep } from './harness.mjs';

let srv, url, browser;
before(async () => { ({ srv, url } = await startServer()); browser = await chromium.launch(); });
after(async () => { await browser.close(); srv.close(); });

for (const [vp, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 800 }]]) {
  test(`أجهزة البصمة (${vp}): التبويب والمحرر`, async () => {
    const { page, ctx, errors } = await openApp(browser, url, { viewport });
    await page.waitForSelector('[data-tab="bio"]', { timeout: 10000 });
    await page.click('[data-tab="bio"]'); await sleep(500);
    const txt = await page.$eval('#content', e => e.textContent);
    assert.ok(txt.includes('أجهزة البصمة') && txt.includes('حركات معلّقة'), 'محتوى التبويب');
    await page.click('[data-bact="addDev"]'); await sleep(300);
    assert.ok(await page.$('.ov select[data-k="protocol"]'), 'محرر الجهاز');
    assert.ok(await page.$('.ov input[data-k="sn"]'), 'حقل SN لبروتوكول ADMS');
    await page.selectOption('.ov select[data-k="protocol"]', 'generic'); await sleep(300);
    assert.ok(await page.$('.ov textarea[data-k="mappingTxt"]'), 'حقل تعيين الحقول للبروتوكول العام');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 1, 'تمرير أفقي ' + over);
    assert.deepEqual(errors, [], errors.join(' | ')); await ctx.close();
  });
}
