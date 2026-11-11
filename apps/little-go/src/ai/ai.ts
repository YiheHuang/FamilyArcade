/**
 * Four deterministic Go opponents.
 *
 * All randomness goes through an injected `rng` so the same position, level and
 * RNG stream produce the same move. The heuristics are deliberately modest:
 * liberties, atari, eyes/territory and influence. Normal and Hard add random
 * playouts (30 and 200 respectively, as specified by the app brief).
 */

import {
  apply,
  groupInfo,
  legalMoves,
  libertiesAt,
  opponent,
  scoreBoard,
  STARS,
  territoryOwner,
  type Color,
  type GameState,
  type Score,
} from '../game/little-go';

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

const isStar = (index: number): boolean => STARS.includes(index);

function edgeDistance(index: number): number {
  const row = Math.floor(index / 9);
  const col = index % 9;
  return Math.min(row, col, 8 - row, 8 - col);
}

function eyeLike(board: GameState['board'], index: number, color: Color): boolean {
  let own = 0;
  let other = 0;
  let empty = 0;
  for (const neighbor of neighborsOf(index)) {
    if (board[neighbor] === color) own += 1;
    else if (board[neighbor] === null) empty += 1;
    else other += 1;
  }
  // A point whose orthogonal neighbours are all our own stones is an eye;
  // filling it is almost always a self-destructive move.
  return own >= 2 && empty === 0 && other === 0;
}

function neighborsOf(index: number): number[] {
  // Small local copy keeps the AI module independent of board internals.
  const row = Math.floor(index / 9);
  const col = index % 9;
  const out: number[] = [];
  if (row > 0) out.push(index - 9);
  if (row < 8) out.push(index + 9);
  if (col > 0) out.push(index - 1);
  if (col < 8) out.push(index + 1);
  return out;
}

function analyse(state: GameState, level: AiLevel): Candidate[] {
  const me = state.turn;
  const other = opponent(me);
  const owner = territoryOwner(state.board);
  const early = state.moves.length < 20;
  const list: Candidate[] = [];

  for (const index of legalMoves(state)) {
    let save = 0;
    for (const neighbor of neighborsOf(index)) {
      if (state.board[neighbor] !== me) continue;
      const group = groupInfo(state.board, neighbor);
      if (group.liberties.size === 1) save += group.stones.length;
    }

    const result = apply(state, index);
    if (!result.ok) continue;
    const next = result.state;
    const capture = next.captures[me] - state.captures[me];
    const ownLiberties = libertiesAt(next.board, index);
    let opponentAtari = 0;
    for (const neighbor of neighborsOf(index)) {
      if (next.board[neighbor] !== other) continue;
      if (libertiesAt(next.board, neighbor) === 1) opponentAtari += 1;
    }

    let reason: HintReason = 'influence';
    if (capture > 0) reason = 'capture';
    else if (save > 0 && ownLiberties >= 2) reason = 'save';
    else if (opponentAtari > 0) reason = 'atari';
    else if (owner[index] === me) reason = 'territory';
    else if (isStar(index) && early) reason = 'opening';
    else if (groupInfo(next.board, index).stones.length >= 3) reason = 'solid';

    let score = 0;
    score += capture * (level === 'companion' ? 5 : 16);
    if (save > 0) {
      score += 6 + (ownLiberties >= 2 ? 4 : -12);
      if (level === 'companion') score += 2;
    }
    if (ownLiberties === 1) score -= 14;
    score += opponentAtari * (level === 'companion' ? 0.5 : 2.5);

    const edge = edgeDistance(index);
    if (edge === 0) score -= 1.5;
    else if (edge === 1) score -= 0.15;

    if (isStar(index) && early) score += 2.2;
    if (Math.floor(index / 9) >= 3 && Math.floor(index / 9) <= 5 && index % 9 >= 3 && index % 9 <= 5) {
      score += 0.55;
    }

    for (const neighbor of neighborsOf(index)) {
      if (next.board[neighbor] === me) score += 0.7;
      else if (next.board[neighbor] === other) score += 0.35;
    }

    const regionOwner = owner[index];
    if (regionOwner === other) score -= level === 'companion' ? 30 : 7;
    if (regionOwner === me) score -= 1.2;
    if (eyeLike(state.board, index, me) && capture === 0 && save === 0) score -= 28;
    if (level === 'companion' && capture > 1) score -= 18;

    // Opening preference: don't all crowd one corner. Distant star points get
    // a tiny lift once the first few stones are down.
    if (early && isStar(index)) {
      let friendlyNear = 0;
      for (let otherIndex = 0; otherIndex < state.board.length; otherIndex++) {
        if (state.board[otherIndex] !== me) continue;
        const distance = Math.abs(Math.floor(otherIndex / 9) - Math.floor(index / 9)) + Math.abs((otherIndex % 9) - (index % 9));
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

function playout(state: GameState, color: Color, rng: Rng): number {
  let sim = state;
  let played = 0;
  const limit = 54;
  while (played < limit && sim.status === 'playing') {
    const empties: number[] = [];
    for (let index = 0; index < sim.board.length; index++) {
      if (sim.board[index] === null) empties.push(index);
    }
    if (empties.length === 0) break;
    for (let i = empties.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const swap = empties[i];
      empties[i] = empties[j];
      empties[j] = swap;
    }
    let moved = false;
    for (const index of empties) {
      const result = apply(sim, index);
      if (result.ok) {
        sim = result.state;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    played += 1;
  }
  const score: Score = scoreBoard(sim.board);
  return color === 'B' ? score.black - score.white : score.white - score.black;
}

function settledEnough(state: GameState, best: Candidate | undefined): boolean {
  if (!best) return true;
  const owner = territoryOwner(state.board);
  let unowned = 0;
  for (let index = 0; index < state.board.length; index++) {
    if (state.board[index] === null && owner[index] === null) unowned += 1;
  }
  if (best.capture > 0 || best.save > 0) return false;
  if (unowned === 0) return true;
  const current = scoreBoard(state.board);
  const mine = state.turn === 'B' ? current.black : current.white;
  const theirs = state.turn === 'B' ? current.white : current.black;
  return mine > theirs && best.score < 5;
}

function chooseByPlayouts(
  state: GameState,
  candidates: Candidate[],
  plays: number,
  rng: Rng,
): Candidate | null {
  if (candidates.length === 0) return null;
  const shortlist = candidates.slice(0, plays >= 200 ? 8 : 6);
  const me = state.turn;
  let best = shortlist[0];
  let bestValue = -Infinity;
  const perCandidate = Math.max(1, Math.floor(plays / shortlist.length));

  for (const candidate of shortlist) {
    const after = apply(state, candidate.index);
    if (!after.ok) continue;
    let wins = 0;
    let margin = 0;
    for (let i = 0; i < perCandidate; i++) {
      const diff = playout(after.state, me, rng);
      margin += diff;
      if (diff > 0) wins += 1;
    }
    const winRate = wins / perCandidate;
    const value = winRate * 100 + (margin / perCandidate) * 0.6 + candidate.score * 1.5;
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = candidate;
    }
  }
  return best;
}

export function chooseMoveDetailed(state: GameState, level: AiLevel, rng: Rng = Math.random): AiChoice {
  if (state.status !== 'playing') return { index: null, reason: 'pass' };
  const moves = legalMoves(state);
  if (moves.length === 0) return { index: null, reason: 'pass' };

  const candidates = analyse(state, level);
  const best = candidates[0];

  // Passing is only attractive when the opponent has just passed, or the board
  // has no neutral points left and our side is already ahead.
  if (settledEnough(state, best)) {
    if (state.passes >= 1 || state.moves.length > 35) return { index: null, reason: 'pass' };
  }

  if (!best) return { index: null, reason: 'pass' };

  // Tactical reflexes keep Normal and Hard from missing a free capture or a
  // group that can be saved. Playouts are noisy; a simple tactic is not.
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
    const gentle = candidates.slice(0, 3);
    const pool = gentle.filter((item) => item.score >= gentle[0].score - 2.5);
    const pick = pickRandom(pool.length ? pool : [best], rng);
    return { index: pick.index, reason: pick.reason };
  }

  if (level === 'easy') {
    if (rng() < 0.38) {
      const pick = pickRandom(moves, rng);
      return { index: pick, reason: 'influence' };
    }
    return { index: best.index, reason: best.reason };
  }

  if (level === 'normal') {
    if (rng() < 0.12) {
      const pick = pickRandom(candidates.slice(0, 6), rng);
      return { index: pick.index, reason: pick.reason };
    }
    const chosen = chooseByPlayouts(state, candidates, 30, rng) ?? best;
    return { index: chosen.index, reason: chosen.reason };
  }

  const chosen = chooseByPlayouts(state, candidates, 200, rng) ?? best;
  return { index: chosen.index, reason: chosen.reason };
}

export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number | null {
  return chooseMoveDetailed(state, level, rng).index;
}

/** A hint is just the strongest analysis, with a human-readable reason code. */
export function hint(state: GameState, rng: Rng = Math.random): AiChoice {
  return chooseMoveDetailed(state, 'hard', rng);
}
