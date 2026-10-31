  /* --- 6. تبويب الطلبات (إجازات وتصحيح ومهام) --- */
  function viewReqs(el) {
    const cname = empId => (S.emps.find(e => e.id === empId) || {}).name || 'موظف محذوف';
    const pend = S.reqs.filter(r => r.status === 'pending').sort((a, b) => b.cAt - a.cAt);
    const dec = S.reqs.filter(r => r.status !== 'pending').sort((a, b) => b.cAt - a.cAt).slice(0, 30);
    const det = r => {
      if (r.kind === 'leave') {
        const c = empCtx(r.empId), n = countLeaveDays(r.from, r.to, c.sc, c.rot, S.holKeys), lt = findLT(r);
        const pct = r.payPct != null ? +r.payPct : (lt ? +lt.pct : leavePct(r));
        return `<b>${esc(r.typeName || 'إجازة')}</b> من ${fmtDate(dayStart(r.from))} إلى ${fmtDate(dayStart(r.to))} <span class="badge b-pri">${n} يوم عمل</span>${pct < 100 ? ` <span class="badge b-warn">دفع ${pct}%</span>` : ''}`;
      }
      if (r.kind === 'loan') return `<b>طلب سلفة: ${esc(r.type)} د.ل</b> (قسط شهري: ${esc(r.typeName)} د.ل)`;
      if (r.kind === 'cert') return `<b>طلب ${esc(r.typeName || 'إفادة عمل')}</b>`;
      if (r.kind === 'task') return `<b>مهمة</b> ${esc(r.taskName || '')} × <b>${+(r.qtyApproved ?? r.qty) || 0}</b> · ${fmtDate(dayStart(r.from))}${r.status === 'approved' ? ` <span class="badge b-ok">${+r.amount || 0}</span>` : ''}`;
      if (r.type === 'offline_gps') {
        const meta = parseOfflineNote(r.note);
        return `<span class="badge b-ok">📍 بصمة أوفلاين موثّقة بالـ GPS</span> يوم ${fmtDate(dayStart(r.from))}${r.fixIn ? ` · حضور <b>${fmtHM(esc(r.fixIn))}</b>` : ''}${r.fixOut ? ` · انصراف <b>${fmtHM(esc(r.fixOut))}</b>` : ''}${r.typeName ? ` · <b>${esc(r.typeName)}</b>` : ''}${meta ? ` <span class="badge b-pri">${meta.dist}م (±${meta.acc}م)</span> <a class="btn sm sec" style="text-decoration:none;padding:2px 8px;font-size:11.5px" href="${mapLink(meta.lat, meta.lng)}" target="_blank">${ic('map', 13)} خريطة</a>` : ''}`;
      }
      return `<b>تصحيح</b> يوم ${fmtDate(dayStart(r.from))}${r.fixIn ? ` · حضور <b>${fmtHM(esc(r.fixIn))}</b>` : ''}${r.fixOut ? ` · انصراف <b>${fmtHM(esc(r.fixOut))}</b>` : ''}`;
    };
    const fmtReqNote = r => {
      if (r.type === 'offline_gps') {
        const meta = parseOfflineNote(r.note);
        return meta ? (meta.extraNote ? esc(meta.extraNote) : `<small class="muted" dir="ltr">بصمة موقّعة: ${esc(meta.sig || '')}</small>`) : esc(r.note || '—');
      }
      return esc(r.note || '—');
    };
    el.innerHTML = `<div class="card">${ch('send', `طلبات بانتظار المراجعة (${pend.length})`)}<div class="tw"><table><thead><tr><th>الموظف</th><th>تفاصيل الطلب</th><th>ملاحظة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
    ${pend.map(r => `<tr><td><div class="who"><span class="av">${ini(cname(r.empId))}</span>${esc(cname(r.empId))}</div></td><td>${det(r)}</td><td class="muted">${fmtReqNote(r)}</td><td><span class="badge b-warn">بانتظار المراجعة</span></td><td><div class="acts"><button class="btn sm ok" data-act="appr" data-id="${r.id}" data-e="${r.empId}">${ic('check', 16)} اعتماد</button> <button class="btn sm bad" data-act="rej" data-id="${r.id}" data-e="${r.empId}">${ic('x', 16)} رفض</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="muted center">لا توجد طلبات معلّقة حالياً</td></tr>'}
    </tbody></table></div></div>
    <div class="g2" style="align-items:start">
      <div class="card">${ch('check', 'آخر القرارات المعتمدة/المرفوضة')}<div class="tw"><table><thead><tr><th>الموظف</th><th>الطلب</th><th>القرار</th></tr></thead><tbody>
      ${dec.map(r => `<tr><td>${esc(cname(r.empId))}</td><td>${det(r)}</td><td><span class="badge ${r.status === 'approved' ? 'b-ok' : 'b-bad'}">${r.status === 'approved' ? 'مقبول' : 'مرفوض'}</span></td></tr>`).join('') || '<tr><td colspan="3" class="muted center">لا توجد قرارات بعد</td></tr>'}
      </tbody></table></div>${S.reqsFrom ? `<div style="padding:10px 14px"><button class="btn sm" data-act="moreReqs">تحميل طلبات أقدم (حتى ${+S.reqsFrom.slice(0, 4) - 1})</button></div>` : ''}</div>
      <div class="card">${ch('sun', `رصيد الإجازات السنوية — ${dayKey(new Date()).slice(0, 4)}`)}<div class="tw"><table><thead><tr><th>الموظف</th><th>الحصة</th><th>المستهلك</th><th>المتبقي</th></tr></thead><tbody>
      ${S.emps.filter(e => e.active && e.empType !== 'task').map(e => { const q = e.leaveQuota ?? 21, u = annualUsed(e.id, dayKey(new Date()).slice(0, 4)), rem = q - u; return `<tr><td><b>${esc(e.name)}</b></td><td>${q} يوم</td><td>${u} يوم</td><td><span class="badge ${rem < 0 ? 'b-bad' : rem <= 3 ? 'b-warn' : 'b-ok'}">${rem} يوم</span></td></tr>`; }).join('') || '<tr><td colspan="4" class="muted center">لا يوجد موظفون</td></tr>'}
      </tbody></table></div></div>
    </div>`;
  }

  /* --- 7. تبويب التقارير والرواتب والسجل (مقسّم إلى 3 تبويبات فرعية أنيقة بدون تكديس) --- */
  function filtered() {
    return S.recs.filter(r => { const k = dayKey(r.t); return k >= S.from && k <= S.to && (!S.emp || r.empId === S.emp); });
  }
  function notStarted(sc, key, rot) {
    if (!sc) return false;
    const b = baseDay(sc, key, rot); if (!b.work) return false;
    if (sc.mode === 'flex') return true;
    if (!b.periods.length) return false;
    return Math.floor(Date.now() / 60000 + TZOFF) % 1440 < b.periods[0].s + (sc.graceLate ?? 10);
  }
  const stopOf = e => e.active ? null : (e.archivedAt && e.archivedAt.toDate ? dayKey(e.archivedAt.toDate()) : '0000-00-00');
  let _sumC = null, _sumT = 0;
  const summary = () => { if (!_sumC || Date.now() - _sumT > 30000) { _sumC = computeSummary(); _sumT = Date.now(); } return _sumC; };
  /* فحص استثناءات الدوام المؤقتة وتبديل الورديات (رمضان / تغطية شفتات) ليوم محدد دون المساس بالأيام السابقة */
  function resolveDaySched(emp, dayKeyStr, scheds, overrides, fallbackSc, fallbackRot) {
    const list = Array.isArray(overrides) ? overrides : [];
    if (!list.length || !emp || !dayKeyStr) return { sc: fallbackSc, rot: fallbackRot, override: null };
    let hit = null, bestRank = 0;
    for (const ov of list) {
      if (!ov || !ov.from || !ov.to || dayKeyStr < ov.from || dayKeyStr > ov.to) continue;
      let rank = 0;
      if (ov.empId && ov.empId === emp.id) rank = 3;
      else if ((!ov.empId || ov.empId === '') && ov.dept && emp.dept && ov.dept === emp.dept) rank = 2;
      else if (ov.empId === '*' && !ov.dept) rank = 1;
      if (rank > bestRank) { bestRank = rank; hit = ov; }
    }
    if (!hit) return { sc: fallbackSc, rot: fallbackRot, override: null };
    const raw = (scheds || []).find(s => s.id === hit.scheduleId) || hit.schedSnap;
    return {
      sc: raw ? normSched(raw) : fallbackSc,
      rot: hit.rotOffset != null ? (+hit.rotOffset || 0) : fallbackRot,
      override: hit
    };
  }
  function computeSummary() {
    const out = [];
    const todayK = dayKey(new Date());   // الأيام بعد اليوم لا تُعد غيابًا (معاينة فترة لم تنتهِ)
    const byEmp = {};
    [...S.recs].sort((a, b) => a.t - b.t).forEach(r => (byEmp[r.empId] = byEmp[r.empId] || []).push(r));
    S.emps.filter(e => (e.active || (stopOf(e) && stopOf(e) > S.from)) && (!S.emp || e.id === S.emp)).forEach(e => { if (!byEmp[e.id]) byEmp[e.id] = []; });
    const ovList = S.set && Array.isArray(S.set.schedOverrides) ? S.set.schedOverrides : [];
    Object.entries(byEmp).forEach(([empId, rs]) => {
      if (S.emp && empId !== S.emp) return;
      const emp = S.emps.find(e => e.id === empId);
      if (!emp) return;
      if (emp.empType === 'task') return;
      const stopKey = stopOf(emp);
      const name = emp ? emp.name : (rs.length ? rs[rs.length - 1].empName : empId);
      const baseSc = emp && emp.scheduleId ? normSched(S.scheds.find(s => s.id === emp.scheduleId) || {}) : null;
      const baseRot = emp ? (emp.rotOffset || 0) : 0;
      const sd = emp ? emp.startDate : null;
      const lim = forgotLimitMs(baseSc);
      const sesAll = pairSessions(rs, lim);
      let k = S.from;
      while (k <= S.to) {
        const { sc, rot } = ovList.length ? resolveDaySched(emp, k, S.scheds, ovList, baseSc, baseRot) : { sc: baseSc, rot: baseRot };
        const dayLim = sc === baseSc ? lim : forgotLimitMs(sc);
        const ses = sesAll.filter(s => dayKey(s.start) === k);
        const met = calcDay(sc, k, ses, S.holKeys, rot, { nowMs: Date.now(), cap: dayLim });
        let status;
        if (ses.length) {
          const lastSes = ses[ses.length - 1];
          status = (met.open && lastSes && (Date.now() - lastSes.start) >= dayLim) ? 'forgot' : met.open ? 'open' : 'work';
          if (status === 'forgot') { met.raw = 0; met.net = 0; met.otMin = 0; met.otEq = 0; met.otRate = 0; met.early = 0; }
        }
        else if (onLeave(S.leaves, empId, k) && isLeaveDay(sc, k, rot, S.holKeys)) status = 'leave';
        else if (met.dayType === 'work' && met.planned > 0 && (!sd || k >= sd) && !(stopKey && k >= stopKey)) {
          if (k > todayK || (k === todayK && notStarted(sc, k, rot))) { k = addDays(k, 1); continue; }
          status = 'absent';
        }
        else { k = addDays(k, 1); continue; }
        out.push({ empId, name, day: k, met, status, lv: status === 'leave' ? getLeaveObj(S.leaves, empId, k) : null });
        k = addDays(k, 1);
      }
    });
    return out.sort((a, b) => b.day.localeCompare(a.day) || (a.name || '').localeCompare(b.name || '', 'ar'));
  }

  const dimOf = k => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).getUTCDate();
  /* سياسة «نسيان الانصراف»: كسر اليوم المخصوم (0 = بلا خصم … 1 = يوم كامل) — تحددها الإدارة من الدوام والإعدادات ثم إعدادات المنشأة */
  const forgotAlerts = () => { try { return summary().filter(s => s.status === 'forgot'); } catch { return []; } };
  const forgotDed = () => { const v = S.set ? S.set.forgotDeductDays : null; const n = (v === undefined || v === null || v === '') ? 0 : +v; return isNaN(n) ? 0 : Math.min(1, Math.max(0, n)); };
  const forgotTxt = () => { const d = forgotDed(); return d === 0 ? 'بلا خصم تلقائي (يُدفع اليوم كاملاً حتى تُصحَّح البصمة)' : d >= 1 ? 'خصم يوم كامل' : `خصم ${d === 0.25 ? 'ربع' : d === 0.5 ? 'نصف' : d} يوم`; };
/* حساب الاستقطاعات القانونية الليبية (قانون 18/2023): ضمان 5.125% + تضامن 1% + ضريبة دخل مع الإعفاء العائلي + دمغة 0.5% */
  function calcLibyanStatutory(gross, familyStatus = 'single') {
    if (!(gross > 0)) return { inss: 0, solid: 0, incomeTax: 0, stamp: 0, total: 0, employerInss: 0 };
    const inss = gross * 0.05125;           // حصة الموظف في الضمان الاجتماعي 5.125%
    const solid = gross * 0.01;             // التضامن الاجتماعي 1%
    const employerInss = gross * 0.1125;    // حصة جهة العمل (للعلم في التقارير)
    const exemp = familyStatus === 'kids' ? 275 : familyStatus === 'married' ? 200 : 150;
    const taxable = Math.max(0, gross - inss - solid - exemp);
    const incomeTax = taxable <= 1000 ? taxable * 0.05 : (1000 * 0.05) + ((taxable - 1000) * 0.10);
    const prelimNet = Math.max(0, gross - inss - solid - incomeTax);
    const stamp = prelimNet * 0.005;        // ضريبة الدمغة 0.5%
    return { inss, solid, incomeTax, stamp, total: inss + solid + incomeTax + stamp, employerInss };
  }

  /* فحص سريان المكافأة والجزاء حسب الشهر المحدد (adjMonth: YYYY-MM).
     إذا لم يُحدد adjMonth يسري الرقم على أي فترة (توافق كامل مع البيانات القديمة)، وإذا حُدّد يسري فقط على الفترة المتقاطعة مع ذلك الشهر. */
  function activeAdj(e, from, to) {
    const m = e && typeof e.adjMonth === 'string' ? e.adjMonth.trim() : '';
    const ok = !m || (!from || !to || (from.slice(0, 7) <= m && to.slice(0, 7) >= m));
    return { bonus: ok ? (+e.bonus || 0) : 0, penalty: ok ? (+e.penalty || 0) : 0, adjMonth: m, active: ok };
  }
  function payrollRows() {
    const agg = new Map();
    const blank = () => ({ net: 0, otMin: 0, otEq: 0, late: 0, early: 0, absent: 0, absentDays: [], daysWorked: 0, forgotDays: 0, forgotList: [], forgotPlan: 0, plMin: 0, plDays: 0, lv: [], lateK: 0, earlyK: 0, otK: 0 });
    summary().forEach(s => {
      const g = agg.get(s.empId) || blank();
      const dm = dimOf(s.day);
      if (s.status === 'work' || s.status === 'open') { g.net += s.met.net; g.otMin += s.met.otMin; g.otEq += (s.met.otEq || 0); g.otK += (s.met.otEq || 0) / dm; g.daysWorked++; }
      else if (s.status === 'forgot') { g.forgotDays++; g.forgotList.push(s.day); g.forgotPlan += (s.met.planned || 0); }
      else if (s.status === 'absent') { g.absent++; g.absentDays.push(s.day); }
      else if (s.status === 'leave' && s.lv) g.lv.push({ day: s.day, pct: leavePct(s.lv) / 100, plan: s.met.planned || 0 });
      g.late += s.met.late || 0; g.early += s.met.early || 0;
      g.lateK += (s.met.late || 0) / dm; g.earlyK += (s.met.early || 0) / dm;
      if ((s.status === 'work' || s.status === 'open' || s.status === 'absent') && s.met.planned > 0) { g.plMin += s.met.planned; g.plDays++; }
      agg.set(s.empId, g);
    });
    const emps = S.emps.filter(e => (e.empType === 'task' || ((e.payMode === 'monthly' || e.payMode === 'hourly') && (+e.payAmount || 0) > 0))
      && (e.active || (stopOf(e) && stopOf(e) > S.from)) && (!S.emp || e.id === S.emp));
    const FD = forgotDed();
    return emps.map(e => {
      const bankName = e.bankName || '', iban = e.iban || '', jobTitle = e.jobTitle || '', dept = e.dept || '', nationalId = e.nationalId || '';
      if (e.empType === 'task') {
        const rs = S.reqs.filter(r => r.kind === 'task' && r.status === 'approved' && r.empId === e.id && r.from >= S.from && r.from <= S.to);
        const base = rs.reduce((a, r) => a + (+r.amount || 0), 0), qty = rs.reduce((a, r) => a + (+(r.qtyApproved ?? r.qty) || 0), 0);
        return { empId: e.id, name: e.name, dept, jobTitle, nationalId, bankName, iban, pm: 'task', amt: 0, paidH: 0, otEq: 0, base, otPay: 0, allowBonus: 0, dedLate: 0, dedEarly: 0, dedAbs: 0, dedForgot: 0, dedLoan: 0, dedPen: 0, statDed: 0, statDetail: null, net: base, absent: 0, unpaidDays: 0, payDays: 0, lateMin: 0, earlyMin: 0, forgotDays: 0, taskQty: qty };
      }
      const g = agg.get(e.id) || blank();
      const pm = e.payMode, amt = +e.payAmount || 0;
      const regH = Math.max(0, g.net - g.otMin) / 60;
      let base = 0, otPay = 0, dedLate = 0, dedEarly = 0, dedAbs = 0, dedForgot = 0, payDays = 0, avgH = 8;
      if (pm === 'hourly') {
        const leavePay = g.lv.reduce((a, x) => a + (x.plan ? x.plan / 60 : 8) * amt * x.pct, 0);
        const forgotFull = (g.forgotPlan / 60) * amt;
        base = amt * regH + leavePay + forgotFull; otPay = amt * g.otEq;
        dedForgot = forgotFull * FD;
      } else {
        avgH = g.plDays ? Math.min(24, Math.max(1, g.plMin / g.plDays / 60)) : 8;
        const perHourUnit = amt / avgH;
        const from = (e.startDate && e.startDate > S.from) ? e.startDate : S.from;
        const stop = stopOf(e);
        const to = (stop && stop < S.to) ? stop : S.to;
        for (let k = from; k <= to; k = addDays(k, 1)) { base += amt / dimOf(k); payDays++; }
        const absDed = g.absentDays.reduce((a, dKey) => a + (amt / dimOf(dKey)), 0);
        const lvDed = g.lv.reduce((a, x) => a + (amt / dimOf(x.day)) * (1 - x.pct), 0);
        otPay = perHourUnit * g.otK;
        dedLate = perHourUnit * g.lateK / 60;
        dedEarly = perHourUnit * g.earlyK / 60;
        dedAbs = Math.min(base, absDed + lvDed);
        dedForgot = g.forgotList.reduce((a, dKey) => a + (amt / dimOf(dKey)), 0) * FD;
      }
      const adj = activeAdj(e, S.from, S.to);
      const allowBonus = (+e.allowance || 0) + adj.bonus;
      const dedPen = adj.penalty;
      const dedLoan = (+e.loanTotal > 0 && +e.loanInst > 0) ? Math.min(+e.loanTotal, +e.loanInst) : 0;
      const grossAfterAtt = Math.max(0, base + otPay + allowBonus - dedLate - dedEarly - dedAbs - dedForgot);
      const statDetail = e.lyStatutory ? calcLibyanStatutory(grossAfterAtt, e.familyStatus) : null;
      const statDed = statDetail ? statDetail.total : 0;
      const paidH = regH;
      const net = Math.max(0, grossAfterAtt - statDed - dedPen - dedLoan);
      return { empId: e.id, name: e.name, dept, jobTitle, nationalId, bankName, iban, pm, amt, paidH, otEq: g.otEq, base, otPay, allowBonus, dedLate, dedEarly, dedAbs, dedForgot, dedLoan, dedPen, statDed, statDetail, net, absent: g.absent, unpaidDays: g.lv.filter(x => x.pct === 0).length, payDays, lateMin: g.late, earlyMin: g.early, forgotDays: g.forgotDays, taskQty: 0 };
    });
  }

  /* ================= مسيّرات الرواتب المجمّدة ================= */
  const RUN_ST = { draft: ['b-warn', 'مسودة'], approved: ['b-pri', 'معتمد'], paid: ['b-ok', 'مصروف'] };
  const runBy = () => { const u = auth.currentUser; return { uid: u.uid, name: u.email || '' }; };
  const runRows = id => collection(db, 'payrollRuns', id, 'rows');
  const runCache = () => S.runRowsCache || (S.runRowsCache = new Map());
  async function loadRuns() {
    try {
      const s = await getDocs(query(collection(db, 'payrollRuns'), orderBy('createdAt', 'desc'), limit(36)));
      S.runs = s.docs.map(d => ({ id: d.id, ...d.data() })); S.runsErr = false;
    } catch (e) { console.warn(e); S.runs = []; S.runsErr = true; }
  }
  const refreshRuns = async () => { await loadRuns(); if ($('#content') && S.recSub === 'payroll') viewRecs($('#content')); };
  async function wipeRows(id) {
    runCache().delete(id);
    const old = await getDocs(runRows(id));
    for (let i = 0; i < old.docs.length; i += 400) { const b = writeBatch(db); old.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
  }
  /* ---- التصدير والقسائم من النسخة المحفوظة (مع كاش في الذاكرة لتجنب إعادة قراءة المسيّرات) ---- */
  async function runRowsOf(id, force = false) {
    const c = runCache();
    if (!force && c.has(id)) return c.get(id);
    const rows = (await getDocs(runRows(id))).docs.map(d => d.data());
    c.set(id, rows);
    return rows;
  }
  async function runSave(existingId) {
    if (!(isSuper() || isPay())) return toast('غير مسموح', 'err');
    if (S.emp) return toast('ألغِ فلتر الموظف أولًا: المسيّر يشمل كل الموظفين', 'err');
    if (!S.from || !S.to || S.from > S.to) return toast('حدد فترة صحيحة', 'err');
    if ((Date.parse(S.to) - Date.parse(S.from)) / 86400000 > 62) return toast('الفترة أطول من 63 يومًا', 'err');
    if (S.runs == null) await loadRuns();
    const clash = (S.runs || []).find(r => r.id !== existingId && r.from <= S.to && r.to >= S.from);
    if (clash) return toast(`الفترة تتداخل مع مسيّر محفوظ (${clash.from} ← ${clash.to})`, 'err');
    const live = payrollRows().filter(r => r.pm !== 'none');
    if (!live.length) return toast('لا توجد رواتب في هذه الفترة', 'err');
    const bad = live.find(r => !Number.isFinite(r.net));
    if (bad) return toast('رقم غير صالح عند ' + bad.name + '؛ راجع بياناته', 'err');
    const rows = live.map(r => buildRunRow(r, S.emps.find(e => e.id === r.empId), S.scheds));
    const totals = runTotals(rows);
    const inputs = { forgotDeductDays: forgotDed(), tzOffset: TZOFF, holKeys: (S.holKeys || []).filter(k => k >= S.from && k <= S.to), loanCount: rows.filter(x => +x.dedLoan > 0).length, build: 'runs-2' };
    const prevRun = (S.runs || []).filter(x => x.id !== existingId && x.to < S.from).sort((a, b) => String(b.to).localeCompare(String(a.to)))[0];
    let prevRows = [];
    if (prevRun) { try { prevRows = await runRowsOf(prevRun.id); } catch (e) { console.warn(e); } }
    const alerts = runAlertList(rows, prevRows);
    try {
      toast('جاري حفظ المسيّر…');
      let rid = existingId;
      if (existingId) await wipeRows(existingId);
      else { rid = doc(collection(db, 'payrollRuns')).id; await setDoc(doc(db, 'payrollRuns', rid), { from: S.from, to: S.to, status: 'draft', createdBy: runBy(), createdAt: serverTimestamp(), totals, inputs, empCount: rows.length }); }
      for (let i = 0; i < rows.length; i += 400) { const b = writeBatch(db); rows.slice(i, i + 400).forEach(x => b.set(doc(db, 'payrollRuns', rid, 'rows', x.empId), x)); await b.commit(); }
      if (existingId) await updateDoc(doc(db, 'payrollRuns', rid), { totals, inputs, empCount: rows.length, updatedAt: serverTimestamp() });
      runCache().set(rid, rows);
      logAudit('run_save', `${S.from} ← ${S.to}`, `حفظ مسودة مسيّر (${rows.length} موظف · الصافي: ${totals.net})`);
      toast(`حُفظ المسيّر كمسودة (${rows.length} موظف${alerts.length ? ` · ${runAlertSummary(alerts).warn} تحذير و${runAlertSummary(alerts).info} ملاحظة للمراجعة` : ''})`, 'good'); await refreshRuns();
    } catch (e) { console.error(e); toast(e && e.code === 'permission-denied' ? 'غير مسموح: انشر قواعد Firestore المحدثة أولًا' : 'تعذر حفظ المسيّر', 'err'); await refreshRuns(); }
  }
  async function runRecalc(id) {
    const run = (S.runs || []).find(r => r.id === id); if (!run || run.status !== 'draft') return;
    if (!await mqConfirm(`إعادة حساب المسودة (${run.from} ← ${run.to}) بالبيانات الحالية؟`)) return;
    S.from = run.from; S.to = run.to; S.emp = ''; _sumC = null; await loadRecs(); _sumC = null;
    await runSave(id);
  }
  async function runApprove(id) {
    const run = (S.runs || []).find(r => r.id === id); if (!run || run.status !== 'draft') return;
    if (!isSuper()) return toast('الاعتماد للمدير العام فقط', 'err');
    if (run.to >= dayKey(new Date())) return toast('لا يمكن اعتماد مسيّر قبل انتهاء فترته', 'err');
    if (!await mqConfirm(`اعتماد مسيّر ${run.from} ← ${run.to}؟\nبعد الاعتماد لا يمكن تعديل أرقامه أو حذفه. التصحيح يكون في الفترة التالية.`)) return;
    try {
      const snap = await getDocs(runRows(id));
      if (snap.size !== run.empCount) return toast(`عدد الصفوف (${snap.size}) لا يطابق المسجّل (${run.empCount}). أعد حساب المسودة.`, 'err');
      const rowData = snap.docs.map(d => d.data());
      runCache().set(id, rowData);
      const rowsHash = await runHash(snap.docs.map(d => ({ id: d.id, data: d.data() })));
      const loanRows = rowData.filter(r => +r.dedLoan > 0);
      if (loanRows.length) {   // تحقق مسبق متوازٍ مع دمج الخزينة المالية المعزولة (empFinance) إن وجدت
        const emps = {};
        await Promise.all(loanRows.map(async r => {
          const d = await getDoc(doc(db, 'employees', r.empId));
          if (!d.exists()) { emps[r.empId] = null; return; }
          let ed = d.data();
          if (ed.finIsolated) {
            const fd = await getDoc(doc(db, 'empFinance', r.empId));
            if (fd.exists()) ed = mergeEmpFinance(ed, fd.data());
          }
          emps[r.empId] = ed;
        }));
        const plan = planInstallments(loanRows, emps, id, runBy());
        if (plan.problems.length) return await mqAlert('لم يُعتمد المسيّر:\n' + plan.problems.join('\n'));
      }
      const prevRun = (S.runs || []).filter(x => x.id !== id && x.to < run.from).sort((a, b) => String(b.to).localeCompare(String(a.to)))[0];
      let prevRows = [];
      if (prevRun) { try { prevRows = await runRowsOf(prevRun.id); } catch (e) { console.warn(e); } }
      const alerts = runAlertList(rowData, prevRows);
      if (alerts.length) {
        const sm = runAlertSummary(alerts);
        if (!await mqConfirm(`تنبيهات المراجعة: ${sm.warn} تحذير و${sm.info} ملاحظة\n\n` + alerts.slice(0, 10).map(a => '• ' + a.text).join('\n') + (alerts.length > 10 ? `\n… و${alerts.length - 10} أخرى` : '') + '\n\nهل تعتمد المسيّر رغم ذلك؟')) return;
      }
      await updateDoc(doc(db, 'payrollRuns', id), { status: 'approved', approvedBy: runBy(), approvedAt: serverTimestamp(), rowsHash, rowsCount: snap.size });
      logAudit('run_approve', `${run.from} ← ${run.to}`, `اعتماد وتجميد المسيّر (${snap.size} موظف · البصمة: ${rowsHash.slice(0, 12)}…)`);
      toast('اعتُمد المسيّر وجُمّدت أرقامه', 'good');
      if (run.from.slice(0, 7) === run.to.slice(0, 7) && run.to < dayKey(new Date()).slice(0, 7) + '-01') {
        const mk = run.from.slice(0, 7), ms = dayStart(mk + '-01'), me = dayStart(nextMonthKey(mk) + '-01');
        const mRecs = (S.recs || []).filter(r => r.t && r.t >= ms && r.t < me);
        if (mRecs.length) saveMonthSummaryDoc(mk, mRecs).catch(() => {});
      }
      try { await runPostLedger(id, rowData); } catch (e) { console.error(e); toast('اعتُمد المسيّر لكن تعذر تسجيل قيود السلف؛ استخدم زر «قيود السلف» في بطاقة المسيّر', 'err'); }
      // تصفير المكافآت والجزاءات المؤقتة التي استُنفدت في هذا المسيّر لمنع تكرار صرفها أو خصمها في الشهر التالي
      try {
        const toClear = S.emps.filter(e => ((+e.bonus || 0) > 0 || (+e.penalty || 0) > 0) && activeAdj(e, run.from, run.to).active && rowData.some(r => r.empId === e.id));
        if (toClear.length) {
          for (let i = 0; i < toClear.length; i += 150) {
            const b = writeBatch(db);
            toClear.slice(i, i + 150).forEach(e => {
              b.update(doc(db, 'employees', e.id), { bonus: 0, penalty: 0, adjMonth: '' });
              if (e.finIsolated) b.set(doc(db, 'empFinance', e.id), { bonus: 0, penalty: 0, adjMonth: '', updatedAt: serverTimestamp() }, { merge: true });
            });
            await b.commit();
          }
          toClear.forEach(e => {
            e.bonus = 0; e.penalty = 0; e.adjMonth = '';
            if (e.finIsolated && S.finMap && S.finMap.has(e.id)) Object.assign(S.finMap.get(e.id), { bonus: 0, penalty: 0, adjMonth: '' });
          });
        }
      } catch (e) { console.warn('clear adj after approve:', e); }
      await refreshRuns();
    } catch (e) { console.error(e); toast(e && e.code === 'permission-denied' ? 'غير مسموح' : 'تعذر الاعتماد', 'err'); }
  }
  async function runPay(id) {
    const run = (S.runs || []).find(r => r.id === id); if (!run || run.status !== 'approved') return;
    if (!await mqConfirm('تسجيل أن هذا المسيّر صُرف فعلًا؟')) return;
    try { await updateDoc(doc(db, 'payrollRuns', id), { status: 'paid', paidBy: runBy(), paidAt: serverTimestamp() }); logAudit('run_pay', `${run.from} ← ${run.to}`, 'تسجيل صرف مسيّر الرواتب'); toast('سُجّل الصرف', 'good'); await refreshRuns(); }
    catch (e) { console.error(e); toast('تعذر تسجيل الصرف', 'err'); }
  }
  async function runVerify(id) {
    const run = (S.runs || []).find(r => r.id === id); if (!run || !run.rowsHash) return toast('لا بصمة لهذا المسيّر (مسودة)', 'err');
    try {
      const snap = await getDocs(runRows(id));
      runCache().set(id, snap.docs.map(d => d.data()));
      const h = await runHash(snap.docs.map(d => ({ id: d.id, data: d.data() })));
      if (h === run.rowsHash && snap.size === run.rowsCount) toast('سلامة المسيّر سليمة: الصفوف مطابقة لبصمة الاعتماد', 'good');
      else await mqAlert('تنبيه: صفوف هذا المسيّر لا تطابق بصمة الاعتماد. تم تعديلها أو حذف بعضها خارج التطبيق. راجع سجل Firebase.');
    } catch (e) { console.error(e); toast('تعذر التحقق', 'err'); }
  }
  async function runDel(id) {
    const run = (S.runs || []).find(r => r.id === id); if (!run || run.status !== 'draft') return;
    if (!await mqConfirm('حذف هذه المسودة؟')) return;
    try { await wipeRows(id); await deleteDoc(doc(db, 'payrollRuns', id)); logAudit('run_delete', `${run.from} ← ${run.to}`, 'حذف مسودة مسيّر رواتب'); toast('حُذفت المسودة', 'good'); await refreshRuns(); }
    catch (e) { console.error(e); toast('تعذر الحذف', 'err'); }
  }
  async function withRunRows(id, fn) {
    const run = (S.runs || []).find(r => r.id === id);
    if (!run) return toast('المسيّر غير موجود', 'err');
    try { const rows = await runRowsOf(id); return await fn(run, rows); }
    catch (e) { console.error(e); toast('تعذر تحميل صفوف المسيّر — تحقق من الاتصال وقواعد Firestore', 'err'); }
  }
  async function runExportExcel(id) {
    return withRunRows(id, async (run, rows) => {
      const XLSX = await loadXlsx();
      const pr = runPayRows(rows).filter(r => r.pm !== 'none');
      const rn = v => r2(v), T = run.totals || runTotals(pr);
      const stTextNow = (RUN_ST[run.status] || ['', run.status])[1];
      const when = t => (t && t.toDate ? fmtDate(t.toDate()) : '—');
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      const meta = [
        ['بيانات المسيّر المحفوظ'], [],
        ['الفترة', `${run.from} → ${run.to}`], ['الحالة', stTextNow], ['عدد الموظفين', pr.length],
        ['الصافي الإجمالي', rn(T.net)], ['أنشأه', (run.createdBy || {}).name || ''], ['اعتمده', (run.approvedBy || {}).name || ''],
        ['وقت الاعتماد', when(run.approvedAt)], ['صرفه', (run.paidBy || {}).name || ''], ['وقت الصرف', when(run.paidAt)],
        ['بصمة الصفوف (SHA-256)', run.rowsHash || '—'],
        ['ملاحظة', 'الأرقام معروضة كما حُفظت وقت إعداد المسيّر، ولا تتغير بتغيّر الراتب أو الجدول لاحقًا.']
      ];
      const wsM = XLSX.utils.aoa_to_sheet(meta);
      wsM['!cols'] = [{ wch: 24 }, { wch: 46 }];
      try { wsM['!views'] = [{ RTL: true }]; } catch {}
      XLSX.utils.book_append_sheet(wb, wsM, 'بيانات المسيّر');
      const aoa = [['الموظف', 'طريقة الأجر', 'قيمة الأجر', 'الأساسي', 'قيمة الإضافي', 'خصم التأخير', 'خصم المبكر', 'خصم الغياب', 'خصم نسيان الانصراف', 'علاوات/مكافآت', 'ضمان وضرائب', 'سلفة/جزاء', 'الصافي']];
      pr.forEach(r => aoa.push([xlSafe(r.name), r.pm === 'monthly' ? 'شهري' : r.pm === 'task' ? 'بالمهام' : 'بالساعة', rn(r.amt), rn(r.base), rn(r.otPay), rn(r.dedLate), rn(r.dedEarly), rn(r.dedAbs), rn(r.dedForgot), rn(r.allowBonus), rn(r.statDed), rn(r.dedLoan + r.dedPen), rn(r.net)]));
      aoa.push(['الإجمالي', '', '', rn(T.base), rn(T.otPay), rn(T.dedAtt), '', '', '', rn(T.allowBonus), rn(T.stat), rn(T.loan + T.pen), rn(T.net)]);
      const ws1 = XLSX.utils.aoa_to_sheet(aoa);
      ws1['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
      try { ws1['!views'] = [{ RTL: true }]; ws1['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 2, c: 12 } }) }; } catch {}
      XLSX.utils.book_append_sheet(wb, ws1, 'الرواتب المحفوظة');
      const bk = runBankRows(rows);
      if (bk.length) {
        const aoaB = [['الموظف', 'الرقم الوطني', 'المصرف', 'رقم الحساب / IBAN', 'صافي الراتب المستحق', 'الفترة']];
        bk.forEach(r => aoaB.push([xlSafe(r.name), xlSafe(r.nationalId), xlSafe(r.bankName), xlSafe(r.iban), rn(r.net), `${run.from} -> ${run.to}`]));
        const wsB = XLSX.utils.aoa_to_sheet(aoaB);
        wsB['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 16 }, { wch: 24 }];
        try { wsB['!views'] = [{ RTL: true }]; } catch {}
        XLSX.utils.book_append_sheet(wb, wsB, 'كشف مصرفي (IBAN)');
      }
      XLSX.writeFile(wb, `meqat_run_${run.from}_${run.to}.xlsx`);
      toast(`تم تصدير Excel من المسيّر المحفوظ (${pr.length} موظف)`, 'good');
    });
  }
  async function runExportBankCsv(id) {
    return withRunRows(id, async (run, rows) => {
      const pr = runBankRows(rows);
      if (!pr.length) return toast('لا توجد رواتب مستحقة للصرف في هذا المسيّر', 'err');
      const aoa = [['الموظف', 'الرقم الوطني', 'المصرف', 'رقم الحساب / IBAN', 'صافي الراتب المستحق', 'الفترة']];
      pr.forEach(r => aoa.push([r.name, r.nationalId, r.bankName, r.iban, r.net.toFixed(2), `${run.from} -> ${run.to}`]));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csvAoa(aoa)], { type: 'text/csv;charset=utf-8' }));
      a.download = `bank_disbursement_${run.from}_${run.to}.csv`; a.click();
      toast(`تم تنزيل كشف الصرف من المسيّر المحفوظ (${pr.length} موظف)`, 'good');
    });
  }
  async function runPrintSlips(id, empId = '') {
    return withRunRows(id, async (run, rows) => {
      if (!runPayRows(rows).filter(r => r.pm !== 'none' && (!empId || r.empId === empId)).length) return toast('لا توجد قسائم في هذا المسيّر', 'err');
      printPayslips(empId, { rows, from: run.from, to: run.to, status: run.status });
      if (run.status === 'draft') toast('تنبيه: هذه قسائم مسودة غير معتمدة', 'warn');
    });
  }
  /* ---- دفتر السلف ---- */
  const ledgerCol = id => collection(db, 'employees', id, 'loanLedger');
  async function runPostLedger(id, preloadedRows = null) {
    const run = (S.runs || []).find(r => r.id === id); if (!run || !['approved', 'paid'].includes(run.status)) return true;
    const allRows = preloadedRows || await runRowsOf(id);
    const rows = allRows.filter(r => +r.dedLoan > 0);
    if (!rows.length) return true;
    const checks = await Promise.all(rows.map(async r => {
      const ex = await getDoc(doc(db, 'employees', r.empId, 'loanLedger', 'inst_' + id));
      return ex.exists() ? null : r;
    }));
    const missing = checks.filter(Boolean);
    if (!missing.length) return true;
    const emps = {};
    await Promise.all(missing.map(async r => {
      const d = await getDoc(doc(db, 'employees', r.empId));
      if (!d.exists()) { emps[r.empId] = null; return; }
      let ed = d.data();
      if (ed.finIsolated) {
        const fd = await getDoc(doc(db, 'empFinance', r.empId));
        if (fd.exists()) ed = mergeEmpFinance(ed, fd.data());
      }
      emps[r.empId] = ed;
    }));
    const plan = planInstallments(missing, emps, id, runBy());
    if (plan.problems.length) { await mqAlert('تعذر تسجيل قيود السلف:\n' + plan.problems.join('\n')); return false; }
    for (let i = 0; i < plan.items.length; i += 8) {
      const b = writeBatch(db);
      plan.items.slice(i, i + 8).forEach(it => {
        const empObj = S.emps.find(x => x.id === it.empId);
        b.set(doc(db, 'employees', it.empId, 'loanLedger', it.id), { ...it.entry, at: serverTimestamp() });
        b.update(doc(db, 'employees', it.empId), { loanTotal: (empObj && empObj.finIsolated) ? null : it.newBalance });
        if (empObj && empObj.finIsolated) b.set(doc(db, 'empFinance', it.empId), { loanTotal: it.newBalance, updatedAt: serverTimestamp() }, { merge: true });
      });
      await b.commit();
    }
    plan.items.forEach(it => { const e = S.emps.find(x => x.id === it.empId); if (e) e.loanTotal = it.newBalance; });
    toast(`سُجّلت ${plan.items.length} قيود أقساط سلف`, 'good'); return true;
  }
  async function runLedgerAct(id) {
    try { const ok = await runPostLedger(id); if (ok) toast('قيود السلف مكتملة لهذا المسيّر', 'good'); }
    catch (e) { console.error(e); toast(e && e.code === 'permission-denied' ? 'غير مسموح: انشر قواعد Firestore المحدثة' : 'تعذر تسجيل القيود', 'err'); }
  }
  async function loanOpen() {
    try {
      const cand = S.emps.filter(e => +e.loanTotal > 0);
      const checks = await Promise.all(cand.map(async e => {
        const q = await getDocs(query(ledgerCol(e.id), limit(1)));
        return q.empty ? e : null;
      }));
      const need = checks.filter(Boolean);
      if (!need.length) return toast(cand.length ? 'كل الأرصدة القائمة لها قيود مسبقًا' : 'لا توجد أرصدة سلف قائمة', 'good');
      const tot = r2(need.reduce((a, e) => a + (+e.loanTotal || 0), 0));
      if (!await mqConfirm(`تسجيل قيد افتتاحي لـ ${need.length} موظف بإجمالي ${tot} د.ل؟\nلا يمكن تعديل القيد لاحقًا (التصحيح بقيد تسوية).`)) return;
      for (let i = 0; i < need.length; i += 100) {
        const b = writeBatch(db);
        need.slice(i, i + 100).forEach(e => { const v = r2(e.loanTotal); b.set(doc(db, 'employees', e.id, 'loanLedger', 'opening'), { type: 'opening', delta: v, balanceAfter: v, note: 'رصيد افتتاحي عند تفعيل دفتر السلف', by: runBy(), at: serverTimestamp() }); });
        await b.commit();
      }
      toast(`سُجّلت ${need.length} قيود افتتاحية`, 'good');
    } catch (e) { console.error(e); toast(e && e.code === 'permission-denied' ? 'غير مسموح: انشر قواعد Firestore المحدثة' : 'تعذر تسجيل القيود', 'err'); }
  }
  async function loanLog(empId) {
    const emp = S.emps.find(x => x.id === empId); if (!emp) return;
    let es;
    try { es = (await getDocs(query(ledgerCol(empId), orderBy('at', 'asc')))).docs.map(d => ({ id: d.id, ...d.data() })); }
    catch (e) { console.error(e); return toast('تعذر تحميل دفتر السلف', 'err'); }
    const ent = es.map(e => ({ ...e, atMs: e.at && e.at.toMillis ? e.at.toMillis() : 0 }));
    const v = verifyLedger(ent, emp.loanTotal);
    const m = x => r2(x).toString();
    openModal({
      title: `دفتر السلفة — ${emp.name}`, saveText: 'إغلاق',
      body: () => `<p class="hint" style="margin-top:0">الرصيد الحالي: <b>${m(emp.loanTotal)} د.ل</b> · القسط: <b>${m(emp.loanInst)} د.ل</b></p>
        <div class="${v.ok ? 'notice' : 'warnbox'}" style="margin-bottom:10px">${v.ok ? 'الدفتر سليم: القيود متسلسلة وتطابق الرصيد الحالي.' : '<b>تنبيه:</b><br>' + v.problems.map(esc).join('<br>')}</div>
        ${ent.length ? `<div class="tw"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>الحركة</th><th>الرصيد بعدها</th><th>ملاحظة/مرجع</th></tr></thead><tbody>${ent.map(e => `<tr><td>${e.at && e.at.toDate ? fmtDate(e.at.toDate()) : ''}</td><td>${esc(LEDGER_AR[e.type] || e.type)}</td><td dir="ltr" style="text-align:right"><b>${e.delta > 0 ? '+' : ''}${m(e.delta)}</b></td><td>${m(e.balanceAfter)}</td><td><small class="muted">${esc(e.note || (e.runId ? 'مسيّر ' + e.runId.slice(0, 6) : e.reqId ? 'طلب ' + e.reqId.slice(0, 6) : ''))}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted center">لا قيود بعد.</p>'}`,
      onSave: async () => {}
    });
  }
  async function runView(id) {
    const run = (S.runs || []).find(r => r.id === id); if (!run) return;
    let rows;
    try { rows = [...(await runRowsOf(id))].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar')); }
    catch (e) { console.error(e); return toast('تعذر تحميل الصفوف', 'err'); }
    const m = v => r2(v).toString(), T = run.totals || runTotals(rows), st = RUN_ST[run.status] || ['b-mute', run.status];
    // تنبيهات المراجعة تُحسب بمقارنة المسيّر المحفوظ بالمسيّر السابق الأقرب زمنيًا (مخدوم من الكاش)
    let prevRows = [];
    const prevRun = (S.runs || []).filter(x => x.id !== id && x.to < run.from).sort((a, b) => String(b.to).localeCompare(String(a.to)))[0];
    if (prevRun) { try { prevRows = await runRowsOf(prevRun.id); } catch (e) { console.warn(e); } }
    const alerts = runAlertList(rows, prevRows), sm = runAlertSummary(alerts);
    openModal({
      titleHtml: true, title: `مسيّر ${esc(run.from)} ← ${esc(run.to)} <span class="badge ${st[0]}">${st[1]}</span>`, saveText: 'إغلاق',
      body: () => `<div class="acts" style="margin-bottom:8px">
          <button class="btn sm sec" data-a="runXlsx" data-id="${run.id}">${ic('download', 16)} Excel (المحفوظ)</button>
          <button class="btn sm sec" data-a="runBankCsv" data-id="${run.id}">${ic('download', 16)} كشف مصرفي</button>
          <button class="btn sm sec" data-a="runSlips" data-id="${run.id}">${ic('print', 16)} كل القسائم</button>
        </div>
        <p class="hint" style="margin-top:0">أنشأه ${esc((run.createdBy || {}).name || '')}${run.approvedBy ? ` · اعتمده ${esc(run.approvedBy.name || '')}${run.approvedAt && run.approvedAt.toDate ? ' في ' + fmtDate(run.approvedAt.toDate()) : ''}` : ''}${run.paidBy ? ` · صرفه ${esc(run.paidBy.name || '')}` : ''}. الأرقام المعروضة هي المحفوظة وقت الإعداد ولا يُعاد حسابها من البيانات الحيّة.</p>
        ${alerts.length ? `<div class="warnbox" style="margin-bottom:10px"><b>تنبيهات المراجعة (${sm.warn} تحذير · ${sm.info} ملاحظة)</b>${prevRun ? ` — مقارنة بالمسيّر ${esc(prevRun.from)} ← ${esc(prevRun.to)}` : ''}<br>${alerts.slice(0, 12).map(a => '• ' + esc(a.text)).join('<br>')}${alerts.length > 12 ? `<br>… و${alerts.length - 12} أخرى` : ''}</div>` : '<div class="notice" style="margin-bottom:10px">لا تنبيهات مراجعة على هذا المسيّر.</div>'}
        <div class="tw"><table><thead><tr><th>الموظف</th><th>الأساسي</th><th>الإضافي</th><th>علاوات</th><th>خصم حضور</th><th>استقطاع قانوني</th><th>سلفة/جزاء</th><th>الصافي</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${m(r.base)}</td><td>${m(r.otPay)}</td><td>${m(r.allowBonus)}</td><td>${m((+r.dedLate || 0) + (+r.dedEarly || 0) + (+r.dedAbs || 0) + (+r.dedForgot || 0))}</td><td>${m(r.statDed)}</td><td>${m((+r.dedLoan || 0) + (+r.dedPen || 0))}</td><td><b>${m(r.net)}</b></td><td><button class="btn sm sec" data-a="runSlip" data-id="${run.id}" data-e="${esc(r.empId)}" title="قسيمة من النسخة المحفوظة">${ic('print', 14)}</button></td></tr>`).join('')}
        </tbody><tfoot><tr><td>الإجمالي (${T.count})</td><td>${m(T.base)}</td><td>${m(T.otPay)}</td><td>${m(T.allowBonus)}</td><td>${m(T.dedAtt)}</td><td>${m(T.stat)}</td><td>${m((T.loan || 0) + (T.pen || 0))}</td><td><b>${m(T.net)}</b></td><td></td></tr></tfoot></table></div>`,
      onAct: async (a, ds) => {
        if (a === 'runXlsx') return runExportExcel(ds.id);
        if (a === 'runBankCsv') return runExportBankCsv(ds.id);
        if (a === 'runSlips') return runPrintSlips(ds.id);
        if (a === 'runSlip') return runPrintSlips(ds.id, ds.e);
      },
      onSave: async () => {}
    });
  }
  function runsCard() {
    if (S.runs === undefined) { S.runs = null; loadRuns().then(() => { if ($('#content') && S.recSub === 'payroll') viewRecs($('#content')); }); }
    const m = v => r2(v).toString(), runs = S.runs || [];
    const body = S.runs === null ? '<p class="muted center" style="padding:14px 0">جاري التحميل…</p>'
      : S.runsErr ? '<p class="muted center" style="padding:14px 0">تعذر تحميل المسيّرات. تأكد من نشر قواعد Firestore المحدثة وأنك مدير عام أو محاسب رواتب.</p>'
      : !runs.length ? '<p class="muted center" style="padding:14px 0">لا توجد مسيّرات محفوظة بعد. اضبط فترة التقرير ثم اضغط «حفظ الفترة كمسودة».</p>'
      : `<div class="tw"><table><thead><tr><th>الفترة</th><th>الحالة</th><th>موظفون</th><th>الصافي</th><th>أنشأه</th><th>إجراءات</th></tr></thead><tbody>${runs.map(r => { const st = RUN_ST[r.status] || ['b-mute', r.status]; return `<tr><td>${esc(r.from)} ← ${esc(r.to)}</td><td><span class="badge ${st[0]}">${st[1]}</span></td><td>${(r.totals || {}).count ?? r.empCount ?? ''}</td><td><b>${m((r.totals || {}).net)}</b></td><td><small class="muted">${esc((r.createdBy || {}).name || '')}</small></td><td><div class="acts">
        <button class="btn sm sec" data-act="runView" data-id="${r.id}">عرض</button>
        <button class="btn sm sec" data-act="runXlsx" data-id="${r.id}" title="تصدير Excel من النسخة المحفوظة">Excel</button>
        <button class="btn sm sec" data-act="runBankCsv" data-id="${r.id}" title="كشف مصرفي من النسخة المحفوظة">كشف بنكي</button>
        <button class="btn sm sec" data-act="runSlips" data-id="${r.id}" title="قسائم من النسخة المحفوظة">قسائم</button>
        ${r.status === 'draft' ? `<button class="btn sm sec" data-act="runRecalc" data-id="${r.id}">إعادة حساب</button>${isSuper() ? `<button class="btn sm" data-act="runApprove" data-id="${r.id}">اعتماد</button>` : ''}<button class="btn sm bad" data-act="runDel" data-id="${r.id}">حذف</button>` : ''}
        ${r.status === 'approved' ? `<button class="btn sm" data-act="runPay" data-id="${r.id}">تسجيل الصرف</button>` : ''}
        ${r.rowsHash ? `<button class="btn sm sec" data-act="runVerify" data-id="${r.id}">تحقق من السلامة</button>` : ''}
        ${r.rowsHash && (r.inputs || {}).loanCount > 0 ? `<button class="btn sm sec" data-act="runLedger" data-id="${r.id}">قيود السلف</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>`;
    return `<div class="card">${ch('payroll', 'المسيّرات المحفوظة (مجمّدة)', `<div class="acts">${isSuper() ? `<button class="btn sm sec" data-act="loanOpen">${ic('check', 16)} قيد أرصدة السلف الافتتاحية</button>` : ''}<button class="btn sm" data-act="runSave">${ic('check', 16)} حفظ الفترة كمسودة</button></div>`)}
      <p class="hint" style="margin-top:0">يُحفظ المسيّر بأرقامه فلا تتغير لاحقًا بتغيّر الراتب أو الجدول. المسودة تقبل إعادة الحساب؛ بعد الاعتماد (للمدير العام) تُجمَّد ولا تُعدَّل ولا تُحذف، وأي تصحيح يُنفَّذ في الفترة التالية.</p>${body}</div>`;
  }

  function viewRecs(el) {
    if (!['super_admin', 'payroll_admin'].includes(S.role) && S.recSub === 'payroll') S.recSub = 'summary';
    if (S.recSub === 'payroll' && !S.finLoaded && (isSuper() || isPay()) && S.emps.some(e => e.finIsolated)) {
      ensureFinanceLoaded().then(() => { if ($('#content') && S.tab === 'recs' && S.recSub === 'payroll') viewRecs($('#content')); });
    }
    const sum = summary();
    const pay = payrollRows().filter(r => r.pm !== 'none');
    const raw = filtered();
    const ST = { work: ['b-ok', 'حضور'], open: ['b-warn', 'لم ينصرف'], forgot: ['b-warn', 'نسي الانصراف'], absent: ['b-bad', 'غياب'], leave: ['b-pri', 'إجازة'], holiday: ['b-mute', 'عطلة رسمية'], rest: ['b-mute', 'راحة'] };

    el.innerHTML = `<div class="card">
      ${ch('filter', 'فترة التقرير والتصدير', `<div class="acts">
        <button class="btn sm sec" data-act="xlsx">${ic('download', 18)} تصدير Excel</button>
        <button class="btn sm sec" data-act="impBio">${ic('plus', 18)} استيراد بصمات جهاز (ZKTeco/CSV)</button>
        <input type="file" id="bioFileInp" accept=".dat,.txt,.csv,.tsv" style="display:none">
        <button class="btn sm sec" data-act="csv">${ic('download', 18)} تصدير CSV</button>
        <button class="btn sm sec" data-act="print">${ic('print', 20)} طباعة كشف A4</button>
      </div>`)}
      <div class="row">
        <div class="field"><label>من تاريخ</label><input type="date" id="fFrom" value="${S.from}"></div>
        <div class="field"><label>إلى تاريخ</label><input type="date" id="fTo" value="${S.to}"></div>
        <div class="field"><label>تصفية حسب الموظف</label><select id="fEmp"><option value="">جميع الموظفين</option>${S.emps.map(e => `<option value="${e.id}" ${S.emp === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
        <button class="btn" data-act="filter">${ic('filter', 18)} تطبيق الفترة</button>
      </div>
    </div>

    <div class="subtabs">
      <button class="stab ${S.recSub === 'summary' ? 'on' : ''}" data-rsub="summary">${ic('clock', 20)} الملخص اليومي (${sum.length})</button>
      ${licFeatures().payroll === false || !['super_admin', 'payroll_admin'].includes(S.role) ? '' : `<button class="stab ${S.recSub === 'payroll' ? 'on' : ''}" data-rsub="payroll">${ic('payroll', 20)} مسير الرواتب الآلي (${pay.length})</button>`}
      <button class="stab ${S.recSub === 'raw' ? 'on' : ''}" data-rsub="raw">${ic('pin', 20)} سجل البصمات التفصيلي (${raw.length})</button>
    </div>

    ${S.recSub === 'summary' ? `
      <div class="card">${ch('clock', 'ملخص الدوام اليومي (حسب الجداول)')}<div class="tw"><table><thead><tr><th>الموظف</th><th>التاريخ</th><th>الحالة</th><th>أول حضور</th><th>آخر انصراف</th><th>متأخر</th><th>مبكر</th><th>صافي العمل</th><th>إضافي / مكافئ</th></tr></thead><tbody>
      ${sum.map(s => `<tr><td><div class="who"><span class="av">${ini(s.name)}</span>${esc(s.name)}</div></td><td>${s.day.split('-').reverse().join('/')}</td><td><span class="badge ${ST[s.status][0]}">${esc(s.status === 'leave' ? stText(s, ST_TXT) : ST[s.status][1])}</span></td><td>${s.met.firstIn ? fmtTime(s.met.firstIn) : '—'}</td><td>${s.met.lastOut ? fmtTime(s.met.lastOut) : '—'}</td><td>${s.met.late ? `<b class="badge b-warn">${fmtMinsH(s.met.late)}</b>` : '—'}</td><td>${s.met.early ? `<b class="badge b-warn">${fmtMinsH(s.met.early)}</b>` : '—'}</td><td><b>${fmtDur(s.met.net * 60000)}</b></td><td>${s.met.otMin ? `${(s.met.otMin / 60).toFixed(1)} س × ${s.met.otRate} = <b>${s.met.otEq.toFixed(1)}</b>` : '—'}</td></tr>`).join('') || '<tr><td colspan="9" class="muted center">لا توجد بيانات في هذه الفترة</td></tr>'}
      </tbody></table></div></div>`
    : S.recSub === 'payroll' ? `
      <div class="card">${ch('payroll', 'مسير الرواتب والاستحقاقات الآلي', `<div class="acts">
        <button class="btn sm sec" data-act="bankCsv">${ic('download', 16)} كشف مصرفي (IBAN)</button>
        <button class="btn sm sec" data-act="printSlips">${ic('print', 16)} طباعة كل القسائم</button>
      </div>`)}${(() => {
        if (!pay.length) return '<p class="muted center" style="padding:20px 0">لا يوجد موظف عليه راتب بعد — حدد طريقة الأجر وقيمته من تعديل بيانات الموظف ليظهر المسير.</p>';
        const m = v => (Math.round(v * 100) / 100).toString();
        const T = pay.reduce((a, r) => ({ base: a.base + r.base, otPay: a.otPay + r.otPay, ab: a.ab + (r.allowBonus || 0), dl: a.dl + r.dedLate + r.dedEarly, da: a.da + r.dedAbs + (r.dedForgot || 0), sl: a.sl + (r.statDed || 0), ln: a.ln + (r.dedLoan || 0) + (r.dedPen || 0), net: a.net + r.net }), { base: 0, otPay: 0, ab: 0, dl: 0, da: 0, sl: 0, ln: 0, net: 0 });
        return `<p class="hint" style="margin-top:0">محسوبة للفترة (من ${fmtDate(dayStart(S.from))} إلى ${fmtDate(dayStart(S.to))}). يشمل المسير: الأساسي، الإضافي، العلاوات والمكافآت، استقطاعات الحضور، الضمان والضرائب الليبية (للمفعّل لهم)، وأقساط السلف.</p><div class="tw"><table><thead><tr><th>الموظف</th><th>الأجر</th><th>الأساسي</th><th>الإضافي</th><th>علاوات/مكافأة</th><th>خصم تأخير/مبكر</th><th>خصم غياب/منسي</th><th>ضمان وضرائب</th><th>سلفة/جزاء</th><th>الصافي المستحق</th><th></th></tr></thead><tbody>
        ${pay.map(r => `<tr><td><div class="who"><span class="av">${ini(r.name)}</span><div>${esc(r.name)}${r.forgotDays ? ` <span class="badge b-warn" title="لم تُصحَّح بصمة انصرافها">${r.forgotDays} يوم منسي</span>` : ''}${r.iban ? `<small class="muted" style="display:block;direction:ltr">${esc(r.bankName)} · ${esc(r.iban)}</small>` : ''}</div></div></td><td><span class="badge ${r.pm === 'monthly' ? 'b-pri' : r.pm === 'task' ? 'b-warn' : 'b-ok'}">${r.pm === 'monthly' ? 'شهري ' + m(r.amt) : r.pm === 'task' ? 'بالمهام' : 'بالساعة ' + m(r.amt)}</span></td><td>${m(r.base)}</td><td><b>${m(r.otPay)}</b></td><td>${m(r.allowBonus || 0)}</td><td class="muted">${m(r.dedLate + r.dedEarly)}</td><td class="muted">${m(r.dedAbs + (r.dedForgot || 0))}</td><td class="muted" title="${r.statDetail ? `ضمان: ${m(r.statDetail.inss)} | تضامن: ${m(r.statDetail.solid)} | ضريبة: ${m(r.statDetail.incomeTax)} | دمغة: ${m(r.statDetail.stamp)}` : ''}">${m(r.statDed || 0)}</td><td class="muted">${m((r.dedLoan || 0) + (r.dedPen || 0))}</td><td><b class="badge b-ok" style="font-size:14px">${m(r.net)}</b></td><td><button class="btn sm sec" data-act="slipEmp" data-id="${r.empId}">${ic('print', 15)} قسيمة</button></td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="2">الإجمالي الكلي</td><td>${m(T.base)}</td><td>${m(T.otPay)}</td><td>${m(T.ab)}</td><td>${m(T.dl)}</td><td>${m(T.da)}</td><td>${m(T.sl)}</td><td>${m(T.ln)}</td><td><b class="badge b-ok" style="font-size:14.5px">${m(T.net)}</b></td><td></td></tr></tfoot></table></div>`;
      })()}</div>${runsCard()}`
    : (() => {
      const anom = detectRecAnomalies(raw);
      return `<div class="card">${ch('pin', `سجل عمليات البصمة التفصيلي (${raw.length})`)}${anom.size ? `<div class="warnbox" style="margin-bottom:10px"><b>تنبيه رقابي (${anom.size}):</b> رصد محرك فحص الإحداثيات بصمات تحمل مؤشرات غير طبيعية (تطابق عشري مطلق أو سرعة انتقال غير منطقية)؛ مرّر المؤشر على شارة التحذير بجانب البصمة للتفاصيل.</div>` : ''}<div class="tw"><table><thead><tr><th>الموظف</th><th>العملية</th><th>التاريخ</th><th>الوقت</th><th>الموقع</th><th>البعد</th><th>الخريطة</th></tr></thead><tbody>
      ${raw.map(r => {
        const issues = anom.get(r.empId + '/' + r.id);
        const flagHtml = issues ? ` <span class="badge b-warn" title="${esc(issues.join(' · '))}">⚠️ اشتباه GPS</span>` : (r.deviceId === 'offline-gps-verified' ? ' <span class="badge b-pri" title="بصمة أوفلاين موثّقة بالـ GPS">📍 أوفلاين</span>' : '');
        return `<tr><td><b>${esc(r.empName)}</b>${flagHtml}</td><td><span class="badge ${r.type === 'in' ? 'b-ok' : 'b-bad'}">${r.type === 'in' ? 'حضور' : 'انصراف'}</span></td><td>${fmtDate(r.t)}</td><td>${fmtTime(r.t, true)}</td><td>${esc(r.locationName)}</td><td>${r.distance} م</td><td><a class="btn sm sec" style="text-decoration:none" href="${mapLink(r.lat, r.lng)}" target="_blank">${ic('map', 15)} عرض</a></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="muted center">لا توجد بيانات في هذه الفترة</td></tr>'}
      </tbody></table></div></div>`;
    })()
    }`;
  }

