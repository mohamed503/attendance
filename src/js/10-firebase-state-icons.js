import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence, collection, collectionGroup, doc, getDoc as _getDoc, getDocs as _getDocs, onSnapshot as _onSnapshot, setDoc as _setDoc, addDoc as _addDoc, updateDoc as _updateDoc, deleteDoc as _deleteDoc, query, where, orderBy, limit, writeBatch, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
/* رقم إصدار الإعدادات (cfgVersion): يُرفع تلقائياً عند أي تعديل إداري على المواقع/الجداول/العطل/الإعدادات/المهام،
   فتعيد صفحات الموظفين والإدارة جلبها مرة واحدة فقط، وإلا تقرؤها من ذاكرة الجهاز (توفير معظم قراءات كل فتح).
   إذا كانت الكتابة على settings/general مباشرة، يُدمج cfgVersion في نفس العملية لتوفير كتابة إضافية. */
const CFG_COLS = ['locations', 'schedules', 'holidays', 'settings', 'taskTypes'];
const isCfgRef = r => { try { return CFG_COLS.includes(String(r.path).split('/')[0]); } catch { return false; } };
const isSetGen = r => { try { return String(r.path) === 'settings/general'; } catch { return false; } };
const bumpCfg = r => { try { return _setDoc(doc(r.firestore, 'settings', 'general'), { cfgVersion: Date.now() }, { merge: true }).catch(() => {}); } catch { return Promise.resolve(); } };
const cfgGuard = (fn, canInline = false) => async (r, ...a) => {
  if (canInline && isSetGen(r) && a[0] && typeof a[0] === 'object') {
    return fn(r, { ...a[0], cfgVersion: Date.now() }, ...a.slice(1));
  }
  const out = await fn(r, ...a);
  if (isCfgRef(r)) await bumpCfg(r);
  return out;
};
const setDoc = cfgGuard(_setDoc, true), addDoc = cfgGuard(_addDoc), updateDoc = cfgGuard(_updateDoc, true), deleteDoc = cfgGuard(_deleteDoc);

/* ---------- عدّاد قراءات Firestore (تقديري) ----------
   يعدّ كل مستند يُقرأ في هذه الجلسة وفي هذا اليوم على هذا الجهاز. اكتب __meqatReads() في الكونسول، أو انظر الشارة بجانب أزرار الأعلى.
   الرقم الرسمي الدقيق دائماً في Firebase › Usage. */
const READS = { session: 0 };
const readsToday = () => { try { return +localStorage.getItem('meqat_reads_' + new Date().toISOString().slice(0, 10)) || 0; } catch { return 0; } };
try { const tk = 'meqat_reads_' + new Date().toISOString().slice(0, 10); Object.keys(localStorage).filter(k => k.startsWith('meqat_reads_') && k !== tk).forEach(k => localStorage.removeItem(k)); } catch {}
const bumpReads = n => {
  READS.session += n;
  try { const k = 'meqat_reads_' + new Date().toISOString().slice(0, 10); localStorage.setItem(k, String(readsToday() + n)); } catch {}
  const el = document.getElementById('readsChip'); if (el) el.textContent = 'قراءات الجلسة: ' + READS.session;
};
window.__meqatReads = () => ({ session: READS.session, todayOnThisDevice: readsToday() });
const getDocs = async q => { const s = await _getDocs(q); bumpReads(Math.max(1, s.size)); return s; };
const getDoc = async r => { const s = await _getDoc(r); bumpReads(1); return s; };
const onSnapshot = (q, ok, err) => _onSnapshot(q, snap => { bumpReads(snap.metadata.fromCache ? 0 : snap.docChanges().length); ok(snap); }, err);

/* ---------- كاش الأشهر المغلقة (IndexedDB) ----------
   سجلات الأشهر المنتهية لا تتغير عملياً، فلا داعي لقراءتها من Firestore في كل مرة يُفتح فيها تقرير أو رواتب. */
const RecCache = (() => {
  let p = null;
  const open = () => p || (p = new Promise((res, rej) => { try { const r = indexedDB.open('meqat_cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('recs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('recs', mode), rq = fn(t.objectStore('recs')); t.oncomplete = () => res(rq && rq.result); t.onerror = t.onabort = () => rej(t.error); }); };
  return {
    get: k => tx('readonly', s => s.get(k)).catch(() => null),
    set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}),
    del: k => tx('readwrite', s => s.delete(k)).catch(() => {}),
    clear: () => tx('readwrite', s => s.clear()).catch(() => {})
  };
})();
const tsSer = o => { const r = {}; for (const k in o) { const v = o[k]; r[k] = v && typeof v.toMillis === 'function' ? { __ts: v.toMillis() } : v; } return r; };
const tsDe = o => { const r = {}; for (const k in o) { const v = o[k]; r[k] = v && typeof v === 'object' && v.__ts != null ? Timestamp.fromMillis(v.__ts) : v; } return r; };

/* ---------- نظام الوضع الليلي / النهاري ---------- */
function initTheme() {
  try {
    const saved = localStorage.getItem('meqat_theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch {}
}
initTheme();
window.__toggleTheme = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('meqat_theme', next); } catch {}
  document.querySelectorAll('.theme-toggle-btn').forEach(b => {
    b.innerHTML = ic(next === 'dark' ? 'sun' : 'moon', 22);
    b.title = next === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي';
  });
};
const isDarkTheme = () => document.documentElement.getAttribute('data-theme') === 'dark';
const themeBtnHtml = (cls = 'ib') => `<button class="${cls} theme-toggle-btn" onclick="window.__toggleTheme()" title="${isDarkTheme() ? 'الوضع النهاري' : 'الوضع الليلي'}">${ic(isDarkTheme() ? 'sun' : 'moon', 22)}</button>`;

/* ---------- الأيقونات الاحترافية المسطحة الملونة (Flat Multicolor Duotone Icons) ---------- */
const I2 = {
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 today:'<rect x="4" y="5.5" width="16" height="14.5" rx="3.5"/><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5M9.5 15l2 2 3.5-3.5"/>',
 users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.7.6 2.7 2.2 3 4.7"/>',
 pin:'<path d="M12 21s6.5-5.8 6.5-11a6.5 6.5 0 0 0-13 0C5.5 15.200 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>',
 report:'<path d="M5 20V10M10.5 20V5M16 20v-7M21 20H3"/>',
 payroll:'<rect x="3.5" y="6" width="17" height="12" rx="3"/><circle cx="12" cy="12" r="2.6"/><path d="M7 12h.01M17 12h.01"/>',
 print:'<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/>',
 refresh:'<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4"/>',
 logout:'<path d="M10 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H10M15 8l4 4-4 4M19 12H9"/>',
 login:'<path d="M14 4.5h3.5A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5H14M9 8l-4 4 4 4M5 12h10"/>',
 link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
 send:'<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>',
 device:'<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
 power:'<path d="M12 3.5v8M7.2 6.8a7.5 7.5 0 1 0 9.6 0"/>',
 trash:'<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 download:'<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
 target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
 filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 alert:'<path d="M12 4 3.5 19h17z"/><path d="M12 10v4.2M12 17h.01"/>',
 map:'<path d="M9 5 3.5 7v12L9 17l6 2 5.5-2V5L15 7z"/><path d="M9 5v12M15 7v12"/>',
 sched:'<rect x="4" y="5.5" width="16" height="14.5" rx="3.5"/><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5M8 14h2M14 14h2"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
 moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
 task:'<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4h6v2.500H9zM8.500 12l1.800 1.800 3.200-3.200M8.500 17h7"/>',
 lock:'<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 15v2"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'
};
const ic = (n, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I2[n] || I2.clock}</svg>`;
function rtify(root) {
  root.querySelectorAll('.tw > table:not(.rt)').forEach(tb => {
    const ths = [...tb.querySelectorAll('thead th')].map(h => h.textContent.trim()); if (!ths.length) return;
    tb.classList.add('rt'); if (ths.length > 5) tb.classList.add('rt-wide');
    tb.querySelectorAll('tr').forEach(tr => {
      if (tr.parentElement.tagName === 'THEAD') return;
      let col = 0; [...tr.children].forEach(td => {
        if (td.colSpan <= 1 && !td.hasAttribute('data-l')) {
          td.setAttribute('data-l', ths[col] || '');
          const f = td.firstChild;
          if (td.childNodes.length > 1 || (f && f.nodeType === 3 && f.textContent.trim())) { const w = document.createElement('span'); w.className = 'v'; while (td.firstChild) w.appendChild(td.firstChild); td.appendChild(w); }
        }
        col += td.colSpan || 1;
      });
    });
  });
}
let _rtq = 0; new MutationObserver(() => { if (_rtq) return; _rtq = requestAnimationFrame(() => { _rtq = 0; rtify(document); }); }).observe(document.documentElement, { childList: true, subtree: true });

