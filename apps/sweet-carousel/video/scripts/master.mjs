import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.resolve(root, '..', 'docs', 'promo');
mkdirSync(outDir, { recursive: true });

for (const lang of ['zh', 'en']) {
  const raw = path.join(root, 'out', `sweet-carousel-promo-${lang}.mp4`);
  const final = path.join(outDir, `sweet-carousel-promo-${lang}.mp4`);
  if (!existsSync(raw)) {
    throw new Error(`missing raw render: ${raw}. Run npm run render or npm run render:zh first.`);
  }
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      raw,
      '-vf',
      'scale=in_range=full:out_range=tv,format=yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-color_range',
      'tv',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-af',
      'loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.89:level=false:attack=5:release=50',
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
  console.log(`mastered ${lang}: ${final}`);
}
