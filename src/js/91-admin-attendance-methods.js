  /* =====================================================================
     لوحة الإدارة: شاشة عرض QR المتغيّر + استيراد سجلات أجهزة البصمة (كل الماركات)
     ===================================================================== */
  /* شاشة عرض QR: تولّد رمزاً عشوائياً كل 30 ثانية وتكتبه في locQr/{موقع} = {cur, prev, at(وقت الخادم)}.
     قاعدة Firestore تقارن رمز الموظف بـ cur أو prev نصاً بنص، فلا تعتمد على ساعة أي جهاز ولا على دوال تجزئة. */
  async function showQrBoard(loc) {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.style.cssText = 'align-items:center;justify-content:center;background:#fff;z-index:200';
    ov.innerHTML = `<div style="width:min(92vw,78vh);text-align:center;color:#111">
      <button class="ib dark" id="qbX" aria-label="إغلاق" style="position:fixed;top:14px;left:14px">${ic('x', 20)}</button>
      <h2 style="margin:0 0 4px">${esc(brandName())}</h2>
      <div style="font-size:18px;font-weight:700;margin-bottom:10px">${esc(loc.name)} — امسح الرمز بتطبيق الحضور</div>
      <div id="qbImg" style="width:100%;aspect-ratio:1/1;background:#fff;display:flex;align-items:center;justify-content:center">جارٍ التحميل…</div>
      <div style="height:8px;background:#e5e7eb;border-radius:8px;margin:12px 0 6px;overflow:hidden"><div id="qbBar" style="height:100%;background:#0E6B4D;width:100%"></div></div>
      <div id="qbTxt" style="font-size:13px;color:#555">يتجدد الرمز كل 30 ثانية — أبقِ هذه الشاشة مفتوحة ومتصلة بالإنترنت، ولا تلتقط له صورة لإرسالها</div></div>`;
    document.body.appendChild(ov);
    const qref = doc(db, 'locQr', loc.id);
    const newTok = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    let cur = '', prev = '', startedAt = 0, alive = true, wl = null, busy = false, fails = 0;
    try { wl = await navigator.wakeLock?.request('screen'); } catch {}
    const txt = (t, bad) => { const el = ov.querySelector('#qbTxt'); if (el) { el.textContent = t; el.style.color = bad ? '#b42318' : '#555'; el.style.fontWeight = bad ? '700' : '400'; } };
    const close = () => { alive = false; clearInterval(iv); try { wl && wl.release(); } catch {} ov.remove(); };
    ov.querySelector('#qbX').onclick = close;
    const rotate = async () => {
      const next = newTok();
      await _setDoc(qref, { cur: next, prev: cur, at: serverTimestamp() });   // كتابة ناجحة أولاً، ثم نعرض الرمز الجديد
      prev = cur; cur = next; startedAt = Date.now();
      const svg = await qrSvg(qrPayload(loc.id, cur));
      const box = ov.querySelector('#qbImg'); if (!box) return;
      box.innerHTML = svg; const sv = box.querySelector('svg'); if (sv) sv.style.cssText = 'width:100%;height:100%';
    };
    const tick = async () => {
      if (!alive || busy) return; busy = true;
      try {
        if (!cur || Date.now() - startedAt >= QR_WIN_MS) { await rotate(); fails = 0; txt('يتجدد الرمز كل 30 ثانية — أبقِ هذه الشاشة مفتوحة ومتصلة بالإنترنت، ولا تلتقط له صورة لإرسالها'); }
        const bar = ov.querySelector('#qbBar'); if (bar) bar.style.width = Math.max(0, 100 - (Date.now() - startedAt) / QR_WIN_MS * 100) + '%';
      } catch (e) {
        fails++; logErr('qr-rotate', e);
        if (e && e.code === 'permission-denied') { txt('رُفضت كتابة الرمز: انشر قواعد Firestore الأخيرة (قسم locQr) وتأكد أنك مدخل كمدير عام أو موارد بشرية.', true); }
        else txt('تعذّر تحديث الرمز (' + fails + ') — تحقق من اتصال الإنترنت. الرمز الظاهر قد لا يعمل.', true);
      }
      busy = false;
    };
    const iv = setInterval(tick, 1000); tick();
  }

  /* ---------- استيراد ملفات أجهزة البصمة ---------- */
  function openDeviceImport() {
    const byId = new Map();
    S.emps.forEach(e => { if (e.bioId) byId.set(devIdKey(e.bioId), e); });
    if (!byId.size) return toast('اربط أرقام الموظفين في جهاز البصمة أولاً (تعديل بيانات الموظف ثم «رقم الموظف في جهاز البصمة»)', 'err');
    const ov = document.createElement('div'); ov.className = 'ov'; document.body.appendChild(ov);
    let rows = [], cfg = null, res = null;
    const close = () => ov.remove();
    const colOpt = (sel, withNone, noneTxt) => {
      const n = Math.max(0, ...rows.slice(0, 50).map(r => r.length));
      return (withNone ? `<option value="-1" ${sel < 0 ? 'selected' : ''}>${noneTxt}</option>` : '') + Array.from({ length: n }, (_, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>عمود ${i + 1} — ${esc(String((rows[cfg.header ? 1 : 0] || [])[i] ?? '').slice(0, 22))}</option>`).join('');
    };
    const compute = () => { res = devParse(rows, byId, TZOFF, cfg); };
    const draw = () => {
      const head = `<div class="mh"><h3>${ic('download', 22)} استيراد سجلات جهاز البصمة</h3><button class="ib dark" data-x="1" aria-label="إغلاق">${ic('x', 18)}</button></div>`;
      if (!rows.length) {
        ov.innerHTML = `<div class="modal" style="max-width:560px" role="dialog">${head}<div class="mb">
          <p class="hint" style="margin-top:0">يعمل مع أي جهاز بصمة أو وجه أو كرت يصدّر سجلاته: <b>ZKTeco</b> (ATTLOG.dat / Excel)، <b>Hikvision</b>، <b>Suprema BioStar</b>، <b>Anviz</b>، <b>Virdi</b>، <b>Dahua</b>، <b>Realand</b>، <b>iClock</b>، وأي ملف <b>Excel / CSV / TXT</b>. يُكتشف شكل الملف تلقائياً ويمكنك تعديل الأعمدة قبل الاستيراد.</p>
          <p class="hint">الربط بالموظفين عبر «رقم الموظف في جهاز البصمة». إعادة استيراد نفس الملف لا تكرّر السجلات.</p>
          <input type="file" id="devFile" accept=".dat,.txt,.csv,.tsv,.log,.xls,.xlsx,.xlsm,.xlsb,.ods" style="width:100%"></div></div>`;
        const inp = ov.querySelector('#devFile');
        inp.onchange = async () => { const f = inp.files[0]; if (f) await readFile(f); };
      } else {
        const dtMode = cfg.dtCol >= 0;
        const unm = [...res.unmatched.entries()].sort((a, b) => b[1] - a[1]);
        const empN = new Set(res.recs.map(r => r.emp.id)).size;
        ov.innerHTML = `<div class="modal" style="max-width:640px" role="dialog">${head}<div class="mb">
          <div class="g2">
            <div class="field"><label>عمود رقم الموظف</label><select data-c="idCol">${colOpt(cfg.idCol, true, '— غير محدد —')}</select></div>
            ${dtMode || (cfg.dateCol < 0 && cfg.timeCol < 0)
              ? `<div class="field"><label>عمود التاريخ والوقت</label><select data-c="dtCol">${colOpt(cfg.dtCol, true, '— غير محدد —')}</select></div>`
              : `<div class="field"><label>عمود التاريخ</label><select data-c="dateCol">${colOpt(cfg.dateCol, true, '— غير محدد —')}</select></div><div class="field"><label>عمود الوقت</label><select data-c="timeCol">${colOpt(cfg.timeCol, true, '— غير محدد —')}</select></div>`}
            <div class="field"><label>عمود الحالة (حضور/انصراف)</label><select data-c="stCol">${colOpt(cfg.stCol, true, 'بدون — بالتناوب حضور ثم انصراف')}</select></div>
            <div class="field"><label>ترتيب التاريخ</label><select data-c="order"><option value="dmy" ${cfg.order === 'dmy' ? 'selected' : ''}>يوم/شهر/سنة</option><option value="mdy" ${cfg.order === 'mdy' ? 'selected' : ''}>شهر/يوم/سنة</option></select></div>
            <div class="field" style="grid-column:1/-1"><label class="chk"><input type="checkbox" data-c="header" ${cfg.header ? 'checked' : ''}> الصف الأول عناوين أعمدة (يُتجاهل)</label></div>
          </div>
          <div class="notice" style="margin-top:10px"><b>${res.recs.length}</b> حركة تخص <b>${empN}</b> موظفاً${res.recs.length ? ` (من ${fmtDate(new Date(res.recs[0].ms))} إلى ${fmtDate(new Date(Math.max(...res.recs.map(r => r.ms))))})` : ''}
            <br><span class="muted" style="font-size:12.5px">صفوف غير مفهومة: ${res.bad} من ${res.total}</span>
            ${unm.length ? `<br><span class="muted" style="font-size:12.5px">أرقام غير مرتبطة بموظف (${unm.length}): ${esc(unm.slice(0, 12).map(([k, n]) => `${k} (${n})`).join('، '))}${unm.length > 12 ? ' …' : ''}</span>` : ''}</div>
          <div class="tw" style="max-height:170px;overflow:auto;margin-top:8px"><table class="rt"><tbody>${rows.slice(0, 5).map(r => `<tr>${r.slice(0, 7).map(c => `<td dir="ltr" style="font-size:12px">${esc(String(c).slice(0, 24))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        </div><div class="mf" style="justify-content:space-between"><button class="btn" data-go="1" ${res.recs.length ? '' : 'disabled'}>${ic('check', 18)} استيراد ${res.recs.length} حركة</button><button class="btn sec" data-x="1">إلغاء</button></div></div>`;
        ov.querySelectorAll('[data-c]').forEach(el => el.onchange = () => {
          const k = el.dataset.c;
          if (k === 'header') cfg.header = el.checked; else if (k === 'order') cfg.order = el.value; else cfg[k] = +el.value;
          compute(); draw();
        });
        const go = ov.querySelector('[data-go]'); if (go) go.onclick = importNow;
      }
      ov.querySelectorAll('[data-x]').forEach(b => b.onclick = close);
    };
    async function readFile(f) {
      try {
        if (/\.(xls|xlsx|xlsm|xlsb|ods)$/i.test(f.name)) {
          const XLSX = await loadXlsx();
          const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
          rows = wb.SheetNames.flatMap(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, dateNF: 'yyyy-mm-dd hh:mm:ss', defval: '' }))
            .map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(c => c));
        } else {
          const buf = new Uint8Array(await f.arrayBuffer());
          const u16 = (buf[0] === 0xFF && buf[1] === 0xFE) || (buf[0] === 0xFE && buf[1] === 0xFF);   // بعض الأجهزة تصدّر UTF-16
          rows = devRowsFromText(new TextDecoder(u16 ? 'utf-16' : 'utf-8').decode(buf));
        }
        if (!rows.length) return toast('الملف فارغ أو بصيغة غير مدعومة', 'err');
        cfg = devDetect(rows); compute();
        if (cfg.idCol < 0 || (cfg.dtCol < 0 && (cfg.dateCol < 0 || cfg.timeCol < 0))) toast('تعذر اكتشاف الأعمدة تلقائياً — اخترها يدوياً', 'warn');
        draw();
      } catch (e) { console.error(e); rows = []; toast('تعذر قراءة الملف', 'err'); draw(); }
    }
    async function importNow() {
      const recs = res.recs; if (!recs.length) return;
      const btn = ov.querySelector('[data-go]'); if (btn) btn.disabled = true;
      try {
        for (let i = 0; i < recs.length; i += 350) {
          const b = writeBatch(db);
          recs.slice(i, i + 350).forEach(r => {
            b.set(doc(db, 'employees', r.emp.id, 'records', 'bio_' + r.ms), { type: r.type, time: Timestamp.fromMillis(r.ms), lat: 0, lng: 0, accuracy: 0, distance: 0, locationId: 'biometric', locationName: 'جهاز البصمة', empName: r.emp.name, deviceId: 'device-import' });
          });
          await b.commit();
        }
        const months = [...new Set(recs.map(r => dayKey(new Date(r.ms)).slice(0, 7)))];
        await Promise.all(months.map(m => invalidateMonthSummary(m)));
        await RecCache.clear(); await refresh('emps', 'recs');
        close(); toast(`تم استيراد ${recs.length} بصمة بنجاح ✅`, 'good');
      } catch (e) { console.error(e); toast('فشل الاستيراد: ' + ((e && e.code) || 'خطأ'), 'err'); if (btn) btn.disabled = false; }
    }
    draw();
  }
