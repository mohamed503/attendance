/* محوّل ZKTeco ADMS / iClock Push (يستعمله أيضاً عدد كبير من الأجهزة المتوافقة معه).
   المسارات: GET /iclock/cdata (مصافحة) ، POST /iclock/cdata?table=ATTLOG (الحركات) ، GET /iclock/getrequest ، POST /iclock/devicecmd.
   ملاحظة صريحة: هذا التنفيذ مبني على البروتوكول المنشور عن الأجهزة؛ يجب التحقق منه على الموديل/الإصدار الفعلي قبل الاعتماد (راجع README). */
import { parseTime, parseType } from './normalize.js';

export const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

/* ردّ المصافحة: يحدّد للجهاز تردد الاستعلام ويطلب إرسال الحركات لحظياً */
export const handshake = sn => text(['GET OPTION FROM: ' + sn, 'Stamp=0', 'OpStamp=0', 'ErrorDelay=120', 'Delay=60', 'TransTimes=00:00;14:00', 'TransInterval=1',
  'TransFlag=TransData AttLog\tOpLog', 'TimeZone=0', 'Realtime=1', 'Encrypt=0', ''].join('\n'));

/* جسم ATTLOG: سطر لكل حركة  PIN \t Time \t Status \t Verify \t Workcode ... */
export function parseAttlog(bodyText, tzOffsetMin) {
  const events = [], rejected = [];
  String(bodyText || '').split(/\r?\n/).filter(l => l.trim()).forEach((line, i) => {
    const f = line.replace(/^ATTLOG\s+/i, '').split('\t').map(s => s.trim());
    const ms = parseTime(f[1], tzOffsetMin);
    if (!f[0] || ms == null) return rejected.push({ index: i, reason: !f[0] ? 'invalid_employee_code' : 'invalid_event_time' });
    events.push({ code: f[0], ms, type: parseType(f[2]) });
  });
  return { events, rejected };
}
