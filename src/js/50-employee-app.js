async function employeeApp(db, auth, token) {
  const showErr = m => { root.innerHTML = `<div class="emp-bg"><div class="emp-wrap"><div class="card center" style="margin-top:60px"><div class="st-ic" style="margin:0 auto 14px">${ic('alert', 32)}</div><p style="margin:0;font-weight:700">${esc(m)}</p></div></div></div>`; };
  root.innerHTML = `<div class="emp-bg"><div class="emp-wrap"><div class="card center" style="margin-top:60px">جاري التحميل…</div></div></div>`;
  const ref = doc(db, 'employees', token);
  let emp, locs = [];
  const myDev = getDeviceId();
  let uid = null;
  try {
    const cu = auth.currentUser;
    if (cu && cu.isAnonymous) uid = cu.uid;
    else { if (cu) await signOut(auth); const cred = await signInAnonymously(auth); uid = cred.user.uid; }
  } catch (e) {
    const c = e && e.code ? e.code : '';
    return showErr(
      (c === 'auth/operation-not-allowed' || c === 'auth/configuration-not-found' || c === 'auth/admin-restricted-operation')
        ? 'تسجيل الدخول المجهول (Anonymous) غير مفعّل في هذا المشروع. اطلب من الإدارة: Firebase Console › Authentication › Sign-in method ثم تفعيل Anonymous، ثم أعد المحاولة.'
        : 'تعذر الاتصال بالنظام. تحقق من الإنترنت وحاول مجدداً.');
  }
  // شاشة رمز الأجهزة: تُضيف هذا الجهاز كجهاز إضافي (حد أقصى 3) بعد التحقق من الرمز في القواعد
  const askPin = () => new Promise(resolve => {
    root.innerHTML = `<div class="emp-bg"><div class="emp-wrap"><div class="card center" style="margin-top:40px;line-height:1.9">
      <h3 style="margin:0 0 10px">جهاز جديد</h3>
      <p style="margin:0 0 12px">هذا الجهاز أو المتصفح غير مسجَّل لرابطك. أدخل «رمز الأجهزة» الذي أعطتك إياه الإدارة لإضافته. الرمز مؤقت (ينتهي خلال يومين) ويُصدره المسؤول عند الحاجة فقط.</p>
      <input id="pinIn" autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="XXXX-XXXX" style="width:100%;margin-bottom:10px;text-align:center;letter-spacing:2px">
      <button class="btn" id="pinGo" type="button">إضافة هذا الجهاز</button>
      <p id="pinMsg" class="bad-txt" style="font-size:13px;margin:10px 0 0"></p></div></div></div>`;
    const go = async () => {
      const pin = normPin($('#pinIn').value); if (pin.length < 8) { $('#pinMsg').textContent = 'الرمز مكوّن من 8 خانات.'; return; }
      const b = $('#pinGo'), msg = $('#pinMsg'); b.disabled = true; msg.textContent = '';
      try { await setDoc(doc(db, 'employees', token, 'joins', uid), { pin, ua: (navigator.userAgent || '').slice(0, 90), at: serverTimestamp() }); }
      catch { msg.textContent = 'الرمز غير صحيح أو منتهي، أو الرابط غير صالح/موقوف. اطلب من الإدارة رمزًا جديدًا.'; b.disabled = false; return; }
      try { await updateDoc(ref, { ['devices.' + myDev]: uid, lastJoinAt: serverTimestamp() }); }
      catch { msg.textContent = 'تعذر إضافة الجهاز: وصلت الحد الأقصى لأجهزتك أو الرابط قديم. اطلب من الإدارة إلغاء جهاز قديم أو إعادة الضبط.'; b.disabled = false; return; }
      resolve(true);
    };
    $('#pinGo').onclick = go; $('#pinIn').onkeydown = e => { if (e.key === 'Enter') go(); };
  });
  let cfgSt = null, cfgHit = null, cfgLocRaw = [];
  try {
    // جلب ملف الموظف وإعدادات المنشأة بالتوازي لتسريع الإقلاع للنصف
    let [snap, stRes] = await Promise.all([
      getDoc(ref).catch(e => { if (e && e.code === 'permission-denied') return null; throw e; }),
      getDoc(doc(db, 'settings', 'general')).catch(() => null)
    ]);
    cfgSt = stRes;
    if (!snap) {
      // لم نعد مالكين للوثيقة: إما ضاعت جلسة الهوية على نفس الجهاز، أو هذا جهاز جديد
      let rec = false;
      try { await updateDoc(ref, { ['devices.' + myDev]: uid }); rec = true; } catch (e) { logErr('device-bind-map', e); }
      if (!rec) { try { await updateDoc(ref, { uid, rebindProof: myDev }); rec = true; } catch (e) { logErr('device-bind-legacy', e); } }
      if (rec) { try { snap = await getDoc(ref); } catch (e) { logErr('device-bind-reread', e); } }
      if (!snap) { await askPin(); snap = await getDoc(ref); }
    }
    if (!snap.exists() || !snap.data().active) return showErr('الرابط غير صالح أو تم إيقافه. تواصل مع الإدارة.');
    emp = snap.data();
    if (emp.devices) {
      if (emp.devices[myDev] !== uid) {
        const k = Object.keys(emp.devices).find(x => emp.devices[x] === uid);
        if (k) { try { localStorage.setItem('att_dev', k); } catch {} }
        else return showErr('هذا الرابط مرتبط بأجهزة أخرى. اطلب من الإدارة إعادة ضبط الأجهزة.');
      }
    } else if (!emp.uid) {
      // أول فتح (أو ترقية رابط قديم مربوط بجهاز فقط من نفس الجهاز)
      if (emp.deviceId && emp.deviceId !== myDev) return showErr('هذا الرابط قديم ومرتبط بجهاز آخر. اطلب من الإدارة إعادة ضبط الأجهزة.');
      const upd = { deviceId: myDev, devices: { [myDev]: uid } };
      if (emp.deviceId) upd.rebindProof = myDev;
      await updateDoc(ref, upd);
      emp.deviceId = myDev; emp.devices = { [myDev]: uid };
    } else if (emp.uid === uid) {
      // رابط قديم (uid بلا خريطة أجهزة): ترقية
      const key = emp.deviceId || myDev;
      await updateDoc(ref, { devices: { [key]: uid }, uid: null });
      try { localStorage.setItem('att_dev', key); } catch {}
      emp.devices = { [key]: uid }; emp.uid = null; emp.deviceId = key;
    } else {
      return showErr('هذا الرابط مرتبط بجهاز آخر. اطلب من الإدارة إعادة ضبط الأجهزة.');
    }
    try { localStorage.setItem('att_emp_tok', token); } catch {}
    installHint();
    if (!cfgSt) { try { cfgSt = await getDoc(doc(db, 'settings', 'general')); } catch (e) { logErr('emp-settings', e); } }
    const cv = cfgSt && cfgSt.exists() ? cfgSt.data().cfgVersion : null;
    let cc = null; try { cc = JSON.parse(localStorage.getItem('att_cfg_v1') || 'null'); } catch {}
    if (cv && cc && cc.v === cv && cc.sid === (emp.scheduleId || '') && Array.isArray(cc.locs) && Array.isArray(cc.hols)) cfgHit = cc;
  } catch (e) {
    if (e && e.code === 'permission-denied') return showErr('هذا الرابط مرتبط بجهاز آخر، أو القواعد لم تُحدث بعد. اطلب من الإدارة إعادة ضبط الجهاز.');
    return showErr('تعذر الاتصال بالنظام. تحقق من الإنترنت وحاول مجدداً.');
  }
  let orgName = BRAND, LT = DEF_LT, empOverrides = [];
  try {
    const st = cfgSt;
    if (st && st.exists()) {
      const s = st.data();
      if (s.tzOffset != null && !isNaN(+s.tzOffset)) TZOFF = +s.tzOffset;
      if (s.orgName) orgName = s.orgName;
      LT = leaveTypesOf(s);
      if (Array.isArray(s.schedOverrides)) empOverrides = s.schedOverrides;
    }
  } catch {}
  if (emp.finIsolated) {
    try {
      const fKey = 'att_emp_fin_' + token;
      let fData = null;
      try { const fc = JSON.parse(localStorage.getItem(fKey) || 'null'); if (fc && Date.now() - (fc.at || 0) < 6 * 3600000) fData = fc.d; } catch {}
      if (!fData) {
        const fs = await getDoc(doc(db, 'empFinance', token));
        if (fs.exists()) { fData = fs.data(); try { localStorage.setItem(fKey, JSON.stringify({ at: Date.now(), d: fData })); } catch {} }
      }
      if (fData) emp = mergeEmpFinance(emp, fData);
    } catch (e) { logErr('emp-finance-read', e); }
  }
  let empNotice = '';
  try { if (cfgSt && cfgSt.exists() && cfgSt.data().empNotice) empNotice = cfgSt.data().empNotice; } catch {}
  if (emp.empType === 'task') return taskWorkerApp(db, token, emp, orgName, cfgSt);
  let sched = null, schedRaw = null, schedOK = true, holsOK = true, hols = [];
  if (cfgHit) {
    cfgLocRaw = cfgHit.locs;
    schedRaw = emp.scheduleId ? cfgHit.sched : null;
    hols = cfgHit.hols;
  } else {
    // جلب المواقع والجدول والعطل بالتوازي في رحلة شبكة واحدة عند تغيّر cfgVersion
    const [locSnap, schedSnap, holSnap] = await Promise.all([
      getDocs(collection(db, 'locations')),
      emp.scheduleId ? getDoc(doc(db, 'schedules', emp.scheduleId)).catch(() => { schedOK = false; return null; }) : Promise.resolve(null),
      getDocs(collection(db, 'holidays')).catch(() => { holsOK = false; return null; })
    ]);
    cfgLocRaw = locSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (schedSnap && schedSnap.exists()) schedRaw = { id: schedSnap.id, ...schedSnap.data() };
    if (holSnap) hols = holSnap.docs.map(d => d.data().date || d.id);
    const cvNow = cfgSt && cfgSt.exists() ? cfgSt.data().cfgVersion : null;
    if (cvNow && schedOK && holsOK) { try { localStorage.setItem('att_cfg_v1', JSON.stringify({ v: cvNow, sid: emp.scheduleId || '', locs: cfgLocRaw, sched: schedRaw, hols })); } catch {} }
  }
  locs = cfgLocRaw.filter(l => l.active !== false);
  if (emp.locs && emp.locs.length) locs = locs.filter(l => emp.locs.includes(l.id));
  if (schedRaw) sched = normSched(schedRaw);

  let offset = 0, skewWarn = false;
  async function syncTime() {
    try {
      const t0 = Date.now();
      const r = await fetch(location.origin + location.pathname + '?_=' + t0, { method: 'HEAD', cache: 'no-store' });
      const t1 = Date.now(); const dh = r.headers.get('Date');
      if (dh && (t1 - t0) < 5000) {
        const srv = new Date(dh).getTime();
        if (!isNaN(srv)) {
          offset = srv - (t0 + t1) / 2;
          skewWarn = Math.abs(offset) > 120000;
          const sk = $('#skew'); if (sk) sk.style.display = skewWarn ? 'inline-block' : 'none';
        }
      }
    } catch (e) { logErr('time-sync', e); }
  }
  // مزامنة الوقت في الخلفية دون تعطيل رسم الشاشة الفوري
  syncTime();
  const now = () => new Date(Date.now() + offset);

  root.innerHTML = `<div class="emp-bg"><div class="emp-wrap">
    <div class="emp-brand">
      <div class="emp-brand-l">${logoMark(30)}<span>${esc(orgName)}</span></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="pwa-btn" id="empNotifBtn" type="button" onclick="window.__meqatRequestNotif()">${MeqatNotify.perm() === 'granted' ? '🔔 التنبيهات مفعّلة' : '🔕 تفعيل التنبيهات'}</button>
        <button class="pwa-btn" onclick="window.__installPWA()">${ic('download', 18)} تثبيت</button>
        ${themeBtnHtml()}
      </div>
    </div>
    <div class="emp-head">
      <div class="av lg">${ini(emp.name)}</div>
      <div style="flex:1">
        <small>مرحباً بك${emp.dept ? ` · ${esc(emp.dept)}` : ''}</small>
        <h1>${esc(emp.name)}</h1>
      </div>
    </div>
    ${empNotice ? `<div class="notice">${ic('alert', 18)} تعميم الإدارة: ${esc(empNotice)}</div>` : ''}
    <div id="empSmartAlert" style="display:none;margin-bottom:12px"></div>
    <div class="card clockcard">
      <div class="live">التوقيت الرسمي المعتمد</div>
      <div class="clock" id="clock">--:--:--</div>
      <div class="muted" style="font-weight:700" id="dateTxt"></div>
      <div id="plan"></div>
      <div id="skew" class="badge b-warn" style="display:none;margin-top:8px">ساعة جهازك غير مضبوطة — الوقت المسجّل هو وقت الخادم</div>
      <div style="margin-top:12px" id="state"></div>
    </div>
    <div class="punch">
      <button class="pbtn in" id="bIn"><span class="pc">${ic('login', 36)}</span>تسجيل حضور</button>
      <button class="pbtn out" id="bOut"><span class="pc">${ic('logout', 36)}</span>تسجيل انصراف</button>
    </div>
    <div class="status" id="msg">اضغط على الزر المناسب، وسيُطلب منك السماح بتحديد الموقع.</div>
    <div id="offQueueBox" style="display:none;margin-bottom:14px"></div>
<div class="card" id="empPortalSum">
      <div class="ch"><div class="ch-l"><span class="chi">${ic('payroll', 24)}</span><h3>ملخص التزامي ومستحقاتي (هذا الشهر)</h3></div></div>
      <div id="myMonthBox" class="muted">جاري الحساب…</div>
    </div>
    <div class="card">
      <div class="ch"><div class="ch-l"><span class="chi">${ic('send', 24)}</span><h3>بوابة الطلبات الذاتية</h3></div></div>
      <div class="sc">
        <button class="chip" id="rqLeave">${ic('sun', 18)} طلب إجازة</button>
        <button class="chip" id="rqFix">${ic('edit', 18)} تصحيح بصمة</button>
        <button class="chip" id="rqLoan">${ic('payroll', 18)} طلب سلفة</button>
        <button class="chip" id="rqCert">${ic('print', 18)} طلب إفادة / تعريف راتب</button>
      </div>
      <div id="rqForm"></div>
      <div class="tw" style="margin-top:12px"><table><tbody id="rqList"><tr><td class="muted">…</td></tr></tbody></table></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ch-l"><span class="chi">${ic('clock', 24)}</span><h3>آخر تسجيلاتك</h3></div></div>
      <div class="tw"><table><tbody id="hist"><tr><td class="muted">…</td></tr></tbody></table></div>
    </div>
    <div style="font-size:12px;color:var(--mute);text-align:center;padding:8px 12px;line-height:1.7">${ic('pin', 16)} نلتزم بحماية خصوصيتك: تُستخدم إحداثيات GPS حصراً لحظة ضغط زر البصمة لإثبات التواجد داخل نطاق العمل، دون أي تتبع في الخلفية.</div>
  </div></div>`;
  refreshPwaButtons();
  $('#skew').style.display = skewWarn ? 'inline-block' : 'none';
  const empDaySched = key => {
    if (empOverrides.length) {
      let hit = null, best = 0;
      for (const ov of empOverrides) {
        if (!ov || !ov.from || !ov.to || key < ov.from || key > ov.to) continue;
        const r = ov.empId === token ? 3 : (!ov.empId && ov.dept && ov.dept === emp.dept) ? 2 : (ov.empId === '*' && !ov.dept) ? 1 : 0;
        if (r > best) { best = r; hit = ov; }
      }
      if (hit && hit.schedSnap) return { sc: normSched(hit.schedSnap), rot: hit.rotOffset != null ? (+hit.rotOffset || 0) : (emp.rotOffset || 0), note: hit.note || hit.schedSnap.name || '' };
    }
    return { sc: sched, rot: emp.rotOffset || 0, note: '' };
  };
  let planKey = '';
  const planHtml = key => {
    const { sc: dSc, rot: dRot, note: ovNote } = empDaySched(key);
    if (!dSc) return '';
    const b = baseDay(dSc, key, dRot);
    const tag = ovNote ? ` <small class="badge b-pri" style="font-size:11px">${esc(ovNote)}</small>` : '';
    if (!b.work) return `<span class="plan">${ic('sun', 18)} اليوم يوم راحة${tag}</span>`;
    if (dSc.mode === 'flex') return `<span class="plan">${ic('clock', 18)} المطلوب اليوم: ${fmtMinsH(b.flexMin)}${tag}</span>`;
    return `<span class="plan">${ic(b.periods[0].e > 1440 ? 'moon' : 'clock', 18)} ${b.shiftName ? esc(b.shiftName) + ': ' : 'دوامك: '}${b.periods.map(p => `${fmtHM(minHM(p.s))} – ${fmtHM(minHM(p.e))}`).join(' و ')}${tag}</span>${shiftBarHtml(b, key)}`;
  };
  /* شريط الدوام: نافذة الدوام المخططة على محور اليوم مع مؤشر «الآن» (يُحدَّث مع الساعة) */
  let sbRange = null;
  const shiftBarHtml = (b, key) => {
    if (!b.periods || !b.periods.length) { sbRange = null; return ''; }
    const s0 = Math.min(...b.periods.map(p => p.s)), e0 = Math.max(...b.periods.map(p => p.e));
    const lo = Math.max(0, Math.floor(s0 / 60) - 1) * 60, hi = Math.min(36, Math.ceil(e0 / 60) + 1) * 60, sp = Math.max(60, hi - lo);
    const pc = m => Math.max(0, Math.min(100, (m - lo) / sp * 100));
    sbRange = { lo, sp, key };
    return `<div class="shiftbar" role="img" aria-label="شريط الدوام">${b.periods.map(p => `<i class="pl" style="--a:${pc(p.s)}%;--w:${Math.max(1, pc(p.e) - pc(p.s))}%"></i>`).join('')}<i class="now" id="nowMark" style="--a:0%"></i></div><div class="sb-ends"><span>${fmtHM(minHM(lo))}</span><span>${fmtHM(minHM(hi))}</span></div>`;
  };
  clearInterval(window.__empClockTick);
  window.__empClockTick = setInterval(() => {
    if (!$('#clock')) return;
    const n = now();
    $('#clock').textContent = fmtTime(n, true);
    $('#dateTxt').textContent = `${weekday(n)} ${fmtDate(n)}`;
    const k = dayKey(n);
    if (k !== planKey) { planKey = k; $('#plan').innerHTML = planHtml(k); }
    const nm = $('#nowMark'); if (nm && sbRange) nm.style.setProperty('--a', Math.max(0, Math.min(100, ((n - dayStart(k)) / 60000 - sbRange.lo) / sbRange.sp * 100)) + '%');
  }, 500);

  let last = null;
  const inflightKey = 'att_inflight_' + token;
  /* سجل آخر 15 عملية: يُحفظ في الجهاز ولا يُعاد جلبه إلا إذا تغيّرت آخر عملية (lastRecId) أو مضى يوم.
     وبعد كل تسجيل ناجح يُضاف السجل الجديد محلياً بدل إعادة الجلب. */
  const HK = 'att_hist_' + token;
  let histRid = emp.lastRecId || '', histRows = null;
  const readHist = () => { try { const c = JSON.parse(localStorage.getItem(HK) || 'null'); return c && Array.isArray(c.rows) ? c : null; } catch { return null; } };
  const saveHist = rows => { try { localStorage.setItem(HK, JSON.stringify({ rid: histRid, day: dayKey(now()), rows: rows.map(r => ({ type: r.type, ms: r.t.getTime(), loc: r.locationName || '' })) })); } catch {} };
  /* سجلات الشهر الحالي كاملة (لا تقتصر على آخر 15): كاش محلي + قراءة تزايدية لما بعد آخر سجل محفوظ.
     قراءة كاملة جديدة عند تغيّر الشهر أو مرور أكثر من 3 أيام على آخر قراءة كاملة (لالتقاط تصحيحات الإدارة بأثر رجعي). */
  const MK = 'att_month_' + token, MONTH_FULL_MS = 3 * 86400e3, MONTH_CAP = 1500;
  const readMonth = () => { try { const c = JSON.parse(localStorage.getItem(MK) || 'null'); return c && Array.isArray(c.rows) ? c : null; } catch { return null; } };
  const toRec = d => { const x = d.data(); return { type: x.type, t: x.time && x.time.toDate ? x.time.toDate() : null, locationName: x.locationName || '' }; };
  async function loadMonth(force, addedRec = null) {
    const mk = dayKey(now()).slice(0, 7);
    const from = new Date(dayStart(mk + '-01').getTime() - 86400000);   // يوم قبل الشهر لإكمال الجلسة الليلية العابرة
    const col = collection(db, 'employees', token, 'records');
    const c = force ? null : readMonth();
    let rows = null, fullAt = Date.now();
    if (c && c.mk === mk && c.fullAt && Date.now() - c.fullAt < MONTH_FULL_MS && c.rows.length) {
      const cached = c.rows.map(r => ({ type: r.type, t: new Date(r.ms), locationName: r.loc || '' }));
      if (addedRec) {
        rows = mergeRecs(cached, [addedRec]); fullAt = c.fullAt;
      } else if (c.rid === histRid) {
        rows = cached; fullAt = c.fullAt;
      } else {
        const lastMs = cached[cached.length - 1].t.getTime();
        const s = await getDocs(query(col, where('time', '>', Timestamp.fromMillis(lastMs)), orderBy('time', 'asc'), limit(500)));
        rows = mergeRecs(cached, s.docs.map(toRec)); fullAt = c.fullAt;
      }
    }
    if (!rows) {
      const s = await getDocs(query(col, where('time', '>=', Timestamp.fromDate(from)), orderBy('time', 'asc'), limit(MONTH_CAP)));
      rows = mergeRecs([], s.docs.map(toRec));
    }
    try { localStorage.setItem(MK, JSON.stringify({ mk, rid: histRid, fullAt, rows: rows.map(r => ({ type: r.type, ms: r.t.getTime(), loc: r.locationName || '' })) })); } catch {}
    return { rows, mk, capped: rows.length >= MONTH_CAP };
  }
  async function loadHist(opt = {}) {
    let monthRes = null;
    try {
      let rows = null;
      if (opt.add && histRows) { rows = [opt.add, ...histRows].slice(0, 15); saveHist(rows); }
      if (!rows && !opt.force) {
        const c = readHist();
        if (c && histRid && c.rid === histRid && c.day === dayKey(now())) rows = c.rows.map(r => ({ type: r.type, t: new Date(r.ms), locationName: r.loc }));
      }
      // جلب سجلات الشهر أولاً واستخلاص آخر 15 عملية منها مباشرة لتوفير استعلام records منفصل
      monthRes = await loadMonth(!!opt.force, opt.add || null).catch(err => { console.warn(err); return null; });
      if (!rows && monthRes && monthRes.rows.length >= 15) {
        rows = monthRes.rows.slice(-15).reverse();
        saveHist(rows);
      }
      if (!rows) {
        const q = query(collection(db, 'employees', token, 'records'), orderBy('time', 'desc'), limit(15));
        const s = await getDocs(q);
        rows = s.docs.map(d => ({ ...d.data(), t: d.data().time?.toDate() })).filter(r => r.t);
        saveHist(rows);
      }
      histRows = rows;
      last = rows[0] || null;
      $('#hist').innerHTML = rows.length ? rows.map(r => `<tr><td><span class="badge ${r.type === 'in' ? 'b-ok' : 'b-bad'}">${r.type === 'in' ? 'حضور' : 'انصراف'}</span></td><td>${fmtDate(r.t)}</td><td>${fmtTime(r.t)}</td><td class="muted">${esc(r.locationName)}</td></tr>`).join('') : '<tr><td class="muted">لا توجد تسجيلات بعد</td></tr>';
    } catch (e) { logErr('emp-hist', e); $('#hist').innerHTML = '<tr><td class="muted">تعذر تحميل السجل</td></tr>'; }
    const n = now();
    const forgotLim = forgotLimitMs(sched);   // نفس مهلة اللوحة والتقارير (كانت 14 ساعة ثابتة على الجهاز)
    const canIn = !(last && last.type === 'in' && n - last.t < forgotLim);
    const maxOutSpan = Math.max(forgotLim * 2, 36 * 3600e3);
    const canOut = !!(last && last.type === 'in' && (n - last.t) <= maxOutSpan);
    $('#bIn').disabled = !canIn; $('#bOut').disabled = !canOut;
    $('#state').innerHTML = last ? (last.type === 'in' ? `<span class="badge b-ok">${ic('check', 16)} أنت حاضر منذ ${fmtTime(last.t)}</span>` : `<span class="badge b-mute">آخر انصراف ${fmtTime(last.t)}</span>`) : '';
    const box = $('#myMonthBox');
    if (box) {
      try {
        const { rows: allRows, mk, capped } = monthRes || await loadMonth(!!opt.force);
        const ses = pairSessions(allRows, forgotLim);
        const daysSet = new Set(ses.map(x => dayKey(x.start)).filter(k => k.startsWith(mk)));
        let totalMin = 0, lateDays = 0;
        daysSet.forEach(k => {
          const { sc: kSc, rot: kRot } = empDaySched(k);
          const met = calcDay(kSc, k, ses, hols, kRot, { nowMs: now().getTime(), cap: forgotLim });
          totalMin += met.net;
          if (met.late > 0) lateDays++;
        });
        const dCount = daysSet.size;
        const onTimePct = dCount ? Math.round(((dCount - lateDays) / dCount) * 100) : 100;
        const salInfo = (emp.payMode === 'monthly' && emp.payAmount > 0)
          ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-size:13.5px">الراتب الأساسي: <b>${emp.payAmount} د.ل</b>${emp.allowance ? ` + علاوات <b>${emp.allowance} د.ل</b>` : ''}${emp.loanTotal > 0 ? ` · متبقي سلفة: <b class="badge b-warn">${emp.loanTotal} د.ل</b>` : ''}</div>`
          : (emp.payMode === 'hourly' && emp.payAmount > 0)
          ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-size:13.5px">المستحق التقديري للشهر: <b>${((totalMin / 60) * emp.payAmount).toFixed(1)} د.ل</b> (${emp.payAmount} د.ل/ساعة)</div>` : '';
        box.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between">
          <span>أيام الحضور هذا الشهر: <b>${dCount}</b></span>
          <span>صافي الساعات: <b>${fmtDur(totalMin * 60000)}</b></span>
          <span>نسبة الانضباط: <b class="badge ${onTimePct >= 90 ? 'b-ok' : 'b-warn'}">${onTimePct}%</b></span>
        </div>${salInfo}${capped ? '<div class="muted" style="margin-top:6px;font-size:12px">عدد تسجيلات الشهر كبير؛ الملخص قد يكون ناقصًا.</div>' : ''}`;
      } catch (err) { console.warn(err); box.textContent = 'تعذر تحميل ملخص الشهر. تحقق من الاتصال.'; }
    }
  }

  const setMsg = (t, c = '') => { const m = $('#msg'); if (m) { m.className = 'status ' + c; m.textContent = t; } };
  const getPos = () => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }));
  const OFFQ_KEY = 'att_offq_' + token, GPS_PREV_KEY = 'att_gps_prev_' + token;
  const readOffQ = () => { try { const q = JSON.parse(localStorage.getItem(OFFQ_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; } };
  const saveOffQ = q => { try { localStorage.setItem(OFFQ_KEY, JSON.stringify(q.slice(0, 10))); } catch {} renderOffQ(); };
  function renderOffQ() {
    const box = $('#offQueueBox'); if (!box) return;
    const q = readOffQ();
    if (!q.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    box.innerHTML = `<div class="notice" style="margin-bottom:0">
      <b>📍 بصمات موثّقة بالـ GPS محفوظة دون اتصال (${q.length}):</b><br>
      ${q.map(x => `• ${x.type === 'in' ? 'حضور' : 'انصراف'} الساعة <b>${esc(x.hm)}</b> (${esc(x.day)}) — داخل «${esc(x.locationName)}» (${x.distance}م)`).join('<br>')}
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <button class="btn sm" id="btnFlushOffQ" type="button">${ic('send', 15)} إرسال للإدارة الآن</button>
        <small class="muted">تُرسل تلقائياً فور عودة الإنترنت</small>
      </div>
    </div>`;
    const b = $('#btnFlushOffQ');
    if (b) b.onclick = () => flushOfflineQueue(true);
  }
  async function queueOfflinePunch(type, posCoords, best) {
    const tNow = now();
    const day = dayKey(tNow), hmStr = minHM(localMin(tNow));
    const sig = await sha256Hex(`${token}|${type}|${day}|${hmStr}|${posCoords.latitude.toFixed(5)}|${posCoords.longitude.toFixed(5)}|${Math.round(best.d)}|${best.l.id}`);
    const q = readOffQ();
    q.push({
      type, day, hm: hmStr, ms: tNow.getTime(),
      lat: posCoords.latitude, lng: posCoords.longitude,
      accuracy: Math.round(posCoords.accuracy), distance: Math.round(best.d),
      locationId: best.l.id, locationName: best.l.name, sig: sig.slice(0, 16)
    });
    saveOffQ(q);
    setMsg(`لا يوجد اتصال بالإنترنت — تم توثيق ${type === 'in' ? 'حضورك' : 'انصرافك'} جغرافياً بالـ GPS داخل «${best.l.name}» (${Math.round(best.d)}م) وحفظه في طابور الجهاز؛ سيُرسل تلقائياً للإدارة فور عودة الإنترنت ✅`, 'good');
    loadHist();
  }
  let _flushingOffQ = false;
  async function flushOfflineQueue(manual = false) {
    if (_flushingOffQ || !navigator.onLine) { if (manual && !navigator.onLine) toast('لا يزال الجهاز دون اتصال بالإنترنت', 'err'); return; }
    const q = readOffQ();
    if (!q.length) return;
    _flushingOffQ = true;
    const rem = [];
    let sent = 0;
    for (const item of q) {
      try {
        await addDoc(collection(db, 'employees', token, 'requests'), {
          kind: 'fix',
          type: 'offline_gps',
          typeName: String(item.locationName || '').slice(0, 60),
          from: item.day,
          to: item.day,
          fixIn: item.type === 'in' ? item.hm : '',
          fixOut: item.type === 'out' ? item.hm : '',
          note: packOfflineNote(item),
          status: 'pending',
          empName: emp.name,
          createdAt: serverTimestamp()
        });
        sent++;
      } catch (e) {
        console.warn('offline flush failed:', e);
        rem.push(item);
      }
    }
    _flushingOffQ = false;
    saveOffQ(rem);
    if (sent > 0) {
      toast(`تم إرسال ${sent} بصمة أوفلاين موثّقة بالـ GPS إلى الإدارة للاعتماد ✅`, 'good');
      loadReqs();
    }
  }
  window.addEventListener('online', () => { flushOfflineQueue(false); });

  async function punch(type) {
    if (!navigator.geolocation) return setMsg('متصفحك لا يدعم تحديد الموقع.', 'err');
    if (!locs.length) return setMsg('لم تحدد الإدارة أي موقع عمل بعد.', 'err');
    try {
      const pendTs = +sessionStorage.getItem(inflightKey) || 0;
      if (Date.now() - pendTs < 25000) return setMsg('توجد عملية تسجيل قيد الإرسال حالياً — انتظر ثوانٍ ولا تُعد الضغط.', 'err');
    } catch {}
    if (last && now() - last.t < MIN_GAP_MS) return setMsg('تم تسجيلك للتو، انتظر لحظات ثم أعد المحاولة.', 'err');
    $('#bIn').disabled = $('#bOut').disabled = true;
    setMsg('جاري تحديد موقعك… (قد يستغرق بضع ثوانٍ)');
    let pos;
    try { pos = await getPos(); }
    catch (e) {
      setMsg(e.code === 1 ? 'تم رفض إذن الموقع. فعّل الإذن من إعدادات المتصفح ثم أعد المحاولة.' : 'تعذر تحديد موقعك. فعّل GPS وتأكد من الاتصال ثم أعد المحاولة.', 'err');
      return loadHist();
    }
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    if (accuracy > MAX_ACCURACY) { setMsg(`دقة الموقع ضعيفة (±${Math.round(accuracy)}م). فعّل GPS أو انتقل لمكان مفتوح وأعد المحاولة.`, 'err'); return loadHist(); }
    // فحص كشف الموقع الوهمي (Anti-GPS Spoofing) قبل السماح بالتسجيل
    let prevGps = null;
    try { prevGps = JSON.parse(localStorage.getItem(GPS_PREV_KEY) || 'null'); } catch {}
    const spoof = analyzeGpsSpoof(pos.coords, prevGps, Date.now());
    if (spoof.blocked) {
      setMsg(`رفض النظام البصمة: تم رصد مؤشرات موقع وهمي (${spoof.reasons.join('، ')}). أوقف أي تطبيق لتغيير الموقع وتحرك خطوات في مكان مفتوح ثم أعد المحاولة.`, 'err');
      return loadHist();
    }
    let best = null;
    for (const l of locs) { const d = dist(lat, lng, l.lat, l.lng); if (!best || d < best.d) best = { l, d }; }
    if (best.d > best.l.radius) { setMsg(`أنت خارج نطاق العمل. تبعد حوالي ${Math.round(best.d)} متر عن «${best.l.name}» (المسموح ${best.l.radius}م). لم يتم التسجيل.`, 'err'); return loadHist(); }
    try { localStorage.setItem(GPS_PREV_KEY, JSON.stringify({ lat, lng, acc: accuracy, ms: Date.now() })); } catch {}
    // إذا كان الهاتف غير متصل بالإنترنت لحظة البصمة، نحفظ البصمة الموثّقة بالـ GPS في طابور الأوفلاين الموقّع
    if (!navigator.onLine) {
      await queueOfflinePunch(type, pos.coords, best);
      return;
    }
    let recRef = null, punched = null;
    try {
      try { sessionStorage.setItem(inflightKey, String(Date.now())); } catch {}
      const devToUse = emp.deviceId || myDev;
      recRef = doc(collection(db, 'employees', token, 'records'));
      const batch = writeBatch(db);
      batch.set(recRef, { type, time: serverTimestamp(), lat, lng, accuracy: Math.round(accuracy), distance: Math.round(best.d), locationId: best.l.id, locationName: best.l.name, empName: emp.name, deviceId: devToUse });
      batch.update(ref, { state: type, lastAt: serverTimestamp(), lastRecId: recRef.id });
      const done = batch.commit();
      const first = await Promise.race([done.then(() => 'ok'), new Promise(r => setTimeout(() => r('slow'), 15000))]);
      if (first === 'slow') {
        setMsg('الشبكة بطيئة: التسجيل قيد الإرسال. لا تُعد الضغط — سيظهر في «آخر تسجيلاتك» فور وصوله.');
        done.then(() => { try { sessionStorage.removeItem(inflightKey); } catch {} setMsg('وصل التسجيل إلى الخادم', 'good'); histRid = recRef.id; emp.lastRecId = recRef.id; loadHist({ force: true }); }).catch(() => { try { sessionStorage.removeItem(inflightKey); } catch {} queueOfflinePunch(type, pos.coords, best); });
        return;
      }
      try { sessionStorage.removeItem(inflightKey); } catch {}
      setMsg(type === 'in' ? `تم تسجيل حضورك في «${best.l.name}»` : `تم تسجيل انصرافك من «${best.l.name}»`, 'good');
      histRid = recRef.id; emp.lastRecId = recRef.id; punched = { type, t: now(), locationName: best.l.name };
      if (type === 'in') scheduleEmpCheckoutReminder(now());
      else clearEmpCheckoutReminder();
    } catch (e) {
      try { sessionStorage.removeItem(inflightKey); } catch {}
      if (!navigator.onLine || (e && e.code === 'unavailable')) {
        await queueOfflinePunch(type, pos.coords, best);
        return;
      }
      setMsg(e.code === 'permission-denied' ? 'رفض الخادم التسجيل: تأكد أنك داخل نطاق العمل وأن آخر عملية لم تُسجَّل للتو، ثم أعد المحاولة.' : 'تعذر حفظ التسجيل. تحقق من الاتصال وحاول مجدداً.', 'err');
    }
    loadHist(punched ? { add: punched } : {});
  }

  /* ---------- طلبات الموظف: إجازة وتصحيح ---------- */
  const rqFormEl = $('#rqForm');
  const myLeaves = { list: [], ts: 0 };
  async function refreshMyLeaves(force = false) {
    if (!force && myLeaves.ts && Date.now() - myLeaves.ts < 300000) return myLeaves.list;
    try { const s = await getDocs(query(collection(db, 'employees', token, 'requests'), where('kind', '==', 'leave'), limit(500))); myLeaves.list = s.docs.map(d => d.data()); myLeaves.ts = Date.now(); } catch {}
    return myLeaves.list;
  }
  const annualLeft = () => { const yr = dayKey(now()).slice(0, 4), q = emp.leaveQuota ?? 21; const used = myLeaves.list.filter(r => r.status === 'approved' && leaveDeducts(r)).reduce((a, r) => a + countLeaveDays(r.from, r.to, sched, emp.rotOffset || 0, hols, yr), 0); return { q, used, rem: q - used, yr }; };
  const cntWork = (from, to) => (from && to && to >= from ? countLeaveDays(from, to, sched, emp.rotOffset || 0, hols) : 0);
  const showBal = () => { const b = $('#rqBal'); if (!b) return; const x = annualLeft(); b.style.display = 'block'; b.innerHTML = `${ic('sun', 18)} رصيد الإجازات ${x.yr} (أيام عمل): المتبقي <b>${x.rem} يوم</b> (المستهلك ${x.used} من ${x.q})`; };
  function showRqForm(kind) {
    rqFormEl.innerHTML = kind === 'leave' ? `
      <div class="g2" style="margin-top:12px;padding:14px;background:var(--surface);border-radius:16px;border:1px solid var(--line)">
        <div id="rqBal" class="field" style="grid-column:1/-1;background:var(--pri-l);padding:10px 14px;border-radius:12px;font-size:13px;display:none"></div>
        <div class="field"><label>نوع الإجازة</label><select id="rqType">${LT.map(x => `<option value="${esc(x.id)}">${esc(x.name)}${+x.pct < 100 ? ` (تُدفع ${+x.pct}% من الأجر)` : ''}</option>`).join('')}</select></div>
        <div class="field"><label>من تاريخ</label><input type="date" id="rqFrom"></div>
        <div class="field"><label>إلى تاريخ</label><input type="date" id="rqTo"></div>
        <div id="rqCnt" class="hint" style="grid-column:1/-1;margin:0"></div>
        <div class="field" style="grid-column:1/-1"><label>ملاحظة (اختياري)</label><input id="rqNote" maxlength="300"></div>
        <div style="grid-column:1/-1;display:flex;gap:8px"><button class="btn" id="rqSend" style="flex:1">إرسال الطلب للإدارة</button><button class="btn sec" id="rqCancel">إغلاق</button></div>
      </div>` : `
      <div class="g2" style="margin-top:12px;padding:14px;background:var(--surface);border-radius:16px;border:1px solid var(--line)">
        <div class="field"><label>يوم النسيان</label><input type="date" id="rqDay" max="${dayKey(now())}"></div>
        <div class="field"><label>وقت حضور</label><input type="time" id="rqIn"></div>
        <div class="field"><label>وقت انصراف</label><input type="time" id="rqOut"></div>
        <div class="field" style="grid-column:1/-1"><label>سبب النسيان / ملاحظة</label><input id="rqNote" maxlength="300"></div>
        <div style="grid-column:1/-1;display:flex;gap:8px"><button class="btn" id="rqSend" style="flex:1">إرسال الطلب للإدارة</button><button class="btn sec" id="rqCancel">إغلاق</button></div>
      </div>`;
    if (kind === 'loan') {
      rqFormEl.innerHTML = `<div class="g2" style="margin-top:12px;padding:14px;background:var(--surface);border-radius:16px;border:1px solid var(--line)">
        <div class="field"><label>مبلغ السلفة المطلوب (د.ل)</label><input type="number" id="rqLoanAmt" min="10" step="10" placeholder="500"></div>
        <div class="field"><label>القسط الشهري المقترح للخصم (د.ل)</label><input type="number" id="rqLoanInst" min="10" step="10" placeholder="100"></div>
        <div class="field" style="grid-column:1/-1"><label>سبب طلب السلفة</label><input id="rqNote" maxlength="300" placeholder="ظرف طارئ..."></div>
        <div style="grid-column:1/-1;display:flex;gap:8px"><button class="btn" id="rqSend" style="flex:1">إرسال طلب السلفة</button><button class="btn sec" id="rqCancel">إغلاق</button></div>
      </div>`;
    } else if (kind === 'cert') {
      rqFormEl.innerHTML = `<div class="g2" style="margin-top:12px;padding:14px;background:var(--surface);border-radius:16px;border:1px solid var(--line)">
        <div class="field"><label>نوع الإفادة المطلوبة</label><select id="rqCertType"><option value="with_salary">شهادة تعريف بالراتب</option><option value="work_only">إفادة عمل (بدون ذكر الراتب)</option></select></div>
        <div class="field"><label>الجهة الموجَّه إليها (اختياري)</label><input id="rqNote" maxlength="300" placeholder="مصرف الجمهورية / السفارة / إلى من يهمه الأمر"></div>
        <div style="grid-column:1/-1;display:flex;gap:8px"><button class="btn" id="rqSend" style="flex:1">طلب الإفادة</button><button class="btn sec" id="rqCancel">إغلاق</button></div>
      </div>`;
    }
    $('#rqCancel').onclick = () => { rqFormEl.innerHTML = ''; };
    if (kind === 'leave') {
      refreshMyLeaves().then(showBal);
      const upd = () => {
        const el = $('#rqCnt'); if (!el) return;
        const n = cntWork($('#rqFrom').value, $('#rqTo').value), x = LT.find(v => v.id === $('#rqType').value) || LT[0];
        el.textContent = n ? `أيام العمل المحتسبة: ${n} (تُستثنى أيام الراحة والعطل الرسمية)${+x.pct < 100 ? ` · تُدفع بنسبة ${+x.pct}% من الأجر` : ''}` : ($('#rqFrom').value && $('#rqTo').value ? 'لا يوجد يوم دوام في هذه الفترة' : '');
      };
      ['rqFrom', 'rqTo', 'rqType'].forEach(i => $('#' + i).addEventListener('change', upd));
    }
    $('#rqSend').onclick = async () => {
      const btn = $('#rqSend');
      if (btn) btn.disabled = true;
      try {
        const note = ($('#rqNote') ? $('#rqNote').value.trim() : '');
        if (kind === 'leave') {
          const from = $('#rqFrom').value, to = $('#rqTo').value;
          if (!from || !to || to < from) { if (btn) btn.disabled = false; return toast('حدد فترة إجازة صحيحة', 'err'); }
          const list = await refreshMyLeaves();
          for (const r of list) if ((r.status === 'approved' || r.status === 'pending') && !(to < r.from || from > r.to)) { if (btn) btn.disabled = false; return toast(`يوجد طلب إجازة (${r.status === 'approved' ? 'معتمد' : 'معلّق'}) يتعارض مع هذه الفترة (${r.from} إلى ${r.to})`, 'err'); }
          if (list.filter(r => r.status === 'pending').length >= 5) { if (btn) btn.disabled = false; return toast('لديك 5 طلبات إجازة بانتظار المراجعة — انتظر حتى تُراجَع قبل إرسال طلب جديد', 'err'); }
          if (daysBetween(from, to) + 1 > 90) { if (btn) btn.disabled = false; return toast('أقصى مدة للطلب الواحد 90 يوماً', 'err'); }
          const nWork = cntWork(from, to);
          if (!nWork) { if (btn) btn.disabled = false; return toast('هذه الفترة لا تتضمن أي يوم دوام (راحة أو عطل رسمية)', 'err'); }
          const lt = LT.find(v => v.id === $('#rqType').value) || LT[0];
          if (lt.deduct) { const x = annualLeft(); if (nWork > x.rem && !await mqConfirm(`أيام العمل المطلوبة (${nWork}) تتجاوز رصيدك المتبقي (${x.rem} يوم). هل تريد الإرسال رغم ذلك؟`)) { if (btn) btn.disabled = false; return; } }
          const lvDoc = { kind: 'leave', type: String(lt.id).slice(0, 40), typeName: String(lt.name).slice(0, 60), from, to, note, status: 'pending', empName: emp.name, createdAt: serverTimestamp() };
          await addDoc(collection(db, 'employees', token, 'requests'), lvDoc);
          myLeaves.list.push(lvDoc);
          rqFormEl.innerHTML = '';
          toast('أُرسل طلب الإجازة — بانتظار موافقة الإدارة', 'good');
        } else if (kind === 'loan') {
          const amt = parseFloat($('#rqLoanAmt').value), inst = parseFloat($('#rqLoanInst').value);
          if (!(amt > 0) || !(inst > 0) || inst > amt) { if (btn) btn.disabled = false; return toast('أدخل مبلغ السلفة والقسط الشهري بشكل صحيح', 'err'); }
          const kToday = dayKey(now());
          await addDoc(collection(db, 'employees', token, 'requests'), { kind: 'loan', type: String(amt), typeName: String(inst), from: kToday, to: kToday, note, status: 'pending', empName: emp.name, createdAt: serverTimestamp() });
          rqFormEl.innerHTML = ''; toast('أُرسل طلب السلفة للإدارة', 'good');
        } else if (kind === 'cert') {
          const ct = $('#rqCertType').value, kToday = dayKey(now());
          await addDoc(collection(db, 'employees', token, 'requests'), { kind: 'cert', type: ct, typeName: ct === 'with_salary' ? 'شهادة تعريف بالراتب' : 'إفادة عمل', from: kToday, to: kToday, note, status: 'pending', empName: emp.name, createdAt: serverTimestamp() });
          rqFormEl.innerHTML = ''; toast('أُرسل طلب الإفادة للإدارة', 'good');
        } else {
          const d = $('#rqDay').value, tin = $('#rqIn').value, tout = $('#rqOut').value;
          if (!d || (!tin && !tout)) { if (btn) btn.disabled = false; return toast('حدد اليوم والوقت المطلوب تصحيحه', 'err'); }
          if (d > dayKey(now())) { if (btn) btn.disabled = false; return toast('لا يمكن تقديم تصحيح ليوم في المستقبل', 'err'); }
          await addDoc(collection(db, 'employees', token, 'requests'), { kind: 'fix', type: '', typeName: '', from: d, to: d, fixIn: tin || '', fixOut: tout || '', note, status: 'pending', empName: emp.name, createdAt: serverTimestamp() });
          rqFormEl.innerHTML = '';
          toast('أُرسل طلب التصحيح — بانتظار موافقة الإدارة', 'good');
        }
        loadReqs();
      } catch (e) { if (btn) btn.disabled = false; console.error(e); toast('تعذر إرسال الطلب، حاول مجدداً', 'err'); }
    };
  }
  $('#rqLeave').onclick = () => showRqForm('leave');
  $('#rqLoan').onclick = () => showRqForm('loan');
  $('#rqCert').onclick = () => showRqForm('cert');
  $('#rqFix').onclick = () => showRqForm('fix');
  $('#rqList').onclick = async ev => {
    const bx = ev.target.closest('[data-cx]'); if (!bx || !await mqConfirm('إلغاء هذا الطلب؟')) return;
    try { await deleteDoc(doc(db, 'employees', token, 'requests', bx.dataset.cx)); myLeaves.ts = 0; toast('أُلغي الطلب', 'good'); loadReqs(); }
    catch { toast('تعذر الإلغاء (ربما روجع الطلب)', 'err'); }
  };
  const OUT_REM_KEY = 'att_out_rem_' + token;
  const REQ_ST_KEY = 'att_req_st_' + token;
  let _empOutTimer = null;

  function renderEmpSmartAlert(html, cls = 'notice') {
    const box = $('#empSmartAlert');
    if (!box) return;
    if (!html) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    box.innerHTML = `<div class="${cls}" style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div>${html}</div><button class="btn sm sec" type="button" onclick="this.parentElement.parentElement.style.display='none'">إغلاق</button></div>`;
  }

  function clearEmpCheckoutReminder() {
    if (_empOutTimer) { clearTimeout(_empOutTimer); _empOutTimer = null; }
    try { localStorage.removeItem(OUT_REM_KEY); } catch {}
    try { if ('serviceWorker' in navigator && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'MEQAT_CANCEL_OUT' }); } catch {}
  }

  function scheduleEmpCheckoutReminder(punchInMs) {
    clearEmpCheckoutReminder();
    const dKey = dayKey(new Date(punchInMs));
    const rem = calcCheckoutReminderMs(punchInMs, sched, dKey, emp, empOverrides, now());
    try { localStorage.setItem(OUT_REM_KEY, JSON.stringify({ inMs: punchInMs, fireAtMs: rem.fireAtMs, shiftEndHm: rem.shiftEndHm })); } catch {}
    const title = '⏰ تذكير بصمة الانصراف — ' + orgName;
    const body = rem.shiftEndHm
      ? `انتهى وقت ورديتك (${rem.shiftEndHm})، لا تنسَ تسجيل بصمة الانصراف لتفادي احتساب نسيان الانصراف.`
      : 'تذكير ودي: لا تنسَ تسجيل بصمة الانصراف قبل مغادرة موقع العمل.';
    if (rem.delayMs > 0 && rem.delayMs <= 24 * 3600000) {
      _empOutTimer = setTimeout(() => {
        MeqatNotify.send(title, body, 'meqat-checkout-reminder', 'warn');
        renderEmpSmartAlert(`<b>⏰ تذكير بصمة الانصراف:</b> ${esc(body)}`);
      }, rem.delayMs);
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(reg => {
            if (reg && reg.active) reg.active.postMessage({ type: 'MEQAT_SCHEDULE_OUT', delayMs: rem.delayMs, title, body, url: location.href });
          }).catch(() => {});
        }
      } catch {}
    }
  }

  // استئناف تذكير الانصراف المحفوظ إن كان الموظف لا يزال مسجلاً للدخول
  try {
    const savedRem = JSON.parse(localStorage.getItem(OUT_REM_KEY) || 'null');
    if (savedRem && emp.state === 'in' && savedRem.fireAtMs) {
      const remLeft = savedRem.fireAtMs - now();
      if (remLeft <= 0 && now() - savedRem.fireAtMs < 8 * 3600000) {
        renderEmpSmartAlert(`<b>⚠️ تنبيه نسيان الانصراف:</b> انتهى وقت الوردية${savedRem.shiftEndHm ? ' (' + esc(savedRem.shiftEndHm) + ')' : ''} وما زالت حالتك «حاضر». بادر بتسجيل الانصراف الآن.`);
      } else if (remLeft > 0) {
        scheduleEmpCheckoutReminder(savedRem.inMs || now());
      }
    } else if (emp.state === 'out') {
      clearEmpCheckoutReminder();
    }
  } catch {}

  async function loadReqs() {
    try {
      const q = query(collection(db, 'employees', token, 'requests'), orderBy('createdAt', 'desc'), limit(10));
      const s = await getDocs(q);
      // رصد تغيّر حالة الطلبات (موافقة / رفض) وإشعار الموظف فوراً بدون أي قراءة إضافية
      try {
        const prevMap = JSON.parse(localStorage.getItem(REQ_ST_KEY) || '{}');
        const reqItems = s.docs.map(d => ({ id: d.id, ...d.data() }));
        const { changed, nextMap } = diffReqStatusChanges(prevMap, reqItems);
        localStorage.setItem(REQ_ST_KEY, JSON.stringify(nextMap));
        if (changed.length) {
          const c0 = changed[0];
          const isOk = c0.status === 'approved';
          const kindAr = c0.kind === 'loan' ? 'طلب السلفة' : c0.kind === 'cert' ? 'طلب الإفادة' : c0.kind === 'leave' ? 'طلب الإجازة' : 'طلب التصحيح';
          const nTitle = isOk ? `✅ تمت الموافقة على ${kindAr}` : `⚠️ تم رفض ${kindAr}`;
          const nBody = c0.reason ? `ملاحظة الإدارة: ${c0.reason}` : (isOk ? 'تم اعتماد طلبك في السجل الرسمي بنجاح.' : 'راجع قسم الطلبات للاطلاع على التفاصيل.');
          MeqatNotify.send(nTitle, nBody, 'meqat-req-' + c0.id, isOk ? 'info' : 'warn');
          renderEmpSmartAlert(`<b>${esc(nTitle)}:</b> ${esc(nBody)}`);
        }
      } catch {}
      $('#rqList').innerHTML = s.docs.length ? s.docs.map(d => {
        const r = d.data();
        const st = r.status === 'pending' ? '<span class="badge b-warn">بانتظار المراجعة</span>' : r.status === 'approved' ? '<span class="badge b-ok">مقبول</span>' : '<span class="badge b-bad">مرفوض</span>';
        const det = r.kind === 'loan' ? `<b>طلب سلفة: ${esc(r.type)} د.ل</b> (قسط شهري: ${esc(r.typeName)} د.ل)` : r.kind === 'cert' ? `<b>طلب ${esc(r.typeName || 'إفادة عمل')}</b>` : r.kind === 'leave' ? `${esc(r.typeName || 'إجازة')} · من ${fmtDate(dayStart(r.from))} إلى ${fmtDate(dayStart(r.to))}` : `${r.type === 'offline_gps' ? '<span class="badge b-ok">📍 بصمة أوفلاين</span> ' : 'تصحيح '}${fmtDate(dayStart(r.from))}${r.fixIn ? ' · حضور ' + esc(r.fixIn) : ''}${r.fixOut ? ' · انصراف ' + esc(r.fixOut) : ''}${r.type === 'offline_gps' && r.typeName ? ' · ' + esc(r.typeName) : ''}`;
        return `<tr><td>${det}</td><td>${st}${r.status === 'pending' ? ` <button class="btn sm sec" data-cx="${d.id}">${ic('x', 15)} إلغاء</button>` : ''}</td></tr>`;
      }).join('') : '<tr><td class="muted">لا توجد طلبات بعد</td></tr>';
    } catch { $('#rqList').innerHTML = '<tr><td class="muted">تعذر تحميل طلباتك</td></tr>'; }
  }
  loadReqs();

  $('#bIn').onclick = () => punch('in');
  $('#bOut').onclick = () => punch('out');
  renderOffQ();
  flushOfflineQueue(false);
  loadHist();
}

/* =====================================================================
   واجهة موظف المهام (عمل حر): بلا بصمة، يُسجّل مهامه والإدارة تعتمد
   ===================================================================== */
async function taskWorkerApp(db, token, emp, orgName, cfgSt = null) {
  let types = [];
  const cv = cfgSt && cfgSt.exists() ? cfgSt.data().cfgVersion : null;
  let tkHit = null;
  try { const c = JSON.parse(localStorage.getItem('att_tk_cfg_v1') || 'null'); if (cv && c && c.v === cv && Array.isArray(c.types)) tkHit = c.types; } catch {}
  if (tkHit) types = tkHit;
  else {
    try {
      const s = await getDocs(collection(db, 'taskTypes'));
      types = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      if (cv) { try { localStorage.setItem('att_tk_cfg_v1', JSON.stringify({ v: cv, types: types.map(tsSer) })); } catch {} }
    } catch (e) { logErr('task-types', e); }
  }
  const price = id => { const o = emp.taskPrices && emp.taskPrices[id]; if (o != null) return +o || 0; const x = types.find(v => v.id === id); return x ? +x.price || 0 : 0; };
  const today = dayKey(new Date());
  root.innerHTML = `<div class="emp-bg"><div class="emp-wrap">
    <div class="emp-brand">
      <div class="emp-brand-l">${logoMark(28)}<span>${esc(orgName)}</span></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="pwa-btn" onclick="window.__installPWA()">${ic('download', 16)} تثبيت</button>
        ${themeBtnHtml()}
      </div>
    </div>
    <div class="emp-head"><div class="av lg">${ini(emp.name)}</div><div><small>موظف مهام${emp.dept ? ` · ${esc(emp.dept)}` : ''}</small><h1>${esc(emp.name)}</h1></div></div>
    <div class="card"><div class="ch"><div class="ch-l"><span class="chi">${ic('task', 24)}</span><h3>تسجيل مهمة منفّذة</h3></div></div>
      ${types.length ? `<div class="g2">
        <div class="field" style="grid-column:1/-1"><label>نوع المهمة</label><select id="tkType">${types.map(x => `<option value="${esc(x.id)}">${esc(x.name)} — ${price(x.id)} للوحدة</option>`).join('')}</select></div>
        <div class="field"><label>العدد المنفّذ</label><input type="number" id="tkQty" min="1" max="500" step="1" value="1" inputmode="numeric"></div>
        <div class="field"><label>تاريخ التنفيذ</label><input type="date" id="tkDay" value="${today}" max="${today}"></div>
        <div class="field" style="grid-column:1/-1"><label>ملاحظة / رابط الدليل (اختياري)</label><input id="tkNote" maxlength="300"></div>
        <button class="btn" id="tkSend" style="grid-column:1/-1">${ic('send', 18)} إرسال للإدارة للاعتماد</button></div>`
      : '<p class="muted" style="margin:0">لم تُضف الإدارة أنواع مهام بعد. تواصل معها.</p>'}
    </div>
    <div class="card"><div class="ch"><div class="ch-l"><span class="chi">${ic('payroll', 24)}</span><h3>حسابي هذا الشهر</h3></div></div><div id="tkSum" class="muted">…</div></div>
    <div class="card"><div class="ch"><div class="ch-l"><span class="chi">${ic('report', 24)}</span><h3>سجل مهامي</h3></div></div><div class="tw"><table><tbody id="tkList"><tr><td class="muted">…</td></tr></tbody></table></div></div>
  </div></div>`;
  refreshPwaButtons();
  async function load() {
    try {
      const s = await getDocs(query(collection(db, 'employees', token, 'requests'), orderBy('createdAt', 'desc'), limit(60)));
      const rows = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.kind === 'task');
      const mk = today.slice(0, 7);
      const ap = rows.filter(r => r.status === 'approved' && String(r.from).startsWith(mk));
      const pe = rows.filter(r => r.status === 'pending' && String(r.from).startsWith(mk));
      const sum = (a, f) => a.reduce((x, r) => x + f(r), 0);
      $('#tkSum').innerHTML = `<div class="stats" style="margin-bottom:0">
        <div class="stat"><div class="st-ic">${ic('check', 28)}</div><div><b>${Math.round(sum(ap, r => +r.amount || 0) * 100) / 100}</b><span>معتمد (${sum(ap, r => +(r.qtyApproved ?? r.qty) || 0)} وحدة)</span></div></div>
        <div class="stat"><div class="st-ic">${ic('clock', 28)}</div><div><b>${Math.round(sum(pe, r => (+r.qty || 0) * price(r.taskId)) * 100) / 100}</b><span>معلّق (${sum(pe, r => +r.qty || 0)} وحدة)</span></div></div>
      </div>`;
      $('#tkList').innerHTML = rows.length ? rows.map(r => {
        const st = r.status === 'pending' ? '<span class="badge b-warn">بانتظار الاعتماد</span>' : r.status === 'approved' ? `<span class="badge b-ok">معتمد · ${+r.amount || 0}</span>` : '<span class="badge b-bad">مرفوض</span>';
        return `<tr><td><b>${esc(r.taskName || '')}</b> × ${+(r.qtyApproved ?? r.qty) || 0}<div class="muted" style="font-size:12px">${fmtDate(dayStart(r.from))}</div></td><td>${st}${r.status === 'pending' ? ` <button class="btn sm sec" data-cx="${esc(r.id)}">${ic('x', 15)}</button>` : ''}</td></tr>`;
      }).join('') : '<tr><td class="muted">لا توجد مهام مسجّلة بعد</td></tr>';
    } catch { $('#tkList').innerHTML = '<tr><td class="muted">تعذر تحميل مهامك</td></tr>'; }
  }
  if ($('#tkSend')) $('#tkSend').onclick = async () => {
    const id = $('#tkType').value, qty = parseInt($('#tkQty').value, 10), day = $('#tkDay').value, x = types.find(v => v.id === id);
    if (!x) return toast('اختر نوع المهمة', 'err');
    if (!(qty >= 1 && qty <= 500)) return toast('العدد من 1 إلى 500', 'err');
    if (!day || day > today) return toast('حدد تاريخ تنفيذ صحيحاً (لا يكون في المستقبل)', 'err');
    try {
      await addDoc(collection(db, 'employees', token, 'requests'), { kind: 'task', type: 'task', typeName: '', taskId: id, taskName: String(x.name).slice(0, 80), qty, from: day, to: day, note: $('#tkNote').value.trim().slice(0, 300), status: 'pending', empName: emp.name, createdAt: serverTimestamp() });
      $('#tkQty').value = 1; $('#tkNote').value = '';
      toast('أُرسلت المهمة — بانتظار اعتماد الإدارة', 'good'); load();
    } catch (e) { console.error(e); toast(e.code === 'permission-denied' ? 'رُفض الطلب: قد يكون نوع المهمة تغيّر — أعد تحميل الصفحة' : 'تعذر الإرسال، حاول مجدداً', 'err'); }
  };
  $('#tkList').onclick = async ev => {
    const bx = ev.target.closest('[data-cx]'); if (!bx || !await mqConfirm('إلغاء هذه المهمة؟')) return;
    try { await deleteDoc(doc(db, 'employees', token, 'requests', bx.dataset.cx)); toast('أُلغيت المهمة', 'good'); load(); }
    catch { toast('تعذر الإلغاء (ربما رُوجعت)', 'err'); }
  };
  load();
}

/* =====================================================================
   نافذة تحميل ملفات النظام المحدّثة مباشرة
   ===================================================================== */
window.__downloadFile = async (url, filename) => {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const txt = await r.text();
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast(`تم بدء تحميل ${filename}`, 'good');
  } catch {
    toast(`تعذر تحميل ${filename}`, 'err');
  }
};
window.__openDownloadBox = () => {
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="modal" style="max-width:520px" role="dialog">
    <div class="mh"><h3>${ic('download', 22)} تحميل ملفات النظام المحدّثة</h3><button class="ib dark" id="__dlClose">${ic('x', 18)}</button></div>
    <div class="mb">
      <p class="hint" style="margin-top:0">جميع الملفات أدناه تتضمن كافة الإصلاحات البرمجية والتصميم الجديد جاهزة للرفع مباشرة على استضافتك:</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
        <div class="sch" style="margin:0;flex-direction:row;align-items:center;border-color:var(--ok);background:var(--ok-bg)">
          <div><b>🚀 التحديث السحابي المركزي (OTA) · الإصدار ${esc(MEQAT_CORE_VERSION)}</b><div class="muted" style="font-size:12.5px">جلب أحدث إصدار رسمي ودمج إعدادات وترخيص شركتك فيه بضغطة واحدة</div></div>
          <button class="btn sm ok" onclick="window.__checkAndApplyOta()">${ic('refresh', 16)} فحص وتحديث</button>
        </div>
        <div class="sch" style="margin:0;flex-direction:row;align-items:center">
          <div><b>index.html</b><div class="muted" style="font-size:12.5px">الملف الرئيسي الكامل للنظام (الإدارة + الموظف + المحرك)</div></div>
          <button class="btn sm" onclick="window.__downloadFile('index.html','index.html')">${ic('download', 16)} تحميل</button>
        </div>
        <div class="sch" style="margin:0;flex-direction:row;align-items:center">
          <div><b>sw.js</b><div class="muted" style="font-size:12.5px">خدمة العمل دون اتصال (PWA Service Worker)</div></div>
          <button class="btn sm" onclick="window.__downloadFile('sw.js','sw.js')">${ic('download', 16)} تحميل</button>
        </div>
        <div class="sch" style="margin:0;flex-direction:row;align-items:center">
          <div><b>manifest.json</b><div class="muted" style="font-size:12.5px">ملف تعريف تثبيت التطبيق للهواتف وسطح المكتب</div></div>
          <button class="btn sm sec" onclick="window.__downloadFile('manifest.json','manifest.json')">${ic('download', 16)} تحميل</button>
        </div>
        <div class="sch" style="margin:0;flex-direction:row;align-items:center">
          <div><b>icon.svg</b><div class="muted" style="font-size:12.5px">أيقونة شعار «مِيقَاتْ» الرسمية</div></div>
          <button class="btn sm sec" onclick="window.__downloadFile('icon.svg','icon.svg')">${ic('download', 16)} تحميل</button>
        </div>
      </div>
    </div>
    <div class="mf" style="justify-content:space-between">
      <button class="btn ok" id="__dlAll">${ic('download', 18)} تحميل كل الملفات دفعة واحدة</button>
      <button class="btn sec" id="__dlClose2">إغلاق</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('#__dlClose').onclick = close;
  ov.querySelector('#__dlClose2').onclick = close;
  ov.querySelector('#__dlAll').onclick = async () => {
    await window.__downloadFile('index.html', 'index.html');
    setTimeout(() => window.__downloadFile('sw.js', 'sw.js'), 350);
    setTimeout(() => window.__downloadFile('manifest.json', 'manifest.json'), 700);
    setTimeout(() => window.__downloadFile('icon.svg', 'icon.svg'), 1050);
  };
};

/* =====================================================================
   تسجيل دخول الإدارة
   ===================================================================== */
