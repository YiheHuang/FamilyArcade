import {
  CAPTURES_TO_WIN,
  apply,
  distanceFromCenter,
  legalMoves,
  neighbor,
  other,
  AXES,
  OPPOSITE,
  POINTS,
  type GameState,
  type Move,
  type Player,
} from '../game/abalone';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const WIN = 1_000_000;

function evaluate(state: GameState, me: Player): number {
  if (state.status === 'won') return state.winner === me ? WIN : -WIN;

  const opp = other(me);
  let score = (state.captured[me] - state.captured[opp]) * 780;

  if (state.captured[me] === 5) score += 120;
  if (state.captured[opp] === 5) score -= 150;

  for (const point of POINTS) {
    const cell = state.board[point.index];
    if (!cell) continue;
    const sign = cell === me ? 1 : -1;
    const centre = 4 - distanceFromCenter(point.index);
    score += sign * centre * 7;

    if (centre === 0) score -= sign * 10;

    for (const axis of AXES) {
      const forward = neighbor(point.index, axis);
      if (forward >= 0 && state.board[forward] === cell) {
        score += sign * 3;
        const second = neighbor(forward, axis);
        if (second >= 0 && state.board[second] === cell) score += sign * 4;
      }

      if (forward >= 0 && state.board[forward] === other(cell)) {
        const behind = neighbor(point.index, OPPOSITE[axis]);
        if (behind >= 0 && state.board[behind] === cell) {
          const beyond = neighbor(forward, axis);
          if (beyond < 0 || state.board[beyond] === null) score += sign * 8;
        }
      }
    }
  }

  return score;
}

function rankMoves(state: GameState, perspective: Player, limit: number): Move[] {
  const scored = legalMoves(state).map((move) => {
    const next = apply(state, move).state;
    let value = evaluate(next, perspective);
    if (next.status === 'won') value += WIN;
    if (next.captured[perspective] > state.captured[perspective]) value += 420;
    return { move, value };
  });
  scored.sort((a, b) => b.value - a.value);
  return scored.slice(0, limit).map((item) => item.move);
}

function search(
  state: GameState,
  me: Player,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (state.status === 'won') {
    return state.winner === me ? WIN - (10 - depth) * 10 : -WIN + (10 - depth) * 10;
  }
  if (depth <= 0) return evaluate(state, me);

  const maximising = state.turn === me;
  const limit = depth > 1 ? 12 : 10;
  const moves = rankMoves(state, state.turn, limit);
  if (moves.length === 0) return evaluate(state, me);

  let best = maximising ? -Infinity : Infinity;
  for (const move of moves) {
    const next = apply(state, move).state;
    const value = search(next, me, depth - 1, alpha, beta);
    if (maximising) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)] ?? items[0];
}

function bestRoot(
  state: GameState,
  me: Player,
  depth: number,
  limit: number,
  rng: Rng,
): Move | null {
  const moves = rankMoves(state, me, limit);
  if (moves.length === 0) return null;

  let best = -Infinity;
  let picks: Move[] = [];
  for (const move of moves) {
    const next = apply(state, move).state;
    const value = search(next, me, depth, -Infinity, Infinity);
    if (value > best + 1e-9) {
      best = value;
      picks = [move];
    } else if (Math.abs(value - best) < 1e-9) {
      picks.push(move);
    }
  }
  return pick(picks, rng);
}

function winningMove(state: GameState): Move | null {
  for (const move of legalMoves(state)) {
    const next = apply(state, move).state;
    if (next.status === 'won' && next.winner === state.turn) return move;
  }
  return null;
}

function hasWinningMoveFor(state: GameState, player: Player): boolean {
  if (state.captured[player] < CAPTURES_TO_WIN - 1) return false;
  const probe: GameState = { ...state, turn: player, status: 'playing', winner: null };
  for (const move of legalMoves(probe)) {
    const next = apply(probe, move).state;
    if (next.status === 'won' && next.winner === player) return true;
  }
  return false;
}

/** Greedy ordering for the gentle level: captures matter less, shape matters more. */
function gentleMove(state: GameState, rng: Rng): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const scored = moves.map((move) => {
    const next = apply(state, move).state;
    const browser = evaluate(next, state.turn);
    const capture = next.captured[state.turn] - state.captured[state.turn];
    return { move, value: browser - capture * 520 };
  });
  scored.sort((a, b) => b.value - a.value);
  return pick(scored.slice(0, 3), rng).move;
}

export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): Move | null {
  if (state.status !== 'playing') return null;
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  if (level === 'companion') {
    const win = winningMove(state);
    if (win) return win;
    return gentleMove(state, rng) ?? pick(moves, rng);
  }

  if (level === 'easy') {
    if (rng() < 0.38) return pick(moves, rng);
    const win = rng() < 0.78 ? winningMove(state) : null;
    if (win) return win;
    const ranked = rankMoves(state, state.turn, 5);
    return pick(ranked.slice(0, 2), rng);
  }

  if (level === 'normal') {
    if (rng() < 0.14) return pick(rankMoves(state, state.turn, 4), rng);
    const win = winningMove(state);
    if (win) return win;
    return bestRoot(state, state.turn, 1, 16, rng);
  }

  const win = winningMove(state);
  if (win) return win;
  return bestRoot(state, state.turn, 2, 20, rng);
}

export type HintKind = 'win' | 'defend' | 'capture' | 'push' | 'centre';

export interface Hint {
  move: Move;
  kind: HintKind;
}

/**
 * A useful nudge for the current player. The hard searcher picks the move;
 * the label explains the idea without pretending the AI is perfect.
 */
export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const move = chooseMove(state, 'hard', () => 0.37);
  if (!move) return null;

  const opponent = other(state.turn);
  const next = apply(state, move).state;
  if (next.status === 'won' && next.winner === state.turn) {
    return { move, kind: 'win' };
  }

  if (hasWinningMoveFor(state, opponent) && !hasWinningMoveFor(next, opponent)) {
    return { move, kind: 'defend' };
  }

  const captured = next.captured[state.turn] - state.captured[state.turn];
  if (captured > 0) return { move, kind: 'capture' };

  // A move that strengthens a two-marble push lane is called a push.
  const ordered = move.cells;
  if (ordered.length >= 2) return { move, kind: 'push' };
  const front = ordered[0];
  for (const axis of AXES) {
    const ahead = neighbor(front, axis);
    const behind = neighbor(front, OPPOSITE[axis]);
    if (ahead >= 0 && state.board[ahead] === state.turn) {
      if (behind >= 0 && state.board[behind] === state.turn) return { move, kind: 'push' };
    }
  }

  return { move, kind: 'centre' };
}
