  /* --- تصدير Excel منسّق --- */
  const xlSafe = v => { if (typeof v !== 'string') return v; return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };
  async function loadXlsx() {
    let XLSX = null;
    for (const u of ['https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs', 'https://unpkg.com/xlsx@0.18.5/xlsx.mjs']) {
      try { XLSX = await import(u); if (XLSX && XLSX.utils) break; } catch (err) { console.warn('xlsx load failed:', u, err); XLSX = null; }
    }
    if (!XLSX) throw new Error('xlsx-load');
    return XLSX;
  }
  async function exportExcel() {
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      const aoa1 = [['الموظف', 'التاريخ', 'الحالة', 'أول حضور', 'آخر انصراف', 'متأخر (د)', 'مبكر (د)', 'صافي العمل (د)', 'إضافي (ساعات مكافئة)']];
      summary().forEach(s => aoa1.push([xlSafe(s.name), s.day, stText(s, ST_TXT), s.met.firstIn ? fmtTime(s.met.firstIn, true) : '', s.met.lastOut ? fmtTime(s.met.lastOut, true) : '', s.met.late || 0, s.met.early || 0, Math.round(s.met.net), s.met.otEq ? +s.met.otEq.toFixed(2) : 0]));
      const ws1 = XLSX.utils.aoa_to_sheet(aoa1);
      ws1['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 18 }];
      try { ws1['!views'] = [{ RTL: true }]; ws1['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa1.length - 1, c: 8 } }) }; } catch {}
      XLSX.utils.book_append_sheet(wb, ws1, 'الملخص اليومي');
      const aoa2 = [['الموظف', 'العملية', 'التاريخ', 'الوقت', 'الموقع', 'البعد (م)', 'خط العرض', 'خط الطول']];
      filtered().forEach(r => aoa2.push([xlSafe(r.empName), r.type === 'in' ? 'حضور' : 'انصراف', fmtDate(r.t), fmtTime(r.t, true), xlSafe(r.locationName), r.distance, r.lat, r.lng]));
      const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
      ws2['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 13 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
      try { ws2['!views'] = [{ RTL: true }]; } catch {}
      XLSX.utils.book_append_sheet(wb, ws2, 'عمليات البصمة');
      const pr = payrollRows().filter(r => r.pm !== 'none');
      if (pr.length) {
        const rn = v => +(Math.round(v * 100) / 100);
        const aoa3 = [['الموظف', 'طريقة الأجر', 'قيمة الأجر', 'ساعات عادية فعلية', 'الأساسي', 'قيمة الإضافي', 'خصم التأخير', 'خصم المبكر', 'خصم الغياب / إجازة بلا راتب', 'خصم نسيان الانصراف', 'علاوات/مكافآت', 'ضمان وضرائب', 'سلفة/جزاء', 'الصافي']];
        pr.forEach(r => aoa3.push([xlSafe(r.name), r.pm === 'monthly' ? 'شهري' : r.pm === 'task' ? 'بالمهام' : 'بالساعة', rn(r.amt), r.pm === 'task' ? r.taskQty : rn(r.paidH), rn(r.base), rn(r.otPay), rn(r.dedLate), rn(r.dedEarly), rn(r.dedAbs), rn(r.dedForgot || 0), rn(r.allowBonus || 0), rn(r.statDed || 0), rn((r.dedLoan || 0) + (r.dedPen || 0)), rn(r.net)]));
        const ws3 = XLSX.utils.aoa_to_sheet(aoa3);
        ws3['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
        try { ws3['!views'] = [{ RTL: true }]; } catch {}
        XLSX.utils.book_append_sheet(wb, ws3, 'الرواتب');
        const bkRows = pr.filter(r => r.net > 0);
        if (bkRows.length) {
          const aoaB = [['الموظف', 'الرقم الوطني', 'المصرف', 'رقم الحساب / IBAN', 'صافي الراتب المستحق', 'الفترة']];
          bkRows.forEach(r => aoaB.push([xlSafe(r.name), xlSafe(r.nationalId || ''), xlSafe(r.bankName || ''), xlSafe(r.iban || ''), rn(r.net), `${S.from} -> ${S.to}`]));
          const wsB = XLSX.utils.aoa_to_sheet(aoaB);
          wsB['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 16 }, { wch: 24 }];
          try { wsB['!views'] = [{ RTL: true }]; } catch {}
          XLSX.utils.book_append_sheet(wb, wsB, 'كشف مصرفي (IBAN)');
        }
      }
      const tkx = S.reqs.filter(r => r.kind === 'task' && r.status === 'approved' && r.from >= S.from && r.from <= S.to && (!S.emp || r.empId === S.emp)).sort((a, b) => a.from.localeCompare(b.from));
      if (tkx.length) {
        const aoa4 = [['الموظف', 'المهمة', 'التاريخ', 'الكمية', 'سعر الوحدة', 'المبلغ']];
        tkx.forEach(r => aoa4.push([xlSafe((S.emps.find(e => e.id === r.empId) || {}).name || ''), xlSafe(r.taskName || ''), r.from, +(r.qtyApproved ?? r.qty) || 0, +r.unitPrice || 0, +r.amount || 0]));
        const ws4 = XLSX.utils.aoa_to_sheet(aoa4);
        ws4['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws4, 'المهام المعتمدة');
      }
      XLSX.writeFile(wb, `meqat_${S.from}_${S.to}.xlsx`);
      toast('تم تنزيل ملف Excel', 'good');
    } catch (e) {
      console.error(e);
      toast('تعذر تجهيز Excel (ربما لا يوجد اتصال) — استخدم تصدير CSV', 'err');
    }
  }

  /* --- كشف دوام جاهز للطباعة/PDF --- */
  function printReport() {
    const sum = summary();
    if (!sum.length) { toast('لا توجد بيانات للفترة المحددة', 'err'); return; }
    const byEmp = new Map();
    sum.forEach(s => { const g = byEmp.get(s.empId) || { empId: s.empId, name: s.name, rows: [] }; g.rows.push(s); byEmp.set(s.empId, g); });
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف دوام من ${S.from} إلى ${S.to}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Rubik:wght@400;600;800&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
  <style>body{font-family:"Cairo","Rubik","IBM Plex Sans Arabic",Arial,sans-serif;margin:0;padding:24px;color:#0E2A20}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0E6B4D;padding-bottom:10px;margin-bottom:14px}
  h1{margin:0;font-size:22px} h2{margin:0 0 6px;font-size:19px}
  .meta{color:#587265;font-size:12.5px}
  section{margin-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:8px}
  th,td{border:1px solid #9CC4AF;padding:5px 7px;text-align:center}
  th{background:#D3EBDD;color:#0A5139}
  tr.abs td{color:#c93636;font-weight:700}
  tfoot td{font-weight:800;background:#EAF4EE}
  .sig{display:flex;justify-content:space-between;margin:10px 0 22px;font-size:13.5px}
  .pb{page-break-after:always}
  @page{size:A4;margin:12mm}</style></head><body>
  <header><div><h1>${esc(brandName())} — كشف دوام</h1><div class="meta">الفترة: ${fmtDate(dayStart(S.from))} إلى ${fmtDate(dayStart(S.to))}</div></div><div class="meta">طُبع في: ${fmtDate(new Date())}</div></header>
  ${[...byEmp.values()].map(g => {
      const rows = g.rows.slice().sort((a, b) => a.day.localeCompare(b.day));
      const net = rows.reduce((a, s) => a + (s.status === 'work' || s.status === 'open' ? s.met.net : 0), 0);
      const ote = rows.reduce((a, s) => a + (s.met.otEq || 0), 0);
      const late = rows.reduce((a, s) => a + (s.met.late || 0), 0);
      const early = rows.reduce((a, s) => a + (s.met.early || 0), 0);
      const emp = S.emps.find(e => e.id === g.empId);
      const scn = emp && emp.scheduleId ? (S.scheds.find(x => x.id === emp.scheduleId) || {}).name : '';
      return `<section class="emp"><h2>${esc(g.name)}</h2><div class="meta">الجدول: ${esc(scn || 'بدون جدول')} · متأخر: ${late} د · مبكر: ${early} د</div>
      <table><thead><tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>أول حضور</th><th>آخر انصراف</th><th>متأخر (د)</th><th>مبكر (د)</th><th>صافي العمل</th><th>إضافي (س.م)</th></tr></thead><tbody>
      ${rows.map(s => `<tr class="${s.status === 'absent' ? 'abs' : ''}"><td>${s.day.split('-').reverse().join('/')}</td><td>${DAYS_AR[new Date(s.day + 'T00:00:00Z').getUTCDay()]}</td><td>${esc(stText(s, ST_TXT))}</td><td>${s.met.firstIn ? fmtTime(s.met.firstIn) : '—'}</td><td>${s.met.lastOut ? fmtTime(s.met.lastOut) : '—'}</td><td>${s.met.late || '—'}</td><td>${s.met.early || '—'}</td><td>${fmtDur(s.met.net * 60000)}</td><td>${s.met.otEq ? s.met.otEq.toFixed(1) : '—'}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="7">إجماليات الفترة</td><td>${fmtDur(net * 60000)}</td><td>${ote.toFixed(1)}</td></tr></tfoot></table>
      <div class="sig"><span>توقيع الموظف: ....................</span><span>اعتماد الإدارة: ....................</span></div></section>`;
    }).join('<div class="pb"></div>')}</body></html>`;
    let pf = document.getElementById('__printFrame');
    if (pf) pf.remove();
    pf = document.createElement('iframe');
    pf.id = '__printFrame';
    pf.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(pf);
    const docPf = pf.contentWindow.document;
    docPf.open(); docPf.write(html); docPf.close();
    setTimeout(() => { try { pf.contentWindow.focus(); pf.contentWindow.print(); } catch {} }, 400);
  }

/* --- طباعة قسيمة راتب (Payslip) لموظف أو لجميع الموظفين --- */
  function printPayslips(targetEmpId = '', src = null) {
    const rows = (src ? runPayRows(src.rows) : payrollRows())
      .filter(r => r.pm !== 'none' && (!targetEmpId || r.empId === targetEmpId));
    if (!rows.length) return toast('لا توجد بيانات راتب لطباعتها', 'err');
    const from = src ? src.from : S.from, to = src ? src.to : S.to;
    const m = v => (Math.round((+v || 0) * 100) / 100).toFixed(2);
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>قسيمة راتب — ${from} إلى ${to}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
    <style>body{font-family:"Cairo",Arial,sans-serif;margin:0;padding:20px;color:#0E2A20}
    .slip{border:2px solid #0E6B4D;border-radius:16px;padding:18px;margin-bottom:20px;page-break-inside:avoid}
    .sh{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #D3E5DA;padding-bottom:10px;margin-bottom:12px}
    .sh h2{margin:0;font-size:20px;color:#0E6B4D}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{border:1px solid #D3E5DA;padding:6px 10px;text-align:right}
    th{background:#F2F8F4;color:#0A5139}
    .net{margin-top:12px;background:#D3EBDD;padding:10px 14px;border-radius:10px;display:flex;justify-content:space-between;font-weight:900;font-size:16px}
    .sig{display:flex;justify-content:space-between;margin-top:18px;font-size:13px;color:#587265}
    @page{size:A4;margin:12mm}</style></head><body>
    ${rows.map(r => `<div class="slip">
      <div class="sh"><div><h2>${esc(brandName())} — قسيمة راتب</h2><small>الفترة: ${fmtDate(dayStart(from))} إلى ${fmtDate(dayStart(to))}${src && src.status && src.status !== 'draft' ? ' · نسخة معتمدة' : ''}</small></div><div><b>${esc(r.name)}</b><br><small>${esc(r.jobTitle || '')}${r.dept ? ' · ' + esc(r.dept) : ''}</small></div></div>
      <div class="grid">
        <div><table><thead><tr><th colspan="2">الاستحقاقات</th></tr></thead><tbody>
          <tr><td>الراتب الأساسي للفترة</td><td>${m(r.base)}</td></tr>
          <tr><td>العمل الإضافي (${(+r.otEq || 0).toFixed(1)} س.م)</td><td>${m(r.otPay)}</td></tr>
          <tr><td>العلاوات والمكافآت</td><td>${m(r.allowBonus)}</td></tr>
          <tr><th>إجمالي الاستحقاق</th><th>${m(r.base + r.otPay + (r.allowBonus || 0))}</th></tr>
        </tbody></table></div>
        <div><table><thead><tr><th colspan="2">الاستقطاعات</th></tr></thead><tbody>
          <tr><td>تأخير وانصراف مبكر</td><td>${m(r.dedLate + r.dedEarly)}</td></tr>
          <tr><td>غياب / نسيان بصمة</td><td>${m(r.dedAbs + (r.dedForgot || 0))}</td></tr>
          <tr><td>ضمان وتضامن وضرائب</td><td>${m(r.statDed)}</td></tr>
          <tr><td>قسط سلفة / جزاءات</td><td>${m((r.dedLoan || 0) + (r.dedPen || 0))}</td></tr>
          <tr><th>إجمالي الاستقطاعات</th><th>${m(r.dedLate + r.dedEarly + r.dedAbs + (r.dedForgot || 0) + (r.statDed || 0) + (r.dedLoan || 0) + (r.dedPen || 0))}</th></tr>
        </tbody></table></div>
      </div>
      <div class="net"><span>صافي الراتب المستحق للصرف:</span><span>${m(r.net)} د.ل ${r.iban ? `(${esc(r.bankName)} — ${esc(r.iban)})` : ''}</span></div>
      <div class="sig"><span>توقيع المستلم: ........................</span><span>اعتماد الإدارة المالية: ........................</span></div>
    </div>`).join('')}
    </body></html>`;
    let pf = document.getElementById('__printFrame'); if (pf) pf.remove();
    pf = document.createElement('iframe'); pf.id = '__printFrame'; pf.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(pf); pf.contentWindow.document.open(); pf.contentWindow.document.write(html); pf.contentWindow.document.close();
    setTimeout(() => { try { pf.contentWindow.focus(); pf.contentWindow.print(); } catch {} }, 400);
  }

  /* --- طباعة إفادة عمل / شهادة تعريف بالراتب (A4) --- */
  async function printCertificate(emp) {
    if (!emp) return;
    const _ch = await mqChoice('اختر نوع الإفادة المطلوب طباعتها:', ['إفادة عمل بدون راتب', 'شهادة تعريف بالراتب']);
    if (_ch < 0) return;
    const withSalary = _ch === 1;
    const startTxt = emp.startDate ? fmtDate(dayStart(emp.startDate)) : fmtDate(new Date());
    const totalSal = (+emp.payAmount || 0) + (+emp.allowance || 0);
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إفادة عمل — ${esc(emp.name)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
    <style>body{font-family:"Cairo",Arial,sans-serif;padding:40px;color:#0E2A20;line-height:2.1}
    .box{border:3px double #0E6B4D;padding:36px;border-radius:18px;min-height:85vh;display:flex;flex-direction:column;justify-content:space-between}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #0E6B4D;padding-bottom:16px;margin-bottom:32px}
    h1{margin:0;font-size:26px;color:#0E6B4D}
    h2{text-align:center;font-size:24px;margin:20px 0 30px;text-decoration:underline}
    p{font-size:17px;text-align:justify}
    .sig{display:flex;justify-content:space-between;margin-top:60px;font-weight:700}
    @page{size:A4;margin:15mm}</style></head><body>
    <div class="box"><div>
      <header><div><h1>${esc(brandName())}</h1><div>إدارة الموارد البشرية والشؤون الإدارية</div></div><div>التاريخ: ${fmtDate(new Date())}<br>الرقم الإشاري: ............</div></header>
      <h2>${withSalary ? 'شهادة تعريف بالراتب' : 'إفـــادة عمـــل'}</h2>
      <p>إلى من يهمه الأمر، بعد التحية،</p>
      <p>تشهد إدارة <b>${esc(brandName())}</b> بأن السيد/ة <b>${esc(emp.name)}</b>${emp.nationalId ? ` (حامل الرقم الوطني/الهوية: <b>${esc(emp.nationalId)}</b>)` : ''} يعمل لدينا بوظيفة <b>${esc(emp.jobTitle || 'موظف')}</b>${emp.dept ? ` في قسم/فرع <b>${esc(emp.dept)}</b>` : ''}، وذلك منذ تاريخ <b>${startTxt}</b> وحتى تاريخه، وهو على رأس عمله.</p>
      ${withSalary && totalSal > 0 ? `<p>ويتقاضى المعني أجراً شهرياً إجمالياً قدره <b>(${totalSal.toFixed(2)} د.ل)</b> شاملاً الراتب الأساسي والعلاوات الثابتة${emp.bankName ? `، ويُحوَّل راتبه إلى <b>${esc(emp.bankName)}</b>${emp.iban ? ` (حساب رقم: <span dir="ltr">${esc(emp.iban)}</span>)` : ''}` : ''}.</p>` : ''}
      <p>أُعطيت له هذه الإفادة بناءً على طلبه لتقديمها إلى الجهات ذات العلاقة دون أدنى مسؤولية مالية أو قانونية على المنشأة تجاه الغير.</p>
      <p style="text-align:center;margin-top:30px">والسلام عليكم ورحمة الله وبركاته</p>
    </div>
    <div class="sig"><div>الموارد البشرية<br><br>........................</div><div>الختم والتوقيع المعتمد<br><br>........................</div></div></div>
    </body></html>`;
    let pf = document.getElementById('__printFrame'); if (pf) pf.remove();
    pf = document.createElement('iframe'); pf.id = '__printFrame'; pf.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(pf); pf.contentWindow.document.open(); pf.contentWindow.document.write(html); pf.contentWindow.document.close();
    setTimeout(() => { try { pf.contentWindow.focus(); pf.contentWindow.print(); } catch {} }, 400);
  }

  /* --- طباعة محضر استلام عهدة أو إخلاء طرف (A4) --- */
  async function printAssetDoc(emp) {
    if (!emp) return;
    const _ch = await mqChoice('نوع المستند المطلوب طباعته:', ['شهادة إخلاء طرف واسترداد العهدة', 'محضر استلام عهدة على الموظف']);
    if (_ch < 0) return;
    const isClearance = _ch === 0;
    const items = (emp.assets || '').split(/[،,\n-]/).map(s => s.trim()).filter(Boolean);
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${isClearance ? 'محضر استلام عهدة' : 'إخلاء طرف'} — ${esc(emp.name)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
    <style>body{font-family:"Cairo",Arial,sans-serif;padding:36px;color:#0E2A20;line-height:2}
    .box{border:2px solid #0E6B4D;padding:30px;border-radius:16px}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #0E6B4D;padding-bottom:12px;margin-bottom:24px}
    h1{margin:0;font-size:22px;color:#0E6B4D} h2{text-align:center;font-size:21px;margin:16px 0 24px;text-decoration:underline}
    table{width:100%;border-collapse:collapse;margin:16px 0} th,td{border:1px solid #9CC4AF;padding:8px 12px;text-align:right} th{background:#D3EBDD}
    .sig{display:flex;justify-content:space-between;margin-top:50px;font-weight:700}
    @page{size:A4;margin:14mm}</style></head><body>
    <div class="box">
      <header><div><h1>${esc(brandName())}</h1><div>إدارة الشؤون الإدارية والأصول</div></div><div>التاريخ: ${fmtDate(new Date())}</div></header>
      <h2>${isClearance ? 'محضر تسليم واستلام عهدة عينية' : 'إقرار إخلاء طرف وتسليم عهدة'}</h2>
      <p>الموظف: <b>${esc(emp.name)}</b> · الوظيفة: <b>${esc(emp.jobTitle || '—')}</b> · القسم: <b>${esc(emp.dept || '—')}</b> · الهوية: <b>${esc(emp.nationalId || '—')}</b></p>
      <table><thead><tr><th>#</th><th>بيان الأصل / العهدة والتفاصيل</th><th>الحالة</th></tr></thead><tbody>
        ${(items.length ? items : ['(اكتب بيان العهدة هنا)']).map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x)}</td><td>${isClearance ? 'بحالة جيدة وصالحة للعمل' : 'تم الاسترداد بالكامل'}</td></tr>`).join('')}
      </tbody></table>
      <p>${isClearance
        ? 'أقر أنا الموقع أدناه بأنني استلمت العهدة الموضحة أعلاه بحالة جيدة لاستخدامها في أغراض العمل، وأتعهد بالمحافظة عليها وإعادتها عند الطلب أو عند انتهاء خدمتي.'
        : 'تشهد الإدارة بأن الموظف المذكور أعلاه قد سلّم كافة العهد والأصول المسجلة بعهدته بحالة سليمة، وأخلي طرفه منها اعتباراً من تاريخه.'}</p>
      <div class="sig"><div>توقيع الموظف<br><br>........................</div><div>أمين المخازن / الأصول<br><br>........................</div><div>اعتماد الإدارة<br><br>........................</div></div>
    </div></body></html>`;
    let pf = document.getElementById('__printFrame'); if (pf) pf.remove();
    pf = document.createElement('iframe'); pf.id = '__printFrame'; pf.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(pf); pf.contentWindow.document.open(); pf.contentWindow.document.write(html); pf.contentWindow.document.close();
    setTimeout(() => { try { pf.contentWindow.focus(); pf.contentWindow.print(); } catch {} }, 400);
  }

  function annualUsed(empId, year) {
    const c = empCtx(empId);
    return S.leaves.filter(l => l.empId === empId && leaveDeducts(l)).reduce((a, l) => a + countLeaveDays(l.from, l.to, c.sc, c.rot, S.holKeys, year), 0);
  }

