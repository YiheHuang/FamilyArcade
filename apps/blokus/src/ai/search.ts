import type { Game } from '../game/engine';
import { PIECES } from '../game/pieces';
import type { PlaceMove } from '../game/types';
import { randInt, type Rng } from '../game/rng';
import type { Difficulty } from './types';
import { HARD_TOP_K, NOISE_AMP, WEIGHTS } from './protocol';

const BORDER = 15;

/**
 * Cheap heuristic score for a legal placement of player p:
 *  - squares gained (dominant term)
 *  - newly created frontier cells minus consumed frontier cells (mobility)
 *  - board-edge cells (edges are safe / block space)
 *  - contact with opponent cells (blocking proxy)
 * `frontierBefore` = diagonal frontier flags of p before the move (optional).
 */
export interface MoveParts {
  /** squares gained */
  size: number;
  /** new frontier cells created */
  added: number;
  /** own frontier cells consumed */
  killed: number;
  /** cells on the board edge */
  edge: number;
  /** contact with opponent cells (blocking proxy) */
  contact: number;
}

/** the raw features of a legal placement (shared by scoring and explanations) */
export function moveParts(g: Game, m: PlaceMove, frontierBefore: Uint8Array | null): MoveParts {
  const or = PIECES[m.piece].orientations[m.o];
  const b = g.board;
  const s = g.stride;
  const size = g.size;
  const own = m.p + 1;
  const parts: MoveParts = { size: or.cells.length / 2, added: 0, killed: 0, edge: 0, contact: 0 };

  for (let i = 0; i < or.cells.length; i += 2) {
    const x = m.x + or.cells[i];
    const y = m.y + or.cells[i + 1];
    const idx = (y + 2) * s + (x + 2);
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) parts.edge++;

    if (frontierBefore !== null && frontierBefore[idx] === 1) parts.killed++;

    // 8-neighborhood
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const n = idx + dy * s + dx;
        const v = b[n];
        if (v === 0) {
          // diagonal empty neighbors can become frontier cells
          if (dx !== 0 && dy !== 0) {
            if (frontierBefore !== null && frontierBefore[n] === 1) continue;
            if (b[n - 1] !== own && b[n + 1] !== own && b[n - s] !== own && b[n + s] !== own) {
              parts.added++;
            }
          }
        } else if (v !== own && v !== BORDER) {
          parts.contact++;
        }
      }
    }
  }
  return parts;
}

/** Cheap heuristic score for a legal placement of player p. */
export function scoreMoveFast(
  g: Game,
  m: PlaceMove,
  frontierBefore: Uint8Array | null,
  noise: number,
): number {
  const parts = moveParts(g, m, frontierBefore);
  return (
    parts.size * WEIGHTS.size +
    (parts.added - parts.killed) * WEIGHTS.newFrontier +
    parts.edge * WEIGHTS.edge +
    parts.contact * WEIGHTS.contact +
    noise
  );
}

export interface ScoredMove {
  m: PlaceMove;
  s: number;
}

/** rank all legal moves by fast heuristic */
export function rankMoves(g: Game, seat: number, amp: number, rng: Rng): ScoredMove[] {
  const frontierBefore = g.frontierFlagsFor(seat);
  const moves = g.legalMoves(seat);
  const scored = moves.map((m) => ({ m, s: scoreMoveFast(g, m, frontierBefore, rng() * amp) }));
  scored.sort((a, b) => b.s - a.s);
  return scored;
}

/**
 * Pick a move for `seat`.
 *  easy   — noisy greedy over a random slice of the top moves
 *  normal — greedy on the heuristic
 *  hard   — 2-ply: value = my exact gain − best opponent reply (fast heuristic)
 */
export function chooseMove(
  g: Game,
  seat: number,
  difficulty: Difficulty,
  deadline: number,
  rng: Rng,
): PlaceMove | null {
  const moves = g.legalMoves(seat);
  if (moves.length === 0) return null;

  const amp = NOISE_AMP[difficulty];
  const frontierBefore = g.frontierFlagsFor(seat);
  const scored: ScoredMove[] = moves.map((m) => ({
    m,
    s: scoreMoveFast(g, m, frontierBefore, rng() * amp),
  }));
  scored.sort((a, b) => b.s - a.s);

  if (difficulty === 'easy') {
    if (rng() < 0.18) return moves[randInt(rng, moves.length)];
    const k = Math.min(8, scored.length);
    return scored[randInt(rng, k)].m;
  }

  if (difficulty === 'normal') {
    return scored[0].m;
  }

  // hard: 2-ply lookahead over the top candidates
  const k = Math.min(HARD_TOP_K, scored.length);
  let best = scored[0].m;
  let bestValue = -Infinity;
  for (let i = 0; i < k; i++) {
    if (Date.now() > deadline && i > 0) break;
    const cand = scored[i];
    const g2 = g.clone();
    if (!g2.tryApply(cand.m)) continue;

    let oppBest = 0;
    let oppFrontier = 0;
    for (let p = 0; p < g2.playerCount; p++) {
      if (p === seat) continue;
      if (g2.remaining[p] === 0) {
        oppFrontier += 0;
        continue;
      }
      const oppFrontierBefore = g2.frontierFlagsFor(p);
      let bestReply = 0;
      for (const om of g2.legalMoves(p)) {
        const sc = scoreMoveFast(g2, om, oppFrontierBefore, 0);
        if (sc > bestReply) bestReply = sc;
      }
      if (bestReply > oppBest) oppBest = bestReply;
      let f = 0;
      for (let j = 0; j < oppFrontierBefore.length; j++) if (oppFrontierBefore[j] === 1) f++;
      oppFrontier += f;
    }

    // my exact mobility after the move
    const myFrontierAfter = g2.frontierSize(seat);
    const value = cand.s + myFrontierAfter * 1.1 - oppBest * 0.65 - oppFrontier * 0.3;
    if (value > bestValue) {
      bestValue = value;
      best = cand.m;
    }
  }
  return best;
}
