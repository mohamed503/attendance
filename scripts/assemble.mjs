// يجمع index.html من أجزاء المصدر في src/ (القائمة والترتيب في src/parts.json). index.html ناتج مُولَّد ويبقى مُلتزَماً به
// لأن النظام يُسلَّم ملفاً واحداً (دمج firebaseConfig/MEQAT_LICENSE نصياً + اختبارات الوحدة تقرؤه). لا تعدّله يدوياً.
//   npm run assemble          يكتب index.html من المصدر
//   npm run assemble:check    يفشل إن اختلف index.html عن ناتج التجميع
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export function assembleHtml() {
  const { parts } = JSON.parse(readFileSync(join(root, 'src', 'parts.json'), 'utf8'));
  return parts.map(p => readFileSync(join(root, 'src', p), 'utf8')).join('');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = assembleHtml(), file = join(root, 'index.html');
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== out) { console.error('✗ index.html لا يطابق ناتج التجميع من src/ — شغّل: npm run assemble'); process.exit(1); }
    console.log('✓ index.html مطابق للمصدر');
  } else { writeFileSync(file, out); console.log('✓ كُتب index.html (' + out.length + ' حرفاً)'); }
}
