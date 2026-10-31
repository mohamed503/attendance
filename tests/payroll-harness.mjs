// يبني بيئة اختبار من الشيفرة الفعلية في index.html: محرك الجداول + computeSummary + payrollRows (بلا Firebase ولا DOM).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const line = p => { const i = html.indexOf(p); assert.ok(i >= 0, p); return html.slice(i, html.indexOf('\n', i)); };
const iEng = html.indexOf('const addDays = '), cd = html.indexOf('function calcDay');
const engine = html.slice(iEng, html.indexOf('\n}\n', cd) + 3);
const admin = html.slice(html.indexOf('  function notStarted(sc, key, rot) {'), html.indexOf('  function viewRecs(el) {'));
const prelude = ['const FORGOT_MS = 14 * 3600e3; const TZ_OFFSET_MIN = 120;', line('const pad = n'), line('let TZOFF'), line('const L = d'), line('const dayKey = d'), line('const dayStart = key')].join('\n');

// «الآن» الثابت: بعد نهاية فترة الاختبار فلا تتأثر الحالات بوقت التشغيل
export const NOW = Date.UTC(2026, 10, 5, 10, 0);
class FakeDate extends Date {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
}

export function makeEnv(over = {}) {
  const body = `${prelude}\n${engine}\nconst S = { recs: [], emps: [], scheds: [], holKeys: [], leaves: [], reqs: [], set: {}, from: '2026-10-01', to: '2026-10-31', emp: '' };\n${admin}\nreturn { S, payrollRows, computeSummary };`;
  const env = new Function('Date', body)(FakeDate);
  Object.assign(env.S, over);
  return env;
}

/* أدوات بناء بيانات الاختبار (توقيت UTC+2) */
export const at = (key, h) => new Date(Date.parse(key + 'T00:00:00Z') + (h * 60 - 120) * 60000);
export const punch = (empId, key, inH, outH, extra = {}) => [
  { empId, empName: empId, type: 'in', t: at(key, inH), ...extra },
  ...(outH == null ? [] : [{ empId, empName: empId, type: 'out', t: at(key, outH), ...extra }])
];
export const fixedSched = (s = '08:00', e = '16:00', on = [0, 1, 2, 3, 4], extra = {}) => ({
  id: 'sc1', name: 's', mode: 'fixed', breakMin: 0, graceLate: 10, graceEarly: 10, graceMode: 'forgive',
  days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, { on: on.includes(i), p: [{ s, e }], h: 8 }])), ot: {}, ...extra
});
// أيام الشهر (أكتوبر 2026: 31 يومًا، 21 يوم عمل أحد–خميس، 10 أيام راحة)
export const dayKeys = (from = '2026-10-01', to = '2026-10-31') => { const out = []; for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
export const workDays = (days = [0, 1, 2, 3, 4], from, to) => dayKeys(from, to).filter(k => days.includes(new Date(k + 'T00:00:00Z').getUTCDay()));
export const row = (env, id) => env.payrollRows().find(r => r.empId === id);
