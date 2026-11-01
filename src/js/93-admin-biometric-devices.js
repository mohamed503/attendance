  /* =====================================================================
     تبويب «أجهزة البصمة»: تعريف الأجهزة، ربط (جهاز + معرّف) بالموظف، ومعالجة الحركات المعلّقة.
     الاستقبال نفسه يتم في workers/biometric-ingest؛ هنا الإدارة فقط. الرمز لا يُخزَّن: تُحفظ بصمته (SHA-256) ويُعرض مرة واحدة.
     ===================================================================== */
  const BIO_PROTO = {
    'zkteco-adms': ['ZKTeco / أجهزة ADMS (iClock Push)', 'يتصل الجهاز بعنوان Worker ويحدَّد بالرقم التسلسلي SN'],
    'meqat-json-v1': ['JSON موحّد (برنامج أو جهاز يرسل JSON)', 'ترسل الجهة طلب POST برمز وصول'],
    'generic': ['إشعارات HTTP عامة (JSON / XML) بتعيين حقول', 'لأي جهاز أو نظام يدفع أحداثاً: تحدّد أسماء الحقول بنفسك']
  };
  const BIO_MAPPING_EXAMPLE = '{\n  "recordsPath": "AccessControllerEvent.events",\n  "idPath": "employeeNoString",\n  "timePath": "dateTime",\n  "typePath": "",\n  "typeMap": {},\n  "order": "dmy"\n}';
  const bioWorkerUrl = () => { try { return localStorage.getItem('meqat_worker_url') || ''; } catch { return ''; } };
  const bioRandToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  async function loadBio(force = false) {
    if (S.bio && S.bio.loaded && !force) return S.bio;
    const rd = async (c, n) => (await getDocs(query(collection(db, c), limit(n)))).docs.map(d => ({ id: d.id, ...d.data() }));
    try { S.bio = { devices: await rd('biometricDevices', 200), maps: await rd('biometricMap', 2000), pending: await rd('biometricPending', 1000), loaded: true, err: false }; }
    catch (e) { console.warn(e); S.bio = { devices: [], maps: [], pending: [], loaded: true, err: true }; }
    return S.bio;
  }
  const bioDevName = id => { const d = ((S.bio && S.bio.devices) || []).find(x => x.id === id); return d ? d.name : id; };
  const tsMs = t => t && t.toMillis ? t.toMillis() : (+t || 0);

  async function viewBio(el) {
    el.innerHTML = '<div class="card"><p class="muted">جارٍ التحميل…</p></div>';
    const B = await loadBio();
    if (S.tab !== 'bio' || !el.isConnected) return;
    if (B.err) { el.innerHTML = `<div class="card"><div class="notice"><b>تحديث مطلوب:</b> قواعد Firestore المنشورة لا تتيح مجموعات أجهزة البصمة. انسخ القواعد الأحدث وانشرها ثم أعد التحميل.<div style="margin-top:10px"><button class="btn sm" data-act="copyRules">${ic('copy', 16)} نسخ القواعد الأحدث</button></div></div></div>`; return; }
    const url = bioWorkerUrl();
    const groups = new Map();
    for (const p of B.pending) { const k = p.deviceId + '|' + p.userKey; const g = groups.get(k) || groups.set(k, { deviceId: p.deviceId, userKey: p.userKey, ext: p.externalUserId, reason: p.reason, n: 0, from: Infinity, to: 0, ids: [] }).get(k); g.n++; g.ids.push(p.id); const t = tsMs(p.time); g.from = Math.min(g.from, t); g.to = Math.max(g.to, t); }
    const pend = [...groups.values()].sort((a, b) => b.n - a.n);
    const REASON = { unmatched: 'رقم غير مرتبط', ambiguous_bioId: 'رقم مكرر عند أكثر من موظف', mapping_disabled: 'الربط معطّل', mapping_pending: 'الربط بانتظار المراجعة', future_time: 'وقت مستقبلي (ساعة الجهاز؟)', employee_inactive: 'الموظف موقوف', employee_missing: 'الموظف غير موجود' };
    const mapsBy = id => B.maps.filter(m => m.deviceId === id).length;
    el.innerHTML = `
    <div class="card">${ch('device', 'أجهزة البصمة والأنظمة المتصلة', `<div class="acts"><button class="btn sm" data-bact="addDev">${ic('plus', 16)} إضافة جهاز</button><button class="btn sm sec" data-bact="reload">${ic('refresh', 16)} تحديث</button></div>`)}
      <div class="field" style="max-width:520px"><label>عنوان Worker (لعرض الروابط الجاهزة فقط)</label><input id="bioWu" dir="ltr" placeholder="https://meqat-biometric-ingest.<account>.workers.dev" value="${esc(url)}"></div>
      <div class="tw"><table class="rt"><thead><tr><th>الجهاز</th><th>البروتوكول</th><th>المعرّف</th><th>آخر اتصال</th><th>الربط</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
      ${B.devices.map(d => `<tr><td data-l="الجهاز"><b>${esc(d.name || d.id)}</b></td><td data-l="البروتوكول">${esc((BIO_PROTO[d.protocol] || [d.protocol])[0])}</td><td data-l="المعرّف" dir="ltr">${esc(d.protocol === 'zkteco-adms' ? 'SN ' + (d.sn || '—') : d.id)}</td>
        <td data-l="آخر اتصال">${d.lastSeenAt ? `${fmtDate(new Date(tsMs(d.lastSeenAt)))} ${fmtTime(new Date(tsMs(d.lastSeenAt)))}<br><small class="muted" dir="ltr">${esc(d.lastResult || '')}</small>` : '<span class="muted">لم يتصل بعد</span>'}</td>
        <td data-l="الربط">${mapsBy(d.id)}</td><td data-l="الحالة"><span class="badge ${d.active === false ? 'b-bad' : 'b-ok'}">${d.active === false ? 'معطّل' : 'فعّال'}</span></td>
        <td data-l=""><div class="acts"><button class="btn sm sec" data-bact="editDev" data-id="${d.id}">${ic('edit', 16)} تعديل</button>${d.protocol !== 'zkteco-adms' || d.requireToken ? ` <button class="btn sm sec" data-bact="rotDev" data-id="${d.id}">${ic('refresh', 16)} رمز جديد</button>` : ''} <button class="btn sm ${d.active === false ? 'ok' : 'bad'}" data-bact="togDev" data-id="${d.id}">${d.active === false ? 'تفعيل' : 'تعطيل'}</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="muted center">لم تُضف أجهزة بعد. أضف جهازاً ليستقبل ميقات حركاته مباشرة؛ ويبقى «استيراد من جهاز البصمة» (في التقارير) متاحاً دائماً كمسار احتياطي.</td></tr>'}
      </tbody></table></div></div>

    <div class="card">${ch('users', `ربط معرّفات الأجهزة بالموظفين (${B.maps.length})`, `<div class="acts"><button class="btn sm" data-bact="addMap">${ic('plus', 16)} إضافة ربط</button><button class="btn sm sec" data-bact="autoMap">${ic('check', 16)} ربط تلقائي من «رقم البصمة» في ملف الموظف</button></div>`)}
      <p class="hint" style="margin-top:0">كل (جهاز + معرّف) يرتبط بموظف واحد فقط، والموظف الواحد يمكن أن يرتبط بعدة أجهزة بمعرّفات مختلفة. إن لم يوجد ربط خاص يُستعمل «رقم البصمة» في ملف الموظف بشرط أن يكون فريداً.</p>
      <div class="tw"><table class="rt"><thead><tr><th>الجهاز</th><th>المعرّف في الجهاز</th><th>الموظف</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${B.maps.slice().sort((a, b) => String(a.deviceId).localeCompare(b.deviceId) || String(a.externalUserId).localeCompare(String(b.externalUserId), 'en', { numeric: true })).map(m => { const e = S.emps.find(x => x.id === m.employeeId); return `<tr><td data-l="الجهاز">${esc(bioDevName(m.deviceId))}</td><td data-l="المعرّف" dir="ltr">${esc(m.externalUserId)}</td><td data-l="الموظف">${e ? esc(e.name) : '<span class="muted">موظف محذوف</span>'}</td><td data-l="الحالة"><span class="badge ${m.status === 'disabled' ? 'b-bad' : 'b-ok'}">${m.status === 'disabled' ? 'معطّل' : 'فعّال'}</span></td><td data-l=""><div class="acts"><button class="btn sm sec" data-bact="togMap" data-id="${m.id}">${m.status === 'disabled' ? 'تفعيل' : 'تعطيل'}</button> <button class="btn sm bad" data-bact="delMap" data-id="${m.id}">${ic('trash', 16)}</button></div></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted center">لا روابط خاصة بعد</td></tr>'}
      </tbody></table></div></div>

    <div class="card">${ch('alert', `حركات معلّقة بانتظار المراجعة (${B.pending.length})`)}
      <p class="hint" style="margin-top:0">حركات وصلت من الأجهزة لكن تعذّر إسنادها بأمان (رقم غير مرتبط أو ملتبس أو ساعة جهاز خاطئة). لا تضيع: اربط المعرّف بموظف فتُسجَّل حركاته تلقائياً، أو تجاهلها.</p>
      <div class="tw"><table class="rt"><thead><tr><th>الجهاز</th><th>المعرّف</th><th>السبب</th><th>الحركات</th><th>الفترة</th><th></th></tr></thead><tbody>
      ${pend.map((g, i) => `<tr><td data-l="الجهاز">${esc(bioDevName(g.deviceId))}</td><td data-l="المعرّف" dir="ltr">${esc(g.ext)}</td><td data-l="السبب">${esc(REASON[g.reason] || g.reason || '')}</td><td data-l="الحركات">${g.n}</td><td data-l="الفترة">${fmtDate(new Date(g.from))}${g.to - g.from > 86400000 ? ' ← ' + fmtDate(new Date(g.to)) : ''}</td><td data-l=""><div class="acts">${g.reason === 'future_time' ? '' : `<button class="btn sm" data-bact="linkPend" data-i="${i}">${ic('users', 16)} ربط بموظف</button>`} <button class="btn sm bad" data-bact="dropPend" data-i="${i}">${ic('trash', 16)} تجاهل</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="muted center">لا حركات معلّقة ✅</td></tr>'}
      </tbody></table></div></div>`;
    S._bioPend = pend;
    const wu = $('#bioWu'); if (wu) wu.onchange = () => { try { localStorage.setItem('meqat_worker_url', wu.value.trim().replace(/\/+$/, '')); } catch {} };
  }

  /* يعرض الرمز مرة واحدة مع الروابط الجاهزة للصق في إعدادات الجهاز */
  async function showBioSecret(d, token) {
    const base = bioWorkerUrl() || 'https://<عنوان-worker>';
    const line = (l, v) => `<div class="field"><label>${l}</label><input readonly dir="ltr" value="${esc(v)}" onclick="this.select()"></div>`;
    let h = '';
    if (d.protocol === 'zkteco-adms') h = line('عنوان الخادم في الجهاز (Server Address)', base.replace(/^https?:\/\//, '')) + (d.requireToken ? line('أو مسار كامل يتضمن الرمز', `${base}/t/${token}/iclock/cdata`) : '') + `<p class="hint">في قائمة الجهاز: Comm. ← Cloud Server Setting ← ضع العنوان أعلاه، المنفذ 80 (أو 443 مع TLS). الرقم التسلسلي المسجّل: <b dir="ltr">${esc(d.sn)}</b>.</p>`;
    else h = line('رابط الاستقبال الجاهز (الرمز داخل الرابط)', `${base}/v1/hook/${d.id}/${token}`) + line('أو: رأس X-Meqat-Device', d.id) + line('رأس Authorization', 'Bearer ' + token);
    const ov = document.createElement('div'); ov.className = 'ov'; document.body.appendChild(ov);
    ov.innerHTML = `<div class="modal" style="max-width:560px" role="dialog"><div class="mh"><h3>${ic('lock', 22)} رمز الجهاز «${esc(d.name)}»</h3></div><div class="mb"><div class="notice"><b>انسخ الرمز الآن:</b> لا يُعرض مرة أخرى (يُحفظ في النظام مشفّراً بصمةً فقط). عند فقده أصدر رمزاً جديداً.</div>${line('الرمز', token)}${h}</div><div class="mf"><button class="btn" data-x="1">تم النسخ</button></div></div>`;
    ov.querySelector('[data-x]').onclick = () => ov.remove();
  }

  function bioDeviceEditor(ex) {
    const W = ex ? { ...ex } : { name: '', protocol: 'zkteco-adms', sn: '', tzOffset: TZOFF, typeSource: 'alternate', requireToken: false, mappingTxt: BIO_MAPPING_EXAMPLE };
    if (ex && ex.mapping) W.mappingTxt = JSON.stringify(ex.mapping, null, 2); else if (ex) W.mappingTxt = BIO_MAPPING_EXAMPLE;
    openModal({
      title: ex ? 'تعديل جهاز' : 'إضافة جهاز بصمة', saveText: 'حفظ',
      body: () => `<div class="g2"><div class="field"><label>اسم الجهاز / الفرع</label><input data-k="name" value="${esc(W.name)}" placeholder="بوابة المقر الرئيسي"></div>
        <div class="field"><label>طريقة الاتصال</label><select data-k="protocol" data-redraw ${ex ? 'disabled' : ''}>${Object.entries(BIO_PROTO).map(([k, v]) => `<option value="${k}" ${W.protocol === k ? 'selected' : ''}>${esc(v[0])}</option>`).join('')}</select></div></div>
        <p class="hint">${esc(BIO_PROTO[W.protocol][1])}</p>
        ${W.protocol === 'zkteco-adms' ? `<div class="g2"><div class="field"><label>الرقم التسلسلي للجهاز (SN)</label><input data-k="sn" dir="ltr" value="${esc(W.sn)}" placeholder="يظهر في System Info على الجهاز"></div>
          <div class="field"><label class="chk" style="margin-top:26px"><input type="checkbox" data-k="requireToken" ${W.requireToken ? 'checked' : ''}> اشتراط رمز في مسار الاتصال (إن سمح الجهاز بمسار)</label></div></div>` : ''}
        ${W.protocol === 'generic' ? `<div class="field"><label>تعيين الحقول (JSON): مسار قائمة الأحداث، ومسار المعرّف، والوقت، والحالة</label><textarea data-k="mappingTxt" dir="ltr" rows="9" style="font-family:monospace;font-size:12.5px">${esc(W.mappingTxt)}</textarea><p class="hint">اترك typePath فارغاً إن كان الجهاز لا يرسل حضور/انصراف. يدعم المسارات المتداخلة مثل a.b[0].c، ولأجسام XML وmultipart (تُهمل الصور) وسطور نصية (format: "lines" مع idCol/timeCol/typeCol).</p></div>` : ''}
        <div class="g2"><div class="field"><label>إزاحة توقيت الجهاز عن UTC (دقائق)</label><input type="number" class="num" data-k="tzOffset" value="${W.tzOffset}"><small class="muted">ليبيا +120. تُستعمل لأوقات الجهاز التي لا تحمل منطقة زمنية.</small></div>
        <div class="field"><label>تحديد حضور/انصراف</label><select data-k="typeSource"><option value="alternate" ${W.typeSource !== 'device' ? 'selected' : ''}>بالتناوب داخل اليوم (موصى به — أغلب الأجهزة لا تميّز)</option><option value="device" ${W.typeSource === 'device' ? 'selected' : ''}>من حالة الجهاز (إن كان الموظفون يضغطون زر الحالة فعلاً)</option></select></div></div>`,
      onField: (k, v) => { W[k] = k === 'tzOffset' ? (+v || 0) : v; },
      onSave: async () => {
        const bad = m => { toast(m, 'err'); return false; };
        if (!String(W.name || '').trim()) return bad('اكتب اسم الجهاز');
        if (W.protocol === 'zkteco-adms') {
          const sn = String(W.sn || '').trim(); if (!/^[A-Za-z0-9_-]{4,64}$/.test(sn)) return bad('الرقم التسلسلي غير صالح');
          if (S.bio.devices.some(d => d.sn === sn && (!ex || d.id !== ex.id))) return bad('هذا الرقم التسلسلي مسجّل لجهاز آخر');
        }
        let mapping = null;
        if (W.protocol === 'generic') { try { mapping = JSON.parse(W.mappingTxt || '{}'); if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw 0; } catch { return bad('تعيين الحقول ليس JSON صالحاً'); } }
        const data = { name: String(W.name).trim().slice(0, 80), protocol: W.protocol, tzOffset: Math.max(-720, Math.min(840, Math.round(+W.tzOffset || 0))), typeSource: W.typeSource === 'device' ? 'device' : 'alternate', active: ex ? ex.active !== false : true, ...(W.protocol === 'zkteco-adms' ? { sn: String(W.sn).trim(), requireToken: !!W.requireToken } : {}), ...(mapping ? { mapping } : {}) };
        let id = ex && ex.id, token = '';
        if (!ex || (W.protocol === 'zkteco-adms' && data.requireToken && !ex.tokenHash)) { token = bioRandToken(); data.tokenHash = await sha256Hex(token); }
        if (ex) await updateDoc(doc(db, 'biometricDevices', ex.id), data);
        else { data.createdAt = serverTimestamp(); id = (await addDoc(collection(db, 'biometricDevices'), data)).id; }
        logAudit('bio_device', id, `${ex ? 'تعديل' : 'إنشاء'} جهاز «${data.name}» (${data.protocol})`);
        await loadBio(true); viewBio($('#content'));
        if (token) setTimeout(() => showBioSecret({ ...data, id }, token), 50);
      }
    });
  }

  function empOptions(sel) { return S.emps.filter(e => e.empType !== 'task' && e.active !== false).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar')).map(e => `<option value="${e.id}" ${sel === e.id ? 'selected' : ''}>${esc(e.name)}${e.bioId ? ' — #' + esc(e.bioId) : ''}</option>`).join(''); }

  async function saveBioMap(deviceId, rawId, employeeId, by) {
    const key = devIdKey(rawId); if (!key) throw new Error('empty-id');
    const id = bioMapId(deviceId, rawId), ref = doc(db, 'biometricMap', id), cur = await getDoc(ref);
    if (cur.exists() && cur.data().employeeId !== employeeId) { const e = S.emps.find(x => x.id === cur.data().employeeId); throw new Error('map-conflict:' + (e ? e.name : '؟')); }
    await setDoc(ref, { deviceId, externalUserId: String(rawId).trim(), userKey: key, employeeId, status: 'active', mappingSource: by || 'manual', createdBy: (auth.currentUser && auth.currentUser.email) || '', createdAt: serverTimestamp() });
    return id;
  }
  const bioMapErr = e => String(e.message || '').startsWith('map-conflict:') ? `هذا المعرّف مرتبط مسبقاً بالموظف «${e.message.slice(13)}» على الجهاز نفسه` : 'تعذر حفظ الربط';

  /* يسجّل الحركات المعلّقة لمعرّف تم ربطه ثم يحذفها من المعلّقات */
  async function replayPending(group, emp) {
    const rows = S.bio.pending.filter(p => p.deviceId === group.deviceId && p.userKey === group.userKey && p.reason !== 'future_time');
    const raw = rows.map(p => ({ emp, ms: tsMs(p.time), type: p.type === 'in' || p.type === 'out' ? p.type : null }));
    const dev = S.bio.devices.find(d => d.id === group.deviceId) || {};
    const recs = devBuild(raw, Number(dev.tzOffset ?? TZOFF));
    for (let i = 0; i < recs.length; i += 300) {
      const b = writeBatch(db);
      recs.slice(i, i + 300).forEach(r => b.set(doc(db, 'employees', emp.id, 'records', 'bio_' + r.ms), { type: r.type, time: Timestamp.fromMillis(r.ms), lat: 0, lng: 0, accuracy: 0, distance: 0, locationId: 'biometric', locationName: 'جهاز البصمة', empName: emp.name, deviceId: group.deviceId, src: 'pending-link' }));
      await b.commit();
    }
    for (let i = 0; i < rows.length; i += 400) { const b = writeBatch(db); rows.slice(i, i + 400).forEach(p => b.delete(doc(db, 'biometricPending', p.id))); await b.commit(); }
    const months = [...new Set(recs.map(r => dayKey(new Date(r.ms)).slice(0, 7)))];
    await Promise.all(months.map(m => invalidateMonthSummary(m)));
    await RecCache.clear(); await refresh('recs');
    return recs.length;
  }

  async function bioAction(act, b) {
    const B = S.bio, id = b.dataset.id;
    if (act === 'reload') { await loadBio(true); return viewBio($('#content')); }
    if (act === 'addDev') return bioDeviceEditor(null);
    if (act === 'editDev') return bioDeviceEditor(B.devices.find(d => d.id === id));
    if (act === 'togDev') { const d = B.devices.find(x => x.id === id); if (!d) return; await updateDoc(doc(db, 'biometricDevices', id), { active: d.active === false }); logAudit('bio_device', id, `${d.active === false ? 'تفعيل' : 'تعطيل'} «${d.name}»`); await loadBio(true); return viewBio($('#content')); }
    if (act === 'rotDev') {
      const d = B.devices.find(x => x.id === id); if (!d || !await mqConfirm(`إصدار رمز جديد للجهاز «${d.name}»؟ يتوقف الرمز القديم فوراً ويجب تحديث إعدادات الجهاز.`)) return;
      const token = bioRandToken(); await updateDoc(doc(db, 'biometricDevices', id), { tokenHash: await sha256Hex(token) });
      logAudit('bio_device', id, `تدوير رمز «${d.name}»`); await loadBio(true); viewBio($('#content')); return showBioSecret(d, token);
    }
    if (act === 'addMap') {
      if (!B.devices.length) return toast('أضف جهازاً أولاً', 'err');
      const W = { deviceId: B.devices[0].id, ext: '', emp: '' };
      return openModal({ title: 'ربط معرّف جهاز بموظف', saveText: 'حفظ الربط',
        body: () => `<div class="g2"><div class="field"><label>الجهاز</label><select data-k="deviceId">${B.devices.map(d => `<option value="${d.id}" ${W.deviceId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div><div class="field"><label>المعرّف في الجهاز (User ID / PIN)</label><input data-k="ext" dir="ltr" value="${esc(W.ext)}"></div></div><div class="field"><label>الموظف</label><select data-k="emp"><option value="">— اختر —</option>${empOptions(W.emp)}</select></div>`,
        onField: (k, v) => { W[k] = v; },
        onSave: async () => { if (!String(W.ext).trim() || !W.emp) { toast('أكمل المعرّف والموظف', 'err'); return false; } try { const mid = await saveBioMap(W.deviceId, W.ext, W.emp); logAudit('bio_map', mid, `ربط ${W.ext} ← ${(S.emps.find(e => e.id === W.emp) || {}).name || ''}`); await loadBio(true); viewBio($('#content')); } catch (e) { toast(bioMapErr(e), 'err'); return false; } } });
    }
    if (act === 'autoMap') {
      if (!B.devices.length) return toast('أضف جهازاً أولاً', 'err');
      const dev = B.devices.length === 1 ? B.devices[0] : B.devices[await mqChoice('اختر الجهاز الذي تُنشأ له الروابط:', B.devices.map(d => d.name).concat(['إلغاء'])) ];
      if (!dev) return;
      const byKey = new Map(); S.emps.filter(e => e.bioId && e.active !== false && e.empType !== 'task').forEach(e => { const k = devIdKey(e.bioId); (byKey.get(k) || byKey.set(k, []).get(k)).push(e); });
      const ok = [...byKey.entries()].filter(([, a]) => a.length === 1), amb = [...byKey.values()].filter(a => a.length > 1).length;
      if (!ok.length) return toast('لا أرقام بصمة صالحة لربطها', 'err');
      if (!await mqConfirm(`إنشاء ${ok.length} ربط للجهاز «${dev.name}» من أرقام البصمة الموجودة في ملفات الموظفين؟${amb ? `\n(سيُتخطى ${amb} رقم مكرر عند أكثر من موظف)` : ''}\nلا يُكتب فوق ربط موجود.`)) return;
      let n = 0, skip = 0;
      for (const [, [e]] of ok) { try { await saveBioMap(dev.id, e.bioId, e.id, 'import'); n++; } catch { skip++; } }
      logAudit('bio_map', dev.id, `ربط تلقائي: ${n} (تخطي ${skip})`); toast(`تم إنشاء ${n} ربط${skip ? ` وتخطي ${skip}` : ''}`, 'good');
      await loadBio(true); return viewBio($('#content'));
    }
    if (act === 'togMap') { const m = B.maps.find(x => x.id === id); if (!m) return; await updateDoc(doc(db, 'biometricMap', id), { status: m.status === 'disabled' ? 'active' : 'disabled' }); logAudit('bio_map', id, m.status === 'disabled' ? 'تفعيل ربط' : 'تعطيل ربط'); await loadBio(true); return viewBio($('#content')); }
    if (act === 'delMap') { if (!await mqConfirm('حذف هذا الربط؟ لا تتأثر الحركات المسجّلة سابقاً.')) return; await deleteDoc(doc(db, 'biometricMap', id)); logAudit('bio_map', id, 'حذف ربط'); await loadBio(true); return viewBio($('#content')); }
    const g = (S._bioPend || [])[+b.dataset.i];
    if (act === 'dropPend' && g) {
      if (!await mqConfirm(`تجاهل ${g.n} حركة للمعرّف ${g.ext}؟ تُحذف من المعلّقات نهائياً.`)) return;
      for (let i = 0; i < g.ids.length; i += 400) { const w = writeBatch(db); g.ids.slice(i, i + 400).forEach(x => w.delete(doc(db, 'biometricPending', x))); await w.commit(); }
      logAudit('bio_pending', g.deviceId, `تجاهل ${g.n} حركة للمعرّف ${g.ext}`); await loadBio(true); return viewBio($('#content'));
    }
    if (act === 'linkPend' && g) {
      const W = { emp: '' };
      return openModal({ title: `ربط المعرّف ${g.ext} (${bioDevName(g.deviceId)})`, saveText: 'ربط وتسجيل الحركات',
        body: () => `<p class="hint" style="margin-top:0">سيُربط المعرّف بالموظف المختار وتُسجَّل له ${g.n} حركة معلّقة (الحضور/الانصراف بالتناوب داخل اليوم عند غياب حالة الجهاز).</p><div class="field"><label>الموظف</label><select data-k="emp"><option value="">— اختر —</option>${empOptions(W.emp)}</select></div>`,
        onField: (k, v) => { W[k] = v; },
        onSave: async () => {
          const emp = S.emps.find(e => e.id === W.emp); if (!emp) { toast('اختر الموظف', 'err'); return false; }
          try { await saveBioMap(g.deviceId, g.ext, emp.id); const n = await replayPending(g, emp); logAudit('bio_pending', g.deviceId, `ربط ${g.ext} ← ${emp.name} وتسجيل ${n} حركة`); toast(`تم الربط وتسجيل ${n} حركة`, 'good'); await loadBio(true); viewBio($('#content')); }
          catch (e) { console.error(e); toast(bioMapErr(e), 'err'); return false; }
        } });
    }
  }
