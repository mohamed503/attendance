/* تطبيع أحداث أجهزة البصمة: دوال نقية بلا شبكة. تُستعمل من كل المحوّلات (adapters). */
const AR = s => String(s ?? '').replace(/[٠-٩]/g, c => c.charCodeAt(0) - 1632).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 1776);
export const MAX_FUTURE_MS = 5 * 60_000;

/* مفتاح موحّد لمعرّف المستخدم: الأرقام بلا أصفار بادئة، والنص بحروف صغيرة */
export const userKey = s => { const x = AR(s).trim(); return /^\d+$/.test(x) ? String(Number(x)) : x.toLowerCase(); };
/* معرّف الحدث الحتمي: يتوافق مع استيراد الملفات الحالي (bio_{ms}) فلا يتكرر الحدث نفسه بين Push والاستيراد */
export const recordId = ms => `bio_${ms}`;
export const pendingId = (deviceId, key, ms) => `${deviceId}__${key.replace(/[^a-z0-9_-]/g, '_')}__${ms}`.slice(0, 300);
export const mapId = (deviceId, key) => `${deviceId}__${key.replace(/[^a-z0-9_-]/g, '_')}`.slice(0, 300);

const AP = '([AaPp][Mm]|ص|م)';
const RX_ISO = new RegExp('^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})[ T]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?:\\.\\d+)?\\s*' + AP + '?\\s*(Z|[+-]\\d{2}:?\\d{2})?$');
const RX_DMY = new RegExp('^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})[ T]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*' + AP + '?$');
const RX_COMPACT = /^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})(\d{2})(\d{2})?$/;
const hour = (h, ap) => { h = +h; if (ap) { const pm = /^[Pp]|م/.test(ap); if (pm && h < 12) h += 12; else if (!pm && h === 12) h = 0; } return h; };
const valid = (y, m, d, h, mi, s) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59 && s <= 59;

/* يحوّل قيمة وقت إلى مللي ثانية UTC.
   - epoch (ثوانٍ/مللي) وISO بإزاحة صريحة (Z أو +02:00) تُؤخذ كما هي.
   - الوقت «المحلي» بلا إزاحة (أغلب الأجهزة) يُفسَّر بإزاحة الجهاز tzOffsetMin (دقائق شرق UTC)، لا بتوقيت الخادم.
   - order: 'dmy' | 'mdy' للتواريخ ذات الشكل ٢٥/١٠/٢٠٢٦.  يعيد null إن لم يُفهم. */
export function parseTime(raw, tzOffsetMin = 0, order = 'dmy') {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' || /^\d{9,13}(\.\d+)?$/.test(String(raw).trim())) {
    const n = Number(raw); if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e11 ? Math.round(n * 1000) : Math.round(n);      // ثوانٍ أم مللي ثانية
  }
  const s = AR(raw).trim();
  let m = RX_ISO.exec(s);
  if (m) {
    const [y, mo, d, h, mi, sec] = [+m[1], +m[2], +m[3], hour(m[4], m[7]), +m[5], +(m[6] || 0)];
    if (!valid(y, mo, d, h, mi, sec)) return null;
    const utc = Date.UTC(y, mo - 1, d, h, mi, sec);
    if (m[8]) { if (m[8] === 'Z') return utc; const sg = m[8][0] === '-' ? -1 : 1, t = m[8].replace(/\D/g, ''); return utc - sg * (+t.slice(0, 2) * 60 + +t.slice(2, 4)) * 60000; }
    return utc - tzOffsetMin * 60000;
  }
  m = RX_DMY.exec(s);
  if (m) {
    const a = +m[1], b = +m[2], [d, mo] = order === 'mdy' ? [b, a] : [a, b];
    const [h, mi, sec] = [hour(m[4], m[7]), +m[5], +(m[6] || 0)];
    if (!valid(+m[3], mo, d, h, mi, sec)) return null;
    return Date.UTC(+m[3], mo - 1, d, h, mi, sec) - tzOffsetMin * 60000;
  }
  m = RX_COMPACT.exec(s);
  if (m) { const [y, mo, d, h, mi, sec] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)]; return valid(y, mo, d, h, mi, sec) ? Date.UTC(y, mo - 1, d, h, mi, sec) - tzOffsetMin * 60000 : null; }
  return null;
}

const IN = new Set(['in', 'i', 'checkin', 'check-in', 'check_in', 'c/in', 'clockin', 'entry', 'enter', 'حضور', 'دخول', '0', '3', '4']);
const OUT = new Set(['out', 'o', 'checkout', 'check-out', 'check_out', 'c/out', 'clockout', 'exit', 'leave', 'انصراف', 'خروج', '1', '2', '5']);
/* typeMap اختياري من إعداد الجهاز: {"checkIn":"in","checkOut":"out"} ويتقدم على الافتراضي. يعيد 'in' | 'out' | null (غير معروف) */
export function parseType(raw, typeMap) {
  if (raw == null || raw === '') return null;
  const x = AR(raw).trim().toLowerCase();
  if (typeMap && typeof typeMap === 'object') { const k = Object.keys(typeMap).find(k => k.toLowerCase() === x); if (k) return typeMap[k] === 'in' || typeMap[k] === 'out' ? typeMap[k] : null; }
  return IN.has(x) ? 'in' : OUT.has(x) ? 'out' : null;
}

/* قراءة مسار مثل a.b[0].c من كائن */
export function getPath(obj, path) {
  if (!path) return undefined;
  let cur = obj;
  for (const part of String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[part]; }
  return cur;
}

/* XML بسيط ⟵ كائن (يكفي لإشعارات الأجهزة): وسوم متكررة تصبح مصفوفة، السمات تُهمل */
export function parseXml(xml) {
  const tok = /<\s*(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)\s*>|([^<]+)/g;
  const root = {}, stack = [root]; let m;
  const text = [];
  const s = String(xml).replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c ?? '');
  while ((m = tok.exec(s))) {
    if (m[4] !== undefined) { const t = m[4].trim(); if (t) text[stack.length] = t; continue; }
    const name = m[2].replace(/^.*:/, '');
    if (!m[1]) {
      const node = {}; const par = stack[stack.length - 1];
      if (par[name] === undefined) par[name] = node; else if (Array.isArray(par[name])) par[name].push(node); else par[name] = [par[name], node];
      if (m[3]) { text[stack.length + 1] = undefined; } else { stack.push(node); text[stack.length] = undefined; }
    } else {
      const node = stack.pop(), par = stack[stack.length - 1], t = text[stack.length + 1];
      if (t !== undefined && !Object.keys(node).length) {
        for (const k of Object.keys(par)) { if (par[k] === node) par[k] = t; else if (Array.isArray(par[k])) { const i = par[k].indexOf(node); if (i >= 0) par[k][i] = t; } }
      }
      text[stack.length + 1] = undefined;
    }
  }
  return root;
}

/* قراءة جسم الطلب العام: JSON / نموذج / XML / multipart (الأجزاء النصية فقط) / سطور نصية */
export async function readBody(request, maxBytes = 1_000_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw Object.assign(new Error('payload_too_large'), { status: 413 });
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) throw Object.assign(new Error('payload_too_large'), { status: 413 });
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  const u8 = new Uint8Array(buf);
  const text = new TextDecoder(u8[0] === 0xFF && u8[1] === 0xFE ? 'utf-16le' : 'utf-8').decode(u8).replace(/^﻿/, '');
  return parseBodyText(text, ct);
}
export function parseBodyText(text, ct = '') {
  const t = text.trim();
  if (ct.includes('multipart/')) {
    const bm = /boundary="?([^";]+)"?/.exec(ct); if (!bm) throw new Error('bad_multipart');
    const out = [];
    for (const part of text.split('--' + bm[1])) {
      const i = part.indexOf('\r\n\r\n') >= 0 ? part.indexOf('\r\n\r\n') : part.indexOf('\n\n'); if (i < 0) continue;
      const hdr = part.slice(0, i).toLowerCase(), body = part.slice(i).trim();
      if (/image\/|octet-stream/.test(hdr) || !body) continue;
      try { out.push(parseBodyText(body, hdr)); } catch {}
    }
    return out.length === 1 ? out[0] : { parts: out };
  }
  if (!t) return {};
  if (t[0] === '{' || t[0] === '[') return JSON.parse(t);
  if (t[0] === '<') return parseXml(t);
  if (ct.includes('x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(t));
  return { lines: t.split(/\r?\n/).filter(l => l.trim()) };
}

/* تطبيق إعداد التعيين العام على جسم الطلب ⟵ أحداث خام {code, ms, type|null}
   mapping: { recordsPath, idPath, timePath, typePath, typeMap, order, format:'lines', idCol, timeCol, typeCol, delimiter } */
export function mapGeneric(body, mapping = {}, tzOffsetMin = 0) {
  const out = [], rejected = [];
  let items;
  if (mapping.format === 'lines' || (body && Array.isArray(body.lines))) {
    const d = mapping.delimiter === 'tab' ? '\t' : mapping.delimiter || null;
    items = (body.lines || []).map(l => { const c = (d ? l.split(d) : l.includes('\t') ? l.split('\t') : l.includes(',') ? l.split(',') : l.trim().split(/\s+/)).map(x => x.trim().replace(/^"|"$/g, '')); return { id: c[mapping.idCol ?? 0], time: c[mapping.timeCol ?? 1], type: mapping.typeCol == null ? undefined : c[mapping.typeCol] }; });
  } else {
    let arr = mapping.recordsPath ? getPath(body, mapping.recordsPath) : (Array.isArray(body) ? body : Array.isArray(body && body.records) ? body.records : Array.isArray(body && body.parts) ? body.parts : [body]);
    if (arr == null) arr = [];
    if (!Array.isArray(arr)) arr = [arr];
    items = arr.map(r => ({ id: getPath(r, mapping.idPath || 'employeeCode') ?? getPath(r, 'userId') ?? getPath(r, 'pin') ?? getPath(r, 'employeeNoString') ?? getPath(r, 'employeeNo'), time: getPath(r, mapping.timePath || 'eventTime') ?? getPath(r, 'timestamp') ?? getPath(r, 'time') ?? getPath(r, 'dateTime'), type: mapping.typePath === '' ? undefined : (getPath(r, mapping.typePath || 'eventType') ?? getPath(r, 'type') ?? getPath(r, 'attendanceStatus')) }));
  }
  items.forEach((it, i) => {
    const code = String(it.id ?? '').trim(), ms = parseTime(it.time, tzOffsetMin, mapping.order);
    if (!code || code.length > 80) return rejected.push({ index: i, reason: 'invalid_employee_code' });
    if (ms == null) return rejected.push({ index: i, reason: 'invalid_event_time' });
    out.push({ code, ms, type: parseType(it.type, mapping.typeMap) });
  });
  return { events: out, rejected };
}
