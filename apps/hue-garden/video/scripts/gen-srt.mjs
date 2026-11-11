import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.resolve('..', 'docs', 'promo');
mkdirSync(outDir, { recursive: true });

function stamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

for (const lang of ['zh', 'en']) {
  const narration = JSON.parse(
    readFileSync(path.join(root, 'src', 'data', `narration.${lang}.json`), 'utf8'),
  );
  const rows = narration.lines.map((line, i) => {
    const start = line.at;
    const end = line.at + line.duration + 0.45;
    return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${line.text}\n`;
  });
  writeFileSync(path.join(outDir, `hue-garden-promo-${lang}.srt`), rows.join('\n'), 'utf8');
  console.log('srt', lang, rows.length, 'lines');
}
