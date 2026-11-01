import { firestoreStore, sha256Hex, safeEqual } from './firestore.js';
import { readBody, mapGeneric, parseTime, parseType, parseBodyText } from './normalize.js';
import { processEvents } from './pipeline.js';
import { handshake, parseAttlog, text } from './adms.js';

export { parseTime, parseType };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const MAX_EVENTS = 500;
const devCache = new Map();           // id|sn ⟵ {v, exp}
const PROTOCOLS = ['meqat-json-v1', 'generic', 'zkteco-adms'];

/* توافق مع الاختبارات القديمة: تطبيع حدث JSON الموحّد */
export function normalizeEvent(input, deviceId, now = Date.now()) {
  if (!input || typeof input !== 'object') throw new Error('invalid_event');
  const code = String(input.employeeCode ?? input.userId ?? input.pin ?? '').trim();
  if (!code || code.length > 80) throw new Error('invalid_employee_code');
  const ms = parseTime(input.eventTime ?? input.timestamp ?? input.time, 0);
  if (ms == null || ms > now + 5 * 60_000) throw new Error('invalid_event_time');
  const type = parseType(input.eventType ?? input.type);
  if (!type) throw new Error('invalid_event_type');
  return { deviceId, employeeCode: code, ms, type };
}

async function loadDevice(store, key, bySn) {
  const hit = devCache.get(key); if (hit && hit.exp > Date.now()) return hit.v;
  const v = bySn ? await store.findDeviceBySn(key) : await store.getDevice(key).then(d => d && { id: key, ...d });
  devCache.set(key, { v, exp: Date.now() + (v ? 300_000 : 60_000) });
  return v;
}
const usable = d => d && d.active !== false && PROTOCOLS.includes(d.protocol);
async function checkToken(device, token) {
  return !!(token && device.tokenHash && safeEqual(await sha256Hex(token), device.tokenHash));
}
async function finish(store, device, now, summary) {
  try {
    if (summary.received > 0 || !device.lastSeenAt || now - device.lastSeenAt > 600_000) {
      await store.touchDevice(device.id, { lastSeenAt: new Date(now), lastResult: `received=${summary.received} stored=${summary.stored} duplicate=${summary.duplicate} pending=${summary.pending}` });
      devCache.set(device.protocol === 'zkteco-adms' ? device.sn : device.id, { v: { ...device, lastSeenAt: now }, exp: Date.now() + 300_000 });
    }
  } catch { /* لا نفشل الاستقبال بسبب تحديث الحالة */ }
}

async function pushJson(store, device, request, now) {
  let body; try { body = await readBody(request); } catch (e) { return e.status === 413 ? json({ error: 'payload_too_large' }, 413) : json({ error: 'invalid_body' }, 400); }
  if (device.protocol === 'meqat-json-v1' && body && body.protocol && body.protocol !== 'meqat-json-v1') return json({ error: 'unsupported_protocol', supported: ['meqat-json-v1'] }, 501);
  const mapping = device.protocol === 'generic' ? (device.mapping || {}) : {};
  const { events, rejected } = mapGeneric(body, mapping, Number(device.tzOffset ?? 0));
  if (events.length + rejected.length > MAX_EVENTS) return json({ error: 'invalid_batch_size', max: MAX_EVENTS }, 400);
  if (!events.length && rejected.length) return json({ error: rejected[0].reason, rejected }, 400);
  const s = await processEvents(store, device, device.id, events, now);
  await finish(store, device, now, s);
  return json({ ok: true, ...s, rejected });
}

async function admsRoute(store, request, url, now, pathToken, env) {
  const sn = (url.searchParams.get('SN') || url.searchParams.get('sn') || '').trim();
  const path = url.pathname.replace(/^\/t\/[^/]+/, '');
  if (!sn || sn.length > 64) return text('ERROR: SN', 400);
  const device = await loadDevice(store, sn, true);
  if (!usable(device) || device.protocol !== 'zkteco-adms') return text('ERROR: unregistered', 403);
  if (device.requireToken && !await checkToken(device, pathToken)) return text('ERROR: auth', 403);
  if (path === '/iclock/cdata' && request.method === 'GET') { await finish(store, device, now, { received: 0 }); return handshake(sn); }
  if (path === '/iclock/cdata' && request.method === 'POST') {
    const table = (url.searchParams.get('table') || '').toUpperCase();
    const buf = await request.arrayBuffer(); if (buf.byteLength > 2_000_000) return text('ERROR: size', 413);
    if (table !== 'ATTLOG') { await finish(store, device, now, { received: 0 }); return text('OK'); }
    const { events, rejected } = parseAttlog(new TextDecoder().decode(buf), Number(device.tzOffset ?? 0));
    if (events.length > MAX_EVENTS * 4) return text('ERROR: batch', 413);
    const s = await processEvents(store, device, device.id, events, now);
    if (s.error) return text('ERROR: store', 500);                 // يعيد الجهاز المحاولة؛ الكتابة حتمية فلا تتكرر
    await finish(store, device, now, s);
    return text(`OK:${events.length + rejected.length}`);
  }
  if (path === '/iclock/getrequest' || path === '/iclock/ping' || path === '/iclock/devicecmd' || path === '/iclock/registry') { await finish(store, device, now, { received: 0 }); return text('OK'); }
  return text('ERROR: route', 404);
}

export async function handle(request, env, store = firestoreStore(env), now = Date.now()) {
  const url = new URL(request.url), p = url.pathname;
  if (request.method === 'GET' && p === '/health') return json({ ok: true, service: 'meqat-biometric-ingest', version: 2, protocols: PROTOCOLS });
  try {
    const t = /^\/t\/([^/]+)(\/iclock\/.*)$/.exec(p);
    if (/^\/iclock\//.test(p) || t) return await admsRoute(store, request, url, now, t ? t[1] : '', env);
    if (request.method !== 'POST') return json({ error: 'not_found' }, 404);
    let device = null;
    const hook = /^\/v1\/hook\/([^/]+)\/([^/]+)$/.exec(p);
    if (hook) { device = await loadDevice(store, hook[1], false); if (!usable(device) || device.protocol === 'zkteco-adms' || !await checkToken(device, hook[2])) return json({ error: 'unauthorized' }, 401); }
    else if (p === '/v1/punch') {
      const id = request.headers.get('x-meqat-device') || '', auth = request.headers.get('authorization') || '';
      device = id ? await loadDevice(store, id, false) : null;
      if (!usable(device) || device.protocol === 'zkteco-adms' || !await checkToken(device, auth.startsWith('Bearer ') ? auth.slice(7) : '')) return json({ error: 'unauthorized' }, 401);
    } else return json({ error: 'not_found' }, 404);
    return await pushJson(store, device, request, now);
  } catch (error) {
    console.error('biometric_ingest_failed', String(error && error.message || error).slice(0, 120));
    return json({ error: 'ingest_failed', retryable: true }, 503);
  }
}
export default { fetch: (request, env) => handle(request, env) };
