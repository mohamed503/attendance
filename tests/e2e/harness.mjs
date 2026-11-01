// أدوات اختبار المتصفح: خادم ثابت + Firebase وهمي + بيانات تجريبية + التقاط الأخطاء. يتطلب حزمة playwright (أو NODE_PATH يشير إليها).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
const MOCK_JS = readFileSync(join(here, 'mock-firebase.js'), 'utf8');
/* «الآن» الثابت للاختبارات: الأربعاء 2026-10-28 الساعة 14:20 بتوقيت طرابلس (12:20 UTC) */
export const NOW = Date.UTC(2026, 9, 28, 12, 20);
const FILES = { '/index.html': 'text/html; charset=utf-8', '/sw.js': 'text/javascript', '/manifest.json': 'application/json', '/icon.svg': 'image/svg+xml' };

export function startServer(dir = root) {
  const t0 = Date.now();
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = new URL(req.url, 'http://x').pathname; if (p === '/') p = '/index.html';
      if (!FILES[p]) { rsp.writeHead(404); return rsp.end('no'); }
      // ترويسة Date تتبع «الآن» الثابت للاختبارات (التطبيق يزامن ساعته معها في syncTime)
      rsp.writeHead(200, { 'Content-Type': FILES[p], 'Cache-Control': 'no-store', 'Date': new Date(NOW + (Date.now() - t0)).toUTCString() }); rsp.end(readFileSync(join(dir, p)));
    }).listen(0, '127.0.0.1', () => res({ srv, url: 'http://127.0.0.1:' + srv.address().port }));
  });
}

/* ---------- بيانات تجريبية نسبةً إلى «الآن» (توقيت طرابلس UTC+2) ---------- */
const TZ = 120;
export const dayKeyOf = (ms = Date.now()) => new Date(ms + TZ * 60000).toISOString().slice(0, 10);
export const atToday = (h, ms = Date.now()) => Date.parse(dayKeyOf(ms) + 'T00:00:00Z') - TZ * 60000 + h * 3600000;
const T = ms => ({ $ts: ms });

export function buildSeed({ now = NOW } = {}) {
  const docs = {}; const days = {}; for (let i = 0; i < 7; i++) days[i] = { on: true, p: [{ s: '08:00', e: '16:00' }], h: 8 }; // كل الأيام عمل ليكون الاختبار مستقراً أياً كان يوم التشغيل
  docs['admins/adm1'] = { name: 'أسماء الورفلي', email: 'asmaa@alnoor.ly', role: 'super_admin' };
  docs['settings/general'] = { orgName: 'شركة النور للتجارة', tzOffset: TZ, cfgVersion: 1, empNotice: '' };
  docs['locations/loc1'] = { name: 'المقر الرئيسي', lat: 32.8872, lng: 13.1913, radius: 150, kx: 93500, ky: 111000, active: true };
  docs['schedules/sc1'] = { name: 'دوام إداري', mode: 'fixed', days, shifts: [], cycle: [], anchor: dayKeyOf(now), breakMin: 30, graceLate: 10, graceEarly: 10, graceMode: 'forgive' };
  const people = [['e1', 'عبدالله الفيتوري', 'المالية', 'محاسب', 8.03, null], ['e2', 'ريما الككلي', 'الإدارة', 'مسؤولة موارد بشرية', 7.93, null], ['e3', 'طارق الشريف', 'الصيانة', 'فني صيانة', 9.18, null],
    ['e4', 'هالة بن سعود', 'المالية', 'أمينة صندوق', 7.8, 12.5], ['e5', 'إبراهيم الجالي', 'المبيعات', 'مندوب مبيعات', null, null], ['e6', 'سالم المبروك', 'المخازن', 'مشرف مخزن', 6.97, null]];
  for (const [id, name, dept, jobTitle, inH, outH] of people) {
    docs['employees/' + id] = { name, dept, jobTitle, phone: '218910000000', active: true, empType: 'staff', scheduleId: 'sc1', locs: [], uid: 'u-' + id, devices: { ['dev-' + id]: 'u-' + id }, deviceId: 'dev-' + id, maxDevices: 2, startDate: '2025-01-01', leaveQuota: 21,
      payMode: 'monthly', payAmount: 2400, allowance: 300, state: outH ? 'out' : (inH ? 'in' : null), createdAt: T(now - 90 * 86400000) };
    const rec = (rid, type, h) => { docs[`employees/${id}/records/${rid}`] = { type, time: T(atToday(h, now)), lat: 32.8872, lng: 13.1913, accuracy: 12, distance: 20, locationId: 'loc1', locationName: 'المقر الرئيسي', empName: name, deviceId: 'dev-' + id }; };
    if (inH != null && atToday(inH, now) < now) rec('in1', 'in', inH);
    if (outH != null && atToday(outH, now) < now) rec('out1', 'out', outH);
  }
  docs['employees/e1/requests/r1'] = { kind: 'leave', type: 'annual', typeName: 'إجازة سنوية', from: dayKeyOf(now + 20 * 86400000), to: dayKeyOf(now + 22 * 86400000), status: 'pending', empName: 'عبدالله الفيتوري', note: '', createdAt: T(now - 3600000) };
  docs['employees/e3/requests/r2'] = { kind: 'fix', from: dayKeyOf(now - 86400000), to: dayKeyOf(now - 86400000), fixIn: '', fixOut: '16:00', status: 'pending', empName: 'طارق الشريف', note: 'نسيت الانصراف', createdAt: T(now - 7200000) };
  return { docs, user: { uid: 'adm1', email: 'asmaa@alnoor.ly', emailVerified: true, isAnonymous: false } };
}

/* يفتح التطبيق. opts: {url, search, seed, user(false=بلا مستخدم), viewport, colorScheme, theme} */
export async function openApp(browser, base, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, colorScheme: opts.colorScheme || 'light', locale: 'ar', serviceWorkers: 'block', permissions: ['geolocation'], geolocation: { latitude: 32.8872, longitude: 13.1913, accuracy: 15 } });
  const page = await ctx.newPage(); const errors = [];
  await page.clock.install({ time: opts.now || NOW }); await page.clock.resume();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/gstatic\.com\/firebasejs\/.*\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: MOCK_JS }));
  await page.route(/fonts\.(googleapis|gstatic)\.com|unpkg|jsdelivr|cdnjs|sheetjs/, r => r.abort());
  const seed = opts.seed || buildSeed(); if (opts.user === false) seed.user = null;
  await page.addInitScript(([s, theme]) => {
    window.__MOCK_SEED = s; window.__MOCK_ACCOUNTS = { 'asmaa@alnoor.ly': { pw: 'Passw0rd!', uid: 'adm1' } };
    try { localStorage.setItem('att_rules_v5', '1'); if (theme) localStorage.setItem('meqat_theme', theme); } catch {}
  }, [JSON.stringify(seed), opts.theme || null]);
  await page.goto(base + '/index.html' + (opts.search || ''));
  return { page, ctx, errors };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
