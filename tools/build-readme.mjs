#!/usr/bin/env node
/** Generate the single root README from per-game metadata and manifests. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const apps = path.join(root, 'apps');

const existing = {
  'star-leap': {
    title: 'Star Leap',
    zh: '星跃',
    tagline: 'Ten glass marbles. One starry board.',
    taglineZh: '十颗玻璃珠，一片星空。',
    players: '2–4',
    time: '15–25 min',
    age: '7+',
    blurb: 'Chinese Checkers with four AI levels, hints, replay and a midnight board.',
    blurbZh: '中国跳棋：四档 AI、提示、复盘和一张午夜星盘。',
    poster: 'apps/star-leap/docs/screenshots/en/game.jpg',
    video: 'apps/star-leap/docs/promo/star-leap-promo-en.mp4',
    videoZh: 'apps/star-leap/docs/promo/star-leap-promo-zh.mp4',
    readme: 'apps/star-leap/README.md',
  },
  'sweet-carousel': {
    title: 'Sweet Carousel',
    zh: '甜点转盘',
    tagline: 'Pick one, pass it on.',
    taglineZh: '选一张，传下去。',
    players: '2–5',
    time: '15 min',
    age: '7+',
    blurb: 'A 72-card dessert draft with privacy covers, crowns and four AI levels.',
    blurbZh: '72 张甜点轮抽：隐私遮罩、人气王和四档 AI。',
    poster: 'apps/sweet-carousel/docs/screenshots/en/game.jpg',
    video: 'apps/sweet-carousel/docs/promo/sweet-carousel-promo-en.mp4',
    videoZh: 'apps/sweet-carousel/docs/promo/sweet-carousel-promo-zh.mp4',
    readme: 'apps/sweet-carousel/README.md',
  },
  'hue-garden': {
    title: 'Hue Garden',
    zh: '彩庭',
    tagline: 'A colour or a shape. One line at a time.',
    taglineZh: '颜色或形状，连成一条线。',
    players: '2–4',
    time: '20–30 min',
    age: '8+',
    blurb: '108 glazed tiles, six shapes, six-in-a-row blooms and a quiet courtyard.',
    blurbZh: '108 张釉面瓷砖、六种形状、六连开花的小庭院。',
    poster: 'apps/hue-garden/docs/screenshots/en/game.jpg',
    video: 'apps/hue-garden/docs/promo/hue-garden-promo-en.mp4',
    videoZh: 'apps/hue-garden/docs/promo/hue-garden-promo-zh.mp4',
    readme: 'apps/hue-garden/README.md',
  },
  'field-and-wall': {
    title: 'Field & Wall',
    zh: '筑野',
    tagline: 'One field. One wall. One town.',
    taglineZh: '一块地，一座城。',
    players: '2–4',
    time: '30–35 min',
    age: '8+',
    blurb: '54 original tiles, wooden meeples, city/road/monastery scoring; no farms yet.',
    blurbZh: '54 张原创瓷砖、木人、城市/道路/修道院计分；暂不含农田。',
    poster: 'apps/field-and-wall/docs/screenshots/en/game.jpg',
    video: 'apps/field-and-wall/docs/promo/field-and-wall-promo-en.mp4',
    videoZh: 'apps/field-and-wall/docs/promo/field-and-wall-promo-zh.mp4',
    readme: 'apps/field-and-wall/README.md',
  },
  'balloon-rally': {
    title: 'Balloon Rally',
    zh: '气球大赛',
    tagline: 'Pick a balloon. Ride the wind.',
    taglineZh: '看准一只气球，跟着它飞。',
    players: '2–6',
    time: '20–25 min',
    age: '8+',
    blurb: 'Five paper balloons, four rounds of wind, and a whole table guessing together.',
    blurbZh: '五只纸气球、四轮风、全桌一起猜。',
    poster: 'apps/balloon-rally/docs/screenshots/en/game.jpg',
    video: 'apps/balloon-rally/docs/promo/balloon-rally-promo-en.mp4',
    videoZh: 'apps/balloon-rally/docs/promo/balloon-rally-promo-zh.mp4',
    readme: 'apps/balloon-rally/README.md',
  },
  blokus: {
    title: 'Blokus',
    zh: '角斗士棋',
    tagline: 'Claim a corner. Cut off the table.',
    taglineZh: '占住一角，把桌子围起来。',
    players: '2–4',
    time: '20–30 min',
    age: '7+',
    blurb: 'The classic corner-and-edge block game, with three AI levels and LAN from a phone.',
    blurbZh: '经典角对角拼放：三档 AI，手机可直接加入局域网。',
    poster: 'apps/blokus/docs/screenshots/game.jpg',
    video: 'apps/blokus/docs/promo/blokus-promo-en.mp4',
    videoZh: 'apps/blokus/docs/promo/blokus-promo-zh.mp4',
    readme: 'apps/blokus/README.md',
  },
  splendor: {
    title: 'Splendor',
    zh: '宝石商人',
    tagline: 'Build an engine. Reach fifteen.',
    taglineZh: '搭起宝石引擎，先到十五分。',
    players: '2–4',
    time: '30 min',
    age: '8+',
    blurb: 'The family edition with four AI personalities, LAN rooms and a 3.6 MB desktop app.',
    blurbZh: '家庭版宝石商人：四档 AI、局域网房间和 3.6 MB 桌面应用。',
    poster: 'apps/splendor/docs/screenshots/en/game.jpg',
    video: 'apps/splendor/docs/promo/splendor-promo-en.mp4',
    videoZh: 'apps/splendor/docs/promo/splendor-promo-zh.mp4',
    readme: 'apps/splendor/README.md',
  },
};

const arcadeOrder = [
  'triple',
  'four',
  'flip',
  'draughts',
  'mill',
  'boxes',
  'sowing',
  'tables',
  'race-home',
  'ladder-run',
  'pair-up',
  'domino-line',
  'color-chain',
  'five-dice',
  'fleet',
  'codebreak',
  'triple-find',
  'little-go',
  'mini-chess',
  'hex',
];

function versionOf(slug) {
  const conf =
    slug === 'splendor'
      ? path.join(apps, slug, 'packages', 'desktop', 'src-tauri', 'tauri.conf.json')
      : path.join(apps, slug, 'src-tauri', 'tauri.conf.json');
  if (existsSync(conf)) return JSON.parse(readFileSync(conf, 'utf8')).version ?? '0.1.0';
  return JSON.parse(readFileSync(path.join(apps, slug, 'package.json'), 'utf8')).version ?? '0.1.0';
}

function installer(slug) {
  const version = versionOf(slug);
  return `https://github.com/YiheHuang/FamilyArcade/releases/download/${slug}-v${version}/${slug}_${version}_x64-setup.exe`;
}

const games = [];
for (const [slug, meta] of Object.entries(existing)) {
  games.push({ slug, ...meta, version: versionOf(slug), installer: installer(slug) });
}
for (const slug of arcadeOrder) {
  const manifestPath = path.join(apps, slug, 'video.json');
  if (!existsSync(manifestPath)) continue;
  const v = JSON.parse(readFileSync(manifestPath, 'utf8'));
  games.push({
    slug,
    title: v.title,
    zh: v.titleZh,
    tagline: v.tagline,
    taglineZh: v.taglineZh,
    players: v.players.replace(' players', ''),
    time: v.time,
    age: v.age,
    blurb: v.facts.slice(0, 2).join(' · '),
    blurbZh: v.factsZh.slice(0, 2).join(' · '),
    poster: `apps/${slug}/docs/screenshots/en/game.jpg`,
    video: `apps/${slug}/docs/promo/${slug}-promo-en.mp4`,
    videoZh: `apps/${slug}/docs/promo/${slug}-promo-zh.mp4`,
    readme: `apps/${slug}/README.md`,
    version: versionOf(slug),
    installer: installer(slug),
  });
}

const classic = games.filter((g) => ['blokus', 'splendor'].includes(g.slug));
const family = games.filter((g) => ['star-leap', 'sweet-carousel', 'hue-garden', 'field-and-wall', 'balloon-rally'].includes(g.slug));
const arcade = games.filter((g) => arcadeOrder.includes(g.slug));

function card(game) {
  const missing = existsSync(path.join(root, game.video)) ? '' : ' (video rendering)';
  return `<td width="25%" valign="top">
<a href="${game.video}"><img src="${game.poster}" width="100%" alt="${game.title}"></a>

**[${game.title} · ${game.zh}](${game.readme})**${missing}

<sub>${game.players} players · ${game.time} · ages ${game.age}</sub>

${game.blurb}

<sub>${game.blurbZh}</sub>

<sub>[English trailer](${game.video}) · [中文成片](${game.videoZh}) · [installer](${game.installer})</sub>
</td>`;
}

function grid(list) {
  const rows = [];
  for (let i = 0; i < list.length; i += 4) {
    rows.push(`<tr>${list.slice(i, i + 4).map(card).join('\n')}</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

const totalTests = '1,000+';
const readme = `# Family Arcade · 家庭游戏馆

**27 small, offline family games in one repository.** Every game has a single-screen
hot-seat mode, four (or three) AI levels, a real LAN room where phones join from a
browser, a 45–54-second bilingual promo, and its own lightweight Windows installer.

**27 款小巧、离线的家庭游戏，共用一个仓库。** 每一款都有同屏热座、AI、真正的局域网房间
（手机浏览器直接加入）、45–54 秒中英宣传片，以及独立的轻量 Windows 安装包。

[![Watch the 37-second tour](docs/cover.png)](docs/tour.mp4)

*37-second tour · every clip is real gameplay · [full videos below](#the-classics--两款经典)*

[![Family Arcade launcher](apps/family-arcade/docs/screenshots/en/home.jpg)](https://github.com/YiheHuang/FamilyArcade/releases/download/family-arcade-v1.0.2/FamilyArcade_1.0.2_x64-setup.exe)

**All-in-one Windows app:** [Family Arcade 1.0 launcher](https://github.com/YiheHuang/FamilyArcade/releases/download/family-arcade-v1.0.2/FamilyArcade_1.0.2_x64-setup.exe) — every game and the WebView2 runtime in one installer. Per-game installers are linked under each card.
**WebView2 runtime (only if a single-game installer asks):** [offline x64 installer](https://github.com/YiheHuang/FamilyArcade/releases/download/webview2-runtime-v1.0.0/MicrosoftEdgeWebView2RuntimeInstallerX64.exe)


**2–6 players · ages 6+ · no account · no ads · no telemetry · per-game installers under 4 MB · all-in-one launcher 299 MB (includes WebView2 runtime)**

## The classics · 两款经典

${grid(classic)}

## The family table · 家庭牌桌

${grid(family)}

## The arcade · 二十款小游戏

${grid(arcade)}

## One repository, 27 releases

Each game is a standalone app under \`apps/<slug>/\`. Releases are **per game**, not one
giant bundle:

- [\`releases/\`](releases/) contains one NSIS installer per game (\`<slug>_<version>_x64-setup.exe\`).
- \`.github/workflows/release.yml\` rebuilds the same matrix on a version tag.
- Every installer contains the game, its built web app and the embedded LAN relay.
- The Windows build is unsigned; SmartScreen will ask once. WebView2 uses the standard
  bootstrapper.

## What “finished” means here

| Gate | Result |
| --- | --- |
| Rules engines | Pure, deterministic, no DOM/network/clock/\`Math.random\` |
| Tests | **${totalTests}** unit/integration tests across 27 apps |
| Browser E2E | Playwright: solo, hot-seat, undo, resume, mobile, LAN |
| AI | Companion / Easy / Normal / Hard (Blokus has three) |
| LAN | Host-authoritative rooms, 4-digit code, QR invite, reconnect tokens |
| Video | 45–54 s, 1920×1080, 60 fps, H.264/AAC, EN + ZH, loudness-mastered |
| Readme | Bilingual, real screenshots, five-second rules, honest limitations |
| Installer | Per-game Tauri NSIS, current-user install, no admin |

## Run a game

\`\`\`bash
cd apps/triple
npm install
npm run dev            # browser
npm run lan            # local relay for phone guests (serves dist/)
npm run check          # tsc + tests + production build
node scripts/e2e.mjs   # real Chrome; start npm run dev first
\`\`\`

Desktop build:

\`\`\`bash
cd apps/triple
npm install
npx tauri build --bundles nsis
\`\`\`

## LAN in one paragraph

The host starts the embedded relay and keeps the authoritative game state. Guests open
the host's LAN address (or scan the QR code) on a phone; the relay is only a message bus.
Each guest sends intents, the host validates and applies them through the same pure
engine, and hidden-information games send each seat only its own filtered view. No
accounts, no cloud, no internet.

## The promo studio

All arcade promos are rendered from one Remotion project:

\`\`\`bash
cd video
npm install
npm run collect     # screenshots + 336 voice clips + SRTs
npm run render      # 42 cuts, 4 jobs at a time
npm run master      # loudnorm + posters -> apps/*/docs/promo/
\`\`\`

Star Leap, Sweet Carousel, Hue Garden, Field & Wall, Balloon Rally and Splendor keep
their bespoke promo projects. Every video links back to the game's own README and
\`FACTS\`/script.

## Repository map

\`\`\`
apps/            27 games, each with src/, tests/, docs/, src-tauri/, video.json
packages/lan/    shared host/guest WebSocket protocol
crates/lan-host/ shared Rust static server + WebSocket relay
video/           shared Remotion promo studio
tools/           scaffolder, LAN relay, installer builder, README builder
releases/        per-game NSIS installers and build logs
docs/            cover and shared screenshots
\`\`\`

## Honest limits

- LAN is IPv4 on the same Wi-Fi/subnet. No internet matchmaking, spectators or cloud
  saves. A 4-digit room code is a family filter, not cryptographic security.
- Blokus, Splendor and the five original games keep their existing feature sets; the
  arcade games are smaller by design.
- The installers are unsigned and built locally. SmartScreen will warn.
- AI strength varies by game; each README states what its Hard level actually does.
- Physical-phone testing is limited to the LAN E2E and browser device emulation.

## License

Code MIT, original art/copy MIT or CC BY 4.0 as noted per game. Every game is an
independent, non-commercial family project; trademarks belong to their owners.
`;

writeFileSync(path.join(root, 'README.md'), readme);
console.log(`wrote README.md with ${games.length} games`);
