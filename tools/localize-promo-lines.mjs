import fs from 'node:fs';
import path from 'node:path';

for (const slug of fs.readdirSync('apps')) {
  const file = path.join('apps', slug, 'README.zh-CN.md');
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const next = text.replaceAll('*45 seconds · 1920×1080 · 60 fps ·', '*45 秒 · 1920×1080 · 60fps ·');
  if (next !== text) fs.writeFileSync(file, next);
}
console.log('localized promo lines');
