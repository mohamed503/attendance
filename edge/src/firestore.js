// عميل Firestore REST بحساب خدمة (OAuth بـ JWT RS256). التخزين المؤقت للرمز داخل الـ isolate.
import { b64uEnc, utf8 } from './b64.js';

const pemToDer = pem => Uint8Array.from(atob(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));

export function createFirestore({ projectId, clientEmail, privateKey, fetchFn = fetch, now = () => Date.now() }) {
  let tok = null, tokExp = 0, keyP = null;
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  async function accessToken() {
    if (tok && now() < tokExp - 60000) return tok;
    keyP = keyP || crypto.subtle.importKey('pkcs8', pemToDer(String(privateKey).replace(/\\n/g, '\n')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const iat = Math.floor(now() / 1000);
    const h = b64uEnc(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const c = b64uEnc(utf8(JSON.stringify({ iss: clientEmail, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })));
    const sig = b64uEnc(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await keyP, utf8(h + '.' + c)));
    const r = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + h + '.' + c + '.' + sig });
    if (!r.ok) throw new Error('oauth-' + r.status);
    const j = await r.json(); tok = j.access_token; tokExp = now() + (+j.expires_in || 3600) * 1000; return tok;
  }
  const fromFs = v => {
    if (v == null) return null;
    if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return +v.integerValue; if ('doubleValue' in v) return v.doubleValue;
    if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
    return null;
  };
  async function getDoc(path) {
    const r = await fetchFn(`${base}/${path}`, { headers: { authorization: 'Bearer ' + await accessToken() } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('fs-get-' + r.status);
    const j = await r.json();
    return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fromFs(v)]));
  }
  /* fields جاهزة بصيغة Firestore (stringValue …)؛ تستبدل المستند كاملاً أو تنشئه */
  async function putDoc(path, fields) {
    const r = await fetchFn(`${base}/${path}`, { method: 'PATCH', headers: { authorization: 'Bearer ' + await accessToken(), 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
    if (!r.ok) throw new Error('fs-put-' + r.status);
  }
  return { getDoc, putDoc };
}
export const S = x => ({ stringValue: String(x) });
export const T = ms => ({ timestampValue: new Date(ms).toISOString() });
export const A = xs => ({ arrayValue: { values: xs.map(S) } });
