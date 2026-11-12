import {
  apply,
  distance,
  enemyDen,
  legalMoves,
  opposite,
  pieceAt,
  trapOwner,
  RANKS,
  type Animal,
  type GameState,
  type Move,
  type Side,
} from '../game/jungle-chess';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

export const AI_LABEL_KEYS: Record<AiLevel, string> = {
  companion: 'companion',
  easy: 'easy',
  normal: 'normal',
  hard: 'hard',
};

const VALUE: Record<Animal, number> = {
  rat: 90,
  cat: 130,
  dog: 190,
  wolf: 270,
  leopard: 380,
  tiger: 600,
  lion: 760,
  elephant: 950,
};

const WIN = 1_000_000;

function adjacentEnemy(state: GameState, index: number, side: Side): boolean {
  const row = Math.floor(index / 7);
  const col = index % 7;
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  for (const [dr, dc] of dirs) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= 9 || c < 0 || c >= 7) continue;
    if (state.board[r * 7 + c]?.side === opposite(side)) return true;
  }
  return false;
}

/** Static evaluation from `me`'s point of view. */
export function evaluate(state: GameState, me: Side): number {
  if (state.status === 'won') {
    return state.winner === me ? WIN - state.moves.length : -WIN + state.moves.length;
  }
  if (state.status === 'draw') return 0;

  const opponent = opposite(me);
  let score = 0;
  let myDenThreat = 0;
  let theirDenThreat = 0;

  for (let index = 0; index < state.board.length; index += 1) {
    const piece = state.board[index];
    if (!piece) continue;
    const enemy = piece.side === opponent;
    const value = VALUE[piece.kind];

    let material = value;
    const trap = trapOwner(index);
    if (trap && trap !== piece.side) {
      // A piece in the opponent's trap is nearly lost.
      material *= adjacentEnemy(state, index, piece.side) ? 0.12 : 0.42;
    }

    const den = enemyDen(piece.side);
    const reach = distance(index, den);
    const advance = Math.max(0, 18 - reach) * 2.4;

    if (piece.side === me) {
      score += material + advance;
      theirDenThreat += Math.max(0, 10 - reach);
      if (piece.kind === 'rat' && index >= 21 && index <= 41) score += 26;
      if (index === enemyDen(me) - 7 || index === enemyDen(me) + 7) score += 8;
    } else {
      score -= material + advance;
      myDenThreat += Math.max(0, 10 - reach);
    }

    // A trapped enemy is a capture target for us.
    if (enemy && trap && trap !== piece.side && adjacentEnemy(state, index, piece.side)) {
      score += 45;
    }
  }

  // Keeping the opponent away from our den matters more than raw material.
  score += (theirDenThreat - myDenThreat) * 3.2;
  return score;
}

function movePriority(state: GameState, move: Move): number {
  const piece = pieceAt(state, move.from);
  if (!piece) return 0;
  const target = pieceAt(state, move.to);
  const me = state.turn;
  let score = 0;

  if (move.to === enemyDen(me)) score += WIN;
  if (target) {
    score += VALUE[target.kind] * 12;
    score -= VALUE[piece.kind] * 0.5;
  }
  score += (18 - distance(move.to, enemyDen(me))) * 3;
  if (move.to - move.from === 7) score += 8;
  const trap = trapOwner(move.to);
  if (trap && trap !== me) score -= 180;
  return score;
}

function orderedMoves(state: GameState): Move[] {
  return legalMoves(state)
    .map((move) => ({ move, score: movePriority(state, move) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

function immediateWin(state: GameState, moves: Move[]): number | null {
  for (const move of moves) {
    const next = apply(state, move).state;
    if (next.status === 'won' && next.winner === state.turn) {
      return move.from * 63 + move.to;
    }
  }
  return null;
}

function search(
  state: GameState,
  me: Side,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (state.status === 'won') {
    return state.winner === me ? WIN - state.moves.length : -WIN + state.moves.length;
  }
  if (state.status === 'draw') return 0;
  if (depth <= 0) return evaluate(state, me);

  const maximizing = state.turn === me;
  const moves = orderedMoves(state);
  if (moves.length === 0) return evaluate(state, me);

  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const next = apply(state, move).state;
    const value = search(next, me, depth - 1, alpha, beta);
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

function encoded(move: Move): number {
  return move.from * 63 + move.to;
}

function searchBest(state: GameState, depth: number, rng: Rng): number {
  const me = state.turn;
  const moves = orderedMoves(state);
  if (moves.length === 0) return -1;

  let best = -Infinity;
  let picks: Move[] = [];
  for (const move of moves) {
    const next = apply(state, move).state;
    const value = search(next, me, depth - 1, -Infinity, Infinity);
    if (value > best + 1e-9) {
      best = value;
      picks = [move];
    } else if (Math.abs(value - best) < 1e-9) {
      picks.push(move);
    }
  }
  const chosen = picks[Math.floor(rng() * picks.length)] ?? picks[0] ?? moves[0];
  return encoded(chosen);
}

function onePlyBest(state: GameState, rng: Rng, poolSize: number): number {
  const me = state.turn;
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;
  const scored = moves
    .map((move) => ({
      move,
      score: evaluate(apply(state, move).state, me),
    }))
    .sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, Math.max(1, Math.min(poolSize, scored.length)));
  const chosen = pool[Math.floor(rng() * pool.length)] ?? pool[0];
  return encoded(chosen.move);
}

/**
 * Deterministic given the injected RNG. Returns an encoded move, or -1.
 * Companion is deliberately forgiving; Hard searches three plies and extends
 * to four when few pieces remain.
 */
export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): number {
  if (state.status !== 'playing') return -1;
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;

  // Every level takes a game-ending move. This keeps games finite and means
  // the gentle companion never accidentally refuses a clear win.
  const win = immediateWin(state, moves);
  if (win !== null) return win;

  const pick = (items: Move[]) => encoded(items[Math.floor(rng() * items.length)] ?? items[0]);

  if (level === 'companion') {
    return onePlyBest(state, rng, 4);
  }

  if (level === 'easy') {
    if (rng() < 0.44) return pick(moves);
    return onePlyBest(state, rng, 1);
  }

  if (level === 'normal') {
    if (rng() < 0.12) return pick(moves);
    return searchBest(state, 2, rng);
  }

  const pieces = state.board.reduce((total, cell) => total + (cell ? 1 : 0), 0);
  return searchBest(state, pieces <= 8 ? 4 : 3, rng);
}

/** Exposed for the hint screen and tests. */
export function sideMaterial(board: GameState['board'], side: Side): number {
  return board.reduce(
    (total, cell) => total + (cell?.side === side ? RANKS[cell.kind] : 0),
    0,
  );
}
