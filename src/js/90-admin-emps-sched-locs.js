  /* --- 2. تبويب الموظفون والمشرفون (منظم بتبويبات فرعية وقائمة منسدلة) --- */
  function viewEmps(el) {
    const sname = id => { const x = S.scheds.find(s => s.id === id); return x ? x.name : ''; };
    const q = S.qEmp.trim().toLowerCase();
    const list = q ? S.emps.filter(e => (e.name || '').toLowerCase().includes(q) || (e.dept || '').toLowerCase().includes(q)) : S.emps;

    if (!isSuper() && S.empSub === 'admins') S.empSub = 'list';
    if (!(isSuper() || isAud()) && S.empSub === 'audit') S.empSub = 'list';
    if (S.empSub === 'audit' && S.auditLogs === undefined) {
      S.auditLogs = null;
      loadAuditLogs().then(() => { if ($('#content') && S.tab === 'emps' && S.empSub === 'audit') viewEmps($('#content')); });
    }
    el.innerHTML = `
      <div class="subtabs">
        <button class="stab ${S.empSub === 'list' ? 'on' : ''}" data-esub="list">${ic('users', 20)} قائمة الموظفين (${S.emps.length})</button>
        ${isSuper() ? `<button class="stab ${S.empSub === 'admins' ? 'on' : ''}" data-esub="admins">${ic('lock', 20)} المشرفون والصلاحيات (${S.admins.length})</button>` : ''}
        ${(isSuper() || isAud()) ? `<button class="stab ${S.empSub === 'audit' ? 'on' : ''}" data-esub="audit">${ic('report', 20)} سجل التدقيق الرقابي${Array.isArray(S.auditLogs) ? ' (' + S.auditLogs.length + ')' : ''}</button>` : ''}
      </div>
      ${S.empSub === 'list' ? `
        <details class="fold">
          <summary><div class="ch-l">${ic('plus', 24)} <span>إضافة موظف جديد وإنشاء رابط خاص</span></div><span class="badge b-pri when-closed">فتح النموذج</span><span class="badge b-pri when-open">إخفاء النموذج</span></summary>
          <div class="row">
            <div class="field"><label>اسم الموظف</label><input id="eName" placeholder="الاسم الثلاثي"></div>
            <div class="field"><label>رقم واتساب (بالصيغة الدولية، دون +)</label><input id="ePhone" dir="ltr" placeholder="2189XXXXXXXX"></div>
            <div class="field"><label>نوع التوظيف</label><select id="eType"><option value="staff">موظف دوام</option><option value="task">موظف مهام (عمل حر)</option></select></div>
            <div class="field"><label>جدول الدوام</label><select id="eSched"><option value="">— بدون جدول —</option>${S.scheds.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
            <button class="btn" data-act="addEmp">${ic('plus', 18)} إضافة الموظف</button>
          </div>
        </details>
        <div class="card">
          ${ch('users', `سجل الموظفين (${list.length})`, `<div class="search-box"><span class="s-ic">${ic('search', 18)}</span><input id="qEmpInp" placeholder="بحث بالاسم أو القسم…" value="${esc(S.qEmp)}"></div>`)}
          <div class="elist">
 ${list.map(e => `<div class="erow">
 <span class="av">${ini(e.name)}</span>
 <div class="er-n"><b>${esc(e.name)}</b>${e.empType === 'task' ? '<span class="badge b-pri">موظف مهام</span>' : ''}</div>
 <div class="er-b">${e.dept ? `<span class="badge b-warn">${esc(e.dept)}</span>` : ''}${e.empType === 'task' ? '<span class="badge b-mute">حسب المهام</span>' : sname(e.scheduleId) ? `<span class="badge b-pri">${esc(sname(e.scheduleId))}</span>` : '<span class="badge b-mute">دوام غير محدد</span>'}</div>
 <div class="er-b">${e.active ? '<span class="badge b-ok">مفعّل</span>' : '<span class="badge b-bad">موقوف</span>'}${(() => { const n = e.devices ? Object.keys(e.devices).length : (e.deviceId ? 1 : 0); return (n ? `<span class="badge b-ok">الأجهزة: ${n}/${e.maxDevices || 2}</span>` : '<span class="badge b-mute">جهاز جديد</span>') + (e.lastJoinAt && e.lastJoinAt.toMillis && Date.now() - e.lastJoinAt.toMillis() < 72 * 3600e3 ? '<span class="badge b-warn">أُضيف جهاز حديثًا</span>' : ''); })()}</div>
 <div class="er-a">
 <button class="btn sm sec" data-act="editEmp" data-id="${e.id}">${ic('edit', 16)} تعديل</button>
 <button class="btn sm" data-act="copy" data-id="${e.id}">${ic('link', 16)} نسخ الرابط</button>
 <button class="btn sm ok" data-act="wa" data-id="${e.id}">${ic('send', 16)} واتساب</button>
 <details class="act-menu"><summary>المزيد</summary><div class="act-drop">
 <button data-act="certEmp" data-id="${e.id}">${ic('print', 18)} إفادة عمل / تعريف راتب</button>
 <button data-act="assetDoc" data-id="${e.id}">${ic('print', 18)} محضر عهدة / إخلاء طرف</button>
 <button data-act="devPin" data-id="${e.id}">${ic('device', 18)} الأجهزة والرمز</button>
 <button data-act="resetDev" data-id="${e.id}">${ic('device', 18)} إعادة ضبط الأجهزة</button>
 <button data-act="toggle" data-id="${e.id}">${ic('power', 18)} ${e.active ? 'إيقاف الموظف' : 'تفعيل الموظف'}</button>
 ${!e.active ? `<button class="bad-txt" data-act="hardDelEmp" data-id="${e.id}">${ic('trash', 18)} حذف نهائي</button>` : ''}
 </div></details>
 </div></div>`).join('') || '<div class="empty">لا يوجد موظفون</div>'}
 </div>
          <p class="muted" style="font-size:13px;margin:14px 0 0">يرتبط الرابط تلقائياً بأول جهاز يفتحه، ويمكن للموظف إضافة حتى 3 أجهزة أو متصفحات بإدخال «رمز الأجهزة» (من قائمة «المزيد»). وإن غيّر هاتفه أو بلغ الحد فاختر «إعادة ضبط الأجهزة».</p>
        </div>`
      : S.empSub === 'admins' ? `
<div class="card">
          ${ch('lock', `المشرفون والأدوار والصلاحيات (${S.admins.length})`)}
          <p class="hint" style="margin-top:0">الأدوار مفروضة في قواعد Firestore: المدير العام يدير الصلاحيات؛ الموارد البشرية تدير بيانات الدوام؛ محاسب الرواتب مخوّل للقراءة المالية واعتماد السلف والمهام؛ مدير القسم للقراءة ضمن قسم مطابق تمامًا؛ والمدقق للقراءة فقط. يمكنك بضغطة واحدة نقل وعزل الرواتب والبيانات المصرفية لجميع الموظفين إلى الخزينة المالية المحمية (<code>empFinance</code>) بحيث لا يطّلع عليها سوى المدير العام ومحاسب الرواتب.</p>
          <div style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn sm sec" data-act="isolateFinAll">${ic('lock', 16)} عزل وترحيل البيانات المالية لجميع الموظفين إلى الخزينة المحمية (empFinance)</button>
            <span class="badge b-ok">المعزولون مالياً: ${S.emps.filter(e => e.finIsolated).length} / ${S.emps.length}</span>
          </div>
          <div class="row" style="margin-bottom:16px">
            <div class="field"><label>اسم المشرف</label><input id="aName" placeholder="مسؤول الموارد البشرية"></div>
            <div class="field"><label>البريد الإلكتروني</label><input id="aUid" type="email" dir="ltr" placeholder="hr@example.com"></div>
            <div class="field"><label>الدور الوظيفي</label><select id="aRole">
              <option value="super_admin">مدير عام (كامل الصلاحيات)</option>
              <option value="hr_admin">مسؤول موارد بشرية (HR)</option>
              <option value="payroll_admin">محاسب رواتب ومالية</option>
              <option value="manager">مدير قسم / فرع</option>
              <option value="auditor">مدقق (اطلاع وتقارير فقط)</option>
            </select></div>
            <div class="field"><label>تقييد بقسم/فرع (اختياري)</label><input id="aDept" placeholder="اتركه فارغاً لكل الأقسام"></div>
            <div class="field" style="max-width:200px"><label>كلمة المرور (لحساب جديد)</label><input id="aPw" type="password" dir="ltr" placeholder="6 أحرف على الأقل" autocomplete="new-password"></div>
            <button class="btn" data-act="addAdmin">${ic('plus', 18)} إضافة مشرف</button>
          </div>
          <div class="elist">
 ${S.admins.map(a => {
   const RL = { super_admin: 'مدير عام', hr_admin: 'موارد بشرية HR', payroll_admin: 'محاسب رواتب', manager: 'مدير قسم/فرع', auditor: 'مدقق (قراءة فقط)' };
   return `<div class="erow er-adm"><span class="av">${ini(a.name)}</span><div class="er-n"><b>${esc(a.name)}</b><small class="mail">${esc(a.email || a.id)}</small></div><div class="er-b"><span class="badge b-pri">${RL[a.role] || 'مدير عام'}</span>${a.deptScope ? `<span class="badge b-warn">قسم: ${esc(a.deptScope)}</span>` : ''}</div><div class="er-a"><button class="btn sm bad" data-act="delAdmin" data-id="${esc(a.id)}">${ic('trash', 16)} إزالة</button></div></div>`;
 }).join('') || `<div class="empty">${S.adminsErr ? 'تعذّرت قراءة قائمة المشرفين، فانشر القواعد الجديدة' : 'لا يوجد مشرفون إضافيون، وأنت المالك الوحيد'}</div>`}
 </div>
        </div>`
      : S.empSub === 'audit' ? (() => {
        const logs = Array.isArray(S.auditLogs) ? S.auditLogs : [];
        const qa = (S.qAudit || '').trim().toLowerCase();
        const flt = qa ? logs.filter(x => (x.target || '').toLowerCase().includes(qa) || (x.detail || '').toLowerCase().includes(qa) || ((x.by && x.by.name) || '').toLowerCase().includes(qa)) : logs;
        return `<div class="card">
          ${ch('report', 'سجل التدقيق الرقابي غير القابل للتعديل أو الحذف', `<div class="acts"><div class="search-box"><span class="s-ic">${ic('search', 18)}</span><input id="qAudInp" placeholder="بحث بالموظف أو المشرف أو العملية…" value="${esc(S.qAudit || '')}"></div><button class="btn sm sec" data-act="auditCsv">${ic('download', 16)} تصدير CSV</button><button class="btn sm sec" data-act="reloadAudit">${ic('refresh', 16)} تحديث</button></div>`)}
          <p class="hint" style="margin-top:0">تُفرض حماية هذا السجل في قواعد Firestore (إضافة فقط <code>create-only</code>، ولا يقبل التعديل أو الحذف حتى للمدير العام). يُحمَّل عند فتح هذا التبويب فقط لتوفير القراءات.</p>
          ${S.auditLogs === null ? '<p class="muted center" style="padding:18px 0">جاري تحميل سجل التدقيق…</p>'
            : S.auditErr ? '<p class="muted center" style="padding:18px 0">تعذّر تحميل سجل التدقيق — تأكد من نشر قواعد Firestore المحدّثة.</p>'
            : `<div class="tw"><table class="rt"><thead><tr><th>التاريخ والوقت</th><th>العملية</th><th>الهدف / المعني</th><th>التفاصيل</th><th>المشرف المنفّذ</th></tr></thead><tbody>
              ${flt.map(x => {
                const d = x.at && x.at.toDate ? x.at.toDate() : null;
                const lb = AUDIT_LABELS[x.action] || ['b-mute', x.action || 'إجراء'];
                return `<tr><td>${d ? `${fmtDate(d)} ${fmtTime(d, true)}` : '—'}</td><td><span class="badge ${lb[0]}">${esc(lb[1])}</span></td><td><b>${esc(x.target || '—')}</b></td><td>${esc(x.detail || '—')}</td><td><small class="muted" dir="ltr">${esc((x.by && x.by.name) || '—')}</small></td></tr>`;
              }).join('') || '<tr><td colspan="5" class="muted center">لا توجد قيود مطابقة في سجل التدقيق بعد</td></tr>'}
            </tbody></table></div>`}
        </div>`;
      })() : ''
      }`;
    const inp = $('#qEmpInp');
    if (inp) inp.oninput = e => { S.qEmp = e.target.value; viewEmps(el); $('#qEmpInp').focus(); $('#qEmpInp').setSelectionRange(S.qEmp.length, S.qEmp.length); };
    const ainp = $('#qAudInp');
    if (ainp) ainp.oninput = e => { S.qAudit = e.target.value; viewEmps(el); $('#qAudInp').focus(); $('#qAudInp').setSelectionRange(S.qAudit.length, S.qAudit.length); };
  }

  /* --- 3. تبويب الدوام + الإجازات والعطلات + إعدادات المنشأة (منظم بـ 3 تبويبات فرعية) --- */
  const TZ_OPTS = [[-180, 'UTC−3'], [-120, 'UTC−2'], [-60, 'UTC−1'], [0, 'UTC+0'], [60, 'UTC+1'], [120, 'UTC+2 — طرابلس (الافتراضي)'], [180, 'UTC+3'], [210, 'UTC+3:30'], [240, 'UTC+4'], [300, 'UTC+5'], [360, 'UTC+6'], [420, 'UTC+7'], [480, 'UTC+8']];
  function viewSched(el) {
    const cnt = id => S.emps.filter(e => e.scheduleId === id).length;
    el.innerHTML = `
      <div class="subtabs">
        <button class="stab ${S.schedSub === 'sched' ? 'on' : ''}" data-ssub="sched">${ic('sched', 20)} جداول الدوام (${S.scheds.length})</button>
        <button class="stab ${S.schedSub === 'leaves' ? 'on' : ''}" data-ssub="leaves">${ic('sun', 20)} أنواع الإجازات والعطلات الرسمية</button>
        <button class="stab ${S.schedSub === 'settings' ? 'on' : ''}" data-ssub="settings">${ic('device', 20)} إعدادات المنشأة</button>
      </div>
      ${S.schedSub === 'sched' ? `
        <div class="card">
          ${ch('sched', 'جداول الدوام والورديات', `<button class="btn" data-act="newSched">${ic('plus', 18)} إنشاء جدول جديد</button>`)}
          <p class="hint" style="margin-top:0">أنشئ جدولاً لكل نمط دوام في منشأتك (إدارة، ورديات، ساعات مرنة…) ثم اربط كل موظف بجدوله من تبويب «الموظفون».</p>
          ${S.scheds.length ? `<div class="sch-grid">${S.scheds.map(x => `<div class="sch">
            <div>
              <h4>${esc(x.name)} <span class="badge b-pri">${MODES[x.mode] || ''}</span> <span class="badge b-mute">${cnt(x.id)} موظف</span></h4>
              <p>${esc(schedSummary(x))}</p>
            </div>
            <div class="acts">
              <button class="btn sm sec" data-act="editSched" data-id="${x.id}">${ic('edit', 16)} تعديل</button>
              <button class="btn sm sec" data-act="dupSched" data-id="${x.id}">${ic('copy', 16)} نسخ</button>
              <button class="btn sm bad" data-act="delSched" data-id="${x.id}">${ic('trash', 16)} حذف</button>
            </div>
          </div>`).join('')}</div>` : `<div class="center muted" style="padding:24px 0">لا توجد جداول بعد. اضغط «إنشاء جدول جديد» للبدء.</div>`}
        </div>
        <div class="card">
          ${ch('refresh', 'الاستثناءات المؤقتة وتبديل الورديات والمواسم (رمضان / تغطية شفتات)')}
          <p class="hint" style="margin-top:0">طبّق جدول دوام بديلاً لفترة محددة (لموظف بعينه، أو لقسم كامل، أو للمنشأة كلها في شهر رمضان) <b>دون تعديل جدول الموظف الأساسي ودون المساس بحسابات الأيام السابقة</b>. تُحفظ ضمن كاش الإعدادات وتستهلك <b>صفر قراءات إضافية</b>.</p>
          <div class="row" style="margin-bottom:14px">
            <div class="field"><label>نطاق التطبيق</label><select id="ovTarget">
              <option value="*">كافة موظفي الدوام (جدول موسمي / رمضان)</option>
              ${[...new Set(S.emps.map(e => e.dept).filter(Boolean))].map(d => `<option value="dept:${esc(d)}">قسم: ${esc(d)}</option>`).join('')}
              ${S.emps.filter(e => e.active && e.empType !== 'task').map(e => `<option value="emp:${esc(e.id)}">موظف: ${esc(e.name)}</option>`).join('')}
            </select></div>
            <div class="field"><label>الجدول البديل خلال الفترة</label><select id="ovSched">${S.scheds.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></div>
            <div class="field" style="max-width:165px"><label>من تاريخ</label><input type="date" id="ovFrom" value="${dayKey(new Date())}"></div>
            <div class="field" style="max-width:165px"><label>إلى تاريخ</label><input type="date" id="ovTo" value="${addDays(dayKey(new Date()), 6)}"></div>
            <div class="field" style="max-width:130px"><label>موضع الدورة</label><input type="number" id="ovRot" min="1" value="1"></div>
            <div class="field"><label>السبب / المناسبة</label><input id="ovNote" placeholder="مثال: دوام شهر رمضان / تغطية مسائية"></div>
            <button class="btn" data-act="addSchedOv">${ic('plus', 18)} إضافة استثناء</button>
          </div>
          ${(() => {
            const ovs = (S.set && Array.isArray(S.set.schedOverrides)) ? S.set.schedOverrides : [];
            if (!ovs.length) return '<p class="muted center" style="margin:0;padding:10px 0">لا توجد استثناءات دوام مؤقتة حالياً.</p>';
            const sname = id => (S.scheds.find(s => s.id === id) || {}).name || 'جدول محذوف';
            const tname = o => o.empId === '*' ? '<span class="badge b-pri">كل المنشأة</span>' : o.dept ? `<span class="badge b-warn">قسم: ${esc(o.dept)}</span>` : `<b>${esc((S.emps.find(e => e.id === o.empId) || {}).name || o.empId)}</b>`;
            return `<div class="tw"><table class="rt"><thead><tr><th>النطاق</th><th>الجدول البديل</th><th>الفترة</th><th>المناسبة</th><th></th></tr></thead><tbody>
              ${ovs.map(o => `<tr><td data-l="النطاق">${tname(o)}</td><td data-l="الجدول البديل"><span class="badge b-ok">${esc(sname(o.scheduleId))}</span></td><td data-l="الفترة">${fmtDate(dayStart(o.from))} ← ${fmtDate(dayStart(o.to))}</td><td data-l="المناسبة">${esc(o.note || '—')}</td><td data-l=""><button class="btn sm bad" data-act="delSchedOv" data-id="${esc(o.id)}">${ic('trash', 15)} حذف</button></td></tr>`).join('')}
            </tbody></table></div>`;
          })()}
        </div>`
      : S.schedSub === 'leaves' ? `
        <div class="card">
          ${ch('sun', 'أنواع الإجازات ونسب الدفع', `<button class="btn sec" data-act="ltEdit">${ic('edit', 18)} تعديل الأنواع</button>`)}
          <p class="hint" style="margin-top:0">لكل نوع نسبة دفع من الأجر (100% بمرتب كامل، 0% بدون مرتب، أو نسبة جزئية)، وهل يُخصم من الرصيد السنوي، وحد سنوي اختياري.</p>
          <div class="tw"><table class="rt"><thead><tr><th>النوع</th><th>نسبة الدفع</th><th>يُخصم من الرصيد</th><th>الحد السنوي</th></tr></thead><tbody>${leaveTypesOf(S.set).map(x => `<tr><td data-l="النوع"><b>${esc(x.name)}</b></td><td data-l="نسبة الدفع"><span class="badge ${+x.pct >= 100 ? 'b-ok' : +x.pct <= 0 ? 'b-bad' : 'b-warn'}">${+x.pct}%</span></td><td data-l="يُخصم من الرصيد">${x.deduct ? 'نعم' : 'لا'}</td><td data-l="الحد السنوي">${+x.cap > 0 ? x.cap + ' يوم' : 'بلا حد'}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="card">
          ${ch('today', 'العطلات الرسمية')}
          <p class="hint" style="margin-top:0">لا يُحتسب الغياب في هذه الأيام ولا تُحسب من أيام الإجازات، وساعات العمل فيها تُحتسب إضافية بمعامل العطلة الرسمية.</p>
          <div class="row" style="margin-bottom:14px">
            <div class="field" style="max-width:200px"><label>التاريخ</label><input type="date" id="hDay"></div>
            <div class="field"><label>اسم العطلة</label><input id="hName" placeholder="عيد الفطر المبارك"></div>
            <button class="btn" data-act="addHol">${ic('plus', 18)} إضافة عطلة</button>
          </div>
          <div class="tw"><table class="rt"><thead><tr><th>التاريخ</th><th>الاسم</th><th>اليوم</th><th></th></tr></thead><tbody>
          ${S.hols.map(h => `<tr><td data-l="التاريخ"><b>${fmtDate(dayStart(h.date))}</b></td><td data-l="الاسم">${esc(h.name)}</td><td data-l="اليوم" class="muted">${DAYS_AR[new Date(h.date + 'T00:00:00Z').getUTCDay()]}</td><td data-l=""><button class="btn sm bad" data-act="delHol" data-id="${h.id}">${ic('trash', 16)} حذف</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted center">لا توجد عطلات مسجلة</td></tr>'}
          </tbody></table></div>
        </div>`
      : `
        <div class="card">
          ${ch('device', 'إعدادات المنشأة والتوقيت')}
          <div class="row">
            <div class="field" style="max-width:320px"><label>اسم المنشأة (يظهر مكان «مِيقَاتْ» في اللوحة)</label><input id="sOrg" value="${esc((S.set && S.set.orgName) || '')}" placeholder="شركة النور"></div>
            <div class="field" style="max-width:260px"><label>المنطقة الزمنية للتقارير</label><select id="sTz">${TZ_OPTS.map(([v, l]) => `<option value="${v}" ${(S.set && +S.set.tzOffset || TZ_OFFSET_MIN) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field" style="max-width:300px"><label>عند نسيان الموظف تسجيل الانصراف</label><select id="sForgot" ${isSuper() ? '' : 'disabled title="تعديل هذا الخيار للمدير العام فقط"'}>${[[0, 'بلا خصم تلقائي (تنبيه فقط)'], [0.25, 'خصم ربع يوم'], [0.5, 'خصم نصف يوم'], [1, 'خصم يوم كامل']].map(([v, l]) => `<option value="${v}" ${forgotDed() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field" style="grid-column:1/-1;flex:1 1 100%"><label>تعميم / إشعار إداري يظهر أعلى شاشة كل موظف (اتركه فارغاً لإخفائه)</label><input id="sNotice" value="${esc((S.set && S.set.empNotice) || '')}" placeholder="مثال: تذكير: غداً عطلة رسمية بمناسبة..."></div>
            <button class="btn" data-act="saveSet">${ic('check', 18)} حفظ الإعدادات</button>
          </div>
          <p class="muted" style="font-size:13px;margin:12px 0 0">المنطقة الزمنية تثبّت أسماء الأيام والحدود اليومية في كل التقارير على جهاز أي مدير مهما كانت ساعة جهازه.<br>سياسة «نسيان الانصراف» تُطبَّق على الراتب الشهري (من الراتب اليومي) وعلى الأجر بالساعة (من ساعات اليوم المجدولة). ويظهر للإدارة تنبيه في «اليوم» وعلى تبويب التقارير إلى أن تُصحَّح البصمة، وعند التصحيح يُلغى الخصم تلقائياً.</p>
        </div>
        <div class="card">
          ${ch('download', 'النسخ الاحتياطي واستعادة قاعدة البيانات (مجاناً)')}
          <p class="hint" style="margin-top:0">نزّل نسخة احتياطية كاملة (JSON) تشمل جميع الموظفين، جداول الدوام، المواقع، العطل، والإعدادات للاحتفاظ بها على جهازك، أو استعدها في أي وقت.</p>
          <div class="acts">
            <button class="btn sec" data-act="backupDB">${ic('download', 18)} تنزيل نسخة احتياطية كاملة (JSON)</button>
            <button class="btn sec" data-act="restoreDB">${ic('refresh', 18)} استعادة من ملف نسخة احتياطية</button>
            <input type="file" id="restoreInp" accept=".json" style="display:none">
          </div>
        </div>
        ${isSuper() ? `<div class="card">
          ${ch('report', 'تجميد ملخصات الأشهر المغلقة وأرشفة البصمات القديمة (حماية الخطة المجانية)')}
          <p class="hint" style="margin-top:0"><b>تجميد ملخص الشهر:</b> يدمج آلاف بصمات الشهر المنتهي في وثيقة واحدة مضغوطة وموقّعة ببصمة <code>SHA-256</code> داخل Firestore، فتُقرأ تقارير ورواتب ذلك الشهر من أي جهاز بـ <b>قراءة واحدة فقط (1 Read)</b> بدل آلاف القراءات.<br><b>أرشفة وتفريغ المساحة:</b> يحفظ الملخص المجمّع (لتبقى التقارير والرواتب تعمل داخل النظام)، وينزّل ملف أرشيف كامل للبصمات الخام على جهازك، ثم يحذف وثائق البصمات الفردية القديمة لتفريغ مساحة التخزين المجانية (1 GiB).</p>
          <div class="row" style="align-items:flex-end">
            <div class="field" style="max-width:220px"><label>اختر الشهر المنتهي</label><input type="month" id="archMonth" dir="ltr" max="${(() => { const d = new Date(); d.setUTCDate(1); d.setUTCHours(-12); return dayKey(d).slice(0, 7); })()}" value="${(() => { const d = new Date(); d.setUTCDate(1); d.setUTCHours(-12); return dayKey(d).slice(0, 7); })()}"></div>
            <div class="acts">
              <button class="btn sm" data-act="sealMonth">${ic('check', 16)} تجميد ملخص الشهر (قراءة واحدة)</button>
              <button class="btn sm sec" data-act="archivePurgeMonth">${ic('download', 16)} تصدير أرشيف الشهر وتفريغ البصمات الخام</button>
              <button class="btn sm sec" data-act="restoreArchiveMonth">${ic('refresh', 16)} استعادة بصمات شهر من أرشيف</button>
              <input type="file" id="archRestoreInp" accept=".json" style="display:none">
            </div>
          </div>
        </div>` : ''}`
      }`;
  }

  /* --- محرر أنواع الإجازات --- */
  function leaveTypesEditor() {
    const W = { types: JSON.parse(JSON.stringify(leaveTypesOf(S.set))) };
    openModal({
      title: 'أنواع الإجازات', saveText: 'حفظ الأنواع',
      body: () => `<p class="hint" style="margin-top:0">نسبة الدفع: 100 = بمرتب كامل، 0 = بدون مرتب، وأي نسبة بينهما = جزء من الأجر. الحد السنوي 0 = بلا حد.</p>` + W.types.map((x, i) => `<div class="srow"><input class="nm" data-k="types.${i}.name" value="${esc(x.name)}" placeholder="اسم النوع"><label class="chk">دفع % <input class="num" type="number" min="0" max="100" step="1" data-k="types.${i}.pct" value="${x.pct ?? 100}"></label><label class="chk"><input type="checkbox" data-k="types.${i}.deduct" ${x.deduct ? 'checked' : ''}> يُخصم من الرصيد</label><label class="chk">حد سنوي <input class="num" type="number" min="0" step="1" data-k="types.${i}.cap" value="${x.cap ?? 0}"></label><button type="button" class="chip" data-a="rmLT" data-i="${i}">${ic('trash', 15)}</button></div>`).join('') + `<div class="sc"><button type="button" class="chip" data-a="addLT">${ic('plus', 15)} إضافة نوع</button></div>`,
      onField: (k, v) => setPath(W, k, v),
      onAct: (a, d) => { if (a === 'addLT') W.types.push({ id: 'lt' + Math.random().toString(36).slice(2, 8), name: '', pct: 100, deduct: false, cap: 0 }); if (a === 'rmLT') W.types.splice(+d.i, 1); },
      onSave: async () => {
        const bad = m => { toast(m, 'err'); return false; };
        if (!W.types.length) return bad('أبقِ نوعاً واحداً على الأقل');
        const names = new Set(), out = [];
        for (const x of W.types) {
          const name = String(x.name || '').trim(); if (!name) return bad('اكتب اسم كل نوع');
          if (names.has(name)) return bad(`الاسم «${name}» مكرر`); names.add(name);
          out.push({ id: x.id, name, pct: Math.min(100, Math.max(0, +x.pct || 0)), deduct: !!x.deduct, cap: Math.max(0, Math.round(+x.cap || 0)) });
        }
        await setDoc(doc(db, 'settings', 'general'), { leaveTypes: out, updatedAt: serverTimestamp() }, { merge: true });
        await refresh('set'); toast('حُفظت أنواع الإجازات', 'good');
      }
    });
  }

  /* --- 4. تبويب المهام --- */
  function viewTasks(el) {
    const nm = id => (S.emps.find(e => e.id === id) || {}).name || 'موظف محذوف';
    const ap = S.reqs.filter(r => r.kind === 'task' && r.status === 'approved' && r.from >= S.from && r.from <= S.to && (!S.emp || r.empId === S.emp)).sort((a, b) => b.from.localeCompare(a.from));
    const by = new Map(); ap.forEach(r => { const g = by.get(r.empId) || { qty: 0, amt: 0, n: 0 }; g.qty += +(r.qtyApproved ?? r.qty) || 0; g.amt += +r.amount || 0; g.n++; by.set(r.empId, g); });
    const m = v => (Math.round(v * 100) / 100).toString();
    const workers = S.emps.filter(e => e.empType === 'task');
    el.innerHTML = `<div class="card">${ch('task', 'كتالوج المهام وأسعار الوحدات')}<p class="hint" style="margin-top:0">أنواع المهام وسعر الوحدة. يختار موظف المهام النوع من رابطه ويُرسل العدد المنفّذ، وتعتمده من تبويب «الطلبات».</p>
      <div class="row" style="margin-bottom:14px"><div class="field"><label>اسم المهمة</label><input id="tkName" placeholder="تصميم شعار"></div><div class="field" style="max-width:180px"><label>سعر الوحدة</label><input id="tkPrice" type="number" min="0" step="0.01"></div><button class="btn" data-act="addTask">${ic('plus', 18)} إضافة</button></div>
      <div class="tw"><table><thead><tr><th>المهمة</th><th>السعر الافتراضي</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${S.taskTypes.map(x => `<tr><td><b>${esc(x.name)}</b></td><td><span class="badge b-pri">${m(+x.price || 0)}</span></td><td>${x.active === false ? '<span class="badge b-mute">موقوفة</span>' : '<span class="badge b-ok">مفعّلة</span>'}</td><td><div class="acts"><button class="btn sm sec" data-act="editTask" data-id="${esc(x.id)}">${ic('edit', 16)} تعديل</button> <button class="btn sm sec" data-act="toggleTask" data-id="${esc(x.id)}">${ic('power', 16)} ${x.active === false ? 'تفعيل' : 'إيقاف'}</button> <button class="btn sm bad" data-act="delTask" data-id="${esc(x.id)}">${ic('trash', 16)} حذف</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="muted center">لا توجد أنواع مهام بعد</td></tr>'}
      </tbody></table></div></div>
    <div class="card">${ch('payroll', `ملخص المهام المعتمدة (من ${fmtDate(dayStart(S.from))} إلى ${fmtDate(dayStart(S.to))})`)}<p class="hint" style="margin-top:0">الفترة والموظف من «التقارير». يوجد حالياً (${workers.length}) موظف مهام مسجّل.</p>
      <div class="tw"><table><thead><tr><th>الموظف</th><th>عدد الطلبات</th><th>إجمالي الوحدات</th><th>إجمالي المبلغ</th></tr></thead><tbody>
      ${[...by.entries()].map(([id, g]) => `<tr><td><div class="who"><span class="av">${ini(nm(id))}</span>${esc(nm(id))}</div></td><td>${g.n}</td><td>${m(g.qty)}</td><td><b class="badge b-ok">${m(g.amt)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted center">لا توجد مهام معتمدة في الفترة</td></tr>'}
      </tbody></table></div>
      <div class="tw" style="margin-top:14px"><table><thead><tr><th>التاريخ</th><th>الموظف</th><th>المهمة</th><th>الكمية</th><th>سعر الوحدة</th><th>المبلغ</th></tr></thead><tbody>
      ${ap.map(r => `<tr><td>${fmtDate(dayStart(r.from))}</td><td>${esc(nm(r.empId))}</td><td>${esc(r.taskName || '')}</td><td>${+(r.qtyApproved ?? r.qty) || 0}</td><td>${m(+r.unitPrice || 0)}</td><td><b>${m(+r.amount || 0)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="muted center">—</td></tr>'}
      </tbody></table></div></div>`;
  }

  /* --- 5. تبويب المواقع --- */
  function viewLocs(el) {
    el.innerHTML = `<div class="card">${ch('pin', 'إضافة موقع عمل جغرافي (GPS)', `<button class="btn sec" data-act="mapLoc">${ic('map', 18)} تحديد عبر الخريطة التفاعلية</button>`)}<div class="row">
      <div class="field"><label>اسم الموقع / الفرع</label><input id="lName" placeholder="المقر الرئيسي"></div>
      <div class="field"><label>الإحداثيات (خط العرض, خط الطول)</label><input id="lCoord" dir="ltr" placeholder="32.8872, 13.1913"></div>
      <div class="field" style="max-width:160px"><label>النطاق المسموح (متر)</label><input id="lRad" type="number" value="100" min="10"></div>
      <button class="btn sec" data-act="myLoc">${ic('target', 18)} موقعي الحالي</button>
      <button class="btn" data-act="addLoc">${ic('plus', 18)} إضافة الموقع</button></div>
      <p class="muted" style="font-size:13px;margin:12px 0 0">يمكنك نسخ الإحداثيات من خرائط Google أو الضغط على «تحديد عبر الخريطة التفاعلية» لاختيار النقطة بصرياً.</p></div>
    <div class="card">${ch('map', `المواقع المعتمدة (${S.locs.length})`)}<div class="tw"><table class="rt"><thead><tr><th>اسم الموقع</th><th>الإحداثيات</th><th>نطاق القبول</th><th>إجراءات</th></tr></thead><tbody>
    ${S.locs.map(l => `<tr><td data-l="اسم الموقع"><b>${esc(l.name)}</b></td><td data-l="الإحداثيات"><span dir="ltr">${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}</span></td><td data-l="نطاق القبول"><span class="badge b-pri">${l.radius} متر</span></td><td data-l=""><div class="acts"><a class="btn sm sec" style="text-decoration:none" href="${mapLink(l.lat, l.lng)}" target="_blank">${ic('map', 16)} Google Maps</a> <button class="btn sm sec" data-act="editLoc" data-id="${l.id}">${ic('edit', 16)} تعديل</button> <button class="btn sm bad" data-act="delLoc" data-id="${l.id}">${ic('trash', 16)} حذف</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="muted center">لم تُضف مواقع بعد، وبدونها لن يستطيع أي موظف تسجيل البصمة</td></tr>'}
    </tbody></table></div></div>`;
  }

  let _L = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (_L) return _L;
    _L = new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
      s.onload = () => res(window.L); s.onerror = () => { _L = null; rej(new Error('leaflet-load')); };
      document.head.appendChild(s);
    });
    return _L;
  }

  function locEditor(ex) {
    const W = ex ? { id: ex.id, name: ex.name || '', lat: +ex.lat, lng: +ex.lng, radius: +ex.radius || 100 } : { id: null, name: '', lat: 32.8872, lng: 13.1913, radius: 100 };
    let map = null, marker = null, circle = null;
    const syncMap = () => {
      if (!map || !window.L) return;
      const c = [W.lat, W.lng];
      if (marker) marker.setLatLng(c);
      else { marker = window.L.marker(c, { draggable: true }).addTo(map); marker.on('dragend', () => { const p = marker.getLatLng(); W.lat = p.lat; W.lng = p.lng; syncMap(); }); }
      if (circle) circle.setLatLng(c).setRadius(W.radius);
      else circle = window.L.circle(c, { radius: W.radius, color: '#0E6B4D', fillOpacity: 0.15 }).addTo(map);
      map.setView(c, Math.max(map.getZoom(), 15), { animate: false });
      const t = $('#coordTxt'); if (t) t.textContent = `${W.lat.toFixed(5)}, ${W.lng.toFixed(5)}`;
    };
    const initMap = box => {
      loadLeaflet().then(() => {
        if (!box.isConnected) return;
        box._ready = true;
        map = window.L.map(box, { scrollWheelZoom: true }).setView([W.lat, W.lng], 15);
        window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        map.on('click', ev => { W.lat = ev.latlng.lat; W.lng = ev.latlng.lng; syncMap(); });
        syncMap();
      }).catch(() => { box._busy = false; toast('تعذر تحميل الخريطة — تحقق من الاتصال ثم أعد المحاولة', 'err'); });
    };
    let mo = null;
    const obs = new MutationObserver(() => {
      if (!document.querySelector('.ov')) { obs.disconnect(); return; }
      const box = document.getElementById('mapBox');
      if (box && !box._ready && !box._busy) { box._busy = true; initMap(box); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const body = () => `
      <div class="g2"><div class="field"><label>اسم الموقع</label><input data-k="name" value="${esc(W.name)}"></div>
      <div class="field"><label>النطاق (متر)</label><input class="num" type="number" min="10" data-k="radius" data-redraw value="${W.radius}"></div></div>
      <p class="hint">اضغط على الخريطة لوضع النقطة أو اسحب العلامة. الدائرة الزرقاء هي النطاق المسموح للموظف حول الموقع.</p>
      <div id="mapBox" style="height:320px;border-radius:16px;border:1px solid var(--line);background:var(--surface)"></div>
      <div class="sc"><button type="button" class="chip" data-a="myLoc">${ic('target', 16)} موقعي الحالي</button><span class="muted" dir="ltr" id="coordTxt">${W.lat ? W.lat.toFixed(5) + ', ' + W.lng.toFixed(5) : ''}</span></div>`;
    mo = openModal({
      title: ex ? 'تعديل الموقع (خريطة تفاعلية)' : 'موقع جديد (خريطة تفاعلية)', saveText: 'حفظ الموقع', body,
      onField: (k, v) => { if (k === 'radius') W.radius = Math.max(10, +v || 100); else W[k] = v; },
      onAct: async a => {
        if (a === 'myLoc') {
          toast('جاري تحديد موقعك…');
          try {
            const p = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, timeout: 20000 }));
            W.lat = p.coords.latitude; W.lng = p.coords.longitude;
            toast('تم تعيين نقطة موقعك على الخريطة', 'good');
          } catch { toast('تعذر تحديد موقعك', 'err'); }
          if (mo) mo.draw();
        }
      },
      onSave: async () => {
        const bad = m => { toast(m, 'err'); return false; };
        if (!(W.name || '').trim()) return bad('اكتب اسم الموقع');
        if (typeof W.lat !== 'number' || typeof W.lng !== 'number' || isNaN(W.lat) || isNaN(W.lng)) return bad('حدد نقطة على الخريطة');
        if (!(W.radius >= 10)) return bad('النطاق 10 أمتار على الأقل');
        obs.disconnect();
        if (ex) await updateDoc(doc(db, 'locations', ex.id), { name: W.name.trim(), lat: W.lat, lng: W.lng, radius: Math.round(W.radius), ...geoK(W.lat) });
        else await addDoc(collection(db, 'locations'), { name: W.name.trim(), lat: W.lat, lng: W.lng, radius: Math.round(W.radius), active: true, ...geoK(W.lat) });
        await refresh('locs'); toast('تم حفظ الموقع', 'good');
      }
    });
  }

