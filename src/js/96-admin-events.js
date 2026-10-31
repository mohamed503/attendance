  /* --- الأحداث والتنقل --- */
  root.onclick = async ev => {
    // إغلاق قوائم (المزيد) عند الضغط خارجها
    document.querySelectorAll('details.act-menu[open]').forEach(d => {
      if (!d.contains(ev.target)) d.removeAttribute('open');
    });

    const tab = ev.target.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; return render(); }
    const esub = ev.target.closest('[data-esub]'); if (esub) {
      if (esub.dataset.esub === 'admins' && !isSuper()) return toast('إدارة الصلاحيات متاحة للمدير العام فقط', 'err');
      if (esub.dataset.esub === 'audit' && !(isSuper() || isAud())) return toast('سجل التدقيق متاح للمدير العام والمدقق فقط', 'err');
      S.empSub = esub.dataset.esub; return viewEmps($('#content'));
    }
    const ssub = ev.target.closest('[data-ssub]'); if (ssub) { S.schedSub = ssub.dataset.ssub; return viewSched($('#content')); }
    const rsub = ev.target.closest('[data-rsub]'); if (rsub) {
      if (rsub.dataset.rsub === 'payroll' && !['super_admin', 'payroll_admin'].includes(S.role)) return toast('عرض الرواتب محصور بالمدير العام ومحاسب الرواتب', 'err');
      S.recSub = rsub.dataset.rsub; return viewRecs($('#content'));
    }

    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
        const superOnly = new Set(['addAdmin', 'delAdmin', 'copyRules', 'v2Done', 'hardDelEmp', 'backupDB', 'restoreDB', 'runApprove', 'loanOpen', 'sealMonth', 'archivePurgeMonth', 'restoreArchiveMonth', 'isolateFinAll']);
    const viewOnly = new Set(['logout', 'reload', 'copy', 'wa', 'moreReqs', 'reloadAudit', 'auditCsv']);
        const payrollAllowed = new Set(['logout', 'reload', 'editEmp', 'runSave', 'runRecalc', 'runView', 'runPay', 'runVerify', 'runDel', 'runLedger', 'loanLog', 'runXlsx', 'runBankCsv', 'runSlips', 'runSlip', 'xlsx', 'print', 'bankCsv', 'printSlips', 'slipEmp', 'appr', 'rej', 'copy', 'wa']);
    if (superOnly.has(act) && !isSuper()) return toast('هذه العملية متاحة للمدير العام فقط', 'err');
    if (['manager', 'auditor'].includes(S.role) && !viewOnly.has(act)) return toast('هذا الدور للعرض فقط', 'err');
    if (S.role === 'payroll_admin' && !payrollAllowed.has(act)) return toast('هذه العملية ليست ضمن صلاحيات محاسب الرواتب', 'err');
    if (S.role === 'payroll_admin' && ['appr', 'rej'].includes(act)) {
      const req = S.reqs.find(x => x.id === id && x.empId === b.dataset.e);
      if (!req || !['loan', 'task'].includes(req.kind)) return toast('يستطيع محاسب الرواتب اعتماد طلبات السلف والمهام فقط', 'err');
    }
    if (S.role === 'hr_admin' && ['appr', 'rej'].includes(act)) {
      const req = S.reqs.find(x => x.id === id && x.empId === b.dataset.e);
      if (req && req.kind === 'loan') return toast('اعتماد طلبات السلف المالية محصور بالمدير العام ومحاسب الرواتب', 'err');
    }
    if (S.recsFail.length && ['xlsx', 'bankCsv', 'printSlips', 'slipEmp', 'runXlsx', 'runBankCsv', 'runSlips', 'runSlip'].includes(act) && !await mqConfirm('تنبيه: تعذّرت قراءة سجلات: ' + [...new Set(S.recsFail)].join('، ') + '\nقد تكون الأرقام ناقصة (غياب خاطئ). هل تتابع رغم ذلك؟')) return;
    try {
      if (act === 'logout') {
        // نمسح كل ما خُزّن على الجهاز (كاش الإعدادات والأشهر وكاش Firestore) ثم نعيد تحميل الصفحة
        try { localStorage.removeItem(CFG_KEY); sessionStorage.removeItem(ROLE_CACHE_KEY); } catch {}
        await RecCache.clear(); stopTodayFeed();
        await signOut(auth);
        try { await terminate(db); await clearIndexedDbPersistence(db); } catch {}
        return location.reload();
      }
      if (act === 'moreReqs') { if (!S.reqsFrom) return; await loadReqsBefore((+S.reqsFrom.slice(0, 4) - 1) + '-01-01'); render(); return toast('تم تحميل طلبات أقدم', 'good'); }
      if (act === 'reload') { await loadAll({ force: true }); return toast('تم تحديث البيانات', 'good'); }
      if (act === 'addEmp') {
        const name = $('#eName').value.trim(); if (!name) return toast('اكتب اسم الموظف', 'err');
        if (LICENSE && LICENSE.maxEmployees > 0 && S.emps.filter(x => x.active).length >= LICENSE.maxEmployees) return toast(`وصلتَ حد باقتك (${LICENSE.maxEmployees} موظفاً) — للترقية تواصل مع مزوّد الخدمة`, 'err');
        const phone = $('#ePhone').value.replace(/\D/g, '');
        const nid = randToken(); const isTask = !!($('#eType') && $('#eType').value === 'task');
        await setDoc(doc(db, 'employees', nid), { name, phone, active: true, deviceId: null, scheduleId: (isTask ? '' : ($('#eSched') ? $('#eSched').value : '')), empType: isTask ? 'task' : 'staff', payMode: isTask ? 'task' : 'none', payAmount: 0, rotOffset: 0, startDate: dayKey(new Date()), createdAt: serverTimestamp() });
        logAudit('emp_create', name, isTask ? 'إضافة موظف مهام جديد' : 'إضافة موظف دوام جديد');
        await refresh('emps'); toast('تمت الإضافة — انسخ الرابط وأرسله للموظف', 'good');
      }
      if (act === 'reloadAudit') { S.auditLogs = null; viewEmps($('#content')); await loadAuditLogs(true); viewEmps($('#content')); return toast('تم تحديث سجل التدقيق', 'good'); }
      if (act === 'auditCsv') {
        const logs = Array.isArray(S.auditLogs) ? S.auditLogs : [];
        if (!logs.length) return toast('لا توجد قيود لتصديرها', 'err');
        const aoa = [['التاريخ والوقت', 'العملية', 'الهدف / المعني', 'التفاصيل', 'المشرف المنفّذ']];
        logs.forEach(x => {
          const d = x.at && x.at.toDate ? x.at.toDate() : null;
          const lb = (AUDIT_LABELS[x.action] || ['', x.action || ''])[1];
          aoa.push([d ? `${fmtDate(d)} ${fmtTime(d, true)}` : '', lb, x.target || '', x.detail || '', (x.by && x.by.name) || '']);
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csvAoa(aoa)], { type: 'text/csv;charset=utf-8' }));
        a.download = `meqat_audit_log_${dayKey(new Date())}.csv`; a.click();
        return toast('تم تنزيل سجل التدقيق الرقابي (CSV)', 'good');
      }
      if (act === 'copy') { await navigator.clipboard.writeText(linkOf(id)); toast('تم نسخ رابط الموظف', 'good'); }
      if (act === 'wa') {
        const e = S.emps.find(x => x.id === id);
        const pinTxt = '';
        const msg = `مرحباً ${e.name}، هذا رابطك الشخصي في «${BRAND}» لتسجيل الحضور والانصراف (لا تشاركه مع أحد):\n${linkOf(id)}\n\nافتحه من متصفح Chrome أو Safari وليس من داخل واتساب.${pinTxt}`;
        const a = document.createElement('a'); a.href = `https://wa.me/${e.phone || ''}?text=${encodeURIComponent(msg)}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click();
      }
      if (act === 'devPin') return deviceManager(S.emps.find(x => x.id === id));
      if (act === 'resetDev') { const e = S.emps.find(x => x.id === id); if (await mqConfirm('إعادة ضبط كل الأجهزة المرتبطة بهذا الموظف؟ سيتوجب عليه فتح الرابط من جهازه بعد ذلك.')) { await updateDoc(doc(db, 'employees', id), { deviceId: null, uid: null, devices: null, rebindProof: null }); logAudit('dev_reset', (e && e.name) || id, 'إعادة ضبط جميع الأجهزة المرتبطة'); await refresh('emps'); toast('تمت إعادة الضبط', 'good'); } }
      if (act === 'toggle') {
        const e = S.emps.find(x => x.id === id);
        if (e.active && !await mqConfirm(`إيقاف «${e.name}»؟\nتبقى سجلاته وتقاريره السابقة محفوظة، ولا يُحتسب غيابه بعد اليوم.`)) return;
        await updateDoc(doc(db, 'employees', id), e.active ? { active: false, archivedAt: serverTimestamp() } : { active: true, archivedAt: null });
        logAudit('emp_toggle', e.name, e.active ? 'إيقاف/أرشفة الموظف' : 'إعادة تفعيل الموظف');
        await refresh('emps');
      }
      if (act === 'hardDelEmp') {
        const empToDel = S.emps.find(x => x.id === id);
        if (!empToDel || empToDel.active) return toast('الحذف النهائي متاح فقط للموظفين الموقوفين/المُرشَّفين', 'err');
        if (!await mqConfirm(`حذف «${empToDel.name}» نهائياً مع كل سجلاته وطلباته؟ لا يمكن التراجع.`)) return;
        for (const sub of ['records', 'requests', 'joins', 'loanLedger']) {
          for (;;) {
            const grp = await getDocs(query(collection(db, 'employees', id, sub), limit(300)));
            if (!grp.size) break;
            const b = writeBatch(db);
            grp.forEach(d => b.delete(d.ref));
            await b.commit();
            if (grp.size < 300) break;
          }
        }
        try { await deleteDoc(doc(db, 'empFinance', id)); } catch (e2) { logErr('empFinance-delete', e2); toast('تنبيه: حُذف الموظف لكن تعذّر حذف خزينته المالية — احذفها يدوياً من Firebase', 'err'); }
        await deleteDoc(doc(db, 'employees', id));
        logAudit('emp_delete', empToDel.name, 'حذف نهائي للموظف مع سجلاته وطلباته');
        await RecCache.clear(); S.reqs = S.reqs.filter(r => r.empId !== id); S.leaves = S.leaves.filter(r => r.empId !== id); S.recs = S.recs.filter(r => r.empId !== id); S.todayPrev = (S.todayPrev || []).filter(r => r.empId !== id); S.todayLive = (S.todayLive || []).filter(r => r.empId !== id); mergeToday(); await refresh('emps'); toast('حُذف الموظف وسجلاته نهائياً', 'good');
      }
      if (act === 'myLoc') {
        toast('جاري تحديد موقعك…');
        navigator.geolocation.getCurrentPosition(p => { $('#lCoord').value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`; toast('تم تعبئة الإحداثيات', 'good'); }, () => toast('تعذر تحديد الموقع', 'err'), { enableHighAccuracy: true, timeout: 20000 });
      }
      if (act === 'addLoc') {
        const name = $('#lName').value.trim();
        const m = $('#lCoord').value.match(/(-?\d+(?:\.\d+)?)\s*[,،\s]\s*(-?\d+(?:\.\d+)?)/);
        const radius = parseInt($('#lRad').value, 10);
        if (!name || !m || !(radius >= 10)) return toast('أكمل الاسم والإحداثيات والنطاق (10 أمتار على الأقل)', 'err');
        const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return toast('إحداثيات غير صحيحة', 'err');
        await addDoc(collection(db, 'locations'), { name, lat, lng, radius, active: true, ...geoK(lat) });
        await refresh('locs'); toast('تمت إضافة الموقع', 'good');
      }
      if (act === 'copyRules') {
        if (!isSuper()) return toast('نسخ قواعد Firestore محصور بالمدير العام', 'err');
        const me = ((auth.currentUser && auth.currentUser.email) || '').toLowerCase();
        const isSec = S.admins.some(x => x.id === auth.currentUser.uid || String(x.email || x.id).toLowerCase() === me);
        let owner = S.ownerEmail;
        if (!owner) {
          if (isSec) return toast('لم يُسجَّل بريد المالك بعد — يجب أن ينسخ المالك القواعد أولاً', 'err');
          owner = me;
          try { await setDoc(doc(db, 'admins', 'owner'), { name: 'المالك', email: me, addedAt: serverTimestamp() }); S.ownerEmail = me; } catch (e2) { logErr('owner-bootstrap', e2); }
        }
        await navigator.clipboard.writeText(rulesText(owner)); toast('تم نسخ القواعد — الصقها في Firestore › Rules', 'good');
      }
      if (act === 'certEmp') return printCertificate(S.emps.find(x => x.id === id));
      if (act === 'slipEmp') return printPayslips(id);
      if (act === 'printSlips') return printPayslips('');
      if (act === 'bankCsv') {
        const pr = payrollRows().filter(r => r.pm !== 'none' && r.net > 0);
        if (!pr.length) return toast('لا توجد رواتب مستحقة للصرف', 'err');
        const rows = [['الموظف', 'الرقم الوطني', 'المصرف', 'رقم الحساب / IBAN', 'صافي الراتب المستحق', 'الفترة']];
        pr.forEach(r => rows.push([r.name, r.nationalId || '', r.bankName || '', r.iban || '', (Math.round(r.net * 100) / 100).toFixed(2), `${S.from} -> ${S.to}`]));
        const csv = '\ufeff' + rows.map(r => r.map(c => { const s = String(c ?? ''); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return `"${safe.replace(/"/g, '""')}"`; }).join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `bank_disbursement_${S.from}_${S.to}.csv`; a.click();
        return toast('تم تنزيل كشف الصرف المصرفي (CSV/Excel)', 'good');
      }
      if (act === 'assetDoc') return printAssetDoc(S.emps.find(x => x.id === id));
      if (act === 'sealMonth' || act === 'archivePurgeMonth') {
        const mk = ($('#archMonth') ? $('#archMonth').value.trim() : '');
        const curMk = dayKey(new Date()).slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(mk) || mk >= curMk) return toast('اختر شهراً منتهياً (قبل الشهر الجاري)', 'err');
        const ms = dayStart(mk + '-01'), me = dayStart(nextMonthKey(mk) + '-01');
        toast(`جاري جلب بصمات شهر ${mk}…`);
        const f = [], raw = await fetchRecs(ms, me, f);
        if (f.length) return toast('تعذّرت قراءة سجلات بعض الموظفين — أعد المحاولة قبل التجميد', 'err');
        if (!raw.length) {
          // ربما أُفرغت البصمات الخام سابقاً وبقي الملخص المجمّع
          const ex = await getDoc(doc(db, 'monthlySummaries', mk));
          if (ex.exists()) return toast(`ملخص شهر ${mk} مجمّد ومحفوظ مسبقاً (${ex.data().count} بصمة)`, 'good');
          return toast(`لا توجد بصمات مسجّلة في شهر ${mk}`, 'err');
        }
        const saved = await saveMonthSummaryDoc(mk, raw);
        if (!saved) return toast('حجم سجلات الشهر يتجاوز حد الوثيقة الواحدة', 'err');
        await RecCache.set(recScope() + '|' + TZOFF + '|' + mk, { at: Date.now(), rows: raw.map(recSer) });
        logAudit('month_seal', mk, `تجميد ملخص شهر ${mk} (${saved.count} بصمة · SHA-256: ${saved.sha256.slice(0, 12)}…)`);
        if (act === 'sealMonth') {
          return toast(`تم تجميد ملخص ${mk} (${saved.count} بصمة) — سيُقرأ بقراءة واحدة فقط من أي جهاز ✅`, 'good');
        }
        // تصدير ملف الأرشيف الموقّع قبل خيار تفريغ الوثائق الفردية
        const archObj = {
          app: 'meqat-month-archive',
          version: 1,
          mk,
          tzOff: TZOFF,
          exportedAt: new Date().toISOString(),
          count: saved.count,
          sha256: saved.sha256,
          packed: saved.packed
        };
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(archObj, null, 2)], { type: 'application/json' }));
        a.download = `meqat_archive_${mk}.json`;
        a.click();
        if (!await mqConfirm(`تم تنزيل ملف الأرشيف (meqat_archive_${mk}.json) وحفظ الملخص المجمّع في النظام (${saved.count} بصمة).\n\nهل تريد الآن حذف وثائق البصمات الخام الفردية (${raw.length} وثيقة) لشهر ${mk} من Firestore لتفريغ المساحة المجانية؟\n(ستبقى تقارير ورواتب شهر ${mk} تعمل طبيعياً في اللوحة عبر الملخص المجمّع)`)) {
          return toast(`تم تنزيل الأرشيف وتجميد الملخص دون حذف البصمات الخام`, 'good');
        }
        toast(`جاري تفريغ ${raw.length} وثيقة بصمة خام لشهر ${mk}…`);
        for (let i = 0; i < raw.length; i += 350) {
          const b = writeBatch(db);
          raw.slice(i, i + 350).forEach(r => b.delete(doc(db, 'employees', r.empId, 'records', r.id)));
          await b.commit();
        }
        logAudit('month_archive', mk, `أرشفة وتفريغ ${raw.length} بصمة خام لشهر ${mk} (SHA-256: ${saved.sha256.slice(0, 12)}…)`);
        return toast(`تمت أرشفة وتفريغ ${raw.length} بصمة خام لشهر ${mk} بنجاح ✅`, 'good');
      }
      if (act === 'restoreArchiveMonth') {
        const inp = $('#archRestoreInp'); if (!inp) return;
        inp.value = '';
        inp.onchange = async e => {
          const f = e.target.files[0]; if (!f) return;
          try {
            const d = JSON.parse(await f.text());
            if (d.app !== 'meqat-month-archive' || !/^\d{4}-\d{2}$/.test(d.mk || '') || typeof d.packed !== 'string') {
              return toast('ملف أرشيف شهر غير صالح', 'err');
            }
            const calcHash = await sha256Hex(d.packed);
            if (d.sha256 && calcHash !== d.sha256) {
              return await mqAlert('رفض الاستعادة: بصمة النزاهة (SHA-256) لا تطابق محتوى الملف — قد يكون الملف معدّلاً!');
            }
            const recs = unpackMonthRecs(d, msVal => Timestamp.fromMillis(msVal));
            if (!recs.length) return toast('الأرشيف فارغ', 'err');
            if (!await mqConfirm(`استعادة أرشيف شهر ${d.mk} (${recs.length} بصمة موثّقة ببصمة SHA-256) إلى قاعدة البيانات؟`)) return;
            await _setDoc(doc(db, 'monthlySummaries', d.mk), { mk: d.mk, tzOff: +d.tzOff || TZOFF, count: recs.length, packed: d.packed, sha256: calcHash, updatedAt: serverTimestamp(), by: runBy() });
            if (await mqConfirm(`تمت استعادة وثيقة ملخص الشهر (${d.mk}) بنجاح (التقارير والرواتب جاهزة للقراءة الفورية).\nهل تريد أيضاً إعادة كتابة وثائق البصمات الفردية (${recs.length} وثيقة) تحت كل موظف؟`)) {
              for (let i = 0; i < recs.length; i += 350) {
                const b = writeBatch(db);
                recs.slice(i, i + 350).forEach(r => {
                  b.set(doc(db, 'employees', r.empId, 'records', r.id), {
                    type: r.type, time: r.time, lat: r.lat, lng: r.lng, accuracy: 0,
                    distance: r.distance, locationId: r.locationId || 'archive',
                    locationName: r.locationName || '', empName: r.empName || '', deviceId: 'archive-restore'
                  });
                });
                await b.commit();
              }
            }
            await RecCache.clear();
            logAudit('month_restore', d.mk, `استعادة أرشيف شهر ${d.mk} (${recs.length} بصمة)`);
            await refresh('recs');
            toast(`تمت استعادة أرشيف شهر ${d.mk} بنجاح ✅`, 'good');
          } catch (err) { console.error(err); toast('فشلت استعادة الأرشيف', 'err'); }
        };
        inp.click(); return;
      }
      if (act === 'backupDB') {
        // الطوابع الزمنية (Timestamp) تُحفظ بصيغة {__ts: ملّي ثانية} كي تُستعاد كطوابع حقيقية لا كخرائط
        const tsRep = function (k, v) { const o = this[k]; return (o && typeof o === 'object' && typeof o.toMillis === 'function' && typeof o.toDate === 'function') ? { __ts: o.toMillis() } : v; };
        const data = { app: 'meqat-backup', exportedAt: dayKey(new Date()), settings: S.set, locations: S.locs, schedules: S.scheds, holidays: S.hols, taskTypes: S.taskTypes, employees: S.emps };
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, tsRep, 2)], { type: 'application/json' })); a.download = `meqat_backup_${dayKey(new Date())}.json`; a.click();
        return toast('تم تنزيل النسخة الاحتياطية (الإعدادات والموظفون والجداول والمواقع والعطل)', 'good');
      }
      if (act === 'restoreDB') {
        const inp = $('#restoreInp'); if (!inp) return;
        inp.value = '';
        inp.onchange = async e => {
          const f = e.target.files[0]; if (!f) return;
          try {
            const tsRev = (k, v) => (v && typeof v === 'object' && typeof v.__ts === 'number' && Object.keys(v).length === 1) ? Timestamp.fromMillis(v.__ts) : v;
            const d = JSON.parse(await f.text(), tsRev);
            if (d.app !== 'meqat-backup' || !Array.isArray(d.employees)) return toast('ملف نسخة احتياطية غير صالح', 'err');
            if (!await mqConfirm(`استعادة النسخة المؤرخة ${d.exportedAt} (${d.employees.length} موظف)؟ سيتم دمج وتحديث البيانات الحالية.`)) return;
            const ops = [];
            if (d.settings) ops.push([doc(db, 'settings', 'general'), d.settings]);
            [['locations', d.locations], ['schedules', d.schedules], ['holidays', d.holidays], ['taskTypes', d.taskTypes]].forEach(([col, arr]) => (arr || []).forEach(x => { const { id: k, ...rest } = x; if (k) ops.push([doc(db, col, k), rest]); }));
            // لا نُرجع حالة البصمة الأخيرة (state/lastAt/lastRecId) كي لا تتعارض مع السجلات الحالية
            (d.employees || []).forEach(x => { const { id: k, state, lastAt, lastRecId, ...rest } = x; if (k) ops.push([doc(db, 'employees', k), rest]); });
            for (let i = 0; i < ops.length; i += 400) {
              const b = writeBatch(db);
              ops.slice(i, i + 400).forEach(([ref, data]) => b.set(ref, data, { merge: true }));
              await b.commit();
            }
            await bumpCfg(doc(db, 'settings', 'general'));
            await loadAll({ force: true }); toast('تمت استعادة النسخة الاحتياطية بنجاح', 'good');
          } catch (err) { console.error(err); toast('فشلت الاستعادة', 'err'); }
        };
        inp.click(); return;
      }
      if (act === 'impBio') {
        const inp = $('#bioFileInp'); if (!inp) return;
        inp.value = '';
        inp.onchange = async e => {
          const f = e.target.files[0]; if (!f) return;
          try {
            const txt = await f.text();
            const byBio = new Map();
            S.emps.forEach(emp => { if (emp.bioId) byBio.set(String(emp.bioId).trim(), emp); });
            if (!byBio.size) return toast('اربط أرقام البصمة (ZKTeco ID) بالموظفين أولاً من تعديل بيانات الموظف', 'err');
            // يدعم attlog.dat (معرّف ⟵ تاريخ ووقت ⟵ …) وملفات CSV (معرّف، تاريخ ووقت، [حالة])
            const raw = [];
            for (const line of txt.split(/\r?\n/)) {
              const p = line.split(/[\t,;]+/).map(s => s.trim().replace(/^"|"$/g, ''));
              if (p.length < 2) continue;
              const emp = byBio.get(p[0]); if (!emp) continue;
              const m = p[1].match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/); if (!m) continue;
              // الوقت في الجهاز هو توقيت المنشأة، فنحوّله بحسب المنطقة الزمنية المضبوطة لا بحسب جهاز المدير
              const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - TZOFF * 60000;
              let type = null;
              if (p.length === 3) { const s = p[2].toLowerCase(); if (['1', 'o', 'out', 'انصراف'].includes(s)) type = 'out'; else if (['0', 'i', 'in', 'حضور'].includes(s)) type = 'in'; }
              raw.push({ emp, ms, type });
            }
            if (!raw.length) return toast('لم يُعثر على سجلات مطابقة لأرقام البصمة المسجلة', 'err');
            // ترتيب + حذف التكرار القريب (أقل من دقيقة) + تحديد حضور/انصراف بالتناوب داخل اليوم إن لم تُحدَّد الحالة
            raw.sort((x, y) => x.emp.id.localeCompare(y.emp.id) || x.ms - y.ms);
            const recs = []; let lastE = '', lastMs = 0, dayId = '', n = 0;
            for (const r of raw) {
              if (r.emp.id === lastE && r.ms - lastMs < 60000) continue;
              const dk = r.emp.id + '|' + Math.floor((r.ms + TZOFF * 60000) / 86400000);
              if (dk !== dayId) { dayId = dk; n = 0; }
              recs.push({ emp: r.emp, ms: r.ms, type: r.type || (n % 2 === 0 ? 'in' : 'out') });
              n++; lastE = r.emp.id; lastMs = r.ms;
            }
            const empN = new Set(recs.map(r => r.emp.id)).size;
            if (!await mqConfirm(`تم العثور على ${recs.length} حركة بصمة تخص ${empN} موظفاً (من ${fmtDate(new Date(recs[0].ms))} إلى ${fmtDate(new Date(recs[recs.length - 1].ms))}).\nهل تريد استيرادها؟ (إعادة استيراد نفس الملف لا تكرّر السجلات)`)) return;
            for (let i = 0; i < recs.length; i += 350) {
              const b = writeBatch(db);
              recs.slice(i, i + 350).forEach(r => {
                const ref = doc(db, 'employees', r.emp.id, 'records', 'bio_' + r.ms);
                b.set(ref, { type: r.type, time: Timestamp.fromMillis(r.ms), lat: 0, lng: 0, accuracy: 0, distance: 0, locationId: 'biometric', locationName: 'جهاز البصمة', empName: r.emp.name, deviceId: 'zkteco-import' });
              });
              await b.commit();
            }
            const monthsTouched = [...new Set(recs.map(r => dayKey(new Date(r.ms)).slice(0, 7)))];
            await Promise.all(monthsTouched.map(m => invalidateMonthSummary(m)));
            await RecCache.clear(); await refresh('emps', 'recs'); toast(`تم استيراد ${recs.length} بصمة بنجاح ✅`, 'good');
          } catch (err) { console.error(err); toast('فشل استيراد ملف البصمات', 'err'); }
        };
        inp.click(); return;
      }
      if (act === 'isolateFinAll') {
        await ensureFinanceLoaded(true);
        const targets = S.emps.filter(e => !e.finIsolated || e.payAmount > 0 || e.iban || e.loanTotal > 0);
        if (!targets.length) return toast('جميع الموظفين معزولون مالياً بالفعل', 'good');
        if (!await mqConfirm(`عزل وترحيل البيانات المالية والمصرفية لـ ${targets.length} موظف إلى الخزينة المحمية (empFinance) ومسحها من وثائق الموظفين العامة؟\n(يبقى المدير العام ومحاسب الرواتب قادرين على إدارتها بشكل طبيعي تماماً)`)) return;
        for (let i = 0; i < targets.length; i += 150) {
          const b = writeBatch(db);
          targets.slice(i, i + 150).forEach(e => {
            const fin = { ...extractEmpFinance(e), updatedAt: serverTimestamp() };
            b.set(doc(db, 'empFinance', e.id), fin, { merge: true });
            b.update(doc(db, 'employees', e.id), stripEmpFinance({ empType: e.empType }));
          });
          await b.commit();
        }
        S.finLoaded = false;
        await loadEmps();
        await ensureFinanceLoaded(true);
        logAudit('fin_isolate', `عزل مالي شامل`, `ترحيل وعزل البيانات المالية لـ ${targets.length} موظف إلى empFinance`);
        render();
        return toast(`تم عزل وترحيل البيانات المالية لـ ${targets.length} موظف بنجاح 🔒`, 'good');
      }
      if (act === 'addSchedOv') {
        const tgt = ($('#ovTarget') ? $('#ovTarget').value : '*');
        const sid = ($('#ovSched') ? $('#ovSched').value : '');
        const from = ($('#ovFrom') ? $('#ovFrom').value : '');
        const to = ($('#ovTo') ? $('#ovTo').value : '');
        const rotPos = Math.max(1, parseInt($('#ovRot') ? $('#ovRot').value : '1', 10) || 1);
        const note = ($('#ovNote') ? $('#ovNote').value.trim().slice(0, 80) : '');
        const sc = S.scheds.find(s => s.id === sid);
        if (!sc) return toast('اختر الجدول البديل أولاً', 'err');
        if (!from || !to || to < from) return toast('حدد فترة استثناء صحيحة', 'err');
        let empId = '', dept = '';
        if (tgt === '*') empId = '*';
        else if (tgt.startsWith('dept:')) dept = tgt.slice(5);
        else if (tgt.startsWith('emp:')) empId = tgt.slice(4);
        const curList = (S.set && Array.isArray(S.set.schedOverrides)) ? [...S.set.schedOverrides] : [];
        const snapSc = { id: sc.id, name: sc.name, mode: sc.mode, days: sc.days, shifts: sc.shifts, cycle: sc.cycle, anchor: sc.anchor, breakMin: sc.breakMin, graceLate: sc.graceLate, graceEarly: sc.graceEarly, graceMode: sc.graceMode, ot: sc.ot };
        const ovItem = { id: 'ov_' + Date.now().toString(36), empId, dept, scheduleId: sid, rotOffset: rotPos - 1, from, to, note, schedSnap: snapSc };
        curList.push(ovItem);
        await setDoc(doc(db, 'settings', 'general'), { schedOverrides: curList, updatedAt: serverTimestamp() }, { merge: true });
        logAudit('sched_override', note || sc.name, `إضافة استثناء دوام (${from} ← ${to}) بجدول «${sc.name}»`);
        await refresh('set');
        return toast('أُضيف استثناء الدوام المؤقت بنجاح ✅', 'good');
      }
      if (act === 'delSchedOv') {
        if (!await mqConfirm('حذف هذا الاستثناء المؤقت؟')) return;
        const curList = ((S.set && Array.isArray(S.set.schedOverrides)) ? S.set.schedOverrides : []).filter(o => o.id !== id);
        await setDoc(doc(db, 'settings', 'general'), { schedOverrides: curList, updatedAt: serverTimestamp() }, { merge: true });
        logAudit('sched_override', id, 'حذف استثناء دوام مؤقت');
        await refresh('set');
        return toast('حُذف الاستثناء المؤقت', 'good');
      }
      if (act === 'newSched') scheduleEditor(null);
      if (act === 'editSched') scheduleEditor(S.scheds.find(x => x.id === id));
      if (act === 'dupSched') { const x = JSON.parse(JSON.stringify(S.scheds.find(y => y.id === id))); delete x.id; delete x.createdAt; delete x.updatedAt; x.name += ' (نسخة)'; await addDoc(collection(db, 'schedules'), { ...x, createdAt: serverTimestamp() }); await refresh('scheds'); toast('تم نسخ الجدول', 'good'); }
      if (act === 'delSched') { const n = S.emps.filter(e => e.scheduleId === id).length; if (await mqConfirm(n ? `هذا الجدول مرتبط بـ ${n} موظف وسيصبحون بدون جدول. هل تريد حذفه؟` : 'حذف هذا الجدول؟')) { await deleteDoc(doc(db, 'schedules', id)); await refresh('scheds'); } }
      if (act === 'editEmp') employeeEditor(S.emps.find(x => x.id === id));
      if (act === 'delLoc') { if (await mqConfirm('حذف هذا الموقع؟')) { await deleteDoc(doc(db, 'locations', id)); await refresh('locs'); } }
      if (act === 'mapLoc') return locEditor(null);
      if (act === 'editLoc') { const x = S.locs.find(y => y.id === id); if (x) return locEditor(x); }
      if (act === 'runSave') return runSave();
    if (act === 'runRecalc') return runRecalc(id);
    if (act === 'runView') return runView(id);
    if (act === 'runApprove') return runApprove(id);
    if (act === 'runPay') return runPay(id);
    if (act === 'runVerify') return runVerify(id);
    if (act === 'runDel') return runDel(id);
    if (act === 'runLedger') return runLedgerAct(id);
    if (act === 'runXlsx') return runExportExcel(id);
    if (act === 'runBankCsv') return runExportBankCsv(id);
    if (act === 'runSlips') return runPrintSlips(id);
    if (act === 'runSlip') return runPrintSlips(id, b.dataset.e);
    if (act === 'loanOpen') return loanOpen();
    if (act === 'loanLog') return loanLog(id);
      if (act === 'xlsx') { toast('جاري تجهيز ملف Excel…'); await exportExcel(); return; }
      if (act === 'print') { toast('جاري تجهيز كشف الطباعة…'); printReport(); return; }
      if (act === 'addHol') {
        const d = $('#hDay').value, n = $('#hName').value.trim();
        if (!d || !n) return toast('حدد تاريخ العطلة واسمها', 'err');
        await setDoc(doc(db, 'holidays', d), { date: d, name: n, createdAt: serverTimestamp() });
        await refresh('hols'); toast('أُضيفت العطلة الرسمية', 'good');
      }
      if (act === 'delHol') { if (await mqConfirm('حذف هذه العطلة؟')) { await deleteDoc(doc(db, 'holidays', id)); await refresh('hols'); } }
      if (act === 'saveSet') {
        const org = $('#sOrg').value.trim();
        const tz = parseInt($('#sTz').value, 10);
        const fgd = parseFloat($('#sForgot').value);
        await setDoc(doc(db, 'settings', 'general'), { orgName: org, tzOffset: isNaN(tz) ? TZ_OFFSET_MIN : tz, ...(isSuper() ? { forgotDeductDays: isNaN(fgd) ? 0 : Math.min(1, Math.max(0, fgd)) } : {}), empNotice: ($('#sNotice') ? $('#sNotice').value.trim().slice(0, 300) : ''), updatedAt: serverTimestamp() }, { merge: true });
        logAudit('settings_update', org || 'إعدادات المنشأة', `تحديث إعدادات المنشأة (التوقيت: ${tz})`);
        if (!isNaN(tz) && tz !== TZOFF) TZOFF = tz;
        await refresh('set', 'recs'); toast('حُفظت إعدادات المنشأة', 'good');
      }
      if (act === 'addAdmin') {
        const nm = ($('#aName') ? $('#aName').value.trim() : '');
        const em = ($('#aUid') ? $('#aUid').value.trim() : '');
        const pw = $('#aPw') ? $('#aPw').value : '';
        if (!nm) return toast('اكتب اسم المشرف', 'err');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return toast('اكتب بريداً إلكترونياً صحيحاً', 'err');
        let key, note;
        if (pw && pw.length >= 6) {
          const tmp = initializeApp(firebaseConfig, 'adm-' + Date.now());
          try {
            const cred = await createUserWithEmailAndPassword(getAuth(tmp), em, pw);
            key = cred.user.uid; note = 'أُنشئ حساب المشرف وأُضيفت صلاحياته';
          } catch (e2) {
            if (e2 && e2.code === 'auth/email-already-in-use') { key = em.toLowerCase(); note = 'البريد مستخدم من قبل — أُضيفت الصلاحيات لحسابه الحالي'; }
            else throw e2;
          } finally {
            try { await signOut(getAuth(tmp)); } catch {}
            try { await deleteApp(tmp); } catch {}
          }
        } else {
          if (pw) return toast('كلمة المرور 6 أحرف على الأقل (أو اتركها فارغة لمنح صلاحيات لحساب موجود مسبقاً)', 'err');
          key = em.toLowerCase(); note = 'البريد موجود مسبقاً — أُضيفت الصلاحيات لحسابه';
        }
        const role = $('#aRole') ? $('#aRole').value : 'super_admin';
        const deptScope = $('#aDept') ? $('#aDept').value.trim() : '';
        if (!['super_admin', 'hr_admin', 'payroll_admin', 'manager', 'auditor'].includes(role)) return toast('الدور المحدد غير صالح', 'err');
        if (role === 'manager' && !deptScope) return toast('حدد قسمًا ثابتًا لمدير القسم؛ لا يمكن ترك النطاق فارغًا', 'err');
        await setDoc(doc(db, 'admins', key), { name: nm, email: em.toLowerCase(), role, ...(role === 'manager' ? { deptScope } : {}), addedAt: serverTimestamp() });
        await refresh('admins'); toast(note, 'good');
      }
      if (act === 'delAdmin') { if (await mqConfirm('إزالة صلاحيات هذا المشرف؟')) { await deleteDoc(doc(db, 'admins', id)); await refresh('admins'); } }
      if (act === 'v2Done') { localStorage.setItem('att_rules_v5', '1'); return render(); }
      if (act === 'appr' || act === 'rej') {
        const empId = b.dataset.e;
        const r = S.reqs.find(x => x.id === id && x.empId === empId);
        if (!r || r.status !== 'pending') return toast('هذا الطلب لم يعد معلّقاً — حدّث الصفحة', 'err');
        const st = act === 'appr' ? 'approved' : 'rejected';
        let warn = '', extra = {};
        if (act === 'appr' && r && r.kind === 'leave') {
          const c = empCtx(empId), lt = findLT(r), n = countLeaveDays(r.from, r.to, c.sc, c.rot, S.holKeys);
          if (!n) return toast('هذه الفترة لا تتضمن أي يوم دوام لهذا الموظف', 'err');
          const ded = lt ? !!lt.deduct : leaveDeducts(r);
          const ans = await mqPrompt(`نسبة الدفع لهذه الإجازة (${n} يوم عمل) من 0 إلى 100%\nالافتراضي حسب نوعها «${r.typeName || ''}»:`, String(lt ? +lt.pct : leavePct(r)));
          if (ans === null) return;
          const pct = parseFloat(ans);
          if (isNaN(pct) || pct < 0 || pct > 100) return toast('نسبة غير صحيحة (0–100)', 'err');
          extra = { payPct: pct, deduct: ded, workDays: n };
          if (ded) { const emp0 = S.emps.find(x => x.id === empId), yr = r.from.slice(0, 4), q = emp0 && emp0.leaveQuota != null ? emp0.leaveQuota : 21, u = annualUsed(empId, yr); if (u + n > q) warn += `\n\nتنبيه: الرصيد المتبقي ${q - u} يوم وهذا الطلب ${n} يوم عمل — يتجاوز الرصيد.`; }
          if (lt && +lt.cap > 0) { const yr = r.from.slice(0, 4), used = S.leaves.filter(l => l.empId === empId && (l.type === lt.id || l.typeName === lt.name)).reduce((a, l) => a + countLeaveDays(l.from, l.to, c.sc, c.rot, S.holKeys, yr), 0); if (used + n > +lt.cap) warn += `\n\nتنبيه: يتجاوز الحد السنوي لنوع «${lt.name}» (${lt.cap} يوم، المستهلك ${used}).`; }
          warn += `\n\nيُحتسب ${n} يوم عمل بنسبة دفع ${pct}%.`;
        }
        if (act === 'appr' && r && r.kind === 'task') {
          const tt = S.taskTypes.find(x => x.id === r.taskId), e0 = S.emps.find(x => x.id === empId) || {};
          let price = e0.taskPrices && e0.taskPrices[r.taskId] != null ? +e0.taskPrices[r.taskId] : (tt ? +tt.price : NaN);
          if (isNaN(price)) { const p = await mqPrompt('سعر الوحدة لهذه المهمة غير محدد (نوع محذوف) — اكتب السعر:'); if (p === null) return; price = parseFloat(p); if (isNaN(price) || price < 0) return toast('سعر غير صحيح', 'err'); }
          const qa = await mqPrompt(`الكمية المعتمدة (المطلوب ${r.qty}) — سعر الوحدة ${price}:`, String(r.qty));
          if (qa === null) return;
          const q = parseFloat(qa);
          if (isNaN(q) || q <= 0 || q > 1000) return toast('كمية غير صحيحة', 'err');
          extra = { qtyApproved: q, unitPrice: price, amount: Math.round(q * price * 100) / 100 };
          warn += `\n\nالمبلغ = ${q} × ${price} = ${extra.amount}`;
        }
        if (!await mqConfirm((act === 'appr' ? 'اعتماد هذا الطلب؟' : 'رفض هذا الطلب؟') + warn)) return;
        const batch = writeBatch(db);
        batch.update(doc(db, 'employees', empId, 'requests', id), { status: st, reviewedAt: serverTimestamp(), reviewedBy: (auth.currentUser && auth.currentUser.email) || '', ...extra });

        if (st === 'approved' && r && r.kind === 'fix') {
          const base = dayStart(r.from);
          const offMeta = r.type === 'offline_gps' ? parseOfflineNote(r.note) : null;
          const mkTime = (type, tstr) => { let m = hm(tstr); if (type === 'out' && r.fixIn && m <= hm(r.fixIn)) m += 1440; return Timestamp.fromDate(new Date(base.getTime() + m * 60000)); };
          const mkRec = type => offMeta ? ({
            type, lat: +offMeta.lat || 0, lng: +offMeta.lng || 0, accuracy: +offMeta.acc || 0, distance: +offMeta.dist || 0,
            locationId: offMeta.locId || 'admin', locationName: r.typeName || 'بصمة أوفلاين موثّقة', empName: r.empName, deviceId: 'offline-gps-verified'
          }) : ({ type, lat: 0, lng: 0, accuracy: 0, distance: 0, locationId: 'admin', locationName: 'تصحيح إداري (طلب معتمد)', empName: r.empName, deviceId: 'admin-fix' });
          let latestType = null, latestTs = null, latestId = null;
          if (r.fixIn) {
            const inRef = doc(collection(db, 'employees', empId, 'records'));
            const inTs = mkTime('in', r.fixIn);
            batch.set(inRef, { ...mkRec('in'), time: inTs });
            latestType = 'in'; latestTs = inTs; latestId = inRef.id;
          }
          if (r.fixOut) {
            const outRef = doc(collection(db, 'employees', empId, 'records'));
            const outTs = mkTime('out', r.fixOut);
            batch.set(outRef, { ...mkRec('out'), time: outTs });
            latestType = 'out'; latestTs = outTs; latestId = outRef.id;
          }
          const empDoc = S.emps.find(x => x.id === empId);
          const prevLastMs = empDoc && empDoc.lastAt && empDoc.lastAt.toMillis ? empDoc.lastAt.toMillis() : 0;
          if (latestTs && latestTs.toMillis() >= prevLastMs) {
            batch.update(doc(db, 'employees', empId), { state: latestType, lastAt: latestTs, lastRecId: latestId });
          }
        }
        if (st === 'approved' && r && r.kind === 'loan') {
          await ensureFinanceLoaded();
          const empDoc = S.emps.find(x => x.id === empId) || {};
          const addAmt = parseFloat(r.type) || 0, newInst = parseFloat(r.typeName) || (+empDoc.loanInst || 0);
          const newTotal = r2((+empDoc.loanTotal || 0) + addAmt);
          if (empDoc.finIsolated) {
            batch.set(doc(db, 'empFinance', empId), { loanTotal: newTotal, loanInst: newInst, updatedAt: serverTimestamp() }, { merge: true });
          } else {
            batch.update(doc(db, 'employees', empId), { loanTotal: newTotal, loanInst: newInst });
          }
          if (addAmt > 0) batch.set(doc(db, 'employees', empId, 'loanLedger', 'grant_' + id), { type: 'grant', delta: addAmt, balanceAfter: newTotal, reqId: id, note: 'سلفة بطلب معتمد', by: runBy(), at: serverTimestamp() });
        }
        await batch.commit();
        if (st === 'approved' && r && r.kind === 'loan') {
          const empDoc = S.emps.find(x => x.id === empId);
          if (empDoc && empDoc.finIsolated) {
            const addAmt = parseFloat(r.type) || 0, newInst = parseFloat(r.typeName) || (+empDoc.loanInst || 0);
            const newTotal = r2((+empDoc.loanTotal || 0) + addAmt);
            await saveEmpFinanceCache(empId, { ...(S.finMap && S.finMap.get(empId) || {}), loanTotal: newTotal, loanInst: newInst });
          }
        }
        logAudit(st === 'approved' ? 'req_approve' : 'req_reject', r.empName || empId, `${r.kind} (${r.from}${r.to && r.to !== r.from ? ' ← ' + r.to : ''})`);
        if (st === 'approved' && r.kind === 'fix') { await RecCache.clear(); await invalidateMonthSummary(r.from); }
        else await RecCache.del('reqs|' + recScope() + '|' + reqWin());
        try {
          const nd = await getDoc(doc(db, 'employees', empId, 'requests', id));
          if (nd.exists()) { const nr = reqMap(nd, empId), i = S.reqs.findIndex(x => x.id === id && x.empId === empId); if (i >= 0) S.reqs[i] = nr; else S.reqs.push(nr); S.leaves = S.reqs.filter(x => x.kind === 'leave' && x.status === 'approved'); }
        } catch (e3) { console.warn(e3); }
        await refresh(...(st === 'approved' && ['fix', 'loan'].includes(r.kind) ? ['emps'] : []), ...(st === 'approved' && r.kind === 'fix' ? ['recs'] : [])); toast(st === 'approved' ? 'تم اعتماد الطلب' : 'تم رفض الطلب', 'good');
        if (st === 'approved' && r && r.kind === 'cert') {
          setTimeout(() => printCertificate(S.emps.find(x => x.id === empId)), 300);
        }
      }
      if (act === 'ltEdit') return leaveTypesEditor();
      if (act === 'addTask') {
        const name = $('#tkName').value.trim(), price = parseFloat($('#tkPrice').value);
        if (!name || isNaN(price) || price < 0) return toast('اكتب اسم المهمة وسعرها', 'err');
        await addDoc(collection(db, 'taskTypes'), { name: name.slice(0, 80), price, active: true, createdAt: serverTimestamp() });
        await refresh('tasks'); toast('أُضيفت المهمة للكتالوج', 'good');
      }
      if (act === 'editTask') {
        const x = S.taskTypes.find(v => v.id === id); if (!x) return;
        const n = await mqPrompt('اسم المهمة:', x.name); if (n === null) return;
        const p = await mqPrompt('سعر الوحدة:', String(x.price)); if (p === null) return;
        const pv = parseFloat(p); if (!n.trim() || isNaN(pv) || pv < 0) return toast('بيانات غير صحيحة', 'err');
        await updateDoc(doc(db, 'taskTypes', id), { name: n.trim().slice(0, 80), price: pv });
        await refresh('tasks'); toast('تم التحديث — الأسعار المعتمدة سابقاً لا تتغيّر', 'good');
      }
      if (act === 'toggleTask') { const x = S.taskTypes.find(v => v.id === id); await updateDoc(doc(db, 'taskTypes', id), { active: x.active === false }); await refresh('tasks'); }
      if (act === 'delTask') { if (await mqConfirm('حذف هذه المهمة من الكتالوج؟ تبقى مهامها المعتمدة سابقاً محفوظة.')) { await deleteDoc(doc(db, 'taskTypes', id)); await refresh('tasks'); } }
      if (act === 'filter') {
        const f = $('#fFrom').value, t = $('#fTo').value;
        if (!f || !t || t < f) return toast('حدد فترة صحيحة', 'err');
        if ((dayStart(t) - dayStart(f)) / 86400000 > 92) return toast('الحد الأقصى للفترة 3 أشهر', 'err');
        S.from = f; S.to = t; S.emp = $('#fEmp').value; _sumC = null; await loadReqsBefore(f); await loadRecs(); _sumC = null; render();
      }
      if (act === 'csv') {
        const rows = [['الموظف', 'التاريخ', 'الحالة', 'أول حضور', 'آخر انصراف', 'متأخر (د)', 'مبكر (د)', 'صافي العمل (د)', 'إضافي (ساعات مكافئة)']];
        summary().forEach(s => rows.push([
          s.name, s.day,
          stText(s, ST_TXT),
          s.met.firstIn ? fmtTime(s.met.firstIn, true) : '',
          s.met.lastOut ? fmtTime(s.met.lastOut, true) : '',
          s.met.late || 0, s.met.early || 0, Math.round(s.met.net),
          s.met.otEq ? +s.met.otEq.toFixed(2) : 0
        ]));
        const csv = '\ufeff' + rows.map(r => r.map(c => { const s = String(c ?? ''); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return `"${safe.replace(/"/g, '""')}"`; }).join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `meqat_summary_${S.from}_${S.to}.csv`; a.click();
      }
    } catch (err) { console.error(err); toast('حدث خطأ [' + ((err && (err.code || err.message)) || '؟') + '] — تحقق من الاتصال وصلاحيات Firestore', 'err'); }
  };

  clearInterval(window.__meqatTick);
  // مؤقّت محلي خفيف: لا يقرأ من Firebase. يُحدّث الحالات المعتمدة على الوقت (متأخر/نسي الانصراف/مدة العمل) ويتحقق من تغيّر اليوم.
  window.__meqatTick = setInterval(async () => {
    if (!auth.currentUser) { stopTodayFeed(); return; }
    if (S.todayKey && dayKey(new Date()) !== S.todayKey) { try { await startTodayFeed(); } catch (e) { console.warn(e); } }
    if (S.tab !== 'today' || document.hidden || document.querySelector('.ov') || !$('#content')) return;
    viewToday($('#content'));
  }, 60000);
  loadAll();
}
