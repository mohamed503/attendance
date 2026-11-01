/* ===== محرك الاحتساب اليومي: ربط الجداول بالتقارير وشاشة «اليوم» (الخطوة 1) ===== */
function forgotMsOf(sc) {
  let mx = 0;
  const per = (s, e) => { if (!s || !e) return; const a = hm(s); let b = hm(e); if (b <= a) b += 1440; mx = Math.max(mx, b - a); };
  if (sc) {
    if (sc.mode === 'rotation') (sc.shifts || []).forEach(x => per(x.s, x.e));
    else if (sc.mode === 'fixed') Object.values(sc.days || {}).forEach(d => { if (d && d.on) (d.p || []).forEach(p => per(p.s, p.e)); });
    else if (sc.mode === 'flex') Object.values(sc.days || {}).forEach(d => { if (d && d.on) mx = Math.max(mx, (+d.h || 0) * 60); });
  }
  return Math.max(FORGOT_MS, (mx + 240) * 60000);   // أطول فترة دوام + 4 ساعات، وبحد أدنى 14 ساعة
}
/* مصدر وحيد لمهلة نسيان الانصراف: الجهاز واللوحة والتقارير تستدعيه. */
const forgotLimitMs = sc => forgotMsOf(sc);

/* أطول يوم عمل مخطط في الجدول (بالدقائق): يُستخدم حدًّا افتراضيًا للساعات العادية في يوم الراحة/العطلة */
function typicalDayMin(sc) {
  let mx = 0;
  const per = (s, e) => { if (!s || !e) return 0; const a = hm(s); let b = hm(e); if (b <= a) b += 1440; return b - a; };
  if (sc) {
    if (sc.mode === 'rotation') (sc.shifts || []).forEach(x => { mx = Math.max(mx, per(x.s, x.e)); });
    else if (sc.mode === 'fixed') Object.values(sc.days || {}).forEach(d => { if (d && d.on) mx = Math.max(mx, (d.p || []).reduce((a, p) => a + per(p.s, p.e), 0)); });
    else if (sc.mode === 'flex') Object.values(sc.days || {}).forEach(d => { if (d && d.on) mx = Math.max(mx, (+d.h || 0) * 60); });
  }
  return mx;
}

/* سياسة العمل في يوم الراحة (rest) أو العطلة الرسمية (hol) — مستقلة عن وضع الإضافي في الأيام العادية.
   all: كل الساعات إضافية بالمعامل · afterBase: عادية حتى حد ثم الزائد إضافي · tiered: معامل للشريحة الأولى وأعلى للزائد
   fixed: بدل ثابت (ساعات مكافئة) إن بلغ الحضور حدًّا أدنى · normal: ساعات عادية بلا إضافي.
   تُرجع null إن لم يكن هناك إضافي، وإلا { min: دقائق الإضافي (تُخصم من العادي)، eq: ساعات مكافئة، rate }.
   الجداول القديمة بلا الحقول الجديدة: تبقى «all» (أو «normal» إن كان وضع الإضافي none) فلا يتغير حسابها. */
const OFFDAY_MODES = ['all', 'afterBase', 'tiered', 'fixed', 'normal'];
function offDayOT(ot, dayType, netMin, typicalMin) {
  const hol = dayType === 'holiday';
  const pre = hol ? 'hol' : 'rest';
  let mode = ot[pre + 'Mode'];
  if (!OFFDAY_MODES.includes(mode)) mode = ot.mode === 'none' ? 'normal' : 'all';
  if (mode === 'normal' || !(netMin > 0)) return null;
  const rate = +(hol ? ot.rateHoliday : ot.rateRest) || 0;
  if (mode === 'fixed') {
    const minH = +ot[pre + 'MinH'] || 0, fixH = +ot[pre + 'FixedH'] || 0;
    if (fixH <= 0 || netMin < minH * 60) return null;
    return { min: fixH * 60, eq: fixH * rate, rate };
  }
  const cfg = +ot[pre + 'BaseH'] || 0;
  const baseMin = mode === 'all' ? 0 : (cfg > 0 ? cfg * 60 : (+ot.baseH > 0 ? ot.baseH * 60 : (typicalMin || 0)));
  let extra = mode === 'afterBase' ? netMin - baseMin : netMin;
  if (extra <= 0) return null;
  if (ot.step > 0) extra = Math.floor(extra / ot.step) * ot.step;
  if (ot.capH > 0) extra = Math.min(extra, ot.capH * 60);
  if (!(extra >= ot.min) || extra <= 0) return null;
  if (mode === 'tiered' && baseMin > 0) {
    const rb = ot[pre + 'RateBase'] == null ? 1 : (+ot[pre + 'RateBase'] || 0);
    const a = Math.min(extra, baseMin), b = extra - a;
    return { min: extra, eq: a / 60 * rb + b / 60 * rate, rate: b > 0 ? rate : rb };
  }
  return { min: extra, eq: extra / 60 * rate, rate };
}

function pairSessions(rs, lim = FORGOT_MS) {
  const maxOutSpan = Math.max(lim * 2, 36 * 3600e3);
  const out = []; let open = null;
  [...rs].sort((a, b) => a.t - b.t).forEach(r => {
    if (r.type === 'in') {
      if (!open) open = r.t;
      else if (r.t - open >= lim) { out.push({ start: open, end: null }); open = r.t; }
    } else if (open) {
      if (r.t - open <= maxOutSpan) {
        out.push({ start: open, end: r.t });
        open = null;
      } else {
        out.push({ start: open, end: null });
        open = null;
      }
    }
  });
  if (open) out.push({ start: open, end: null });
  return out;
}

/* دمج سجلات الحضور (مخزَّنة + جديدة): إزالة التكرار بالنوع والزمن ثم ترتيب تصاعدي */
function mergeRecs(a, b) {
  const m = new Map();
  [...(a || []), ...(b || [])].forEach(r => { if (r && r.t && !isNaN(r.t.getTime())) m.set(r.type + '|' + r.t.getTime(), r); });
  return [...m.values()].sort((x, y) => x.t - y.t);
}

/*MSUM-START*/
/* ضغط وفك ضغط بصمات الشهر المغلق في وثيقة واحدة (monthlySummaries/{YYYY-MM}) لتوفير آلاف القراءات إلى قراءة واحدة فقط */
function packMonthRecs(rows, mk, tzOff) {
  const seen = new Set();
  const items = [];
  [...(rows || [])].forEach(r => {
    if (!r || !r.empId) return;
    const ms = r.t instanceof Date ? r.t.getTime() : (r.time && typeof r.time.toMillis === 'function' ? r.time.toMillis() : NaN);
    if (isNaN(ms)) return;
    const id = String(r.id || ('r_' + ms));
    const dedupKey = r.empId + '|' + id + '|' + ms;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    items.push([
      id,
      String(r.empId),
      r.type === 'out' ? 1 : 0,
      ms,
      String(r.locationId || ''),
      String(r.locationName || ''),
      Math.round(+r.distance || 0),
      +(+r.lat || 0).toFixed(5),
      +(+r.lng || 0).toFixed(5),
      String(r.empName || '')
    ]);
  });
  items.sort((a, b) => (a[3] - b[3]) || a[1].localeCompare(b[1]));
  return { mk: String(mk || ''), tzOff: +tzOff || 0, count: items.length, packed: JSON.stringify(items) };
}
function unpackMonthRecs(docData, tsFromMillis) {
  if (!docData || typeof docData.packed !== 'string') return [];
  let items;
  try { items = JSON.parse(docData.packed); } catch { return []; }
  if (!Array.isArray(items)) return [];
  return items.map(a => {
    const ms = +a[3] || 0;
    const t = new Date(ms);
    return {
      id: String(a[0] || ''),
      empId: String(a[1] || ''),
      type: a[2] === 1 ? 'out' : 'in',
      time: tsFromMillis ? tsFromMillis(ms) : { toMillis: () => ms, toDate: () => t },
      t,
      locationId: a[4] || '',
      locationName: a[5] || '',
      distance: +a[6] || 0,
      lat: +a[7] || 0,
      lng: +a[8] || 0,
      empName: a[9] || ''
    };
  });
}
/*MSUM-END*/

/*SPOOF-START*/
/* محرك كشف الموقع الوهمي (Anti-GPS Spoofing) وتوثيق بصمات الأوفلاين بالـ GPS */
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function analyzeGpsSpoof(coords, prevSample, nowMs = Date.now()) {
  const reasons = [];
  let blocked = false;
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
    return { suspicious: true, blocked: true, reasons: ['إحداثيات غير صالحة'] };
  }
  const lat = coords.latitude, lng = coords.longitude, acc = +coords.accuracy || 0;
  // 1. دقة مثالية مصطنعة (< 1 متر في متصفح هاتف) أو سرعة سالبة أو ارتفاع صفري مصطنع
  if (acc > 0 && acc < 1.0) {
    reasons.push('دقة GPS مصطنعة (< 1م)');
  }
  if (coords.altitude === 0 && coords.altitudeAccuracy === 0) {
    reasons.push('بصمة ارتفاع صفرية (Mock Location)');
    blocked = true;
  }
  if (coords.speed != null && coords.speed < 0) {
    reasons.push('قيمة سرعة سالبة غير طبيعية');
    blocked = true;
  }
  // 2. مقارنة مع البصمة الجغرافية السابقة على نفس الجهاز
  if (prevSample && typeof prevSample.lat === 'number' && typeof prevSample.lng === 'number' && prevSample.ms) {
    const dtSec = (nowMs - prevSample.ms) / 1000;
    const dM = haversineM(lat, lng, prevSample.lat, prevSample.lng);
    // تطابق تام حتى 7 خانات عشرية مع نفس الدقة بعد مرور أكثر من دقيقة (مستحيل فيزيائياً في GPS الحقيقي بسبب التذبذب الحراري)
    if (dtSec > 60 && Math.abs(lat - prevSample.lat) < 1e-7 && Math.abs(lng - prevSample.lng) < 1e-7 && Math.abs(acc - (+prevSample.acc || 0)) < 1e-4) {
      reasons.push('ثبات إحداثيات مطلق بدون تذبذب طبيعي (تطبيق تثبيت موقع)');
      blocked = true;
    }
    // انتقال بسرعة تتجاوز 162 كم/س (45 م/ث) لمسافة أكبر من 500 متر خلال أقل من ساعتين
    if (dtSec > 5 && dtSec < 7200 && dM > 500 && (dM / dtSec) > 45) {
      reasons.push(`سرعة انتقال غير منطقية (${Math.round((dM / dtSec) * 3.6)} كم/س)`);
      blocked = true;
    }
  }
  return { suspicious: reasons.length > 0, blocked, reasons };
}
function detectRecAnomalies(recs) {
  const flags = new Map();
  const byEmp = new Map();
  [...(recs || [])].forEach(r => {
    if (!r || !r.empId || !r.t || !r.lat || !r.lng || r.locationId === 'admin' || r.locationId === 'biometric' || r.locationId === 'archive') return;
    const list = byEmp.get(r.empId) || [];
    list.push(r);
    byEmp.set(r.empId, list);
  });
  byEmp.forEach(list => {
    list.sort((a, b) => a.t - b.t);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      const dtSec = (cur.t - prev.t) / 1000;
      const dM = haversineM(cur.lat, cur.lng, prev.lat, prev.lng);
      const issues = [];
      if (dtSec > 300 && Math.abs(cur.lat - prev.lat) < 1e-7 && Math.abs(cur.lng - prev.lng) < 1e-7 && cur.accuracy > 0 && cur.accuracy === prev.accuracy) {
        issues.push('تطابق إحداثيات عشري مطلق مع البصمة السابقة');
      }
      if (dtSec > 5 && dtSec < 7200 && dM > 500 && (dM / dtSec) > 45) {
        issues.push(`انتقال غير منطقي (${Math.round(dM)}م خلال ${Math.round(dtSec)}ث)`);
      }
      if (cur.accuracy > 0 && cur.accuracy < 1.0) {
        issues.push(`دقة مصطنعة (${cur.accuracy}م)`);
      }
      if (issues.length && cur.id) flags.set(cur.empId + '/' + cur.id, issues);
    }
  });
  return flags;
}
function packOfflineNote(meta, userNote = '') {
  const payload = {
    lat: +(+meta.lat || 0).toFixed(5),
    lng: +(+meta.lng || 0).toFixed(5),
    acc: Math.round(+meta.accuracy || 0),
    dist: Math.round(+meta.distance || 0),
    locId: String(meta.locationId || '').slice(0, 32),
    sig: String(meta.sig || '').slice(0, 16)
  };
  const prefix = '[GPS-OFFLINE]' + JSON.stringify(payload);
  return (userNote ? prefix + ' ' + String(userNote).trim() : prefix).slice(0, 300);
}
function parseOfflineNote(note) {
  const s = String(note || '');
  if (!s.startsWith('[GPS-OFFLINE]')) return null;
  const rest = s.slice(13);
  const endIdx = rest.indexOf('}');
  if (endIdx < 0) return null;
  try {
    const data = JSON.parse(rest.slice(0, endIdx + 1));
    const extraNote = rest.slice(endIdx + 1).trim();
    return { ...data, extraNote };
  } catch { return null; }
}
/*SPOOF-END*/

/*FIN-START*/
/* عزل البيانات المالية والمصرفية الحساسة (empFinance/{empId}) عن وثيقة الموظف العامة */
const FIN_KEYS = ['payMode','payAmount','allowance','bonus','penalty','adjMonth','loanTotal','loanInst','lyStatutory','familyStatus','nationalId','bankName','iban','taskPrices'];
function extractEmpFinance(obj) {
  const out = {};
  FIN_KEYS.forEach(k => { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}
function stripEmpFinance(empPatch) {
  const out = { ...empPatch, finIsolated: true, payMode: empPatch && empPatch.empType === 'task' ? 'task' : 'none', payAmount: 0 };
  ['allowance','bonus','penalty','adjMonth','loanTotal','loanInst','lyStatutory','familyStatus','nationalId','bankName','iban','taskPrices'].forEach(k => { out[k] = null; });
  return out;
}
function mergeEmpFinance(emp, finDoc) {
  if (!emp || !finDoc) return emp;
  const merged = { ...emp };
  FIN_KEYS.forEach(k => { if (finDoc[k] !== undefined && finDoc[k] !== null) merged[k] = finDoc[k]; });
  return merged;
}
/*FIN-END*/

/*NOTIF-START*/
/* محرك التنبيهات الذكية للموظف والمدير + التحديث السحابي المركزي (OTA) — بدون أي قراءات إضافية من Firestore */
const MEQAT_CORE_VERSION = '2026.5.0';

function calcCheckoutReminderMs(punchInMs, sched, dayKeyStr, emp = null, overrides = null, nowMs = Date.now()) {
  const inMs = +punchInMs || nowMs;
  const fLim = (typeof forgotLimitMs === 'function') ? forgotLimitMs(sched) : (14 * 3600000);
  const fallbackFireAt = inMs + Math.max(3600000, fLim - 30 * 60000);
  let fireAtMs = fallbackFireAt;
  let shiftEndHm = '';
  let reason = 'forgot_guard';

  try {
    let sc = null;
    if (typeof resolveDaySched === 'function' && sched && dayKeyStr) {
      sc = resolveDaySched(sched, dayKeyStr, emp, overrides);
    } else if (typeof daySched === 'function' && sched && dayKeyStr) {
      sc = daySched(sched, dayKeyStr, emp && emp.rotStart);
    } else if (sched && sched.end) {
      sc = sched;
    }
    if (sc && !sc.off && !sc.flex && sc.end) {
      const [eh, em] = String(sc.end).split(':').map(Number);
      const [sh, sm] = String(sc.start || '08:00').split(':').map(Number);
      if (!isNaN(eh) && !isNaN(em)) {
        const endMin = eh * 60 + em;
        const startMin = (!isNaN(sh) && !isNaN(sm)) ? (sh * 60 + sm) : 480;
        const baseDayMs = (typeof dayStart === 'function' && dayKeyStr) ? dayStart(dayKeyStr).getTime() : (inMs - (inMs % 86400000));
        let endMs = baseDayMs + endMin * 60000;
        if (endMin <= startMin || endMs < inMs - 2 * 3600000) endMs += 86400000;
        const candidate = endMs + 15 * 60000; // بعد انتهاء الوردية بـ 15 دقيقة
        if (candidate > inMs + 5 * 60000) {
          fireAtMs = Math.min(candidate, fallbackFireAt);
          shiftEndHm = sc.end;
          reason = 'shift_end_plus_15m';
        }
      }
    }
  } catch {}

  const delayMs = Math.max(0, fireAtMs - nowMs);
  return {
    fireAtMs,
    delayMs,
    shiftEndHm,
    reason,
    expired: nowMs >= fireAtMs
  };
}

function diffReqStatusChanges(prevMap, currentReqs) {
  const prev = (prevMap && typeof prevMap === 'object') ? prevMap : {};
  const hasPrev = Object.keys(prev).length > 0;
  const nextMap = {};
  const changed = [];
  (Array.isArray(currentReqs) ? currentReqs : []).forEach(r => {
    if (!r || !r.id) return;
    const st = String(r.status || 'pending');
    nextMap[r.id] = st;
    const oldSt = prev[r.id];
    if (st === 'approved' || st === 'rejected') {
      if (oldSt === 'pending' || (!hasPrev && r._recentDecided)) {
        changed.push({
          id: r.id,
          kind: r.kind || 'fix',
          status: st,
          type: r.type || '',
          typeName: r.typeName || '',
          from: r.from || '',
          to: r.to || '',
          reason: r.reason || ''
        });
      }
    }
  });
  return { changed, nextMap };
}

function diffAdminLiveAlerts(prevState, currentReqs, currentTodayRecs, settings = {}) {
  const prevReqIds = new Set((prevState && Array.isArray(prevState.reqIds)) ? prevState.reqIds : []);
  const prevRecIds = new Set((prevState && Array.isArray(prevState.recIds)) ? prevState.recIds : []);
  const initialized = !!(prevState && prevState.initialized);
  const alerts = [];

  const reqList = Array.isArray(currentReqs) ? currentReqs : [];
  const recList = Array.isArray(currentTodayRecs) ? currentTodayRecs : [];

  const nextReqIds = reqList.filter(r => r && r.status === 'pending').map(r => (r.empId || '') + '/' + r.id);
  const nextRecIds = recList.map(r => (r.empId || '') + '/' + r.id);

  if (initialized) {
    reqList.filter(r => r && r.status === 'pending').forEach(r => {
      const k = (r.empId || '') + '/' + r.id;
      if (!prevReqIds.has(k)) {
        const kindLabel = r.kind === 'loan' ? 'طلب سلفة مالية' : r.kind === 'cert' ? 'طلب شهادة/إفادة' : r.kind === 'leave' ? 'طلب إجازة' : (r.type === 'offline_gps' ? 'بصمة أوفلاين موثقة بالـ GPS' : 'طلب تصحيح بصمة');
        alerts.push({
          type: 'req',
          id: k,
          title: `🔔 طلب جديد من ${r.empName || 'موظف'}`,
          body: `${kindLabel} بانتظار المراجعة والاعتماد`
        });
      }
    });

    const newRecs = recList.filter(r => !prevRecIds.has((r.empId || '') + '/' + r.id));
    if (newRecs.length && typeof detectRecAnomalies === 'function') {
      const anomMap = detectRecAnomalies(recList, settings);
      newRecs.forEach(r => {
        const k = (r.empId || '') + '/' + r.id;
        const flags = anomMap.get(r.id) || anomMap.get(k);
        if (flags && flags.length) {
          alerts.push({
            type: 'spoof',
            id: k,
            title: `⚠️ اشتباه بصمة GPS — ${r.empName || 'موظف'}`,
            body: flags.join(' · ')
          });
        }
      });
    }
  }

  return {
    alerts,
    nextState: {
      initialized: true,
      reqIds: nextReqIds,
      recIds: nextRecIds
    }
  };
}

function patchClientHtmlWithConfig(templateHtml, fbConfig, licenseObj) {
  let html = String(templateHtml || '');
  if (!html || html.length < 20) throw new Error('قالب النظام غير صالح');
  if (fbConfig && typeof fbConfig === 'object' && fbConfig.apiKey && fbConfig.projectId) {
    const i = html.indexOf('const firebaseConfig');
    const j = i >= 0 ? html.indexOf('};', i) : -1;
    if (i >= 0 && j > i) {
      const cleanCfg = {
        apiKey: fbConfig.apiKey,
        authDomain: fbConfig.authDomain || (fbConfig.projectId + '.firebaseapp.com'),
        projectId: fbConfig.projectId,
        storageBucket: fbConfig.storageBucket || (fbConfig.projectId + '.firebasestorage.app'),
        messagingSenderId: fbConfig.messagingSenderId || '',
        appId: fbConfig.appId || ''
      };
      html = html.slice(0, i) + 'const firebaseConfig = ' + JSON.stringify(cleanCfg, null, 2) + ';\n' + html.slice(j + 2);
    }
  }
  if (licenseObj && typeof licenseObj === 'object') {
    html = html.replace(/<script>window\.MEQAT_LICENSE\s*=[\s\S]*?<\/script>\s*/g, '');
    const si = html.indexOf('<script type="module"');
    if (si >= 0) {
      const safeJson = JSON.stringify(licenseObj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      html = html.slice(0, si) + '<script>window.MEQAT_LICENSE = ' + safeJson + ';</scr' + 'ipt>\n' + html.slice(si);
    }
  }
  return html;
}
/*NOTIF-END*/

/*RUNS-START*/
/* مسيّرات الرواتب المجمّدة: ترميز قانوني ثابت (مفاتيح مرتّبة) + بصمة SHA-256 للتحقق من سلامة الصفوف بعد الاعتماد */
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v === undefined ? null : v);
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
/* rows: [{ id, data }] */
const runHash = rows => sha256Hex(canon([...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(r => ({ id: r.id, data: r.data }))));
const r2 = v => Math.round((+v || 0) * 100) / 100;
function runTotals(rows) {
  const t = { count: rows.length, base: 0, otPay: 0, allowBonus: 0, dedAtt: 0, stat: 0, loan: 0, pen: 0, net: 0 };
  rows.forEach(r => {
    t.base += +r.base || 0; t.otPay += +r.otPay || 0; t.allowBonus += +r.allowBonus || 0;
    t.dedAtt += (+r.dedLate || 0) + (+r.dedEarly || 0) + (+r.dedAbs || 0) + (+r.dedForgot || 0);
    t.stat += +r.statDed || 0; t.loan += +r.dedLoan || 0; t.pen += +r.dedPen || 0; t.net += +r.net || 0;
  });
  Object.keys(t).forEach(k => { if (k !== 'count') t[k] = r2(t[k]); });
  return t;
}
/* صف المسيّر = صف الحساب + مدخلاته وقت الحفظ (الراتب، السياسة، الجدول) كي يُفسَّر الرقم لاحقًا ولو تغيّر الموظف */
function buildRunRow(r, e, scheds) {
  const sc = e && (scheds || []).find(s => s.id === e.scheduleId);
  return JSON.parse(JSON.stringify({
    ...r,
    inp: e ? {
      payMode: e.payMode ?? null, payAmount: +e.payAmount || 0, allowance: +e.allowance || 0, bonus: +e.bonus || 0, penalty: +e.penalty || 0, adjMonth: e.adjMonth || null,
      loanTotal: +e.loanTotal || 0, loanInst: +e.loanInst || 0, lyStatutory: !!e.lyStatutory, familyStatus: e.familyStatus || null,
      startDate: e.startDate || null, scheduleId: e.scheduleId || null,
      sched: sc ? { name: sc.name || '', mode: sc.mode || '', ot: sc.ot || {} } : null
    } : null
  }));
}
/*RUNS-END*/

/*LEDGER-START*/
/* دفتر السلف: خطة قيود الأقساط عند اعتماد المسيّر، والتحقق من سلسلة الدفتر */
const LEDGER_RANK = { opening: 0, grant: 1, adjust: 2, installment: 3 };
const LEDGER_AR = { opening: 'رصيد افتتاحي', grant: 'سلفة جديدة', installment: 'قسط مخصوم', adjust: 'تسوية يدوية' };
/* rows: صفوف المسيّر (empId, name, dedLoan) · emps: { empId: وثيقة الموظف الحالية|null } */
function planInstallments(rows, emps, runId, by) {
  const items = [], problems = [];
  (rows || []).forEach(r => {
    const d = +r.dedLoan || 0; if (d <= 0) return;
    const e = emps[r.empId];
    if (!e) { problems.push(`${r.name || r.empId}: ملف الموظف غير موجود`); return; }
    const cur = +e.loanTotal || 0;
    if (cur + 1e-9 < d) { problems.push(`${r.name || r.empId}: رصيد السلفة الحالي (${r2(cur)}) أقل من القسط المحفوظ في المسيّر (${r2(d)}). أعد حساب المسودة`); return; }
    const nb = Math.max(0, r2(cur - d));
    items.push({ empId: r.empId, id: 'inst_' + runId, newBalance: nb, entry: { type: 'installment', delta: -d, balanceAfter: nb, runId, by } });
  });
  return { items, problems };
}
/* entries: [{ id, type, delta, balanceAfter, atMs }] — يتحقق أن كل قيد يتبع سابقه، وأن آخر رصيد يطابق رصيد الموظف الحالي */
function verifyLedger(entries, currentBalance) {
  const problems = [];
  const es = [...(entries || [])].sort((a, b) => (a.atMs - b.atMs) || ((LEDGER_RANK[a.type] ?? 9) - (LEDGER_RANK[b.type] ?? 9)));
  let prev = 0;
  es.forEach((e, i) => {
    const exp = r2(prev + (+e.delta || 0));
    if (Math.abs(exp - (+e.balanceAfter || 0)) > 0.011) problems.push(`القيد ${i + 1} (${LEDGER_AR[e.type] || e.type}): الرصيد بعده ${r2(e.balanceAfter)} والمتوقع ${exp}`);
    prev = +e.balanceAfter || 0;
  });
  const cur = +currentBalance || 0;
  if (!es.length && cur > 0) problems.push('لا قيود في الدفتر بينما رصيد السلفة الحالي ' + r2(cur) + ' (يلزم قيد افتتاحي)');
  else if (es.length && Math.abs(prev - cur) > 0.011) problems.push(`الرصيد الحالي ${r2(cur)} لا يطابق آخر قيد ${r2(prev)}`);
  return { ok: !problems.length, problems, balance: prev };
}
/*LEDGER-END*/

/*EXPORT-START*/
/* أدوات التصدير من المسيّر المحفوظ: تعمل على الصفوف المحفوظة فقط ولا تحسب شيئًا من البيانات الحيّة.
   أي تغيير في الراتب أو الجدول لاحقًا لا يغيّر ما يُصدَّر من مسيّر معتمد. */
const runPayRows = rows => (rows || []).map(r => ({
  empId: r.empId, name: String(r.name || ''), dept: r.dept || '', jobTitle: r.jobTitle || '',
  nationalId: r.nationalId || '', bankName: r.bankName || '', iban: r.iban || '',
  pm: r.pm || 'none', amt: +r.amt || 0, paidH: +r.paidH || 0, taskQty: +r.taskQty || 0,
  otEq: +r.otEq || 0,
  base: r2(r.base), otPay: r2(r.otPay), allowBonus: r2(r.allowBonus),
  dedLate: r2(r.dedLate), dedEarly: r2(r.dedEarly), dedAbs: r2(r.dedAbs), dedForgot: r2(r.dedForgot),
  statDed: r2(r.statDed), dedLoan: r2(r.dedLoan), dedPen: r2(r.dedPen),
  net: r2(r.net), absent: +r.absent || 0, forgotDays: +r.forgotDays || 0, unpaidDays: +r.unpaidDays || 0
})).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
const runBankRows = rows => runPayRows(rows).filter(r => r.net > 0);
/* تنبيهات المراجعة قبل الاعتماد: تغيّر كبير عن المسيّر السابق، صافٍ صفر، غياب كثير، وبلا IBAN */
const runAlertList = (rows, prevRows = [], opt = {}) => {
  const list = [], minDelta = opt.minDelta ?? 50, pct = opt.pct ?? 0.25, maxAbsent = opt.maxAbsent ?? 5;
  const prev = new Map(runPayRows(prevRows).map(r => [r.empId, r]));
  runPayRows(rows).forEach(r => {
    if (r.net <= 0) list.push({ code: 'zero', level: 'warn', empId: r.empId, name: r.name, text: `${r.name}: صافي الراتب صفر أو سالب (${r.net})` });
    const p = prev.get(r.empId);
    if (p) {
      const d = r2(r.net - p.net);
      if (Math.abs(d) >= Math.max(minDelta, pct * Math.abs(p.net))) list.push({ code: 'change', level: 'info', empId: r.empId, name: r.name, delta: d, text: `${r.name}: تغيّر الصافي ${p.net} ← ${r.net} (${d > 0 ? '+' : ''}${d}) عن المسيّر السابق` });
    }
    if (r.absent >= maxAbsent) list.push({ code: 'absent', level: 'warn', empId: r.empId, name: r.name, text: `${r.name}: ${r.absent} يوم غياب في الفترة` });
    if (r.net > 0 && !r.iban) list.push({ code: 'iban', level: 'info', empId: r.empId, name: r.name, text: `${r.name}: لا يوجد IBAN — لن يظهر في الكشف المصرفي` });
  });
  return list;
};
const runAlertSummary = alerts => {
  const w = (alerts || []).filter(a => a.level === 'warn').length;
  return { total: (alerts || []).length, warn: w, info: (alerts || []).length - w };
};
const csvCell = v => { const s = String(v ?? ''); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return `"${safe.replace(/"/g, '""')}"`; };
const csvAoa = aoa => '\ufeff' + (aoa || []).map(r => r.map(csvCell).join(',')).join('\n');
/*EXPORT-END*/

const localMin = d => ((Math.floor(d.getTime() / 60000 + TZOFF) % 1440) + 1440) % 1440;
const minFromDayStart = (d, key) => Math.round((d.getTime() - dayStart(key).getTime()) / 60000);

function onLeave(leaves, empId, key) { return (leaves || []).some(l => l.empId === empId && l.kind === 'leave' && key >= l.from && key <= l.to); }
const DEF_LT = [
  { id: 'annual', name: 'سنوية', pct: 100, deduct: true, cap: 0 },
  { id: 'sick', name: 'مرضية', pct: 100, deduct: false, cap: 0 },
  { id: 'emergency', name: 'اضطرارية', pct: 100, deduct: true, cap: 0 },
  { id: 'unpaid', name: 'بدون راتب', pct: 0, deduct: false, cap: 0 },
  { id: 'other', name: 'أخرى', pct: 100, deduct: false, cap: 0 }
];
const leaveTypesOf = set => (set && Array.isArray(set.leaveTypes) && set.leaveTypes.length ? set.leaveTypes : DEF_LT);
function getLeaveObj(leaves, empId, key) { return (leaves || []).find(l => l.empId === empId && l.kind === 'leave' && key >= l.from && key <= l.to) || null; }
const leavePct = l => (l.payPct != null ? +l.payPct : (l.typeName === 'بدون راتب' || l.type === 'unpaid') ? 0 : 100);
const leaveDeducts = l => (l.deduct != null ? !!l.deduct : l.typeName === 'سنوية');
function isLeaveDay(sc, key, rot, hols) { if (hols && hols.includes(key)) return false; if (!sc) return dow(key) <= 4; return baseDay(sc, key, rot || 0).work; }
function countLeaveDays(from, to, sc, rot, hols, year) {
  let a = from, b = to;
  if (year) { const y0 = `${year}-01-01`, y1 = `${year}-12-31`; if (a < y0) a = y0; if (b > y1) b = y1; }
  let n = 0; for (let k = a; k <= b; k = addDays(k, 1)) if (isLeaveDay(sc, k, rot, hols)) n++;
  return n;
}

function calcDay(sc, key, sesAll, holidays, rotOffset, opt = {}) {
  const res = { key, firstIn: null, lastOut: null, raw: 0, net: 0, breakMin: 0, late: 0, early: 0, otMin: 0, otEq: 0, otRate: 0, open: false, planned: 0, dayType: 'rest', shiftName: '' };
  const isHol = Array.isArray(holidays) && holidays.includes(key);
  const b = baseDay(sc, key, rotOffset);
  res.shiftName = b.shiftName;
  if (b.work) { res.dayType = isHol ? 'holiday' : 'work'; res.planned = b.flexMin || b.periods.reduce((a, p) => a + (p.e - p.s), 0); }
  else if (isHol) res.dayType = 'holiday';
  const ses = (sesAll || []).filter(s => dayKey(s.start) === key);
  if (!ses.length) return res;
  res.firstIn = ses[0].start;
  const last = ses[ses.length - 1];
  res.lastOut = last.end; res.open = !last.end;
  let raw = 0;
  ses.forEach(s => { if (s.end) raw += (s.end - s.start) / 60000; else if (opt.nowMs) raw += Math.max(0, Math.min(opt.nowMs - s.start, opt.cap || FORGOT_MS) / 60000); });
  res.raw = raw;
  let net = raw;
  if (raw > 240 && (sc ? sc.breakMin || 0 : 0) > 0) { res.breakMin = sc.breakMin; net = Math.max(0, raw - sc.breakMin); }
  res.net = net;

  const ot = sc ? Object.assign({}, OT_DEF, sc.ot || {}) : Object.assign({}, OT_DEF);
  if (net > 0 && (ot.mode !== 'none' || res.dayType !== 'work')) {
    let extra = 0;
    if (res.dayType === 'work') {
      if (ot.mode === 'hours') extra = net - (ot.baseH > 0 ? ot.baseH * 60 : res.planned);
      else if (ot.mode === 'afterEnd' && res.lastOut && (sc.mode === 'fixed' || sc.mode === 'rotation') && b.periods.length) {
        const endMin = minFromDayStart(res.lastOut, key);
        const schedEnd = b.periods[b.periods.length - 1].e;
        extra = Math.max(0, endMin - schedEnd);
      }
    } else {
      const o = offDayOT(ot, res.dayType, net, typicalDayMin(sc));
      if (o) { res.otMin = o.min; res.otEq = o.eq; res.otRate = o.rate; }
    }
    if (extra > 0) {
      if (ot.step > 0) extra = Math.floor(extra / ot.step) * ot.step;
      if (ot.capH > 0) extra = Math.min(extra, ot.capH * 60);
      if (extra >= ot.min) {
        res.otMin = extra;
        res.otRate = res.dayType === 'holiday' ? (ot.rateHoliday ?? 0) : res.dayType === 'rest' ? (ot.rateRest ?? 0) : (ot.rateNormal ?? 0);
        res.otEq = extra / 60 * res.otRate;
      }
    }
  }

  if (res.dayType === 'work' && sc && (sc.mode === 'fixed' || sc.mode === 'rotation') && b.periods.length) {
    const gLate = sc.graceLate ?? 10;
    const gEarly = sc.graceEarly ?? 10;
    const applyLate = d => (d > gLate ? (sc.graceMode === 'excess' ? d - gLate : d) : 0);
    const applyEarly = d => (d > gEarly ? (sc.graceMode === 'excess' ? d - gEarly : d) : 0);

    if (b.periods.length === 1) {
      const p0 = b.periods[0];
      const inMin = minFromDayStart(res.firstIn, key);
      res.late = applyLate(inMin - p0.s);
      if (res.lastOut) {
        const outMin = minFromDayStart(res.lastOut, key);
        res.early = applyEarly(p0.e - outMin);
      }
    } else {
      let totalLate = 0, totalEarly = 0;
      const sesMins = ses.map(s => ({
        s: minFromDayStart(s.start, key),
        e: s.end ? minFromDayStart(s.end, key) : null
      }));
      b.periods.forEach((p, idx) => {
        const nextS = b.periods[idx + 1] ? b.periods[idx + 1].s : Infinity;
        const prevE = idx > 0 ? b.periods[idx - 1].e : -Infinity;
        const midPrev = idx > 0 ? (prevE + p.s) / 2 : -Infinity;
        const midNext = b.periods[idx + 1] ? (p.e + nextS) / 2 : Infinity;
        const matched = sesMins.filter(sm => sm.s < midNext && (sm.e == null || sm.e > midPrev));
        if (!matched.length) {
          totalLate += (p.e - p.s);
        } else {
          totalLate += applyLate(matched[0].s - p.s);
          const lastM = matched[matched.length - 1];
          if (lastM.e != null) totalEarly += applyEarly(p.e - lastM.e);
        }
      });
      res.late = totalLate;
      res.early = totalEarly;
    }
  }
  return res;
}
/* ===== نهاية محرك الاحتساب ===== */

const geoK = lat => { const p = lat * Math.PI / 180; return { ky: 111132.92 - 559.82 * Math.cos(2*p) + 1.175 * Math.cos(4*p), kx: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3*p) + 0.118 * Math.cos(5*p) }; };
const fmtDur = ms => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}س ${m % 60}د`; };
/* رمز إضافة جهاز: 8 خانات من أبجدية بلا التباس (32 رمزًا ≈ 40 بت) بمولّد آمن؛ 256 تقبل القسمة على 32 فلا انحياز */
const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PIN_TTL_H = 48;
const genPin = (len = 8) => Array.from(crypto.getRandomValues(new Uint8Array(len)), b => PIN_ALPHABET[b & 31]).join('');
const fmtPin = p => String(p).slice(0, 4) + '-' + String(p).slice(4);
const normPin = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const randToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const dist = (a, b, c, d) => { const R = 6371000, r = x => x * Math.PI / 180; const dLat = r(c - a), dLng = r(d - b); const h = Math.sin(dLat/2)**2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng/2)**2; return 2 * R * Math.asin(Math.sqrt(h)); };
const mapLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
