  /* --- 1. تبويب اليوم --- */
  function viewToday(el) {
    const nowMs = Date.now(), key = dayKey(new Date(nowMs));
    const act = S.emps.filter(e => e.active && e.empType !== 'task');
    const when = t => (dayKey(t) === key ? '' : fmtDate(t) + ' ') + fmtTime(t);
    const scOf = e => { const x = S.scheds.find(s => s.id === e.scheduleId); return x ? normSched(x) : null; };
    const B = { present: ['b-ok', 'حاضر'], late: ['b-warn', 'حاضر متأخر'], left: ['b-pri', 'انصرف'], forgot: ['b-warn', 'نسي الانصراف'], absent: ['b-bad', 'لم يحضر'], rest: ['b-mute', 'في راحة'], notyet: ['b-mute', 'لم يحن دوامه'], leave: ['b-pri', 'في إجازة'], holiday: ['b-mute', 'عطلة رسمية'] };
    const rows = act.map(e => {
      const { sc, rot: dayRot, override: dayOv } = resolveDaySched(e, key, S.scheds, S.set && S.set.schedOverrides, scOf(e), e.rotOffset || 0);
      const lim = forgotLimitMs(sc);
      const sesAll = pairSessions(S.today.filter(r => r.empId === e.id), lim);
      const lastSes = sesAll.length ? sesAll[sesAll.length - 1] : null;
      let st = 'absent';
      if (lastSes && !lastSes.end) st = nowMs - lastSes.start < lim ? 'present' : 'forgot';
      else if (lastSes && lastSes.end && dayKey(lastSes.end) === key) st = 'left';
      const ses = sesAll.filter(s => dayKey(s.start) === key);
      const met = calcDay(sc, key, ses, S.holKeys, dayRot, { nowMs, cap: lim });
      if (st === 'absent') {
        if (onLeave(S.leaves, e.id, key)) st = 'leave';
        else if (S.holKeys.includes(key) && met.dayType !== 'rest') st = 'holiday';
        else if (met.dayType === 'rest') st = 'rest';
        else if (S.holKeys.includes(key)) st = 'holiday';
        else if (e.startDate && key < e.startDate) st = 'rest';
        else if (met.dayType === 'work' && notStarted(sc, key, dayRot)) st = 'notyet';
      }
      if (st === 'present' && met.late > 0) st = 'late';
      const ovLabel = dayOv ? ` (${dayOv.note || 'استثناء'})` : '';
      const planTxt = (!sc ? 'بدون جدول'
        : S.holKeys.includes(key) ? 'عطلة رسمية'
        : met.dayType === 'work' ? (sc.mode === 'flex' ? `${fmtMinsH(met.planned)} (مرن)` : (met.shiftName || 'دوام مجدول'))
        : 'يوم راحة') + ovLabel;
      const firstShown = ses.length ? ses[0].start : (lastSes ? lastSes.start : null);
      const lastRec = S.today.filter(r => r.empId === e.id).sort((a, b) => b.t - a.t)[0];
      return { e, st, met, planTxt, firstShown, lastRec, segs: ses };
    });
    const c = s => rows.filter(r => r.st === s).length;
    const q = S.qToday.trim().toLowerCase();
    const shown = q ? rows.filter(r => (r.e.name || '').toLowerCase().includes(q) || (r.e.dept || '').toLowerCase().includes(q)) : rows;

    const todayK = dayKey(new Date()), soonK = addDays(todayK, 30);
    const expItems = [];
    S.emps.filter(e => e.active).forEach(e => {
      if (e.contractEnd && e.contractEnd <= soonK) expItems.push(`${esc(e.name)} (العقد: ${e.contractEnd < todayK ? 'منتهٍ منذ ' : 'ينتهي في '}${fmtDate(dayStart(e.contractEnd))})`);
      if (e.docExpiry && e.docExpiry <= soonK) expItems.push(`${esc(e.name)} (الوثيقة/الشهادة: ${e.docExpiry < todayK ? 'منتهية منذ ' : 'تنتهي في '}${fmtDate(dayStart(e.docExpiry))})`);
    });
    const expBanner = expItems.length ? `<div class="notice"><b>تنبيه وثائق وعقود (${expItems.length}):</b> ${expItems.join(' · ')}</div>` : '';
    const fgA = forgotAlerts();
    const fgBy = {}; fgA.forEach(s => { (fgBy[s.name] = fgBy[s.name] || []).push(s.day); });
    const fgBanner = fgA.length ? `<div class="notice" style="border-color:var(--warn)"><b>تنبيه: ${fgA.length} يوم نسيان انصراف لم تُصحَّح</b> (من ${fmtDate(dayStart(S.from))} إلى ${fmtDate(dayStart(S.to))})<br>${Object.entries(fgBy).map(([n, ds]) => `${esc(n)} — ${ds.length} ${ds.length === 1 ? 'يوم' : 'أيام'}: ${ds.sort().map(d => d.split('-').reverse().join('/')).join('، ')}`).join('<br>')}<br><small>السياسة الحالية: ${forgotTxt()}. عدّل البصمة من «التقارير والرواتب» ثم «سجل البصمات» أو من طلبات التصحيح، ويمكنك تغيير السياسة من «الدوام والإعدادات» ثم «إعدادات المنشأة».</small><div style="margin-top:8px"><button class="btn sm" data-tab="recs">${ic('report', 16)} فتح التقارير</button></div></div>` : '';
    /* ---- مسطرة الميقات: محور زمني موحّد لكل الصفوف (من أبكر بداية إلى أبعد نهاية، بحدّ أدنى 6ص–10م) ---- */
    const d0 = dayStart(key).getTime(), hrOf = ms => (ms - d0) / 3600000;
    let lo = 6, hi = 22;
    rows.forEach(r => { r.segs.forEach(x => { lo = Math.min(lo, Math.floor(hrOf(x.start.getTime ? x.start.getTime() : +x.start))); }); });
    hi = Math.max(hi, Math.min(30, Math.ceil(hrOf(nowMs)) + 1)); lo = Math.max(0, lo); hi = Math.min(30, Math.max(hi, lo + 6));
    const span = hi - lo, pos = h => Math.max(0, Math.min(100, (h - lo) / span * 100));
    const step = span > 18 ? 4 : 3, ticks = []; for (let h = Math.ceil(lo / step) * step; h <= hi; h += step) ticks.push(h);
    const hLabel = h => { const x = ((h % 24) + 24) % 24, ap = x >= 12 ? 'م' : 'ص', v = x % 12 || 12; return v + ap; };
    const hrsHtml = `<div class="hrs" aria-hidden="true">${ticks.map(h => `<span style="--a:${pos(h)}%">${hLabel(h)}</span>`).join('')}</div>`;
    const nowPos = pos(hrOf(nowMs));
    const tms = t => (t && t.getTime ? t.getTime() : +t);
    const rulerOf = (r, planMin) => {
      const { e, st, met } = r, parts = [];
      (planMin || []).forEach(p => parts.push(`<i class="pl" style="--a:${pos(p.s / 60)}%;--w:${Math.max(.5, pos(p.e / 60) - pos(p.s / 60))}%"></i>`));
      r.segs.forEach((x, k) => {
        const a = hrOf(tms(x.start)), open = !x.end, b = open ? hrOf(nowMs) : hrOf(tms(x.end));
        const cls = open ? (st === 'forgot' ? 'forgot open' : (st === 'late' && k === 0 ? 'late open' : 'open')) : (k === 0 && met.late > 0 ? 'late' : '');
        parts.push(`<i class="s ${cls}" style="--a:${pos(a)}%;--w:${Math.max(1.2, pos(b) - pos(a))}%"></i>`);
      });
      if (!r.segs.length && ['leave', 'holiday'].includes(st)) parts.push(`<i class="s lv" style="--a:${pos(8)}%;--w:${pos(16) - pos(8)}%"></i>`);
      if (!r.segs.length && st === 'absent') parts.push(`<span class="r-abs">لم يسجّل حضوراً بعد</span>`);
      return `<div class="ruler" style="--n:${Math.max(1, ticks.length - 1)}" role="img" aria-label="${esc(e.name)}: ${B[st][1]}">${parts.join('')}<i class="now" style="--a:${nowPos}%"></i></div>`;
    };
    const nIn = c('present') + c('late'), nOff = c('leave') + c('rest') + c('holiday') + c('notyet'), nBad = c('absent') + c('forgot');
    const tot = act.length || 1, R = 66, CIRC = 2 * Math.PI * R;
    const arcs = [[c('present'), 'var(--ok)'], [c('late'), 'var(--late)'], [c('left'), 'var(--pri)'], [nOff, 'var(--leave)'], [nBad, 'var(--abs)']];
    let off = 0;
    const ringSvg = `<svg viewBox="0 0 158 158" aria-hidden="true"><circle cx="79" cy="79" r="${R}" fill="none" stroke="var(--surface)" stroke-width="16"/>${arcs.map(([n, col]) => { const l = n / tot * CIRC, out = n ? `<circle cx="79" cy="79" r="${R}" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${Math.max(l - 3, .5)} ${CIRC}" stroke-dashoffset="${-off}"/>` : ''; off += l; return out; }).join('')}</svg>`;
    const lgd = (n, label, col) => `<div class="lg2" style="--k:${col}"><b class="num">${n}</b><span>${label}</span></div>`;
    const pendReq = S.reqs.filter(r => r.status === 'pending').length;
    const names = st => rows.filter(r => r.st === st).map(r => esc(r.e.name));
    const attn = [];
    if (c('forgot')) attn.push(['clock', 'late', `${c('forgot')} ${c('forgot') === 1 ? 'موظف نسي' : 'موظفين نسوا'} الانصراف`, names('forgot').slice(0, 2).join('، ') + (c('forgot') > 2 ? '…' : ''), '']);
    if (c('absent')) attn.push(['alert', 'abs', `${c('absent')} لم يحضروا رغم بدء دوامهم`, names('absent').slice(0, 3).join('، ') + (c('absent') > 3 ? '…' : ''), '']);
    if (pendReq) attn.push(['send', 'ok', `${pendReq} ${pendReq === 1 ? 'طلب ينتظر' : 'طلبات تنتظر'} القرار`, '', `<button class="btn sm sec" data-tab="reqs">راجعها</button>`]);
    if (expItems.length) attn.push(['sched', 'late', `${expItems.length} عقد أو وثيقة تنتهي قريباً`, 'التفاصيل في التنبيه أعلاه', '']);
    const attnHtml = attn.length ? attn.map(([i, k, t, sm, btn]) => `<div class="al al-${k}"><span class="ic">${ic(i, 20)}</span><div><b>${t}</b>${sm ? `<small>${sm}</small>` : ''}</div>${btn}</div>`).join('') : `<div class="al al-ok"><span class="ic">${ic('check', 20)}</span><div><b>لا شيء يحتاج انتباهك الآن</b><small>كل الحالات ضمن المتوقع</small></div></div>`;
    el.innerHTML = `${expBanner}${fgBanner}<div class="hero">
 <section class="panel sum" aria-label="ملخص الحضور"><div class="ring">${ringSvg}<div class="c"><b class="num">${nIn}<small>/${act.length}</small></b><span>داخل العمل الآن</span></div></div>
 <div class="legend">${lgd(c('present'), 'حاضرون في الوقت', 'var(--ok)')}${lgd(c('late'), 'متأخرون', 'var(--late)')}${lgd(c('left'), 'انصرفوا', 'var(--pri)')}${lgd(nOff, 'إجازة أو راحة أو عطلة', 'var(--leave)')}${lgd(c('absent'), 'لم يحضروا', 'var(--abs)')}${lgd(c('forgot'), 'نسوا الانصراف', 'var(--late)')}</div></section>
 <section class="panel attn" aria-label="يحتاج انتباهك"><div class="ph"><h3>يحتاج انتباهك</h3><span class="sp"></span>${attn.length ? `<span class="badge b-warn">${attn.length}</span>` : ''}</div><div class="alerts">${attnHtml}</div></section>
 </div>
    <section class="panel" style="margin-bottom:18px">
      <div class="ph"><h3>حالة اليوم — ${weekday(new Date())} ${fmtDate(new Date())}</h3><small>كل شريط هو دوام الموظف على محور الساعات</small><span class="sp"></span><div class="search-box"><span class="s-ic">${ic('search', 18)}</span><input id="qTodayInp" placeholder="ابحث عن موظف أو قسم…" value="${esc(S.qToday)}"></div></div>
      <div class="rhead"><span>الموظف</span><span>الحالة</span><span>الدخول والخطة</span>${hrsHtml}</div>
      <div class="tlist2">
 ${shown.map(r => {
 const { e, st, met, planTxt, firstShown, lastRec } = r;
 const stateTxt = B[st][1] + (st === 'late' && met.late ? ` ${fmtMinsH(met.late)}` : '');
 const worked = met.net > 0 ? `${fmtDur(met.net * 60000)}${met.open ? ' (جارٍ)' : ''}${met.otMin ? ` · إضافي ${(met.otMin / 60).toFixed(1)}س` : ''}` : '';
 const sc0 = scOf(e), base = sc0 ? baseDay(sc0, key, e.rotOffset || 0) : null;
 return `<div class="trow2"><div class="who"><span class="av">${ini(e.name)}</span><div class="tr-n"><b>${esc(e.name)}</b>${e.dept ? `<small>${esc(e.dept)}</small>` : ''}</div></div>
 <div class="tr-s"><span class="badge ${B[st][0]}">${stateTxt}</span>${worked ? `<small>${worked}</small>` : ''}</div>
 <div class="tr-t"><b class="num">${firstShown ? when(firstShown) : '—'}</b><small>${lastRec && lastRec.type === 'out' ? 'انصراف ' + when(lastRec.t) + ' · ' : ''}${esc(planTxt)}</small></div>
 ${rulerOf(r, base && base.work ? base.periods : [])}</div>`;
 }).join('') || '<div class="empty">لا توجد نتائج مطابقة</div>'}
      </div>
    </section>`;
    const inp = $('#qTodayInp');
    if (inp) inp.oninput = e => { S.qToday = e.target.value; viewToday(el); $('#qTodayInp').focus(); $('#qTodayInp').setSelectionRange(S.qToday.length, S.qToday.length); };
  }

  /* --- نوافذ منبثقة --- */
  function openModal(o) {
    const ov = document.createElement('div'); ov.className = 'ov'; document.body.appendChild(ov);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const close = () => { ov.remove(); document.body.style.overflow = prev; };
    let drawing = false, queued = false;
    const draw = () => {
      drawing = true;
      const keep = ov.querySelector('.mb') ? ov.querySelector('.mb').scrollTop : 0;
      ov.innerHTML = `<div class="modal" role="dialog"><div class="mh"><h3>${o.titleHtml ? o.title : esc(o.title)}</h3><button class="ib dark" data-m="close" aria-label="إغلاق">${ic('x', 18)}</button></div><div class="mb">${o.body()}</div><div class="mf"><button class="btn sec" data-m="close">إلغاء</button><button class="btn" data-m="save">${ic('check', 18)} ${o.saveText || 'حفظ'}</button></div></div>`;
      ov.querySelector('.mb').scrollTop = keep;
      drawing = false;
    };
    const redraw = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; draw(); }, 0); };
    const field = ev => {
      if (drawing) return;
      const el = ev.target.closest('[data-k]'); if (!el) return;
      const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : parseFloat(el.value)) : el.value;
      o.onField(el.dataset.k, v);
      if (ev.type === 'change' && el.hasAttribute('data-redraw')) redraw();
    };
    ov.addEventListener('input', field); ov.addEventListener('change', field);
    ov.addEventListener('click', async ev => {
      const m = ev.target.closest('[data-m]');
      if (m) {
        if (m.dataset.m === 'close') return close();
        m.disabled = true;
        try { const r = await o.onSave(); if (r === false) m.disabled = false; else close(); }
        catch (e) { console.error(e); toast(e.code === 'permission-denied' ? 'غير مسموح: حدّث قواعد Firestore ثم أعد المحاولة' : 'تعذر الحفظ [' + ((e && (e.code || e.message)) || '؟') + ']', 'err'); m.disabled = false; }
        return;
      }
      const a = ev.target.closest('[data-a]'); if (a && o.onAct) { try { await o.onAct(a.dataset.a, a.dataset); } catch (e) { logErr('modal-act', e); } redraw(); }
    });
    draw();
    return { draw, close };
  }
  function setPath(obj, path, v) {
    const ks = path.split('.'); let o = obj;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  /* --- محرر جدول الدوام --- */
  const PRESETS = [
    { label: 'نهاري/ليلي 12 ساعة (يومان نهاري، يومان ليلي، 4 راحة)', shifts: [{ id: 'd', name: 'نهاري', s: '07:00', e: '19:00' }, { id: 'n', name: 'ليلي', s: '19:00', e: '07:00' }], cycle: ['d', 'd', 'n', 'n', '', '', '', ''] },
    { label: 'صباحي/مسائي 8 ساعات (أسبوع لكل وردية، راحة يوم أسبوعياً)', shifts: [{ id: 'm', name: 'صباحي', s: '07:00', e: '15:00' }, { id: 'e', name: 'مسائي', s: '15:00', e: '23:00' }], cycle: ['m', 'm', 'm', 'm', 'm', 'm', '', 'e', 'e', 'e', 'e', 'e', 'e', ''] },
    { label: '24 ساعة عمل / 48 ساعة راحة', shifts: [{ id: 'x', name: '24 ساعة', s: '08:00', e: '08:00' }], cycle: ['x', '', ''] }
  ];
  const MODE_HINT = {
    fixed: 'أيام وأوقات ثابتة كل أسبوع، ويمكن إضافة فترة ثانية في اليوم للدوام المقسّم. إن كان وقت النهاية أصغر من البداية فهو دوام ليلي ينتهي في اليوم التالي.',
    rotation: 'ورديات تتكرر بدورة من أيام العمل والراحة (مصانع، مستشفيات، حراسة، مطاعم). كل موظف يُحدَّد له موضعه في الدورة.',
    flex: 'لا توجد أوقات حضور محددة، بل عدد ساعات مطلوب في اليوم، وما زاد عنها يُحسب إضافياً. مناسب للعمل الحر والمبيعات والفنيين.'
  };
  function scheduleEditor(ex) {
    const W = ex ? JSON.parse(JSON.stringify(ex)) : newSched();
    delete W.createdAt; delete W.updatedAt;
    W.days = W.days || {};
    for (let i = 0; i < 7; i++) { const d = W.days[i] = W.days[i] || { on: false }; if (!Array.isArray(d.p) || !d.p.length) d.p = [{ s: '08:00', e: '16:00' }]; if (!(d.h > 0)) d.h = 8; }
    W.shifts = W.shifts || []; W.cycle = W.cycle || []; W.ot = Object.assign({}, OT_DEF, W.ot || {});
    if (!W.anchor) W.anchor = dayKey(new Date());
    const tm = (k, v) => `<input type="time" data-k="${k}" value="${esc(v || '')}">`;
    const nm = (k, v, extra = '') => `<input class="num" type="number" inputmode="decimal" data-k="${k}" value="${v ?? ''}" ${extra}>`;
    const sel = (k, v, opts, redraw) => `<select data-k="${k}" ${redraw ? 'data-redraw' : ''}>${opts.map(([val, lab]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
    const body = () => {
      let h = `<div class="g2"><div class="field"><label>اسم الجدول</label><input data-k="name" value="${esc(W.name)}" placeholder="مثال: دوام الإدارة"></div><div class="field"><label>نوع الدوام</label>${sel('mode', W.mode, Object.entries(MODES), true)}</div></div><p class="hint">${MODE_HINT[W.mode]}</p>`;
      if (W.mode === 'fixed') {
        h += `<div class="sec-t">${ic('today', 20)} أيام الدوام وأوقاته</div>`;
        DAY_ORDER.forEach(i => {
          const d = W.days[i];
          h += `<div class="drow"><label class="dn"><input type="checkbox" data-k="days.${i}.on" data-redraw ${d.on ? 'checked' : ''}> ${DAY_NAMES[i]}</label>`;
          if (!d.on) h += `<span class="muted">يوم راحة</span>`;
          else {
            d.p.forEach((p, j) => { h += `<span class="tin">${j ? 'و' : 'من'} ${tm(`days.${i}.p.${j}.s`, p.s)} إلى ${tm(`days.${i}.p.${j}.e`, p.e)}${j ? `<button type="button" class="chip" data-a="rmP" data-i="${i}" data-j="${j}">${ic('x', 15)}</button>` : ''}</span>`; });
            if (d.p.length < 2) h += `<button type="button" class="chip" data-a="addP" data-i="${i}">${ic('plus', 15)} فترة ثانية</button>`;
          }
          h += `</div>`;
        });
        h += `<div class="sc"><button type="button" class="chip" data-a="copyAll">${ic('copy', 15)} تطبيق أوقات أول يوم عمل على باقي أيام العمل</button></div>`;
      }
      if (W.mode === 'flex') {
        h += `<div class="sec-t">${ic('clock', 20)} ساعات العمل المطلوبة يومياً</div>`;
        DAY_ORDER.forEach(i => { const d = W.days[i]; h += `<div class="drow"><label class="dn"><input type="checkbox" data-k="days.${i}.on" data-redraw ${d.on ? 'checked' : ''}> ${DAY_NAMES[i]}</label>${d.on ? `${nm(`days.${i}.h`, d.h, 'min="0" max="24" step="0.25"')} ساعة` : '<span class="muted">يوم راحة</span>'}</div>`; });
      }
      if (W.mode === 'rotation') {
        h += `<div class="sec-t">${ic('moon', 20)} قوالب جاهزة (اختياري)</div><div class="sc">${PRESETS.map((p, i) => `<button type="button" class="chip" data-a="preset" data-i="${i}">${p.label}</button>`).join('')}</div>`;
        h += `<div class="sec-t">${ic('clock', 20)} الورديات</div>`;
        W.shifts.forEach((x, i) => { h += `<div class="srow"><input class="nm" data-k="shifts.${i}.name" value="${esc(x.name)}" placeholder="اسم الوردية">${tm(`shifts.${i}.s`, x.s)}<span>إلى</span>${tm(`shifts.${i}.e`, x.e)}<button type="button" class="chip" data-a="rmShift" data-i="${i}">${ic('trash', 15)}</button></div>`; });
        h += `<div class="sc"><button type="button" class="chip" data-a="addShift">${ic('plus', 15)} إضافة وردية</button></div>`;
        h += `<div class="sec-t">${ic('refresh', 20)} دورة الأيام</div><p class="hint">اختر لكل يوم من الدورة وردية أو «راحة». تتكرر الدورة تلقائياً.</p><div class="cyc">`;
        W.cycle.forEach((c, i) => { h += `<label>اليوم ${i + 1}<select data-k="cycle.${i}"><option value="">راحة</option>${W.shifts.map(x => `<option value="${x.id}" ${c === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`; });
        h += `</div><div class="sc"><button type="button" class="chip" data-a="addDay">${ic('plus', 15)} إضافة يوم للدورة</button>${W.cycle.length ? `<button type="button" class="chip" data-a="rmDay">${ic('x', 15)} حذف آخر يوم</button>` : ''}</div>`;
        h += `<div class="field" style="max-width:260px"><label>تاريخ اليوم الأول من الدورة</label><input type="date" data-k="anchor" value="${esc(W.anchor)}"></div>`;
      }
      h += `<div class="sec-t">${ic('alert', 20)} التأخير والاستراحة</div><div class="g2">`;
      h += `<div class="field"><label>استراحة غير مدفوعة (دقيقة)</label>${nm('breakMin', W.breakMin, 'min="0"')}</div>`;
      if (W.mode !== 'flex') {
        h += `<div class="field"><label>سماح التأخير (دقيقة)</label>${nm('graceLate', W.graceLate, 'min="0"')}</div><div class="field"><label>سماح الخروج المبكر (دقيقة)</label>${nm('graceEarly', W.graceEarly, 'min="0"')}</div>`;
        h += `<div class="field" style="grid-column:1/-1"><label>طريقة احتساب التأخير بعد السماح</label>${sel('graceMode', W.graceMode, [['forgive', 'إن تجاوز السماح تُحتسب الدقائق كاملة'], ['excess', 'تُحتسب الدقائق التي تلي السماح فقط']])}</div>`;
      }
      h += `</div><p class="hint">تُخصم الاستراحة تلقائياً من أي يوم تتجاوز ساعات العمل فيه 4 ساعات.</p>`;
      h += `<div class="sec-t">${ic('payroll', 20)} العمل الإضافي</div><div class="g2">`;
      h += `<div class="field" style="grid-column:1/-1"><label>متى يُحسب العمل إضافياً؟</label>${sel('ot.mode', W.ot.mode, [['hours', 'ما زاد عن ساعات اليوم'], ['afterEnd', 'ما بعد نهاية الدوام الرسمي'], ['none', 'لا يوجد عمل إضافي']], true)}</div>`;
      if (W.ot.mode !== 'none') {
        h += `<div class="field"><label>حد الساعات اليومي (0 = ساعات الجدول)</label>${nm('ot.baseH', W.ot.baseH, 'min="0" step="0.25"')}</div>`;
        h += `<div class="field"><label>أقل إضافي يُحتسب (دقيقة)</label>${nm('ot.min', W.ot.min, 'min="0"')}</div>`;
        h += `<div class="field"><label>التقريب للأدنى كل</label>${sel('ot.step', W.ot.step, [[0, 'بدون تقريب'], [5, '5 دقائق'], [10, '10 دقائق'], [15, '15 دقيقة'], [30, '30 دقيقة'], [60, 'ساعة']])}</div>`;
        h += `<div class="field"><label>أقصى إضافي يومياً بالساعات (0 = بلا حد)</label>${nm('ot.capH', W.ot.capH, 'min="0" step="0.25"')}</div>`;
        h += `<div class="field"><label>معامل الإضافي في الأيام العادية</label>${nm('ot.rateNormal', W.ot.rateNormal, 'min="0" step="0.05"')}</div>`;
      }
      h += `</div><p class="hint">المعاملات للمحاسب: تُضرب بها ساعات الإضافي لتعطي الساعات المكافئة في التقارير.</p>`;
      // سياسة العمل في يوم الراحة والعطلة الرسمية (مستقلة عن وضع الإضافي في الأيام العادية)
      const MODE_OPTS = [['all', 'كل الساعات إضافية'], ['afterBase', 'عادية حتى حد، والزائد إضافي'], ['tiered', 'شرائح: معامل للأولى ومعامل أعلى للزائد'], ['fixed', 'بدل ثابت إن بلغ الحضور حدًّا أدنى'], ['normal', 'ساعات عادية فقط (بلا إضافي)']];
      const OFFDAY_HINT = {
        all: 'كل ساعة عمل تُضرب في المعامل. مثال: 6 ساعات × 2 = 12 ساعة مكافئة.',
        afterBase: 'الساعات حتى الحد تُحتسب عادية، وما زاد عنها يُضرب في المعامل. الحد 0 = أطول يوم في الجدول.',
        tiered: 'الشريحة الأولى (حتى الحد) بمعاملها، وما زاد بالمعامل الأعلى. الحد 0 = أطول يوم في الجدول.',
        fixed: 'إن عمل الموظف الحد الأدنى فأكثر يُمنح عددًا ثابتًا من الساعات المكافئة بغض النظر عن ساعاته الفعلية (مثال: يوم كامل = 8).',
        normal: 'لا إضافي: تُحتسب الساعات عادية. الموظف الشهري لا يتقاضى أكثر من راتبه الشهري على هذا اليوم.'
      };
      h += `<div class="sec-t">${ic('payroll', 20)} العمل في يوم الراحة والعطلة الرسمية</div>`;
      [['rest', 'يوم الراحة', 'rateRest'], ['hol', 'العطلة الرسمية', 'rateHoliday']].forEach(([p, lab, rk]) => {
        const md = OFFDAY_MODES.includes(W.ot[p + 'Mode']) ? W.ot[p + 'Mode'] : (W.ot.mode === 'none' ? 'normal' : 'all');
        h += `<div class="g2" style="margin-bottom:6px"><div class="field" style="grid-column:1/-1"><label>${lab}: كيف تُحتسب ساعات العمل؟</label>${sel('ot.' + p + 'Mode', md, MODE_OPTS, true)}</div>`;
        if (md !== 'normal') h += `<div class="field"><label>${md === 'fixed' ? 'معامل البدل' : md === 'all' ? 'معامل الساعات' : 'معامل الساعات الزائدة'}</label>${nm('ot.' + rk, W.ot[rk], 'min="0" step="0.05"')}</div>`;
        if (md === 'afterBase' || md === 'tiered') h += `<div class="field"><label>حد الساعات (0 = أطول يوم في الجدول)</label>${nm('ot.' + p + 'BaseH', W.ot[p + 'BaseH'] ?? 0, 'min="0" step="0.25"')}</div>`;
        if (md === 'tiered') h += `<div class="field"><label>معامل الشريحة الأولى</label>${nm('ot.' + p + 'RateBase', W.ot[p + 'RateBase'] ?? 1, 'min="0" step="0.05"')}</div>`;
        if (md === 'fixed') {
          h += `<div class="field"><label>الحد الأدنى للحضور (ساعات)</label>${nm('ot.' + p + 'MinH', W.ot[p + 'MinH'] ?? 0, 'min="0" step="0.25"')}</div>`;
          h += `<div class="field"><label>الساعات المكافئة الثابتة</label>${nm('ot.' + p + 'FixedH', W.ot[p + 'FixedH'] ?? 8, 'min="0" step="0.25"')}</div>`;
        }
        h += `</div><p class="hint" style="margin-top:0">${OFFDAY_HINT[md]}</p>`;
      });
      return h;
    };
    openModal({
      title: ex ? 'تعديل جدول الدوام' : 'جدول دوام جديد', body,
      onField: (k, v) => setPath(W, k, v),
      onAct: (a, d) => {
        const i = +d.i, j = +d.j;
        if (a === 'addP') W.days[i].p.push({ s: '17:00', e: '21:00' });
        if (a === 'rmP') W.days[i].p.splice(j, 1);
        if (a === 'copyAll') { const f = DAY_ORDER.find(x => W.days[x].on); if (f !== undefined) DAY_ORDER.forEach(x => { if (W.days[x].on) W.days[x].p = JSON.parse(JSON.stringify(W.days[f].p)); }); }
        if (a === 'preset') { const p = PRESETS[i]; W.shifts = JSON.parse(JSON.stringify(p.shifts)); W.cycle = [...p.cycle]; }
        if (a === 'addShift') W.shifts.push({ id: 's' + Math.random().toString(36).slice(2, 7), name: 'وردية ' + (W.shifts.length + 1), s: '08:00', e: '16:00' });
        if (a === 'rmShift') { const id = W.shifts[i].id; W.shifts.splice(i, 1); W.cycle = W.cycle.map(c => c === id ? '' : c); }
        if (a === 'addDay') W.cycle.push('');
        if (a === 'rmDay') W.cycle.pop();
      },
      onSave: async () => {
        const bad = m => { toast(m, 'err'); return false; };
        const c = JSON.parse(JSON.stringify(W)); delete c.id; delete c._n;
        c.name = (c.name || '').trim(); if (!c.name) return bad('اكتب اسم الجدول');
        if (c.mode === 'fixed') {
          const on = DAY_ORDER.filter(i => c.days[i].on); if (!on.length) return bad('فعّل يوماً واحداً على الأقل');
          for (const i of on) { c.days[i].p = c.days[i].p.filter(p => p.s && p.e); if (!c.days[i].p.length) return bad(`أكمل أوقات يوم ${DAY_NAMES[i]}`); }
        }
        if (c.mode === 'flex' && !DAY_ORDER.some(i => c.days[i].on && c.days[i].h > 0)) return bad('فعّل يوماً وحدد ساعاته');
        if (c.mode === 'rotation') {
          if (!c.shifts.length) return bad('أضف وردية واحدة على الأقل');
          if (c.shifts.some(x => !x.name.trim() || !x.s || !x.e)) return bad('أكمل اسم وأوقات كل وردية');
          if (!c.cycle.some(x => x)) return bad('أضف أيام الدورة واختر وردية ليوم واحد على الأقل');
          if (!c.anchor) return bad('حدد تاريخ اليوم الأول من الدورة');
        }
        ['breakMin', 'graceLate', 'graceEarly'].forEach(k => c[k] = Math.max(0, +c[k] || 0));
        ['baseH', 'min', 'step', 'capH', 'rateNormal', 'rateRest', 'rateHoliday', 'restBaseH', 'holBaseH', 'restMinH', 'holMinH', 'restFixedH', 'holFixedH'].forEach(k => { if (c.ot[k] != null) c.ot[k] = Math.max(0, +c.ot[k] || 0); });
        ['restRateBase', 'holRateBase'].forEach(k => { if (c.ot[k] != null) c.ot[k] = Math.max(0, +c.ot[k] || 0); });
        ['rest', 'hol'].forEach(p => { if (!OFFDAY_MODES.includes(c.ot[p + 'Mode'])) c.ot[p + 'Mode'] = c.ot.mode === 'none' ? 'normal' : 'all'; });
        delete c.ot.offDayAll;   // استُبدل بسياسة يوم الراحة/العطلة الصريحة
        c.updatedAt = serverTimestamp();
        if (ex) await setDoc(doc(db, 'schedules', ex.id), c); else await addDoc(collection(db, 'schedules'), { ...c, createdAt: serverTimestamp() });
        logAudit('sched_save', c.name, `${ex ? 'تعديل' : 'إنشاء'} جدول (${MODES[c.mode] || c.mode})`);
        await refresh('scheds'); toast('تم حفظ الجدول', 'good');
      }
    });
  }

/* --- محرر بيانات الموظف الشامل (360° + الرواتب الليبية + السلف + المصرف) --- */
  /* ---- الأجهزة والرمز: عرض الأجهزة المسجّلة، إلغاء جهاز بعينه، ضبط الحد الأقصى، وإصدار رمز مؤقت عشوائي ---- */
  async function deviceManager(e) {
    if (!e) return;
    const empRef = doc(db, 'employees', e.id);
    const W = { max: e.maxDevices || 2, joins: {}, pin: null, pinState: 'none', pinExp: 0, busy: false };
    await Promise.all([
      getDocs(collection(db, 'employees', e.id, 'joins')).then(js => js.docs.forEach(d => { W.joins[d.id] = d.data(); })).catch(() => {}),
      getDoc(doc(db, 'pins', e.id)).then(p => {
        const d = p.exists() ? p.data() : null;
        W.pinExp = d && d.exp && d.exp.toMillis ? d.exp.toMillis() : 0;
        W.pinState = W.pinExp > Date.now() ? 'active' : (d ? 'expired' : 'none');
      }).catch(() => {})
    ]);
    const stamp = t => t && t.toDate ? `${fmtDate(t.toDate())} ${fmtTime(t.toDate())}` : '';
    const devRows = () => {
      const map = e.devices || {}, ks = Object.keys(map);
      if (!ks.length) return `<p class="muted">${e.deviceId ? 'رابط قديم مربوط بجهاز واحد.' : 'لا توجد أجهزة مسجّلة بعد؛ أول جهاز يفتح الرابط يُسجَّل دون رمز.'}</p>`;
      return ks.map(k => {
        const j = W.joins[map[k]];
        return `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><div><b dir="ltr" style="font-size:12.5px;word-break:break-all">${j && j.ua ? esc(j.ua) : 'الجهاز الأول (سُجّل دون رمز)'}</b><div class="muted" style="font-size:12px">${esc(stamp(j && j.at))}</div></div><button class="btn sm bad" data-a="rev" data-key="${esc(k)}">إلغاء</button></div>`;
      }).join('');
    };
    const pinBox = () => W.pin
      ? `<div class="notice" style="text-align:center"><div class="muted">يُعرض مرة واحدة — صالح ${PIN_TTL_H} ساعة</div><div dir="ltr" style="font-size:26px;font-weight:800;letter-spacing:3px;margin:6px 0">${fmtPin(W.pin)}</div><div style="display:flex;gap:8px;justify-content:center"><button class="btn sm sec" data-a="copypin">نسخ</button><button class="btn sm ok" data-a="wapin">إرسال واتساب</button></div></div>`
      : `<p class="muted">${W.pinState === 'active' ? 'يوجد رمز صالح حتى ' + esc(fmtDate(new Date(W.pinExp)) + ' ' + fmtTime(new Date(W.pinExp))) + ' (لا يمكن عرضه مجددًا؛ أصدر رمزًا جديدًا إن ضاع).' : W.pinState === 'expired' ? 'الرمز السابق منتهٍ.' : 'لا يوجد رمز صالح.'}</p>`;
    const act = async (a, d) => {
      try {
        if (a === 'newpin') {
          const pin = genPin(); const exp = Date.now() + PIN_TTL_H * 3600e3;
          await setDoc(doc(db, 'pins', e.id), { pin, exp: Timestamp.fromMillis(exp), createdAt: serverTimestamp() });
          logAudit('dev_pin', e.name, 'إصدار رمز إضافة جهاز مؤقت (48 ساعة)');
          W.pin = pin; W.pinState = 'active'; W.pinExp = exp; toast('أُصدر رمز جديد وتوقف الرمز السابق', 'good');
        } else if (a === 'killpin') {
          await deleteDoc(doc(db, 'pins', e.id)); logAudit('dev_pin', e.name, 'إلغاء رمز إضافة الجهاز'); W.pin = null; W.pinState = 'none'; toast('أُلغي الرمز', 'good');
        } else if (a === 'copypin' && W.pin) {
          await navigator.clipboard.writeText(fmtPin(W.pin)); toast('تم النسخ', 'good');
        } else if (a === 'wapin' && W.pin) {
          const msg = `مرحباً ${e.name}، رمز إضافة جهاز جديد لرابطك في «${BRAND}»: ${fmtPin(W.pin)}\nصالح ${PIN_TTL_H} ساعة. لا تشاركه مع أحد.`;
          const l = document.createElement('a'); l.href = `https://wa.me/${e.phone || ''}?text=${encodeURIComponent(msg)}`; l.target = '_blank'; l.rel = 'noopener noreferrer'; l.click();
        } else if (a === 'rev') {
          const key = d.key, map = e.devices || {}, uidv = map[key];
          if (!uidv || !await mqConfirm('إلغاء هذا الجهاز؟ سيحتاج صاحبه رمزًا جديدًا لإضافته.')) return;
          const rest = Object.fromEntries(Object.entries(map).filter(([x]) => x !== key));
          if (Object.keys(rest).length) { await updateDoc(empRef, { devices: rest }); e.devices = rest; }
          else { await updateDoc(empRef, { deviceId: null, uid: null, devices: null, rebindProof: null }); e.devices = null; e.uid = null; e.deviceId = null; }
          try { await deleteDoc(doc(db, 'employees', e.id, 'joins', uidv)); } catch (e2) { logErr('join-delete', e2); }
          logAudit('dev_pin', e.name, 'إلغاء جهاز مرتبط: ' + key.slice(0, 8));
          delete W.joins[uidv]; toast('أُلغي الجهاز', 'good'); render();
        }
      } catch (err) { console.error(err); toast(err && err.code === 'permission-denied' ? 'غير مسموح: انشر قواعد Firestore المحدثة أولًا' : 'تعذرت العملية', 'err'); }
      m.draw();
    };
    const m = openModal({
      title: `الأجهزة والرمز — ${e.name}`, saveText: 'حفظ الحد الأقصى',
      body: () => `<p class="muted">الأجهزة المسجّلة (${e.devices ? Object.keys(e.devices).length : (e.deviceId ? 1 : 0)}/${W.max})</p>${devRows()}
        <div class="field" style="max-width:260px;margin-top:12px"><label>الحد الأقصى للأجهزة</label><select data-k="max">${[1, 2, 3].map(v => `<option value="${v}" ${W.max === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <h4 style="margin:16px 0 6px">رمز إضافة جهاز جديد</h4>${pinBox()}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="newpin">إصدار رمز جديد</button>${W.pinState === 'active' ? '<button class="btn sm sec" data-a="killpin">إلغاء الرمز الحالي</button>' : ''}</div>`,
      onField: (k, v) => { if (k === 'max') W.max = +v; },
      onAct: (a, d) => { act(a, d); },
      onSave: async () => {
        if (W.max !== (e.maxDevices || 2)) { await updateDoc(empRef, { maxDevices: W.max }); e.maxDevices = W.max; render(); toast('حُفظ الحد الأقصى للأجهزة', 'good'); }
      }
    });
  }
  async function employeeEditor(e0) {
    if (isSuper() || isPay()) await ensureFinanceLoaded();
    const e = S.emps.find(x => x.id === e0.id) || e0;
    const created = e.createdAt && e.createdAt.toDate ? dayKey(e.createdAt.toDate()) : dayKey(new Date());
    const W = {
      name: e.name || '', phone: e.phone || '', scheduleId: e.scheduleId || '', rotPos: (e.rotOffset || 0) + 1,
      startDate: e.startDate || created, dept: e.dept || '',
      jobTitle: e.jobTitle || '', nationalId: e.nationalId || '', contractEnd: e.contractEnd || '', docExpiry: e.docExpiry || '',
      bankName: e.bankName || '', iban: e.iban || '', bioId: e.bioId || '', assets: e.assets || '',
      payMode: e.payMode === 'monthly' || e.payMode === 'hourly' ? e.payMode : 'none', payAmount: e.payAmount ?? '',
      allowance: e.allowance ?? '', bonus: e.bonus ?? '', penalty: e.penalty ?? '', adjMonth: e.adjMonth || (S.to ? S.to.slice(0, 7) : dayKey(new Date()).slice(0, 7)),
      loanTotal: e.loanTotal ?? '', loanInst: e.loanInst ?? '',
      lyStatutory: !!e.lyStatutory, familyStatus: e.familyStatus || 'single',
      finIsolated: e.finIsolated !== undefined ? !!e.finIsolated : false,
      leaveQuota: e.leaveQuota ?? 21, empType: e.empType === 'task' ? 'task' : 'staff'
    };
    W.locs = {}; (e.locs || []).forEach(id => W.locs[id] = true);
    W.tp = {}; Object.entries(e.taskPrices || {}).forEach(([k, v]) => W.tp[k] = v);
    const body = () => {
      const sc = S.scheds.find(x => x.id === W.scheduleId);
      let h = `<div class="g2"><div class="field"><label>الاسم الثلاثي</label><input data-k="name" value="${esc(W.name)}"></div><div class="field"><label>رقم الواتساب</label><input data-k="phone" dir="ltr" value="${esc(W.phone)}" placeholder="2189XXXXXXXX"></div></div>`;
      h += `<div class="g2" style="margin-top:10px"><div class="field"><label>القسم / الفرع</label><input data-k="dept" value="${esc(W.dept)}" placeholder="المبيعات"></div><div class="field"><label>المسمى الوظيفي</label><input data-k="jobTitle" value="${esc(W.jobTitle)}" placeholder="محاسب / مهندس / مشرف"></div><div class="field"><label>الرقم الوطني / رقم الهوية</label><input data-k="nationalId" dir="ltr" value="${esc(W.nationalId)}" placeholder="1199XXXXXXXX"></div></div>`;
      h += `<div class="g2" style="margin-top:10px"><div class="field"><label>تاريخ انتهاء العقد (للتنبيه)</label><input type="date" data-k="contractEnd" value="${esc(W.contractEnd)}"></div><div class="field"><label>انتهاء الشهادة الصحية / الهوية</label><input type="date" data-k="docExpiry" value="${esc(W.docExpiry)}"></div></div>`;
      h += `<div class="field" style="max-width:380px;margin-top:10px"><label>نوع التوظيف</label><select data-k="empType" data-redraw><option value="staff" ${W.empType === 'staff' ? 'selected' : ''}>موظف دوام (بصمة وجدول)</option><option value="task" ${W.empType === 'task' ? 'selected' : ''}>موظف مهام — عمل حر (يُدفع له حسب المهام المنفّذة)</option></select></div>`;
      if (W.empType === 'task') {
        h += `<div class="sec-t">${ic('task', 20)} أسعار خاصة بهذا الموظف (اختياري)</div><p class="hint" style="margin-top:0">اترك الخانة فارغة ليُحتسب سعر الكتالوج. موظف المهام بلا بصمة ولا جدول ولا غياب ولا رصيد إجازات، وأجره = مجموع مهامه المعتمدة في الفترة.</p>`;
        h += S.taskTypes.length ? `<div class="g2">${S.taskTypes.map(x => `<div class="field"><label>${esc(x.name)} (الكتالوج: ${+x.price || 0})</label><input class="num" type="number" min="0" step="0.01" data-k="tp.${esc(x.id)}" value="${W.tp[x.id] ?? ''}"></div>`).join('')}</div>` : '<p class="muted">لا يوجد كتالوج مهام بعد — أضف أنواع المهام من تبويب «المهام».</p>';
        h += `<div class="sec-t">${ic('payroll', 20)} البيانات المصرفية (لكشف الصرف)</div><div class="g2"><div class="field"><label>اسم المصرف</label><input data-k="bankName" value="${esc(W.bankName)}" placeholder="مصرف الجمهورية / الأمان / التجاري"></div><div class="field"><label>رقم الحساب أو IBAN</label><input data-k="iban" dir="ltr" value="${esc(W.iban)}" placeholder="LY00 0000 ..."></div></div>`;
        return h;
      }
      h += `<div class="sec-t">${ic('sched', 20)} الدوام</div><div class="field"><label>جدول الدوام</label><select data-k="scheduleId" data-redraw><option value="">— بدون جدول (غير محدد) —</option>${S.scheds.map(x => `<option value="${x.id}" ${W.scheduleId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`;
      if (sc) h += `<p class="hint">${esc(schedSummary(sc))}</p>`;
      if (sc && sc.mode === 'rotation' && (sc.cycle || []).length) {
        const n = sc.cycle.length, pos = Math.min(Math.max(1, +W.rotPos || 1), n), sh = (sc.shifts || []).find(x => x.id === sc.cycle[pos - 1]);
        h += `<div class="field" style="max-width:260px"><label>موضع الموظف في الدورة (من 1 إلى ${n})</label><input class="num" type="number" min="1" max="${n}" data-k="rotPos" data-redraw value="${pos}"></div><p class="hint">في تاريخ ${fmtDate(dayStart(sc.anchor))} يكون الموظف في اليوم رقم ${pos} من الدورة: <b>${sh ? esc(sh.name) : 'راحة'}</b>. استخدم مواضع مختلفة لتوزيع الموظفين على فرق.</p>`;
      }
      h += `<div class="field" style="max-width:260px"><label>تاريخ بدء احتساب الدوام</label><input type="date" data-k="startDate" value="${esc(W.startDate)}"></div><p class="hint">الأيام السابقة لهذا التاريخ لا تُحتسب غياباً.</p>`;
      h += `<div class="sec-t">${ic('pin', 20)} المواقع المسموحة لهذا الموظف</div><p class="hint" style="margin-top:0">إن لم تختر أياً منها فسيسمح له بالتسجيل في أي موقع مفعّل. المواقع غير المختارة لن تقبل بصمته.</p>`;
      h += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">${S.locs.map(l => `<label class="chk"><input type="checkbox" data-k="locs.${l.id}" ${W.locs[l.id] ? 'checked' : ''}> ${esc(l.name)}</label>`).join('')}</div>`;
      h += `<div class="sec-t">${ic('payroll', 20)} الراتب والعلاوات والسُلف والضمان</div><div class="g2"><div class="field"><label>طريقة الأجر</label><select data-k="payMode" data-redraw><option value="none" ${W.payMode === 'none' ? 'selected' : ''}>— غير محدد —</option><option value="monthly" ${W.payMode === 'monthly' ? 'selected' : ''}>راتب شهري</option><option value="hourly" ${W.payMode === 'hourly' ? 'selected' : ''}>أجر لكل ساعة</option></select></div>`;
      if (W.payMode !== 'none') {
        h += `<div class="field"><label>${W.payMode === 'monthly' ? 'الراتب الأساسي الشهري' : 'أجر الساعة'} (د.ل)</label><input class="num" type="number" min="0" step="0.01" data-k="payAmount" value="${W.payAmount}"></div>`;
        h += `<div class="field"><label>علاوات/بدلات ثابتة للفترة</label><input class="num" type="number" min="0" step="0.01" data-k="allowance" value="${W.allowance}" placeholder="سكن / مواصلات"></div>`;
        h += `<div class="field"><label>مكافأة إضافية للفترة</label><input class="num" type="number" min="0" step="0.01" data-k="bonus" value="${W.bonus}"></div>`;
        h += `<div class="field"><label>خصم/جزاء إداري للفترة</label><input class="num" type="number" min="0" step="0.01" data-k="penalty" value="${W.penalty}"></div>`;
        h += `<div class="field" style="grid-column:1/-1"><label>شهر استحقاق المكافأة / الجزاء (لمنع تكرارها تلقائياً في الأشهر القادمة)</label><input type="month" dir="ltr" data-k="adjMonth" value="${esc(W.adjMonth || '')}" style="max-width:240px"><small class="muted" style="display:block;margin-top:4px">تُحتسب المكافأة أو الجزاء في هذا الشهر فقط، وتُصفَّر تلقائياً عند اعتماد مسيّر الرواتب.</small></div>`;
        h += `<div class="field"><label>رصيد السلفة المتبقي عليه</label><input class="num" type="number" min="0" step="0.01" data-k="loanTotal" value="${W.loanTotal}"></div>`;
        h += `<div class="field"><label>قسط السلفة المستقطع لكل مسير</label><input class="num" type="number" min="0" step="0.01" data-k="loanInst" value="${W.loanInst}"></div>`;
        h += `<div class="field" style="grid-column:1/-1"><label class="chk"><input type="checkbox" data-k="lyStatutory" data-redraw ${W.lyStatutory ? 'checked' : ''}> تطبيق الاستقطاعات القانونية الليبية (ضمان 5.125% + تضامن 1% + ضريبة دخل ودمغة 0.5%)</label></div>`;
        if (W.lyStatutory) {
          h += `<div class="field"><label>الحالة العائلية (للإعفاء الضريبي الليبي)</label><select data-k="familyStatus"><option value="single" ${W.familyStatus === 'single' ? 'selected' : ''}>أعزب (إعفاء 150 د.ل)</option><option value="married" ${W.familyStatus === 'married' ? 'selected' : ''}>متزوج (إعفاء 200 د.ل)</option><option value="kids" ${W.familyStatus === 'kids' ? 'selected' : ''}>متزوج ويعول (إعفاء 275 د.ل)</option></select></div>`;
        }
      }
      h += `</div>`;
      h += `<div class="sec-t">${ic('payroll', 20)} البيانات المصرفية والعزل الأمني للرواتب</div><div class="g2"><div class="field"><label>اسم المصرف والفرع</label><input data-k="bankName" value="${esc(W.bankName)}" placeholder="مصرف الجمهورية — الفرع الرئيسي"></div><div class="field"><label>رقم الحساب المصرفي / IBAN</label><input data-k="iban" dir="ltr" value="${esc(W.iban)}" placeholder="LY00 0000 0000 0000 0000 0000"></div>${(isSuper() || isPay()) ? `<div class="field" style="grid-column:1/-1"><label class="chk"><input type="checkbox" data-k="finIsolated" ${W.finIsolated ? 'checked' : ''}> 🔒 عزل البيانات المالية والمصرفية في الخزينة المحمية (<code>empFinance</code>) لمنع الموارد البشرية ومديري الأقسام من قراءة الراتب والـ IBAN</label></div>` : ''}</div>`;
      h += `<div class="sec-t">${ic('device', 20)} العُهد والأصول المسلمة + رقم جهاز البصمة</div><div class="g2">
        <div class="field"><label>رقم الموظف في جهاز البصمة (ZKTeco ID)</label><input data-k="bioId" dir="ltr" value="${esc(W.bioId)}" placeholder="مثال: 101"></div>
        <div class="field" style="grid-column:1/-1"><label>العُهد والأصول المسلمة للموظف (سيارة، لابتوب، هاتف، مفاتيح…)</label><input data-k="assets" value="${esc(W.assets)}" placeholder="مثال: لابتوب Dell S/N:4452 — سيارة كيا لوحة 12345 — شريحة مدار 091..."></div>
      </div>`;
      if (W.payMode === 'monthly') {
        h += `<div class="sc"><button type="button" class="chip" data-a="netToGross">${ic('payroll', 16)} حاسبة عكسية: أدخل الصافي المطلوب ليحسب الإجمالي مع الضمان والضرائب</button></div>`;
      }
      h += `<div class="sec-t">${ic('sun', 20)} رصيد الإجازات السنوية</div><div class="g2"><div class="field"><label>الحصة السنوية (يوم)</label><input class="num" type="number" min="0" max="365" step="1" data-k="leaveQuota" value="${W.leaveQuota ?? 21}"></div></div>`;
      return h;
    };
    openModal({
      title: 'ملف الموظف الشامل (360°)', body, onField: (k, v) => { if (k.startsWith('locs.')) W.locs[k.slice(5)] = !!v; else if (k.startsWith('tp.')) W.tp[k.slice(3)] = v; else W[k] = v; },
      onAct: async a => {
        if (a === 'netToGross') {
          const targetNet = parseFloat(await mqPrompt('أدخل صافي الراتب المطلوب استلامه في اليد (د.ل):'));
          if (!(targetNet > 0)) return;
          // بحث ثنائي سريع (Binary Search) لإيجاد الإجمالي الذي يعطي هذا الصافي بعد الضمان والضرائب الليبية
          let lo = targetNet, hi = targetNet * 1.4, mid = targetNet;
          for (let i = 0; i < 40; i++) {
            mid = (lo + hi) / 2;
            const st = calcLibyanStatutory(mid, W.familyStatus || 'single');
            if (mid - st.total < targetNet) lo = mid; else hi = mid;
          }
          W.payAmount = Math.round(mid * 100) / 100;
          W.lyStatutory = true;
          toast(`تم ضبط الإجمالي إلى ${W.payAmount} د.ل ليكون الصافي ${targetNet} د.ل`, 'good');
        }
      },
      onSave: async () => {
        const name = (W.name || '').trim(); if (!name) { toast('اكتب اسم الموظف', 'err'); return false; }
        const common = {
          name, phone: String(W.phone || '').replace(/\D/g, ''), dept: String(W.dept || '').trim(),
          jobTitle: String(W.jobTitle || '').trim(), nationalId: String(W.nationalId || '').trim(),
          contractEnd: W.contractEnd || '', docExpiry: W.docExpiry || '',
          bankName: String(W.bankName || '').trim(), iban: String(W.iban || '').trim(),
          bioId: String(W.bioId || '').trim(), assets: String(W.assets || '').trim()
        };
        if (W.empType === 'task') {
          const tp = {}; Object.entries(W.tp).forEach(([k, v]) => { if (v !== '' && v != null && +v >= 0) tp[k] = +v; });
          const fullTaskPatch = scopeEmpPatch({ ...common, empType: 'task', payMode: 'task', payAmount: 0, scheduleId: '', rotOffset: 0, locs: [], taskPrices: tp });
          if ((isSuper() || isPay()) && (W.finIsolated || e.finIsolated)) {
            const finPayload = { ...extractEmpFinance(fullTaskPatch), updatedAt: serverTimestamp() };
            const b = writeBatch(db);
            b.set(doc(db, 'empFinance', e.id), finPayload, { merge: true });
            b.update(doc(db, 'employees', e.id), scopeEmpPatch(stripEmpFinance(fullTaskPatch)));
            await b.commit();
            await saveEmpFinanceCache(e.id, extractEmpFinance(fullTaskPatch));
          } else {
            await updateDoc(doc(db, 'employees', e.id), fullTaskPatch);
          }
          logAudit('emp_update', name, 'تحديث ملف موظف مهام');
          await refresh('emps'); toast('تم حفظ ملف الموظف', 'good'); return;
        }
        const sc = S.scheds.find(x => x.id === W.scheduleId);
        const n = sc && sc.mode === 'rotation' ? (sc.cycle || []).length : 0;
        const rot = n ? Math.min(Math.max(1, +W.rotPos || 1), n) - 1 : 0;
        const ids = Object.keys(W.locs).filter(id => W.locs[id]);
        const amt = +W.payAmount || 0;
        if (W.payMode !== 'none' && !(amt > 0)) { toast('اكتب قيمة الراتب', 'err'); return false; }
        const bVal = Math.max(0, +W.bonus || 0), pVal = Math.max(0, +W.penalty || 0);
        const adjM = (bVal > 0 || pVal > 0) ? (String(W.adjMonth || '').trim() || (S.to ? S.to.slice(0, 7) : dayKey(new Date()).slice(0, 7))) : '';
        const patch = scopeEmpPatch({
          ...common, scheduleId: sc ? sc.id : '', rotOffset: rot, startDate: W.startDate || created,
          payMode: W.payMode, payAmount: W.payMode === 'none' ? 0 : amt,
          allowance: Math.max(0, +W.allowance || 0), bonus: bVal, penalty: pVal, adjMonth: adjM,
          loanTotal: Math.max(0, +W.loanTotal || 0), loanInst: Math.max(0, +W.loanInst || 0),
          lyStatutory: !!W.lyStatutory, familyStatus: W.familyStatus || 'single',
          locs: ids, leaveQuota: Math.max(0, +W.leaveQuota || 21), empType: 'staff'
        });
        const oldLoan = +e.loanTotal || 0;
        const changes = [];
        if ('payAmount' in patch && (+e.payAmount || 0) !== patch.payAmount) changes.push(`الراتب: ${+e.payAmount || 0} ← ${patch.payAmount}`);
        if ('allowance' in patch && (+e.allowance || 0) !== patch.allowance) changes.push(`العلاوة: ${+e.allowance || 0} ← ${patch.allowance}`);
        if ('bonus' in patch && (+e.bonus || 0) !== patch.bonus) changes.push(`مكافأة (${adjM || 'عام'}): ${patch.bonus}`);
        if ('penalty' in patch && (+e.penalty || 0) !== patch.penalty) changes.push(`جزاء (${adjM || 'عام'}): ${patch.penalty}`);
        if ('loanTotal' in patch && Math.abs(patch.loanTotal - oldLoan) > 0.0049) changes.push(`السلفة: ${oldLoan} ← ${patch.loanTotal}`);
        if ('iban' in patch && (e.iban || '') !== patch.iban) changes.push('تحديث IBAN');
        if ('scheduleId' in patch && (e.scheduleId || '') !== patch.scheduleId) changes.push('تغيير جدول الدوام');
        let whyLoan = '';
        if ('loanTotal' in patch && Math.abs(patch.loanTotal - oldLoan) > 0.0049) {   // تعديل رصيد السلفة = قيد تسوية مسبَّب في الدفتر
          whyLoan = (await mqPrompt('سبب تعديل رصيد السلفة (مطلوب، 3 أحرف على الأقل). يُسجَّل في دفتر السلف:') || '').trim();
          if (whyLoan.length < 3) { toast('لم يُحفظ: سبب تعديل رصيد السلفة مطلوب', 'err'); return false; }
        }
        if ((isSuper() || isPay()) && W.finIsolated) {
          const finPayload = { ...extractEmpFinance(patch), updatedAt: serverTimestamp() };
          const empPublicPatch = scopeEmpPatch(stripEmpFinance(patch));
          const b = writeBatch(db);
          b.set(doc(db, 'empFinance', e.id), finPayload, { merge: true });
          b.update(doc(db, 'employees', e.id), empPublicPatch);
          if (whyLoan) {
            b.set(doc(ledgerCol(e.id)), { type: 'adjust', delta: r2(patch.loanTotal - oldLoan), balanceAfter: r2(patch.loanTotal), note: whyLoan.slice(0, 300), by: runBy(), at: serverTimestamp() });
          }
          await b.commit();
          await saveEmpFinanceCache(e.id, extractEmpFinance(patch));
        } else if (whyLoan) {
          const b = writeBatch(db);
          b.update(doc(db, 'employees', e.id), patch);
          b.set(doc(ledgerCol(e.id)), { type: 'adjust', delta: r2(patch.loanTotal - oldLoan), balanceAfter: r2(patch.loanTotal), note: whyLoan.slice(0, 300), by: runBy(), at: serverTimestamp() });
          await b.commit();
        } else {
          await updateDoc(doc(db, 'employees', e.id), patch);
        }
        logAudit('emp_update', name, changes.length ? changes.join(' · ') : 'تحديث البيانات الأساسية للموظف');
        await refresh('emps'); toast('تم حفظ ملف الموظف الشامل', 'good');
      }
    });
  }

