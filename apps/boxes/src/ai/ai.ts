import {
  apply,
  completedBoxes,
  legalMoves,
  openBoxes,
  other,
  type GameState,
  type Player,
} from '../game/boxes';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

/**
 * Hard solves the last 12 edges exactly with alpha-beta search. Above that it
 * uses the chain-aware heuristics below; this is strong but not a perfect
 * solver for the whole 60-edge game.
 */
export const ENDGAME_EDGES = 12;

type Rng = () => number;

export type HintReason = 'capture' | 'double' | 'safe' | 'sacrifice' | 'endgame';

export interface Hint {
  edge: number;
  reason: HintReason;
  boxes: number;
}

interface CaptureMove {
  edge: number;
  boxes: number;
}

function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  const index = Math.floor(Math.max(0, Math.min(0.999999, rng())) * items.length);
  return items[index];
}

function pickMove(moves: readonly number[], rng: Rng): number {
  return pick(moves, rng) ?? -1;
}

function captureMoves(state: GameState): CaptureMove[] {
  const result: CaptureMove[] = [];
  for (const edge of legalMoves(state)) {
    const boxes = completedBoxes(state, edge).length;
    if (boxes > 0) result.push({ edge, boxes });
  }
  return result;
}

function maxCaptureMoves(state: GameState): CaptureMove[] {
  const captures = captureMoves(state);
  if (captures.length === 0) return [];
  const max = Math.max(...captures.map((item) => item.boxes));
  return captures.filter((item) => item.boxes === max);
}

/** Drawing this edge would leave an unowned three-sided box for the opponent. */
export function createsThirdSide(state: GameState, edge: number): boolean {
  const result = apply(state, edge);
  return result.ok && openBoxes(result.state).length > 0;
}

function safeMoves(state: GameState): number[] {
  return legalMoves(state).filter((edge) => !createsThirdSide(state, edge));
}

/** Greedily take every available box for `player`; used to price a gift. */
function greedyTake(state: GameState, player: Player): { state: GameState; gained: number } {
  let current = state;
  let gained = 0;
  while (current.status === 'playing' && current.turn === player) {
    const best = maxCaptureMoves(current)[0];
    if (!best) break;
    const result = apply(current, best.edge);
    if (!result.ok) break;
    gained += result.state.scores[player] - current.scores[player];
    current = result.state;
  }
  return { state: current, gained };
}

/**
 * How many boxes the opponent can immediately take if we draw this edge.
 * Used when every move hands over at least one box: give away the smallest
 * chain rather than a long one.
 */
export function sacrificeCost(state: GameState, edge: number): number {
  const result = apply(state, edge);
  if (!result.ok) return Number.POSITIVE_INFINITY;
  if (result.state.status === 'done') return 0;
  return greedyTake(result.state, other(state.turn)).gained;
}

function cheapestSacrifice(state: GameState, rng: Rng): number {
  const legal = legalMoves(state);
  const priced = legal.map((edge) => ({ edge, cost: sacrificeCost(state, edge) }));
  const min = Math.min(...priced.map((item) => item.cost));
  return pickMove(priced.filter((item) => item.cost === min).map((item) => item.edge), rng);
}

/*
 * Endgame search. Positions are memoised by the drawn edges, owners and turn;
 * scores follow from the owners so they need not be in the key.
 */
const INF = Number.POSITIVE_INFINITY;

function maskKey(state: GameState): string {
  let horizontal = 0;
  let vertical = 0;
  for (let edge = 0; edge < 30; edge++) {
    if (state.edges[edge]) horizontal += 2 ** edge;
  }
  for (let edge = 0; edge < 30; edge++) {
    if (state.edges[edge + 30]) vertical += 2 ** edge;
  }
  let owned0 = 0;
  let owned1 = 0;
  for (let box = 0; box < state.owners.length; box++) {
    if (state.owners[box] === 0) owned0 += 2 ** box;
    else if (state.owners[box] === 1) owned1 += 2 ** box;
  }
  return `${horizontal}|${vertical}|${owned0}|${owned1}|${state.turn}`;
}

function solve(
  state: GameState,
  me: Player,
  alpha: number,
  beta: number,
  memo: Map<string, number>,
): number {
  if (state.status === 'done') return state.scores[me] - state.scores[other(me)];
  const key = maskKey(state);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const maximizing = state.turn === me;
  let best = maximizing ? -INF : INF;
  let cutoff = false;

  // Captures first improves alpha-beta pruning without changing the result.
  const moves = legalMoves(state).sort(
    (a, b) => completedBoxes(state, b).length - completedBoxes(state, a).length,
  );
  for (const edge of moves) {
    const result = apply(state, edge);
    if (!result.ok) continue;
    const value = solve(result.state, me, alpha, beta, memo);
    if (maximizing) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) {
      cutoff = true;
      break;
    }
  }

  // Only cache exact values; a bound from a cutoff can be wrong for another
  // alpha-beta window.
  if (!cutoff) memo.set(key, best);
  return best;
}

function endgameMove(state: GameState, rng: Rng): number {
  const moves = legalMoves(state).sort(
    (a, b) => completedBoxes(state, b).length - completedBoxes(state, a).length,
  );
  const me = state.turn;
  const memo = new Map<string, number>();
  let best = -INF;
  let picks: number[] = [];
  let alpha = -INF;
  for (const edge of moves) {
    const result = apply(state, edge);
    if (!result.ok) continue;
    const value = solve(result.state, me, alpha, INF, memo);
    if (value > best + 1e-9) {
      best = value;
      picks = [edge];
      alpha = best;
    } else if (Math.abs(value - best) < 1e-9) {
      picks.push(edge);
    }
  }
  return pickMove(picks, rng);
}

/** Prefer a safe line that leaves the opponent with as few safe lines as possible. */
function bestSafeMove(state: GameState, rng: Rng): number {
  const safe = safeMoves(state);
  if (safe.length === 0) return -1;
  const ranked = safe.map((edge) => {
    const result = apply(state, edge);
    const next = result.ok ? result.state : state;
    return {
      edge,
      rank: safeMoves(next).length * 10 + openBoxes(next).length * 100,
    };
  });
  const min = Math.min(...ranked.map((item) => item.rank));
  return pickMove(ranked.filter((item) => item.rank === min).map((item) => item.edge), rng);
}

/**
 * Take every capture that follows from `edge`, then value the resulting
 * position. Capturing keeps the turn, so the loop is the player's own chain.
 */
function captureRank(state: GameState, edge: number, me: Player): number {
  const first = apply(state, edge);
  if (!first.ok) return -INF;
  let current = first.state;
  let gained = current.scores[me] - state.scores[me];
  while (current.status === 'playing' && current.turn === me) {
    const best = maxCaptureMoves(current)[0];
    if (!best) break;
    const result = apply(current, best.edge);
    if (!result.ok) break;
    gained += result.state.scores[me] - current.scores[me];
    current = result.state;
  }
  const freedom =
    current.status === 'playing' && current.turn === me ? safeMoves(current).length : 0;
  return gained * 100 + freedom;
}

function hardMove(state: GameState, rng: Rng): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;
  if (moves.length <= ENDGAME_EDGES) return endgameMove(state, rng);

  const captures = captureMoves(state);
  if (captures.length > 0) {
    const me = state.turn;
    const ranked = captures.map((item) => ({
      edge: item.edge,
      rank: captureRank(state, item.edge, me),
    }));
    const max = Math.max(...ranked.map((item) => item.rank));
    return pickMove(ranked.filter((item) => item.rank === max).map((item) => item.edge), rng);
  }

  const safe = bestSafeMove(state, rng);
  if (safe >= 0) return safe;
  return cheapestSacrifice(state, rng);
}

function normalMove(state: GameState, rng: Rng): number {
  const captures = maxCaptureMoves(state);
  if (captures.length > 0) return pickMove(captures.map((item) => item.edge), rng);
  const safe = safeMoves(state);
  if (safe.length > 0) return pickMove(safe, rng);
  return cheapestSacrifice(state, rng);
}

function companionMove(state: GameState, rng: Rng): number {
  const captures = maxCaptureMoves(state);
  const safe = safeMoves(state);
  const me = state.turn;
  const ahead = state.scores[me] > state.scores[other(me)];

  // Gentle: sometimes leave a free box on the table, especially when ahead.
  if (captures.length > 0) {
    const roll = rng();
    const decline = roll < 0.28 || ahead;
    if (!decline) return pickMove(captures.map((item) => item.edge), rng);
  }

  if (safe.length > 0) {
    // Give away a small chain once in a while, never a long one.
    if (rng() < 0.16) {
      const gifts = legalMoves(state)
        .filter((edge) => !safe.includes(edge) && completedBoxes(state, edge).length === 0)
        .map((edge) => ({ edge, cost: sacrificeCost(state, edge) }))
        .filter((item) => item.cost > 0 && item.cost <= 2);
      if (gifts.length > 0) {
        const min = Math.min(...gifts.map((item) => item.cost));
        return pickMove(
          gifts.filter((item) => item.cost === min).map((item) => item.edge),
          rng,
        );
      }
    }
    return pickMove(safe, rng);
  }

  // No safe line: hand over the shortest chain available.
  return cheapestSacrifice(state, rng);
}

/**
 * Deterministic with the injected RNG. `Math.random` is only the app default;
 * tests always pass a fixed sequence.
 */
export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number {
  if (state.status !== 'playing') return -1;
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;

  switch (level) {
    case 'easy':
      return pickMove(moves, rng);
    case 'companion':
      return companionMove(state, rng);
    case 'normal':
      return normalMove(state, rng);
    case 'hard':
      return hardMove(state, rng);
  }
}

/** A strong move plus a human-readable reason for the hint card. */
export function hintFor(state: GameState, rng: Rng = Math.random): Hint {
  const edge = chooseMove(state, 'hard', rng);
  if (edge < 0) return { edge: -1, reason: 'safe', boxes: 0 };
  const boxes = completedBoxes(state, edge).length;
  if (boxes >= 2) return { edge, reason: 'double', boxes };
  if (boxes === 1) return { edge, reason: 'capture', boxes };
  if (legalMoves(state).length <= ENDGAME_EDGES) return { edge, reason: 'endgame', boxes };
  if (!createsThirdSide(state, edge)) return { edge, reason: 'safe', boxes };
  return { edge, reason: 'sacrifice', boxes };
}
