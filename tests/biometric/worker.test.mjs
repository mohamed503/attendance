import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handle, normalizeEvent } from '../../workers/biometric-ingest/src/index.js';
import { parseTime, parseType, mapGeneric, parseBodyText, parseXml, userKey } from '../../workers/biometric-ingest/src/normalize.js';
import { parseAttlog } from '../../workers/biometric-ingest/src/adms.js';
import { _cache } from '../../workers/biometric-ingest/src/pipeline.js';
import { fakeStore } from './fake-store.mjs';

const sha = s => createHash('sha256').update(s).digest('hex');
const TOKEN = 'a'.repeat(40), NOW = Date.parse('2026-11-01T20:00:00Z');
const mk = () => fakeStore({
  devices: {
    gate: { protocol: 'meqat-json-v1', tokenHash: sha(TOKEN), tzOffset: 120, active: true, typeSource: 'device' },
    zk1: { protocol: 'zkteco-adms', sn: 'SN123', tzOffset: 120, active: true },
    hik: { protocol: 'generic', tokenHash: sha(TOKEN), tzOffset: 120, active: true, mapping: { recordsPath: 'AccessControllerEvent.events', idPath: 'employeeNoString', timePath: 'dateTime', typePath: '' } },
    off: { protocol: 'meqat-json-v1', tokenHash: sha(TOKEN), active: false }
  },
  employees: { E1: { name: 'أحمد', bioId: '101', active: true }, E2: { name: 'سالم', bioId: '7', active: true }, E3: { name: 'ليلى', bioId: '7', active: true } },
  maps: { 'gate__55': { employeeId: 'E2', status: 'active' }, 'zk1__9': { employeeId: 'E1', status: 'disabled' } }
});
const post = (path, body, headers = {}) => new Request('https://w.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const auth = { 'x-meqat-device': 'gate', authorization: 'Bearer ' + TOKEN };
const run = (req, store) => handle(req, {}, store, NOW);
const body = async r => r.json();

test('تطبيع الأوقات: إزاحة صريحة، وقت محلي بإزاحة الجهاز، 12 ساعة، epoch، أرقام عربية', () => {
  assert.equal(parseTime('2026-11-01T08:00:00+02:00'), Date.UTC(2026, 10, 1, 6));
  assert.equal(parseTime('2026-11-01 08:00:00', 120), Date.UTC(2026, 10, 1, 6));
  assert.equal(parseTime('01/11/2026 04:30 PM', 120), Date.UTC(2026, 10, 1, 14, 30));
  assert.equal(parseTime(1793520000), 1793520000000); assert.equal(parseTime(1793520000000), 1793520000000);
  assert.equal(parseTime('٢٠٢٦-١١-٠١ ٠٨:٠٠:٠٠', 120), Date.UTC(2026, 10, 1, 6));
  assert.equal(parseTime('garbage'), null); assert.equal(parseTime('2026-13-01 08:00:00'), null);
});
test('حالة الحركة: افتراضات الشركات وtypeMap مخصص وغير المعروف null', () => {
  assert.equal(parseType('0'), 'in'); assert.equal(parseType('1'), 'out'); assert.equal(parseType('CheckOut'), 'out'); assert.equal(parseType('face'), null);
  assert.equal(parseType('DOOR_OPEN', { door_open: 'in' }), 'in');
});
test('userKey يوحّد الأصفار البادئة والأرقام العربية', () => { assert.equal(userKey('0101'), '101'); assert.equal(userKey('١٠١'), '101'); assert.equal(userKey(' ABC '), 'abc'); });

test('health عام، وكل المسارات المحمية ترفض غير المصادق ولا تكتب', async () => {
  const st = mk();
  const h = await run(new Request('https://w.test/health'), st); assert.equal(h.status, 200); assert.ok((await body(h)).protocols.includes('zkteco-adms'));
  for (const hdr of [{}, { 'x-meqat-device': 'gate' }, { 'x-meqat-device': 'gate', authorization: 'Bearer wrong' }, { 'x-meqat-device': 'nope', authorization: 'Bearer ' + TOKEN }, { 'x-meqat-device': 'off', authorization: 'Bearer ' + TOKEN }]) {
    const r = await run(post('/v1/punch', { records: [{ employeeCode: '101', eventTime: '2026-11-01T08:00:00+02:00', eventType: 'in' }] }, hdr), st);
    assert.equal(r.status, 401);
  }
  assert.equal(st.records.size, 0);
});
test('Push JSON: الحفظ للموظف الصحيح عبر bioId، ثم التكرار لا يكتب', async () => {
  const st = mk(); _cache.emp.clear();
  const b = { records: [{ employeeCode: '101', eventTime: '2026-11-01T08:00:00+02:00', eventType: 'in' }, { employeeCode: '101', eventTime: '2026-11-01T16:00:00+02:00', eventType: 'out' }] };
  const r1 = await body(await run(post('/v1/punch', b, auth), st));
  assert.equal(r1.stored, 2);
  const rec = st.records.get('employees/E1/records/bio_' + Date.UTC(2026, 10, 1, 6));
  assert.equal(rec.type, 'in'); assert.equal(rec.empName, 'أحمد'); assert.equal(rec.deviceId, 'gate');
  const r2 = await body(await run(post('/v1/punch', b, auth), st)); assert.equal(r2.stored, 0); assert.equal(r2.duplicate, 2); assert.equal(st.records.size, 2);
  const r3 = await body(await run(post('/v1/punch', { records: [...b.records].reverse() }, auth), st)); assert.equal(r3.duplicate, 2);   // ترتيب معكوس
});
test('جدول الربط (جهاز+معرّف) يتقدم على bioId، ومعرّف bioId الملتبس لا يُسنَد تلقائياً', async () => {
  const st = mk(); _cache.emp.clear();
  const r = await body(await run(post('/v1/punch', { records: [{ employeeCode: '55', eventTime: '2026-11-01T08:00:00+02:00', eventType: 'in' }, { employeeCode: '7', eventTime: '2026-11-01T08:05:00+02:00', eventType: 'in' }] }, auth), st));
  assert.equal(r.stored, 1); assert.ok(st.records.has('employees/E2/records/bio_' + Date.UTC(2026, 10, 1, 6)));
  assert.equal(r.pending, 1); assert.equal(r.results[1].reason, 'ambiguous_bioId');
  assert.equal([...st.pending.values()][0].reason, 'ambiguous_bioId');
});
test('معرّف غير معروف لا ينشئ موظفاً ولا سجلاً، بل يُحفظ معلّقاً (لا يضيع الحدث)', async () => {
  const st = mk(); _cache.emp.clear();
  const r = await body(await run(post('/v1/punch', { records: [{ employeeCode: '999', eventTime: '2026-11-01T08:00:00+02:00', eventType: 'in' }] }, auth), st));
  assert.equal(r.pending, 1); assert.equal(st.records.size, 0); assert.equal(st.pending.size, 1);
  await run(post('/v1/punch', { records: [{ employeeCode: '999', eventTime: '2026-11-01T08:00:00+02:00', eventType: 'in' }] }, auth), st); assert.equal(st.pending.size, 1);
});
test('مدخلات غير صالحة: JSON معطوب 400، وقت/معرّف تالف 400، حدث مستقبلي يُعلَّق دون سجل، حجم زائد 413', async () => {
  const st = mk();
  assert.equal((await run(post('/v1/punch', '{bad', auth), st)).status, 400);
  assert.equal((await run(post('/v1/punch', { records: [{ employeeCode: '', eventTime: 'x' }] }, auth), st)).status, 400);
  const f = await body(await run(post('/v1/punch', { records: [{ employeeCode: '101', eventTime: '2026-12-01T08:00:00+02:00', eventType: 'in' }] }, auth), st));
  assert.equal(f.stored, 0); assert.equal(f.pending, 1); assert.equal(st.records.size, 0);
  const big = new Request('https://w.test/v1/punch', { method: 'POST', headers: { ...auth, 'content-length': '5000000' }, body: '{}' });
  assert.equal((await run(big, st)).status, 413);
  assert.equal((await run(post('/v1/punch', { protocol: 'vendor-x' }, auth), st)).status, 501);
});
test('حركة غير محددة: تناوب حضور/انصراف داخل اليوم مع مراعاة سجلات الجهاز السابقة', async () => {
  const st = mk(); _cache.emp.clear(); st.devices.gate.typeSource = 'alternate';
  const ev = t => ({ records: [{ employeeCode: '101', eventTime: `2026-11-01T${t}:00+02:00` }] });
  await run(post('/v1/punch', ev('08:00'), auth), st); await run(post('/v1/punch', ev('12:00'), auth), st); await run(post('/v1/punch', ev('17:00'), auth), st);
  const types = [...st.records.entries()].sort((a, b) => +a[1].time - +b[1].time).map(([, v]) => v.type);
  assert.deepEqual(types, ['in', 'out', 'in']);
});
test('الربط المعطّل يمنع الاعتماد ويذهب للمراجعة', async () => {
  const st = mk(); _cache.emp.clear(); st.devices.gate.typeSource = 'device';
  st.getMaps = async () => new Map([['gate__101', { employeeId: 'E1', status: 'disabled' }]]);
  const r = await body(await run(post('/v1/punch', { records: [{ employeeCode: '101', eventTime: '2026-11-01T08:00:00+02:00', eventType: 'in' }] }, auth), st));
  assert.equal(r.stored, 0); assert.equal(r.results[0].reason, 'mapping_disabled');
});

/* ---- generic: JSON/XML/multipart ---- */
test('generic: إشعار JSON متداخل مع مسارات الحقول، ورمز المسار /v1/hook', async () => {
  const st = mk(); _cache.emp.clear();
  const payload = { AccessControllerEvent: { events: [{ employeeNoString: '101', dateTime: '2026-11-01T08:00:00+02:00' }, { employeeNoString: '101', dateTime: '2026-11-01T17:00:00+02:00' }] } };
  const bad = await run(post('/v1/hook/hik/wrong', payload), st); assert.equal(bad.status, 401);
  const r = await body(await run(post('/v1/hook/hik/' + TOKEN, payload), st));
  assert.equal(r.stored, 2); assert.deepEqual([...st.records.values()].map(v => v.type).sort(), ['in', 'out']);
});
test('generic: XML وmultipart (تُهمل الصور) وسطور نصية', () => {
  const xml = '<?xml version="1.0"?><EventNotificationAlert><AccessControllerEvent><employeeNoString>101</employeeNoString><dateTime>2026-11-01T08:00:00+02:00</dateTime></AccessControllerEvent></EventNotificationAlert>';
  const o = parseXml(xml); assert.equal(o.EventNotificationAlert.AccessControllerEvent.employeeNoString, '101');
  const m = mapGeneric(parseBodyText(xml), { recordsPath: 'EventNotificationAlert.AccessControllerEvent', idPath: 'employeeNoString', timePath: 'dateTime', typePath: '' });
  assert.equal(m.events.length, 1); assert.equal(m.events[0].code, '101'); assert.equal(m.events[0].type, null);
  const mp = '--B\r\nContent-Type: application/json\r\n\r\n{"userId":"5","time":"2026-11-01 08:00:00"}\r\n--B\r\nContent-Type: image/jpeg\r\n\r\nBINARY\r\n--B--';
  const m2 = mapGeneric(parseBodyText(mp, 'multipart/form-data; boundary=B'), {}, 120); assert.equal(m2.events[0].ms, Date.UTC(2026, 10, 1, 6));
  const m3 = mapGeneric(parseBodyText('101,2026-11-01 08:00:00,0\n101,2026-11-01 17:00:00,1'), { idCol: 0, timeCol: 1, typeCol: 2 }, 120);
  assert.deepEqual(m3.events.map(e => e.type), ['in', 'out']);
});

/* ---- ZKTeco ADMS ---- */
test('ADMS: جهاز غير مسجّل مرفوض، المصافحة تعيد خيارات الجهاز', async () => {
  const st = mk();
  assert.equal((await run(new Request('https://w.test/iclock/cdata?SN=UNKNOWN&options=all'), st)).status, 403);
  assert.equal((await run(new Request('https://w.test/iclock/cdata'), st)).status, 400);
  const h = await run(new Request('https://w.test/iclock/cdata?SN=SN123&options=all&pushver=2.4.1'), st);
  assert.equal(h.status, 200); const t = await h.text(); assert.match(t, /GET OPTION FROM: SN123/); assert.match(t, /Realtime=1/); assert.match(t, /Delay=60/);
  assert.equal(await (await run(new Request('https://w.test/iclock/getrequest?SN=SN123'), st)).text(), 'OK');
});
test('ADMS: ATTLOG يحفظ الحركات بتوقيت الجهاز المحلي ويردّ OK:n، وإعادة الإرسال لا تكرر', async () => {
  const st = mk(); _cache.emp.clear();
  const log = '101\t2026-11-01 08:00:00\t0\t1\t0\n101\t2026-11-01 17:00:00\t1\t1\t0\n999\t2026-11-01 08:01:00\t0\t1\t0\nbad\tnot-a-time\t0\n';
  const send = () => run(new Request('https://w.test/iclock/cdata?SN=SN123&table=ATTLOG&Stamp=1', { method: 'POST', body: log }), st);
  const r = await send(); assert.equal(await r.text(), 'OK:4');
  assert.equal(st.records.size, 2); assert.ok(st.records.has('employees/E1/records/bio_' + Date.UTC(2026, 10, 1, 6)));
  assert.equal(st.pending.size, 1);
  await send(); assert.equal(st.records.size, 2);
  const op = await run(new Request('https://w.test/iclock/cdata?SN=SN123&table=OPERLOG', { method: 'POST', body: 'USER PIN=1' }), st); assert.equal(await op.text(), 'OK');
  assert.equal(parseAttlog('1\t2026-11-01 08:00:00\t0', 120).events.length, 1);
});
test('ADMS: عطل التخزين يعيد خطأ ليعيد الجهاز المحاولة (لا يُعتبر الإرسال ناجحاً)', async () => {
  const st = mk(); _cache.emp.clear(); st.createRecords = async items => items.map(() => 'error');
  const r = await run(new Request('https://w.test/iclock/cdata?SN=SN123&table=ATTLOG', { method: 'POST', body: '101\t2026-11-01 08:00:00\t0' }), st);
  assert.equal(r.status, 500);
});
test('عدد الاستدعاءات الخارجية لدفعة كبيرة يبقى تحت حد الخطة المجانية (50)', async () => {
  const emps = {}; for (let i = 0; i < 80; i++) emps['X' + i] = { name: 'م' + i, bioId: String(1000 + i), active: true };
  const st = fakeStore({ devices: { zk1: { protocol: 'zkteco-adms', sn: 'SN123', tzOffset: 120, active: true } }, employees: emps }); _cache.emp.clear();
  const lines = []; for (let i = 0; i < 80; i++) for (let d = 1; d <= 3; d++) lines.push(`${1000 + i}\t2026-10-0${d} 08:00:00\t0\n${1000 + i}\t2026-10-0${d} 17:00:00\t1`);
  const r = await run(new Request('https://w.test/iclock/cdata?SN=SN123&table=ATTLOG', { method: 'POST', body: lines.join('\n') }), st);
  assert.equal(r.status, 200); assert.equal(st.records.size, 480); assert.ok(st.calls.n <= 40, 'calls=' + st.calls.n);
});
test('normalizeEvent (توافق): الأحداث الصالحة والتالفة', () => {
  assert.equal(normalizeEvent({ employeeCode: '101', eventTime: '2026-11-01T08:00:00+02:00', eventType: 'in' }, 'd', NOW).ms, Date.UTC(2026, 10, 1, 6));
  assert.throws(() => normalizeEvent({ eventTime: 1, eventType: 'in' }, 'd'), /invalid_employee_code/);
  assert.throws(() => normalizeEvent({ employeeCode: '1', eventTime: 'x', eventType: 'in' }, 'd'), /invalid_event_time/);
  assert.throws(() => normalizeEvent({ employeeCode: '1', eventTime: NOW, eventType: 'face' }, 'd', NOW), /invalid_event_type/);
});
