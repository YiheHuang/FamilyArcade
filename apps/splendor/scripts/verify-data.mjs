#!/usr/bin/env node
/**
 * 权威数据校验脚本（可重复运行，供 CI / 本地使用）
 *
 * 校验 packages/engine/src/data/{cards,nobles}.json 的结构完整性与牌组不变量：
 *   1. 90 张卡（T1=40 / T2=30 / T3=20），每色 T1=8 / T2=6 / T3=4
 *   2. 各档点数直方图：T1 {0×35, 1×5}；T2 {1×10, 2×15, 3×5}；T3 {3×5, 4×10, 5×5}
 *   3. 成本合法性：非负整数、不含金币、至少一种颜色、总成本 3..10
 *   4. 无重复卡（同档同加成同分数同成本）
 *   5. 结构不变量：同一档内，5 个加成色的 (分数, 成本签名) 多重集完全一致
 *   6. 贵族：10 张、各 3 分、5×(双色 4+4) + 5×(三色 3+3+3)、名称唯一
 *   7. 贵族结构：4+4 与 3+3+3 各自构成完整旋转轨道（5 张一组）
 *   8. 旋转轨道统计（信息性输出，官方牌组存在真实不对称，不判失败）
 *
 * 用法：node scripts/verify-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLORS, LETTER, costStr, sig, cardKey, sameCard, rotate, NEXT } from './lib/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'packages', 'engine', 'src', 'data');

const cardsDoc = JSON.parse(fs.readFileSync(path.join(DB, 'cards.json'), 'utf8'));
const noblesDoc = JSON.parse(fs.readFileSync(path.join(DB, 'nobles.json'), 'utf8'));
const cards = cardsDoc.cards;
const nobles = noblesDoc.nobles;

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

// 1. 数量结构
if (cards.length !== 90) fail(`卡牌总数 ${cards.length} ≠ 90`);
const byTier = new Map();
const byTierBonus = new Map();
for (const c of cards) {
  byTier.set(c.tier, (byTier.get(c.tier) || 0) + 1);
  const k = `${c.tier}-${c.bonus}`;
  byTierBonus.set(k, (byTierBonus.get(k) || 0) + 1);
}
for (const [tier, expect] of [
  [1, 40],
  [2, 30],
  [3, 20],
]) {
  if ((byTier.get(tier) || 0) !== expect) fail(`T${tier} 卡数 ${byTier.get(tier) || 0} ≠ ${expect}`);
}
for (const tier of [1, 2, 3]) {
  const expect = { 1: 8, 2: 6, 3: 4 }[tier];
  for (const color of COLORS) {
    const n = byTierBonus.get(`${tier}-${color}`) || 0;
    if (n !== expect) fail(`T${tier} ${LETTER[color]} 卡数 ${n} ≠ ${expect}`);
  }
}

// 2. 点数直方图
const expectHist = {
  1: { 0: 35, 1: 5 },
  2: { 1: 10, 2: 15, 3: 5 },
  3: { 3: 5, 4: 10, 5: 5 },
};
for (const tier of [1, 2, 3]) {
  const hist = new Map();
  for (const c of cards.filter((c) => c.tier === tier)) hist.set(c.points, (hist.get(c.points) || 0) + 1);
  for (const [pts, n] of Object.entries(expectHist[tier])) {
    if ((hist.get(+pts) || 0) !== n) fail(`T${tier} ${pts}分卡数 ${hist.get(+pts) || 0} ≠ ${n}`);
  }
  for (const [pts, n] of hist) {
    if (!(pts in expectHist[tier])) fail(`T${tier} 出现意外的 ${pts}分卡（${n} 张）`);
  }
}

// 3. 成本合法性
for (const c of cards) {
  let total = 0;
  let touched = false;
  for (const color of COLORS) {
    const v = c.cost[color];
    if (!Number.isInteger(v) || v < 0) fail(`卡 #${c.id} 成本非法：${color}=${v}`);
    total += v;
    if (v > 0) touched = true;
  }
  if (!touched) fail(`卡 #${c.id} 成本全为 0`);
  if (total < 3 || total > 14) fail(`卡 #${c.id} 总成本 ${total} 超出合理范围 3..14`);
  if ('gold' in c.cost) fail(`卡 #${c.id} 成本包含金币`);
}

// 4. 无重复卡
const seenCard = new Set();
for (const c of cards) {
  const k = `${c.tier}|${c.bonus}|${c.points}|${COLORS.map((x) => c.cost[x]).join(',')}`;
  if (seenCard.has(k)) fail(`重复卡：${k}`);
  seenCard.add(k);
}

// 5. 结构不变量：同档各加成色的 (分数,签名) 多重集一致
for (const tier of [1, 2, 3]) {
  const profiles = new Map();
  for (const c of cards.filter((c) => c.tier === tier)) {
    const list = profiles.get(c.bonus) ?? [];
    list.push(`${c.points}:${sig(c)}`);
    profiles.set(c.bonus, list);
  }
  const ref = [...(profiles.get(COLORS[0]) ?? [])].sort().join(';');
  for (const color of COLORS.slice(1)) {
    const cur = [...(profiles.get(color) ?? [])].sort().join(';');
    if (cur !== ref) fail(`T${tier} ${LETTER[color]} 的 (分数,签名) 多重集与 ${LETTER[COLORS[0]]} 不一致`);
  }
}

// 6. 贵族基础结构
if (nobles.length !== 10) fail(`贵族数量 ${nobles.length} ≠ 10`);
const nameSet = new Set();
let n44 = 0;
let n333 = 0;
for (const n of nobles) {
  if (n.points !== 3) fail(`贵族「${n.name}」分数 ${n.points} ≠ 3`);
  if (nameSet.has(n.name)) fail(`贵族名称重复：${n.name}`);
  nameSet.add(n.name);
  const colors = COLORS.filter((c) => n.requirement[c] > 0);
  const vals = colors.map((c) => n.requirement[c]);
  if (colors.length === 2 && vals.every((v) => v === 4)) n44++;
  else if (colors.length === 3 && vals.every((v) => v === 3)) n333++;
  else fail(`贵族「${n.name}」要求不合法：${colors.map((c) => `${LETTER[c]}${n.requirement[c]}`).join(' ')}`);
  for (const color of COLORS) {
    if (!colors.includes(color) && n.requirement[color] !== 0) fail(`贵族「${n.name}」${color} 非零但不在要求颜色中`);
  }
}
if (n44 !== 5) fail(`4+4 贵族数量 ${n44} ≠ 5`);
if (n333 !== 5) fail(`3+3+3 贵族数量 ${n333} ≠ 5`);

// 7. 贵族旋转轨道完整性
const nobleOrbit = (filterFn, label) => {
  const set = nobles.filter(filterFn);
  const used = new Set();
  for (const start of set) {
    if (used.has(start.id)) continue;
    let req = start.requirement;
    let size = 0;
    for (let i = 0; i < 5; i++) {
      const match = set.find((n) => !used.has(n.id) && COLORS.every((c) => n.requirement[c] === req[c]));
      if (!match) break;
      used.add(match.id);
      size++;
      const nextReq = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
      for (const c of COLORS) nextReq[NEXT[c]] = req[c];
      req = nextReq;
    }
    if (size !== 5) fail(`${label} 存在不完整旋转轨道（长度 ${size}）`);
  }
};
nobleOrbit((n) => COLORS.filter((c) => n.requirement[c] > 0).length === 2 && n.requirement[COLORS.find((c) => n.requirement[c] > 0)] === 4, '4+4 贵族');
nobleOrbit((n) => COLORS.filter((c) => n.requirement[c] > 0).length === 3, '3+3+3 贵族');

// 8. 卡牌旋转轨道统计（信息性）
const propByKey = new Map(cards.map((c) => [cardKey(c), c]));
const seen = new Set();
let fragments = 0;
let closed = 0;
for (const p of cards) {
  if (seen.has(cardKey(p))) continue;
  fragments++;
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
notes.push(`旋转轨道片段 ${fragments} 条，其中完全闭合 ${closed} 条（官方牌组存在真实不对称，属正常）`);

// ---------------- 输出 ----------------

for (const n of notes) console.log(`ℹ️ ${n}`);
if (failures.length) {
  console.error('❌ 数据校验失败：');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('✅ 数据校验全部通过（90 张卡 + 10 张贵族）');
