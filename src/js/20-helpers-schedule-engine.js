/* ---------- أدوات مساعدة ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ini = n => esc((n || '?').trim().charAt(0) || '?');
const pad = n => String(n).padStart(2, '0');
let TZOFF = TZ_OFFSET_MIN;                    // يُحدَّث من إعدادات المنشأة عند التحميل
const L = d => new Date(d.getTime() + TZOFF * 60000); // نقرأ منه بـ getUTC* فيعطي توقيت العمل لا توقيت الجهاز
const dayKey = d => { const x = L(d); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth()+1)}-${pad(x.getUTCDate())}`; };
const fmtDate = d => { const x = L(d); return `${pad(x.getUTCDate())}/${pad(x.getUTCMonth()+1)}/${x.getUTCFullYear()}`; };
const fmtTime = (d, sec = false) => { const x = L(d); let h = x.getUTCHours(); const ap = h >= 12 ? 'م' : 'ص'; h = h % 12 || 12; return `${pad(h)}:${pad(x.getUTCMinutes())}${sec ? ':' + pad(x.getUTCSeconds()) : ''} ${ap}`; };
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const weekday = d => DAYS_AR[L(d).getUTCDay()];
const dayStart = key => new Date(Date.parse(key + 'T00:00:00Z') - TZOFF * 60000);
const dayEnd = key => new Date(dayStart(key).getTime() + 86400000);

/* ---------- تنبيه حالة الاتصال وتثبيت PWA ---------- */
const updateOnlineBar = () => { const b = $('#offBar'); if (b) b.style.display = navigator.onLine ? 'none' : 'block'; };
window.addEventListener('online', updateOnlineBar);
window.addEventListener('offline', updateOnlineBar);
updateOnlineBar();

let _deferredPwaPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOSDevice = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
function refreshPwaButtons() {
  document.querySelectorAll('.pwa-btn').forEach(btn => {
    if (isStandalone()) { btn.style.display = 'none'; return; }
    if (_deferredPwaPrompt || isIOSDevice()) btn.style.display = 'inline-flex';
  });
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _deferredPwaPrompt = e; refreshPwaButtons(); });
window.addEventListener('appinstalled', () => { _deferredPwaPrompt = null; refreshPwaButtons(); });
window.__installPWA = async () => {
  if (_deferredPwaPrompt) {
    await _deferredPwaPrompt.prompt();
    const { outcome } = await _deferredPwaPrompt.userChoice;
    if (outcome === 'accepted') _deferredPwaPrompt = null;
    refreshPwaButtons();
  } else if (isIOSDevice()) {
    toast('لتثبيت التطبيق على iPhone/iPad: اضغط زر المشاركة في Safari ثم «إضافة إلى الشاشة الرئيسية»', 'good');
  }
};

/*@@ENGINE-START*/
/* ===== المحرك: الجداول (الخطوة 2) ===== */
const addDays = (key, n) => dayKey(new Date(dayStart(key).getTime() + n * 86400000 + 43200000));
const dow = key => new Date(key + 'T00:00:00Z').getUTCDay(); // 0 = الأحد
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const hm = s => { const p = String(s || '').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); };
const minHM = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const fmtHM = s => { if (!s) return ''; const m = hm(s); let h = Math.floor(m / 60) % 24; const ap = h >= 12 ? 'م' : 'ص'; h = h % 12 || 12; return `${pad(h)}:${pad(m % 60)} ${ap}`; };
const fmtMinsH = m => `${Math.floor(m / 60)} س${m % 60 ? ' و ' + (m % 60) + ' د' : ''}`;
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // يبدأ الأسبوع بالسبت
const MODES = { fixed: 'دوام ثابت', rotation: 'ورديات دورية', flex: 'ساعات مرنة' };
const OT_DEF = { mode: 'hours', baseH: 0, min: 15, step: 15, capH: 0, rateNormal: 1.5, rateRest: 2, rateHoliday: 2 };

function normSched(s) {
  if (!s) return null;
  const o = Object.assign({}, s);
  o.mode = ['fixed', 'rotation', 'flex'].includes(s.mode) ? s.mode : 'fixed';
  o.breakMin = Math.max(0, +s.breakMin || 0);
  o.graceLate = s.graceLate == null ? 10 : Math.max(0, +s.graceLate || 0);
  o.graceEarly = s.graceEarly == null ? 10 : Math.max(0, +s.graceEarly || 0);
  o.graceMode = s.graceMode === 'excess' ? 'excess' : 'forgive';
  o.ot = Object.assign({}, OT_DEF, s.ot || {});
  return o;
}

// الدوام الأساسي ليوم معيّن حسب الجدول (دون عطل أو إجازات). الأوقات بالدقائق من منتصف الليل، وقد تتجاوز 1440 للدوام الليلي
function baseDay(sc, key, off) {
  const none = { work: false, periods: [], flexMin: 0, shiftName: '' };
  if (!sc) return none;
  if (sc.mode === 'fixed') {
    const d = (sc.days || {})[dow(key)]; if (!d || !d.on) return none;
    const periods = (d.p || []).filter(p => p && p.s && p.e).map(p => { const s = hm(p.s); let e = hm(p.e); if (e <= s) e += 1440; return { s, e }; });
    return periods.length ? { work: true, periods, flexMin: 0, shiftName: '' } : none;
  }
  if (sc.mode === 'rotation') {
    const cyc = sc.cycle || []; if (!cyc.length || !sc.anchor) return none;
    const n = cyc.length, idx = (((daysBetween(sc.anchor, key) + (off || 0)) % n) + n) % n;
    const sh = (sc.shifts || []).find(x => x.id === cyc[idx]); if (!sh || !sh.s || !sh.e) return none;
    const s = hm(sh.s); let e = hm(sh.e); if (e <= s) e += 1440;
    return { work: true, periods: [{ s, e }], flexMin: 0, shiftName: sh.name || '' };
  }
  if (sc.mode === 'flex') {
    const d = (sc.days || {})[dow(key)]; if (!d || !d.on || !(d.h > 0)) return none;
    return { work: true, periods: [], flexMin: Math.round(d.h * 60), shiftName: '' };
  }
  return none;
}

function schedSummary(raw) {
  const sc = normSched(raw); if (!sc) return '';
  if (sc.mode === 'rotation') {
    const cyc = sc.cycle || [], n = cyc.length, offs = cyc.filter(x => !x).length;
    const names = (sc.shifts || []).map(x => x.name || '—').join('، ');
    return n ? `دورة ${n} يوم (${n - offs} عمل / ${offs} راحة) · ${names}` : 'لم تُحدد الدورة بعد';
  }
  const on = DAY_ORDER.filter(i => sc.days && sc.days[i] && sc.days[i].on);
  if (!on.length) return 'لا توجد أيام عمل';
  const dn = on.length === 7 ? 'كل الأيام' : on.map(i => DAY_NAMES[i]).join('، ');
  if (sc.mode === 'flex') { const hs = [...new Set(on.map(i => +sc.days[i].h || 0))]; return `${dn} · ` + (hs.length === 1 ? `${hs[0]} ساعات يومياً (مرن)` : 'ساعات متفاوتة (مرن)'); }
  const t = on.map(i => (sc.days[i].p || []).filter(p => p.s && p.e).map(p => `${fmtHM(p.s)} – ${fmtHM(p.e)}`).join(' و '));
  return `${dn} · ` + (new Set(t).size === 1 ? t[0] : 'أوقات متفاوتة');
}

function newSched() {
  const days = {}; for (let i = 0; i < 7; i++) days[i] = { on: i <= 4, p: [{ s: '08:00', e: '16:00' }], h: 8 };
  return { name: '', mode: 'fixed', days, shifts: [], cycle: [], anchor: dayKey(new Date()), breakMin: 0, graceLate: 10, graceEarly: 10, graceMode: 'forgive', ot: Object.assign({}, OT_DEF) };
}
/* ===== نهاية محرك الجداول ===== */
/*@@ENGINE-END*/

