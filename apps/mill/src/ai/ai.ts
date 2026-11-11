import {
  ADJACENCY,
  MILLS,
  apply,
  legalMoves,
  millPointSet,
  other,
  type GameState,
  type Move,
  type Player,
} from '../game/mill';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type Rng = () => number;

const WIN = 100_000;

function randomIndex(length: number, rng: Rng): number {
  if (length <= 0) return -1;
  const value = rng();
  const index = Math.floor(value * length);
  return Math.min(length - 1, Math.max(0, index));
}

function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  return items[randomIndex(items.length, rng)];
}

function totalMen(state: GameState, player: Player): number {
  return state.hand[player] + state.onBoard[player];
}

function mobility(state: GameState, player: Player): number {
  const seen = new Set<number>();
  for (let point = 0; point < state.board.length; point += 1) {
    if (state.board[point] !== player) continue;
    for (const next of ADJACENCY[point]) {
      if (state.board[next] === null) seen.add(next);
    }
  }
  return seen.size;
}

function openMills(state: GameState, player: Player): number[] {
  const points: number[] = [];
  for (const line of MILLS) {
    let own = 0;
    let empty = -1;
    let blocked = false;
    for (const point of line) {
      const cell = state.board[point];
      if (cell === player) own += 1;
      else if (cell === null) {
        if (empty >= 0) {
          blocked = true;
          break;
        }
        empty = point;
      } else {
        blocked = true;
        break;
      }
    }
    if (!blocked && own === 2 && empty >= 0) points.push(empty);
  }
  return points;
}

function menInMills(state: GameState, player: Player): number {
  return millPointSet(state.board, player).size;
}

/** Static score from `me`'s point of view. */
export function evaluate(state: GameState, me: Player): number {
  if (state.status === 'won') return state.winner === me ? WIN : -WIN;
  if (state.status === 'draw') return 0;

  const opponent = other(me);
  const material = totalMen(state, me) - totalMen(state, opponent);
  const boardMen = state.onBoard[me] - state.onBoard[opponent];
  const mills = millPointSet(state.board, me).size - millPointSet(state.board, opponent).size;
  const threats = openMills(state, me).length - openMills(state, opponent).length;
  const space = mobility(state, me) - mobility(state, opponent);
  const protectedMen = menInMills(state, me) - menInMills(state, opponent);
  const pending =
    state.pendingCapture === opponent ? 26 : state.pendingCapture === me ? -26 : 0;

  return (
    material * 95 +
    boardMen * 22 +
    mills * 16 +
    threats * 11 +
    space * 3 +
    protectedMen * 3 +
    pending
  );
}

function quickScore(before: GameState, after: GameState): number {
  const mover = before.turn;
  if (after.status === 'won') return after.winner === mover ? WIN * 4 : -WIN * 4;
  if (after.status === 'draw') return 0;
  let score = evaluate(after, mover);
  if (after.pendingCapture === other(mover)) score += 34;
  return score;
}

function orderedOptions(
  state: GameState,
  moves: readonly Move[],
  rng: Rng,
): { move: Move; next: GameState; score: number; tie: number }[] {
  return moves
    .map((move) => {
      const next = apply(state, move).state;
      return { move, next, score: quickScore(state, next), tie: rng() };
    })
    .sort((a, b) => b.score - a.score || a.tie - b.tie);
}

function search(
  state: GameState,
  me: Player,
  depth: number,
  alpha: number,
  beta: number,
  rng: Rng,
): number {
  if (state.status === 'won') return state.winner === me ? WIN + depth : -WIN - depth;
  if (state.status === 'draw') return 0;
  if (depth <= 0) return evaluate(state, me);

  const moves = legalMoves(state);
  if (moves.length === 0) return evaluate(state, me);
  const options = orderedOptions(state, moves, rng);
  const maximizing = state.turn === me;
  let best = maximizing ? -Infinity : Infinity;

  for (const option of options) {
    const score = search(option.next, me, depth - 1, alpha, beta, rng);
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

function bestSearchMove(
  state: GameState,
  depth: number,
  rng: Rng,
): Move | null {
  const me = state.turn;
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const options = orderedOptions(state, moves, rng);
  let best = -Infinity;
  let picks: Move[] = [];
  for (const option of options) {
    const score = search(option.next, me, depth - 1, -Infinity, Infinity, rng);
    if (score > best + 1e-9) {
      best = score;
      picks = [option.move];
    } else if (Math.abs(score - best) < 1e-9) {
      picks.push(option.move);
    }
  }
  return pick(picks, rng) ?? picks[0] ?? null;
}

function greedyMove(state: GameState, rng: Rng, noise: number): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const options = moves.map((move) => {
    const next = apply(state, move).state;
    return { move, score: quickScore(state, next) + rng() * noise };
  });
  options.sort((a, b) => b.score - a.score);
  return options[0]?.move ?? null;
}

function opponentThreatPoints(state: GameState): number[] {
  const opponent = other(state.turn);
  return openMills(state, opponent);
}

/**
 * Gentle opponent: takes a clear win, otherwise prefers moves that do not hand
 * the opponent a mill and avoids starting a second capture in a row.
 */
function companionMove(state: GameState, moves: readonly Move[], rng: Rng): Move | null {
  const me = state.turn;
  const opponent = other(me);
  const threats = new Set(opponentThreatPoints(state));
  const recentCapture = state.last?.capture === true && state.last.by === me;

  const scored = moves.map((move) => {
    const next = apply(state, move).state;
    let score = rng() * 9;

    if (next.status === 'won') {
      score += next.winner === me ? 4000 : -4000;
    }
    if (next.pendingCapture === opponent) {
      score += 43;
      if (recentCapture) score -= 55;
      if (next.hand[opponent] === 0 && next.onBoard[opponent] <= 3) score -= 35;
    }

    const target =
      move.type === 'place' ? move.point : move.type === 'move' ? move.to : move.point;
    if (threats.has(target)) score += 26;

    if (next.status === 'playing' && next.turn === opponent && !next.pendingCapture) {
      const replies = legalMoves(next);
      let danger = false;
      for (const reply of replies) {
        const after = apply(next, reply).state;
        if (after.pendingCapture === me) {
          danger = true;
          break;
        }
        if (after.status === 'won' && after.winner === opponent) {
          danger = true;
          break;
        }
      }
      if (danger) score -= 170;
    }

    score += openMills(next, me).length * 5;
    score -= openMills(next, opponent).length * 7;
    score += mobility(next, me) * 0.4;
    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  // Usually the best safe move; sometimes the second-best so the game feels
  // human and a child can recover.
  if (scored.length > 1 && rng() < 0.22) return scored[1].move;
  return scored[0].move;
}

export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  // A capture is mandatory; every level must still choose one.
  if (state.pendingCapture) {
    if (level === 'easy') return pick(moves, rng) ?? moves[0];
    if (level === 'companion') {
      // Prefer a free man, then the least connected enemy stone.
      const scored = moves
        .map((move) => ({
          move,
          score:
            -ADJACENCY[move.type === 'capture' ? move.point : 0].filter(
              (point) => state.board[point] === state.pendingCapture,
            ).length +
            rng() * 0.8,
        }))
        .sort((a, b) => b.score - a.score);
      return scored[0].move;
    }
    if (level === 'normal' && rng() < 0.15) return pick(moves, rng) ?? moves[0];
    return bestSearchMove(state, level === 'hard' ? 4 : 2, rng);
  }

  if (level === 'easy') {
    if (rng() < 0.5) return pick(moves, rng) ?? moves[0];
    return greedyMove(state, rng, 30);
  }

  if (level === 'companion') {
    return companionMove(state, moves, rng) ?? moves[0];
  }

  if (level === 'normal') {
    if (rng() < 0.15) return pick(moves, rng) ?? moves[0];
    return bestSearchMove(state, 2, rng);
  }

  return bestSearchMove(state, 4, rng);
}
