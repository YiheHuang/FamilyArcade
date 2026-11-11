import { COLORS } from './types.js';
import type {
  CardDef,
  GameEvent,
  GameState,
  Move,
  NobleDef,
  PendingDiscard,
  PendingNoble,
  PlayerState,
  TokenColor,
  Tokens,
} from './types.js';
import { cardById, nobleById } from './data/index.js';
import { defaultPayment, normalizePayment, totalTokens, validatePayment } from './payments.js';
import { legalActions } from './legal.js';
import { emptyTokens } from './setup.js';
import { determineWinners, makeLogEntry } from './scoring.js';

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  error?: string;
}

export interface ApplyOptions {
  /** 是否先克隆状态（默认 true）。AI 模拟可用 cloneForSim + false 提速 */
  clone?: boolean;
}

const ALL_TOKEN_COLORS: readonly TokenColor[] = [...COLORS, 'gold'];
const MAX_LOG = 2000;

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

/** 供 AI 模拟用的轻量克隆：不复制 log/moves */
export function cloneForSim(s: GameState): GameState {
  const { log: _log, moves: _moves, ...rest } = s;
  const c = structuredClone(rest) as GameState;
  c.log = [];
  c.moves = [];
  return c;
}

/** 执行走法；非法时返回 error 且状态不变（克隆模式下返回原状态） */
export function applyMove(state: GameState, move: Move, opts: ApplyOptions = {}): ApplyResult {
  const work = opts.clone === false ? state : cloneState(state);
  const events: GameEvent[] = [];
  const error = applyMoveInPlace(work, move, events);
  if (error) {
    return { state, events: [], error };
  }
  work.moves.push(move);
  return { state: work, events };
}

/** 供 AI 使用：轻量克隆 + 执行，非法返回 null */
export function simulate(state: GameState, move: Move): GameState | null {
  const work = cloneForSim(state);
  const events: GameEvent[] = [];
  const error = applyMoveInPlace(work, move, events);
  return error ? null : work;
}

export function applyMoveInPlace(s: GameState, move: Move, events: GameEvent[]): string | null {
  if (s.phase === 'ended') return 'E_GAME_ENDED';
  const player = s.players[s.current]!;
  switch (s.phase) {
    case 'discarding':
      return applyDiscard(s, move, player, events);
    case 'choosing-noble':
      return applyChooseNoble(s, move, player, events);
    case 'playing':
      return applyAction(s, move, player, events);
    default:
      return 'E_PHASE_UNKNOWN';
  }
}

// ---------------- 主动作 ----------------

function applyAction(s: GameState, move: Move, player: PlayerState, events: GameEvent[]): string | null {
  if (move.type !== 'pass') s.consecutivePasses = 0;
  switch (move.type) {
    case 'take': {
      const colors = move.colors;
      if (!Array.isArray(colors) || colors.length < 1 || colors.length > 3) return 'E_TAKE_COUNT';
      if (new Set(colors).size !== colors.length) return 'E_TAKE_DUP';
      for (const c of colors) {
        if (!COLORS.includes(c)) return `E_UNKNOWN_COLOR:${c}`;
        if (s.bank[c] < 1) return `E_BANK_EMPTY:${c}`;
      }
      const taken = emptyTokens();
      for (const c of colors) {
        s.bank[c]--;
        player.tokens[c]++;
        taken[c]++;
      }
      events.push({ type: 'tokens-taken', seat: player.seat, tokens: taken });
      return resolveAfterAction(s, player, events);
    }
    case 'take2': {
      const c = move.color;
      if (!COLORS.includes(c)) return `E_UNKNOWN_COLOR:${c}`;
      if (s.bank[c] < 4) return 'E_TAKE2_BANK';
      s.bank[c] -= 2;
      player.tokens[c] += 2;
      events.push({ type: 'tokens-taken', seat: player.seat, tokens: { ...emptyTokens(), [c]: 2 } });
      return resolveAfterAction(s, player, events);
    }
    case 'reserve': {
      if (player.reserved.length >= 3) return 'E_RESERVE_FULL';
      const target = move.target;
      let cardId: number | null = null;
      if (target.kind === 'board') {
        const row = s.board[target.tier - 1];
        if (!row || target.slot < 0 || target.slot >= row.length) return 'E_BAD_SLOT';
        cardId = row[target.slot] ?? null;
        if (cardId == null) return 'E_EMPTY_SLOT';
        row[target.slot] = null;
        refillBoard(s, target.tier, target.slot, events);
      } else if (target.kind === 'deck') {
        const deck = s.decks[target.tier - 1];
        if (!deck || deck.length === 0) return 'E_DECK_EMPTY';
        cardId = deck.pop()!;
      } else {
        return 'E_BAD_RESERVE_TARGET';
      }
      player.reserved.push({ cardId, fromDeck: target.kind === 'deck' });
      let goldTaken = false;
      if (s.bank.gold > 0) {
        s.bank.gold--;
        player.tokens.gold++;
        goldTaken = true;
      }
      events.push({ type: 'card-reserved', seat: player.seat, cardId, fromDeck: target.kind === 'deck', goldTaken, tier: target.tier });
      return resolveAfterAction(s, player, events);
    }
    case 'buy': {
      const target = move.target;
      if (target.kind === 'board') {
        const row = s.board[target.tier - 1];
        if (!row || target.slot < 0 || target.slot >= row.length) return 'E_BAD_SLOT';
        const cardId = row[target.slot] ?? null;
        if (cardId == null) return 'E_EMPTY_SLOT';
        const card = cardById(cardId);
        const pay = resolvePayment(player, card, move.pay);
        if (typeof pay === 'string') return pay;
        row[target.slot] = null;
        commitPurchase(s, player, card.id, pay, events);
        refillBoard(s, target.tier, target.slot, events);
        return resolveAfterAction(s, player, events);
      }
      if (target.kind === 'reserved') {
        const entry = player.reserved[target.index];
        if (!entry) return 'E_BAD_RESERVED_INDEX';
        const card = cardById(entry.cardId);
        const pay = resolvePayment(player, card, move.pay);
        if (typeof pay === 'string') return pay;
        player.reserved.splice(target.index, 1);
        commitPurchase(s, player, card.id, pay, events);
        return resolveAfterAction(s, player, events);
      }
      return 'E_BAD_BUY_TARGET';
    }
    case 'discard':
    case 'chooseNoble':
      return 'E_PHASE_NOT_ALLOWED';
    case 'pass': {
      // 仅在确实无任何动作可选时合法（银行耗尽且无法购卡/预定的死锁局面）
      if (legalActions(s, player).length > 0) return 'E_CANNOT_PASS';
      s.consecutivePasses++;
      return finishTurn(s, events);
    }
    default:
      return 'E_UNKNOWN_MOVE';
  }
}

/** 校验显式支付（若提供）并返回最终支付方案；错误返回字符串 */
function resolvePayment(player: PlayerState, card: CardDef, pay?: Partial<Tokens>): Tokens | string {
  if (pay) {
    const err = validatePayment(player, card, pay);
    if (err) return err;
    return normalizePayment(pay);
  }
  const auto = defaultPayment(player, card);
  if (!auto) return 'E_CANNOT_PAY';
  return auto;
}

function commitPurchase(s: GameState, player: PlayerState, cardId: number, pay: Tokens, events: GameEvent[]): void {
  const card = cardById(cardId);
  for (const k of ALL_TOKEN_COLORS) {
    const v = pay[k];
    if (v > 0) {
      player.tokens[k] -= v;
      s.bank[k] += v;
    }
  }
  player.bonuses[card.bonus]++;
  player.cardPoints += card.points;
  player.purchased.push(card.id);
  events.push({ type: 'card-bought', seat: player.seat, cardId, paid: pay });
}

function refillBoard(s: GameState, tier: 1 | 2 | 3, slot: number, events: GameEvent[]): void {
  const deck = s.decks[tier - 1]!;
  if (deck.length > 0) {
    s.board[tier - 1]![slot] = deck.pop()!;
    events.push({ type: 'board-refilled', tier, slot });
  }
}

// ---------------- 结算链：贵族 → 归还令牌 → 结束回合 ----------------

function resolveAfterAction(s: GameState, player: PlayerState, events: GameEvent[]): string | null {
  const eligible = s.nobles.filter((id) => nobleSatisfied(player, nobleById(id)));
  if (eligible.length === 1) {
    visitNoble(s, player, eligible[0]!, events);
  } else if (eligible.length > 1) {
    s.pending = { player: player.seat, options: eligible };
    s.phase = 'choosing-noble';
    events.push({ type: 'noble-choice-required', seat: player.seat, options: eligible });
    log(s, player.seat, 'noble-choice', { count: eligible.length });
    return null;
  }
  return afterNoble(s, player, events);
}

function afterNoble(s: GameState, player: PlayerState, events: GameEvent[]): string | null {
  const total = totalTokens(player.tokens);
  if (total > 10) {
    s.pending = { player: player.seat, total };
    s.phase = 'discarding';
    events.push({ type: 'discard-required', seat: player.seat, total });
    return null;
  }
  return finishTurn(s, events);
}

function finishTurn(s: GameState, events: GameEvent[]): string | null {
  s.turnsTaken[s.current] = (s.turnsTaken[s.current] ?? 0) + 1;

  // 死锁：连续一整轮无人可行动 -> 按当前分数结算（官方规则未覆盖的边界情况）
  if (s.consecutivePasses >= s.playerCount) {
    endGame(s, events, 'deadlock');
    return null;
  }

  if (!s.finalRound && s.players.some((p) => totalPointsOf(p) >= 15)) {
    s.finalRound = true;
    s.finalTriggered = s.current;
    events.push({ type: 'final-round', triggeredBy: s.current });
    log(s, s.current, 'final-round');
  }

  const done = s.turnsTaken.every((t) => t === s.turnsTaken[0]);
  if (s.finalRound && done) {
    endGame(s, events, 'normal');
    return null;
  }

  s.pending = null;
  s.current = (s.current + 1) % s.playerCount;
  s.turn++;
  s.phase = 'playing';
  events.push({ type: 'turn-start', seat: s.current });
  return null;
}

function endGame(s: GameState, events: GameEvent[], reason: 'normal' | 'deadlock'): void {
  const winners = determineWinners(s.players);
  s.winners = winners;
  s.endReason = reason;
  s.phase = 'ended';
  s.pending = null;
  events.push({ type: 'game-end', winners });
  log(s, null, reason === 'deadlock' ? 'game-end-deadlock' : 'game-end', { winners: winners.join(',') });
}

function totalPointsOf(p: PlayerState): number {
  return p.cardPoints + p.nobles.length * 3;
}

function nobleSatisfied(player: PlayerState, noble: NobleDef): boolean {
  return COLORS.every((c) => player.bonuses[c] >= noble.requirement[c]);
}

function visitNoble(s: GameState, player: PlayerState, nobleId: number, events: GameEvent[]): void {
  s.nobles = s.nobles.filter((id) => id !== nobleId);
  player.nobles.push(nobleId);
  events.push({ type: 'noble-visit', seat: player.seat, nobleId });
  log(s, player.seat, 'noble-visit', { nobleId });
}

// ---------------- 归还与贵族选择 ----------------

function applyDiscard(s: GameState, move: Move, player: PlayerState, events: GameEvent[]): string | null {
  if (move.type !== 'discard') return 'E_NEED_DISCARD';
  const need = totalTokens(player.tokens) - 10;
  if (need <= 0) return 'E_NO_DISCARD_NEEDED';
  let sum = 0;
  for (const k of ALL_TOKEN_COLORS) {
    const v = move.tokens[k] ?? 0;
    if (!Number.isInteger(v) || v < 0) return `E_DISCARD_BAD:${k}`;
    if (v > player.tokens[k]) return `E_DISCARD_OVER:${k}`;
    sum += v;
  }
  if (sum !== need) return `E_DISCARD_EXACT:${need}`;

  const returned = emptyTokens();
  for (const k of ALL_TOKEN_COLORS) {
    const v = move.tokens[k] ?? 0;
    if (v > 0) {
      player.tokens[k] -= v;
      s.bank[k] += v;
      returned[k] = v;
    }
  }
  events.push({ type: 'tokens-returned', seat: player.seat, tokens: returned });
  s.pending = null;
  s.phase = 'playing';
  return finishTurn(s, events);
}

function applyChooseNoble(s: GameState, move: Move, player: PlayerState, events: GameEvent[]): string | null {
  if (move.type !== 'chooseNoble') return 'E_NEED_NOBLE';
  const pending = s.pending as PendingNoble;
  if (!pending.options.includes(move.nobleId)) return 'E_NOBLE_INVALID';
  visitNoble(s, player, move.nobleId, events);
  s.pending = null;
  s.phase = 'playing';
  return afterNoble(s, player, events);
}

function log(s: GameState, seat: number | null, key: string, params?: Record<string, string | number | boolean>): void {
  if (s.log.length >= MAX_LOG) return;
  s.log.push(makeLogEntry(s.turn, seat, key, params));
}

export function pendingDiscard(s: GameState): PendingDiscard | null {
  return s.phase === 'discarding' ? (s.pending as PendingDiscard) : null;
}

export function pendingNoble(s: GameState): PendingNoble | null {
  return s.phase === 'choosing-noble' ? (s.pending as PendingNoble) : null;
}
