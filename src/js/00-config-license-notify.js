/* =====================================================================
   ضع هنا إعدادات مشروع Firebase الخاص بك (انظر خطوات الإعداد في الصفحة
   التي تظهر عند فتح الملف قبل ضبط الإعدادات)
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyAQIRRnqHTKIqihh4Vu8yI-rCe2WznVGKg",
  authDomain: "hodr-wa-inseraf.firebaseapp.com",
  projectId: "hodr-wa-inseraf",
  storageBucket: "hodr-wa-inseraf.firebasestorage.app",
  messagingSenderId: "539190333489",
  appId: "1:539190333489:web:b1d975e74a6f51ea038510"
};

/* App Check (اختياري): ضع مفتاح reCAPTCHA v3 هنا لتفعيله، ثم فعّل «Enforce» في Firebase Console بعد مراقبة الطلبات.
   تنبيه: أدوات meqat-seed وmeqat-admin-migrate لا تحمل App Check؛ شغّلها قبل التفعيل الإلزامي. */
const APP_CHECK_SITE_KEY = '';
async function initAppCheck(app) {
  if (!APP_CHECK_SITE_KEY) return;
  try {
    const m = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js');
    m.initializeAppCheck(app, { provider: new m.ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  } catch (e) { console.warn('App Check', e); }
}

/* ======= الترخيص: تُضخّعه لوحة التسليم (window.MEQAT_LICENSE) — عند غيابه يعمل النظام الكامل بلا قيود ======= */
const LICENSE = (typeof window !== 'undefined' && window.MEQAT_LICENSE) || null;
// مزامنة الترخيص السحابي عن بُعد (مجاناً، مرة واحدة كل 12 ساعة) لتمديد الاشتراك أو ترقية الباقة دون إرسال ملف جديد
(async function syncRemoteLicense() {
  if (!LICENSE) return;
  try {
    const cached = JSON.parse(localStorage.getItem('meqat_remote_lic') || 'null');
    if (cached && cached.company === LICENSE.company) Object.assign(LICENSE, cached);
    if (!LICENSE.remoteUrl) return;
    const lastCheck = +localStorage.getItem('meqat_remote_lic_ts') || 0;
    if (Date.now() - lastCheck < 43200000) return; // كل 12 ساعة فقط
    const r = await fetch(LICENSE.remoteUrl + (LICENSE.remoteUrl.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    const myLic = (data && data.clients) ? (LICENSE.clientId ? data.clients[LICENSE.clientId] : null) : data;
    if (myLic && typeof myLic === 'object') {
      if (data.latestVersion && !myLic.latestVersion) myLic.latestVersion = data.latestVersion;
      if (data.releaseNotes && !myLic.releaseNotes) myLic.releaseNotes = data.releaseNotes;
      if (data.otaUrl && !myLic.otaUrl) myLic.otaUrl = data.otaUrl;
      Object.assign(LICENSE, myLic);
      localStorage.setItem('meqat_remote_lic', JSON.stringify(myLic));
      localStorage.setItem('meqat_remote_lic_ts', String(Date.now()));
    }
  } catch {}
})();

/* ======= نظام الإشعارات والتنبيهات الصوتية والبصرية (MeqatNotify) ======= */
const MeqatNotify = {
  supported: () => typeof window !== 'undefined' && 'Notification' in window,
  perm: () => (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'denied',
  async requestPerm() {
    if (!this.supported()) { toast('متصفحك لا يدعم إشعارات النظام', 'err'); return 'denied'; }
    try {
      const p = await Notification.requestPermission();
      if (p === 'granted') toast('تم تفعيل الإشعارات والتنبيهات الذكية بنجاح 🔔', 'good');
      else toast('لم يتم منح إذن الإشعارات من المتصفح', 'err');
      return p;
    } catch { return 'denied'; }
  },
  beep(kind = 'info') {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'warn' ? 520 : 740, ctx.currentTime);
      if (kind !== 'warn') osc.frequency.setValueAtTime(980, ctx.currentTime + 0.11);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.33);
    } catch {}
  },
  async send(title, body, tag = 'meqat-alert', kind = 'info') {
    this.beep(kind);
    if (!this.supported() || Notification.permission !== 'granted') return false;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.active) {
          reg.active.postMessage({ type: 'MEQAT_NOTIFY', title, body, tag, url: location.href });
          return true;
        }
      }
      new Notification(title, { body, tag, dir: 'rtl', lang: 'ar' });
      return true;
    } catch { return false; }
  }
};
window.__meqatRequestNotif = async () => {
  await MeqatNotify.requestPerm();
  const btn = document.getElementById('empNotifBtn') || document.getElementById('admNotifBtn');
  if (btn) btn.innerHTML = MeqatNotify.perm() === 'granted' ? '🔔 التنبيهات مفعّلة' : '🔕 تفعيل التنبيهات';
};
window.__checkAndApplyOta = async () => {
  const otaUrl = (LICENSE && (LICENSE.otaUrl || LICENSE.templateUrl)) || localStorage.getItem('meqat_ota_url') || '';
  const targetUrl = otaUrl || await mqPrompt('أدخل رابط القالب الرسمي المنشور لجلب أحدث إصدار (مثال: https://meqat-app.netlify.app/index.html):', 'https://');
  if (!targetUrl || !/^https?:\/\//.test(targetUrl.trim())) return;
  localStorage.setItem('meqat_ota_url', targetUrl.trim());
  toast('جاري جلب أحدث إصدار ودمج إعدادات شركتك تلقائياً…');
  try {
    const r = await fetch(targetUrl.trim() + (targetUrl.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rawTpl = await r.text();
    const patched = patchClientHtmlWithConfig(rawTpl, firebaseConfig, LICENSE);
    const b = new Blob([patched], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'index.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    if (LICENSE && LICENSE.latestVersion) {
      LICENSE.installedVersion = LICENSE.latestVersion;
      try { localStorage.setItem('meqat_remote_lic', JSON.stringify(LICENSE)); } catch {}
    }
    toast('تم تجهيز وتحميل ملف index.html المحدّث ببيانات شركتك! ارفعه على استضافتك لإتمام التحديث ✅', 'good');
  } catch (e) {
    toast('تعذر جلب التحديث عن بُعد: ' + (e.message || 'تحقق من الرابط'), 'err');
  }
};
const licLeft = () => { if (!LICENSE || !LICENSE.expires) return Infinity; return Math.floor((Date.parse(LICENSE.expires + 'T23:59:59') - Date.now()) / 86400000); };
const licExpired = () => !!LICENSE && licLeft() < 0;
const licFeatures = () => (LICENSE && LICENSE.features) || { payroll: true, tasks: true };

const licBadgeHtml = () => {
  if (!LICENSE) return '';
  const d = licLeft();
  if (LICENSE.status === 'demo') return '<span class="badge b-pri" style="font-size:11px">نسخة عرض</span>';
  if (d < 0) return '<span class="badge b-bad" style="font-size:11px">انتهت — للتجديد</span>';
  if (LICENSE.status === 'trial') return `<span class="badge b-warn" style="font-size:11px">تجربة · متبقٍ ${d} يوم</span>`;
  return `<span class="badge b-ok" style="font-size:11px">${esc(LICENSE.planName || 'مفعّلة')} · ${Number.isFinite(d) ? 'متبقٍ ' + d + ' يوم' : 'دائمة'}</span>`;
};

const licBannerHtml = () => {
  let otaHtml = '';
  if (LICENSE && LICENSE.latestVersion && LICENSE.latestVersion !== MEQAT_CORE_VERSION && LICENSE.installedVersion !== LICENSE.latestVersion) {
    otaHtml = `<div class="notice" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-color:var(--ok);background:var(--ok-bg);color:var(--ok)">
      <div><b>🚀 تحديث مركزي جديد متاح (${esc(LICENSE.latestVersion)})</b>${LICENSE.releaseNotes ? ` — ${esc(LICENSE.releaseNotes)}` : ' — يتضمن تحسينات سرعة وأمان وميزات جديدة.'}</div>
      <button class="btn sm ok" type="button" onclick="window.__checkAndApplyOta()">تنزيل النسخة المحدّثة لشركتك</button>
    </div>`;
  }
  if (!LICENSE) return otaHtml;
  const d = licLeft();
  if (d < 0) return otaHtml;
  if (LICENSE.status === 'trial') return otaHtml + `<div class="notice"><b>نسخة تجريبية</b> — متبقٍ ${d} يوم. الاشتراك يفتح كل الميزات ولا يفقدك أي بيانات.</div>`;
  if (LICENSE.status === 'demo') return otaHtml + `<div class="notice"><b>نسخة عرض</b> — للتجربة والعرض فقط، وليست للعمل الفعلي.</div>`;
  return otaHtml;
};

const licGateHtml = () => `<div class="auth-bg"><div style="position:fixed;top:18px;left:18px;z-index:10">${themeBtnHtml()}</div><div class="login"><div class="logo big">${ic('lock', 46)}</div><h1 class="center">${LICENSE && LICENSE.status === 'demo' ? 'انتهت مدة نسخة العرض' : 'انتهت مدة الاستخدام'}</h1><p class="muted center" style="margin:0 0 20px;font-weight:600">بياناتك محفوظة بالكامل ولن تضيع — للتجديد أو الترقية تواصل مع مزوّد الخدمة${LICENSE && LICENSE.support ? `<br><small style="font-weight:700">${esc(LICENSE.support)}</small>` : ''}</p><button class="btn sec" onclick="location.reload()" style="width:100%;margin-top:16px;padding:11px">إعادة المحاولة بعد التجديد</button></div></div>`;

const MAX_ACCURACY = 200;        // أقصى هامش خطأ مقبول لدقة الـ GPS بالمتر
const FORGOT_MS = 14 * 3600e3;   // الحد الأدنى لمهلة نسيان الانصراف (يطابق 50400000 في القواعد). المهلة الفعلية لكل موظف = forgotMsOf(جدوله) ≥ هذا الحد، وتُستخدم نفسها في الجهاز واللوحة والتقارير
const MIN_GAP_MS = 20000;        // أقل فاصل بين عمليتين لنفس الموظف (يطابق 20000 في القواعد)
const TZ_OFFSET_MIN = 120;       // توقيت طرابلس UTC+2 ثابت (بلا توقيت صيفي). غيّره إن استخدمت النظام في بلد آخر

