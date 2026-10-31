function toast(msg, type = '') { const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3500); }
/* ---------- تسجيل الأخطاء الصامتة: يحتفظ بآخر 50 خطأ للتشخيص (window.__meqatErrors) بدل ابتلاعها ---------- */
const ERR_LOG = [];
function logErr(ctx, e) {
  try {
    ERR_LOG.push({ at: Date.now(), ctx, code: (e && e.code) || '', msg: String((e && e.message) || e || '') });
    if (ERR_LOG.length > 50) ERR_LOG.shift();
    console.warn('[meqat]', ctx, e);
  } catch {}
}
window.__meqatErrors = () => ERR_LOG.slice();

/* ---------- نوافذ حوار داخلية بدل prompt/confirm/alert الأصلية (RTL، لمس مريح، تدعم Esc وEnter) ----------
   mqChoice: يعيد فهرس الزر المضغوط أو -1 عند الإغلاق. mqConfirm: true/false. mqPrompt: النص أو null. mqAlert: تنتظر الإغلاق. */
function mqDialog({ message, title = '', buttons, input = null, danger = false }) {
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const ov = document.createElement('div'); ov.className = 'ov mq-dlg';
    const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const btns = buttons.map((b, i) => `<button class="btn ${b.kind || ''}" type="button" data-i="${i}">${esc(b.label)}</button>`).join('');
    ov.innerHTML = `<div class="modal mq-box" role="alertdialog" aria-modal="true" aria-labelledby="mqMsg">${title ? `<div class="mh"><h3>${esc(title)}</h3></div>` : ''}<div class="mb"><div id="mqMsg" class="mq-msg">${esc(message)}</div>${input ? `<input class="mq-in" id="mqIn" value="${esc(input.value || '')}" ${input.type ? `type="${esc(input.type)}"` : ''} ${input.dir ? `dir="${esc(input.dir)}"` : ''} autocomplete="off">` : ''}</div><div class="mf">${btns}</div></div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('#mqIn');
    const done = v => { document.removeEventListener('keydown', onKey, true); ov.remove(); document.body.style.overflow = prevOv; try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch {} resolve(v); };
    const pick = i => done(input ? (i === buttons.length - 1 || buttons[i].primary ? { i, v: inp.value } : { i, v: null }) : i);
    function onKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done(input ? { i: -1, v: null } : -1); }
      else if (ev.key === 'Enter' && input && document.activeElement === inp) { ev.preventDefault(); const pi = buttons.findIndex(b => b.primary); pick(pi < 0 ? buttons.length - 1 : pi); }
    }
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) return pick(+b.dataset.i); if (ev.target === ov) done(input ? { i: -1, v: null } : -1); });
    const first = inp || ov.querySelector(danger ? '[data-i="0"]' : '.btn:last-child');
    setTimeout(() => { try { first.focus(); if (inp) inp.select(); } catch {} }, 30);
  });
}
async function mqChoice(message, labels, opts = {}) {
  return mqDialog({ message, title: opts.title || '', buttons: labels.map((l, i) => ({ label: l, kind: i === labels.length - 1 ? '' : 'sec' })) });
}
async function mqConfirm(message, opts = {}) {
  const danger = opts.danger ?? /حذف|نهائي|إزالة|إيقاف|إلغاء الجهاز|إعادة ضبط/.test(String(message));
  const r = await mqDialog({ message: String(message), title: opts.title || '', danger, buttons: [{ label: opts.cancel || 'تراجع', kind: 'sec' }, { label: opts.ok || (danger ? 'نعم، تابع' : 'تأكيد'), kind: danger ? 'bad' : '' }] });
  return r === 1;
}
async function mqPrompt(message, def = '', opts = {}) {
  const r = await mqDialog({ message: String(message), title: opts.title || '', input: { value: def, type: opts.type, dir: opts.dir }, buttons: [{ label: 'إلغاء', kind: 'sec' }, { label: opts.ok || 'موافق', primary: true }] });
  return r && r.i === 1 ? r.v : null;
}
async function mqAlert(message) {
  await mqDialog({ message: String(message), buttons: [{ label: 'حسناً' }] });
}
function getDeviceId() { try { let id = localStorage.getItem('att_dev'); if (!id) { id = randToken(); localStorage.setItem('att_dev', id); } return id; } catch { return 'nodev-' + navigator.userAgent.length; } }

const configured = firebaseConfig.apiKey !== "YOUR_API_KEY" && !!firebaseConfig.apiKey;
const params = new URLSearchParams(location.search);
/* ---------- بيئة التشغيل: متصفح داخلي؟ تطبيق مثبّت؟ ---------- */
const UA = navigator.userAgent || '';
const isIOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(UA);
const standaloneNow = isStandalone(); // الدالة معرّفة أعلاه
// المتصفحات الداخلية (واتساب/فيسبوك/تيليغرام...) لها تخزين معزول يسبب ضياع ربط الجهاز، لذلك لا نربط داخلها
const isInApp = !standaloneNow && (/FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|Telegram|TikTok|musical_ly|Snapchat|Twitter|Line\/|; wv\)/i.test(UA) || (isIOS && !/Safari\//.test(UA)));
let empToken = params.get('e');
const wantAdmin = params.get('admin') === '1';
if (!empToken && standaloneNow && !wantAdmin) { try { empToken = localStorage.getItem('att_emp_tok') || null; } catch {} }
const needActivation = !empToken && standaloneNow && !wantAdmin && (() => { try { return localStorage.getItem('att_admin_hint') !== '1'; } catch { return true; } })();
const root = $('#app');

// ملف manifest ديناميكي يحمل رمز الموظف في start_url فيفتح التطبيق المثبّت على صفحته مباشرة
function setEmpManifest(token) {
  try {
    const base = location.origin + location.pathname;
    const man = { id: base + '?e=' + token, name: 'مِيقَاتْ للحضور والانصراف', short_name: 'ميقات', lang: 'ar', dir: 'rtl',
      start_url: base + '?e=' + token, scope: new URL('./', base).href, display: 'standalone', background_color: '#EAF4EE', theme_color: '#0E6B4D',
      icons: [{ src: new URL('icon.svg', base).href, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: 'application/manifest+json' }));
    let l = document.querySelector('link[rel="manifest"]');
    if (!l) { l = document.createElement('link'); l.rel = 'manifest'; document.head.appendChild(l); }
    l.href = url;
  } catch {}
}

// شاشة «افتح الرابط في المتصفح» بدل الربط داخل متصفح داخلي
function showInAppGuide(token) {
  const link = location.origin + location.pathname + '?e=' + token;
  root.innerHTML = `<div class="emp-bg"><div class="emp-wrap"><div class="card center" style="margin-top:40px;line-height:1.9">
    <h3 style="margin:0 0 10px">افتح الرابط في المتصفح</h3>
    <p style="margin:0 0 10px">أنت تفتح الرابط من داخل تطبيق آخر (واتساب أو فيسبوك أو غيره)، وهذا يسبب مشاكل في ربط جهازك. لم يتم تسجيل أي ربط بعد.</p>
    <p style="margin:0 0 12px;font-weight:700">${isIOS ? 'اضغط زر المشاركة أو ⋯ ثم «فتح في Safari».' : 'اضغط ⋮ ثم «فتح في المتصفح» (Chrome).'}</p>
    <input id="ilk" dir="ltr" readonly value="${esc(link)}" style="width:100%;margin-bottom:10px">
    <button class="btn" id="icp" type="button">نسخ الرابط</button>
    ${isAndroid ? '<button class="btn sec" id="ich" type="button" style="margin-top:8px">فتح في Chrome</button>' : ''}
    <p id="imsg" class="muted" style="font-size:13px;margin:10px 0 0"></p></div></div></div>`;
  $('#icp').onclick = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch {}
    if (!ok) { try { const i = $('#ilk'); i.select(); i.setSelectionRange(0, 999); ok = document.execCommand('copy'); } catch {} }
    $('#imsg').textContent = ok ? 'تم النسخ — الصقه في المتصفح.' : 'اضغط مطولاً على الرابط أعلاه وانسخه.';
  };
  if (isAndroid) {
    const go = () => { location.href = `intent://${location.host}${location.pathname}?e=${token}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(link)};end`; };
    $('#ich').onclick = go;
    try { if (!sessionStorage.getItem('att_intent')) { sessionStorage.setItem('att_intent', '1'); go(); } } catch {}
  }
}

// تطبيق مثبّت بلا رمز موظف محفوظ: نطلب لصق الرابط مرة واحدة
function showActivation() {
  root.innerHTML = `<div class="emp-bg"><div class="emp-wrap"><div class="card center" style="margin-top:40px;line-height:1.9">
    <h3 id="actTitle" style="margin:0 0 10px">تفعيل التطبيق</h3>
    <p style="margin:0 0 12px">الصق رابطك الشخصي الذي أرسلته لك الإدارة (أو الرمز الطويل الذي فيه).</p>
    <input id="actIn" dir="ltr" placeholder="https://..." style="width:100%;margin-bottom:10px">
    <button class="btn" id="actGo" type="button">تفعيل</button>
    </div></div></div>`;
  $('#actGo').onclick = () => {
    const v = $('#actIn').value.trim();
    const m = v.match(/[?&]e=([0-9a-f]{32})/i) || v.match(/^([0-9a-f]{32})$/i);
    if (!m) return toast('الرابط غير صحيح — الصق الرابط كاملاً كما وصلك', 'err');
    location.href = location.pathname + '?e=' + m[1];
  };
  // مدخل المدير مخفي: 5 ضغطات متتالية على العنوان
  let taps = 0;
  $('#actTitle').onclick = () => { if (++taps >= 5) location.href = location.pathname + '?admin=1'; };
}

// التطبيق المثبّت (خصوصاً iPhone) بلا شريط متصفح ولا سحب للتحديث: نوفر زر تحديث وسحباً للتحديث
function enableStandaloneRefresh() {
  if (!standaloneNow || document.getElementById('stRefresh')) return;
  const b = document.createElement('button');
  b.id = 'stRefresh'; b.type = 'button'; b.setAttribute('aria-label', 'تحديث الصفحة'); b.textContent = '↻';
  b.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:10px;z-index:60;width:38px;height:38px;border-radius:50%;border:1px solid #cfe3d8;background:#fff;color:#0E6B4D;font-size:20px;line-height:1;padding:0;box-shadow:0 2px 10px rgba(0,0,0,.15);opacity:.9';
  b.onclick = () => { b.style.transition = 'transform .6s'; b.style.transform = 'rotate(360deg)'; setTimeout(() => location.reload(), 150); };
  document.body.appendChild(b);
  let y0 = null;
  addEventListener('touchstart', e => {
    const bad = e.target && e.target.closest && e.target.closest('input,textarea,select,.modal,[role="dialog"]');
    y0 = (!bad && (window.scrollY || 0) <= 0 && e.touches.length === 1) ? e.touches[0].clientY : null;
  }, { passive: true });
  addEventListener('touchmove', e => { if (y0 !== null && e.touches[0].clientY - y0 > 110) { y0 = null; location.reload(); } }, { passive: true });
}
enableStandaloneRefresh();

// تلميح تثبيت التطبيق على الشاشة الرئيسية
function installHint() {
  try { if (standaloneNow || localStorage.getItem('att_hint_off') === '1' || document.getElementById('instHint')) return; } catch {}
  if (!isIOS && !isAndroid) return;
  setTimeout(() => {
    if (document.getElementById('instHint')) return;
    const d = document.createElement('div'); d.id = 'instHint';
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:50;background:#fff;border:1px solid #cfe3d8;border-radius:14px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.18);font-size:13.5px;line-height:1.8';
    d.innerHTML = `<b>ثبّت التطبيق على هاتفك</b><div class="muted">${isIOS ? 'من Safari: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، ثم افتحه من الأيقونة (سيطلب منك رمز الأجهزة مرة واحدة).' : 'اضغط ⋮ ثم «تثبيت التطبيق».'}</div>
      <div style="margin-top:8px;display:flex;gap:8px">${_deferredPwaPrompt ? '<button class="btn sm" id="ihGo" type="button">تثبيت</button>' : ''}<button class="btn sm sec" id="ihNo" type="button">لاحقاً</button></div>`;
    document.body.appendChild(d);
    const off = () => { try { localStorage.setItem('att_hint_off', '1'); } catch {} d.remove(); };
    $('#ihNo').onclick = off;
    if ($('#ihGo')) $('#ihGo').onclick = async () => { try { await window.__installPWA(); } catch {} off(); };
  }, 1500);
}

/* ---------- الهوية: الاسم والشعار ---------- */
const BRAND = 'مِيقَاتْ';
const logoMark = (s = 30) => `<svg class="mk" width="${s}" height="${s}" viewBox="70 73 372 372" aria-hidden="true"><path d="M256 88C181 88 122 147 122 222c0 96 134 208 134 208s134-112 134-208C390 147 331 88 256 88z" fill="#fff"/><circle cx="256" cy="222" r="78" fill="#0E6B4D"/><path d="M256 170v54l36 22" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="256" cy="224" r="9" fill="#BDE96B"/></svg>`;
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A5139"/><stop offset=".55" stop-color="#0E6B4D"/><stop offset="1" stop-color="#2FB67F"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="url(#a)"/><circle cx="420" cy="92" r="130" fill="#fff" opacity=".08"/><circle cx="70" cy="470" r="110" fill="#fff" opacity=".07"/><ellipse cx="256" cy="440" rx="74" ry="13" fill="#06301F" opacity=".35"/><path d="M256 88C181 88 122 147 122 222c0 96 134 208 134 208s134-112 134-208C390 147 331 88 256 88z" fill="#fff"/><circle cx="256" cy="222" r="78" fill="#0E6B4D"/><path d="M256 170v54l36 22" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="256" cy="224" r="9" fill="#fff"/></svg>`;
function setupIcons() {
  try {
    const uri = 'data:image/svg+xml,' + encodeURIComponent(ICON_SVG);
    const img = new Image();
    img.onload = () => { try {
      const c = document.createElement('canvas'); c.width = c.height = 180;
      c.getContext('2d').drawImage(img, 0, 0, 180, 180);
      const l = document.createElement('link'); l.rel = 'apple-touch-icon'; l.href = c.toDataURL('image/png');
      document.head.appendChild(l);
    } catch {} };
    img.src = uri;
  } catch {}
}
setupIcons();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {}
}

/* ---------- صفحة الإعداد ---------- */
function rulesText(email0) {
  const email = String(email0 || '').trim().toLowerCase().replace(/[^a-z0-9@._+\-]/g, '');
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // المالك المعرّف عند توليد القواعد يبقى super_admin لاستعادة الوصول.
    function isOwnerEmail() {
      return request.auth != null && request.auth.token.get('email', '') == '${email}';
    }
    function uidAdminPath() {
      return /databases/$(database)/documents/admins/$(request.auth.uid);
    }
    function emailAdminPath() {
      return /databases/$(database)/documents/admins/$(request.auth.token.email);
    }
    function currentAdminData() {
      let up = uidAdminPath();
      let ep = emailAdminPath();
      return exists(up) ? get(up).data
        : (request.auth.token.get('email_verified', false) == true && exists(ep) ? get(ep).data : {});
    }
    // لا يُمنح أي دور افتراضيًا لمجرد وجود حساب Firebase؛ الوثيقة المفقودة = رفض.
    // الوثائق القديمة التي لا تحتوي role تُعامل كمدقق للقراءة فقط، لا كمدير عام.
    function roleIs(wanted) {
      let up = uidAdminPath();
      let ep = emailAdminPath();
      return request.auth != null && (
        (isOwnerEmail() && wanted == 'super_admin')
        || (exists(up) && get(up).data.get('role', 'auditor') == wanted)
        || (request.auth.token.get('email_verified', false) == true
            && exists(ep) && get(ep).data.get('role', 'auditor') == wanted)
      );
    }
    function isSuperAdmin() { return roleIs('super_admin'); }
    function isHrAdmin() { return roleIs('hr_admin'); }
    function isPayrollAdmin() { return roleIs('payroll_admin'); }
    function isManager() { return roleIs('manager'); }
    function isAuditor() { return roleIs('auditor'); }
    function isAdmin() {
      return isSuperAdmin() || isHrAdmin() || isPayrollAdmin() || isManager() || isAuditor();
    }
    function managerScope() {
      return currentAdminData().get('deptScope', '');
    }
    function managerCanReadEmployee(empId) {
      return isManager() && managerScope() is string && managerScope() != ''
        && get(/databases/$(database)/documents/employees/$(empId)).data.get('dept', '') == managerScope();
    }
    function globalReadRole() {
      return isSuperAdmin() || isHrAdmin() || isPayrollAdmin() || isAuditor();
    }
    function isOwnerData(d) {
      return request.auth != null
        && (d.get('uid', null) == request.auth.uid
            || (d.get('devices', null) != null && request.auth.uid in d.devices.values()));
    }
    function ownerOnly(empId) {
      return isOwnerData(get(/databases/$(database)/documents/employees/$(empId)).data);
    }
    function validAdminProfile() {
      let d = request.resource.data;
      return d.keys().hasOnly(['name', 'email', 'role', 'deptScope', 'addedAt'])
        && d.keys().hasAll(['name', 'email', 'role'])
        && d.name is string && d.name.size() > 0 && d.name.size() <= 100
        && d.email is string && d.email.size() <= 254
        && d.role in ['super_admin', 'hr_admin', 'payroll_admin', 'manager', 'auditor']
        && (d.role != 'manager' || (d.get('deptScope', '') is string && d.get('deptScope', '').size() > 0 && d.get('deptScope', '').size() <= 100));
    }

    // رمز إضافة جهاز: عشوائي (8 خانات فأكثر)، له انتهاء لا يتجاوز 7 أيام من لحظة الإصدار.
    function validPin() {
      let d = request.resource.data;
      return d.keys().hasOnly(['pin', 'exp', 'createdAt'])
        && d.pin is string && d.pin.size() >= 8 && d.pin.size() <= 32
        && d.exp is timestamp && d.exp > request.time && d.exp <= request.time + duration.value(7, 'd')
        && d.createdAt == request.time;
    }
    function validMaxDev() {
      return request.resource.data.get('maxDevices', 2) in [1, 2, 3];
    }

    // ---- مسيّرات الرواتب المجمّدة ----
    // دورة الحياة: draft (قابل للتعديل) ← approved (المدير العام فقط، يجمّد الأرقام) ← paid (تسجيل الصرف). لا حذف بعد draft.
    function validRunCreate() {
      let d = request.resource.data;
      return d.keys().hasOnly(['from', 'to', 'status', 'createdBy', 'createdAt', 'updatedAt', 'note', 'totals', 'inputs', 'empCount'])
        && d.keys().hasAll(['from', 'to', 'status', 'createdBy', 'createdAt', 'totals', 'empCount'])
        && d.status == 'draft' && d.from is string && d.to is string && d.from.size() == 10 && d.to.size() == 10 && d.from <= d.to
        && d.createdBy.uid == request.auth.uid && d.createdAt == request.time
        && d.empCount is int && d.empCount >= 0;
    }
    function runDraftEdit() {
      return resource.data.status == 'draft' && request.resource.data.status == 'draft'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['totals', 'inputs', 'empCount', 'note', 'updatedAt'])
        && request.resource.data.get('updatedAt', request.time) == request.time;
    }
    function runApprove() {
      let n = request.resource.data;
      return resource.data.status == 'draft' && n.status == 'approved'
        && n.diff(resource.data).affectedKeys().hasOnly(['status', 'approvedBy', 'approvedAt', 'rowsHash', 'rowsCount'])
        && n.approvedBy.uid == request.auth.uid && n.approvedAt == request.time
        && n.rowsHash is string && n.rowsHash.size() == 64 && n.rowsCount is int && n.rowsCount == n.empCount;
    }
    function runPay() {
      let n = request.resource.data;
      return resource.data.status == 'approved' && n.status == 'paid'
        && n.diff(resource.data).affectedKeys().hasOnly(['status', 'paidBy', 'paidAt', 'payNote'])
        && n.paidBy.uid == request.auth.uid && n.paidAt == request.time;
    }
    function runStatus(rid) {
      return get(/databases/$(database)/documents/payrollRuns/$(rid)).data.status;
    }

    // ---- دفتر حركات السلف: قيود إضافة فقط (لا تعديل ولا حذف). التصحيح بقيد adjust مسبَّب. ----
    // معرّفات القيود تمنع التكرار: opening وgrant_<طلب> وinst_<مسيّر> (create-only، فأي محاولة ثانية تُرفض).
    function validLedger(empId, lid) {
      let d = request.resource.data;
      return d.keys().hasOnly(['type', 'delta', 'balanceAfter', 'note', 'reqId', 'runId', 'by', 'at'])
        && d.keys().hasAll(['type', 'delta', 'balanceAfter', 'by', 'at'])
        && d.type in ['opening', 'grant', 'installment', 'adjust']
        && d.delta is number && d.balanceAfter is number && d.balanceAfter >= 0
        && d.by.uid == request.auth.uid && d.at == request.time
        && (d.type != 'opening' || (lid == 'opening' && d.delta > 0 && d.delta == d.balanceAfter))
        && (d.type != 'grant' || (d.delta > 0 && d.reqId is string && lid == 'grant_' + d.reqId))
        && (d.type != 'installment' || (d.delta < 0 && d.runId is string && lid == 'inst_' + d.runId
              && runStatus(d.runId) in ['approved', 'paid']
              && -d.delta == get(/databases/$(database)/documents/payrollRuns/$(d.runId)/rows/$(empId)).data.dedLoan))
        && (d.type != 'adjust' || (d.delta != 0 && d.note is string && d.note.size() >= 3 && d.note.size() <= 300));
    }

    match /admins/{uid} {
      // المشرف يقرأ ملفه فقط؛ تعداد أو تعديل صلاحيات المشرفين للمدير العام وحده.
      allow get: if isSuperAdmin() || (request.auth != null && (request.auth.uid == uid
        || (request.auth.token.get('email_verified', false) == true && request.auth.token.get('email', '') == uid)));
      allow list: if isSuperAdmin();
      allow create: if isSuperAdmin() && (validAdminProfile()
        || (uid == 'owner' && request.resource.data.keys().hasOnly(['name', 'email', 'addedAt'])
            && request.resource.data.name is string && request.resource.data.email is string));
      allow update: if isSuperAdmin() && uid != 'owner' && validAdminProfile();
      allow delete: if isSuperAdmin() && uid != 'owner';
    }
    // ---- سجل التدقيق الرقابي: إضافة فقط (create-only)، لا يُعدَّل ولا يُحذف ----
    function validAuditLog() {
      let d = request.resource.data;
      return d.keys().hasOnly(['action', 'target', 'detail', 'by', 'at'])
        && d.keys().hasAll(['action', 'target', 'detail', 'by', 'at'])
        && d.action is string && d.action.size() > 0 && d.action.size() <= 60
        && d.target is string && d.target.size() <= 120
        && d.detail is string && d.detail.size() <= 500
        && d.by.uid == request.auth.uid && d.at == request.time;
    }
    match /auditLogs/{id} {
      allow read: if isSuperAdmin() || isAuditor();
      allow create: if (isSuperAdmin() || isHrAdmin() || isPayrollAdmin()) && validAuditLog();
      allow update, delete: if false;
    }
    // ---- ملخصات الأشهر المجمّعة: وثيقة واحدة لكل شهر مغلق توفّر آلاف القراءات إلى قراءة واحدة ----
    function validMonthSummary(mk) {
      let d = request.resource.data;
      return mk.matches('[0-9]{4}-[0-9]{2}')
        && d.keys().hasOnly(['mk', 'tzOff', 'count', 'packed', 'sha256', 'updatedAt', 'by'])
        && d.keys().hasAll(['mk', 'tzOff', 'count', 'packed', 'sha256', 'updatedAt', 'by'])
        && d.mk == mk && d.tzOff is number && d.count is int && d.count >= 0
        && d.packed is string && d.packed.size() <= 900000
        && d.sha256 is string && d.sha256.size() == 64
        && d.by.uid == request.auth.uid && d.updatedAt == request.time;
    }
    match /monthlySummaries/{mk} {
      allow read: if globalReadRole();
      allow create, update: if (isSuperAdmin() || isHrAdmin() || isPayrollAdmin()) && validMonthSummary(mk);
      allow delete: if isSuperAdmin() || isHrAdmin() || isPayrollAdmin();
    }
    match /pins/{id} {
      allow read, delete: if isSuperAdmin() || isHrAdmin();
      allow create, update: if (isSuperAdmin() || isHrAdmin()) && validPin();
    }
    match /payrollRuns/{rid} {
      allow read: if isSuperAdmin() || isPayrollAdmin();
      allow create: if (isSuperAdmin() || isPayrollAdmin()) && validRunCreate();
      allow update: if ((isSuperAdmin() || isPayrollAdmin()) && (runDraftEdit() || runPay()))
        || (isSuperAdmin() && runApprove());
      allow delete: if (isSuperAdmin() || isPayrollAdmin()) && resource.data.status == 'draft';
      match /rows/{empId} {
        allow read: if isSuperAdmin() || isPayrollAdmin();
        allow create, update: if (isSuperAdmin() || isPayrollAdmin()) && runStatus(rid) == 'draft'
          && request.resource.data.empId == empId && request.resource.data.net is number;
        allow delete: if (isSuperAdmin() || isPayrollAdmin()) && runStatus(rid) == 'draft';
      }
    }
    match /locations/{id} {
      allow read: if request.auth != null;
      allow write: if isSuperAdmin() || isHrAdmin();
    }
    match /schedules/{id} {
      allow read: if request.auth != null;
      allow write: if isSuperAdmin() || isHrAdmin();
    }
    match /holidays/{id} {
      allow read: if request.auth != null;
      allow write: if isSuperAdmin() || isHrAdmin();
    }
    match /settings/{id} {
      allow read: if request.auth != null;
      allow create: if isSuperAdmin() || (isHrAdmin()
        && request.resource.data.keys().hasOnly(['orgName', 'tzOffset', 'empNotice', 'leaveTypes', 'schedOverrides', 'cfgVersion', 'updatedAt']));
      allow update: if isSuperAdmin() || (isHrAdmin()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['orgName', 'tzOffset', 'empNotice', 'leaveTypes', 'schedOverrides', 'cfgVersion', 'updatedAt']));
      allow delete: if isSuperAdmin();
    }
    // ---- الخزينة المالية المعزولة لكل موظف: لا يقرؤها إلا المدير العام ومحاسب الرواتب وصاحب العلاقة ----
    function validEmpFinance() {
      let d = request.resource.data;
      return d.keys().hasOnly([
        'payMode','payAmount','allowance','bonus','penalty','adjMonth','loanTotal','loanInst','lyStatutory','familyStatus',
        'nationalId','bankName','iban','taskPrices','updatedAt'
      ]);
    }
    match /empFinance/{empId} {
      allow read: if isSuperAdmin() || isPayrollAdmin() || ownerOnly(empId);
      allow create, update: if (isSuperAdmin() || isPayrollAdmin()) && validEmpFinance();
      allow delete: if isSuperAdmin();
    }
    match /taskTypes/{id} {
      allow read: if request.auth != null;
      allow write: if isSuperAdmin() || isHrAdmin();
    }

    match /employees/{empId} {
      allow get: if isSuperAdmin() || isHrAdmin() || isPayrollAdmin() || isAuditor()
        || managerCanReadEmployee(empId) || ownerOnly(empId) || unclaimed();
      // Firestore Rules are not filters: manager queries must include dept == their deptScope.
      allow list: if globalReadRole() || (isManager() && managerScope() is string
        && managerScope() != '' && resource.data.get('dept', '') == managerScope());
      // الموارد البشرية تنشئ ملف موظف أساسيًا فقط؛ الحقول المالية والمصرفية وهوية الجهاز لا تُكتب عند الإنشاء.
      allow create: if isSuperAdmin() || (isHrAdmin() && validHrCreate());
      allow delete: if isSuperAdmin();
      allow update: if isSuperAdmin()
        || (isHrAdmin() && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'name','phone','dept','jobTitle','contractEnd','docExpiry','bioId','assets','scheduleId','rotOffset',
          'startDate','leaveQuota','empType','locs','active','deviceId','uid','devices','rebindProof','maxDevices'
        ]) && validMaxDev())
        || (isPayrollAdmin() && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'payMode','payAmount','allowance','bonus','penalty','adjMonth','loanTotal','loanInst','lyStatutory','familyStatus',
          'nationalId','bankName','iban','taskPrices','finIsolated'
        ]))
        || claimDevice() || migrateLegacy() || rebindLegacy() || rebindMap() || joinDevice() || punchState();

      function validHrCreate() {
        let d = request.resource.data;
        return d.keys().hasOnly(['name','phone','dept','jobTitle','contractEnd','docExpiry','bioId','assets',
            'scheduleId','rotOffset','startDate','leaveQuota','empType','locs','active','deviceId','createdAt','payMode','payAmount','maxDevices'])
          && d.keys().hasAll(['name','active','empType'])
          && d.name is string && d.name.size() > 0 && d.name.size() <= 100
          && d.active == true && d.empType in ['staff', 'task']
          && d.get('deviceId', null) == null
          && d.get('payMode', 'none') in ['none', 'task'] && d.get('payAmount', 0) == 0
          && validMaxDev()
          && d.get('createdAt', request.time) == request.time;
      }
      function unclaimed() {
        return request.auth != null && request.auth.token.firebase.sign_in_provider == 'anonymous'
          && resource.data.get('uid', null) == null
          && resource.data.get('devices', null) == null && resource.data.active == true;
      }
      function claimDevice() {
        let n = request.resource.data;
        return unclaimed() && (resource.data.get('deviceId', null) == null
            || n.get('rebindProof', null) == resource.data.get('deviceId', null))
          && n.diff(resource.data).affectedKeys().hasOnly(['deviceId', 'devices', 'rebindProof'])
          && n.devices.size() == 1 && n.devices.values().hasOnly([request.auth.uid])
          && n.devices.keys().hasOnly([n.deviceId]);
      }
      function migrateLegacy() {
        let n = request.resource.data;
        return request.auth != null && resource.data.get('devices', null) == null
          && resource.data.get('uid', null) == request.auth.uid
          && n.diff(resource.data).affectedKeys().hasOnly(['devices', 'uid'])
          && n.get('uid', null) == null && n.devices.size() == 1
          && n.devices.values().hasOnly([request.auth.uid]);
      }
      function rebindLegacy() {
        let n = request.resource.data;
        return request.auth != null && resource.data.active == true
          && resource.data.get('devices', null) == null && resource.data.get('uid', null) != null
          && resource.data.get('deviceId', null) != null
          && n.get('rebindProof', null) == resource.data.get('deviceId', null)
          && n.diff(resource.data).affectedKeys().hasOnly(['uid', 'rebindProof']) && n.uid == request.auth.uid;
      }
      function rebindMap() {
        let n = request.resource.data;
        return request.auth != null && resource.data.active == true
          && resource.data.get('devices', null) != null
          && n.diff(resource.data).affectedKeys().hasOnly(['devices'])
          && n.devices.diff(resource.data.devices).affectedKeys().size() == 1
          && n.devices.diff(resource.data.devices).changedKeys().size() == 1
          && n.devices.size() == resource.data.devices.size() && request.auth.uid in n.devices.values();
      }
      function joinDevice() {
        let n = request.resource.data;
        return request.auth != null && resource.data.active == true
          && resource.data.get('devices', null) != null
          && n.diff(resource.data).affectedKeys().hasOnly(['devices', 'lastJoinAt'])
          && (!('lastJoinAt' in n.diff(resource.data).affectedKeys()) || n.lastJoinAt == request.time)
          && n.devices.diff(resource.data.devices).addedKeys().size() == 1
          && n.devices.diff(resource.data.devices).affectedKeys().size() == 1
          && n.devices.size() <= resource.data.get('maxDevices', 2) && request.auth.uid in n.devices.values()
          && exists(/databases/$(database)/documents/employees/$(empId)/joins/$(request.auth.uid));
      }
      function punchState() {
        let a = request.resource.data;
        return ownerOnly(empId) && resource.data.active == true
          && a.diff(resource.data).affectedKeys().hasOnly(['state', 'lastAt', 'lastRecId'])
          && a.state in ['in', 'out'] && a.lastAt == request.time && a.lastRecId is string
          && !exists(/databases/$(database)/documents/employees/$(empId)/records/$(a.lastRecId))
          && existsAfter(/databases/$(database)/documents/employees/$(empId)/records/$(a.lastRecId));
      }
      match /loanLedger/{lid} {
        allow read: if isSuperAdmin() || isPayrollAdmin();
        allow create: if (isSuperAdmin() || isPayrollAdmin()) && validLedger(empId, lid);
        allow update, delete: if false;
      }
      match /joins/{jid} {
        allow read: if isSuperAdmin() || isHrAdmin();
        allow create, update: if validJoin(jid);
        allow delete: if isSuperAdmin() || isHrAdmin();
        function validJoin(jid) {
          let d = request.resource.data;
          let p = get(/databases/$(database)/documents/pins/$(empId)).data;
          return request.auth != null && request.auth.uid == jid
            && d.keys().hasOnly(['pin', 'ua', 'at'])
            && d.pin is string && d.at == request.time
            && d.pin == p.pin
            && p.get('exp', null) != null
            && request.time < p.get('exp', request.time);
        }
      }
      match /records/{recId} {
        allow read: if isSuperAdmin() || isHrAdmin() || isPayrollAdmin() || isAuditor()
          || managerCanReadEmployee(empId) || ownerOnly(empId);
        allow create: if isSuperAdmin() || isHrAdmin() || validRecord();
        allow update, delete: if isSuperAdmin() || isHrAdmin();
        function validRecord() {
          let d = request.resource.data;
          let e = get(/databases/$(database)/documents/employees/$(empId)).data;
          let a = getAfter(/databases/$(database)/documents/employees/$(empId)).data;
          let l = get(/databases/$(database)/documents/locations/$(d.locationId)).data;
          let st = e.get('state', null);
          let last = e.get('lastAt', null);
          // 50400000 = 14 ساعة = FORGOT_MS، وهو الحد الأدنى لمهلة نسيان الانصراف؛ مهلة الجدول (forgotMsOf) لا تقل عنه أبدًا،
          // فالقاعدة لا تمنع ما يسمح به التطبيق. يجب أن يبقى الرقمان متطابقين (يحرسه الاختبار tests/forgot-limit.test.mjs).
          let dx = (d.lng - l.lng) * l.kx;
          let dy = (d.lat - l.lat) * l.ky;
          return request.auth != null
            && d.keys().hasOnly(['type','time','lat','lng','accuracy','distance','locationId','locationName','empName','deviceId'])
            && d.keys().hasAll(['type','time','lat','lng','accuracy','distance','locationId','locationName','empName','deviceId'])
            && d.time == request.time && d.type in ['in', 'out']
            && d.lat is number && d.lng is number
            && d.lat >= -90 && d.lat <= 90 && d.lng >= -180 && d.lng <= 180
            && d.accuracy is number && d.accuracy >= 0 && d.accuracy <= 250
            && d.distance is number && d.locationId is string
            && isOwnerData(e) && e.active == true
            && d.empName == e.name && d.deviceId == e.get('deviceId', null)
            && (!('locs' in e) || e.locs.size() == 0 || d.locationId in e.locs)
            && d.locationName == l.name && l.get('active', true) != false && math.sqrt(dx * dx + dy * dy) <= l.radius + 10
            && a.get('lastRecId', null) == recId && a.get('state', null) == d.type
            && (last == null || request.time.toMillis() - last.toMillis() >= 20000)
            && ((d.type == 'in' && (st == null || st == 'out' || (last != null && request.time.toMillis() - last.toMillis() >= 50400000)))
              || (d.type == 'out' && (st == null || st == 'in')));
        }
      }
      match /requests/{rid} {
        allow read: if isSuperAdmin() || isHrAdmin() || isPayrollAdmin() || isAuditor()
          || managerCanReadEmployee(empId) || ownerOnly(empId);
        allow create: if isSuperAdmin() || isHrAdmin() || validRequest();
        allow update: if isSuperAdmin() || isHrAdmin() || payrollDecision();
        allow delete: if isSuperAdmin() || isHrAdmin()
          || (ownerOnly(empId) && resource.data.status == 'pending');
        function payrollDecision() {
          return isPayrollAdmin() && resource.data.kind in ['loan', 'task']
            && resource.data.status == 'pending' && request.resource.data.status in ['approved', 'rejected']
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
              'status','reviewedAt','reviewedBy','qtyApproved','unitPrice','amount'
            ]);
        }
        function validTaskReq(d, e) {
          let tid = d.get('taskId', '');
          let tt = get(/databases/$(database)/documents/taskTypes/$(tid)).data;
          return e.get('empType', 'staff') == 'task'
            && tid is string && tid.size() > 0 && tid.size() <= 40
            && d.get('taskName', '').size() <= 80
            && d.get('qty', 0) is number && d.get('qty', 0) >= 1 && d.get('qty', 0) <= 500
            && tt.name == d.get('taskName', '')
            && tt.get('active', true) != false;
        }
        function validRequest() {
          let d = request.resource.data;
          let e = get(/databases/$(database)/documents/employees/$(empId)).data;
          return request.auth != null
            && d.keys().hasOnly(['kind','type','typeName','from','to','fixIn','fixOut','note','status','empName','createdAt','taskId','taskName','qty'])
            && d.keys().hasAll(['kind','from','to','status','empName','createdAt'])
            && d.status == 'pending'
            && d.kind in ['leave', 'fix', 'task', 'loan', 'cert']
            && d.createdAt == request.time
            && d.from is string && d.from.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')
            && d.to is string && d.to.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}') && d.from <= d.to
            && d.get('note', '') is string && d.get('note', '').size() <= 300
            && d.get('type', '') is string && d.get('type', '').size() <= 40
            && d.get('typeName', '') is string && d.get('typeName', '').size() <= 60
            && d.get('fixIn', '') is string && d.get('fixIn', '').size() <= 5
            && d.get('fixOut', '') is string && d.get('fixOut', '').size() <= 5
            && isOwnerData(e) && e.active == true && d.empName == e.name
            && (d.kind != 'task' || validTaskReq(d, e));
        }
      }
    }
    // Collection-group access is intentionally limited to global roles; managers read by authorized employee path.
    match /{path=**}/records/{recId} {
      allow read: if globalReadRole();
    }
    match /{path=**}/requests/{rid} {
      allow read: if globalReadRole();
    }
  }
}`;
}
function setupPage() {
  root.innerHTML = `<div class="top"><div class="top-in"><div class="brand"><div class="logo">${logoMark(30)}</div><div><b>${BRAND}</b><small>إعداد أولي</small></div></div><div class="top-act">${themeBtnHtml()}</div></div></div>
  <div class="wrap" style="margin-top:-34px;position:relative;z-index:2"><div class="card">
  <div class="ch"><div class="ch-l"><span class="chi">${ic('check', 24)}</span><h3>إعداد النظام (مرة واحدة فقط)</h3></div></div>
  <p class="muted">النظام يحتاج قاعدة بيانات مجانية لمزامنة الإدارة مع الموظفين. الخطوات كلها مجانية ولا تتطلب بطاقة بنكية.</p>
  <ol>
    <li>ادخل إلى <a href="https://console.firebase.google.com" target="_blank">console.firebase.google.com</a> وأنشئ مشروعاً جديداً (خطة Spark المجانية).</li>
    <li>من <b>Build › Authentication</b>: فعّل <b>Email/Password</b> وأضف مستخدماً (بريدك وكلمة مرور) — هذا حساب الإدارة. ثم من <b>Sign-in method</b> فعّل أيضاً <b>Anonymous</b> — يستخدمه رابط الموظف لهوية آمنة مرتبطة بجهازه.</li>
    <li>من <b>Build › Firestore Database</b> أنشئ قاعدة بيانات (اختر Production mode وأقرب منطقة).</li>
    <li>من تبويب <b>Rules</b> في Firestore الصق القواعد أدناه (الإصدار 2) ثم اضغط Publish. اكتب بريد الإدارة أولاً ليدخل في القواعد.</li>
    <li>من <b>Project settings › Your apps</b> أضف تطبيق ويب <code>&lt;/&gt;</code> وانسخ قيم <code>firebaseConfig</code> إلى أعلى هذا الملف (داخل وسم script) مكان القيم الافتراضية.</li>
    <li>ارفع الملف على استضافة مجانية تدعم HTTPS (مثل <b>Netlify Drop</b> أو <b>GitHub Pages</b> أو <b>Cloudflare Pages</b> أو <b>Firebase Hosting</b>). الـ HTTPS ضروري ليسمح المتصفح بتحديد الموقع.</li>
    <li>في Authentication › Settings › Authorized domains أضف نطاق الاستضافة إن لم يكن مضافاً.</li>
    <li>بعد الدخول للوحة: يمكنك إضافة مشرفين إضافيين من تبويب «الموظفون» (قسم المشرفون) دون تعديل القواعد.</li>
  </ol>
  <p class="hint">القواعد هنا إصدار 2: القراءة مقيّدة بالهوية (الموظف المجهول المرتبط برابطه أو الإدارة) بدل القراءة العامة، وكل تسجيل البصمة يشترط وجود هوية موثقة.</p>
  <div class="field" style="max-width:360px"><label>بريد حساب الإدارة (لتوليد القواعد)</label><input id="admEmail" type="email" dir="ltr" placeholder="admin@example.com"></div>
  <h3 style="margin-top:14px;margin-bottom:10px">قواعد Firestore (الإصدار 2)</h3>
  <pre class="rules" id="rulesBox">${esc(rulesText('admin@example.com'))}</pre>
  <button class="btn" id="copyRules" style="margin-top:10px">${ic('copy', 20)} نسخ القواعد</button>
  </div></div>`;
  $('#admEmail').oninput = e => { $('#rulesBox').textContent = rulesText(e.target.value.trim() || 'admin@example.com'); };
  $('#copyRules').onclick = () => { navigator.clipboard.writeText($('#rulesBox').textContent).then(() => toast('تم النسخ', 'good')); };
}

if (!configured) { setupPage(); }
else {
  const app = initializeApp(firebaseConfig);
  await initAppCheck(app);
  /* كاش Firestore الدائم (IndexedDB) للإدارة والموظف: يوفّر القراءات المتكررة ويسرّع الإقلاع الفوري */
  const initDb = a => { try { return initializeFirestore(a, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); } catch (e) { console.warn(e); return getFirestore(a); } };
  let db;
  if (empToken) db = getFirestore(app);
  else db = initDb(app);
  const auth = getAuth(app);
  if (empToken) {
    if (isInApp) showInAppGuide(empToken);
    else {
      setEmpManifest(empToken);
      // تطبيق Firebase مستقل للموظف: جلسته لا تتصادم مع جلسة المدير في نفس المتصفح
      const eApp = initializeApp(firebaseConfig, 'emp');
      await initAppCheck(eApp);
      employeeApp(initDb(eApp), getAuth(eApp), empToken);
    }
  }
  else if (needActivation) showActivation();
  else { onAuthStateChanged(auth, u => { if (u) { try { localStorage.setItem('att_admin_hint', '1'); } catch {} adminApp(db, auth); } else loginPage(auth); }); }
}

/* =====================================================================
   واجهة الموظف المطوّرة
   ===================================================================== */
