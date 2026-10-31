/* Firebase وهمي في الذاكرة لاختبارات المتصفح (e2e). يخدم عناوين gstatic الثلاثة بنفس الملف، والحالة مشتركة عبر window.__MQ.
   يغطي فقط ما يستخدمه index.html: مستندات/مجموعات/استعلامات/لقطات/دفعات/مصادقة. */
const G = window.__MQ || (window.__MQ = { docs: new Map(), listeners: new Set(), user: null, authCbs: new Set(), writes: [] });

export class Timestamp {
  constructor(ms) { this._ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = (ms % 1000) * 1e6; }
  toMillis() { return this._ms; } toDate() { return new Date(this._ms); }
  static fromMillis(ms) { return new Timestamp(ms); } static fromDate(d) { return new Timestamp(d.getTime()); } static now() { return new Timestamp(Date.now()); }
  isEqual(o) { return o && o._ms === this._ms; }
}
const SERVER_TS = { __server: true };
/* الملف نفسه يُخدم لثلاثة عناوين gstatic فتتكرر الفئة في كل وحدة؛ لذا نتعرّف على الطوابع بالشكل لا بـ instanceof */
const isTs = v => !!v && typeof v === 'object' && typeof v._ms === 'number';
export const serverTimestamp = () => SERVER_TS;

const revive = v => {
  if (v && typeof v === 'object') {
    if (v.$ts !== undefined) return new Timestamp(v.$ts);
    if (Array.isArray(v)) return v.map(revive);
    const o = {}; for (const k in v) o[k] = revive(v[k]); return o;
  } return v;
};
const clone = v => {
  if (isTs(v)) return new Timestamp(v._ms);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = clone(v[k]); return o; }
  return v;
};
const resolveSrv = v => {
  if (v === SERVER_TS || (v && v.__server)) return Timestamp.now();
  if (isTs(v)) return new Timestamp(v._ms);
  if (Array.isArray(v)) return v.map(resolveSrv);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = resolveSrv(v[k]); return o; }
  return v;
};
if (!G.seeded && window.__MOCK_SEED) {
  G.seeded = true;
  const seed = JSON.parse(window.__MOCK_SEED);
  for (const [p, d] of Object.entries(seed.docs || {})) G.docs.set(p, revive(d));
  if (seed.user) G.user = seed.user;
}

const db = { __db: true };
const mkRef = (segs) => {
  const path = segs.join('/'); const id = segs[segs.length - 1];
  return { path, id, firestore: db, segs, get parent() { return segs.length % 2 === 0 ? mkCol(segs.slice(0, -1)) : (segs.length > 1 ? mkDocRef(segs.slice(0, -1)) : null); } };
};
const mkCol = segs => ({ ...mkRef(segs), type: 'collection' });
const mkDocRef = segs => ({ ...mkRef(segs), type: 'document' });
const flat = a => a.flat(Infinity).filter(x => typeof x === 'string' || typeof x === 'number').map(String);
export const collection = (base, ...p) => mkCol([...(base.path ? base.path.split('/') : []), ...flat(p)]);
let autoN = 0;
export const doc = (base, ...p) => {
  const segs = [...(base.path ? base.path.split('/') : []), ...flat(p)];
  if (base.type === 'collection' && p.length === 0) segs.push('auto' + (++autoN) + Math.random().toString(36).slice(2, 7));
  return mkDocRef(segs);
};
export const collectionGroup = (_db, name) => ({ type: 'group', name, path: name, firestore: db });

const getField = (o, f) => f.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const cmpv = v => (isTs(v) ? v._ms : v);
export const where = (field, op, val) => ({ k: 'where', field, op, val });
export const orderBy = (field, dir = 'asc') => ({ k: 'order', field, dir });
export const limit = n => ({ k: 'limit', n });
export const query = (base, ...cons) => ({ ...base, cons: [...(base.cons || []), ...cons] });

function docSnap(path) {
  const data = G.docs.get(path); const segs = path.split('/');
  return { id: segs[segs.length - 1], ref: mkDocRef(segs), exists: () => data !== undefined, data: () => (data === undefined ? undefined : clone(data)) };
}
function runQuery(q) {
  let paths = [];
  const segsLen = q.type === 'collection' ? q.path.split('/').length + 1 : 0;
  for (const p of G.docs.keys()) {
    const s = p.split('/');
    if (q.type === 'group') { if (s.length % 2 === 0 && s[s.length - 2] === q.name) paths.push(p); }
    else if (s.length === segsLen && p.startsWith(q.path + '/')) paths.push(p);
  }
  let docs = paths.map(docSnap);
  for (const c of (q.cons || [])) if (c.k === 'where') {
    docs = docs.filter(d => {
      const v = cmpv(c.field === '__name__' ? d.id : getField(d.data(), c.field)); const t = cmpv(c.val);
      switch (c.op) { case '==': return v === t; case '!=': return v !== t; case '>': return v > t; case '>=': return v >= t; case '<': return v < t; case '<=': return v <= t;
        case 'in': return c.val.includes(v); case 'array-contains': return Array.isArray(v) && v.includes(t); default: return true; }
    });
  }
  const ord = (q.cons || []).filter(c => c.k === 'order');
  if (ord.length) docs.sort((a, b) => { for (const o of ord) { const x = cmpv(getField(a.data(), o.field)), y = cmpv(getField(b.data(), o.field)); if (x === y) continue; return (x > y ? 1 : -1) * (o.dir === 'desc' ? -1 : 1); } return 0; });
  else docs.sort((a, b) => (a.id > b.id ? 1 : -1));
  const lim = (q.cons || []).find(c => c.k === 'limit'); if (lim) docs = docs.slice(0, lim.n);
  return docs;
}
const qSnap = (docs, prev) => {
  const prevIds = new Set((prev || []).map(d => d.ref.path));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: f => docs.forEach(f),
    docChanges: () => docs.filter(d => !prevIds.has(d.ref.path)).map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })) };
};
export const getDoc = async ref => docSnap(ref.path);
export const getDocs = async q => qSnap(runQuery(q));
export const onSnapshot = (q, cb, errCb) => {
  const isDoc = q.type === 'document'; let prev = null;
  const emit = () => { try { if (isDoc) cb(docSnap(q.path)); else { const d = runQuery(q); cb(qSnap(d, prev)); prev = d; } } catch (e) { if (errCb) errCb(e); } };
  const l = () => emit(); G.listeners.add(l); setTimeout(emit, 0);
  return () => G.listeners.delete(l);
};

const notify = () => setTimeout(() => G.listeners.forEach(l => l()), 0);
const applyUpdate = (cur, patch) => {
  const out = clone(cur || {});
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.'); let o = out;
    for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = resolveSrv(v);
  } return out;
};
const wSet = (ref, data, opt) => { G.writes.push(['set', ref.path]); const v = resolveSrv(clone(data)); G.docs.set(ref.path, opt && opt.merge ? applyUpdate(G.docs.get(ref.path), v) : v); };
const wUpd = (ref, data) => { if (!G.docs.has(ref.path)) { const e = new Error('No document to update: ' + ref.path); e.code = 'not-found'; throw e; } G.writes.push(['update', ref.path]); G.docs.set(ref.path, applyUpdate(G.docs.get(ref.path), data)); };
const wDel = ref => { G.writes.push(['delete', ref.path]); G.docs.delete(ref.path); };
export const setDoc = async (ref, data, opt) => { wSet(ref, data, opt); notify(); };
export const updateDoc = async (ref, data) => { wUpd(ref, data); notify(); };
export const deleteDoc = async ref => { wDel(ref); notify(); };
export const addDoc = async (col, data) => { const ref = doc(col); wSet(ref, data); notify(); return ref; };
export const writeBatch = () => { const ops = []; const b = { set: (r, d, o) => (ops.push(() => wSet(r, d, o)), b), update: (r, d) => (ops.push(() => wUpd(r, d)), b), delete: r => (ops.push(() => wDel(r)), b), commit: async () => { ops.forEach(f => f()); notify(); } }; return b; };
export const getFirestore = () => db; export const initializeFirestore = () => db;
export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
export const terminate = async () => {}; export const clearIndexedDbPersistence = async () => {};

/* مصادقة */
const authObj = { get currentUser() { return G.user; } };
const setUser = u => { G.user = u; G.authCbs.forEach(cb => setTimeout(() => cb(G.user), 0)); };
export const getAuth = () => authObj;
export const onAuthStateChanged = (_a, cb) => { G.authCbs.add(cb); setTimeout(() => cb(G.user), 0); return () => G.authCbs.delete(cb); };
export const signInWithEmailAndPassword = async (_a, email, pw) => {
  const acc = (window.__MOCK_ACCOUNTS || {})[email];
  if (!acc || acc.pw !== pw) { const e = new Error('bad creds'); e.code = 'auth/invalid-credential'; throw e; }
  setUser({ uid: acc.uid, email, emailVerified: true, isAnonymous: false }); return { user: G.user };
};
export const createUserWithEmailAndPassword = async (_a, email) => ({ user: { uid: 'new-' + email, email } });
export const signInAnonymously = async () => { setUser({ uid: 'anon-' + Math.random().toString(36).slice(2, 8), isAnonymous: true, emailVerified: false }); return { user: G.user }; };
export const signOut = async () => setUser(null);

/* app */
export const initializeApp = () => ({ __app: true }); export const deleteApp = async () => {};
