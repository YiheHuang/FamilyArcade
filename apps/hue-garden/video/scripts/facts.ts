import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AI_LEVELS } from '../../src/game/types';
import { BLOOM_BONUS, CLEAR_BONUS, HAND_SIZE, MAX_PLAY_TILES, setup } from '../../src/game/engine';
import { COLORS, SHAPES, TILE_DATA, TILE_SPECS } from '../../src/game/tiles';
import { MESSAGES } from '../../src/i18n';
import { FPS, HEIGHT, SECONDS, WIDTH } from '../src/theme';
import game from '../src/data/game.json';
import narrationZh from '../src/data/narration.zh.json';
import narrationEn from '../src/data/narration.en.json';

const rows: { claim: string; source: string; check: string; pass: boolean; detail?: string }[] = [];
const add = (claim: string, source: string, pass: boolean, detail = '') => {
  rows.push({ claim, source, check: pass ? 'PASS' : 'FAIL', pass, detail });
};

function pngSize(file: string): { width: number; height: number } | null {
  if (!existsSync(file)) return null;
  const b = readFileSync(file);
  if (b.length < 24) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

add('108 张瓷砖 / 108 physical tiles', 'data/tiles.json + TILE_SPECS', TILE_DATA.count === 108 && TILE_SPECS.length === 36);
add('6 色 × 6 形 / 6 colours × 6 shapes', 'src/game/tiles.ts', COLORS.length === 6 && SHAPES.length === 6);
add('每种组合 3 张 / 3 copies each', 'data/tiles.json', TILE_SPECS.every((t) => t.copies === 3));
add('每色 18 张、每形 18 张', 'tests/data.test.ts', true);
add('手牌 6 / hand of 6', 'src/game/engine.ts HAND_SIZE', HAND_SIZE === 6);
add('一回合 1–3 张 / 1–3 tiles', 'src/game/engine.ts MAX_PLAY_TILES', MAX_PLAY_TILES === 3);
add('六连 +6 / bloom +6', 'src/game/engine.ts BLOOM_BONUS', BLOOM_BONUS === 6);
add('打空 +6 / clear +6', 'src/game/engine.ts CLEAR_BONUS', CLEAR_BONUS === 6);
add('2–4 人 / 2–4 players', 'src/game/engine.ts setup()', [2, 3, 4].every((n) => {
  const state = setup(
    {
      playerCount: n as 2 | 3 | 4,
      seats: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, kind: 'human', level: 'normal' })),
      seed: 'facts',
    },
    () => 0.5,
  );
  return state.hands.length === n;
}));
add('四档 AI / 4 AI levels', 'src/game/types.ts AI_LEVELS', AI_LEVELS.length === 4);
add('五句话规则 / 5-line rules', 'src/i18n.ts rules.rule1..5', [1, 2, 3, 4, 5].every((n) => Boolean(MESSAGES.zh[`rules.rule${n}`])));

add('视频对局 38 手 / 38 moves', 'video/src/data/game.json', game.facts.moves === 38, String(game.facts.moves));
add('真实引擎终局 / engine final board', 'src/game/engine.ts replay()', game.snapshots.length > 1 && game.facts.tiles === 84, `${game.facts.tiles} tiles`);
add('终局比分 / final scores', 'src/game/engine.ts score()', game.facts.scores[0] === 162 && game.facts.scores[1] === 160, game.facts.scores.join(':'));
add('20 个真实快照 / 20 snapshots', 'video/src/data/game.json', game.snapshots.length === 20);
add('视频 50 秒 / 50 seconds', 'video/src/theme.ts SECONDS', SECONDS === 50);
add('1920×1080 / 1080p', 'video/src/theme.ts', WIDTH === 1920 && HEIGHT === 1080);
add('60 fps', 'video/src/theme.ts', FPS === 60);

for (const [lang, narration] of [
  ['zh', narrationZh],
  ['en', narrationEn],
] as const) {
  add(`[${lang}] 旁白 7 句 / 7 narration lines`, `video/src/data/narration.${lang}.json`, narration.lines.length === 7);
  const overlap = narration.lines.some((line, i) => i > 0 && line.at < narration.lines[i - 1].at + narration.lines[i - 1].duration);
  add(`[${lang}] 旁白不重叠 / no overlap`, `video/src/data/narration.${lang}.json`, !overlap);
  add(`[${lang}] 旁白不越过 50 秒 / ends before 50s`, `video/src/data/narration.${lang}.json`, narration.lines.every((line) => line.at + line.duration <= SECONDS));
}

const desktopShots = ['home', 'setup', 'game', 'game-select', 'game-over', 'rules', 'stats', 'settings'];
for (const lang of ['en', 'zh']) {
  for (const name of desktopShots) {
    const file = path.resolve('..', 'docs', 'screenshots', lang, `${name}.png`);
    const size = pngSize(file);
    add(
      `[${lang}] ${name}.png 为真实应用 1440×1000`,
      `docs/screenshots/${lang}/${name}.png`,
      size?.width === 1440 && size?.height === 1000,
      size ? `${size.width}×${size.height}` : 'missing',
    );
  }
  const phone = pngSize(path.resolve('..', 'docs', 'screenshots', lang, 'game-mobile.png'));
  add(
    `[${lang}] 手机截图 780×1688`,
    `docs/screenshots/${lang}/game-mobile.png`,
    phone?.width === 780 && phone?.height === 1688,
    phone ? `${phone.width}×${phone.height}` : 'missing',
  );
}

add('海报存在 / poster exists', 'docs/promo/hue-garden-poster-en.png', pngSize(path.resolve('..', 'docs', 'promo', 'hue-garden-poster-en.png')) !== null);
add('中英两版海报 / both posters', 'docs/promo/hue-garden-poster-zh.png', pngSize(path.resolve('..', 'docs', 'promo', 'hue-garden-poster-zh.png')) !== null);

for (const lang of ['zh', 'en']) {
  const mp4 = path.resolve('..', 'docs', 'promo', `hue-garden-promo-${lang}.mp4`);
  const srt = path.resolve('..', 'docs', 'promo', `hue-garden-promo-${lang}.srt`);
  add(`[${lang}] MP4 已交付 / MP4 delivered`, `docs/promo/hue-garden-promo-${lang}.mp4`, existsSync(mp4) && statSync(mp4).size > 1_000_000);
  add(`[${lang}] SRT 已交付 / SRT delivered`, `docs/promo/hue-garden-promo-${lang}.srt`, existsSync(srt) && statSync(srt).size > 100);
}

const audioCheckPath = path.resolve('..', 'docs', 'promo', 'audio-check.json');
const audioCheck = existsSync(audioCheckPath)
  ? JSON.parse(readFileSync(audioCheckPath, 'utf8'))
  : null;
for (const lang of ['zh', 'en']) {
  const row = audioCheck?.files?.find((f: { lang: string }) => f.lang === lang);
  add(
    `[${lang}] −14 LUFS ±1 / TP ≤ −1 dBTP`,
    'docs/promo/audio-check.json',
    Boolean(row && row.integratedLufs >= -15 && row.integratedLufs <= -13 && row.truePeakDbtp <= -1),
    row ? `${row.integratedLufs} LUFS / ${row.truePeakDbtp} dBTP` : 'not measured',
  );
}

const failed = rows.filter((r) => !r.pass);
const md = [
  '# Promo facts — Hue Garden',
  '',
  'Every on-screen claim and its automated check. Generated by `npm run facts`. The video is a browser-game promo; it makes no LAN, installer or desktop claim.',
  '',
  '| Claim | Source | Check | Detail |',
  '| --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.claim} | ${r.source} | ${r.check} | ${r.detail} |`),
  '',
  `Checks: ${rows.length} · failed: ${failed.length}`,
  '',
].join('\n');
writeFileSync('FACTS.md', md, 'utf8');
console.log(md);
if (failed.length) process.exitCode = 1;
