#!/usr/bin/env node
/** Build the hub's game index and copy thumbnails + portable executables. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const hub = path.join(root, 'apps', 'family-arcade');
const resources = path.join(hub, 'games');
const thumbs = path.join(hub, 'public', 'thumbs');
mkdirSync(resources, { recursive: true });
mkdirSync(thumbs, { recursive: true });

const extra = {
  'star-leap': ['Star Leap', '星跃', 'Ten glass marbles. One starry board.', '十颗玻璃珠，一片星空。', '2–4', '15–25 min', '7+', 'family', '#b05c43'],
  'sweet-carousel': ['Sweet Carousel', '甜点转盘', 'Pick one, pass it on.', '选一张，传下去。', '2–5', '15 min', '7+', 'family', '#c76d85'],
  'hue-garden': ['Hue Garden', '彩庭', 'A colour or a shape. One line at a time.', '颜色或形状，连成一条线。', '2–4', '20–30 min', '8+', 'family', '#5d8b78'],
  'field-and-wall': ['Field & Wall', '筑野', 'One field. One wall. One town.', '一块地，一座城。', '2–4', '30–35 min', '8+', 'family', '#9a7b47'],
  'balloon-rally': ['Balloon Rally', '气球大赛', 'Pick a balloon. Ride the wind.', '看准一只气球，跟着它飞。', '2–6', '20–25 min', '8+', 'family', '#c76d85'],
  blokus: ['Blokus', '角斗士棋', 'Claim a corner. Cut off the table.', '占住一角，把桌子围起来。', '2–4', '20–30 min', '7+', 'classic', '#3f7d6b'],
  splendor: ['Splendor', '宝石商人', 'Build an engine. Reach fifteen.', '搭起宝石引擎，先到十五分。', '2–4', '30 min', '8+', 'classic', '#b4634a'],
};

const timeZhMap = {
  'star-leap': '15–25 分钟',
  'sweet-carousel': '15 分钟',
  'hue-garden': '20–30 分钟',
  'field-and-wall': '30–35 分钟',
  'balloon-rally': '20–25 分钟',
  blokus: '20–30 分钟',
  splendor: '30 分钟',
};
const games = [];
for (const slug of readdirSync(path.join(root, 'apps'))) {
  const app = path.join(root, 'apps', slug);
  if (!existsSync(path.join(app, 'package.json')) || slug === 'family-arcade') continue;
  let data;
  let timeZh = '';
  const manifest = path.join(app, 'video.json');
  if (existsSync(manifest)) {
    const v = JSON.parse(readFileSync(manifest, 'utf8'));
    data = [v.title, v.titleZh, v.tagline, v.taglineZh, v.players.replace(' players', ''), v.time, v.age, 'arcade', v.accent];
    timeZh = v.timeZh || '';
  } else if (extra[slug]) {
    data = extra[slug];
    timeZh = timeZhMap[slug] || '';
  } else {
    continue;
  }
  const [title, zh, tagline, taglineZh, players, time, age, rawCategory, accent] = data;
  const category = ['blokus', 'splendor'].includes(slug)
    ? 'classic'
    : ['star-leap', 'sweet-carousel', 'hue-garden', 'field-and-wall', 'balloon-rally'].includes(slug)
      ? 'family'
      : rawCategory;
  const thumbCandidates = [
    path.join(app, 'docs', 'screenshots', 'en', 'game.jpg'),
    path.join(app, 'docs', 'screenshots', 'game.jpg'),
    path.join(app, 'docs', 'screenshots', 'en', 'game.png'),
    path.join(app, 'docs', 'screenshots', 'game.png'),
  ];
  const thumb = thumbCandidates.find((candidate) => existsSync(candidate));
  if (!thumb) {
    console.warn(`no thumb for ${slug}`);
    continue;
  }
  copyFileSync(thumb, path.join(thumbs, `${slug}.jpg`));
  games.push({
    slug,
    title,
    zh,
    tagline,
    taglineZh,
    players,
    time,
    timeZh: timeZh || time,
    age,
    category,
    accent,
    thumb: `thumbs/${slug}.jpg`,
  });
}

const order = ['blokus', 'splendor', 'star-leap', 'sweet-carousel', 'hue-garden', 'field-and-wall', 'balloon-rally'];
games.sort((a, b) => {
  const ai = order.indexOf(a.slug);
  const bi = order.indexOf(b.slug);
  if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  return a.title.localeCompare(b.title);
});

mkdirSync(path.join(hub, 'src', 'data'), { recursive: true });
writeFileSync(path.join(hub, 'src', 'data', 'games.json'), `${JSON.stringify(games, null, 2)}\n`);
console.log(`hub index: ${games.length} games`);

// Portable executables: copy <exe> + dist into games/<slug>/.
const cargoNames = {
  'star-leap': 'familyarcade-star-leap',
  'sweet-carousel': 'familyarcade-sweet-carousel',
  'hue-garden': 'familyarcade-hue-garden',
  'field-and-wall': 'familyarcade-field-and-wall',
  'balloon-rally': 'familyarcade-balloon-rally',
  blokus: 'blokus',
  splendor: 'splendor-desktop',
};
for (const game of games) {
  const cargo = cargoNames[game.slug] ?? `familyarcade-${game.slug}`;
  const exe = game.slug === 'blokus'
    ? path.join('T:', 'target-blokus', 'release', 'blokus.exe')
    : game.slug === 'splendor'
      ? path.join('T:', 'target-splendor', 'release', 'splendor-desktop.exe')
      : path.join('T:', 'target', 'release', `${cargo}.exe`);
  const sourceDist = path.join(root, 'apps', game.slug, 'dist');
  const dest = path.join(resources, game.slug);
  mkdirSync(dest, { recursive: true });
  if (existsSync(exe)) {
    copyFileSync(exe, path.join(dest, 'game.exe'));
    const loader = path.join(root, 'packages', 'runtime', 'WebView2Loader.dll');
    if (existsSync(loader)) copyFileSync(loader, path.join(dest, 'WebView2Loader.dll'));
  } else {
    console.warn(`missing portable exe for ${game.slug}: ${exe}`);
  }
  if (existsSync(sourceDist)) {
    const distDest = path.join(dest, 'dist');
    mkdirSync(distDest, { recursive: true });
    for (const entry of readdirSync(sourceDist)) {
      const source = path.join(sourceDist, entry);
      if (statSync(source).isDirectory()) {
        mkdirSync(path.join(distDest, entry), { recursive: true });
        for (const file of readdirSync(source)) copyFileSync(path.join(source, file), path.join(distDest, entry, file));
      } else {
        copyFileSync(source, path.join(distDest, entry));
      }
    }
  }
}
console.log('portable game folders prepared');
