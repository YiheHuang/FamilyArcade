import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.resolve(root, '..', 'docs', 'promo');
mkdirSync(outDir, { recursive: true });

const specs = [
  { lang: 'zh', gain: '6.0dB' },
  { lang: 'en', gain: '4.0dB' },
];

for (const { lang, gain } of specs) {
  const raw = path.join(root, 'out', `star-leap-promo-${lang}.mp4`);
  const final = path.join(outDir, `star-leap-promo-${lang}.mp4`);
  if (!existsSync(raw)) {
    throw new Error(`missing raw render: ${raw}`);
  }
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      raw,
      '-c:v',
      'copy',
      '-af',
      `volume=${gain},alimiter=limit=0.82:level=false:attack=5:release=50`,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      final,
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    'ffmpeg',
    ['-y', '-ss', '5.4', '-i', final, '-frames:v', '1', '-update', '1', path.join(outDir, `poster-${lang}.png`)],
    { stdio: 'inherit' },
  );
  console.log(`mastered ${lang}: ${final}`);
}
