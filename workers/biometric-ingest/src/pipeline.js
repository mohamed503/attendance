/* مسار المعالجة المشترك لكل المحوّلات: أحداث خام ⟵ مطابقة الموظف ⟵ تحديد الحركة ⟵ كتابة سجل أو «معلّق». */
import { userKey, recordId, pendingId, mapId, MAX_FUTURE_MS } from './normalize.js';

const DAY = 86400000;
const cache = { dev: new Map(), emp: new Map() };         // ذاكرة مؤقتة داخل العزل (isolate) لتقليل القراءات
const fresh = (m, k, ttl) => { const v = m.get(k); return v && v.exp > Date.now() ? v : null; };
export const _cache = cache;

/* events: [{code, ms, type|null}]   device: وثيقة الجهاز   ⟵ ملخص {stored,duplicate,pending,rejected,results[]} */
export async function processEvents(store, device, deviceId, events, now = Date.now()) {
  const tz = Number(device.tzOffset ?? 0);
  const res = events.map(e => ({ ...e, key: userKey(e.code), status: '' }));
  // 1) مرفوض: وقت مستقبلي
  for (const r of res) if (r.ms > now + MAX_FUTURE_MS) r.status = 'rejected_future';
  const live = res.filter(r => !r.status);
  // 2) المطابقة: جدول ربط الجهاز أولاً، ثم bioId القديم إن كان فريداً غير ملتبس
  const maps = await store.getMaps([...new Set(live.map(r => mapId(deviceId, r.key)))]);
  const byEmp = new Map();
  const needLegacy = [];
  for (const r of live) {
    const m = maps.get(mapId(deviceId, r.key));
    if (m && m.status === 'disabled') { r.status = 'pending'; r.reason = 'mapping_disabled'; }
    else if (m && m.employeeId && (m.status ?? 'active') === 'active') { r.empId = m.employeeId; r.via = 'map'; }
    else if (!m) needLegacy.push(r);
    else { r.status = 'pending'; r.reason = 'mapping_pending'; }
  }
  if (needLegacy.length) {
    const codes = new Set(); for (const r of needLegacy) { codes.add(r.key); if (/^\d+$/.test(r.key)) { codes.add(r.code.trim()); } }
    const emps = await store.findByBioIds([...codes]);
    const idx = new Map();
    for (const e of emps) { if (e.active === false) continue; const k = userKey(e.bioId); (idx.get(k) || idx.set(k, []).get(k)).push(e); }
    for (const r of needLegacy) {
      const c = idx.get(r.key) || [];
      if (c.length === 1) { r.empId = c[0].id; r.empName = c[0].name; r.via = 'bioId'; }
      else { r.status = 'pending'; r.reason = c.length ? 'ambiguous_bioId' : 'unmatched'; }
    }
  }
  // 3) أسماء الموظفين (مجمّعة)
  const ids = [...new Set(res.filter(r => r.empId && !r.empName).map(r => r.empId))];
  const miss = ids.filter(i => !fresh(cache.emp, i));
  if (miss.length) { const got = await store.getEmployees(miss); for (const i of miss) cache.emp.set(i, { v: got.get(i) || null, exp: now + 600_000 }); }
  for (const r of res) if (r.empId && !r.empName) { const e = cache.emp.get(r.empId)?.v; if (!e || e.active === false) { r.status = 'pending'; r.reason = e ? 'employee_inactive' : 'employee_missing'; r.empId = null; } else r.empName = e.name || ''; }
  // 4) تحديد حضور/انصراف: من الجهاز إن كان يُوثَق (typeSource=device) وإلا بالتناوب داخل يوم الموظف
  const ok = res.filter(r => r.empId && !r.status);
  const trust = device.typeSource === 'device';
  const groups = new Map();
  for (const r of ok) { const g = r.empId + '|' + Math.floor((r.ms + tz * 60000) / DAY); (groups.get(g) || groups.set(g, []).get(g)).push(r); }
  const queryBudget = 20; let used = 0;
  for (const [g, arr] of groups) {
    arr.sort((a, b) => a.ms - b.ms);
    const need = arr.filter(r => !(trust && r.type));
    if (!need.length) { arr.forEach(r => { if (!r.type) r.type = 'in'; }); continue; }
    const dayN = Number(g.split('|')[1]), from = dayN * DAY - tz * 60000, to = from + DAY;
    let existing = [];
    if (used < queryBudget) { used++; existing = await store.dayTimes(arr[0].empId, from, to); }
    const all = [...new Set([...existing, ...arr.map(r => r.ms)])].sort((a, b) => a - b);
    for (const r of arr) if (!(trust && r.type)) r.type = all.indexOf(r.ms) % 2 === 0 ? 'in' : 'out';
  }
  // 5) الكتابة: سجل حضور بمعرّف حتمي (create-only ⟵ التكرار لا يكتب) + معلّقات للأحداث غير المطابقة
  const toWrite = [], seen = new Set();
  for (const r of ok.filter(r => !r.status)) {
    const id = recordId(r.ms), path = `employees/${r.empId}/records/${id}`;
    if (seen.has(path)) { r.status = 'duplicate'; continue; } seen.add(path);
    r.item = { path, data: { type: r.type, time: new Date(r.ms), lat: 0, lng: 0, accuracy: 0, distance: 0, locationId: 'biometric', locationName: 'جهاز البصمة', empName: r.empName, deviceId, src: device.protocol || 'push' } };
    toWrite.push(r);
  }
  if (toWrite.length) { const out = await store.createRecords(toWrite.map(r => r.item)); toWrite.forEach((r, i) => { r.status = out[i] === 'created' ? 'stored' : out[i] === 'exists' ? 'duplicate' : 'error'; }); }
  const pend = []; const pseen = new Set();
  for (const r of res.filter(r => r.status === 'pending' || r.status === 'rejected_future')) {
    const id = pendingId(deviceId, r.key, r.ms); if (pseen.has(id)) continue; pseen.add(id);
    pend.push({ path: `biometricPending/${id}`, data: { deviceId, externalUserId: r.code, userKey: r.key, time: new Date(r.ms), type: r.type || '', reason: r.reason || (r.status === 'rejected_future' ? 'future_time' : 'unmatched'), createdAt: new Date(now) } });
  }
  if (pend.length) await store.createPending(pend);
  const count = s => res.filter(r => r.status === s).length;
  return { received: res.length, stored: count('stored'), duplicate: count('duplicate'), pending: count('pending') + count('rejected_future'), error: count('error'),
    results: res.map(r => ({ userId: r.code, time: new Date(r.ms).toISOString(), status: r.status === 'rejected_future' ? 'pending' : r.status, ...(r.reason ? { reason: r.reason } : {}) })) };
}
