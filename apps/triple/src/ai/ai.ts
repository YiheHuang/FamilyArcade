import { apply, legalMoves, winningLine, type GameState, type Mark } from '../game/triple';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const opponent = (mark: Mark): Mark => (mark === 'X' ? 'O' : 'X');

function minimax(state: GameState, me: Mark, depth: number, alpha: number, beta: number): number {
  if (state.status === 'won') return state.winner === me ? 10 - depth : depth - 10;
  if (state.status === 'draw') return 0;
  const maximizing = state.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of legalMoves(state)) {
    const next = apply(state, move).state;
    const score = minimax(next, me, depth + 1, alpha, beta);
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function bestBy(state: GameState, score: (next: GameState) => number): number {
  let best = -Infinity;
  let picks: number[] = [];
  for (const move of legalMoves(state)) {
    const next = apply(state, move).state;
    const value = score(next);
    if (value > best + 1e-9) {
      best = value;
      picks = [move];
    } else if (Math.abs(value - best) < 1e-9) {
      picks.push(move);
    }
  }
  return picks[0] ?? -1;
}

export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;
  const me = state.turn;
  const pick = (items: number[]) => items[Math.floor(rng() * items.length)] ?? items[0];

  if (level === 'easy') {
    if (rng() < 0.45) return pick(moves);
    return bestBy(state, (next) => {
      const line = winningLine(next.board);
      if (line && next.winner === me) return 100;
      return next.board[4] === me ? 2 : 0;
    });
  }

  if (level === 'companion') {
    // Take a win, block a loss, otherwise prefer the middle and corners.
    for (const move of moves) {
      if (apply(state, move).state.winner === me) return move;
    }
    const opp = opponent(me);
    const safe = moves.filter((move) => {
      const next = apply(state, move).state;
      if (next.status !== 'playing') return true;
      return !legalMoves(next).some((reply) => apply(next, reply).state.winner === opp);
    });
    const preferences = [4, 0, 2, 6, 8, 1, 3, 5, 7].filter((cell) => safe.includes(cell));
    return preferences[0] ?? safe[0] ?? pick(moves);
  }

  if (level === 'normal') {
    if (rng() < 0.18) return pick(moves);
    return bestBy(state, (next) => minimax(next, me, 0, -Infinity, Infinity));
  }

  return bestBy(state, (next) => minimax(next, me, 0, -Infinity, Infinity));
}
