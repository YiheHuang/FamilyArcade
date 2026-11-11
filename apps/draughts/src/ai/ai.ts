import {
  apply,
  colOf,
  isKing,
  legalMoves,
  rowOf,
  sideOf,
  type GameState,
  type Move,
  type Side,
} from '../game/draughts';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type HintReason =
  | 'win'
  | 'multi-capture'
  | 'capture'
  | 'promote'
  | 'block'
  | 'king-safety'
  | 'develop';

export interface Choice {
  move: Move;
  reason: HintReason;
  score: number;
}

type Rng = () => number;

const MAN_VALUE = 100;
const KING_VALUE = 170;
const WIN_SCORE = 100_000;

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)] ?? items[0];
}

/** Material, advancement, back-row guard and central control. */
export function evaluate(state: GameState, me: Side): number {
  if (state.status === 'won') {
    return state.winner === me ? WIN_SCORE - state.plies : -WIN_SCORE + state.plies;
  }
  if (state.status === 'draw') return 0;

  let score = 0;
  for (let square = 0; square < state.board.length; square++) {
    const piece = state.board[square];
    if (!piece) continue;
    const side = sideOf(piece);
    const sign = side === me ? 1 : -1;
    const row = rowOf(square);
    const col = colOf(square);
    if (isKing(piece)) {
      score += sign * (KING_VALUE + 6);
      continue;
    }
    const advance = side === 'red' ? 7 - row : row;
    const backRow = side === 'red' ? 7 : 0;
    const backGuard = row === backRow ? 8 : 0;
    const centre = row >= 2 && row <= 5 && col >= 2 && col <= 5 ? 5 : 0;
    score += sign * (MAN_VALUE + advance * 4 + backGuard + centre);
  }
  return score;
}

function orderedMoves(state: GameState): Move[] {
  return legalMoves(state)
    .slice()
    .sort((a, b) => {
      const byCaptures = b.captures.length - a.captures.length;
      if (byCaptures !== 0) return byCaptures;
      return Number(b.promote) - Number(a.promote);
    });
}

function searchMoves(
  state: GameState,
  me: Side,
  depth: number,
  alpha: number,
  beta: number,
  qDepth: number,
): number {
  const moves = orderedMoves(state);
  const maximizing = state.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const next = apply(state, move).state;
    const score = search(next, me, depth, alpha, beta, qDepth);
    if (maximizing) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

function search(
  state: GameState,
  me: Side,
  depth: number,
  alpha: number,
  beta: number,
  qDepth: number,
): number {
  if (state.status !== 'playing') return evaluate(state, me);
  if (depth <= 0) {
    if (qDepth > 0) {
      const moves = legalMoves(state);
      if (moves.some((move) => move.captures.length > 0)) {
        return searchMoves(state, me, 0, alpha, beta, qDepth - 1);
      }
    }
    return evaluate(state, me);
  }
  return searchMoves(state, me, depth - 1, alpha, beta, qDepth);
}

function bestChoices(state: GameState, depth: number): { moves: Move[]; score: number } {
  const me = state.turn;
  let best = -Infinity;
  let picks: Move[] = [];
  let alpha = -Infinity;
  for (const move of orderedMoves(state)) {
    const next = apply(state, move).state;
    const score = search(next, me, depth - 1, alpha, Infinity, 2);
    if (score > best + 1e-9) {
      best = score;
      picks = [move];
    } else if (Math.abs(score - best) < 1e-9) {
      picks.push(move);
    }
    if (best > alpha) alpha = best;
  }
  if (picks.length === 0) picks = legalMoves(state);
  return { moves: picks, score: best };
}

export function reasonFor(state: GameState, move: Move): HintReason {
  const piece = state.board[move.from];
  const next = apply(state, move).state;
  if (next.status === 'won' && next.winner === state.turn) return 'win';
  if (move.captures.length >= 2) return 'multi-capture';
  if (move.captures.length === 1) return 'capture';
  if (move.promote) return 'promote';
  if (piece && isKing(piece)) return 'king-safety';

  if (next.status === 'playing') {
    const replies = legalMoves(next);
    const dangerous = replies.some((reply) => reply.captures.length > 0);
    if (!dangerous) {
      const alternatives = legalMoves(state).some((candidate) => {
        const after = apply(state, candidate).state;
        return (
          after.status === 'playing' &&
          legalMoves(after).some((reply) => reply.captures.length > 0)
        );
      });
      if (alternatives) return 'block';
    }
  }
  return 'develop';
}

export function chooseWithReason(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): Choice | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  if (level === 'easy') {
    const move = pick(moves, rng);
    return { move, reason: reasonFor(state, move), score: 0 };
  }

  if (level === 'companion') {
    const fewest = Math.min(...moves.map((move) => move.captures.length));
    const gentle = moves.filter((move) => move.captures.length === fewest);
    const safe = gentle.filter((move) => {
      const next = apply(state, move).state;
      if (next.status !== 'playing') return true;
      return !legalMoves(next).some((reply) => reply.captures.length > 0);
    });
    const pool = safe.length > 0 ? safe : gentle;
    const move = pick(pool, rng);
    return { move, reason: reasonFor(state, move), score: 0 };
  }

  const depth = level === 'normal' ? 2 : 5;
  const result = bestChoices(state, depth);
  const move = pick(result.moves, rng);
  return { move, reason: reasonFor(state, move), score: result.score };
}

export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): Move | null {
  return chooseWithReason(state, level, rng)?.move ?? null;
}
