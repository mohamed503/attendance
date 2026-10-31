// يجعل firestore.rules المصدر الوحيد لقواعد Firestore، ويولّد منه النص المضمّن في index.html (مولّد القواعد).
// الاستخدام:  node scripts/rules-sync.mjs          ← يحدّث index.html
//             node scripts/rules-sync.mjs --check  ← يفشل (رمز 1) إن اختلف النصّان
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = "return `rules_version = '2';";
const END = '}`;';
const OWNER_RE = /(token\.get\('email', ''\) == ')[^']*(')/;

export function rulesToTemplate(rules) {
  if (/[`]|\$\{/.test(rules)) throw new Error('firestore.rules يحتوي ` أو ${ ولا يمكن تضمينه في قالب نصي');
  if (!OWNER_RE.test(rules)) throw new Error('لم يُعثر على سطر isOwnerEmail في firestore.rules');
  return rules.replace(OWNER_RE, '$1${email}$2').trimEnd();
}

export function embeddedRules(html) {
  const s = html.indexOf(START);
  if (s < 0) throw new Error('قالب القواعد غير موجود في index.html');
  const e = html.indexOf(END, s);
  return { s, e, text: html.slice(s + 'return `'.length, e + 1) };
}

export function syncedHtml(html, rules) {
  const { s, e } = embeddedRules(html);
  return html.slice(0, s) + 'return `' + rulesToTemplate(rules) + html.slice(e + 1);
}

export function inSync(html, rules) {
  return embeddedRules(html).text === rulesToTemplate(rules);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const htmlPath = join(root, 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  if (process.argv.includes('--check')) {
    if (!inSync(html, rules)) { console.error('✗ القواعد المضمّنة في index.html لا تطابق firestore.rules — شغّل: npm run rules:sync'); process.exit(1); }
    console.log('✓ القواعد متطابقة');
  } else {
    writeFileSync(htmlPath, syncedHtml(html, rules));
    console.log('✓ تم تحديث القواعد المضمّنة في index.html من firestore.rules');
  }
}
