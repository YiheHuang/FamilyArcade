import { COLORS } from '../types.js';
import type { CardDef, Color, GameState, PlayerState, Tier } from '../types.js';
import { cardById, nobleById } from '../data/index.js';
import { deficitFor } from '../payments.js';
import { totalPoints } from '../scoring.js';

export interface BoardCardRef {
  card: CardDef;
  tier: Tier;
  slot: number;
}

export function boardCards(state: GameState): BoardCardRef[] {
  const out: BoardCardRef[] = [];
  for (let tier = 1 as Tier; tier <= 3; tier = (tier + 1) as Tier) {
    const row = state.board[tier - 1]!;
    for (let slot = 0; slot < row.length; slot++) {
      const id = row[slot];
      if (id != null) out.push({ card: cardById(id), tier, slot });
    }
  }
  return out;
}

/** 买下某卡还差多少枚（金币计入覆盖能力），0 = 现在就能买 */
export function paymentGap(player: PlayerState, card: CardDef): number {
  const def = deficitFor(card, player.bonuses);
  let gap = 0;
  for (const c of COLORS) {
    gap += def[c] - Math.min(def[c], player.tokens[c]);
  }
  gap -= player.tokens.gold;
  return Math.max(0, gap);
}

/** 卡牌静态价值：分数 + 牌效（成本结构）+ 引擎加成 */
export function cardValue(card: CardDef): number {
  const counts = COLORS.map((c) => card.cost[c]).filter((v) => v > 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const maxCount = counts.length ? Math.max(...counts) : 0;
  let v = card.points * 3 + 2.2 + card.tier * 0.25;

  // 牌效（经验：性价比高的成本结构）
  if (card.tier === 1) {
    if (counts.length === 1 && total === 3) v += 0.9; // 3 宝石单色：一阶最高效
    if (counts.length === 2 && maxCount === 2) v += 0.4; // 2+1：好凑、换出快
  } else if (card.tier === 2) {
    if (counts.length === 1) v += 1.1; // 5 / 6 单色：配同色折扣后近乎免费
    else if (counts.length === 3 && maxCount === 4) v += 0.7; // 4+2+1
  } else {
    if (counts.length === 1) v += 0.8; // 7 单色
    if (counts.length === 2 && maxCount === 7) v += 1.0; // 7+3（高手最爱的冲刺终结点）
  }

  // 总成本越低越高效
  v += Math.max(0, 10 - total) * 0.06;
  return v;
}

/** 对手威胁：任一对手下回合即可买到的最高价值（含预定区） */
export function opponentThreat(state: GameState, seat: number): number {
  let threat = 0;
  for (const p of state.players) {
    if (p.seat === seat) continue;
    let best = 0;
    for (const { card } of boardCards(state)) {
      const gap = paymentGap(p, card);
      if (gap === 0) best = Math.max(best, cardValue(card));
      else if (gap <= 2) best = Math.max(best, cardValue(card) * 0.4);
    }
    for (const r of p.reserved) {
      const card = cardById(r.cardId);
      if (paymentGap(p, card) === 0) best = Math.max(best, cardValue(card) * 0.9);
    }
    threat = Math.max(threat, best);
  }
  return threat;
}

/** 贵族进度：对各贵族达成比例求和 */
export function nobleProgress(player: PlayerState, nobleIds: readonly number[]): number {
  let sum = 0;
  for (const id of nobleIds) {
    const req = nobleById(id).requirement;
    const colors = COLORS.filter((c) => req[c] > 0);
    const frac = colors.reduce((m, c) => m + Math.min(1, player.bonuses[c] / req[c]), 0) / colors.length;
    sum += frac;
  }
  return sum;
}

export interface EvalWeights {
  /** 对"卡住对手"的重视度（陪玩档为 0） */
  denial: number;
  /** 引擎（基建流）权重：更看重累积折扣与贵族 */
  engine: number;
  /** 冲刺权重：更看重尽快攒出高价值大牌（7+3 / 7 这类） */
  rush: number;
}

/** 一阶卡是引擎（长线折扣），三阶卡主要买它的分数 */
const TIER_ENGINE_WEIGHT: Record<number, number> = { 1: 1, 2: 0.45, 3: 0.2 };

/** 基建分：按等级加权统计已购卡（一阶卡贡献最大） */
export function engineScore(player: PlayerState): number {
  let s = 0;
  for (const id of player.purchased) {
    s += TIER_ENGINE_WEIGHT[cardById(id).tier] ?? 0.3;
  }
  return s;
}

function gapDecay(gap: number): number {
  if (gap === 0) return 1;
  if (gap === 1) return 0.6;
  if (gap === 2) return 0.4;
  if (gap === 3) return 0.26;
  if (gap === 4) return 0.16;
  return 0.09;
}

/** 目标吸引力：盯准（自己缺得最少、价值最高的）前几张目标卡，驱动"攒特定颜色"的行为 */
export function targetPull(state: GameState, player: PlayerState): number {
  const pulls: number[] = [];
  const consider = (card: CardDef, factor: number): void => {
    pulls.push(cardValue(card) * gapDecay(paymentGap(player, card)) * factor);
  };
  for (const { card } of boardCards(state)) consider(card, 1);
  for (const r of player.reserved) consider(cardById(r.cardId), 1.15); // 自己锁定的目标更值得追求
  pulls.sort((a, b) => b - a);
  let sum = 0;
  for (let i = 0; i < Math.min(3, pulls.length); i++) sum += pulls[i]!;
  return sum;
}

/** 局面评估（从 seat 视角） */
export function evaluate(state: GameState, seat: number, weights: EvalWeights): number {
  const me = state.players[seat]!;
  const myPts = totalPoints(me);
  const oppPts = Math.max(0, ...state.players.filter((p) => p.seat !== seat).map((p) => totalPoints(p)));
  let score = 0;

  score += 14 * (myPts - oppPts);
  if (myPts >= 15) score += 80;
  if (state.finalRound && myPts >= 15) score += 40;

  // 阶段权重：前期偏基建（囤折扣/贵族），后期偏冲刺（抢大分）
  const phase = Math.min(1, Math.max(0, (state.turn - 12) / 20)); // 0=早期 → 1=晚期
  const engineW = weights.engine * (1.15 - 0.3 * phase);
  const rushW = weights.rush * (0.85 + 0.3 * phase);

  // 引擎（基建）与冲刺两条路线
  score += 3.2 * engineW * engineScore(me);
  score += 1.0 * rushW * targetPull(state, me);

  score += 1.8 * me.tokens.gold;
  score += 0.6 * COLORS.reduce((s, c) => s + Math.min(me.tokens[c], 4), 0);

  // 持有超过 10 枚的代价（必须归还；避免"拿了再还"的虚假收益）
  const held = COLORS.reduce((s, c) => s + me.tokens[c], 0) + me.tokens.gold;
  if (held > 10) score -= 5 * (held - 10);

  score += 6 * nobleProgress(me, state.nobles);
  score -= weights.denial * opponentThreat(state, seat);
  return score;
}

/** 陪玩档用：估计某玩家在意的颜色（预定卡 + 近期可买卡所缺颜色） */
export function neededColors(player: PlayerState, state: GameState): Map<Color, number> {
  const need = new Map<Color, number>();
  const consider = [...boardCards(state).map((b) => b.card), ...player.reserved.map((r) => cardById(r.cardId))];
  for (const card of consider) {
    if (paymentGap(player, card) > 3) continue;
    const def = deficitFor(card, player.bonuses);
    for (const c of COLORS) {
      if (def[c] > player.tokens[c]) need.set(c, (need.get(c) ?? 0) + 1);
    }
  }
  return need;
}
