import {
  apply,
  counts,
  flipsFrom,
  legalMoves,
  legalMovesFor,
  other,
  type Disc,
  type GameState,
} from '../game/flip';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const CORNERS = [0, 7, 56, 63] as const;
const RISKY = [1, 6, 8, 9, 14, 15, 48, 49, 54, 55, 57, 62] as const;

/** Classic Reversi positional weights: corners are gold, X-squares are poison. */
const WEIGHTS: readonly number[] = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

const isCorner = (index: number): boolean => CORNERS.includes(index as 0 | 7 | 56 | 63);

function frontierCount(board: readonly (Disc | null)[], disc: Disc): number {
  let count = 0;
  for (let index = 0; index < 64; index += 1) {
    if (board[index] !== disc) continue;
    const row = Math.floor(index / 8);
    const col = index % 8;
    let touchesEmpty = false;
    for (let dr = -1; dr <= 1 && !touchesEmpty; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === null) {
          touchesEmpty = true;
          break;
        }
      }
    }
    if (touchesEmpty) count += 1;
  }
  return count;
}

/** Static evaluation from `me`'s perspective. */
export function evaluate(state: GameState, me: Disc): number {
  if (state.status === 'won') return state.winner === me ? 100000 : -100000;
  if (state.status === 'draw') return 0;

  const opponent = other(me);
  const score = counts(state.board);
  let value = 0;
  for (let index = 0; index < 64; index += 1) {
    if (state.board[index] === me) value += WEIGHTS[index];
    else if (state.board[index] === opponent) value -= WEIGHTS[index];
  }

  const myMoves = legalMovesFor(state.board, me).length;
  const oppMoves = legalMovesFor(state.board, opponent).length;
  value += (myMoves - oppMoves) * 15;
  value += (frontierCount(state.board, opponent) - frontierCount(state.board, me)) * 6;

  const empties = 64 - score.B - score.W;
  if (empties <= 14) value += (score[me] - score[opponent]) * 12;

  return value;
}

function orderedMoves(state: GameState): number[] {
  return legalMoves(state).sort((a, b) => {
    const cornerDelta = Number(isCorner(b)) - Number(isCorner(a));
    if (cornerDelta !== 0) return cornerDelta;
    return WEIGHTS[b] - WEIGHTS[a] || a - b;
  });
}

function search(
  state: GameState,
  me: Disc,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (state.status !== 'playing') {
    if (state.status === 'draw') return 0;
    return state.winner === me ? 100000 + depth : -100000 - depth;
  }
  if (depth <= 0) return evaluate(state, me);

  const moves = orderedMoves(state);
  if (moves.length === 0) return evaluate(state, me);

  const maximizing = state.turn === me;
  let best = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const next = apply(state, move).state;
    const value = search(next, me, depth - 1, alpha, beta);
    if (maximizing) {
      if (value > best) best = value;
      if (value > alpha) alpha = value;
    } else {
      if (value < best) best = value;
      if (value < beta) beta = value;
    }
    if (alpha >= beta) break;
  }
  return best;
}

function bestPicks(state: GameState, me: Disc, depth: number): number[] {
  let best = -Infinity;
  let picks: number[] = [];
  for (const move of orderedMoves(state)) {
    const next = apply(state, move).state;
    const value =
      depth <= 1
        ? evaluate(next, me)
        : search(next, me, depth - 1, -Infinity, Infinity);
    if (value > best + 1e-9) {
      best = value;
      picks = [move];
    } else if (Math.abs(value - best) < 1e-9) {
      picks.push(move);
    }
  }
  return picks;
}

function pick(items: number[], rng: Rng): number {
  if (items.length === 0) return -1;
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[Math.max(0, index)];
}

function companionMove(state: GameState, rng: Rng): number {
  const me = state.turn;
  const opponent = other(me);
  const moves = legalMoves(state);
  const ownCorners = CORNERS.filter((corner) => state.board[corner] === me).length;

  // Gentle rule from the brief: once Companion holds a corner, it leaves the
  // remaining early corners for the child. If corners are the only moves left,
  // it must of course take one.
  let pool = moves;
  if (state.moves.length < 26 && ownCorners >= 1) {
    const gentle = moves.filter((move) => !isCorner(move));
    if (gentle.length > 0) pool = gentle;
  }

  if (rng() < 0.28) return pick(pool, rng);

  const ranked = pool
    .map((move) => {
      const flips = flipsFrom(state.board, move, me).length;
      const next = apply(state, move).state;
      const own = legalMovesFor(next.board, me).length;
      const opp = legalMovesFor(next.board, opponent).length;
      const quiet = evaluate(next, me) * 0.02 + (own - opp) * 0.9 - flips * 0.7;
      return { move, score: quiet };
    })
    .sort((a, b) => b.score - a.score || a.move - b.move);

  return pick(ranked.slice(0, Math.min(3, ranked.length)).map((item) => item.move), rng);
}

/**
 * Pick a move for one of four levels. All randomness comes through `rng`, so a
 * fixed RNG gives a fully deterministic move. Hard searches four plies.
 */
export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;
  const me = state.turn;

  if (level === 'easy') {
    if (rng() < 0.45) return pick(moves, rng);
    return bestPicks(state, me, 1)[0] ?? pick(moves, rng);
  }

  if (level === 'companion') return companionMove(state, rng);

  if (level === 'normal') {
    if (rng() < 0.16) return pick(moves, rng);
    return bestPicks(state, me, 2)[0] ?? pick(moves, rng);
  }

  return bestPicks(state, me, 4)[0] ?? pick(moves, rng);
}

export type HintReason = 'corner' | 'safe' | 'flips' | 'mobility' | 'best';

export interface Hint {
  move: number;
  reason: HintReason;
  flips: number;
  ownMoves: number;
  oppMoves: number;
}

/**
 * A strong suggestion plus a human reason. The reason is derived from the actual
 * position: corner safety, corner risk, flip count, or mobility.
 */
export function chooseHint(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const move = chooseMove(state, 'hard');
  if (move < 0) return null;

  const me = state.turn;
  const opponent = other(me);
  const flips = flipsFrom(state.board, move, me).length;
  const next = apply(state, move).state;
  const ownMoves = legalMovesFor(next.board, me).length;
  const oppMoves = legalMovesFor(next.board, opponent).length;
  const opponentCorners = legalMovesFor(next.board, opponent).filter((index) =>
    isCorner(index),
  ).length;

  let reason: HintReason = 'best';
  if (isCorner(move)) reason = 'corner';
  else if (RISKY.includes(move as (typeof RISKY)[number]) && opponentCorners === 0) {
    reason = 'safe';
  } else if (flips >= 2) {
    reason = 'flips';
  } else if (ownMoves >= oppMoves) {
    reason = 'mobility';
  }

  return { move, reason, flips, ownMoves, oppMoves };
}
