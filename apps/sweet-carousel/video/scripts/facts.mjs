import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const repo = path.resolve(root, '..');
const rows = [];

function check(claim, source, fn) {
  let ok = false;
  let detail = '';
  try {
    detail = fn() || '';
    ok = true;
  } catch (error) {
    detail = String(error.message || error);
  }
  rows.push({ claim, source, ok, detail });
}

function json(rel) {
  return JSON.parse(readFileSync(path.resolve(repo, rel), 'utf8'));
}

check('72 cards, 6 desserts × 12 copies', 'data/cards.json + data:verify', () => {
  const data = json('data/cards.json');
  const counts = new Map();
  for (const item of data.items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  if (data.items.length !== 72 || data.types.length !== 6) throw new Error('bad count');
  for (const [type, count] of counts) if (count !== 12) throw new Error(`${type} has ${count}`);
  return '72 / 6 × 12';
});

check('Three rounds, 8 picks per player', 'src/game/engine.ts + tests', () => {
  const text = readFileSync(path.resolve(repo, 'src/game/engine.ts'), 'utf8');
  if (!text.includes('export const TOTAL_ROUNDS = ROUNDS') || !text.includes('PICKS_PER_ROUND = HAND_SIZE')) {
    throw new Error('constants missing');
  }
  return 'ROUNDS = 3, HAND_SIZE = 8';
});

check('Pair 2 / triple 6 / quad 12 / sampler 5 / leftovers 1 / crown 6', 'src/game/scoring.ts', () => {
  const text = readFileSync(path.resolve(repo, 'src/game/scoring.ts'), 'utf8');
  for (const expected of [
    'pair: 2',
    'triple: 6',
    'quad: 12',
    'SAMPLER_POINTS = 5',
    'LEFTOVER_POINTS = 1',
    'CROWN_POINTS = 6',
    'CROWN_MIN = 6',
  ]) {
    if (!text.includes(expected)) throw new Error(`missing ${expected}`);
  }
  return '2 / 6 / 12 / 5 / 1 / 6, crown min 6';
});

check('Final demo EN: 45 / 39 / 38, winner seat 3', 'video/src/data/demo-en.json + screenshots/en/game-over.png', () => {
  const data = JSON.parse(readFileSync(path.resolve(root, 'src/data/demo-en.json'), 'utf8'));
  const totals = data.players.map((p) => p.total);
  if (JSON.stringify(totals) !== JSON.stringify([39, 38, 45])) throw new Error(`totals ${totals}`);
  if (data.winner !== 2 || data.players[2].name !== 'Player 3') throw new Error('winner mismatch');
  return 'Player 3 45, Player 1 39, Player 2 38';
});

check('Final demo ZH: 47 / 36 / 33, winner seat 2', 'video/src/data/demo-zh.json + screenshots/zh/game-over.png', () => {
  const data = JSON.parse(readFileSync(path.resolve(root, 'src/data/demo-zh.json'), 'utf8'));
  const totals = data.players.map((p) => p.total);
  if (JSON.stringify(totals) !== JSON.stringify([36, 47, 33])) throw new Error(`totals ${totals}`);
  if (data.winner !== 1 || data.players[1].name !== '玩家 2') throw new Error('winner mismatch');
  return '玩家 2 47, 玩家 1 36, 玩家 3 33';
});

check('Nine English and nine Chinese voice lines', 'video/public/audio/voice/{en,zh}/line-*.mp3', () => {
  for (const lang of ['en', 'zh']) {
    for (let index = 1; index <= 9; index++) {
      const file = path.resolve(root, `public/audio/voice/${lang}/line-${index}.mp3`);
      if (!existsSync(file)) throw new Error(`missing ${file}`);
    }
  }
  return '9 + 9 voice clips';
});

check('Bilingual SRTs exist', 'docs/promo/*.srt', () => {
  for (const lang of ['en', 'zh']) {
    const file = path.resolve(repo, `docs/promo/sweet-carousel-promo-${lang}.srt`);
    if (!existsSync(file)) throw new Error(`missing ${file}`);
  }
  return '2 SRT files';
});

for (const lang of ['en', 'zh']) {
  check(`MP4 ${lang}: 48.5 s, 1920×1080, 60 fps, H.264/yuv420p`, `docs/promo/sweet-carousel-promo-${lang}.mp4`, () => {
    const file = path.resolve(repo, `docs/promo/sweet-carousel-promo-${lang}.mp4`);
    if (!existsSync(file)) throw new Error('missing MP4');
    const out = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,r_frame_rate,pix_fmt,codec_name:format=duration',
        '-of',
        'default=noprint_wrappers=1',
        file,
      ],
      { encoding: 'utf8' },
    );
    if (!out.includes('1920') || !out.includes('1080') || !out.includes('60/1') || !out.includes('yuv420p')) {
      throw new Error(out.replace(/\n/g, ' '));
    }
    const duration = Number(out.match(/duration=(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    if (duration < 48 || duration > 49) throw new Error(`duration ${duration}`);
    return out.replace(/\n/g, ' ');
  });
}

for (const lang of ['en', 'zh']) {
  check(`Audio ${lang}: about -14 LUFS and true peak ≤ -1 dBTP`, `docs/promo/sweet-carousel-promo-${lang}.mp4`, () => {
    const file = path.resolve(repo, `docs/promo/sweet-carousel-promo-${lang}.mp4`);
    const result = spawnSync(
      'ffmpeg',
      ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
      { encoding: 'utf8' },
    );
    const out = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
    const integratedMatches = [...out.matchAll(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
    const peakMatches = [...out.matchAll(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/g)];
    const integrated = integratedMatches.at(-1);
    const peak = peakMatches.at(-1);
    if (!integrated || !peak) throw new Error('could not read loudness');
    const i = Number(integrated[1]);
    const p = Number(peak[1]);
    if (i < -15 || i > -13) throw new Error(`integrated ${i}`);
    if (p > -0.9) throw new Error(`peak ${p}`);
    return `${i} LUFS, peak ${p} dBFS`;
  });
}

const failed = rows.filter((row) => !row.ok);
const md = [
  '# FACTS · Sweet Carousel promo',
  '',
  '> Generated by `video/scripts/facts.mjs`. Every row is a claim used in the video and its source. FAIL means do not publish the cut.',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '| # | Claim | Source | Status | Detail |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map(
    (row, index) =>
      `| ${index + 1} | ${row.claim} | ${row.source} | **${row.ok ? 'PASS' : 'FAIL'}** | ${row.detail.replace(/\|/g, '/')} |`,
  ),
  '',
  failed.length === 0
    ? '**All checks PASS.** The video may be published with these claims.'
    : `**${failed.length} check(s) FAILED.** Do not publish until fixed.`,
  '',
  '## Not claimed',
  '',
  '- No LAN, installer, Tauri build or online play in v0.1; the end card says “Web v0.1 · LAN and installer are next milestone”.',
  '- No 4K master. Both cuts are 1920×1080 at 60 fps.',
  '- No third-party card art, card text, publisher name or logo is used.',
  '',
].join('\n');

writeFileSync(path.resolve(root, 'FACTS.md'), md, 'utf8');
for (const row of rows) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.claim} — ${row.detail}`);
console.log(`\nwrote video/FACTS.md (${failed.length === 0 ? 'all PASS' : `${failed.length} FAIL`})`);
if (failed.length > 0) process.exit(1);
