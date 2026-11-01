// بناء النشر: ينسخ ملفات التطبيق كما هي إلى dist دون أي تحويل.
// السبب: النظام يُسلَّم كملف index.html واحد يُدمَج فيه firebaseConfig وMEQAT_LICENSE نصياً (انظر patchClientHtmlWithConfig)،
// وأي تجميع/تصغير للسكربت المضمّن يكسر هذا الدمج ويفصل sw.js وmanifest.json عن مساراتها الثابتة.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const APP_FILES = ['index.html', 'sw.js', 'manifest.json', 'icon.svg'];

export function build(outDir = 'dist') {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const out = resolve(root, outDir);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of APP_FILES) {
    const src = join(root, f);
    if (!existsSync(src)) throw new Error('ملف مفقود: ' + f);
    cpSync(src, join(out, f));
  }
  return { out, files: APP_FILES };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build(process.argv[2] || 'dist');
  console.log('✓ تم البناء →', r.out, '\n  ' + r.files.join('\n  '));
}
