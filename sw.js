/* خدمة «مِيقَاتْ» للعمل دون اتصال (PWA)
   صفحة التطبيق (index.html) تُجلب من الشبكة أولاً فتتحدّث تلقائياً عند أي تعديل ولا تحتاج رفع VER.
   ارفع VER (مثل meqat-v4) فقط عند تغيير مكتبات CDN أو منطق هذا الملف، لتفريغ الذاكرة القديمة. */
const VER = 'meqat-v3';
const NAV_TIMEOUT = 4000; // مهلة انتظار الشبكة قبل الرجوع للنسخة المخزّنة (شبكات ضعيفة)
const CORE = ['./', './index.html'];
const OFFLINE_MSG = 'تعذر الوصول للنظام — تحقق من الاتصال.';
const offlineRes = () => new Response(OFFLINE_MSG, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await Promise.allSettled(CORE.map(u => fetch(u, { cache: 'no-store' }).then(r => { if (r && r.ok) return c.put(new Request(u), r.clone()); })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  const h = url.hostname;

  // بيانات Firebase الحية (مصادقة/قاعدة بيانات): شبكة دائماً بلا تخزين
  if ((h.endsWith('googleapis.com') && h !== 'fonts.googleapis.com') || h.endsWith('firebaseio.com') || h.endsWith('firebasestorage.app') || h.endsWith('cloudfunctions.net')) return;

  // صفحة التطبيق: شبكة أولاً (بمهلة) مع الاحتفاظ بنسخة دون اتصال.
  // الرد غير السليم (5xx/404) لا يحجب النسخة المخزّنة، ولا يُخزَّن.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(VER);
      const cached = (await c.match('./index.html')) || (await c.match('./'));
      const net = fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') { c.put(new Request('./index.html'), res.clone()); return res; }
        if (cached) throw new Error('bad-nav-response');
        return res;
      });
      if (!cached) return net.catch(offlineRes);
      net.catch(() => {}); // تجنّب الرفض غير المعالج إن خسر السباق
      let tid;
      const timeout = new Promise((_, rej) => { tid = setTimeout(rej, NAV_TIMEOUT); });
      return Promise.race([net, timeout]).catch(() => cached).finally(() => clearTimeout(tid));
    })());
    return;
  }

  // الموارد الثابتة: ذاكرة أولاً (خطوط Tajawal + مكتبات CDN للخريطة وExcel + مكتبات Firebase ذات الإصدارات الثابتة)
  const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'jsdelivr.net', 'unpkg.com', 'sheetjs.com'];
  const isFbLib = h === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (isFbLib || CDN.some(d => h === d || h.endsWith('.' + d))) {
    e.respondWith((async () => {
      const c = await caches.open(VER);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
  }
});
