// تصدير المسيّر المحفوظ والتنبيهات: يُختبر من كتلة /*EXPORT-START*/ نفسها في index.html.
// الفكرة المحورية: كل الدوال هنا تعمل على الصفوف المحفوظة، ولا تقرأ أي بيانات موظف حيّة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const raw = html.slice(html.indexOf('/*EXPORT-START*/'), html.indexOf('/*EXPORT-END*/'));
const E = new Function('const r2 = v => Math.round((+v || 0) * 100) / 100;\n' + raw + '\nreturn { runPayRows, runBankRows, runAlertList, runAlertSummary, csvCell, csvAoa };')();

const saved = (over = {}) => ({
  empId: 'e1', name: 'محمد', dept: 'المالية', jobTitle: 'محاسب', nationalId: '119', bankName: 'مصرف الجمهورية', iban: 'LY83000',
  pm: 'monthly', amt: 3100, paidH: 176, taskQty: 0, otEq: 6, base: 3100, otPay: 165.5,
  allowBonus: 100, dedLate: 10, dedEarly: 0, dedAbs: 0, dedForgot: 5, statDed: 200.25, dedLoan: 150, dedPen: 0,
  net: 2800.25, absent: 0, forgotDays: 1, unpaidDays: 0, ...over
});

test('runPayRows: يحتفظ بالأرقام المحفوظة حرفيًا ولا يعيد اشتقاقها', () => {
  const r = E.runPayRows([saved()])[0];
  assert.equal(r.base, 3100); assert.equal(r.otPay, 165.5); assert.equal(r.net, 2800.25);
  assert.equal(r.dedLoan, 150); assert.equal(r.iban, 'LY83000');
});
test('runPayRows: صفوف ناقصة الحقول لا ترمي (قيم افتراضية)', () => {
  const r = E.runPayRows([{ empId: 'x', name: 'ناقص' }])[0];
  assert.equal(r.net, 0); assert.equal(r.dedLoan, 0); assert.equal(r.pm, 'none'); assert.equal(r.absent, 0);
});
test('runPayRows: ترتيب عربي بالاسم', () => {
  const names = E.runPayRows([{ empId: 'b', name: 'بدر' }, { empId: 'a', name: 'أحمد' }]).map(r => r.name);
  assert.deepEqual(names, ['أحمد', 'بدر']);
});
test('runBankRows: يستبعد من صافيه صفر أو أقل', () => {
  const rows = E.runBankRows([saved({ empId: 'a', name: 'أ', net: 10 }), saved({ empId: 'b', name: 'ب', net: 0 }), saved({ empId: 'c', name: 'ج', net: -5 })]);
  assert.deepEqual(rows.map(r => r.empId), ['a']);
});

test('التنبيهات: لا شيء عندما تكون الأرقام مطابقة للسابق', () => {
  const a = E.runAlertList([saved()], [saved()]);
  assert.deepEqual(a.filter(x => x.code !== 'iban'), []);
});
test('التنبيهات: تغيّر كبير في الصافي يُرصد، والتغيّر الصغير لا', () => {
  const big = E.runAlertList([saved({ net: 2000 })], [saved({ net: 2800.25 })]);
  assert.equal(big.filter(x => x.code === 'change').length, 1);
  assert.equal(big.find(x => x.code === 'change').delta, -800.25);
  const small = E.runAlertList([saved({ net: 2795 })], [saved({ net: 2800.25 })]);
  assert.equal(small.filter(x => x.code === 'change').length, 0);
});
test('التنبيهات: صافٍ صفر يُرصد كتحذير', () => {
  const a = E.runAlertList([saved({ net: 0 })]);
  const z = a.find(x => x.code === 'zero');
  assert.ok(z); assert.equal(z.level, 'warn');
});
test('التنبيهات: غياب كثير يُرصد عند الحد الافتراضي 5 أيام', () => {
  assert.equal(E.runAlertList([saved({ absent: 4 })]).some(x => x.code === 'absent'), false);
  assert.equal(E.runAlertList([saved({ absent: 5 })]).some(x => x.code === 'absent'), true);
});
test('التنبيهات: موظف بلا IBAN يُنبَّه عليه فقط إذا كان له مستحق', () => {
  assert.equal(E.runAlertList([saved({ iban: '', net: 100 })]).some(x => x.code === 'iban'), true);
  assert.equal(E.runAlertList([saved({ iban: '', net: 0 })]).some(x => x.code === 'iban'), false);
});
test('runAlertSummary: يفصل التحذير عن الملاحظة', () => {
  const s = E.runAlertSummary([{ level: 'warn' }, { level: 'info' }, { level: 'info' }]);
  assert.deepEqual(s, { total: 3, warn: 1, info: 2 });
  assert.deepEqual(E.runAlertSummary(null), { total: 0, warn: 0, info: 0 });
});

test('CSV: يهرّب علامات التنصيص ويمنع حقن الصيغ', () => {
  assert.equal(E.csvCell('أ"ب'), '"أ""ب"');
  assert.equal(E.csvCell('=1+1'), '"\'=1+1"');
  assert.equal(E.csvCell('+218'), '"\'+218"');
  assert.equal(E.csvCell('-5'), '"\'-5"');
  assert.equal(E.csvCell(null), '""');
});
test('CSV: BOM في البداية وسطر لكل صف', () => {
  const s = E.csvAoa([['أ', 'ب'], ['1', '2']]);
  assert.ok(s.startsWith('\ufeff'));
  assert.equal(s, '\ufeff"أ","ب"\n"1","2"');
});

test('مصدر كتلة التصدير لا يعتمد على الحساب الحيّ', () => {
  assert.doesNotMatch(raw, /payrollRows\s*\(/);
  assert.doesNotMatch(raw, /computeSummary\s*\(/);
  assert.doesNotMatch(raw, /S\.emps|S\.scheds|S\.recs/);
});
