import { simulatePlacement } from '../game/engine';
import { placementsOnly } from '../game/engine';
import {
  analyze,
  featureForNode,
  featurePoints,
  majoritySeats,
  meepleCounts,
  type GlobalFeature,
} from '../game/features';
import { TILE_DATA, localFeatures } from '../game/tiles';
import type {
  AiLevel,
  GameState,
  GameView,
  Move,
  PlacedTile,
} from '../game/types';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function fakeState(view: GameView, seat: number, currentTile: string | null = view.currentTile): GameState {
  return {
    version: 1,
    config: view.config,
    tiles: view.tiles,
    bag: [],
    currentTile,
    current: seat,
    turn: view.turn,
    scores: view.scores,
    meeplesLeft: view.meeplesLeft,
    moves: view.moves,
    status: view.status,
    endReason: view.endReason,
    lastScored: view.lastScored,
    completed: view.completed,
    discarded: view.discarded,
    lastMove: view.lastMove,
  };
}

export function enumerateMoves(view: GameView, seat: number): Move[] {
  if (view.status !== 'playing' || !view.currentTile) return [];
  const moves = placementsOnly(fakeState(view, seat), seat);
  if (moves.length > 0) return moves;
  return [{ seat, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null }];
}

function chance(feature: GlobalFeature): number {
  if (feature.complete) return 1;
  if (feature.type === 'monastery') return Math.pow(feature.filledAround / 8, 2);
  if (feature.type === 'city') return 0.75 / (1 + feature.openEdges * 0.55);
  return 0.85 / (1 + feature.openEdges * 0.4);
}

function endScore(
  tiles: PlacedTile[],
  scores: number[],
  playerCount: number,
): number[] {
  const out = [...scores];
  const analysis = analyze(tiles);
  for (const feature of analysis.features) {
    if (feature.complete || feature.meeples.length === 0) continue;
    const pts = featurePoints(feature, false);
    for (const seat of majoritySeats(feature)) out[seat] = (out[seat] ?? 0) + pts;
  }
  return out.slice(0, playerCount);
}

export function staticEval(
  tiles: PlacedTile[],
  scores: number[],
  meeplesLeft: number[],
  bagCount: number,
  seat: number,
  playerCount: number,
  opponentWeight = 0.55,
): number {
  if (bagCount <= 0) {
    const finalScores = endScore(tiles, scores, playerCount);
    const own = finalScores[seat] ?? 0;
    let bestOpp = 0;
    for (let s = 0; s < playerCount; s++) if (s !== seat) bestOpp = Math.max(bestOpp, finalScores[s] ?? 0);
    return own - bestOpp * 0.92;
  }

  let ownScore = 0;
  let bestOppScore = 0;
  for (let s = 0; s < playerCount; s++) {
    if (s === seat) ownScore = scores[s] ?? 0;
    else bestOppScore = Math.max(bestOppScore, scores[s] ?? 0);
  }
  let value = ownScore - bestOppScore * 0.9;

  const analysis = analyze(tiles);
  for (const feature of analysis.features) {
    if (feature.meeples.length === 0) continue;
    const counts = meepleCounts(feature);
    const best = counts[0]?.count ?? 0;
    const owners = counts.filter((c) => c.count === best).map((c) => c.seat);
    const finalPts = featurePoints(feature, false);
    const completePts = featurePoints(feature, true);
    const expected = finalPts + (completePts - finalPts) * chance(feature);
    for (const owner of owners) {
      if (owner === seat) value += expected;
      else value -= expected * opponentWeight;
    }
  }

  let oppMeeples = 0;
  let oppCount = 0;
  for (let s = 0; s < playerCount; s++) {
    if (s === seat) continue;
    oppMeeples += meeplesLeft[s] ?? 0;
    oppCount++;
  }
  const avgOpp = oppCount > 0 ? oppMeeples / oppCount : 0;
  value += ((meeplesLeft[seat] ?? 0) - avgOpp) * 0.55;
  return value;
}

/** Penalty used only by the Companion: losing a child's sole claim on a
 *  feature by merging it into a larger feature where the AI has more meeples. */
export function stealPenalty(
  before: PlacedTile[],
  after: PlacedTile[],
  seat: number,
): number {
  const beforeAnalysis = analyze(before);
  const afterAnalysis = analyze(after);
  let penalty = 0;
  for (const feature of beforeAnalysis.features) {
    if (feature.complete || feature.meeples.length === 0) continue;
    const beforeMajority = majoritySeats(feature);
    if (beforeMajority.length === 0) continue;
    if (beforeMajority.includes(seat)) continue;
    const first = feature.meeples[0];
    if (!first) continue;
    const afterFeature = featureForNode(afterAnalysis, first.tileIndex, first.local);
    if (!afterFeature || afterFeature.complete) continue;
    const afterMajority = majoritySeats(afterFeature);
    if (!afterMajority.includes(seat)) continue;
    if (beforeMajority.some((s) => afterMajority.includes(s))) continue;
    penalty += Math.max(6, featurePoints(afterFeature, true) * 0.9);
  }
  return penalty;
}

interface Evaluated {
  move: Move;
  sim: ReturnType<typeof simulatePlacement>;
  value: number;
  order: number;
}

function moveId(move: Move): string {
  return `${move.kind}:${move.x},${move.y}:${move.rot}:${move.meeple ?? '-'}`;
}

function evaluateAll(
  view: GameView,
  seat: number,
  level: AiLevel,
  deadline: number,
): Evaluated[] {
  const moves = enumerateMoves(view, seat);
  const out: Evaluated[] = [];
  const oppWeight = level === 'companion' ? 0 : level === 'easy' ? 0.15 : level === 'normal' ? 0.35 : 0.5;
  const bagAfter = Math.max(0, view.bagCount - 1);
  for (let i = 0; i < moves.length; i++) {
    if (i > 0 && now() > deadline) break;
    const move = moves[i];
    if (move.kind === 'discard') {
      out.push({
        move,
        sim: simulatePlacement(
          view.tiles,
          view.currentTile ?? '',
          seat,
          { ...move, meeple: null },
          view.scores,
          view.meeplesLeft,
          view.completed,
        ),
        value: -30,
        order: i,
      });
      continue;
    }
    const sim = simulatePlacement(
      view.tiles,
      view.currentTile ?? '',
      seat,
      move,
      view.scores,
      view.meeplesLeft,
      view.completed,
    );
    let value = staticEval(
      sim.tiles,
      sim.scores,
      sim.meeplesLeft,
      bagAfter,
      seat,
      view.config.playerCount,
      oppWeight,
    );
    if (level === 'companion') {
      value -= stealPenalty(view.tiles, sim.tiles, seat);
      value += (sim.meeplesLeft[seat] ?? 0) * 0.4;
    }
    out.push({ move, sim, value, order: i });
  }
  return out;
}

function sortEvaluated(rows: Evaluated[]): Evaluated[] {
  return [...rows].sort((a, b) => b.value - a.value || a.order - b.order);
}

function sampleTile(afterTiles: PlacedTile[], discarded: string[], rng: () => number): string | null {
  const counts = new Map<string, number>();
  for (const type of TILE_DATA.types) counts.set(type.id, type.copies);
  for (const tile of afterTiles) {
    counts.set(tile.type, (counts.get(tile.type) ?? 0) - 1);
  }
  for (const id of discarded) counts.set(id, (counts.get(id) ?? 0) - 1);
  let total = 0;
  for (const n of counts.values()) if (n > 0) total += n;
  if (total <= 0) return null;
  let pick = rng() * total;
  for (const [id, n] of counts) {
    if (n <= 0) continue;
    if (pick < n) return id;
    pick -= n;
  }
  return null;
}

function opponentRisk(
  view: GameView,
  after: Evaluated,
  seat: number,
  rng: () => number,
  deadline: number,
  samples: number,
): number {
  const playerCount = view.config.playerCount;
  const nextSeat = (seat + 1) % playerCount;
  const bagAfter = Math.max(0, view.bagCount - 1);
  let risk = 0;
  for (let sample = 0; sample < samples; sample++) {
    if (now() > deadline) break;
    const tile = sampleTile(after.sim.tiles, view.discarded, rng);
    if (!tile) break;
    const fake = fakeState(
      { ...view, tiles: after.sim.tiles, scores: after.sim.scores, meeplesLeft: after.sim.meeplesLeft, current: nextSeat },
      nextSeat,
      tile,
    );
    const replies = placementsOnly(fake, nextSeat);
    if (replies.length === 0) continue;
    const stride = Math.max(1, Math.floor(replies.length / 5));
    let worst = 0;
    for (let i = 0; i < replies.length; i += stride) {
      if (now() > deadline) break;
      const reply = replies[i];
      if (reply.kind === 'discard') continue;
      const sim = simulatePlacement(
        after.sim.tiles,
        tile,
        nextSeat,
        reply,
        after.sim.scores,
        after.sim.meeplesLeft,
        after.sim.completed,
      );
      const gain =
        (sim.scores[nextSeat] ?? 0) -
        (after.sim.scores[nextSeat] ?? 0) +
        0.35 *
          (staticEval(
            sim.tiles,
            sim.scores,
            sim.meeplesLeft,
            Math.max(0, bagAfter - 1),
            nextSeat,
            playerCount,
            0,
          ) -
            staticEval(
              after.sim.tiles,
              after.sim.scores,
              after.sim.meeplesLeft,
              bagAfter,
              nextSeat,
              playerCount,
              0,
            ));
      worst = Math.max(worst, gain);
    }
    risk = Math.max(risk, worst);
  }
  return risk;
}

export interface ChooseOptions {
  level: AiLevel;
  budgetMs: number;
  rng: () => number;
}

export function chooseMove(view: GameView, seat: number, opts: ChooseOptions): Move | null {
  if (view.status !== 'playing' || view.current !== seat || !view.currentTile) return null;
  const deadline = now() + Math.max(15, opts.budgetMs);
  const evaluated = evaluateAll(view, seat, opts.level, deadline);
  if (evaluated.length === 0) {
    return { seat, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null };
  }
  const sorted = sortEvaluated(evaluated);

  if (opts.level === 'companion') {
    const pool = sorted.slice(0, Math.min(5, sorted.length));
    const pick = Math.min(pool.length - 1, Math.floor(opts.rng() * pool.length));
    return pool[pick].move;
  }

  if (opts.level === 'easy') {
    // Easy sees the right shape of a move but often picks a lesser one.
    if (sorted.length > 1 && opts.rng() < 0.45) {
      const span = Math.min(7, sorted.length - 1);
      return sorted[1 + Math.floor(opts.rng() * span)].move;
    }
    return sorted[0].move;
  }

  if (opts.level === 'normal') {
    // Normal usually takes the best plan, with a small human wobble.
    if (sorted.length > 1 && opts.rng() < 0.25) return sorted[1].move;
    return sorted[0].move;
  }

  // Hard: static value first, then a small expectimax over sampled next tiles.
  // Risk may only break near-ties, so it never gives away a clearly better move.
  const top = sorted.slice(0, Math.min(7, sorted.length)).filter(
    (candidate) => candidate.value >= topValue(sorted) - 0.8,
  );
  let best = sorted[0];
  let bestValue = sorted[0].value;
  for (let i = 0; i < top.length; i++) {
    if (now() > deadline - 25) break;
    const candidate = top[i];
    const risk = opponentRisk(view, candidate, seat, opts.rng, deadline - 10, 3);
    const adjusted = candidate.value - risk * 0.08;
    if (adjusted > bestValue) {
      bestValue = adjusted;
      best = candidate;
    }
  }
  return best.move;
}

function topValue(rows: Evaluated[]): number {
  return rows.length > 0 ? rows[0].value : 0;
}

export interface Explanation {
  key: string;
  params?: Record<string, string | number>;
}

export function explainMove(view: GameView, seat: number, move: Move): Explanation {
  if (move.kind === 'discard') return { key: 'hint.discard' };
  if (!view.currentTile) return { key: 'hint.place' };
  const sim = simulatePlacement(
    view.tiles,
    view.currentTile,
    seat,
    move,
    view.scores,
    view.meeplesLeft,
    view.completed,
  );
  if (sim.scored.length > 0) {
    const best = [...sim.scored].sort((a, b) => b.points - a.points)[0];
    return {
      key: 'hint.complete',
      params: { type: best.type, points: best.points },
    };
  }
  if (move.meeple != null) {
    const local = localFeatures(view.currentTile, move.rot)[move.meeple];
    if (local) {
      return { key: 'hint.claim', params: { type: local.type } };
    }
  }
  return { key: 'hint.place' };
}

export function hintMove(view: GameView, seat: number): { move: Move | null; explanation: Explanation | null } {
  const move = chooseMove(view, seat, {
    level: 'hard',
    budgetMs: 260,
    rng: seeded(0x51ed270b),
  });
  if (!move) return { move: null, explanation: null };
  return { move, explanation: explainMove(view, seat, move) };
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function moveSignature(move: Move): string {
  return moveId(move);
}
