import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(root, '..', 'docs', 'promo');
const rawDir = path.join(root, 'out');
mkdirSync(outDir, { recursive: true });

function run(args) {
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`ffmpeg failed with status ${result.status}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function measureLoudnorm(file) {
  const output = run([
    '-hide_banner',
    '-nostats',
    '-i',
    file,
    '-af',
    'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
    '-f',
    'null',
    '-',
  ]);
  const matches = output.match(/\{[\s\S]*?\}/g);
  if (!matches) throw new Error('could not read loudnorm measurement');
  return JSON.parse(matches[matches.length - 1]);
}

function measureFinal(file) {
  const measured = measureLoudnorm(file);
  return {
    lufs: Number(measured.input_i),
    peakDb: Number(measured.input_tp),
  };
}

const report = [];

for (const lang of ['en', 'zh']) {
  const raw = path.join(rawDir, `balloon-rally-promo-${lang}.mp4`);
  const final = path.join(outDir, `balloon-rally-promo-${lang}.mp4`);
  if (!existsSync(raw)) throw new Error(`missing raw render: ${raw}`);

  const measured = measureLoudnorm(raw);
  const loudnorm = [
    'I=-14',
    'TP=-1.5',
    'LRA=11',
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
    'print_format=summary',
  ].join(':');
  const af = `loudnorm=${loudnorm},alimiter=limit=0.89:level=false:attack=5:release=50`;

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      raw,
      '-c:v',
      'copy',
      '-af',
      af,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      final,
    ],
    { stdio: 'inherit' },
  );

  const finalMeasure = measureFinal(final);
  report.push({ lang, file: path.relative(path.resolve(root, '..'), final).replaceAll('\\', '/'), ...finalMeasure });
  console.log(
    `${lang}: ${finalMeasure.lufs ?? '?'} LUFS, ${finalMeasure.peakDb ?? '?'} dBTP true peak → ${final}`,
  );
}

writeFileSync(
  path.join(outDir, 'audio-report.json'),
  `${JSON.stringify({ measuredWith: 'ffmpeg loudnorm', target: '-14 LUFS / -1.5 dBTP', files: report }, null, 2)}\n`,
);
console.log('audio-report.json written');
