function adminApp(db, auth) {
  if (licExpired()) { root.innerHTML = licGateHtml(); return; }
  const S = {
    tab: 'today',
    empSub: 'list',    // list | admins
    schedSub: 'sched', // sched | leaves | settings
    recSub: 'summary', // summary | payroll | raw
    qToday: '', qEmp: '', qRec: '',
    emps: [], locs: [], scheds: [], rulesOld: false, recs: [], today: [],
    idxUrl: '', from: '', to: '', emp: '', hols: [], holKeys: [], set: {}, runs: undefined, runsErr: false,
    reqs: [], leaves: [], reqsErr: false, admins: [], adminsErr: false, taskTypes: [],
    reqsFrom: '', idxUrlReq: '', recsFail: [], todayFail: [],
    auditLogs: undefined, auditErr: false, qAudit: '',
    role: 'unknown', deptScope: ''
  };
  S.from = dayKey(new Date(Date.now() - 6 * 86400000)); S.to = dayKey(new Date());
  const ROLE_CACHE_KEY = 'meqat_adm_role_v1';
  async function resolveAdminRole(force = false) {
    const u = auth.currentUser;
    if (!u) throw new Error('admin-auth-required');
    if (!force) {
      try {
        const rc = JSON.parse(sessionStorage.getItem(ROLE_CACHE_KEY) || 'null');
        if (rc && rc.uid === u.uid && rc.role && rc.role !== 'unknown' && Date.now() - (rc.at || 0) < 1800000) {
          S.role = rc.role; S.deptScope = rc.deptScope || '';
          if (S.role === 'manager' && !S.deptScope) throw new Error('manager-scope-required');
          return;
        }
      } catch {}
    }
    const saveRole = () => { try { sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ uid: u.uid, role: S.role, deptScope: S.deptScope, at: Date.now() })); } catch {} };
    const paths = [...new Set([u.uid, ...(u.emailVerified && u.email ? [u.email.toLowerCase()] : [])])];
    const snaps = await Promise.all(paths.map(key => getDoc(doc(db, 'admins', key)).catch(err => { if (err.code !== 'permission-denied') throw err; return null; })));
    for (const snap of snaps) {
      if (snap && snap.exists()) {
        const d = snap.data();
        const valid = ['super_admin', 'hr_admin', 'payroll_admin', 'manager', 'auditor'];
        S.role = valid.includes(d.role) ? d.role : 'auditor';
        S.deptScope = S.role === 'manager' && typeof d.deptScope === 'string' ? d.deptScope.trim() : '';
        if (S.role === 'manager' && !S.deptScope) throw new Error('manager-scope-required');
        saveRole();
        return;
      }
    }
    let canReadOwnerProfile = false;
    try {
      const owner = await getDoc(doc(db, 'admins', 'owner'));
      canReadOwnerProfile = true;
      if (owner.exists() && String(owner.data().email || '').toLowerCase() === String(u.email || '').toLowerCase()) {
        S.role = 'super_admin'; S.deptScope = ''; saveRole(); return;
      }
    } catch (err) { if (err.code !== 'permission-denied') throw err; }
    // يظل المالك الأول قادرًا على الإعداد لأن قواعده تسمح له بقراءة /admins/owner حتى قبل إنشاء الوثيقة.
    if (canReadOwnerProfile) { S.role = 'super_admin'; S.deptScope = ''; saveRole(); return; }
    S.role = 'unknown'; S.deptScope = '';
  }
  const isSuper = () => S.role === 'super_admin';
  const isHr = () => S.role === 'hr_admin';
  const isPay = () => S.role === 'payroll_admin';
  const isAud = () => S.role === 'auditor';
  // يطابق قيود قواعد Firestore: الموارد البشرية لا تكتب الحقول المالية، والرواتب لا تكتب حقول الموظف/الدوام.
  const HR_EMP_KEYS = new Set(['name','phone','dept','jobTitle','contractEnd','docExpiry','bioId','assets','scheduleId','rotOffset','startDate','leaveQuota','empType','locs','active']);
  const PAY_EMP_KEYS = new Set(['payMode','payAmount','allowance','bonus','penalty','adjMonth','loanTotal','loanInst','lyStatutory','familyStatus','nationalId','bankName','iban','taskPrices','finIsolated']);
  const AUDIT_LABELS = {
    emp_create: ['b-ok', 'إضافة موظف'],
    emp_update: ['b-pri', 'تعديل ملف/راتب موظف'],
    emp_toggle: ['b-warn', 'إيقاف/تفعيل موظف'],
    emp_delete: ['b-bad', 'حذف نهائي لموظف'],
    dev_reset: ['b-warn', 'إعادة ضبط أجهزة'],
    dev_pin: ['b-pri', 'إدارة رمز/جهاز'],
    run_save: ['b-pri', 'حفظ مسودة مسيّر'],
    run_approve: ['b-ok', 'اعتماد وتجميد مسيّر'],
    run_pay: ['b-ok', 'تسجيل صرف مسيّر'],
    run_delete: ['b-bad', 'حذف مسودة مسيّر'],
    req_approve: ['b-ok', 'اعتماد طلب'],
    req_reject: ['b-bad', 'رفض طلب'],
    sched_save: ['b-pri', 'حفظ جدول دوام'],
    settings_update: ['b-warn', 'تعديل إعدادات المنشأة'],
    month_seal: ['b-ok', 'تجميد ملخص شهر (قراءة واحدة)'],
    month_archive: ['b-warn', 'أرشفة وتفريغ بصمات شهر'],
    month_restore: ['b-pri', 'استعادة أرشيف بصمات شهر'],
    fin_isolate: ['b-ok', 'عزل البيانات المالية في الخزينة'],
    sched_override: ['b-pri', 'إدارة استثناء دوام / تبديل وردية']
  };
  function logAudit(action, target, detail) {
    if (!['super_admin', 'hr_admin', 'payroll_admin'].includes(S.role)) return;
    const u = auth.currentUser; if (!u) return;
    const entry = {
      action: String(action || '').slice(0, 60),
      target: String(target || '').slice(0, 120),
      detail: String(detail || '').slice(0, 500),
      by: { uid: u.uid, name: u.email || '' },
      at: serverTimestamp()
    };
    _addDoc(collection(db, 'auditLogs'), entry).then(ref => {
      if (Array.isArray(S.auditLogs)) S.auditLogs.unshift({ id: ref.id, ...entry, at: Timestamp.now() });
    }).catch(e => console.warn('auditLog', e));
  }
  async function loadAuditLogs(force = false) {
    if (!(isSuper() || isAud())) { S.auditLogs = []; S.auditErr = false; return; }
    if (!force && Array.isArray(S.auditLogs)) return;
    try {
      const s = await getDocs(query(collection(db, 'auditLogs'), orderBy('at', 'desc'), limit(80)));
      S.auditLogs = s.docs.map(d => ({ id: d.id, ...d.data() }));
      S.auditErr = false;
    } catch (e) { console.warn(e); S.auditLogs = []; S.auditErr = true; }
  }
  const scopeEmpPatch = p => {
    if (isSuper()) return p;
    const allow = isHr() ? HR_EMP_KEYS : isPay() ? PAY_EMP_KEYS : new Set();
    return Object.fromEntries(Object.entries(p).filter(([k]) => allow.has(k)));
  };
  const isManager = () => S.role === 'manager';
  const base = location.origin + location.pathname;
  const linkOf = id => `${base}?e=${id}`;
  const brandName = () => (S.set && S.set.orgName) ? S.set.orgName : BRAND;
  const ch = (icon, title, rightHtml = '') => `<div class="ch"><div class="ch-l"><span class="chi">${ic(icon, 24)}</span><h3>${title}</h3></div>${rightHtml}</div>`;
  const ST_TXT = { work: 'حضور', open: 'لم ينصرف', forgot: 'نسي الانصراف', absent: 'غياب', leave: 'إجازة', holiday: 'عطلة رسمية', rest: 'راحة' };
  const stText = (s, M) => s.status === 'leave' && s.lv ? `إجازة${s.lv.typeName ? ' · ' + s.lv.typeName : ''}${leavePct(s.lv) < 100 ? ` (${leavePct(s.lv)}%)` : ''}` : M[s.status];
  const findLT = r => { const L = leaveTypesOf(S.set); return L.find(x => x.id === r.type) || L.find(x => x.name === r.typeName) || null; };
  const empCtx = (empId, dayKeyStr = '') => {
    const e = S.emps.find(x => x.id === empId) || {};
    const x = S.scheds.find(s => s.id === e.scheduleId);
    const baseSc = x ? normSched(x) : null, baseRot = e.rotOffset || 0;
    if (dayKeyStr) return resolveDaySched(e, dayKeyStr, S.scheds, S.set && S.set.schedOverrides, baseSc, baseRot);
    return { sc: baseSc, rot: baseRot, override: null };
  };

  /* جلب خام من Firestore. fail: مصفوفة تُملأ بأسماء الموظفين الذين تعذّرت قراءة سجلاتهم، بدل ابتلاع الخطأ بصمت
     (كان الموظف يظهر «غائباً» في التقارير والرواتب دون أي تنبيه). */
  async function fetchRecs(a, b, fail = []) {
    const map = d => ({ id: d.id, empId: d.ref.parent.parent.id, ...d.data(), t: d.data().time?.toDate() });
    const perEmp = async list => {
      const chunks = await Promise.all(list.map(e =>
        getDocs(query(collection(db, 'employees', e.id, 'records'), where('time', '>=', Timestamp.fromDate(a)), where('time', '<', Timestamp.fromDate(b)), orderBy('time')))
          .then(s => s.docs.map(map)).catch(err => { console.warn(err); fail.push(e.name || e.id); return []; })
      ));
      return chunks.flat().filter(x => x.t).sort((x, y) => x.t - y.t);
    };
    if (isManager()) {
      if (!S.deptScope) throw new Error('manager-scope-required');
      return perEmp(S.emp ? S.emps.filter(e => e.id === S.emp) : S.emps.filter(e => e.empType !== 'task'));
    }
    try {
      const s = await getDocs(query(collectionGroup(db, 'records'), where('time', '>=', Timestamp.fromDate(a)), where('time', '<', Timestamp.fromDate(b)), orderBy('time')));
      return s.docs.map(map).filter(x => x.t);
    } catch (err) {
      if (err.code !== 'failed-precondition') throw err;
      S.idxUrl = (String(err.message).match(/https:\/\/\S+/) || [''])[0] || 'https://console.firebase.google.com';
      console.warn(err.message);
      return perEmp(S.emp ? S.emps.filter(e => e.id === S.emp) : S.emps.filter(e => e.empType !== 'task'));
    }
  }
  /* الأشهر المنتهية (مضى على نهايتها أكثر من يومين) تُقرأ مرة واحدة ثم تُخدم من ذاكرة الجهاز.
     الصلاحية: 6 ساعات لأول 10 أيام بعد انتهاء الشهر (فترة التصحيحات والرواتب)، ثم 7 أيام. أي تصحيح/استيراد/حذف من هذه اللوحة يمسح الكاش فوراً،
     وزر «تحديث» يمسحه أيضاً. الشهر الجاري وآخر يومين يُقرآن دائماً من Firestore. */
  const nextMonthKey = mk => { let y = +mk.slice(0, 4), m = +mk.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return y + '-' + String(m).padStart(2, '0'); };
  const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const recScope = () => isManager() ? 'm' + hashStr(S.emps.filter(e => e.empType !== 'task').map(e => e.id).sort().join(',')) : 'all';
  const recSer = r => { const { t, ...rest } = r; return tsSer(rest); };
  const recDe = x => { const r = tsDe(x); r.t = r.time && r.time.toDate ? r.time.toDate() : undefined; return r; };
  async function fetchRecsCached(a, b, fail) {
    if (isManager() && S.emp) return fetchRecs(a, b, fail);
    const out = [], now = Date.now(), DAY = 86400000;
    const todayK = dayKey(new Date(now)), yKey = dayKey(new Date(now - DAY));
    const yStart = dayStart(yKey), tEnd = dayEnd(todayK);
    const canReuseToday = S.todayKey === todayK && (window.__meqatUnsub || window.__meqatPoll) && !S.todayFail.length;
    let cur = a;
    while (cur < b) {
      const mk = dayKey(cur).slice(0, 7), ms = dayStart(mk + '-01'), me = dayStart(nextMonthKey(mk) + '-01'), end = me < b ? me : b;
      if (now - me.getTime() <= 2 * DAY) {
        // تقسيم الفترة القريبة: الأيام السابقة لأمس تُكيش لـ 15 دقيقة، وأمس+اليوم يُستفاد فيهما من S.today دون إعادة القراءة!
        let p = cur;
        if (p < yStart) {
          const preEnd = end < yStart ? end : yStart;
          const cKey = 'curm|' + recScope() + '|' + TZOFF + '|' + dayKey(p) + '|' + dayKey(preEnd);
          let hit = await RecCache.get(cKey);
          if (hit && now - hit.at <= 15 * 60000) {
            out.push(...hit.rows.map(recDe).filter(r => r.t && r.t >= p && r.t < preEnd));
          } else {
            const fPre = [], rowsPre = await fetchRecs(p, preEnd, fPre);
            if (!fPre.length) await RecCache.set(cKey, { at: now, rows: rowsPre.map(recSer) });
            else fail.push(...fPre);
            out.push(...rowsPre.filter(r => r.t && r.t >= p && r.t < preEnd));
          }
          p = preEnd;
        }
        if (p < end) {
          if (canReuseToday && end <= tEnd) {
            out.push(...(S.today || []).filter(r => r.t && r.t >= p && r.t < end));
          } else {
            out.push(...await fetchRecs(p, end, fail));
          }
        }
        cur = end;
        continue;
      }
      const key = recScope() + '|' + TZOFF + '|' + mk, ttl = now - me.getTime() < 10 * DAY ? 6 * 3600000 : 7 * DAY;
      let hit = await RecCache.get(key);
      if (hit && now - hit.at > ttl) hit = null;
      let rows;
      if (hit) rows = hit.rows.map(recDe);
      else if (end - cur >= (me - ms) / 2) {   // الجزء المطلوب نصف الشهر أو أكثر: افحص وثيقة ملخص الشهر المجمّعة أولاً (قراءة واحدة فقط!)
        let fromSummary = null;
        if (!isManager()) {
          try {
            const sumDoc = await getDoc(doc(db, 'monthlySummaries', mk));
            if (sumDoc.exists() && sumDoc.data().tzOff === TZOFF && typeof sumDoc.data().packed === 'string') {
              fromSummary = unpackMonthRecs(sumDoc.data(), msVal => Timestamp.fromMillis(msVal));
            }
          } catch (e) { logErr('month-summary-read', e); }
        }
        if (fromSummary) {
          rows = fromSummary;
          await RecCache.set(key, { at: now, rows: rows.map(recSer) });
        } else {
          const f2 = [], all = await fetchRecs(ms, me, f2);
          if (!f2.length) {
            await RecCache.set(key, { at: now, rows: all.map(recSer) });
            // إذا مضى على إغلاق الشهر أكثر من 10 أيام وكان المشرف مخوّلاً، احفظ الملخص المجمّع تلقائياً في الخلفية ليخدم كل الأجهزة بقراءة واحدة
            if (!isManager() && (isSuper() || isHr() || isPay()) && now - me.getTime() > 10 * DAY && all.length > 0) {
              saveMonthSummaryDoc(mk, all).catch(() => {});
            }
          } else fail.push(...f2);
          rows = all;
        }
      } else rows = await fetchRecs(cur, end, fail);
      out.push(...rows.filter(r => r.t && r.t >= cur && r.t < end));
      cur = end;
    }
    return out;
  }
  async function loadRecs() { S.recsFail = []; S.recs = await fetchRecsCached(new Date(dayStart(S.from).getTime() - 86400000), dayEnd(S.to), S.recsFail); }
  async function saveMonthSummaryDoc(mk, rows) {
    const p = packMonthRecs(rows, mk, TZOFF);
    if (p.packed.length > 880000) return false;
    const sha256 = await sha256Hex(p.packed);
    await _setDoc(doc(db, 'monthlySummaries', mk), { mk, tzOff: TZOFF, count: p.count, packed: p.packed, sha256, updatedAt: serverTimestamp(), by: runBy() });
    return { count: p.count, sha256, packed: p.packed };
  }
  async function invalidateMonthSummary(mk) {
    if (!mk || mk.length < 7) return;
    const m = mk.slice(0, 7);
    try { await _deleteDoc(doc(db, 'monthlySummaries', m)); } catch (e) { logErr('summary-delete', e); }
    try { await RecCache.del(recScope() + '|' + TZOFF + '|' + m); } catch (e) { logErr('reccache-del', e); }
  }
  async function migrateLocs() {
    if (!isSuper() && !isHr()) return;
    const missing = S.locs.filter(l => !(l.kx > 0) || !(l.ky > 0));
    if (!missing.length) return;
    const b = writeBatch(db);
    missing.forEach(l => { const k = geoK(l.lat); Object.assign(l, k); b.update(doc(db, 'locations', l.id), k); });
    await b.commit().catch(() => {});
  }
  /* ---- تبويب «اليوم»: أمس يُحفظ في RecCache + مستمع لحظي يحدّث التغييرات فقط (docChanges) ----
     مع إسبات تلقائي للمستمع إذا تُرك التبويب في الخلفية لأكثر من 15 دقيقة لتوفير القراءات. */
  const mapRec = d => ({ id: d.id, empId: d.ref.parent.parent.id, ...d.data(), t: d.data().time?.toDate() });
  let _todayRT = 0, _idleTimer = 0;
  let _admAlertState = { initialized: false, reqIds: [], recIds: [] };
  const checkAdminAlerts = () => {
    try {
      const res = diffAdminLiveAlerts(_admAlertState, S.reqs || [], S.todayLive || [], S.set || {});
      _admAlertState = res.nextState;
      res.alerts.forEach(a => {
        MeqatNotify.send(a.title, a.body, 'meqat-adm-' + a.id, a.type === 'spoof' ? 'warn' : 'info');
        toast(a.title + ' — ' + a.body, a.type === 'spoof' ? 'err' : 'good');
      });
    } catch {}
  };
  const mergeToday = () => {
    const byKey = new Map();
    (S.todayPrev || []).forEach(r => byKey.set(r.empId + '/' + r.id, r));
    (S.todayLive || []).forEach(r => byKey.set(r.empId + '/' + r.id, r));
    S.today = [...byKey.values()].sort((a, b) => a.t - b.t);
    if ((S.todayLive || []).length) checkAdminAlerts();
    // تحديث فوري لسجلات اليوم داخل S.recs دون قراءة إضافية
    if (Array.isArray(S.recs) && S.recs.length && S.todayKey) {
      const yKey = dayKey(new Date(Date.now() - 86400000)), yStart = dayStart(yKey);
      const older = S.recs.filter(r => r.t && r.t < yStart);
      S.recs = older.concat(S.today.filter(r => !S.emp || r.empId === S.emp));
      _sumC = null;
    }
  };
  function stopTodayFeed() {
    if (window.__meqatUnsub) { try { window.__meqatUnsub(); } catch {} window.__meqatUnsub = null; }
    clearInterval(window.__meqatPoll); window.__meqatPoll = 0;
    clearTimeout(_idleTimer); _idleTimer = 0;
  }
  function refreshTodayView() {
    clearTimeout(_todayRT);
    _todayRT = setTimeout(() => { if (S.tab === 'today' && !document.querySelector('.ov') && $('#content')) viewToday($('#content')); }, 400);
  }
  async function startTodayFeed(force = false) {
    stopTodayFeed();
    const nowD = new Date(), key = dayKey(nowD), yKey = dayKey(new Date(nowD.getTime() - 86400000));
    S.todayKey = key; S.todayLive = []; S.todayPrev = [];
    S.todayFail = [];
    // كاش يوم أمس في IndexedDB لمدة ساعتين لمنع إعادة قراءته عند كل تحديث للصفحة
    const yCacheKey = 'yday|' + recScope() + '|' + TZOFF + '|' + yKey;
    let yHit = force ? null : await RecCache.get(yCacheKey);
    if (yHit && Date.now() - yHit.at <= 2 * 3600000) {
      S.todayPrev = yHit.rows.map(recDe).filter(x => x.t);
    } else {
      S.todayPrev = await fetchRecs(dayStart(yKey), dayEnd(yKey), S.todayFail);
      if (!S.todayFail.length) await RecCache.set(yCacheKey, { at: Date.now(), rows: S.todayPrev.map(recSer) });
    }
    mergeToday();
    await new Promise(resolve => {
      let first = true;
      const done = () => { if (first) { first = false; resolve(); } else refreshTodayView(); };
      const slowPoll = async () => {   // احتياط إذا تعذّر المستمع (مثلاً الفهرس غير منشأ): تحديث كل 5 دقائق فقط
        clearInterval(window.__meqatPoll);
        const pull = async () => { try { S.todayFail = []; S.todayLive = await fetchRecs(dayStart(key), dayEnd(key), S.todayFail); mergeToday(); } catch (err) { console.warn(err); } done(); };
        await pull();
        window.__meqatPoll = setInterval(() => { if (!document.hidden && auth.currentUser) pull(); }, 300000);
      };
      if (isManager()) { slowPoll(); return; }
      const q = query(collectionGroup(db, 'records'), where('time', '>=', Timestamp.fromDate(dayStart(key))), where('time', '<', Timestamp.fromDate(dayEnd(key))), orderBy('time'));
      const liveMap = new Map();
      try {
        window.__meqatUnsub = onSnapshot(q, snap => {
          snap.docChanges().forEach(ch => {
            const k = ch.doc.ref.parent.parent.id + '/' + ch.doc.id;
            if (ch.type === 'removed') liveMap.delete(k);
            else { const r = mapRec(ch.doc); if (r.t) liveMap.set(k, r); }
          });
          S.todayLive = [...liveMap.values()].sort((a, b) => a.t - b.t);
          mergeToday();
          done();
        }, err => {
          console.warn(err);
          if (err.code === 'failed-precondition') S.idxUrl = (String(err.message).match(/https:\/\/\S+/) || [''])[0] || 'https://console.firebase.google.com';
          if (window.__meqatUnsub) { try { window.__meqatUnsub(); } catch {} window.__meqatUnsub = null; }
          slowPoll();
        });
      } catch (e) { console.warn(e); slowPoll(); }
      setTimeout(() => { if (first) { first = false; resolve(); } }, 15000);   // لا نعطّل تحميل اللوحة إذا تأخر الاتصال
    });
  }
  if (!window.__meqatVisBound) {
    window.__meqatVisBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!auth.currentUser) return;
      if (document.hidden) {
        clearTimeout(_idleTimer);
        _idleTimer = setTimeout(() => { if (document.hidden) stopTodayFeed(); }, 15 * 60000);
      } else {
        clearTimeout(_idleTimer); _idleTimer = 0;
        if (!feedAlive()) startTodayFeed().then(() => refreshTodayView()).catch(() => {});
      }
    });
  }
  /* ================= جلب مجزّأ =================
     كل جزء له دالة مستقلة. loadAll (كاملة) تعمل عند الفتح وزر «تحديث» فقط؛ وبعد أي حفظ نعيد جلب الجزء المتأثر وحده عبر refresh(). */
  const byName = (x, y) => (x.name || '').localeCompare(y.name || '', 'ar');
  const reqMap = (d, empId) => ({ id: d.id, empId: empId || d.ref.parent.parent.id, ...d.data(), cAt: (d.data().createdAt && d.data().createdAt.toMillis ? d.data().createdAt.toMillis() : 0) });
  const idxLink = err => (String(err.message).match(/https:\/\/\S+/) || [''])[0] || 'https://console.firebase.google.com';
  async function loadEmps() {
    const q = isManager() ? query(collection(db, 'employees'), where('dept', '==', S.deptScope)) : collection(db, 'employees');
    S.emps = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() })).sort(byName);
    if (S.finMap && S.finMap.size) S.emps = S.emps.map(e => mergeEmpFinance(e, S.finMap.get(e.id)));
  }
  /* التحميل الكسول للخزينة المالية المعزولة (empFinance): لا يُقرأ إلا للمدير العام ومحاسب الرواتب وعند وجود موظفين معزولين ماليًا، ويُكيش في RecCache لمدة ساعتين */
  async function ensureFinanceLoaded(force = false) {
    if (!(isSuper() || isPay())) return;
    if (!force && S.finLoaded) {
      if (S.finMap && S.finMap.size) S.emps = S.emps.map(e => mergeEmpFinance(e, S.finMap.get(e.id)));
      return;
    }
    if (!force && !S.emps.some(e => e.finIsolated)) { S.finLoaded = true; return; }
    const cKey = 'emp_fin_v1|' + ((auth.currentUser && auth.currentUser.uid) || '');
    let rows = null;
    if (!force) {
      const hit = await RecCache.get(cKey);
      if (hit && Date.now() - hit.at < 2 * 3600000 && Array.isArray(hit.rows)) rows = hit.rows;
    }
    if (!rows) {
      try {
        const s = await getDocs(collection(db, 'empFinance'));
        rows = s.docs.map(d => ({ id: d.id, ...tsSer(d.data()) }));
        await RecCache.set(cKey, { at: Date.now(), rows });
      } catch (e) { console.warn('empFinance load:', e); rows = []; }
    }
    S.finMap = new Map(rows.map(r => [r.id, tsDe(r)]));
    S.emps = S.emps.map(e => mergeEmpFinance(e, S.finMap.get(e.id)));
    S.finLoaded = true;
  }
  async function saveEmpFinanceCache(empId, finData) {
    if (!S.finMap) S.finMap = new Map();
    S.finMap.set(empId, finData);
    const cKey = 'emp_fin_v1|' + ((auth.currentUser && auth.currentUser.uid) || '');
    const rows = [...S.finMap.entries()].map(([id, d]) => ({ id, ...tsSer(d) }));
    await RecCache.set(cKey, { at: Date.now(), rows });
  }
  async function loadLocs() { S.locs = (await getDocs(collection(db, 'locations'))).docs.map(d => ({ id: d.id, ...d.data() })); }
  async function loadScheds() {
    try { S.scheds = (await getDocs(collection(db, 'schedules'))).docs.map(d => ({ id: d.id, ...d.data() })).sort(byName); S.rulesOld = false; }
    catch (e2) { if (e2.code === 'permission-denied') S.rulesOld = true; else throw e2; }
  }
  async function loadHols() {
    try {
      const hs = await getDocs(collection(db, 'holidays'));
      S.hols = hs.docs.map(d => ({ id: d.id, date: d.data().date || d.id, name: d.data().name || '' })).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      S.holKeys = S.hols.map(h => h.date || h.id);
    } catch (e2) { if (e2.code !== 'permission-denied') console.warn(e2); }
  }
  async function loadSet() {
    try { const st = await getDoc(doc(db, 'settings', 'general')); S.set = st.exists() ? st.data() : {}; } catch (e2) { if (e2.code !== 'permission-denied') console.warn(e2); }
    if (S.set && S.set.tzOffset != null && +S.set.tzOffset !== TZOFF) TZOFF = +S.set.tzOffset;
  }
  async function loadTaskTypes() {
    try { S.taskTypes = (await getDocs(collection(db, 'taskTypes'))).docs.map(d => ({ id: d.id, ...d.data() })).sort(byName); } catch (e2) { S.taskTypes = []; if (e2.code !== 'permission-denied') console.warn(e2); }
  }
  async function loadAdmins() {
    if (!isSuper()) { S.admins = []; S.ownerEmail = ''; S.adminsErr = false; return; }
    try {
      const ad = await getDocs(collection(db, 'admins'));
      S.admins = ad.docs.filter(d => d.id !== 'owner').map(d => ({ id: d.id, name: d.data().name || '', email: d.data().email || '', role: d.data().role || 'auditor', deptScope: d.data().deptScope || '' }));
      const od = ad.docs.find(d => d.id === 'owner'); S.ownerEmail = od ? (od.data().email || '') : '';
      S.adminsErr = false;
    } catch (e2) { S.admins = []; if (e2.code === 'permission-denied') S.adminsErr = true; else console.warn(e2); }
  }
  /* المواقع والجداول والعطل وأنواع المهام: تُقرأ من ذاكرة الجهاز ما دام cfgVersion في settings/general لم يتغيّر (قراءة واحدة بدل عشرات) */
  const CFG_KEY = 'meqat_admin_cfg_v1';
  async function loadConfig(force) {
    await loadSet();
    const cv = S.set && S.set.cfgVersion, u = auth.currentUser && auth.currentUser.uid;
    let c = null;
    if (!force) { try { c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch {} }
    if (c && cv && c.v === cv && c.u === u && c.role === S.role && c.dept === S.deptScope && Array.isArray(c.taskTypes)) {
      S.locs = c.locs.map(tsDe); S.scheds = c.scheds.map(tsDe); S.hols = c.hols; S.holKeys = S.hols.map(h => h.date || h.id);
      S.taskTypes = c.taskTypes.map(tsDe); S.rulesOld = false;
      return;
    }
    await Promise.all([loadLocs(), loadScheds(), loadHols(), loadTaskTypes()]);
    if (cv && !S.rulesOld) {
      try {
        localStorage.setItem(CFG_KEY, JSON.stringify({
          v: cv, u, role: S.role, dept: S.deptScope,
          locs: S.locs.map(tsSer), scheds: S.scheds.map(tsSer), hols: S.hols, taskTypes: S.taskTypes.map(tsSer)
        }));
      } catch {}
    }
  }
  /* الطلبات: المعلّقة تُجلب حية دائماً، أما الطلبات المحسومة من أول ديسمبر فتُكيش في RecCache لمدة 15 دقيقة لتوفير مئات القراءات */
  const reqWin = () => { let w = (+dayKey(new Date()).slice(0, 4) - 1) + '-12-01'; if (S.from && S.from < w) w = S.from; return w; };
  async function fetchReqs(w, before, force = false) {
    const byId = new Map();
    const add = (d, empId) => { const r = reqMap(d, empId); byId.set(r.empId + '/' + r.id, r); };
    const fromQ = col => before ? query(col, where('from', '>=', w), where('from', '<', before)) : query(col, where('from', '>=', w));
    const pendQ = col => query(col, where('status', '==', 'pending'));
    const rCacheKey = !before ? ('reqs|' + recScope() + '|' + w) : '';
    let cachedDecided = null;
    if (rCacheKey && !force) {
      const hit = await RecCache.get(rCacheKey);
      if (hit && Date.now() - hit.at <= 15 * 60000 && Array.isArray(hit.rows)) {
        cachedDecided = hit.rows.map(tsDe);
      }
    }
    if (cachedDecided) {
      cachedDecided.forEach(r => byId.set(r.empId + '/' + r.id, r));
      const runPend = async (col, empId) => { const s = await getDocs(pendQ(col)); s.docs.forEach(d => add(d, empId)); };
      if (isManager()) await Promise.all(S.emps.map(emp => runPend(collection(db, 'employees', emp.id, 'requests'), emp.id)));
      else await runPend(collectionGroup(db, 'requests'));
      return [...byId.values()];
    }
    const run = async (col, empId) => { const qs = [getDocs(fromQ(col))]; if (!before) qs.push(getDocs(pendQ(col))); (await Promise.all(qs)).forEach(s => s.docs.forEach(d => add(d, empId))); };
    if (isManager()) await Promise.all(S.emps.map(emp => run(collection(db, 'employees', emp.id, 'requests'), emp.id)));
    else await run(collectionGroup(db, 'requests'));
    const all = [...byId.values()];
    if (rCacheKey) {
      const decided = all.filter(r => r.status !== 'pending').map(tsSer);
      await RecCache.set(rCacheKey, { at: Date.now(), rows: decided });
    }
    return all;
  }
  async function loadReqs(force = false) {
    try {
      const w = reqWin();
      try { S.reqs = await fetchReqs(w, null, force); S.reqsFrom = w; }
      catch (err) {
        if (err.code !== 'failed-precondition' || isManager()) throw err;
        S.idxUrlReq = idxLink(err); console.warn(err.message);
        S.reqs = (await getDocs(query(collectionGroup(db, 'requests'), limit(3000)))).docs.map(d => reqMap(d)); S.reqsFrom = '';   // احتياط: القراءة الكاملة القديمة إلى أن يُنشأ الفهرس
      }
      S.reqsErr = false;
    } catch (e2) { S.reqs = []; S.reqsFrom = ''; if (e2.code === 'permission-denied') S.reqsErr = true; else console.warn(e2); }
    S.leaves = S.reqs.filter(r => r.kind === 'leave' && r.status === 'approved');
    checkAdminAlerts();
  }
  async function loadReqsBefore(key) {
    if (!S.reqsFrom || key >= S.reqsFrom) return;
    const more = await fetchReqs(key, S.reqsFrom), have = new Set(S.reqs.map(r => r.empId + '/' + r.id));
    S.reqs = S.reqs.concat(more.filter(r => !have.has(r.empId + '/' + r.id)));
    S.reqsFrom = key;
    S.leaves = S.reqs.filter(r => r.kind === 'leave' && r.status === 'approved');
  }
  const feedAlive = () => S.todayKey === dayKey(new Date()) && (window.__meqatUnsub || window.__meqatPoll);
  async function loadAll(opts = {}) {
    _sumC = null;
    S.idxUrl = ''; S.idxUrlReq = '';
    if (S.runRowsCache) S.runRowsCache.clear();
    try {
      if (opts.force) {
        await RecCache.clear();
        try { localStorage.removeItem(CFG_KEY); sessionStorage.removeItem(ROLE_CACHE_KEY); } catch {}
      }
      await resolveAdminRole(!!opts.force);
      if (opts.force) S.finLoaded = false;
      await Promise.all([loadEmps().then(() => ensureFinanceLoaded(!!opts.force)), loadConfig(!!opts.force)]);
      // تشغيل مستمع اليوم بالتوازي مع الطلبات والمشرفين ثم استخدام بيانات اليوم داخل loadRecs لمنع ازدواجية قراءة أمس واليوم
      await Promise.all([
        (opts.force || !feedAlive()) ? startTodayFeed(!!opts.force) : Promise.resolve(),
        loadReqs(!!opts.force),
        loadAdmins(),
        migrateLocs()
      ]);
      await loadRecs();
    } catch (err) { console.error(err); toast('تعذر تحميل البيانات — تأكد أن بريدك مطابق للمكتوب في قواعد Firestore', 'err'); }
    render();
  }
  /* بعد أي حفظ: أعد جلب الأجزاء المتأثرة فقط. الأجزاء: emps locs scheds hols set tasks admins reqs recs */
  async function refresh(...parts) {
    const P = new Set(parts);
    try {
      if (P.has('emps')) await loadEmps();
      const jobs = [];
      if (P.has('locs')) jobs.push(loadLocs().then(migrateLocs));
      if (P.has('scheds')) jobs.push(loadScheds());
      if (P.has('hols')) jobs.push(loadHols());
      if (P.has('set')) jobs.push(loadSet());
      if (P.has('tasks')) jobs.push(loadTaskTypes());
      if (P.has('admins')) jobs.push(loadAdmins());
      await Promise.all(jobs);
      if (P.has('reqs')) await loadReqs(true);
      if (P.has('recs')) await loadRecs();
    } catch (err) { console.error(err); toast('تعذر تحديث البيانات', 'err'); }
    _sumC = null;
    render();
  }

  function render() {
    const pend = S.reqs.filter(r => r.status === 'pending').length;
    const LF = licFeatures();
    const fgN = forgotAlerts().length;
    const tabs = [['today', 'اليوم', 'today'], ['emps', 'الموظفون', 'users'], ['sched', 'الدوام والإعدادات', 'sched'], ['locs', 'المواقع', 'pin'], ['reqs', `الطلبات${pend ? ' (' + pend + ')' : ''}`, 'send'], ...(LF.tasks === false ? [] : [['tasks', 'المهام', 'task']]), ['recs', `التقارير والرواتب${fgN ? ' (' + fgN + ')' : ''}`, 'report']];
    const TT = { today: 'اليوم', emps: 'الموظفون', sched: 'الدوام والإعدادات', locs: 'المواقع', reqs: 'الطلبات', tasks: 'المهام', recs: 'التقارير والرواتب' };
 const SH = { today: 'اليوم', emps: 'الموظفون', sched: 'الدوام', locs: 'المواقع', reqs: 'الطلبات', tasks: 'المهام', recs: 'التقارير' };
 const CNT = { reqs: pend || 0, recs: fgN || 0 };
 root.innerHTML = `<div class="shell"><aside class="rail"><nav class="rail-nav" id="adminNav" aria-label="تبويبات لوحة الإدارة"><div class="rail-head"><div class="lg" aria-hidden="true">${logoMark(28)}</div><div class="rail-brand"><b>${BRAND}</b><small>${esc(brandName())}</small></div></div>
 ${tabs.map(([k, n, i]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-tab="${k}" title="${TT[k]}" aria-label="${TT[k]}"${S.tab === k ? ' aria-current="page"' : ''}>${ic(i, 22)}<span class="tl">${SH[k]}</span>${CNT[k] ? `<em>${CNT[k]}</em>` : ''}</button>`).join('')}<span class="rail-sp"></span>${(() => { const em = (auth.currentUser && auth.currentUser.email) || ''; const nm = (em.split('@')[0] || 'مشرف'); const RLN = { super_admin: 'مدير عام', hr_admin: 'موارد بشرية', payroll_admin: 'محاسب رواتب', manager: 'مدير قسم', auditor: 'مدقق' }; return `<div class="rail-me" title="${esc(em)}"><span class="av">${ini(nm)}</span><div class="rail-mt"><b>${esc(nm)}</b><small>${RLN[S.role] || ''}</small></div></div>`; })()}</nav></aside>
 <main class="wrap main">
 <header class="phead"><div><small>${esc(brandName())} · لوحة الإدارة ${licBadgeHtml()}</small><h1>${TT[S.tab] || ''}</h1></div>
 <div class="ptools">
 <button class="pwa-btn" id="admNotifBtn" type="button" onclick="window.__meqatRequestNotif()" title="تفعيل الإشعارات الفورية للطلبات واشتباهات الموقع">${MeqatNotify.perm() === 'granted' ? '🔔 التنبيهات مفعّلة' : '🔕 تفعيل التنبيهات'}</button>
 <button class="pwa-btn" onclick="window.__installPWA()">${ic('download', 18)} تثبيت</button>
 ${themeBtnHtml()}
 <button class="ib" data-act="reload" title="تحديث البيانات" aria-label="تحديث البيانات">${ic('refresh', 22)}</button>
 <button class="ib" data-act="logout" title="تسجيل الخروج" aria-label="تسجيل الخروج">${ic('power', 22)}</button>
 </div></header>
 ${licBannerHtml()}
      ${S.idxUrl ? `<div class="notice"><b>خطوة لمرة واحدة:</b> يلزم إنشاء فهرس لتسريع التقارير. <a href="${esc(S.idxUrl)}" target="_blank">اضغط هنا لإنشائه</a> وانتظر دقيقة ثم اضغط «تحديث». حتى ذلك الحين تُحمَّل السجلات بالطريقة البديلة الآمنة.</div>` : ''}
      ${S.idxUrlReq ? `<div class="notice"><b>خطوة لمرة واحدة (لتوفير القراءات):</b> يلزم إنشاء فهرس لطلبات الموظفين. <a href="${esc(S.idxUrlReq)}" target="_blank">اضغط هنا لإنشائه</a> وانتظر دقيقة ثم اضغط «تحديث». قد يظهر رابط ثانٍ بعد الأول، أنشئه أيضاً. حتى ذلك الحين تُقرأ كل الطلبات بالطريقة القديمة.</div>` : ''}
      ${(S.recsFail.length || S.todayFail.length) ? `<div class="notice"><b>تحذير — بيانات ناقصة:</b> تعذّرت قراءة سجلات: ${esc([...new Set([...S.recsFail, ...S.todayFail])].join('، '))}. قد يظهرون غائبين خطأً في اليوم والتقارير والرواتب. اضغط «تحديث» قبل اعتماد أي رواتب.</div>` : ''}
      ${S.rulesOld ? `<div class="notice"><b>تحديث لمرة واحدة:</b> لحفظ جداول الدوام يلزم تحديث قواعد Firestore. اضغط الزر لنسخ القواعد الجديدة، ثم افتح Firestore › Rules، وامسح القديم والصق الجديد واضغط Publish، ثم حدّث الصفحة.<div style="margin-top:10px"><button class="btn sm" data-act="copyRules">${ic('copy', 16)} نسخ القواعد الجديدة</button></div></div>` : ''}
      ${S.reqsErr || S.adminsErr ? `<div class="notice"><b>تحديث مطلوب:</b> قواعد Firestore المنشورة حالياً لا تتيح قراءة طلبات الموظفين جماعياً أو بيانات المشرفين. انسخ القواعد الأحدث وانشرها ثم أعد التحميل.<div style="margin-top:10px"><button class="btn sm" data-act="copyRules">${ic('copy', 16)} نسخ القواعد الأحدث</button></div></div>` : ''}
      ${(()=>{try{return localStorage.getItem('att_rules_v5')}catch{return '1'}})() ? '' : `<div class="notice"><b>تحديث أمني لقواعد Firestore:</b> القواعد الجديدة تفرض الأدوار في الخادم، وتحصر إدارة المشرفين بالمدير العام، وتقيّد كتابة الحقول حسب الدور، وتشترط نطاقًا لمدير القسم. انسخ القواعد وانشرها في Firestore › Rules، ثم اختبر كل حساب قبل العودة للإنتاج. <b>ولا تنسَ تفعيل «Anonymous» من Authentication › Sign-in method.</b><div style="margin-top:10px"><button class="btn sm" data-act="copyRules">${ic('copy', 16)} نسخ القواعد</button> <button class="btn sm sec" data-act="v2Done">${ic('check', 16)} نشرتها، لا تُظهر هذا التنبيه مجدداً</button></div></div>`}
      <div id="content"></div></main></div>`;
    { const nv = $('#adminNav'), on = nv && nv.querySelector('.tab.on'); if (on) { const a = on.getBoundingClientRect(), b = nv.getBoundingClientRect(); nv.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2); } }
    refreshPwaButtons();
    ({ today: viewToday, emps: viewEmps, sched: viewSched, locs: viewLocs, reqs: viewReqs, tasks: viewTasks, recs: viewRecs })[S.tab]($('#content'));
 { const so = document.querySelector('.stab.on'); if (so && so.scrollIntoView) so.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  }

