/*AM-START*/
/* =====================================================================
   طرق إثبات الحضور: GPS + رمز QR متغيّر + بصمة الجهاز (WebAuthn) + استيراد سجلات أجهزة البصمة.
   دوال نقية قدر الإمكان (تُختبر في tests/attendance-methods.test.mjs وتُقتطع من index.html بين AM-START وAM-END).
   ===================================================================== */
const AM_METHODS = ['gps', 'qr', 'bio'];
const AM_LABEL = { gps: 'GPS', qr: 'QR متغيّر', bio: 'بصمة الجهاز' };
/* سياسة الموقع: methods ⊆ [gps,qr,bio] (الافتراضي gps) و mode = all (كل الطرق معاً) | any (أي طريقة تكفي). يطابق قواعد Firestore. */
const locMethods = l => { const m = Array.isArray(l && l.methods) ? AM_METHODS.filter(x => l.methods.includes(x)) : []; return m.length ? m : ['gps']; };
const locMode = l => (l && l.mode === 'any') ? 'any' : 'all';
const methodsText = l => locMethods(l).map(m => AM_LABEL[m]).join(locMode(l) === 'any' ? ' أو ' : ' + ');
/* الخطوات الإضافية المطلوبة من الموظف بعد نتيجة الـ GPS */
function stepsFor(l, gpsPassed) {
  const ms = locMethods(l);
  if (locMode(l) === 'any') {
    if (ms.includes('gps') && gpsPassed) return { ok: true, need: [] };
    const need = ms.includes('qr') ? ['qr'] : ms.includes('bio') ? ['bio'] : [];
    return need.length ? { ok: true, need } : { ok: false, need: [], reason: 'gps' };
  }
  if (ms.includes('gps') && !gpsPassed) return { ok: false, need: [], reason: 'gps' };
  return { ok: true, need: ms.filter(m => m !== 'gps') };
}

/* ---------- رمز QR المتغيّر: sha256(سر الموقع + ':' + رقم نافذة 30 ثانية) ---------- */
const QR_WIN_MS = 30000;
const qrWindow = ms => Math.floor(ms / QR_WIN_MS);
const qrToken = (secret, ms) => sha256Hex(secret + ':' + qrWindow(ms));
const qrPayload = (locId, tok) => 'MQ1.' + locId + '.' + tok;
function parseQrPayload(s) { const m = /^MQ1\.([A-Za-z0-9_-]{1,64})\.([0-9a-f]{64})$/.exec(String(s || '').trim()); return m ? { locId: m[1], tok: m[2] } : null; }
const newQrSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

/* ---------- بصمة الجهاز (WebAuthn / Passkey) ---------- */
const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - String(s).length % 4) % 4)), c => c.charCodeAt(0))
};
const waSupported = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
async function waRegister(empId, empName) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Meqat', id: location.hostname },
    user: { id: new TextEncoder().encode(String(empId)).slice(0, 64), name: String(empName || empId), displayName: String(empName || empId) },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none'
  } });
  const r = cred && cred.response;
  const pk = r && r.getPublicKey ? r.getPublicKey() : null;
  if (!pk || (r.getPublicKeyAlgorithm && r.getPublicKeyAlgorithm() !== -7)) throw new Error('wa-unsupported');
  return { cid: b64u.enc(cred.rawId), pk: b64u.enc(pk) };
}
/* توقيع ASN.1 DER ⟵ r||s (64 بايت) كما تتوقعه WebCrypto */
function derToRaw(sig) {
  let p = 2; if (sig[1] & 0x80) p = 2 + (sig[1] & 0x7f);
  const out = new Uint8Array(64);
  for (let k = 0; k < 2; k++) {
    if (sig[p] !== 0x02) throw new Error('der');
    const len = sig[p + 1]; let v = sig.slice(p + 2, p + 2 + len); p += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new Error('der');
    out.set(v, 32 * k + 32 - v.length);
  }
  return out;
}
/* يتحقق من تحدّي العملية ومن علَمَي «حضور المستخدم + التحقق البيومتري» ومن نطاق الموقع ومن التوقيع بالمفتاح المسجَّل */
async function waVerify(pkB64, resp, chBytes, rpId) {
  const cd = JSON.parse(new TextDecoder().decode(resp.clientDataJSON));
  if (cd.type !== 'webauthn.get' || cd.challenge !== b64u.enc(chBytes)) return false;
  const ad = new Uint8Array(resp.authenticatorData);
  if (!(ad[32] & 1) || !(ad[32] & 4)) return false;
  const rp = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  for (let i = 0; i < 32; i++) if (ad[i] !== rp[i]) return false;
  const cdh = new Uint8Array(await crypto.subtle.digest('SHA-256', resp.clientDataJSON));
  const data = new Uint8Array(ad.length + 32); data.set(ad); data.set(cdh, ad.length);
  const key = await crypto.subtle.importKey('spki', b64u.dec(pkB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(new Uint8Array(resp.signature)), data);
}
/* يطلب بصمة الجهاز ويعيد إثباتاً مضغوطاً (clientData.authData.signature) يُحفظ مع السجل للتدقيق */
async function waAssert(bio, challengeStr) {
  const ch = new TextEncoder().encode(challengeStr);
  const a = await navigator.credentials.get({ publicKey: {
    challenge: ch, rpId: location.hostname,
    allowCredentials: [{ type: 'public-key', id: b64u.dec(bio.cid), transports: ['internal', 'hybrid'] }],
    userVerification: 'required', timeout: 60000
  } });
  const r = a.response;
  if (!await waVerify(bio.pk, r, ch, location.hostname)) throw new Error('wa-bad-sig');
  return b64u.enc(r.clientDataJSON) + '.' + b64u.enc(r.authenticatorData) + '.' + b64u.enc(r.signature);
}

/* ---------- استيراد سجلات أجهزة البصمة (ZKTeco / Hikvision / Suprema / Anviz / Excel / CSV / DAT …) ---------- */
const devDigits = s => String(s ?? '').replace(/[٠-٩]/g, c => c.charCodeAt(0) - 1632).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 1776);
const DEV_AP = '([AaPp][Mm]|ص|م)';
const DEV_YMD = new RegExp('^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})(?:[ T]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?:\\.\\d+)?\\s*' + DEV_AP + '?)?$');
const DEV_DMY = new RegExp('^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})(?:[ T]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*' + DEV_AP + '?)?$');
const DEV_COMPACT = /^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})(\d{2})(\d{2})?$/;
const DEV_TIME = new RegExp('^(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*' + DEV_AP + '?$');
const devHour = (h, ap) => { h = +h; if (ap) { const pm = /^[Pp]|م/.test(ap); if (pm && h < 12) h += 12; else if (!pm && h === 12) h = 0; } return h; };
/* يحلّل خلية تاريخ/وقت إلى {y,m,d,h,mi,s} (الوقت كما هو معروض على الجهاز). order: 'dmy' | 'mdy' للتواريخ ذات الصيغة المبهمة */
function devParseDT(cell, order = 'dmy') {
  let s = devDigits(cell).trim(); if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) {            // رقم تسلسلي من Excel
    const t = new Date(Math.round((+s - 25569) * 86400) * 1000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() };
  }
  let m = DEV_YMD.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3], h: m[4] == null ? 0 : devHour(m[4], m[7]), mi: +(m[5] || 0), s: +(m[6] || 0), hasTime: m[4] != null };
  m = DEV_DMY.exec(s);
  if (m) { const a = +m[1], b = +m[2]; const dm = order === 'mdy' ? { d: b, m: a } : { d: a, m: b }; return { y: +m[3], ...dm, h: m[4] == null ? 0 : devHour(m[4], m[7]), mi: +(m[5] || 0), s: +(m[6] || 0), hasTime: m[4] != null, ambiguous: [a, b] }; }
  m = DEV_COMPACT.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0), hasTime: true };
  return null;
}
const devParseTime = cell => { const m = DEV_TIME.exec(devDigits(cell).trim()); return m ? { h: devHour(m[1], m[4]), mi: +m[2], s: +(m[3] || 0) } : null; };
const devValid = t => t && t.y >= 2000 && t.y <= 2100 && t.m >= 1 && t.m <= 12 && t.d >= 1 && t.d <= 31 && t.h <= 23 && t.mi <= 59 && t.s <= 59;

/* تقسيم سطر نصي إلى خلايا: Tab ثم ; | , ثم المسافات */
function devCells(line) {
  const d = line.includes('\t') ? '\t' : [';', '|', ','].find(c => line.includes(c));
  const cells = d ? line.split(d) : line.trim().split(/\s+/);
  return cells.map(s => devDigits(s).trim().replace(/^"|"$/g, '').trim());
}
const devRowsFromText = text => String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()).map(devCells)
  .map(r => { // ملفات المسافات (ATTLOG): نضمّ التاريخ والوقت المنفصلين في خلية واحدة
    for (let i = 0; i + 1 < r.length; i++) if (devParseDT(r[i]) && !devParseDT(r[i]).hasTime && devParseTime(r[i + 1])) { r.splice(i, 2, r[i] + ' ' + r[i + 1]); break; }
    return r;
  });

/* كشف تلقائي لأعمدة: المعرّف، التاريخ والوقت (أو تاريخ + وقت منفصلان)، الحالة، وترتيب اليوم/الشهر */
function devDetect(rows) {
  const sample = rows.slice(0, 300), ncol = Math.max(0, ...sample.map(r => r.length));
  const col = i => sample.map(r => r[i] ?? '').filter(x => x !== '');
  let best = { i: -1, n: 0 }, dateOnly = { i: -1, n: 0 }, timeOnly = { i: -1, n: 0 };
  for (let i = 0; i < ncol; i++) {
    const v = col(i); if (!v.length) continue;
    const full = v.filter(x => { const t = devParseDT(x); return t && t.hasTime !== false && (t.hasTime || /\d{2}:\d{2}/.test(x) || /^\d{5}/.test(x)); }).length;
    const dOnly = v.filter(x => { const t = devParseDT(x); return t && t.hasTime === false; }).length;
    const tOnly = v.filter(x => devParseTime(x)).length;
    if (full / v.length >= .6 && full > best.n) best = { i, n: full };
    if (dOnly / v.length >= .6 && dOnly > dateOnly.n) dateOnly = { i, n: dOnly };
    if (tOnly / v.length >= .6 && tOnly > timeOnly.n) timeOnly = { i, n: tOnly };
  }
  const d = { dtCol: best.i, dateCol: -1, timeCol: -1, idCol: -1, stCol: -1, order: 'dmy', header: false };
  if (best.i < 0 && dateOnly.i >= 0 && timeOnly.i >= 0) { d.dateCol = dateOnly.i; d.timeCol = timeOnly.i; }
  const used = new Set([d.dtCol, d.dateCol, d.timeCol]);
  // ترتيب اليوم/الشهر من البيانات: أي قيمة أولى > 12 ⟵ يوم أولاً، أي قيمة ثانية > 12 ⟵ شهر أولاً
  const dc = d.dtCol >= 0 ? d.dtCol : d.dateCol;
  if (dc >= 0) for (const r of sample) { const t = devParseDT(r[dc]); if (t && t.ambiguous) { if (t.ambiguous[0] > 12) { d.order = 'dmy'; break; } if (t.ambiguous[1] > 12) { d.order = 'mdy'; break; } } }
  for (let i = 0; i < ncol && d.idCol < 0; i++) {
    if (used.has(i)) continue; const v = col(i);
    if (v.length && v.filter(x => /^[0-9A-Za-z_-]{1,16}$/.test(x)).length / v.length >= .7) d.idCol = i;
  }
  const first = rows[0] || [];
  d.header = dc >= 0 && !devParseDT(first[dc]) && !devParseTime(first[dc]);
  // عمود الحالة: من العنوان إن وُجد، وإلا أول عمود بعد الوقت قيمه ضمن 0..5 وفيه قيمتان مختلفتان على الأقل (نمط ATTLOG)
  if (d.header) { const k = first.findIndex(h => /status|state|inout|in\/out|punch|type|حالة|نوع/i.test(h)); if (k >= 0 && !used.has(k) && k !== d.idCol) d.stCol = k; }
  if (d.stCol < 0 && dc >= 0) {
    for (let i = Math.max(dc, d.timeCol) + 1; i < ncol; i++) {
      if (i === d.idCol) continue; const v = col(i); const set = new Set(v);
      if (v.length && set.size >= 2 && [...set].every(x => /^[0-5]$/.test(x))) { d.stCol = i; break; }
    }
  }
  return d;
}
/* معرّف وثيقة ربط (جهاز + معرّف مستخدم): يطابق mapId في workers/biometric-ingest/src/normalize.js */
const bioMapId = (deviceId, rawId) => `${deviceId}__${devIdKey(rawId).replace(/[^a-z0-9_-]/g, '_')}`.slice(0, 300);
const devType = s => { const x = devDigits(s).trim().toLowerCase(); if (['0', '3', '4', 'i', 'in', 'check-in', 'checkin', 'c/in', 'دخول', 'حضور'].includes(x)) return 'in'; if (['1', '2', '5', 'o', 'out', 'check-out', 'checkout', 'c/out', 'خروج', 'انصراف'].includes(x)) return 'out'; return null; };
const devIdKey = s => { const x = devDigits(s).trim(); return /^\d+$/.test(x) ? String(+x) : x.toLowerCase(); };

/* rows: مصفوفة صفوف من الخلايا. byId: Map(مفتاح موحَّد ⟵ كائن موظف). tzoff: إزاحة توقيت المنشأة بالدقائق. cfg: نتيجة devDetect (أو معدّلة يدوياً) */
function devParse(rows, byId, tzoff, cfg) {
  const raw = [], unmatched = new Map(); let bad = 0, total = 0;
  const startAt = cfg.header ? 1 : 0;
  for (let i = startAt; i < rows.length; i++) {
    const r = rows[i]; total++;
    let t, tm;
    if (cfg.dtCol >= 0) t = devParseDT(r[cfg.dtCol], cfg.order);
    else if (cfg.dateCol >= 0 && cfg.timeCol >= 0) { t = devParseDT(r[cfg.dateCol], cfg.order); tm = devParseTime(r[cfg.timeCol]); if (t && tm) t = { ...t, ...tm }; else t = null; }
    if (!devValid(t) || cfg.idCol < 0 || !r[cfg.idCol]) { bad++; continue; }
    const key = devIdKey(r[cfg.idCol]), emp = byId.get(key);
    if (!emp) { unmatched.set(key, (unmatched.get(key) || 0) + 1); continue; }
    const ms = Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi, t.s) - tzoff * 60000;
    raw.push({ emp, ms, type: cfg.stCol >= 0 ? devType(r[cfg.stCol]) : null });
  }
  return { recs: devBuild(raw, tzoff), unmatched, bad, total };
}
/* ترتيب + حذف التكرار القريب (<60 ثانية) + تحديد حضور/انصراف: من عمود الحالة إن كان فعلاً يميّز النوعين وإلا بالتناوب داخل اليوم */
function devBuild(raw, tzoff) {
  const useSt = (() => { const n = raw.filter(r => r.type).length; if (n < raw.length * .9) return false; const ins = raw.filter(r => r.type === 'in').length; return ins >= raw.length * .1 && ins <= raw.length * .9; })();
  raw.sort((x, y) => x.emp.id.localeCompare(y.emp.id) || x.ms - y.ms);
  const recs = []; let lastE = '', lastMs = 0, dayId = '', n = 0;
  for (const r of raw) {
    if (r.emp.id === lastE && r.ms - lastMs < 60000) continue;
    const dk = r.emp.id + '|' + Math.floor((r.ms + tzoff * 60000) / 86400000);
    if (dk !== dayId) { dayId = dk; n = 0; }
    recs.push({ emp: r.emp, ms: r.ms, type: (useSt && r.type) || (n % 2 === 0 ? 'in' : 'out') });
    n++; lastE = r.emp.id; lastMs = r.ms;
  }
  return recs;
}
/*AM-END*/

/* ---------- كاميرا مسح QR (للموظف) ومولّد QR (لشاشة العرض عند الإدارة) ---------- */
let _jsQR = null, _qrGen = null;
async function loadEsm(urls, pick) {
  for (const u of urls) { try { const m = await import(u); const v = pick(m); if (v) return v; } catch (e) { console.warn('esm load failed:', u, e); } }
  throw new Error('esm-load');
}
const loadJsQR = () => _jsQR || (_jsQR = loadEsm(['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm', 'https://esm.sh/jsqr@1.4.0'], m => m.default || m.jsQR).catch(e => { _jsQR = null; throw e; }));
const loadQrGen = () => _qrGen || (_qrGen = loadEsm(['https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm', 'https://esm.sh/qrcode-generator@1.4.4'], m => m.default || m.qrcode).catch(e => { _qrGen = null; throw e; }));
async function qrSvg(text) {
  const qrcode = await loadQrGen();
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}
/* يفتح الكاميرا الخلفية ويعيد نص أول رمز QR يقرؤه، أو يرفض بـ qr-cancel / qr-nocam */
function scanQrOnce() {
  return new Promise(async (resolve, reject) => {
    let stream = null, stop = false;
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="modal" style="max-width:440px" role="dialog"><div class="mh"><h3>${ic('target', 22)} امسح رمز الحضور</h3><button class="ib dark" id="qrX" aria-label="إغلاق">${ic('x', 18)}</button></div>
      <div class="mb"><video id="qrV" playsinline muted style="width:100%;border-radius:16px;background:#000;aspect-ratio:1/1;object-fit:cover"></video>
      <p class="hint" style="text-align:center">ضع رمز QR المعروض عند مكان العمل داخل الإطار. يتجدد الرمز كل نصف دقيقة، فلا تستخدم صورة قديمة.</p></div></div>`;
    document.body.appendChild(ov);
    const done = (fn, v) => { stop = true; try { stream && stream.getTracks().forEach(t => t.stop()); } catch {} ov.remove(); fn(v); };
    ov.querySelector('#qrX').onclick = () => done(reject, new Error('qr-cancel'));
    const v = ov.querySelector('#qrV');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      v.srcObject = stream; await v.play();
    } catch { return done(reject, new Error('qr-nocam')); }
    let det = null;
    if ('BarcodeDetector' in window) { try { det = new BarcodeDetector({ formats: ['qr_code'] }); } catch { det = null; } }
    let jsqr = null; if (!det) { try { jsqr = await loadJsQR(); } catch { return done(reject, new Error('qr-nocam')); } }
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (stop) return;
      try {
        if (v.readyState >= 2 && v.videoWidth) {
          if (det) { const r = await det.detect(v); if (r && r[0] && r[0].rawValue) return done(resolve, r[0].rawValue); }
          else {
            const w = Math.min(640, v.videoWidth), h = Math.round(w * v.videoHeight / v.videoWidth);
            cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h);
            const r = jsqr(cx.getImageData(0, 0, w, h).data, w, h);
            if (r && r.data) return done(resolve, r.data);
          }
        }
      } catch {}
      setTimeout(tick, 200);
    };
    tick();
  });
}
