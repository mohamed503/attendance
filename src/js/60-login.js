function loginPage(auth) {
  if (licExpired()) { root.innerHTML = licGateHtml(); return; }
  root.innerHTML = `<div class="auth-bg">
    <div style="position:fixed;top:18px;left:18px;z-index:10">${themeBtnHtml()}</div>
    <div class="login">
      <div class="logo big">${ic('lock', 46)}</div>
      <h1 class="center">${BRAND}</h1>
      <p class="muted center" style="margin:0 0 22px;font-weight:600">نظام الحضور والانصراف · دخول الإدارة</p>
      <div class="field"><label>البريد الإلكتروني</label><input id="em" type="email" dir="ltr" autocomplete="username" placeholder="admin@example.com"></div>
      <div class="field" style="margin-top:14px"><label>كلمة المرور</label><input id="pw" type="password" dir="ltr" autocomplete="current-password" placeholder="••••••••"></div>
      <button class="btn" id="go" style="width:100%;margin-top:20px;padding:13px">${ic('login', 22)} دخول لوحة التحكم</button>
      <button class="btn sec" onclick="window.__openDownloadBox()" style="width:100%;margin-top:10px;padding:11px">${ic('download', 20)} تحميل ملفات النظام المحدّثة</button>
      ${LICENSE && LICENSE.status === 'demo' && LICENSE.demoCreds ? `<button class="btn ok" id="demoGo" style="width:100%;margin-top:10px;padding:11px">الدخول إلى نسخة العرض بضغطة واحدة</button>` : ''}
    </div>
  </div>`;
  const go = async () => {
    try { await signInWithEmailAndPassword(auth, $('#em').value.trim(), $('#pw').value); }
    catch { toast('بيانات الدخول غير صحيحة', 'err'); }
  };
  $('#go').onclick = go;
  $('#pw').onkeydown = e => { if (e.key === 'Enter') go(); };
  const dg = $('#demoGo');
  if (dg) dg.onclick = async () => { try { await signInWithEmailAndPassword(auth, LICENSE.demoCreds.email, LICENSE.demoCreds.pass); } catch { toast('تعذّر الدخول إلى نسخة العرض', 'err'); } };
}

/* =====================================================================
   لوحة الإدارة المنظمة (بدون زحمة وبأقسام فرعية وبحث فوري)
   ===================================================================== */
