import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.resolve(root, '..', 'docs', 'promo');
mkdirSync(outDir, { recursive: true });

function stamp(seconds) {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

for (const lang of ['zh', 'en']) {
  const { lines } = JSON.parse(readFileSync(path.join(root, 'src', 'data', `narration.${lang}.json`), 'utf8'));
  const blocks = lines.map((line, index) => {
    const start = line.at;
    const next = index + 1 < lines.length ? lines[index + 1].at - 0.05 : 48.3;
    const end = Math.min(48.3, line.at + line.duration + 0.4, next);
    return `${index + 1}\n${stamp(start)} --> ${stamp(end)}\n${line.text}\n`;
  });
  writeFileSync(path.join(outDir, `sweet-carousel-promo-${lang}.srt`), blocks.join('\n'), 'utf8');
  console.log(`wrote sweet-carousel-promo-${lang}.srt`);
}
