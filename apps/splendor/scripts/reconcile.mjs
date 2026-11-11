#!/usr/bin/env node
/**
 * 多源卡牌数据交叉核对脚本（分析用，不修改任何数据）
 *
 * 输入：data/sources/ 下 5 份独立公开数据源快照（保持原始格式，不做人工修改）
 *   - boardgamers-data.ts.txt   （github.com/boardgamers/splendor）     —— 经核对发现约 45 处转录错误，已弃用
 *   - splendimax-cards.csv      （github.com/bouk/splendimax）
 *   - seal256-cards.csv         （github.com/seal256/splendor）
 *   - goldenchicken-cards.json  （github.com/TheGoldenChicken/splendor）
 *   - anicolao-verified.csv     （github.com/anicolao/splendor，实体卡照片机器识别 + 人工核对）
 *
 * 输出：
 *   - data/tmp/reconcile-report.md   人工复核用报告（分歧表 + 旋转对称性诊断）
 *   - data/tmp/proposed-cards.json   多数票候选数据（未经 finalize 定稿）
 *
 * 环境变量：
 *   EXCLUDE=A,B   排除指定前缀的数据源后再核对（例如对定稿数据集 EXCLUDE=A 应为 0 分歧）
 *
 * 用法：node scripts/reconcile.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLORS,
  LETTER,
  costEquals,
  costStr,
  cardKey,
  cardStr,
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
const OUT = path.join(ROOT, 'data', 'tmp');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const sources = [
  { id: 'A:boardgamers', ...parseBoardgamers(read('boardgamers-data.ts.txt')) },
  { id: 'B:splendimax', ...parseSplendimax(read('splendimax-cards.csv')) },
  { id: 'C:seal256', ...parseSeal256(read('seal256-cards.csv')) },
  { id: 'D:goldenchicken', ...parseGoldenchicken(read('goldenchicken-cards.json')) },
  { id: 'E:anicolao', ...parseAnicolao(read('anicolao-verified.csv')) },
];
sources[1].nobles = parseSplendimaxNobles(read('splendimax-noble.rs.txt'));

const exclude = (process.env.EXCLUDE || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const activeSources = sources.filter((s) => !exclude.some((e) => s.id.startsWith(e)));
if (exclude.length) console.log(`已排除数据源：${exclude.join(',')}`);

const lines = [];
const w = (s = '') => lines.push(s);

w('# 卡牌数据交叉核对报告');
w();
w(`生成时间：${new Date().toISOString()}`);
w();
w(`数据源：${sources.map((s) => s.id).join('、')}`);
if (exclude.length) w(`本次分析已排除：${exclude.join('、')}`);
w();

// ---------------- 1. 各源内部结构检查 ----------------

w('## 1. 各数据源内部结构检查');
w();
w('期望结构：总数 90；每档 40/30/20；每色卡数 T1=8、T2=6、T3=4');
w();
w('| 源 | 总数 | T1/T2/T3 | 每(档,色)计数 | 重复卡槽 | 点数分布 (T1/T2/T3) |');
w('| --- | --- | --- | --- | --- | --- |');
for (const s of activeSources) {
  const byTier = [0, 0, 0, 0];
  const perTierBonus = new Map();
  const keyCount = new Map();
  const pts = [new Map(), new Map(), new Map()];
  for (const c of s.cards) {
    byTier[c.tier]++;
    const bk = `${c.tier}-${c.bonus}`;
    perTierBonus.set(bk, (perTierBonus.get(bk) || 0) + 1);
    const k = cardKey(c);
    keyCount.set(k, (keyCount.get(k) || 0) + 1);
    pts[c.tier - 1].set(c.points, (pts[c.tier - 1].get(c.points) || 0) + 1);
  }
  const badPerBonus = [...perTierBonus.entries()]
    .filter(([bk, n]) => {
      const tier = +bk.split('-')[0];
      return n !== { 1: 8, 2: 6, 3: 4 }[tier];
    })
    .map(([bk, n]) => `${bk}:${n}`);
  const dupes = [...keyCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
  const fmtPts = (m) =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([p, n]) => `${p}分×${n}`)
      .join(' ');
  w(
    `| ${s.id} | ${s.cards.length} | ${byTier.slice(1).join('/')} | ${badPerBonus.length ? '❌ ' + badPerBonus.join(' ') : '✅'} | ${dupes.length ? '❌ ' + dupes.join(' ') : '✅'} | ${fmtPts(pts[0])} / ${fmtPts(pts[1])} / ${fmtPts(pts[2])} |`,
  );
}
w();

// ---------------- 2. 逐卡槽对比 ----------------

const allKeys = new Set();
for (const s of activeSources) for (const c of s.cards) allKeys.add(cardKey(c));

const proposals = [];
const disagreements = [];

for (const key of [...allKeys].sort()) {
  const entries = activeSources.map((s) => ({ id: s.id, cards: s.cards.filter((c) => cardKey(c) === key) }));
  const present = entries.filter((e) => e.cards.length > 0);
  const missing = entries.filter((e) => e.cards.length === 0);
  const values = present.map((e) => e.cards[0]);

  const groups = [];
  for (const { id, card } of present.map((e) => ({ id: e.id, card: e.cards[0] }))) {
    let g = groups.find((g) => costEquals(g.card.cost, card.cost));
    if (!g) {
      g = { card, votes: [] };
      groups.push(g);
    }
    g.votes.push(id);
  }
  groups.sort((a, b) => b.votes.length - a.votes.length);
  const winner = groups[0];
  const isUnanimous = groups.length === 1 && missing.length === 0;

  proposals.push({
    key,
    tier: values[0].tier,
    bonus: values[0].bonus,
    points: values[0].points,
    cost: winner.card.cost,
    votes: winner.votes,
    unanimous: isUnanimous,
  });

  if (!isUnanimous) {
    disagreements.push({
      ...proposals[proposals.length - 1],
      groups: groups.map((g) => ({ cost: costStr(g.card), votes: g.votes })),
      missing: missing.map((e) => e.id),
      present: present.map((e) => ({ id: e.id, cost: costStr(e.cards[0]) })),
    });
  }
}

w('## 2. 卡槽覆盖情况');
w();
for (const s of activeSources) {
  const uncovered = s.cards.filter((c) => !proposals.some((p) => cardKey(p) === cardKey(c)));
  w(
    `- ${s.id}：${s.cards.length} 张卡，未被任何卡槽覆盖 ${uncovered.length} 张${uncovered.length ? '：' + uncovered.map(cardStr).join('；') : ''}`,
  );
}
w();

// ---------------- 3. 分歧明细 ----------------

w('## 3. 分歧明细（需人工复核 / 图像复核）');
w();
if (disagreements.length === 0) {
  w(`✅ 全部卡槽 ${activeSources.length} 源一致`);
} else {
  w(`共 ${disagreements.length} 个卡槽存在分歧：`);
  w();
  w('| 卡槽 | ' + activeSources.map((s) => s.id.split(':')[0]).join(' | ') + ' | 多数票 | 少数派 |');
  w('| --- |' + activeSources.map(() => ' --- |').join('') + ' --- | --- |');
  for (const d of disagreements) {
    const slot = `T${d.tier} ${LETTER[d.bonus]} ${d.points}分`;
    const cells = activeSources.map((s) => {
      const hit = d.present.find((p) => p.id === s.id);
      return hit ? hit.cost : '—';
    });
    const minority = d.present
      .filter((p) => !d.votes.includes(p.id))
      .map((p) => `${p.id.split(':')[0]}:${p.cost}`);
    w(`| ${slot} | ${cells.join(' | ')} | ${costStr(d)} (${d.votes.length}票) | ${minority.join('；') || '—'} |`);
  }
}
w();

// ---------------- 4. 旋转对称性诊断 ----------------

w('## 4. 旋转对称性诊断（辅助，非最终依据）');
w();
w('说明：官方牌组并非完全旋转对称（这是真实设计特性），因此"未闭合"不一定是错误；');
w('本诊断仅用于发现"四源一致但与其余卡牌结构明显矛盾"的疑似转录问题。');
w();
const propByKey = new Map(proposals.map((p) => [cardKey(p), p]));
const seen = new Set();
const orbits = [];
for (const p of proposals) {
  if (seen.has(cardKey(p))) continue;
  const orbit = [];
  let cur = p;
  let closed = false;
  for (let i = 0; i < 5; i++) {
    const found = propByKey.get(cardKey(cur));
    if (!found || !sameCard(found, cur)) {
      orbit.push({ ...cur, present: false, foundCost: found ? costStr(found) : null });
      break;
    }
    if (i > 0 && sameCard(found, p)) {
      closed = true;
      break;
    }
    orbit.push(found);
    seen.add(cardKey(found));
    cur = rotate(found);
    if (i === 4) closed = sameCard(cur, p);
  }
  orbits.push({ orbit, closed });
}
const broken = orbits.filter((o) => !o.closed || o.orbit.length !== 5);
w(`候选数据共形成 ${orbits.length} 条旋转轨道，其中 ${broken.length} 条未闭合：`);
w();
for (const o of broken) {
  w(`- 未闭合轨道：`);
  for (const c of o.orbit) {
    if (c.present === false) {
      w(`  - ↑ 期望卡：${cardStr(c)}，候选中缺失该卡槽或配色不同${c.foundCost ? `（同槽位实际为 ${c.foundCost}）` : ''}`);
    } else {
      w(`  - ${cardStr(c)}`);
    }
  }
}
w();

// ---------------- 5. 贵族对比 ----------------

w('## 5. 贵族（10 张）对比');
w();
const nobleSets = [];
for (const s of sources) {
  for (const n of s.nobles ?? []) {
    const k = COLORS.filter((c) => n.req[c] > 0)
      .map((c) => `${LETTER[c]}${n.req[c]}`)
      .join(' ');
    let set = nobleSets.find((x) => x.k === k);
    if (!set) nobleSets.push((set = { k, names: [], votes: [] }));
    if (n.name) set.names.push(n.name);
    set.votes.push(s.id.split(':')[0]);
  }
}
nobleSets.sort((a, b) => a.k.localeCompare(b.k));
w('| 要求 | 票数 | 来源 | 名称候选 |');
w('| --- | --- | --- | --- |');
for (const s of nobleSets) {
  w(`| ${s.k} | ${s.votes.length} | ${s.votes.join(' ')} | ${[...new Set(s.names)].join(' / ') || '—'} |`);
}
w();

// ---------------- 输出 ----------------

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'reconcile-report.md'), lines.join('\n') + '\n', 'utf8');

const out = proposals
  .sort(
    (a, b) =>
      a.tier - b.tier ||
      COLORS.indexOf(a.bonus) - COLORS.indexOf(b.bonus) ||
      b.points - a.points,
  )
  .map((p) => ({ tier: p.tier, bonus: p.bonus, points: p.points, cost: p.cost, votes: p.votes, unanimous: p.unanimous }));
fs.writeFileSync(path.join(OUT, 'proposed-cards.json'), JSON.stringify({ cards: out }, null, 2), 'utf8');

console.log(`卡槽总数: ${proposals.length}`);
console.log(`分歧卡槽: ${disagreements.length}`);
console.log(`未闭合旋转轨道: ${broken.length}`);
console.log(`报告已写入: data/tmp/reconcile-report.md`);
console.log(`候选数据已写入: data/tmp/proposed-cards.json`);
