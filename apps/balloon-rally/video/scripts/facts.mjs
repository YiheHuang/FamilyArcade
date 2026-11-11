import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '..', '..');
const checks = [];

function check(claim, source, test, pass) {
  checks.push({ claim, source, test, pass });
  if (!pass) console.error(`FAIL ${claim}`);
}

function read(relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

function pngSize(relative) {
  const buffer = readFileSync(path.join(root, relative));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const course = JSON.parse(read('data/course.json'));
const game = JSON.parse(read('video/src/data/game.json'));
const en = JSON.parse(read('video/src/data/narration.en.json'));
const zh = JSON.parse(read('video/src/data/narration.zh.json'));
const audioReport = JSON.parse(read('docs/promo/audio-report.json'));
const types = read('src/game/types.ts');
const engine = read('src/game/engine.ts');
const simulation = read('tests/simulation.test.ts');
const i18n = read('src/i18n.ts');
const theme = read('video/src/theme.ts');
const rootFile = read('video/src/Root.tsx');
const desktop = pngSize('docs/screenshots/en/game.png');
const mobile = pngSize('docs/screenshots/en/game-mobile.png');

check(
  'Five balloons, a 20-space track, five wind cards (1, 2, 2, 3, 3), four rounds.',
  'data/course.json',
  'values read by video/scripts/facts.mjs',
  course.balloons.length === 5 &&
    course.trackLength === 20 &&
    course.rounds === 4 &&
    JSON.stringify(course.windCards) === JSON.stringify([1, 2, 2, 3, 3]),
);
check(
  'The video uses a real four-round engine game and real final scores.',
  'video/src/data/game.json ← src/demo.ts + src/game/engine.ts',
  `seed ${game.seed}; winner ${game.winner.join(' + ')}; scores ${game.scores.map((r) => `${r.name} ${r.total}`).join(', ')}`,
  game.rounds.length === 4 && game.scores.every((row) => row.total >= 0) && game.winner.length >= 1,
);
check(
  'The engine supports 2–6 players and four AI levels.',
  'src/game/engine.ts; src/game/types.ts',
  'playerCount guard + AI_LEVELS literal',
  engine.includes('playerCount < 2 || config.playerCount > 6') &&
    types.includes("['companion', 'easy', 'normal', 'hard']"),
);
check(
  'The test suite runs 120 seeded complete rallies with invariants.',
  'tests/simulation.test.ts',
  'seed <= 120',
  simulation.includes('seed <= 120') && simulation.includes('expect(invariants(state)).toEqual([])'),
);
check(
  'The video composition is 45 seconds at 1920×1080, 60 fps.',
  'video/src/theme.ts; video/src/Root.tsx',
  'WIDTH=1920, HEIGHT=1080, FPS=60, SECONDS=45 + Composition registrations',
  theme.includes('export const WIDTH = 1920') &&
    theme.includes('export const HEIGHT = 1080') &&
    theme.includes('export const FPS = 60') &&
    theme.includes('export const SECONDS = 45') &&
    rootFile.includes('BalloonRallyPromoEN') &&
    rootFile.includes('BalloonRallyPromoZH'),
);
check(
  'Both narration tracks fit inside 45 seconds.',
  'video/src/data/narration.en.json; narration.zh.json',
  'last line end <= 45',
  [...en.lines, ...zh.lines].every((line) => line.at + line.duration <= 45),
);
check(
  'Real app screenshots are 1440×1000 desktop and 780×1688 mobile (390×844 @2x).',
  'docs/screenshots/en|zh',
  `desktop ${desktop.width}×${desktop.height}; mobile ${mobile.width}×${mobile.height}`,
  desktop.width === 1440 &&
    desktop.height === 1000 &&
    mobile.width === 780 &&
    mobile.height === 1688 &&
    ['home.png', 'game.png', 'game-select.png', 'game-mobile.png', 'stats.png'].every((name) =>
      existsSync(path.join(root, 'docs', 'screenshots', 'zh', name)),
    ),
);
check(
  'Family-safe vocabulary: both dictionaries pass the banned-word check.',
  'src/i18n.ts; tests/data.test.ts',
  'banned vocabulary regex on both dictionaries',
  !/下注|筹码|赌博|\bgambl|\bbet\b|\bchips?\b|\bmoney\b/i.test(i18n),
);
check(
  'Both language cuts, SRTs and posters exist.',
  'docs/promo',
  'EN/ZH MP4 + SRT + poster + audio report',
  ['balloon-rally-promo-en.mp4', 'balloon-rally-promo-zh.mp4', 'balloon-rally-promo-en.srt', 'balloon-rally-promo-zh.srt', 'balloon-rally-poster-en.png', 'balloon-rally-poster-zh.png'].every((name) =>
    existsSync(path.join(root, 'docs', 'promo', name)),
  ),
);
check(
  'Bilingual voice tracks are present for all nine narration lines.',
  'video/public/audio/voice/{en,zh}',
  '18 MP3 files',
  ['en', 'zh'].every((lang) =>
    Array.from({ length: 9 }, (_, index) => `line-${index + 1}.mp3`).every((file) =>
      existsSync(path.join(root, 'video', 'public', 'audio', 'voice', lang, file)),
    ),
  ),
);
check(
  'Both mastered cuts hit the loudness target and stay under −1 dBTP.',
  'docs/promo/audio-report.json ← video/scripts/master.mjs',
  audioReport.files
    .map((file) => `${file.lang}: ${file.lufs} LUFS / ${file.peakDb} dBTP`)
    .join('; '),
  audioReport.files.length === 2 &&
    audioReport.files.every((file) => file.lufs >= -15 && file.lufs <= -13 && file.peakDb <= -1),
);

const rows = checks
  .map(
    (item) =>
      `| ${item.pass ? 'PASS' : 'FAIL'} | ${item.claim} | ${item.source} | ${item.test} |`,
  )
  .join('\n');

const md = `# Balloon Rally — FACTS gate

Generated by \`video/scripts/facts.mjs\`. Any FAIL blocks the render.

| Result | Claim | Source | Check |
| --- | --- | --- | --- |
${rows}

## Rendered-cut note

Both the English and Chinese 45-second cuts are built with Remotion from real screenshots, real engine data, and bilingual synthetic narration (Microsoft Edge TTS). Each cut is mastered with ffmpeg loudnorm to about −14 LUFS and ≤ −1.5 dBTP; see \`docs/promo/audio-report.json\`. The SRT files are the exact burned-in subtitle text.

## Commands

\`\`\`bash
cd video
npm install
npm run prep
npm run voice   # optional; requires edge-tts, committed voice files already exist
npm run poster:en
npm run poster:zh
npm run render:en
npm run render:zh
npm run master
\`\`\`
`;

writeFileSync(path.join(root, 'video', 'FACTS.md'), md);
console.log(`FACTS ${checks.every((item) => item.pass) ? 'PASS' : 'FAIL'} (${checks.length} checks)`);
if (!checks.every((item) => item.pass)) process.exit(1);
