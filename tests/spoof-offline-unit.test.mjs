// اختبارات الخطوة 3: محرك كشف الموقع الوهمي (Anti-GPS Spoofing) وتوثيق بصمات الأوفلاين بالـ GPS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const raw = html.slice(html.indexOf('/*SPOOF-START*/'), html.indexOf('/*SPOOF-END*/'));
const S = new Function(raw + '\nreturn { haversineM, analyzeGpsSpoof, detectRecAnomalies, packOfflineNote, parseOfflineNote };')();

test('الخطوة 3 — analyzeGpsSpoof: يقبل إحداثيات GPS طبيعية', () => {
  const res = S.analyzeGpsSpoof(
    { latitude: 32.887214, longitude: 13.191328, accuracy: 14.5, altitude: 22.1, altitudeAccuracy: 8 },
    { lat: 32.887195, lng: 13.191301, acc: 16.2, ms: 1000 },
    1000 + 300000
  );
  assert.equal(res.blocked, false);
  assert.equal(res.suspicious, false);
});

test('الخطوة 3 — analyzeGpsSpoof: يحظر ثبات الإحداثيات المطلق (تطبيق تثبيت الموقع الوهمي)', () => {
  const res = S.analyzeGpsSpoof(
    { latitude: 32.8872145, longitude: 13.1913281, accuracy: 12 },
    { lat: 32.8872145, lng: 13.1913281, acc: 12, ms: 1000 },
    1000 + 180000
  );
  assert.equal(res.blocked, true);
  assert.ok(res.reasons.some(r => r.includes('ثبات')));
});

test('الخطوة 3 — analyzeGpsSpoof: يحظر الانتقال المستحيل جغرافياً (Teleportation > 162 كم/س)', () => {
  // انتقال من طرابلس (32.8872, 13.1913) إلى مصراتة (32.3754, 15.0925) خلال 60 ثانية!
  const res = S.analyzeGpsSpoof(
    { latitude: 32.3754, longitude: 15.0925, accuracy: 15 },
    { lat: 32.8872, lng: 13.1913, acc: 15, ms: 1000 },
    1000 + 60000
  );
  assert.equal(res.blocked, true);
  assert.ok(res.reasons.some(r => r.includes('سرعة')));
});

test('الخطوة 3 — analyzeGpsSpoof: يحظر بصمة الارتفاع الصفرية المصطنعة (altitude=0 & altitudeAccuracy=0)', () => {
  const res = S.analyzeGpsSpoof({ latitude: 32.8872, longitude: 13.1913, accuracy: 10, altitude: 0, altitudeAccuracy: 0 }, null, 5000);
  assert.equal(res.blocked, true);
});

test('الخطوة 3 — packOfflineNote & parseOfflineNote: ترميز وفك ترميز بصمة الأوفلاين الموثقة بالـ GPS ضمن حد 300 حرف', () => {
  const note = S.packOfflineNote({
    lat: 32.887219, lng: 13.191344, accuracy: 11.8, distance: 18.4, locationId: 'loc_main', sig: 'abcdef0123456789extra'
  }, 'انقطاع تغطية المدار');
  assert.ok(note.length <= 300);
  const parsed = S.parseOfflineNote(note);
  assert.ok(parsed);
  assert.equal(parsed.lat, 32.88722);
  assert.equal(parsed.lng, 13.19134);
  assert.equal(parsed.acc, 12);
  assert.equal(parsed.dist, 18);
  assert.equal(parsed.locId, 'loc_main');
  assert.equal(parsed.sig, 'abcdef0123456789');
  assert.equal(parsed.extraNote, 'انقطاع تغطية المدار');
});

test('الخطوة 3 — detectRecAnomalies: يرصد البصمات المشبوهة في سجل التقارير ويتجاهل البصمات الطبيعية', () => {
  const recs = [
    { id: 'r1', empId: 'e1', t: new Date(1000000), lat: 32.8872111, lng: 13.1913222, accuracy: 10, locationId: 'l1' },
    { id: 'r2', empId: 'e1', t: new Date(1000000 + 600000), lat: 32.8872111, lng: 13.1913222, accuracy: 10, locationId: 'l1' }
  ];
  const flags = S.detectRecAnomalies(recs);
  assert.ok(flags.has('e1/r2'));
});

const finRaw = html.slice(html.indexOf('/*FIN-START*/'), html.indexOf('/*FIN-END*/'));
const F = new Function(finRaw + '\nreturn { extractEmpFinance, stripEmpFinance, mergeEmpFinance };')();

test('الخطوة 4 — عزل البيانات المالية (empFinance): فصل ودمج الحقول المالية والمصرفية بأمان تام', () => {
  const fullEmp = { id: 'e1', name: 'سالم', dept: 'المالية', payMode: 'monthly', payAmount: 3500, iban: 'LY99001', loanTotal: 800, active: true };
  const fin = F.extractEmpFinance(fullEmp);
  assert.equal(fin.payAmount, 3500);
  assert.equal(fin.iban, 'LY99001');
  assert.equal(fin.loanTotal, 800);
  const stripped = F.stripEmpFinance(fullEmp);
  assert.equal(stripped.finIsolated, true);
  assert.equal(stripped.payAmount, 0);
  assert.equal(stripped.iban, null);
  assert.equal(stripped.loanTotal, null);
  const restored = F.mergeEmpFinance(stripped, fin);
  assert.equal(restored.payAmount, 3500);
  assert.equal(restored.iban, 'LY99001');
  assert.equal(restored.loanTotal, 800);
});

const notifRaw = html.slice(html.indexOf('/*NOTIF-START*/'), html.indexOf('/*NOTIF-END*/'));
const N = new Function('detectRecAnomalies', notifRaw + '\nreturn { MEQAT_CORE_VERSION, calcCheckoutReminderMs, diffReqStatusChanges, diffAdminLiveAlerts, patchClientHtmlWithConfig };')(S.detectRecAnomalies);

test('الخطوة 5 — calcCheckoutReminderMs: يحسب موعد تذكير الانصراف بعد نهاية الوردية بـ 15 دقيقة بدقة', () => {
  const baseMs = Date.parse('2026-10-29T06:00:00Z'); // 08:00 بتوقيت ليبيا (+2)
  const sched = { start: '08:00', end: '16:00', off: false, flex: false };
  const res = N.calcCheckoutReminderMs(baseMs, sched, '2026-10-29', { id: 'e1' }, null, baseMs + 60000);
  assert.equal(res.shiftEndHm, '16:00');
  assert.equal(res.reason, 'shift_end_plus_15m');
  assert.ok(res.delayMs > 0);
  assert.equal(res.expired, false);
});

test('الخطوة 5 — diffReqStatusChanges: يرصد تحوّل الطلب من pending إلى approved أو rejected فقط دون تكرار', () => {
  const prev = { r1: 'pending', r2: 'approved' };
  const curr = [
    { id: 'r1', kind: 'leave', status: 'approved', reason: 'إجازة موفقة' },
    { id: 'r2', kind: 'fix', status: 'approved' },
    { id: 'r3', kind: 'loan', status: 'pending' }
  ];
  const { changed, nextMap } = N.diffReqStatusChanges(prev, curr);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].id, 'r1');
  assert.equal(changed[0].status, 'approved');
  assert.equal(nextMap.r1, 'approved');
  assert.equal(nextMap.r3, 'pending');
  // استدعاء ثانٍ بنفس الحالة لا يطلق إشعاراً مكرراً
  const second = N.diffReqStatusChanges(nextMap, curr);
  assert.equal(second.changed.length, 0);
});

test('الخطوة 5 — diffAdminLiveAlerts: يرصد الطلبات الجديدة واشتباهات الموقع الوهمي للمدير لحظياً', () => {
  const initRes = N.diffAdminLiveAlerts(
    { initialized: false, reqIds: [], recIds: [] },
    [{ id: 'q1', empId: 'e1', empName: 'أحمد', status: 'pending', kind: 'leave' }],
    [{ id: 'p1', empId: 'e1', empName: 'أحمد', t: new Date(1000000), lat: 32.8872111, lng: 13.1913222, accuracy: 10, locationId: 'l1' }]
  );
  // أول تهيئة لا تطلق إشعارات قديمة
  assert.equal(initRes.alerts.length, 0);
  assert.equal(initRes.nextState.initialized, true);

  // وصول طلب جديد + بصمة ثبات إحداثيات مشبوهة
  const liveRes = N.diffAdminLiveAlerts(
    initRes.nextState,
    [
      { id: 'q1', empId: 'e1', empName: 'أحمد', status: 'pending', kind: 'leave' },
      { id: 'q2', empId: 'e2', empName: 'سالم', status: 'pending', kind: 'fix', type: 'offline_gps' }
    ],
    [
      { id: 'p1', empId: 'e1', empName: 'أحمد', t: new Date(1000000), lat: 32.8872111, lng: 13.1913222, accuracy: 10, locationId: 'l1' },
      { id: 'p2', empId: 'e1', empName: 'أحمد', t: new Date(1000000 + 600000), lat: 32.8872111, lng: 13.1913222, accuracy: 10, locationId: 'l1' }
    ]
  );
  assert.equal(liveRes.alerts.length, 2);
  assert.ok(liveRes.alerts.some(a => a.type === 'req' && a.title.includes('سالم')));
  assert.ok(liveRes.alerts.some(a => a.type === 'spoof' && a.title.includes('أحمد')));
});

test('الخطوة 5 — patchClientHtmlWithConfig: يدمج firebaseConfig و MEQAT_LICENSE في قالب التحديث السحابي (OTA) بنجاح', () => {
  const sampleTpl = `<!doctype html><html><body><script type="module">\nconst firebaseConfig = {\n  apiKey: "OLD",\n  projectId: "old-proj"\n};\nconsole.log(firebaseConfig);\n</script></body></html>`;
  const patched = N.patchClientHtmlWithConfig(
    sampleTpl,
    { apiKey: 'AIzaNewKey', projectId: 'meqat-client-1', appId: '1:999:web:abc' },
    { company: 'شركة النور', plan: 'company', latestVersion: '2026.5.0' }
  );
  assert.ok(patched.includes('"apiKey": "AIzaNewKey"'));
  assert.ok(patched.includes('"projectId": "meqat-client-1"'));
  assert.ok(patched.includes('window.MEQAT_LICENSE = {"company":"شركة النور"'));
});
