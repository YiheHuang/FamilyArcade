import {
  apply,
  legalMoves,
  moveKey,
  other,
  queenCell,
  queenOnBoard,
  surroundCount,
  turnNumber,
  type GameState,
  type Move,
  type PieceKind,
  type Player,
} from '../game/hive';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const PIECE_VALUE: Record<PieceKind, number> = {
  queen: 8,
  ant: 3.4,
  beetle: 4.2,
  grasshopper: 3,
  spider: 2.7,
};

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function stackAtQueen(state: GameState, player: Player): string[] {
  const queen = queenCell(state, player);
  if (!queen) return [];
  const stack = state.cells[`${queen.q},${queen.r}`] ?? [];
  return stack.map((piece) => piece.owner);
}

/** Static evaluation from `me`'s point of view. */
export function evaluate(state: GameState, me: Player): number {
  if (state.status === 'draw') return 0;
  if (state.status === 'won') return state.winner === me ? 100000 : -100000;
  const opponent = other(me);
  let score = 0;

  const myQueen = queenCell(state, me);
  const enemyQueen = queenCell(state, opponent);

  if (myQueen) {
    const ring = surroundCount(state, me);
    score -= ring * ring * 2.5;
    score += (6 - ring) * 1.1;
    if (stackAtQueen(state, me).at(-1) === opponent) score -= 22;
  } else {
    score += 1;
    const deadline = turnNumber(state, me);
    if (deadline >= 4) score -= 17;
    else if (deadline === 3) score -= 5;
  }

  if (enemyQueen) {
    const ring = surroundCount(state, opponent);
    score += ring * ring * 2.8;
    score -= (6 - ring) * 1.2;
    if (stackAtQueen(state, opponent).at(-1) === me) score += 22;
  } else {
    score -= 2;
  }

  for (const [key, stack] of Object.entries(state.cells)) {
    const hexQueenHere =
      (myQueen && `${myQueen.q},${myQueen.r}` === key) ||
      (enemyQueen && `${enemyQueen.q},${enemyQueen.r}` === key);
    for (let index = 0; index < stack.length; index += 1) {
      const piece = stack[index];
      const sign = piece.owner === me ? 1 : -1;
      let value = PIECE_VALUE[piece.kind] * 0.38;
      if (index > 0) value += 1.4;
      if (!hexQueenHere && neighborOfQueen(state, piece.owner === me ? opponent : me, key)) {
        value += piece.owner === me ? 1.8 : 0;
      }
      score += sign * value;
    }
  }

  const myQueenOnBoard = queenOnBoard(state, me);
  const enemyQueenOnBoard = queenOnBoard(state, opponent);
  if (myQueenOnBoard && !enemyQueenOnBoard) score -= 1.5;
  if (!myQueenOnBoard && enemyQueenOnBoard) score += 1.5;
  if (state.turn === me) score += 0.7;
  return score;
}

function neighborOfQueen(state: GameState, player: Player, key: string): boolean {
  const queen = queenCell(state, player);
  if (!queen) return false;
  const [q, r] = key.split(',').map(Number);
  return (
    Math.abs(q - queen.q) +
      Math.abs(r - queen.r) +
      Math.abs(-q - r + queen.q + queen.r) ===
    2
  );
}

interface Child {
  move: Move;
  next: GameState;
  order: number;
}

function orderedChildren(state: GameState, me: Player, limit: number): Child[] {
  const children: Child[] = [];
  for (const move of legalMoves(state)) {
    const result = apply(state, move);
    if (!result.ok) continue;
    const next = result.state;
    let order: number;
    if (next.status === 'won') {
      order = next.winner === me ? 1_000_000 : -1_000_000;
    } else {
      order = evaluate(next, me);
    }
    children.push({ move, next, order });
  }
  const maximizing = state.turn === me;
  children.sort((a, b) => (maximizing ? b.order - a.order : a.order - b.order));
  return limit > 0 ? children.slice(0, limit) : children;
}

function search(
  state: GameState,
  me: Player,
  depth: number,
  alpha: number,
  beta: number,
  limit: number,
): number {
  if (state.status === 'won') {
    return state.winner === me ? 100000 + depth : -100000 - depth;
  }
  if (depth <= 0) return evaluate(state, me);
  const children = orderedChildren(state, me, limit);
  if (children.length === 0) return evaluate(state, me);
  const maximizing = state.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const child of children) {
    const value = search(child.next, me, depth - 1, alpha, beta, limit);
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function winningMoves(state: GameState, me: Player): Move[] {
  return legalMoves(state).filter((move) => {
    const next = apply(state, move).state;
    return next.status === 'won' && next.winner === me;
  });
}

/** A one-move lookahead safety filter: discard moves that allow an instant loss. */
function safeMoves(state: GameState, me: Player): Move[] {
  const moves = legalMoves(state);
  const opponent = other(me);
  const safe = moves.filter((move) => {
    const next = apply(state, move).state;
    if (next.status !== 'playing') return true;
    return !legalMoves(next).some((reply) => {
      const after = apply(next, reply).state;
      return after.status === 'won' && after.winner === opponent;
    });
  });
  return safe.length > 0 ? safe : moves;
}

function bestStatic(state: GameState, me: Player, rng: Rng): Move | null {
  const children = orderedChildren(state, me, 0).filter(
    (child) => child.order < 900000,
  );
  if (children.length === 0) {
    const all = orderedChildren(state, me, 0);
    return all.length > 0 ? all[0].move : null;
  }
  const best = children[0].order;
  const tied = children.filter((child) => Math.abs(child.order - best) < 0.75);
  return pick(tied, rng).move;
}

export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (moves.every((move) => move.type === 'pass')) return { type: 'pass' };
  const me = state.turn;

  const wins = winningMoves(state, me);
  if (wins.length > 0) return pick(wins, rng);

  if (level === 'easy') {
    const safe = safeMoves(state, me);
    if (rng() < 0.58) return pick(moves, rng);
    return bestStatic(state, me, rng) ?? pick(safe, rng);
  }

  if (level === 'companion') {
    const safe = safeMoves(state, me);
    if (rng() < 0.42) return pick(safe, rng);
    return bestStatic(state, me, rng) ?? pick(safe, rng);
  }

  const safe = safeMoves(state, me);

  if (level === 'normal') {
    if (rng() < 0.14) return pick(safe, rng);
    const safeKeys = new Set(safe.map(moveKey));
    const children = orderedChildren(state, me, 0).filter((child) =>
      safeKeys.has(moveKey(child.move)),
    );
    if (children.length === 0) return bestStatic(state, me, rng);
    let best = -Infinity;
    let tied: Move[] = [];
    for (const child of children.slice(0, 30)) {
      const value =
        child.next.status === 'won'
          ? child.next.winner === me
            ? 100000
            : -100000
          : search(child.next, me, 1, -Infinity, Infinity, 24);
      if (value > best + 1e-9) {
        best = value;
        tied = [child.move];
      } else if (Math.abs(value - best) < 1e-9) {
        tied.push(child.move);
      }
    }
    return tied.length > 0 ? pick(tied, rng) : pick(safe, rng);
  }

  // Hard: three plies, ordered, with a beam that keeps a family laptop quick.
  const safeKeys = new Set(safe.map(moveKey));
  const children = orderedChildren(state, me, 0).filter((child) =>
    safeKeys.has(moveKey(child.move)),
  );
  const root = children.slice(0, 22);
  let best = -Infinity;
  let tied: Move[] = [];
  for (const child of root) {
    const value =
      child.next.status === 'won'
        ? child.next.winner === me
          ? 100000
          : -100000
        : search(child.next, me, 2, -Infinity, Infinity, 14);
    if (value > best + 1e-9) {
      best = value;
      tied = [child.move];
    } else if (Math.abs(value - best) < 1e-9) {
      tied.push(child.move);
    }
  }
  if (tied.length > 0) return pick(tied, rng);
  return bestStatic(state, me, rng) ?? pick(moves, rng);
}
