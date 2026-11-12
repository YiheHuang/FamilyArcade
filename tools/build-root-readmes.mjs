#!/usr/bin/env node
/** Generate separate English and Chinese root READMEs (no mixed copy). */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const repo = 'https://github.com/YiheHuang/FamilyArcade';
const hubUrl = `${repo}/releases/download/family-arcade-v1.0.1/FamilyArcade_1.0.1_x64-setup.exe`;
const webviewUrl = `${repo}/releases/download/webview2-runtime-v1.0.0/MicrosoftEdgeWebView2RuntimeInstallerX64.exe`;

const extra = {
  blokus: ['Blokus', '角斗士棋', '2–4', '20–30', '20–30 分钟', '7+', 'classic', 'apps/blokus/docs/screenshots/game.jpg', 'apps/blokus/docs/promo/blokus-promo', 'blokus-v1.7.1', 'blokus_1.7.1_x64-setup.exe', 'apps/blokus/README.md'],
  splendor: ['Splendor', '宝石商人', '2–4', '30', '30 分钟', '8+', 'classic', 'apps/splendor/docs/screenshots/en/game.jpg', 'apps/splendor/docs/promo/splendor-promo', 'splendor-v2.5.0', 'splendor_2.5.0_x64-setup.exe', 'apps/splendor/README.md'],
  'star-leap': ['Star Leap', '星跃', '2–4', '15–25', '15–25 分钟', '7+', 'family', 'apps/star-leap/docs/screenshots/en/game.jpg', 'apps/star-leap/docs/promo/star-leap-promo', 'star-leap-v0.2.0', 'star-leap_0.2.0_x64-setup.exe', 'apps/star-leap/README.md'],
  'sweet-carousel': ['Sweet Carousel', '甜点转盘', '2–5', '15', '15 分钟', '7+', 'family', 'apps/sweet-carousel/docs/screenshots/en/game.jpg', 'apps/sweet-carousel/docs/promo/sweet-carousel-promo', 'sweet-carousel-v0.1.0', 'sweet-carousel_0.1.0_x64-setup.exe', 'apps/sweet-carousel/README.md'],
  'hue-garden': ['Hue Garden', '彩庭', '2–4', '20–30', '20–30 分钟', '8+', 'family', 'apps/hue-garden/docs/screenshots/en/game.jpg', 'apps/hue-garden/docs/promo/hue-garden-promo', 'hue-garden-v0.1.0', 'hue-garden_0.1.0_x64-setup.exe', 'apps/hue-garden/README.md'],
  'field-and-wall': ['Field & Wall', '筑野', '2–4', '30–35', '30–35 分钟', '8+', 'family', 'apps/field-and-wall/docs/screenshots/en/game.jpg', 'apps/field-and-wall/docs/promo/field-and-wall-promo', 'field-and-wall-v0.1.0', 'field-and-wall_0.1.0_x64-setup.exe', 'apps/field-and-wall/README.md'],
  'balloon-rally': ['Balloon Rally', '气球大赛', '2–6', '20–25', '20–25 分钟', '8+', 'family', 'apps/balloon-rally/docs/screenshots/en/game.jpg', 'apps/balloon-rally/docs/promo/balloon-rally-promo', 'balloon-rally-v0.1.0', 'balloon-rally_0.1.0_x64-setup.exe', 'apps/balloon-rally/README.md'],
};

const games = [];
for (const [slug, data] of Object.entries(extra)) {
  const [title, zh, players, time, timeZh, age, category, shot, promo, tag, asset, readme] = data;
  games.push({ slug, title, zh, players, time, timeZh, age, category, shot, video: `${promo}-en.mp4`, videoZh: `${promo}-zh.mp4`, installer: `${repo}/releases/download/${tag}/${asset}`, readme });
}
const order = ['triple','four','flip','draughts','mill','boxes','sowing','tables','race-home','ladder-run','pair-up','domino-line','color-chain','five-dice','fleet','codebreak','triple-find','little-go','mini-chess','hex'];
for (const slug of order) {
  const manifest = path.join(root, 'apps', slug, 'video.json');
  if (!existsSync(manifest)) continue;
  const v = JSON.parse(readFileSync(manifest, 'utf8'));
  games.push({
    slug,
    title: v.title,
    zh: v.titleZh,
    players: v.players.replace(' players', ''),
    time: v.time.replace(' minutes', ''),
    timeZh: v.timeZh,
    age: v.age,
    category: 'arcade',
    shot: `apps/${slug}/docs/screenshots/en/game.jpg`,
    video: `apps/${slug}/docs/promo/${slug}-promo-en.mp4`,
    videoZh: `apps/${slug}/docs/promo/${slug}-promo-zh.mp4`,
    installer: `${repo}/releases/download/${slug}-v${v.version ?? '0.1.0'}/${slug}_${v.version ?? '0.1.0'}_x64-setup.exe`,
    readme: `apps/${slug}/README.md`,
  });
}

function card(game, lang) {
  const title = lang === 'zh' ? game.zh : game.title;
  const time = lang === 'zh' ? game.timeZh : `${game.time} min`;
  const players = lang === 'zh' ? `${game.players} 人` : `${game.players} players`;
  const trailer = lang === 'zh' ? game.videoZh : game.video;
  const age = lang === 'zh' ? `${game.age} 岁+` : `ages ${game.age}`;
  return `<td width="25%" valign="top">
<a href="${trailer}"><img src="${game.shot}" width="100%" alt="${title}"></a>

**[${title}](${game.readme})**

<sub>${players} · ${time} · ${age}</sub>

<sub>[${lang === 'zh' ? '宣传片' : 'Trailer'}](${trailer}) · [${lang === 'zh' ? '安装包' : 'Installer'}](${game.installer})</sub>
</td>`;
}

function grid(list, lang) {
  const rows = [];
  for (let i = 0; i < list.length; i += 4) {
    rows.push(`<tr>${list.slice(i, i + 4).map((game) => card(game, lang)).join('\n')}</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

const classics = games.filter((g) => g.category === 'classic');
const family = games.filter((g) => g.category === 'family');
const arcade = games.filter((g) => g.category === 'arcade');

const en = `English · [简体中文](README.zh-CN.md)

# Family Arcade

**27 offline family games. AI, hot-seat and LAN in every game.**

[![Watch the 37-second tour](docs/cover.png)](docs/tour.mp4)

[![Family Arcade launcher](apps/family-arcade/docs/screenshots/en/home.jpg)](${hubUrl})

**All-in-one:** [Family Arcade 1.0.1](${hubUrl}) · **WebView2 runtime (only if needed):** [offline x64](${webviewUrl})

## Classics

${grid(classics, 'en')}

## Family table

${grid(family, 'en')}

## Arcade

${grid(arcade, 'en')}

## Releases

Every game has a separate installer under [Releases](${repo}/releases). The all-in-one
installer includes the launcher, all 27 games and the WebView2 runtime. Individual
installers are 1–4 MB. See each game README for rules, LAN and limitations.

## Build

\`\`\`bash
cd apps/triple
npm install
npm run check
node scripts/e2e.mjs
\`\`\`

The shared promo studio is in \`video/\`. The launcher is in \`apps/family-arcade/\`.

## License

MIT code; original art/copy. See [NOTICE.md](NOTICE.md).
`;

const zh = `[English](README.md) · 简体中文

# 家庭游戏馆

**27 款离线家庭游戏。每一款都有 AI、同屏热座和局域网。**

[![观看 37 秒总览](docs/cover.png)](docs/tour.mp4)

[![家庭游戏馆启动器](apps/family-arcade/docs/screenshots/zh/home.jpg)](${hubUrl})

**一体化安装包：** [Family Arcade 1.0.1](${hubUrl}) · **WebView2 运行时（仅在需要时）：** [离线 x64](${webviewUrl})

## 经典

${grid(classics, 'zh')}

## 家庭牌桌

${grid(family, 'zh')}

## 小游戏

${grid(arcade, 'zh')}

## 发布

每款游戏在 [Releases](${repo}/releases) 有独立安装包。一体化安装包包含启动器、27 款游戏和 WebView2 运行时；单游戏安装包约 1–4 MB。规则、局域网和限制见各游戏 README。

## 构建

\`\`\`bash
cd apps/triple
npm install
npm run check
node scripts/e2e.mjs
\`\`\`

共享宣传片工程在 \`video/\`，启动器在 \`apps/family-arcade/\`。

## 许可

代码 MIT，原创美术与文案。见 [NOTICE.md](NOTICE.md)。
`;

writeFileSync(path.join(root, 'README.md'), en);
writeFileSync(path.join(root, 'README.zh-CN.md'), zh);
console.log(`root readmes: ${games.length} games`);
