#!/usr/bin/env node
/** Scaffold the next 15 full-rules classics from templates/arcade. */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const template = path.join(root, 'templates', 'arcade');

export const GAMES = [
  ['gomoku', 'Gomoku', '五子棋', 5201, '15×15 freestyle five-in-a-row', 'Open threes and fours; threat-space search, 6-ply on Hard.'],
  ['xiangqi', 'Xiangqi', '中国象棋', 5202, '9×10 Chinese chess', 'Material, king safety, flying general, 4-ply search.'],
  ['chess', 'Chess', '国际象棋', 5203, 'Full FIDE chess', 'Material, piece-square tables, castling/en-passant, alpha-beta.'],
  ['go', 'Go', '围棋', 5204, '19×19 Go with 9×9/13×13', 'Liberty/influence plus playouts; komi 6.5/7.5, simple ko.'],
  ['shogi', 'Shogi', '将棋', 5205, '9×9 shogi with drops', 'Material, drop safety, promotion, 3-ply search.'],
  ['intl-draughts', 'International Draughts', '国际跳棋', 5206, '10×10 draughts', 'Mandatory maximum capture, flying kings, endgame search.'],
  ['jungle-chess', 'Jungle Chess', '斗兽棋', 5207, '7×9 jungle chess', 'Animal ranks, river, traps, den race.'],
  ['hearts', 'Hearts', '红心大战', 5208, '4-player hearts', 'Void tracking, passing, shoot-the-moon awareness.'],
  ['spades', 'Spades', '黑桃皇后', 5209, '4-player partnership spades', 'Bid estimation, partner cover, bag risk.'],
  ['rummy-500', 'Rummy 500', '五百分拉米', 5210, '2–4 player Rummy 500', 'Meld potential, lay-off, discard safety.'],
  ['cribbage', 'Cribbage', '克里比奇', 5211, '2–4 player cribbage', 'Hand EV, crib choice, pegging.'],
  ['abalone', 'Abalone', '大力士棋', 5212, '2-player Abalone', 'Push lanes, edge pressure, 3-marble sum.'],
  ['hive', 'Hive', '虫虫棋', 5213, '2-player Hive base set', 'Placement, pin/tempo, queen timing.'],
  ['quarto', 'Quarto', '四连棋', 5214, '2-player Quarto', 'Forced-piece search, attribute threats.'],
  ['president', 'President', '排位赛', 5215, '3–6 player President', 'Hand decomposition, control, pass timing.'],
];

for (const [slug, title, zh, port, description, ai] of GAMES) {
  const dest = path.join(root, 'apps', slug);
  if (existsSync(dest)) {
    console.log(`skip ${slug}`);
    continue;
  }
  cpSync(template, dest, { recursive: true });
  for (const dir of ['docs/screenshots/en', 'docs/screenshots/zh', 'docs/promo']) mkdirSync(path.join(dest, dir), { recursive: true });
  const replacements = [
    ['@family-arcade/triple', `@family-arcade/${slug}`],
    ['Triple — a tiny tic-tac-toe for family game night', description],
    ['familyarcade.triple', `familyarcade.${slug}`],
    ['com.familyarcade.triple', `com.familyarcade.${slug.replaceAll('-', '')}`],
    ['familyarcade-triple', `familyarcade-${slug}`],
    ['familyarcade_triple', `familyarcade_${slug.replaceAll('-', '_')}`],
    ['Triple failed to start', `${title} failed to start`],
    ['5180', String(port)],
    ['4180', String(port - 1000)],
    ['三连棋', zh],
    ['Three in a row. One small table.', description],
    ['Triple', title],
    ['triple', slug],
  ];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(json|ts|tsx|mjs|html|md|toml|css)$/.test(entry)) {
        let text = readFileSync(full, 'utf8');
        for (const [from, to] of replacements) text = text.split(from).join(to);
        writeFileSync(full, text);
      }
    }
  };
  walk(dest);
  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = `@family-arcade/${slug}`;
  pkg.description = description;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(
    path.join(dest, 'APP_BRIEF.md'),
    `# ${title} · ${zh}\n\n${description}\n\nAI: ${ai}\n\nFull requirements are in the repository root AGENT_BRIEF.md and docs/future-15.md. Implement the real rules, not a simplified variant. Keep the Tauri shell, LAN bridge and bilingual UI. Do not edit other apps.\n`,
  );
  console.log(`scaffolded ${slug}`);
}
