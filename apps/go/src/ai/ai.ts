/**
 * Four deterministic Go opponents.
 *
 * The shared shortlist reads liberties, atari, captures, eyes, territory and
 * local influence. Normal and Hard then add random playouts from the strongest
 * candidates. Every random call goes through the injected RNG, so the same
 * position, level and RNG stream produce the same move.
 */

import {
  apply,
  groupInfo,
  libertiesAt,
  neighborsOf,
  opponent,
  pass as passMove,
  scoreBoard,
  starPoints,
  territoryOwner,
  type BoardSize,
  type Color,
  type GameState,
  type Score,
} from '../game/go';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type HintReason =
  | 'capture'
  | 'save'
  | 'atari'
  | 'territory'
  | 'influence'
  | 'opening'
  | 'pass'
  | 'solid';

export interface AiChoice {
  index: number | null;
  reason: HintReason;
}

type Rng = () => number;

interface Candidate {
  index: number;
  score: number;
  capture: number;
  save: number;
  opponentAtari: number;
  ownLiberties: number;
  reason: HintReason;
}

const starCache = new Map<BoardSize, Set<number>>();

function starsFor(size: BoardSize): Set<number> {
  let stars = starCache.get(size);
  if (!stars) {
    stars = new Set(starPoints(size));
    starCache.set(size, stars);
  }
  return stars;
}

function isStar(size: BoardSize, index: number): boolean {
  return starsFor(size).has(index);
}

function edgeDistance(size: BoardSize, index: number): number {
  const row = Math.floor(index / size);
  const col = index % size;
  return Math.min(row, col, size - 1 - row, size - 1 - col);
}

function eyeLike(board: GameState['board'], size: BoardSize, index: number, color: Color): boolean {
  let own = 0;
  let other = 0;
  let empty = 0;
  for (const neighbor of neighborsOf(size, index)) {
    if (board[neighbor] === color) own += 1;
    else if (board[neighbor] === null) empty += 1;
    else other += 1;
  }
  return own >= 2 && empty === 0 && other === 0;
}

/** Stones in adjacent friendly groups that are currently in atari. */
function groupsToSave(state: GameState, index: number, me: Color): number {
  const checked = new Set<number>();
  let total = 0;
  for (const neighbor of neighborsOf(state.size, index)) {
    if (state.board[neighbor] !== me) continue;
    if (libertiesAt(state.board, state.size, neighbor) !== 1) continue;
    const group = groupInfo(state.board, state.size, neighbor);
    const marker = group.stones[0];
    if (checked.has(marker)) continue;
    checked.add(marker);
    total += group.stones.length;
  }
  return total;
}

/** Adjacent enemy groups that would be in atari after a move. */
function opponentAtariCount(state: GameState, next: GameState, index: number, other: Color): number {
  const checked = new Set<number>();
  let total = 0;
  for (const neighbor of neighborsOf(state.size, index)) {
    if (next.board[neighbor] !== other) continue;
    if (libertiesAt(next.board, state.size, neighbor) !== 1) continue;
    const group = groupInfo(next.board, state.size, neighbor);
    const marker = group.stones[0];
    if (checked.has(marker)) continue;
    checked.add(marker);
    total += 1;
  }
  return total;
}

/**
 * Points near existing stones keep the branching factor sane on 19×19. Star
 * points stay in the list early so the AI can still spread out.
 */
function candidatePoints(state: GameState): number[] {
  const points: number[] = [];
  const near = new Set<number>();
  const early = state.moves.length < 18;
  for (let index = 0; index < state.board.length; index++) {
    if (state.board[index] === null) continue;
    const row = Math.floor(index / state.size);
    const col = index % state.size;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const y = row + dy;
        const x = col + dx;
        if (x < 0 || y < 0 || x >= state.size || y >= state.size) continue;
        const point = y * state.size + x;
        if (state.board[point] === null) near.add(point);
      }
    }
  }
  for (let index = 0; index < state.board.length; index++) {
    if (state.board[index] !== null) continue;
    if (near.has(index) || (early && isStar(state.size, index))) points.push(index);
  }
  return points.length > 0 ? points : state.board.flatMap((cell, index) => (cell === null ? [index] : []));
}

function analyse(state: GameState): Candidate[] {
  const me = state.turn;
  const other = opponent(me);
  const owner = territoryOwner(state.board, state.size);
  const early = state.moves.length < 20;
  const middle = (state.size - 1) / 2;
  const list: Candidate[] = [];

  for (const index of candidatePoints(state)) {
    const result = apply(state, index);
    if (!result.ok) continue;
    const next = result.state;
    const capture = next.captures[me] - state.captures[me];
    const own = groupInfo(next.board, state.size, index);
    const save = groupsToSave(state, index, me);
    const opponentAtari = opponentAtariCount(state, next, index, other);
    const ownLiberties = own.liberties.size;
    const row = Math.floor(index / state.size);
    const col = index % state.size;

    let reason: HintReason = 'influence';
    if (capture > 0) reason = 'capture';
    else if (save > 0 && ownLiberties >= 2) reason = 'save';
    else if (opponentAtari > 0) reason = 'atari';
    else if (owner[index] === me) reason = 'territory';
    else if (isStar(state.size, index) && early) reason = 'opening';
    else if (own.stones.length >= 3) reason = 'solid';

    let score = 0;
    score += capture * 16;
    if (save > 0) score += 6 + (ownLiberties >= 2 ? 4 : -12);
    if (ownLiberties === 1) score -= 14;
    score += opponentAtari * 2.5;

    const edge = edgeDistance(state.size, index);
    if (edge === 0) score -= 1.5;
    else if (edge === 1) score -= 0.15;

    if (isStar(state.size, index) && early) score += 2.2;
    const centerDistance = Math.abs(row - middle) + Math.abs(col - middle);
    if (centerDistance <= state.size / 5) score += 0.55;

    for (const neighbor of neighborsOf(state.size, index)) {
      if (next.board[neighbor] === me) score += 0.7;
      else if (next.board[neighbor] === other) score += 0.35;
    }

    const regionOwner = owner[index];
    if (regionOwner === other) score -= 7;
    if (regionOwner === me) score -= 1.2;
    if (eyeLike(state.board, state.size, index, me) && capture === 0 && save === 0) {
      score -= 28;
    }

    if (early && isStar(state.size, index)) {
      let friendlyNear = 0;
      for (let otherIndex = 0; otherIndex < state.board.length; otherIndex++) {
        if (state.board[otherIndex] !== me) continue;
        const distance =
          Math.abs(Math.floor(otherIndex / state.size) - row) +
          Math.abs((otherIndex % state.size) - col);
        if (distance <= 2) friendlyNear += 1;
      }
      score -= friendlyNear * 0.6;
    }

    list.push({ index, score, capture, save, opponentAtari, ownLiberties, reason });
  }

  list.sort((a, b) => b.score - a.score || a.index - b.index);
  return list;
}

function pickRandom<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.max(0, Math.floor(rng() * items.length)))];
}

function openingMove(state: GameState, rng: Rng): AiChoice {
  const stars = starPoints(state.size).filter((index) => state.board[index] === null);
  if (stars.length === 0) return { index: null, reason: 'pass' };
  const edge = state.size === 9 ? 2 : 3;
  const far = state.size - 1 - edge;
  const corners = stars.filter((index) => {
    const row = Math.floor(index / state.size);
    const col = index % state.size;
    return (row === edge || row === far) && (col === edge || col === far);
  });
  const pool = corners.length > 0 ? corners : stars;
  return { index: pickRandom(pool, rng), reason: 'opening' };
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

/** A bounded light playout. It samples empty points to stay quick on 19×19. */
function playout(state: GameState, color: Color, rng: Rng, maxMoves: number): number {
  let sim = state;
  let played = 0;
  const sample = Math.min(28, sim.size * sim.size);
  while (played < maxMoves && sim.status === 'playing') {
    const empties: number[] = [];
    for (let index = 0; index < sim.board.length; index++) {
      if (sim.board[index] === null) empties.push(index);
    }
    if (empties.length === 0) break;
    const order = shuffled(empties, rng);
    let moved = false;
    for (let attempt = 0; attempt < order.length && attempt < sample; attempt++) {
      const result = apply(sim, order[attempt]);
      if (result.ok) {
        sim = result.state;
        moved = true;
        break;
      }
    }
    if (!moved) {
      const passed = passMove(sim);
      if (!passed.ok) break;
      sim = passed.state;
    }
    played += 1;
  }
  const score: Score = sim.score ?? scoreBoard(sim.board, sim.size, sim.komi);
  return color === 'B' ? score.black - score.white : score.white - score.black;
}

function settledEnough(state: GameState, best: Candidate | undefined): boolean {
  if (!best) return true;
  if (best.capture > 0 || best.save > 0) return false;
  const empties = state.board.reduce((total, cell) => total + (cell === null ? 1 : 0), 0);
  if (empties <= Math.max(6, Math.floor(state.size / 2))) return true;
  const current = scoreBoard(state.board, state.size, state.komi);
  const mine = state.turn === 'B' ? current.black : current.white;
  const theirs = state.turn === 'B' ? current.white : current.black;
  if (state.passes >= 1) return mine >= theirs;
  if (state.moves.length > state.board.length * 0.72) {
    return mine > theirs + 5 && best.score < 4;
  }
  return false;
}

function chooseByPlayouts(
  state: GameState,
  candidates: Candidate[],
  plays: number,
  rng: Rng,
): Candidate | null {
  if (candidates.length === 0) return null;
  const shortlist = candidates.slice(0, plays >= 24 ? 8 : 6);
  const me = state.turn;
  const maxMoves = state.size === 19 ? 22 : 38;
  let best = shortlist[0];
  let bestValue = -Infinity;
  const perCandidate = Math.max(1, Math.floor(plays / shortlist.length));

  const remainder = Math.max(0, plays - perCandidate * shortlist.length);
  for (let candidateIndex = 0; candidateIndex < shortlist.length; candidateIndex++) {
    const candidate = shortlist[candidateIndex];
    const after = apply(state, candidate.index);
    if (!after.ok) continue;
    const runs = perCandidate + (candidateIndex < remainder ? 1 : 0);
    let wins = 0;
    let margin = 0;
    for (let i = 0; i < runs; i++) {
      const diff = playout(after.state, me, rng, maxMoves);
      margin += diff;
      if (diff > 0) wins += 1;
    }
    const winRate = wins / runs;
    const value = winRate * 100 + (margin / runs) * 0.6 + candidate.score * 1.5;
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = candidate;
    }
  }
  return best;
}

export function chooseMoveDetailed(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): AiChoice {
  if (state.status !== 'playing') return { index: null, reason: 'pass' };
  const empties = state.board.some((cell) => cell === null);
  if (!empties) return { index: null, reason: 'pass' };
  if (state.board.every((cell) => cell === null)) return openingMove(state, rng);

  const candidates = analyse(state);
  const best = candidates[0];
  if (!best) return { index: null, reason: 'pass' };

  if (settledEnough(state, best)) {
    return { index: null, reason: 'pass' };
  }

  if (level === 'normal' || level === 'hard') {
    const capture = candidates
      .filter((item) => item.capture > 0 && item.ownLiberties >= 2)
      .sort((a, b) => b.capture - a.capture || b.score - a.score)[0];
    if (capture && (capture.capture >= 2 || capture.score >= 8)) {
      return { index: capture.index, reason: 'capture' };
    }
    const save = candidates
      .filter((item) => item.capture === 0 && item.save > 0 && item.ownLiberties >= 2)
      .sort((a, b) => b.save - a.save || b.score - a.score)[0];
    if (save && save.save >= 2) {
      return { index: save.index, reason: 'save' };
    }
  }

  if (level === 'companion') {
    // Gentle: play near the best move, but avoid big captures and eye-filling.
    const gentle = candidates.filter(
      (item) => item.capture <= 1 && item.score >= best.score - 3,
    );
    const pool = gentle.length > 0 ? gentle.slice(0, 4) : [best];
    const pick = pickRandom(pool, rng);
    return { index: pick.index, reason: pick.reason };
  }

  if (level === 'easy') {
    if (rng() < 0.38) {
      return { index: pickRandom(candidates.slice(0, 12), rng).index, reason: 'influence' };
    }
    return { index: best.index, reason: best.reason };
  }

  if (level === 'normal') {
    if (rng() < 0.12) {
      const pick = pickRandom(candidates.slice(0, 6), rng);
      return { index: pick.index, reason: pick.reason };
    }
    const plays = state.size === 19 ? 8 : 12;
    const chosen = chooseByPlayouts(state, candidates, plays, rng) ?? best;
    return { index: chosen.index, reason: chosen.reason };
  }

  const plays = state.size === 19 ? 24 : 36;
  const chosen = chooseByPlayouts(state, candidates, plays, rng) ?? best;
  return { index: chosen.index, reason: chosen.reason };
}

export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number | null {
  return chooseMoveDetailed(state, level, rng).index;
}

/** A hint is the strongest analysis plus a plain-language reason code. */
export function hint(state: GameState, rng: Rng = Math.random): AiChoice {
  return chooseMoveDetailed(state, 'hard', rng);
}
