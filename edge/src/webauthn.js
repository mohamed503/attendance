// التحقق الخادمي من توقيع WebAuthn (navigator.credentials.get) بمفتاح الموظف المسجَّل.
import { b64uDec, b64uEnc, utf8 } from './b64.js';

export function derToRaw(sig) {
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
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* a = { clientDataJSON, authenticatorData, signature } (base64url). يعيد { ok, reason, origin }. */
export async function verifyAssertion({ pk, a, challenge, origins }) {
  try {
    const cdBytes = b64uDec(a.clientDataJSON), ad = b64uDec(a.authenticatorData), sig = b64uDec(a.signature);
    const cd = JSON.parse(new TextDecoder().decode(cdBytes));
    if (cd.type !== 'webauthn.get') return { ok: false, reason: 'type' };
    if (cd.challenge !== challenge) return { ok: false, reason: 'challenge' };
    if (cd.crossOrigin === true) return { ok: false, reason: 'cross-origin' };
    if (!origins.includes(cd.origin)) return { ok: false, reason: 'origin' };
    if (ad.length < 37) return { ok: false, reason: 'authdata' };
    if (!(ad[32] & 1) || !(ad[32] & 4)) return { ok: false, reason: 'flags' }; // حضور المستخدم + التحقق البيومتري
    const rp = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(new URL(cd.origin).hostname)));
    if (!eq(ad.slice(0, 32), rp)) return { ok: false, reason: 'rpid' };
    const cdh = new Uint8Array(await crypto.subtle.digest('SHA-256', cdBytes));
    const data = new Uint8Array(ad.length + 32); data.set(ad); data.set(cdh, ad.length);
    const key = await crypto.subtle.importKey('spki', b64uDec(pk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig), data);
    return ok ? { ok: true, origin: cd.origin } : { ok: false, reason: 'signature' };
  } catch (e) { return { ok: false, reason: 'malformed' }; }
}
export { b64uEnc };
