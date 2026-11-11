import { COLORS } from '../types.js';
import type { AiLevel, GameState, Move, PlayerState } from '../types.js';
import { hashString, mulberry32, type Rng } from '../rng.js';
import { legalMoves } from '../legal.js';
import { simulate } from '../apply.js';
import { cardById, nobleById } from '../data/index.js';
import { totalPoints } from '../scoring.js';
import { boardCards, cardValue, evaluate, neededColors, paymentGap, type EvalWeights } from './heuristics.js';

interface LevelSpec {
  weights: EvalWeights;
  /** 抖动幅度（越大越随性） */
  noise: number;
  /** 从前 K 名候选中加权挑选 */
  topK: number;
  /** 纯随机走法概率 */
  blunder: number;
  /** 是否做对手最佳回应推演（两层） */
  twoPly: boolean;
  /** 陪玩：避免抢人类玩家正需要的颜色 */
  kindness: boolean;
}

const SPECS: Record<AiLevel, LevelSpec> = {
  // 陪玩/简单：基建流（多买一阶卡囤折扣与贵族，风格温和）
  friendly: { weights: { denial: 0, engine: 1.25, rush: 0.75 }, noise: 1.4, topK: 4, blunder: 0.08, twoPly: false, kindness: true },
  easy: { weights: { denial: 0.1, engine: 1.2, rush: 0.9 }, noise: 0.7, topK: 4, blunder: 0.08, twoPly: false, kindness: false },
  // 普通：均衡
  normal: { weights: { denial: 0.5, engine: 1.0, rush: 1.0 }, noise: 0.3, topK: 4, blunder: 0, twoPly: false, kindness: false },
  // 困难：冲刺流（盯准 7+3/7 与高牌效二级牌，会锁目标与卡人）；权重经 600+ 局消融校准
  hard: { weights: { denial: 0.6, engine: 1.0, rush: 1.1 }, noise: 0.05, topK: 5, blunder: 0, twoPly: true, kindness: false },
};

function aiRng(state: GameState): Rng {
  return mulberry32(hashString(`${state.seed}|${state.current}|${state.turn}|${state.moves.length}`));
}

/**
 * AI 可见局面：牌堆只保留"还剩哪些牌"，不保留顺序。
 *
 * 牌堆的顺序是唯一的隐藏信息（其余信息——桌面、各人令牌/加成/预定、牌堆张数——
 * 都能从公开信息推出）。这里按卡面 id 规范化排序，使结果与真实顺序完全无关：
 *  * AI 自己评估"从牌堆预定"时，不会看到真实牌堆顶；
 *  * 终局深搜里模拟对手回应时同理；
 *  * 同一可见局面（不同真实牌序）必然得到同一决策，便于复盘与测试。
 */
export function aiVisibleState(state: GameState): GameState {
  return {
    ...state,
    decks: state.decks.map((deck) => [...deck].sort((a, b) => a - b)),
  };
}

/** 选择走法（确定性：同一状态 + 档位 → 同一选择，便于回放与测试） */
export function chooseMove(state: GameState, level: AiLevel = 'normal'): Move {
  const spec = SPECS[level];
  const view = aiVisibleState(state);
  const moves = legalMoves(view);
  if (moves.length === 0) throw new Error('no legal moves');
  if (moves.length === 1) return moves[0]!;
  const rng = aiRng(state);
  const seat = view.current;

  const scored = moves.map((move) => {
    const after = simulate(view, move);
    if (!after) return { move, score: Number.NEGATIVE_INFINITY };
    let score = evaluate(after, seat, spec.weights);
    score += moveBias(view, seat, move);
    if (spec.kindness) score += kindnessDelta(view, seat, move);
    // 终局阶段（有人 ≥10 分）才推演对手最佳回应，避免在发展中过度防守
    if (spec.twoPly) score -= 0.8 * endgameThreat(after, seat);
    return { move, score };
  });

  if (spec.blunder > 0 && rng() < spec.blunder) {
    return moves[Math.floor(rng() * moves.length)]!;
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.max(1, spec.topK));
  const tau = 1 + 10 * spec.noise;
  const best = top[0]!.score;
  const weights = top.map((s) => Math.exp((s.score - best) / tau));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < top.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return top[i]!.move;
  }
  return top[0]!.move;
}

/** 走法层面的偏好微调 */
function moveBias(state: GameState, seat: number, move: Move): number {
  const me = state.players[seat]!;
  const held = COLORS.reduce((s, c) => s + me.tokens[c], 0) + me.tokens.gold;
  switch (move.type) {
    case 'buy': {
      let bonus = 1.2;
      if (me.tokens.gold > 0) bonus += 0.2; // 金币在手时优先转化
      if (held >= 10) bonus += 1.8; // 已到上限：买入优于"拿了再还"
      if (move.target.kind === 'board') bonus += 0.4;
      return bonus;
    }
    case 'reserve': {
      let bias = -2.2;
      if (move.target.kind === 'board') {
        const id = state.board[move.target.tier - 1]?.[move.target.slot];
        if (id != null) {
          const card = cardById(id);
          const v = cardValue(card);
          if (v > 6.5) bias += 3.2; // 抢下高价值卡
          const gap = paymentGap(me, card);
          // 高手式锁目标：把够得着的大牌先预定下来（防止被抢，金币也能帮上忙）
          if (card.points >= 4 && gap <= 5) bias += 4.5;
          else if (card.points >= 3 && gap <= 3) bias += 2.5;
        }
      } else {
        bias -= 0.6; // 盲抽更谨慎
      }
      return bias;
    }
    case 'take2':
      return held >= 9 ? -1.8 : 0.4;
    case 'take':
      return held >= 9 ? -2.4 : 0.45;
    default:
      return 0;
  }
}

/** 陪玩档：避免抢人类玩家正需要的颜色（软性 - 只影响排序） */
function kindnessDelta(state: GameState, seat: number, move: Move): number {
  if (move.type !== 'take' && move.type !== 'take2' && move.type !== 'reserve') return 0;
  const humans = state.players.filter((p) => p.kind === 'human' && p.seat !== seat);
  if (humans.length === 0) return 0;
  const target = humans.reduce((best, p) => (totalPoints(p) > totalPoints(best) ? p : best));
  const need = neededColors(target, state);
  if (need.size === 0) return 0;
  let overlap = 0;
  if (move.type === 'take') for (const c of move.colors) overlap += need.get(c) ?? 0;
  else if (move.type === 'take2') overlap += (need.get(move.color) ?? 0) * 2;
  else if (move.type === 'reserve' && move.target.kind === 'board') {
    const id = state.board[move.target.tier - 1]?.[move.target.slot];
    if (id != null) {
      const card = cardById(id);
      if (need.has(card.bonus)) overlap += 1;
    }
  }
  return -1.1 * Math.min(3, overlap);
}

/** 终局威胁：仅在有人接近获胜（≥12 分）时启用的深度回应推演 */
function endgameThreat(state: GameState, seat: number): number {
  if (state.phase !== 'playing') return 0;
  const endgame = state.players.some((p) => totalPoints(p) >= 12);
  return endgame ? bestReplyScore(state, seat) : 0;
}

/** 危险回应推演：评估"下一位对手 + 当前领先对手"的最佳回应。 */
function bestReplyScore(state: GameState, seat: number): number {
  if (state.phase === 'ended') return 0;
  if (state.phase !== 'playing') return 0; // 自己还有待办动作（归还/选贵族），对手并非下一行动者
  const opponents = state.players.filter((p) => p.seat !== seat);
  const ordered = [...opponents].sort((a, b) => totalPoints(b) - totalPoints(a));
  const considered = new Set<number>();
  for (const p of ordered.slice(0, 2)) considered.add(p.seat);
  considered.add(state.current);
  let best = 0;
  for (const otherSeat of considered) {
    if (otherSeat === seat) continue;
    const other = state.players[otherSeat]!;
    // 模拟视角：切换 current 到对手（consume 走法枚举接口）
    const sub: GameState = { ...state, current: otherSeat, phase: 'playing' };
    const replyMoves = legalMoves(sub);
    let bestReply = 0;
    for (const m of replyMoves) {
      const after = simulate(sub, m);
      if (!after) continue;
      const v = evaluate(after, otherSeat, { denial: 0.4, engine: 1, rush: 1 });
      if (v > bestReply) bestReply = v;
    }
    if (bestReply > best) best = bestReply;
  }
  return best;
}

export { SPECS as AI_SPECS };
