import {
  applyAction,
  legalActions,
  other,
  winningCells,
  type GameAction,
  type GameState,
  type Player,
} from '../game/quarto';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const WIN = 1_000_000;
const PLACE_ORDER = [5, 6, 9, 10, 1, 2, 4, 7, 8, 11, 13, 14, 0, 3, 12, 15];

interface Budget {
  nodes: number;
  maxNodes: number;
}

function safeRng(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(0.999999, value));
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(safeRng(rng) * items.length)] ?? items[0];
}

function emptyCells(state: GameState): number[] {
  return state.board.flatMap((cell, index) => (cell === null ? [index] : []));
}

function safeChoices(state: GameState): number[] {
  return state.pool.filter((piece) => winningCells(state.board, piece).length === 0);
}

/**
 * Static evaluation from `me`'s point of view.
 *
 * The player whose turn it is is always the player who picks the next piece
 * (immediately, or right after placing the current one). That "chooser" wants
 * plenty of safe pieces in the pool: a safe piece cannot complete a line for
 * the opponent. No safe piece at all means the opponent wins on the next place.
 */
function evaluate(state: GameState, me: Player): number {
  if (state.status === 'won') return state.winner === me ? WIN - state.actions.length : -WIN + state.actions.length;
  if (state.status === 'draw') return 0;

  const actor = state.turn;
  const sign = actor === me ? 1 : -1;
  if (state.pool.length === 0) return 0;

  const safe = safeChoices(state).length;
  if (safe === 0) return -sign * (WIN / 2);

  let score = sign * safe * 20;
  score -= sign * (state.pool.length - safe) * 12;
  if (state.phase === 'place' && state.selected !== null) {
    if (winningCells(state.board, state.selected).length === 0) score += sign * 2;
  }
  return score;
}

function chooseOrder(state: GameState): number[] {
  const safe = safeChoices(state);
  if (safe.length > 0) return [...safe].sort((a, b) => a - b);
  return [...state.pool].sort((a, b) => {
    const danger = winningCells(state.board, a).length - winningCells(state.board, b).length;
    return danger !== 0 ? danger : a - b;
  });
}

function orderedActions(state: GameState): GameAction[] {
  if (state.phase === 'choose') {
    return chooseOrder(state).map((piece) => ({ type: 'choose' as const, piece }));
  }
  if (state.selected === null) return [];
  const wins = winningCells(state.board, state.selected);
  if (wins.length > 0) return wins.map((cell) => ({ type: 'place' as const, cell }));
  return PLACE_ORDER.filter((cell) => state.board[cell] === null).map((cell) => ({
    type: 'place' as const,
    cell,
  }));
}

function search(
  state: GameState,
  me: Player,
  depth: number,
  alpha: number,
  beta: number,
  budget: Budget,
): number {
  budget.nodes += 1;
  if (state.status === 'won') {
    return state.winner === me ? WIN - state.actions.length : -WIN + state.actions.length;
  }
  if (state.status === 'draw') return 0;
  if (depth <= 0 || budget.nodes >= budget.maxNodes) return evaluate(state, me);

  const maximizing = state.turn === me;
  const actions = orderedActions(state);
  if (actions.length === 0) return evaluate(state, me);

  let best = maximizing ? -Infinity : Infinity;
  for (const action of actions) {
    const applied = applyAction(state, action);
    if (!applied.ok) continue;
    const value = search(applied.state, me, depth - 1, alpha, beta, budget);

    if (maximizing) {
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

/**
 * Iterative-deepening root search. The first pass at depth 2 always completes,
 * so an interrupted deeper pass cannot throw away a sane action.
 */
function rootSearch(
  state: GameState,
  me: Player,
  maxDepth: number,
  maxNodes: number,
): GameAction | null {
  const initial = orderedActions(state);
  if (initial.length === 0) return null;

  const budget: Budget = { nodes: 0, maxNodes };
  let order = initial;
  let best: GameAction = initial[0];
  let completeBest: GameAction | null = null;

  for (let depth = 2; depth <= maxDepth; depth += 2) {
    let localBest: GameAction | null = null;
    let localScore = -Infinity;
    let alpha = -Infinity;
    let complete = true;

    for (const action of order) {
      if (budget.nodes >= maxNodes) {
        complete = false;
        break;
      }
      const applied = applyAction(state, action);
      if (!applied.ok) continue;
      const value = search(applied.state, me, depth - 1, alpha, Infinity, budget);
      if (value > localScore + 1e-9) {
        localScore = value;
        localBest = action;
      }
      if (value > alpha) alpha = value;
    }

    if (localBest && complete) {
      best = localBest;
      completeBest = localBest;
      order = [localBest, ...order.filter((action) => action !== localBest)];
    } else if (localBest && completeBest === null) {
      best = localBest;
    }

    if (!complete || budget.nodes >= maxNodes) break;
    if (localScore >= WIN - 64) break;
  }

  return completeBest ?? best;
}

/** Count safe pieces after a hypothetical placement; used by Companion. */
function quietPlacementScore(state: GameState, cell: number): number {
  const applied = applyAction(state, { type: 'place', cell });
  if (!applied.ok) return -Infinity;
  const next = applied.state;
  if (next.status === 'won') return next.winner === state.turn ? WIN : -WIN;
  if (next.status === 'draw') return 0;
  return safeChoices(next).length;
}

function companionAction(state: GameState, rng: Rng): GameAction {
  if (state.phase === 'place' && state.selected !== null) {
    const wins = winningCells(state.board, state.selected);
    if (wins.length > 0) return { type: 'place', cell: wins[0] };

    let best: number[] = [];
    let bestScore = -Infinity;
    for (const cell of emptyCells(state)) {
      const score = quietPlacementScore(state, cell);
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = [cell];
      } else if (Math.abs(score - bestScore) < 1e-9) {
        best.push(cell);
      }
    }
    return { type: 'place', cell: pick(best, rng) };
  }

  const safe = safeChoices(state);
  if (safe.length > 0) return { type: 'choose', piece: pick(safe, rng) };

  let best: number[] = [];
  let fewest = Infinity;
  for (const piece of state.pool) {
    const count = winningCells(state.board, piece).length;
    if (count < fewest) {
      fewest = count;
      best = [piece];
    } else if (count === fewest) {
      best.push(piece);
    }
  }
  return { type: 'choose', piece: pick(best, rng) };
}

function easyAction(state: GameState, rng: Rng): GameAction {
  const legal = legalActions(state);
  if (safeRng(rng) < 0.55) return pick(legal, rng);

  if (state.phase === 'place' && state.selected !== null) {
    const wins = winningCells(state.board, state.selected);
    const cells = wins.length > 0 ? wins : emptyCells(state);
    return { type: 'place', cell: pick(cells, rng) };
  }

  const safe = safeChoices(state);
  if (safe.length > 0 && safeRng(rng) < 0.8) {
    return { type: 'choose', piece: pick(safe, rng) };
  }
  return { type: 'choose', piece: pick(state.pool, rng) };
}

/**
 * Pick one complete action: a piece to hand over, or a square on which to
 * place the selected piece. The caller applies the returned action.
 */
export function chooseAction(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): GameAction | null {
  if (state.status !== 'playing') return null;
  const legal = legalActions(state);
  if (legal.length === 0) return null;
  const me = state.turn;

  if (level === 'easy') return easyAction(state, rng);
  if (level === 'companion') return companionAction(state, rng);

  if (level === 'normal') {
    if (safeRng(rng) < 0.12) return pick(legal, rng);
    return rootSearch(state, me, 4, 14000) ?? pick(legal, rng);
  }

  const maxDepth = Math.min(8, 6 + Math.floor(state.placements / 8));
  return rootSearch(state, me, maxDepth, 70000) ?? pick(legal, rng);
}

/** Kept for symmetry with other Family Arcade engines. */
export function describeOpponent(player: Player): Player {
  return other(player);
}
