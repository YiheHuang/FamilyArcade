#!/usr/bin/env node
/**
 * 卡牌数据定稿脚本
 *
 * 前置条件：data/sources/ 下 B/C/D/E 四份数据源（splendimax、seal256、goldenchicken、
 * anicolao 照片核对）必须在全部 90 张卡上完全一致；否则立即失败（不允许带分歧定稿）。
 * A:boardgamers 因存在约 45 处转录错误，不参与定稿（见 data/card-data-report.md）。
 *
 * 贵族：以 B/D 多数票要求为准（A 仅提供名称），并做名称配对修正：
 *  - A 源 "Anne of Brittany" 的要求（W3 G3 R3）为转录错误，修正为多数票的 W3 R3 K3。
 *
 * 输出（权威数据，引擎/前端/工具共用）：
 *   - packages/engine/src/data/cards.json
 *   - packages/engine/src/data/nobles.json
 *
 * 用法：node scripts/finalize-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLORS,
  LETTER,
  cost,
  costEquals,
  costStr,
  cardKey,
  sig,
  sameCard,
  rotate,
  parseBoardgamers,
  parseSplendimax,
  parseSplendimaxNobles,
  parseSeal256,
  parseGoldenchicken,
  parseAnicolao,
} from './lib/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'sources');
const DB = path.join(ROOT, 'packages', 'engine', 'src', 'data');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// ---------------- 1. 卡牌 ----------------

const cardSources = [
  { id: 'B:splendimax', ...parseSplendimax(read('splendimax-cards.csv')) },
  { id: 'C:seal256', ...parseSeal256(read('seal256-cards.csv')) },
  { id: 'D:goldenchicken', ...parseGoldenchicken(read('goldenchicken-cards.json')) },
  { id: 'E:anicolao', ...parseAnicolao(read('anicolao-verified.csv')) },
];

const allKeys = new Set();
for (const s of cardSources) for (const c of s.cards) allKeys.add(cardKey(c));

const cards = [];
const problems = [];
for (const key of allKeys) {
  const found = cardSources
    .map((s) => ({ id: s.id, cards: s.cards.filter((c) => cardKey(c) === key) }))
    .filter((e) => e.cards.length > 0);
  if (found.some((e) => e.cards.length > 1)) {
    problems.push(`卡槽 ${key} 在某源内重复`);
    continue;
  }
  if (found.length !== cardSources.length) {
    problems.push(`卡槽 ${key} 仅存在于 ${found.map((f) => f.id).join('、')}`);
    continue;
  }
  const first = found[0].cards[0];
  if (!found.every((e) => sameCard(e.cards[0], first))) {
    problems.push(
      `卡槽 ${key} 四源不一致：` + found.map((e) => `${e.id}=${costStr(e.cards[0])}`).join('；'),
    );
    continue;
  }
  cards.push({ tier: first.tier, bonus: first.bonus, points: first.points, cost: first.cost });
}

if (problems.length) {
  console.error('❌ 定稿失败，存在未解决的分歧/结构问题：');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
if (cards.length !== 90) {
  console.error(`❌ 定稿失败：卡牌总数 ${cards.length} ≠ 90`);
  process.exit(1);
}

// 稳定排序 + 编号
cards.sort(
  (a, b) =>
    a.tier - b.tier ||
    COLORS.indexOf(a.bonus) - COLORS.indexOf(b.bonus) ||
    b.points - a.points ||
    COLORS.map((c) => b.cost[c] || 0).join(',') .localeCompare(COLORS.map((c) => a.cost[c] || 0).join(',')),
);
const cardsOut = cards.map((c, i) => ({
  id: i,
  tier: c.tier,
  bonus: c.bonus,
  points: c.points,
  cost: { white: c.cost.white, blue: c.cost.blue, green: c.cost.green, red: c.cost.red, black: c.cost.black },
}));

// ---------------- 2. 贵族 ----------------

const nobleSources = [
  { id: 'A:boardgamers', ...parseBoardgamers(read('boardgamers-data.ts.txt')) },
  { id: 'D:goldenchicken', ...parseGoldenchicken(read('goldenchicken-cards.json')) },
];
nobleSources.unshift({ id: 'B:splendimax', nobles: parseSplendimaxNobles(read('splendimax-noble.rs.txt')) });

const reqKey = (r) => COLORS.filter((c) => r[c] > 0).map((c) => `${LETTER[c]}${r[c]}`).join(' ');
const reqVotes = new Map();
for (const s of nobleSources) {
  for (const n of s.nobles ?? []) {
    const k = reqKey(n.req);
    if (!reqVotes.has(k)) reqVotes.set(k, { req: n.req, votes: [] });
    reqVotes.get(k).votes.push(s.id);
  }
}
// 4+4 与 3+3+3 各 5 张，取 >=2 票；同时记录 A 的名称
const aNames = new Map(
  (nobleSources.find((s) => s.id.startsWith('A'))?.nobles ?? []).map((n) => [reqKey(n.req), n.name]),
);
const majority = [...reqVotes.entries()]
  .filter(([, v]) => v.votes.length >= 2)
  .map(([k, v]) => ({ k, req: v.req, votes: v.votes, name: aNames.get(k) ?? null }));
if (majority.length !== 10) {
  console.error(`❌ 贵族定稿失败：多数票要求共 ${majority.length} 条 ≠ 10`);
  process.exit(1);
}
const unassignedName = [...aNames.entries()].find(([k]) => !majority.some((m) => m.k === k));
if (unassignedName) {
  const nameless = majority.find((m) => !m.name);
  if (nameless) {
    nameless.name = unassignedName[1];
    console.log(
      `ℹ️ 名称配对修正：A 源「${unassignedName[1]}」的要求 ${unassignedName[0]} 为转录错误，` +
        `已按 B/D 多数票修正为 ${nameless.k}`,
    );
  }
}
if (majority.some((m) => !m.name)) {
  console.error('❌ 贵族定稿失败：存在无名称的贵族');
  process.exit(1);
}

// 稳定排序：4+4 在前，再 3+3+3；组内按颜色向量
const nobleKind = (r) => COLORS.filter((c) => r[c] > 0).length;
majority.sort((a, b) => {
  const ka = nobleKind(a.req);
  const kb = nobleKind(b.req);
  if (ka !== kb) return ka - kb;
  for (const c of COLORS) {
    const d = (b.req[c] || 0) - (a.req[c] || 0);
    if (d) return d;
  }
  return 0;
});
const noblesOut = majority.map((m, i) => ({
  id: i,
  name: m.name,
  points: 3,
  requirement: {
    white: m.req.white,
    blue: m.req.blue,
    green: m.req.green,
    red: m.req.red,
    black: m.req.black,
  },
}));

// ---------------- 3. 写入 ----------------

fs.mkdirSync(DB, { recursive: true });
const provenance =
  'B:splendimax / C:seal256 / D:goldenchicken / E:anicolao(实体卡照片识别并人工核对) 四源零分歧；' +
  '并经实体卡高清照片目视抽查复核。详见 data/card-data-report.md。';
fs.writeFileSync(
  path.join(DB, 'cards.json'),
  JSON.stringify({ version: 1, provenance, cards: cardsOut }, null, 2) + '\n',
  'utf8',
);
fs.writeFileSync(
  path.join(DB, 'nobles.json'),
  JSON.stringify(
    {
      version: 1,
      provenance:
        '要求：B/D 多数票（A 源 Anne of Brittany 要求为转录错误已修正为 W3 R3 K3）；名称取自 A 源。' +
        '5 张 4+4 与 5 张 3+3+3 均构成完整旋转轨道。详见 data/card-data-report.md。',
      nobles: noblesOut,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

// 供引擎直接引用（Node ESM 无法直接 import JSON，故同时生成 TS 模块；两者由本脚本同源生成）
fs.writeFileSync(
  path.join(DB, 'cards.ts'),
  `// 由 scripts/finalize-data.mjs 生成，请勿手改。来源与核对过程见 data/card-data-report.md。\n` +
    `import type { CardDef } from '../types.js';\n\n` +
    `export const CARDS_DATA: CardDef[] = ${JSON.stringify(cardsOut, null, 2)};\n`,
  'utf8',
);
fs.writeFileSync(
  path.join(DB, 'nobles.ts'),
  `// 由 scripts/finalize-data.mjs 生成，请勿手改。来源与核对过程见 data/card-data-report.md。\n` +
    `import type { NobleDef } from '../types.js';\n\n` +
    `export const NOBLES_DATA: NobleDef[] = ${JSON.stringify(noblesOut, null, 2)};\n`,
  'utf8',
);

// ---------------- 4. 统计输出 ----------------

const byTier = { 1: 0, 2: 0, 3: 0 };
for (const c of cardsOut) byTier[c.tier]++;
const propByKey = new Map(cardsOut.map((c) => [cardKey(c), c]));
const seen = new Set();
let orbits = 0;
let closed = 0;
for (const p of cardsOut) {
  if (seen.has(cardKey(p))) continue;
  orbits++;
  let cur = p;
  let ok = false;
  for (let i = 0; i < 5; i++) {
    const found = propByKey.get(cardKey(cur));
    if (!found || !sameCard(found, cur)) break;
    seen.add(cardKey(found));
    cur = rotate(found);
    if (i === 4) ok = sameCard(cur, p);
  }
  if (ok) closed++;
}

console.log('✅ 定稿完成');
console.log(`卡牌：${cardsOut.length} 张（T1=${byTier[1]} / T2=${byTier[2]} / T3=${byTier[3]}）`);
console.log(`旋转轨道：${orbits} 条，其中完全闭合 ${closed} 条（官方牌组存在真实不对称，未闭合属正常）`);
console.log(`贵族：${noblesOut.length} 张`);
for (const n of noblesOut) console.log(`  - ${n.name}: ${reqKey(n.requirement)}`);
console.log(`已写入 packages/engine/src/data/cards.json 与 nobles.json`);
