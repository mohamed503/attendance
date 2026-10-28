// يستخرج نص قواعد Firestore من مولّد القواعد في index.html (المصدر الوحيد للحقيقة).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function loadRules(ownerEmail = 'owner@example.com', file = 'index.html') {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', file), 'utf8');
  const start = html.indexOf("rules_version = '2';");
  const end = html.indexOf('}`;', start);
  if (start < 0 || end < 0) throw new Error('rules template not found in ' + file);
  return html.slice(start, end + 1).replace('${email}', ownerEmail);
}
