import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '..', '..');
const outDir = path.join(root, 'docs', 'promo');
mkdirSync(outDir, { recursive: true });

function stamp(seconds) {
  const ms = Math.round((seconds % 1) * 1000);
  const total = Math.floor(seconds);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms).padStart(3, '0')}`;
}

for (const lang of ['en', 'zh']) {
  const narration = JSON.parse(
    readFileSync(path.join(here, '..', 'src', 'data', `narration.${lang}.json`), 'utf8'),
  );
  const lines = narration.lines.map((line, index) => {
    const start = line.at;
    const end = line.at + line.duration;
    return `${index + 1}\n${stamp(start)} --> ${stamp(end)}\n${line.text}\n`;
  });
  const file = path.join(outDir, `balloon-rally-promo-${lang}.srt`);
  writeFileSync(file, lines.join('\n'));
  console.log(`wrote ${path.relative(root, file)}`);
}
