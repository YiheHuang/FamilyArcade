import { COLORS } from './types.js';
import type { Color, GameState, Move, PendingNoble, PlayerState, TokenColor } from './types.js';
import { cardById } from './data/index.js';
import { canAfford, totalTokens } from './payments.js';

const ALL_TOKEN_COLORS: readonly TokenColor[] = [...COLORS, 'gold'];

/** 枚举当前状态下所有合法走法（供校验、UI 提示与 AI 使用） */
export function legalMoves(state: GameState): Move[] {
  if (state.phase === 'ended') return [];
  const player = state.players[state.current]!;
  if (state.phase === 'discarding') return legalDiscards(player);
  if (state.phase === 'choosing-noble') {
    const pending = state.pending as PendingNoble;
    return pending.options.map((nobleId) => ({ type: 'chooseNoble', nobleId }) as Move);
  }
  const moves = legalActions(state, player);
  // 极端兜底：银行耗尽且无法购卡/预定时，允许跳过（官方规则未涉及的死局）
  return moves.length > 0 ? moves : [{ type: 'pass' }];
}

export function legalActions(state: GameState, player: PlayerState): Move[] {
  const moves: Move[] = [];

  // 拿 1~3 枚不同色
  const available = COLORS.filter((c) => state.bank[c] > 0);
  for (const combo of subsets(available, 1, 3)) {
    moves.push({ type: 'take', colors: combo });
  }

  // 拿 2 枚同色（银行 ≥4）
  for (const c of COLORS) {
    if (state.bank[c] >= 4) moves.push({ type: 'take2', color: c });
  }

  // 预定
  if (player.reserved.length < 3) {
    for (let tier = 1 as 1 | 2 | 3; tier <= 3; tier = (tier + 1) as 1 | 2 | 3) {
      const row = state.board[tier - 1]!;
      for (let slot = 0; slot < row.length; slot++) {
        if (row[slot] != null) moves.push({ type: 'reserve', target: { kind: 'board', tier, slot } });
      }
      if (state.decks[tier - 1]!.length > 0) moves.push({ type: 'reserve', target: { kind: 'deck', tier } });
    }
  }

  // 购买（桌面 + 自己的预定区）
  for (let tier = 1 as 1 | 2 | 3; tier <= 3; tier = (tier + 1) as 1 | 2 | 3) {
    const row = state.board[tier - 1]!;
    for (let slot = 0; slot < row.length; slot++) {
      const id = row[slot];
      if (id != null && canAfford(player, cardById(id))) {
        moves.push({ type: 'buy', target: { kind: 'board', tier, slot } });
      }
    }
  }
  player.reserved.forEach((r, index) => {
    if (canAfford(player, cardById(r.cardId))) {
      moves.push({ type: 'buy', target: { kind: 'reserved', index } });
    }
  });

  return moves;
}

/** 需要归还令牌时：必须恰好归还 (持有总数 - 10) 枚，枚举所有组合 */
function legalDiscards(player: PlayerState): Move[] {
  const need = totalTokens(player.tokens) - 10;
  if (need <= 0) return [];
  const result: Move[] = [];
  const acc: Partial<Record<TokenColor, number>> = {};

  const rec = (idx: number, remaining: number): void => {
    if (idx === ALL_TOKEN_COLORS.length - 1) {
      const key = ALL_TOKEN_COLORS[idx]!;
      if (remaining <= player.tokens[key]) {
        if (remaining > 0) acc[key] = remaining;
        else delete acc[key];
        result.push({ type: 'discard', tokens: { ...acc } });
        if (remaining > 0) delete acc[key];
      }
      return;
    }
    const key = ALL_TOKEN_COLORS[idx]!;
    const maxTake = Math.min(player.tokens[key], remaining);
    for (let v = 0; v <= maxTake; v++) {
      if (v > 0) acc[key] = v;
      else delete acc[key];
      rec(idx + 1, remaining - v);
    }
    delete acc[key];
  };

  rec(0, need);
  return result;
}

/** 按官方顺序枚举组合（大小在 [minSize, maxSize] 之间） */
export function subsets<T>(arr: readonly T[], minSize: number, maxSize: number): T[][] {
  const out: T[][] = [];
  const cur: T[] = [];
  const rec = (start: number): void => {
    if (cur.length >= minSize && cur.length <= maxSize) out.push([...cur]);
    if (cur.length === maxSize) return;
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]!);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

export function findMove(moves: readonly Move[], predicate: (m: Move) => boolean): Move | undefined {
  return moves.find(predicate);
}

export function isColor(v: unknown): v is Color {
  return typeof v === 'string' && (COLORS as readonly string[]).includes(v);
}
