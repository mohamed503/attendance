// base64url بلا اعتماديات (يعمل في Workers وNode).
export const b64uEnc = buf => { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const b64uDec = s => { const t = String(s).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '='.repeat((4 - t.length % 4) % 4)), c => c.charCodeAt(0)); };
export const hex = buf => Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
export const utf8 = s => new TextEncoder().encode(s);
