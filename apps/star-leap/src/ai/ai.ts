import { ADJ, CENTRAL_SET, distanceToTarget, targetHoles } from '../game/board';
import { applyUnchecked, distanceSum, homeCount, legalMoves } from '../game/engine';
import type { AiLevel, GameState, Move } from '../game/types';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const entranceCache = new Map<string, Set<number>>();

/**
 * Target holes that also touch a hole outside the triangle. Filling these
 * early can wall off the remaining marbles, so the AI prefers to fill the
 * interior first and keep at least one entrance open.
 */
function targetEntrances(playerCount: 2 | 3 | 4, seat: number): Set<number> {
  const key = `${playerCount}:${seat}`;
  const hit = entranceCache.get(key);
  if (hit) return hit;
  const target = new Set(targetHoles(playerCount, seat));
  const out = new Set<number>();
  for (const hole of target) {
    if (ADJ[hole].some((n) => !target.has(n))) out.add(hole);
  }
  entranceCache.set(key, out);
  return out;
}

export function evaluate(state: GameState, seat: number, opponentWeight = 0.18): number {
  if (state.status === 'ended') {
    if (state.winner === seat) return 1_000_000;
    if (state.winner !== null) return -1_000_000;
  }

  const dist = distanceToTarget(state.config.playerCount, seat);
  const target = new Set(
    // target holes have distance 0; this also covers every target hole
    dist.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0),
  );

  let score = homeCount(state, seat) * 1_000;
  let own = 0;
  for (let h = 0; h < state.board.length; h++) {
    if (state.board[h] !== seat + 1) continue;
    own++;
    score -= dist[h] * 10;
    if (target.has(h)) score += 12;
    else if (CENTRAL_SET.has(h)) score += 3;
  }

  // Connectivity: own marbles that can jump over each other are useful.
  for (let h = 0; h < state.board.length; h++) {
    if (state.board[h] !== seat + 1) continue;
    for (const n of ADJ[h]) {
      if (state.board[n] === seat + 1) {
        score += 1.5;
        break;
      }
    }
  }

  // Keep at least one entrance to the target triangle open while there are
  // still empty interior holes; otherwise the last marbles can be walled out.
  const targetSet = new Set(targetHoles(state.config.playerCount, seat));
  const entrances = targetEntrances(state.config.playerCount, seat);
  let occupiedEntrance = 0;
  let emptyInterior = 0;
  for (const hole of targetSet) {
    if (state.board[hole] === seat + 1) {
      if (entrances.has(hole)) occupiedEntrance++;
    } else if (!entrances.has(hole)) {
      emptyInterior++;
    }
  }
  if (emptyInterior > 0) score -= occupiedEntrance * 35;

  if (own === 0) score -= 10_000;

  // Late in a long game, prefer finishing over endless blocking.
  const pressure = Math.min(1.5, Math.max(0, (state.moves.length - 80) / 120));
  if (pressure > 0) {
    score += pressure * (homeCount(state, seat) * 80 - distanceSum(state, seat) * 2);
  }

  if (opponentWeight > 0) {
    for (let opp = 0; opp < state.config.playerCount; opp++) {
      if (opp === seat) continue;
      const oppScore = homeCount(state, opp) * 1_000 - distanceSum(state, opp) * 10;
      score -= oppScore * opponentWeight * (1 - 0.35 * pressure);
    }
  }
  return score;
}

function noise(rng: () => number, amount: number): number {
  return (rng() * 2 - 1) * amount;
}

function moveHeuristic(state: GameState, move: Move, seat: number): number {
  if (move.kind === 'pass') return -1_000;
  const dist = distanceToTarget(state.config.playerCount, seat);
  const target = dist[move.to] === 0;
  const entrance = target && targetEntrances(state.config.playerCount, seat).has(move.to);
  return (
    -dist[move.to] * 10 +
    (target ? (entrance ? 40 : 90) : 0) +
    (move.kind === 'jump' ? 3 : 0) +
    (CENTRAL_SET.has(move.to) ? 2 : 0) -
    (move.path.length > 2 ? 0.2 * (move.path.length - 2) : 0)
  );
}

function ordered(state: GameState, seat: number, limit: number): Move[] {
  return legalMoves(state, seat)
    .map((move) => ({ move, score: moveHeuristic(state, move, seat) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.move);
}

function bestImmediate(state: GameState, seat: number, rng: () => number, noiseAmount: number, opponentWeight = 0.18): Move | null {
  const moves = legalMoves(state, seat);
  if (moves.length === 0) return null;
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const next = applyUnchecked(state, move);
    const score = evaluate(next, seat, opponentWeight) + noise(rng, noiseAmount);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function bestReply(state: GameState, seat: number, limit = 1): { move: Move | null; score: number } {
  const moves = legalMoves(state, seat);
  if (moves.length === 0) return { move: null, score: evaluate(state, seat) };
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const move of ordered(state, seat, limit)) {
    const next = applyUnchecked(state, move);
    const score = evaluate(next, seat);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return { move: best, score: bestScore };
}

export interface ChooseOptions {
  level: AiLevel;
  budgetMs: number;
  rng: () => number;
}

export function chooseMove(state: GameState, seat: number, opts: ChooseOptions): Move | null {
  if (state.status === 'ended' || state.current !== seat) return null;
  const moves = legalMoves(state, seat);
  if (moves.length === 0) return null;

  const { level, budgetMs, rng } = opts;
  const deadline = now() + Math.max(10, budgetMs);

  if (level === 'companion') {
    const scored = moves.map((move) => {
      const next = applyUnchecked(state, move);
      return {
        move,
        score: evaluate(next, seat, 0) + noise(rng, 90),
      };
    });
    scored.sort((a, b) => b.score - a.score);
    const pool = scored.slice(0, Math.min(5, scored.length));
    return pool[Math.floor(rng() * pool.length)].move;
  }

  if (level === 'easy') {
    return bestImmediate(state, seat, rng, 70, 0.05);
  }

  if (level === 'normal') {
    const candidates = ordered(state, seat, 12);
    let best: Move = candidates[0];
    let bestScore = -Infinity;
    for (const move of candidates) {
      if (now() > deadline) break;
      const next = applyUnchecked(state, move);
      if (next.status === 'ended') {
        const score = evaluate(next, seat);
        if (score > bestScore) {
          bestScore = score;
          best = move;
        }
        continue;
      }
      const reply = bestReply(next, next.current, 8);
      const after = reply.move ? applyUnchecked(next, reply.move) : next;
      const score = evaluate(after, seat) + noise(rng, 15);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }

  // Hard: a wider one-ply lookahead than Normal, with no random noise.
  const candidates = ordered(state, seat, 20);
  let best: Move = candidates[0];
  let bestScore = -Infinity;
  for (const move of candidates) {
    if (now() > deadline) break;
    const next = applyUnchecked(state, move);
    if (next.status === 'ended') {
      const score = evaluate(next, seat);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
      continue;
    }
    const reply = bestReply(next, next.current, 12);
    const after = reply.move ? applyUnchecked(next, reply.move) : next;
    const score = evaluate(after, seat);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
export function hintMove(state: GameState, seat: number): Move | null {
  return chooseMove(state, seat, {
    level: 'hard',
    budgetMs: 250,
    rng: () => 0.5,
  });
}
