/* عميل Firestore REST لـ Worker. كل العمليات مجمّعة (batchGet / batchWrite / runQuery) لأن الخطة المجانية تحدّ الطلب الواحد بـ 50 استدعاءً خارجياً. */
const enc = new TextEncoder();
const b64url = bytes => { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); };
export const sha256Hex = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))), b => b.toString(16).padStart(2, '0')).join('');
export const safeEqual = (a, b) => { const x = enc.encode(String(a)), y = enc.encode(String(b)); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };

export const toValue = v => v === null || v === undefined ? { nullValue: null }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : Array.isArray(v) ? { arrayValue: { values: v.map(toValue) } }
  : typeof v === 'object' ? { mapValue: { fields: toFields(v) } }
  : { stringValue: String(v) };
export const toFields = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)]));
export const fromValue = v => !v ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue
  : 'timestampValue' in v ? Date.parse(v.timestampValue) : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(fromValue) : 'mapValue' in v ? fromFields(v.mapValue.fields || {}) : null;
export const fromFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromValue(v)]));
const leaf = name => name.split('/').pop();

let oauth = { token: '', exp: 0 };
async function accessToken(env, fetchFn) {
  if (oauth.token && oauth.exp > Date.now() + 60_000) return oauth.token;
  const email = env.FIREBASE_CLIENT_EMAIL, pem = String(env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  if (!email || !env.FIREBASE_PROJECT_ID || !pem) throw new Error('firebase_credentials_missing');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))) + '.' + b64url(enc.encode(JSON.stringify({ iss: email, sub: email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/datastore' })));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const r = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(sig) }) });
  if (!r.ok) throw new Error('firebase_oauth_failed');
  const d = await r.json(); oauth = { token: d.access_token, exp: Date.now() + Number(d.expires_in || 3600) * 1000 }; return oauth.token;
}

/* واجهة التخزين (يمكن استبدالها في الاختبارات). كل دالة تعيد بيانات جاهزة بلا تفاصيل REST. */
export function firestoreStore(env, fetchFn = fetch) {
  const root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${root}`;
  const call = async (url, init = {}) => {
    const r = await fetchFn(url, { ...init, headers: { authorization: 'Bearer ' + await accessToken(env, fetchFn), 'content-type': 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('firestore_' + r.status);        // لا نُسرّب نص الخطأ
    return r.json();
  };
  const batchGet = async (col, ids) => {
    const out = new Map(); const uniq = [...new Set(ids)];
    for (let i = 0; i < uniq.length; i += 100) {
      const rows = await call(`${base}:batchGet`, { method: 'POST', body: JSON.stringify({ documents: uniq.slice(i, i + 100).map(id => `${root}/${col}/${id}`) }) });
      for (const x of rows || []) if (x.found) out.set(leaf(x.found.name), fromFields(x.found.fields));
    }
    return out;
  };
  const runQuery = async (parent, sq) => (await call(`${base}${parent ? '/' + parent : ''}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: sq }) }) || []).map(x => x.document).filter(Boolean);
  const batchWrite = async (col, items) => {   // items: [{id, parent?, data}] ⟵ 'created' | 'exists' | 'error'
    const res = [];
    for (let i = 0; i < items.length; i += 300) {
      const chunk = items.slice(i, i + 300);
      const d = await call(`${base}:batchWrite`, { method: 'POST', body: JSON.stringify({ writes: chunk.map(it => ({ update: { name: `${root}/${it.path}`, fields: toFields(it.data) }, currentDocument: { exists: false } })) }) });
      (d && d.status || []).forEach(s => res.push(!s.code ? 'created' : s.code === 6 || s.code === 9 ? 'exists' : 'error'));
    }
    return res;
  };
  return {
    getDevice: async id => (await batchGet('biometricDevices', [id])).get(id) || null,
    findDeviceBySn: async sn => { const d = await runQuery('', { from: [{ collectionId: 'biometricDevices' }], where: { fieldFilter: { field: { fieldPath: 'sn' }, op: 'EQUAL', value: { stringValue: sn } } }, limit: 1 }); return d[0] ? { id: leaf(d[0].name), ...fromFields(d[0].fields) } : null; },
    getMaps: ids => batchGet('biometricMap', ids),
    getEmployees: ids => batchGet('employees', ids),
    findByBioIds: async codes => { const out = []; for (let i = 0; i < codes.length; i += 30) for (const d of await runQuery('', { from: [{ collectionId: 'employees' }], where: { fieldFilter: { field: { fieldPath: 'bioId' }, op: 'IN', value: { arrayValue: { values: codes.slice(i, i + 30).map(c => ({ stringValue: c })) } } } }, limit: 100 })) out.push({ id: leaf(d.name), ...fromFields(d.fields) }); return out; },
    dayTimes: async (empId, fromMs, toMs) => (await runQuery(`employees/${empId}`, { from: [{ collectionId: 'records' }], where: { compositeFilter: { op: 'AND', filters: [{ fieldFilter: { field: { fieldPath: 'time' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: new Date(fromMs).toISOString() } } }, { fieldFilter: { field: { fieldPath: 'time' }, op: 'LESS_THAN', value: { timestampValue: new Date(toMs).toISOString() } } }] } }, limit: 200 })).map(d => Date.parse(d.fields.time.timestampValue)),
    createRecords: items => batchWrite('records', items),
    createPending: items => batchWrite('biometricPending', items),
    touchDevice: async (id, patch) => { const f = Object.keys(patch); await call(`${base}/biometricDevices/${id}?${f.map(k => 'updateMask.fieldPaths=' + k).join('&')}`, { method: 'PATCH', body: JSON.stringify({ fields: toFields(patch) }) }); }
  };
}
