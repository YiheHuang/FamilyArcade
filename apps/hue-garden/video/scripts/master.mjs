import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.resolve(root, '..', 'docs', 'promo');
mkdirSync(outDir, { recursive: true });

const TARGET_I = -14;
const TARGET_TP = -1;

function run(args, options = {}) {
  const result = spawnSync('ffmpeg', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed:\n${result.stderr || result.stdout || ''}`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function measure(file) {
  const text = run([
    '-hide_banner',
    '-i',
    file,
    '-af',
    `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=11:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  const matches = [...text.matchAll(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)];
  if (matches.length === 0) throw new Error(`no loudnorm JSON for ${file}`);
  const data = JSON.parse(matches[matches.length - 1][0]);
  return {
    input_i: Number(data.input_i),
    input_tp: Number(data.input_tp),
    input_lra: Number(data.input_lra),
    input_thresh: Number(data.input_thresh),
    target_offset: Number(data.target_offset),
  };
}

const specs = [
  { lang: 'zh', gain: null },
  { lang: 'en', gain: null },
];

const results = [];

for (const spec of specs) {
  const raw = path.join(root, 'out', `hue-garden-promo-${spec.lang}.mp4`);
  const final = path.join(outDir, `hue-garden-promo-${spec.lang}.mp4`);
  if (!existsSync(raw)) {
    console.log(`skip ${spec.lang}: missing raw render ${raw}`);
    continue;
  }
  const before = measure(raw);
  let gain = spec.gain ?? Math.min(9, Math.max(0, TARGET_I - before.input_i));
  let limiter = 0.8;
  console.log(
    `${spec.lang} raw: ${before.input_i.toFixed(1)} LUFS / ${before.input_tp.toFixed(1)} dBTP; gain +${gain.toFixed(1)} dB`,
  );

  let after = before;
  for (let attempt = 0; attempt < 3; attempt++) {
    // +gain, then a real limiter (not just a volume knob), then AAC master.
    run([
      '-y',
      '-i',
      raw,
      '-c:v',
      'copy',
      '-af',
      `volume=${gain.toFixed(1)}dB,alimiter=limit=${limiter.toFixed(2)}:attack=5:release=60:level=false`,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      final,
    ]);
    after = measure(final);
    console.log(
      `${spec.lang} attempt ${attempt + 1}: ${after.input_i.toFixed(2)} LUFS / ${after.input_tp.toFixed(2)} dBTP`,
    );
    const loudnessOk = after.input_i >= TARGET_I - 1 && after.input_i <= TARGET_I + 1;
    const peakOk = after.input_tp <= TARGET_TP;
    if (loudnessOk && peakOk) break;
    gain += TARGET_I - after.input_i;
    if (!peakOk) limiter = Math.max(0.68, limiter - 0.06);
  }
  console.log(
    `${spec.lang} master: ${after.input_i.toFixed(1)} LUFS / ${after.input_tp.toFixed(1)} dBTP -> ${final}`,
  );
  results.push({
    lang: spec.lang,
    file: `hue-garden-promo-${spec.lang}.mp4`,
    rawIntegratedLufs: Number(before.input_i.toFixed(2)),
    rawTruePeakDbtp: Number(before.input_tp.toFixed(2)),
    gainDb: Number(gain.toFixed(2)),
    integratedLufs: Number(after.input_i.toFixed(2)),
    truePeakDbtp: Number(after.input_tp.toFixed(2)),
  });
  if (after.input_i < TARGET_I - 1 || after.input_i > TARGET_I + 1) {
    console.warn(`${spec.lang}: integrated loudness outside ${TARGET_I} ± 1 LU`);
  }
  if (after.input_tp > TARGET_TP) {
    console.warn(`${spec.lang}: true peak above ${TARGET_TP} dBTP`);
  }
}

writeFileSync(
  path.join(outDir, 'audio-check.json'),
  JSON.stringify({ target: { integratedLufs: TARGET_I, truePeakDbtp: TARGET_TP }, files: results }, null, 2),
);
console.log('wrote', path.join(outDir, 'audio-check.json'));
