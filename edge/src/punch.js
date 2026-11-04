// منطق نقطتي النهاية challenge/ticket. نقي: كل الاعتماديات تُحقن (تسهّل الاختبار بلا شبكة).
import { b64uEnc, hex } from './b64.js';
import { verifyIdToken } from './jwt.js';
import { verifyAssertion } from './webauthn.js';
import { S, T, A } from './firestore.js';

export const CHALLENGE_TTL_MS = 60000;
export const TICKET_TTL_MS = 60000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

async function authUser(req, deps) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') || '');
  if (!m) throw new HttpError(401, 'no-token');
  try { return await verifyIdToken(m[1], { projectId: deps.env.FIREBASE_PROJECT_ID, keys: await deps.getKeys(), now: deps.now() }); }
  catch { throw new HttpError(401, 'bad-token'); }
}
const rand = n => crypto.getRandomValues(new Uint8Array(n));

/* POST /v1/punch/challenge  { empId, locId, type } → { challenge, exp } */
export async function handleChallenge(req, body, deps) {
  const u = await authUser(req, deps);
  if (!ID.test(body.empId || '') || !ID.test(body.locId || '') || !['in', 'out'].includes(body.type)) throw new HttpError(400, 'bad-input');
  const challenge = b64uEnc(rand(32)), exp = deps.now() + CHALLENGE_TTL_MS;
  const r = await deps.store.issue(u.sub, { challenge, empId: body.empId, locId: body.locId, type: body.type, exp });
  if (!r.ok) throw new HttpError(429, 'rate-limited');
  return { challenge, exp };
}

/* POST /v1/punch/ticket { challenge, assertion:{clientDataJSON,authenticatorData,signature} } → { ticket, exp } */
export async function handleTicket(req, body, deps) {
  const u = await authUser(req, deps);
  const a = body.assertion || {};
  if (typeof body.challenge !== 'string' || ['clientDataJSON', 'authenticatorData', 'signature'].some(k => typeof a[k] !== 'string' || a[k].length > 4096)) throw new HttpError(400, 'bad-input');
  const ch = await deps.store.take(u.sub, body.challenge, deps.now()); // ذرّي: يُستهلك مرة واحدة حتى لو فشل التحقق لاحقاً
  if (!ch) throw new HttpError(403, 'challenge');
  const emp = await deps.fs.getDoc('employees/' + ch.empId);
  if (!emp || emp.active !== true) throw new HttpError(403, 'employee');
  const mine = (emp.devices && Object.values(emp.devices).includes(u.sub)) || emp.uid === u.sub;
  if (!mine) throw new HttpError(403, 'not-owner');
  if (!emp.bio || !emp.bio.pk) throw new HttpError(403, 'no-bio');
  if (Array.isArray(emp.locs) && emp.locs.length && !emp.locs.includes(ch.locId)) throw new HttpError(403, 'loc-not-allowed');
  const loc = await deps.fs.getDoc('locations/' + ch.locId);
  if (!loc || loc.active === false || !(Array.isArray(loc.methods) && loc.methods.includes('bio'))) throw new HttpError(403, 'location');
  const origins = String(deps.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const v = await verifyAssertion({ pk: emp.bio.pk, a, challenge: ch.challenge, origins });
  if (!v.ok) throw new HttpError(403, 'assertion-' + v.reason);
  const nonce = hex(rand(16)), exp = deps.now() + TICKET_TTL_MS;
  await deps.fs.putDoc('punchTickets/' + u.sub, { nonce: S(nonce), empId: S(ch.empId), locId: S(ch.locId), type: S(ch.type), m: A(['bio']), exp: T(exp), createdAt: T(deps.now()) });
  return { ticket: nonce, exp };
}
