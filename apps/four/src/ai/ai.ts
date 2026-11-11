/**
 * Four · four AI personalities.
 *
 * All choices are deterministic given the same position and injected RNG.
 * Easy uses randomness on purpose; Companion uses it to leave openings for a
 * child. Normal searches two plies. Hard searches five plies with alpha-beta
 * pruning and a window-based evaluation.
 */

import {
  COLS,
  apply,
  legalColumns,
  type Cell,
  type Disc,
  type GameState,
} from '../game/four';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

/** Reason shown with a hint. */
export type HintReason = 'win' | 'block' | 'build';

export interface Hint {
  column: number;
  reason: HintReason;
}

type Rng = () => number;

/** Centre-first order makes ties feel natural and keeps the search deterministic. */
const PREFERENCE = [3, 2, 4, 1, 5, 0, 6] as const;

const WIN = 1_000_000;

function orderedColumns(state: GameState): number[] {
  const legal = new Set(legalColumns(state));
  return PREFERENCE.filter((col) => legal.has(col));
}

function pick(items: number[], rng: Rng): number {
  if (items.length === 0) return -1;
  const index = Math.floor(rng() * items.length);
  return items[Math.max(0, Math.min(items.length - 1, index))];
}

function firstWinning(state: GameState): number {
  for (const col of orderedColumns(state)) {
    if (apply(state, col).state.status === 'won') return col;
  }
  return -1;
}

/** Columns where `disc` would win immediately on this board. */
function winningColumnsFor(state: GameState, disc: Disc): number[] {
  const trial: GameState = { ...state, turn: disc };
  return legalColumns(trial).filter((col) => apply(trial, col).state.status === 'won');
}

/** Opponent's immediate winning columns (the threats we must block). */
function opponentThreats(state: GameState): number[] {
  return winningColumnsFor(state, state.turn === 'R' ? 'Y' : 'R');
}

/** Score a full board window from `me`'s point of view. */
function scoreWindow(window: number[], board: Cell[], me: Disc): number {
  let mine = 0;
  let theirs = 0;
  let empty = 0;
  for (const index of window) {
    const cell = board[index];
    if (cell === null) empty += 1;
    else if (cell === me) mine += 1;
    else theirs += 1;
  }
  const opp = me === 'R' ? 'Y' : 'R';
  void opp;
  if (mine > 0 && theirs > 0) return 0;
  if (mine === 4) return WIN;
  if (theirs === 4) return -WIN;
  if (mine === 3) return 60;
  if (theirs === 3) return -80;
  if (mine === 2) return 12;
  if (theirs === 2) return -14;
  if (mine === 1) return 1;
  if (theirs === 1) return -1;
  return 0;
}

/**
 * Position score. Positive is good for `me`. Centre control is worth a little;
 * three-in-a-window with one gap is worth a lot.
 */
export function evaluate(board: Cell[], me: Disc): number {
  let score = 0;
  const centre = 3;
  for (let row = 0; row < 6; row++) {
    const cell = board[row * COLS + centre];
    if (cell === me) score += 8;
    else if (cell !== null) score -= 8;
  }
  for (const window of WINDOWS_LOCAL) {
    score += scoreWindow(window, board, me);
  }
  return score;
}

// Local copy so the AI module does not need to allocate or expose engine internals.
const WINDOWS_LOCAL: number[][] = (() => {
  const result: number[][] = [];
  const at = (row: number, col: number) => row * COLS + col;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      result.push([at(row, col), at(row, col + 1), at(row, col + 2), at(row, col + 3)]);
    }
  }
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      result.push([at(row, col), at(row + 1, col), at(row + 2, col), at(row + 3, col)]);
    }
  }
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      result.push([
        at(row, col),
        at(row + 1, col + 1),
        at(row + 2, col + 2),
        at(row + 3, col + 3),
      ]);
    }
  }
  for (let row = 3; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      result.push([
        at(row, col),
        at(row - 1, col + 1),
        at(row - 2, col + 2),
        at(row - 3, col + 3),
      ]);
    }
  }
  return result;
})();

function terminalScore(state: GameState, me: Disc, depth: number): number | null {
  if (state.status === 'won') {
    return state.winner === me ? WIN + depth * 100 : -WIN - depth * 100;
  }
  if (state.status === 'draw') return 0;
  return null;
}

function minimax(
  state: GameState,
  me: Disc,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const terminal = terminalScore(state, me, depth);
  if (terminal !== null) return terminal;
  if (depth === 0) return evaluate(state.board, me);

  const moves = orderedColumns(state);
  if (state.turn === me) {
    let best = -Infinity;
    for (const col of moves) {
      const next = apply(state, col).state;
      best = Math.max(best, minimax(next, me, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const col of moves) {
    const next = apply(state, col).state;
    best = Math.min(best, minimax(next, me, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function searchMove(state: GameState, depth: number): number {
  const me = state.turn;
  const win = firstWinning(state);
  if (win >= 0) return win;
  // If the opponent can win in one, only a block can save the game.
  const threats = opponentThreats(state);
  const candidates = threats.length > 0 ? threats : orderedColumns(state);
  let best = -Infinity;
  let choice = -1;
  for (const col of candidates) {
    const next = apply(state, col).state;
    const score = minimax(next, me, depth - 1, -Infinity, Infinity);
    if (score > best) {
      best = score;
      choice = col;
    }
  }
  return choice;
}

/** Companion's gentle shortlist: stay near the middle and do not build traps. */
function gentleMove(state: GameState): number {
  const legal = orderedColumns(state);
  if (legal.length === 0) return -1;
  return legal[0];
}

export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number {
  const moves = legalColumns(state);
  if (moves.length === 0) return -1;

  if (level === 'easy') {
    // Pure random among legal columns — the "first games" opponent.
    return pick(moves, rng);
  }

  if (level === 'companion') {
    const win = firstWinning(state);
    if (win >= 0) {
      // Take the win only sometimes; a child should get chances to win too.
      return rng() < 0.35 ? win : gentleMove(state);
    }
    const threats = opponentThreats(state);
    if (threats.length > 0) {
      // Blocks most threats, but deliberately misses some.
      if (rng() < 0.7) return pick(threats, rng);
      const safe = moves.filter((col) => !threats.includes(col));
      return safe.length > 0 ? safe[0] : threats[0];
    }
    return gentleMove(state);
  }

  if (level === 'normal') {
    // 2-ply: my drop, your best reply.
    return searchMove(state, 2);
  }

  // Hard: five plies, alpha-beta, centre-first ordering.
  return searchMove(state, 5);
}

/**
 * Advice for the hint button. Uses the Hard search but also explains the
 * tactical reason in a way the UI can translate.
 */
export function hintMove(state: GameState): Hint {
  const legal = legalColumns(state);
  if (legal.length === 0) return { column: -1, reason: 'build' };

  const win = firstWinning(state);
  if (win >= 0) return { column: win, reason: 'win' };

  const threats = opponentThreats(state);
  if (threats.length > 0) return { column: threats[0], reason: 'block' };

  return { column: searchMove(state, 5), reason: 'build' };
}
