// تشغيل سريع للتطبيق الحالي: يطبع الأخطاء ويلتقط لقطات مرجعية. node tests/e2e/smoke-baseline.mjs [مجلد اللقطات]
import { chromium, startServer, openApp, sleep } from './harness.mjs';
const out = process.argv[2] || '/tmp';
const { srv, url } = await startServer(); const b = await chromium.launch();
for (const [name, vp, theme] of [['desk-light', { width: 1280, height: 800 }, 'light'], ['mob-dark', { width: 390, height: 800 }, 'dark']]) {
  const { page, errors } = await openApp(b, url, { viewport: vp, theme });
  await page.waitForSelector('#content', { timeout: 8000 }).catch(() => {}); await sleep(600);
  await page.screenshot({ path: `${out}/base-${name}-today.png` });
  for (const tab of ['emps', 'reqs', 'recs']) { await page.click(`[data-tab="${tab}"]`).catch(e => errors.push('tab ' + tab + ' ' + e.message.slice(0, 60))); await sleep(500); await page.screenshot({ path: `${out}/base-${name}-${tab}.png` }); }
  console.log(name, 'errors:', errors);
}
await b.close(); srv.close();
