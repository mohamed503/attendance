// خادم محلي بسيط للتطوير (بلا اعتماديات): node scripts/serve.mjs [المجلد] [المنفذ]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const port = +process.argv[3] || +process.env.PORT || 3000;

// --watch: يعيد تجميع index.html تلقائياً عند أي تعديل في src/
if (process.argv.includes('--watch')) {
  const { watch } = await import('node:fs'); const { assembleHtml } = await import('./assemble.mjs'); const { writeFileSync } = await import('node:fs');
  let t; watch(join(root, 'src'), { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => { try { writeFileSync(join(root, 'index.html'), assembleHtml()); console.log('↻ أُعيد تجميع index.html'); } catch (e) { console.error(e.message); } }, 150); });
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };
const ALLOW = new Set(['/index.html', '/sw.js', '/manifest.json', '/icon.svg', '/meqat-console.html', '/meqat-seed.html', '/meqat-admin-migrate.html']);

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p === '/' || p === '\\') p = '/index.html';
  if (!ALLOW.has(p.replace(/\\/g, '/'))) { res.writeHead(404); return res.end('Not found'); }
  try {
    const f = join(root, p); await stat(f);
    res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`http://localhost:${port}  (المجلد: ${root})`));
