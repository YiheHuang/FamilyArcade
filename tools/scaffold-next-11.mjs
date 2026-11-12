#!/usr/bin/env node
/** Scaffold the next 11 card, tile and word games from templates/arcade. */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const template = path.join(root, 'templates', 'arcade');

const GAMES = [
  {
    slug: 'doudizhu',
    title: 'Dou Dizhu',
    product: 'Dou Dizhu',
    zh: '斗地主',
    port: 5216,
    lan: 19016,
    players: '3',
    description: '3-player Dou Dizhu with bidding, bombs and spring',
    section: '1',
    ai: 'hand decomposition, combo preservation, bomb timing, farmer cooperation',
  },
  {
    slug: 'texas-holdem',
    title: "Texas Hold'em",
    product: 'Texas Holdem',
    zh: '德州扑克',
    port: 5217,
    lan: 19017,
    players: '2–6',
    description: "No-limit Texas Hold'em for 2–6 players",
    section: '2',
    ai: 'hand strength, pot odds, position, stack pressure, honest bluffs',
  },
  {
    slug: 'zheng-shangyou',
    title: 'Zheng Shangyou',
    product: 'Zheng Shangyou',
    zh: '争上游',
    port: 5218,
    lan: 19018,
    players: '3–6',
    description: 'Chinese climbing game for 3–6 players',
    section: '3',
    ai: 'combo decomposition, control cards, tribute choice, endgame aggression',
  },
  {
    slug: 'jokers-table',
    title: "Joker's Table",
    product: 'Jokers Table',
    zh: '小丑牌桌',
    port: 5219,
    lan: 19019,
    players: '1–4',
    description: 'An original poker roguelike with original jokers',
    section: '4',
    ai: 'rival runs: joker synergy, hand EV, shop discipline, risk at low hearts',
  },
  {
    slug: 'guandan',
    title: 'Guandan',
    product: 'Guandan',
    zh: '掼蛋',
    port: 5220,
    lan: 19020,
    players: '4',
    description: '4-player partnership climbing with two decks',
    section: '5',
    ai: 'partnership, level-card wilds, bomb economy, tribute choices',
  },
  {
    slug: 'mahjong',
    title: 'Mahjong',
    product: 'Mahjong',
    zh: '麻将',
    port: 5221,
    lan: 19021,
    players: '4',
    description: '4-player Chinese Mahjong with 136 tiles',
    section: '6',
    ai: 'shanten, tile efficiency, visible-tile counting, defence, meld decisions',
  },
  {
    slug: 'big-two',
    title: 'Big Two',
    product: 'Big Two',
    zh: '大老二',
    port: 5222,
    lan: 19022,
    players: '4',
    description: '4-player Big Two with poker hand rankings',
    section: '7',
    ai: 'hand decomposition, suit control, endgame counting, safe leads',
  },
  {
    slug: 'sheng-ji',
    title: 'Sheng Ji',
    product: 'Sheng Ji',
    zh: '升级',
    port: 5223,
    lan: 19023,
    players: '4',
    description: '4-player partnership trick-taking with trump and points',
    section: '8',
    ai: 'bid strength, trump control, point tracking, partner cover, throw safety',
  },
  {
    slug: 'liars-dice',
    title: "Liar's Dice",
    product: 'Liars Dice',
    zh: '吹牛骰',
    port: 5224,
    lan: 19024,
    players: '2–6',
    description: 'Bluffing dice for 2–6 players',
    section: '9',
    ai: 'probability, bid legality, bluff frequency, opponent modelling',
  },
  {
    slug: 'idiom-chain',
    title: 'Idiom Chain',
    product: 'Idiom Chain',
    zh: '成语接龙',
    port: 5225,
    lan: 19025,
    players: '2–6',
    description: 'Chinese idiom chain for 2–6 players',
    section: '10',
    ai: 'dictionary search by first character, difficulty by idiom frequency and length',
  },
  {
    slug: 'nanchang-mahjong',
    title: 'Nanchang Mahjong',
    product: 'Nanchang Mahjong',
    zh: '南昌麻将',
    port: 5226,
    lan: 19026,
    players: '4',
    description: '4-player Nanchang Mahjong with spirit tiles',
    section: '11',
    ai: 'wild-tile efficiency, thirteen-scattered detection, spirit counting, defence',
  },
];

for (const game of GAMES) {
  const { slug, title, product, zh, port, lan, players, description, section, ai } = game;
  const dest = path.join(root, 'apps', slug);
  if (existsSync(dest)) {
    console.log(`skip ${slug}`);
    continue;
  }
  cpSync(template, dest, { recursive: true });
  for (const dir of ['docs/screenshots/en', 'docs/screenshots/zh', 'docs/promo']) {
    mkdirSync(path.join(dest, dir), { recursive: true });
  }
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
    ['Triple · 三连棋', `${product} · ${zh}`],
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
  pkg.scripts['lan:e2e'] = `node scripts/lan-e2e.mjs`;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  writeFileSync(
    path.join(dest, 'APP_BRIEF.md'),
    `# ${title} · ${zh}

${description}. ${players} players.

Read \`docs/next-11.md\` section ${section} for the complete rule contract, and
\`AGENT_BRIEF.md\` for the shared delivery contract. Implement the real rules, not a
simplified variant. Where the source rules leave a family-table choice, make it an
explicit option and document it.

AI focus: ${ai}.

Non-negotiables:

- Pure engine in \`src/game/\` with injected RNG; at least 25 meaningful tests.
- Four AI levels: Companion, Easy, Normal, Hard.
- Solo against AI, hot-seat with privacy, and LAN host/guest with per-seat views.
- Undo, reasoned hint, autosave/resume, family record, sound toggle, reduced motion,
  keyboard path and mobile layout.
- Separate English and Chinese UI. The English UI may contain Chinese only on the
  language switch; the Chinese UI may contain English only on the switch and
  technical card/tile names.
- No explanatory subtitle under headings. Keep the screens clean.
- Real screenshots in \`docs/screenshots/{en,zh}\` (1440×1000 desktop, 780×1688
  mobile), bilingual README files, \`docs/rules.md\`, \`docs/limitations.md\`,
  \`NOTICE.md\` and \`video.json\`.
- LAN E2E must use \`LAN_PORT=${lan}\` (or a free port) and stop its relay afterwards.
- Keep the shared \`family_arcade_lan_host\` crate name in \`src-tauri/src/main.rs\`.
- Do not run Tauri/cargo builds, and do not edit other apps or root files.
`,
  );
  console.log(`scaffolded ${slug} (port ${port}, LAN ${lan})`);
}
