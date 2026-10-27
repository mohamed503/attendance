/* ميقات — تنبيهات Telegram (مجانية)
   1) telegramWebhook : يستقبل /start <كود> من Telegram ويربط حساب المدير.
   2) notifyRequest   : عند إنشاء طلب (إجازة/تصحيح/مهمة) يُرسل تنبيهاً للمدير.
   3) tgOutboxSend    : رسالة تجريبية (أو أي نص) يضعه المدير في tgOutbox من لوحة الإدارة.
   4) dailySummary    : ملخص يومي بالحضور في الساعة التي يحددها المدير.
   المفاتيح السرية (Secrets) لا تظهر في المتصفح ولا في الملفات. */
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const HOOK = defineSecret('TELEGRAM_WEBHOOK_SECRET');
const DEFAULT_TZ_MIN = 120; // طرابلس UTC+2 — يُستبدل بـ settings/general.tzOffset إن وُجد

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN.value()}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.json().catch(() => ({ ok: false }));
}

const getCfg = async () => (await db.doc('tgConfig/main').get()).data() || {};

/** يرسل نصاً لكل حسابات المدير المرتبطة، ويحذف الحسابات التي حظرت البوت. */
async function sendToAdmins(chats, text) {
  const dead = [];
  await Promise.all((chats || []).map(async c => {
    try {
      const r = await tg('sendMessage', { chat_id: c, text, parse_mode: 'HTML', disable_web_page_preview: true });
      if (!r.ok && (r.error_code === 403 || /chat not found/i.test(r.description || ''))) dead.push(String(c));
      else if (!r.ok) console.error('telegram error', r.error_code, r.description);
    } catch (e) { console.error(e); }
  }));
  if (dead.length) await db.doc('tgConfig/main').set({ adminChats: FieldValue.arrayRemove(...dead) }, { merge: true });
}

/* ---------- 1) الويب هوك: ربط الحساب ---------- */
exports.telegramWebhook = onRequest({ secrets: [TOKEN, HOOK] }, async (req, res) => {
  if (req.get('X-Telegram-Bot-Api-Secret-Token') !== HOOK.value()) return res.status(403).send('forbidden');
  try {
    const m = req.body && req.body.message;
    if (m && m.text && m.chat && m.chat.type === 'private') {
      const chatId = String(m.chat.id);
      const text = m.text.trim();
      const start = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{8,64}))?$/);
      const reply = t => tg('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML' });
      if (start) {
        const code = start[1];
        if (!code) {
          await reply('أهلاً بك في تنبيهات <b>ميقات</b>.\nلربط حسابك افتح «لوحة الإدارة ← الدوام والإعدادات ← تنبيهات Telegram» واضغط «إنشاء رابط الربط».');
        } else {
          const ref = db.collection('telegramLinks').doc(code);
          const snap = await ref.get();
          const ok = snap.exists && snap.data().expiresAt && snap.data().expiresAt.toMillis() > Date.now();
          if (!ok) {
            await reply('رابط الربط غير صالح أو انتهت مدته (30 دقيقة). أنشئ رابطاً جديداً من لوحة الإدارة.');
          } else {
            await db.doc('tgConfig/main').set({ adminChats: FieldValue.arrayUnion(chatId) }, { merge: true });
            await ref.delete();
            await reply('✅ تم ربط حسابك. ستصلك هنا تنبيهات الطلبات والملخص اليومي.\nلإيقافها أرسل /stop');
          }
        }
      } else if (/^\/stop(@\w+)?$/.test(text)) {
        await db.doc('tgConfig/main').set({ adminChats: FieldValue.arrayRemove(chatId) }, { merge: true });
        await reply('تم إيقاف التنبيهات لهذا الحساب.');
      }
    }
  } catch (e) { console.error(e); }
  res.status(200).send('ok');
});

/* ---------- 2) تنبيه الطلبات الجديدة ---------- */
function requestText(d) {
  const who = esc(d.empName || 'موظف');
  if (d.kind === 'leave') return `📝 <b>طلب إجازة جديد</b>\n${who}\n${esc(d.typeName || 'إجازة')} · من ${esc(d.from)} إلى ${esc(d.to)}${d.note ? `\nملاحظة: ${esc(d.note)}` : ''}`;
  if (d.kind === 'fix') return `🛠 <b>طلب تصحيح بصمة</b>\n${who}\nاليوم ${esc(d.from)}${d.fixIn ? ` · حضور ${esc(d.fixIn)}` : ''}${d.fixOut ? ` · انصراف ${esc(d.fixOut)}` : ''}${d.note ? `\nالسبب: ${esc(d.note)}` : ''}`;
  if (d.kind === 'task') return `📦 <b>مهمة بانتظار الاعتماد</b>\n${who}\n${esc(d.taskName || 'مهمة')} × ${esc(d.qty ?? 1)} · ${esc(d.from)}`;
  return `🔔 <b>طلب جديد</b>\n${who}`;
}
exports.notifyRequest = onDocumentCreated({ document: 'employees/{empId}/requests/{reqId}', secrets: [TOKEN] }, async ev => {
  const d = ev.data && ev.data.data();
  if (!d || d.status !== 'pending') return;
  const cfg = await getCfg();
  if (!cfg.enabled || cfg.notifyReq === false) return;
  await sendToAdmins(cfg.adminChats, requestText(d) + '\n\nافتح لوحة الإدارة › الطلبات للمراجعة.');
});

/* ---------- 3) رسالة تجريبية من لوحة الإدارة ---------- */
exports.tgOutboxSend = onDocumentCreated({ document: 'tgOutbox/{id}', secrets: [TOKEN] }, async ev => {
  const d = ev.data && ev.data.data();
  const cfg = await getCfg();
  if (d && d.text && (cfg.adminChats || []).length) await sendToAdmins(cfg.adminChats, esc(String(d.text).slice(0, 1000)));
  await ev.data.ref.delete().catch(() => {});
});

/* ---------- 4) الملخص اليومي ---------- */
/** دالة نقية (قابلة للاختبار): تبني نص الملخص من الموظفين والسجلات. */
function buildSummary({ staff, recs, key }) {
  const inIds = new Set(recs.filter(r => r.type === 'in').map(r => r.empId));
  const present = staff.filter(e => inIds.has(e.id));
  const open = staff.filter(e => e.state === 'in');
  const none = staff.filter(e => !inIds.has(e.id) && e.state !== 'in');
  const list = (a, n = 25) => a.slice(0, n).map(e => esc(e.name || e.id)).join('، ') + (a.length > n ? ` … و${a.length - n} آخرين` : '');
  const [y, m, d] = key.split('-');
  let t = `📊 <b>ملخص يوم ${d}/${m}/${y}</b>\n\n✅ سجّلوا حضوراً: <b>${present.length}</b> من ${staff.length}`;
  if (open.length) t += `\n🟡 لم يسجّلوا انصرافاً بعد: <b>${open.length}</b>\n${list(open)}`;
  if (none.length) t += `\n⚪ لم يسجّلوا حضوراً: <b>${none.length}</b>\n${list(none)}\n<i>(قد يشمل من هم في راحة أو إجازة أو عطلة)</i>`;
  return t;
}
if (process.env.MEQAT_TEST) exports._buildSummary = buildSummary;

exports.dailySummary = onSchedule({ schedule: '5 * * * *', timeZone: 'UTC', secrets: [TOKEN] }, async () => {
  const cfg = await getCfg();
  if (!cfg.enabled || cfg.summary === false || !(cfg.adminChats || []).length) return;
  const set = (await db.doc('settings/general').get()).data() || {};
  const tz = set.tzOffset != null && !isNaN(+set.tzOffset) ? +set.tzOffset : DEFAULT_TZ_MIN;
  const loc = new Date(Date.now() + tz * 60000);
  const key = loc.toISOString().slice(0, 10);
  const hour = cfg.summaryHour != null ? +cfg.summaryHour : 20;
  if (loc.getUTCHours() !== hour || cfg.lastSummaryDay === key) return;

  const emps = (await db.collection('employees').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const staff = emps.filter(e => e.active && e.empType !== 'task').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const start = new Date(Date.parse(key + 'T00:00:00Z') - tz * 60000), end = new Date(start.getTime() + 86400000);
  let recs = [];
  try {
    const s = await db.collectionGroup('records').where('time', '>=', start).where('time', '<', end).get();
    recs = s.docs.map(d => ({ empId: d.ref.parent.parent.id, type: d.get('type') }));
  } catch (e) { // الفهرس غير منشأ: نقرأ سجلات كل موظف على حدة
    console.warn('collectionGroup failed, per-employee fallback', e.code);
    const parts = await Promise.all(staff.map(e => db.collection(`employees/${e.id}/records`).where('time', '>=', start).where('time', '<', end).get()
      .then(s => s.docs.map(d => ({ empId: e.id, type: d.get('type') }))).catch(() => [])));
    recs = parts.flat();
  }
  await sendToAdmins(cfg.adminChats, buildSummary({ staff, recs, key }));
  await db.doc('tgConfig/main').set({ lastSummaryDay: key }, { merge: true });
});
