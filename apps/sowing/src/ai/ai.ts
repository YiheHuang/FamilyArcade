import {
  apply,
  legalMoves,
  other,
  rowSum,
  type GameState,
  type Player,
} from '../game/sowing';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const WIN = 1_000_000;
const LOSS = -1_000_000;

function terminalScore(state: GameState, me: Player, depth: number): number {
  const diff = state.stores[me] - state.stores[1 - me];
  if (state.winner === null) return diff;
  // Prefer a win that arrives sooner: more search depth left = fewer plies played.
  return state.winner === me ? WIN + depth * 100 + diff : LOSS - depth * 100 + diff;
}

function heuristic(state: GameState, me: Player): number {
  const opp = other(me);
  const storeDiff = state.stores[me] - state.stores[opp];
  const pitDiff = rowSum(state.pits, me) - rowSum(state.pits, opp);
  const mobility = legalMoves(state).length;
  return storeDiff * 18 + pitDiff * 3 + mobility * 0.25;
}

interface OrderedMove {
  pit: number;
  next: GameState;
  key: number;
}

function orderMoves(state: GameState, moves: number[]): OrderedMove[] {
  const mover = state.turn;
  return moves
    .map((pit) => {
      const next = apply(state, pit).state;
      const gain = next.stores[mover] - state.stores[mover];
      const extra = next.turn === mover ? 2 : 0;
      const finish = next.status === 'ended' && next.winner === mover ? 100 : 0;
      return { pit, next, key: gain * 10 + extra + finish };
    })
    .sort((a, b) => b.key - a.key);
}

function search(
  state: GameState,
  me: Player,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (state.status === 'ended') return terminalScore(state, me, depth);
  if (depth <= 0) return heuristic(state, me);

  const maxing = state.turn === me;
  const moves = orderMoves(state, legalMoves(state));
  if (moves.length === 0) return heuristic(state, me);

  let best = maxing ? -Infinity : Infinity;
  for (const { next } of moves) {
    const score = search(next, me, depth - 1, alpha, beta);
    if (maxing) {
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

function immediateValue(state: GameState, next: GameState, me: Player): number {
  const gain = next.stores[me] - state.stores[me];
  const extra = next.turn === me && next.status === 'playing' ? 3 : 0;
  const win = next.status === 'ended' && next.winner === me ? 1000 : 0;
  return gain * 10 + extra + win;
}

export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;
  const me = state.turn;
  const pick = (items: number[]): number => items[Math.floor(rng() * items.length)] ?? items[0];

  const evaluated = moves.map((pit) => {
    const next = apply(state, pit).state;
    return { pit, next };
  });

  if (level === 'companion') {
    // Gentle by design: mostly a plain sowing, never a deep plan.
    if (rng() < 0.45) return pick(moves);
    const quiet = evaluated.filter(
      ({ next }) =>
        next.status === 'playing' && next.turn !== me && (next.last?.capture ?? 0) === 0,
    );
    if (quiet.length > 0) return pick(quiet.map(({ pit }) => pit));
    // If every move is a capture or an extra turn, take the smallest gift.
    const gentle = evaluated
      .slice()
      .sort((a, b) => (a.next.last?.capture ?? 0) - (b.next.last?.capture ?? 0));
    const bestCapture = gentle[0]?.next.last?.capture ?? 0;
    const smallest = gentle
      .filter(({ next }) => (next.last?.capture ?? 0) === bestCapture)
      .map(({ pit }) => pit);
    return pick(smallest);
  }

  if (level === 'easy') {
    if (rng() < 0.45) return pick(moves);
    const values = evaluated.map(({ next }) => immediateValue(state, next, me));
    const best = Math.max(...values);
    const picks = evaluated.filter((_, index) => values[index] === best).map(({ pit }) => pit);
    return pick(picks);
  }

  if (level === 'normal') {
    if (rng() < 0.12) return pick(moves);
    const values = evaluated.map(({ next }) => search(next, me, 2, -Infinity, Infinity));
    const best = Math.max(...values);
    const picks = evaluated.filter((_, index) => values[index] === best).map(({ pit }) => pit);
    return pick(picks);
  }

  // Hard: 8 plies including this move, alpha-beta, deterministic.
  let best = -Infinity;
  let bestMove = moves[0];
  for (const { pit, next } of orderMoves(state, moves)) {
    const score = search(next, me, 7, -Infinity, Infinity);
    if (score > best) {
      best = score;
      bestMove = pit;
    }
  }
  return bestMove;
}

/** A readable reason for a hint, without touching the UI. */
export function moveReason(
  before: GameState,
  after: GameState,
): 'capture' | 'extra' | 'finish' | 'quiet' {
  const seat = before.turn;
  if (after.status === 'ended') return 'finish';
  if ((after.last?.capture ?? 0) > 0) return 'capture';
  if (after.turn === seat) return 'extra';
  return 'quiet';
}
