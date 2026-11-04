// التحقق من Firebase ID Token (RS256) بمفاتيح Google العامة. بلا مكتبات.
import { b64uDec, utf8 } from './b64.js';

export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const cache = { keys: null, exp: 0 };

export async function getJwks(fetchFn, now = Date.now()) {
  if (cache.keys && now < cache.exp) return cache.keys;
  const r = await fetchFn(JWKS_URL);
  if (!r.ok) throw new Error('jwks-fetch');
  const j = await r.json();
  const m = /max-age=(\d+)/.exec((r.headers && r.headers.get && r.headers.get('cache-control')) || '');
  cache.keys = j.keys || []; cache.exp = now + Math.min(+(m ? m[1] : 3600), 21600) * 1000;
  return cache.keys;
}
export const resetJwksCache = () => { cache.keys = null; cache.exp = 0; };

export async function verifyIdToken(token, { projectId, keys, now = Date.now() }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('token-format');
  let hdr, pl;
  try { hdr = JSON.parse(new TextDecoder().decode(b64uDec(parts[0]))); pl = JSON.parse(new TextDecoder().decode(b64uDec(parts[1]))); } catch { throw new Error('token-format'); }
  if (hdr.alg !== 'RS256') throw new Error('token-alg');
  const jwk = (keys || []).find(k => k.kid === hdr.kid);
  if (!jwk) throw new Error('token-kid');
  const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uDec(parts[2]), utf8(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('token-sig');
  const s = Math.floor(now / 1000);
  if (pl.aud !== projectId || pl.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('token-aud');
  if (!(pl.exp > s) || !(pl.iat <= s + 60)) throw new Error('token-time');
  if (typeof pl.sub !== 'string' || !pl.sub || pl.sub.length > 128) throw new Error('token-sub');
  return pl;
}
