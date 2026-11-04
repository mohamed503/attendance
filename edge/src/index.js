// نقطة دخول Cloudflare Worker + كائن Durable Object للتحديات (تخزين أحادي الاستهلاك + حد معدل لكل مستخدم).
import { handleChallenge, handleTicket, HttpError } from './punch.js';
import { createFirestore } from './firestore.js';
import { getJwks } from './jwt.js';

const RATE_PER_MIN = 12;

export class ChallengeStore {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const { op, challenge, rec, now } = await req.json();
    const st = this.state.storage;
    if (op === 'issue') {
      const win = Math.floor(now / 60000), k = (await st.get('rate')) || { win, n: 0 };
      if (k.win !== win) { k.win = win; k.n = 0; }
      if (++k.n > RATE_PER_MIN) return Response.json({ ok: false });
      await st.put('rate', k); await st.put('ch:' + rec.challenge, rec);
      return Response.json({ ok: true });
    }
    if (op === 'take') {
      const r = await st.get('ch:' + challenge); if (r) await st.delete('ch:' + challenge);
      return Response.json(r && r.exp > now ? r : null);
    }
    return new Response('bad', { status: 400 });
  }
}

const doStore = env => {
  const stub = uid => env.CHALLENGES.get(env.CHALLENGES.idFromName(uid));
  const call = (uid, o) => stub(uid).fetch('https://do/', { method: 'POST', body: JSON.stringify(o) }).then(r => r.json());
  return { issue: (uid, rec) => call(uid, { op: 'issue', rec, now: Date.now() }), take: (uid, challenge, now) => call(uid, { op: 'take', challenge, now }) };
};

const cors = (env, req) => {
  const o = req.headers.get('origin') || '';
  const ok = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).includes(o);
  return { ...(ok ? { 'access-control-allow-origin': o } : {}), 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'POST,OPTIONS', vary: 'origin' };
};

export default {
  async fetch(req, env) {
    const h = cors(env, req), url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...h, 'content-type': 'application/json' } });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    try {
      const body = await req.json().catch(() => ({}));
      const deps = {
        env, now: () => Date.now(), store: doStore(env), getKeys: () => getJwks(fetch),
        fs: createFirestore({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.SA_CLIENT_EMAIL, privateKey: env.SA_PRIVATE_KEY })
      };
      if (url.pathname === '/v1/punch/challenge') return json(await handleChallenge(req, body, deps));
      if (url.pathname === '/v1/punch/ticket') return json(await handleTicket(req, body, deps));
      return json({ error: 'not-found' }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status);
      return json({ error: 'server' }, 500);
    }
  }
};
