/* خدمة «مِيقَاتْ» للعمل دون اتصال (PWA)
   ملاحظة: عند أي تعديل مستقبلي على index.html ارفع VER لإصدار جديد (مثل meqat-v2) لتحديث النسخة المخزّنة لدى الموظفين. */
const VER = 'meqat-v1';
const CORE = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await Promise.allSettled(CORE.map(u => fetch(u).then(r => { if (r && r.ok) return c.put(new Request(u), r.clone()); })));
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
  if (h.endsWith('googleapis.com') || h.endsWith('firebaseio.com') || h.endsWith('firebasestorage.app') || h.endsWith('cloudfunctions.net')) return;

  // صفحة التطبيق: شبكة أولاً مع الاحتفاظ بنسخة دون اتصال
  if (req.mode === 'navigate' || h === location.hostname) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') { const c = await caches.open(VER); c.put(new Request('./index.html'), res.clone()); }
        return res;
      } catch {
        const c = await caches.open(VER);
        const hit = (await c.match('./index.html')) || (await c.match('./'));
        return hit || new Response('تعذر الوصول للنظام — تحقق من الاتصال.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // الموارد الثابتة (خطوط Tajawal + مكتبات CDN للخريطة وExcel): ذاكرة أولاً
  const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'jsdelivr.net', 'unpkg.com', 'sheetjs.com'];
  if (CDN.some(d => h === d || h.endsWith('.' + d))) {
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
