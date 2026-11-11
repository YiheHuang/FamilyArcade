import {
  applyMove,
  checkersOnBoard,
  endTurn,
  legalSequences,
  other,
  pipCount,
  roll,
  ownCount,
  type GameState,
  type Move,
  type Side,
  type TurnSequence,
} from '../game/tables';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function blots(state: GameState, side: Side): number {
  let count = 0;
  for (let point = 0; point < 24; point += 1) {
    if (ownCount(state, side, point) === 1) count += 1;
  }
  return count;
}

function homePoints(state: GameState, side: Side): number {
  const points = side === 'W' ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23];
  return points.filter((point) => ownCount(state, side, point) >= 2).length;
}

/** Static evaluation from `me`'s point of view. Higher is better. */
export function evaluate(state: GameState, me: Side): number {
  if (state.status === 'finished') {
    if (!state.winner) return 0;
    return state.winner === me ? 100000 : -100000;
  }
  const them = other(me);
  let score = pipCount(state, them) - pipCount(state, me);
  score += (state.off[me] - state.off[them]) * 14;
  score += (state.bar[them] - state.bar[me]) * 22;
  score -= blots(state, me) * 2.4;
  score += blots(state, them) * 1.5;
  score += homePoints(state, me) * 1.2;
  score -= homePoints(state, them) * 0.6;
  // Keeping the opponent on the bar is especially strong late in the game.
  score += state.bar[them] * Math.max(0, state.off[me] - 5) * 0.6;
  return score;
}

function sequenceHits(sequence: TurnSequence): number {
  return sequence.moves.filter((move) => move.hit).length;
}

function bestBy(
  sequences: TurnSequence[],
  score: (sequence: TurnSequence) => number,
  rng: Rng,
): TurnSequence {
  let best = -Infinity;
  let picks: TurnSequence[] = [];
  for (const sequence of sequences) {
    const value = score(sequence);
    if (value > best + 1e-9) {
      best = value;
      picks = [sequence];
    } else if (Math.abs(value - best) <= 1e-9) {
      picks.push(sequence);
    }
  }
  return pick(picks, rng);
}

function playSequence(state: GameState, moves: Move[]): GameState {
  let current = state;
  for (const move of moves) {
    if (current.status !== 'moving') break;
    const result = applyMove(current, move);
    if (!result.ok) break;
    current = result.state;
  }
  return current;
}

function simulateReply(state: GameState, me: Side, rng: Rng): number {
  let current = state;
  if (current.status === 'finished') return evaluate(current, me);
  if (current.turn === me) return evaluate(current, me);
  if (current.status === 'awaiting-roll') {
    const a = 1 + Math.floor(rng() * 6);
    const b = 1 + Math.floor(rng() * 6);
    const rolled = roll(current, a, b);
    if (!rolled.ok) return evaluate(current, me);
    current = rolled.state;
  }
  const replies = legalSequences(current);
  if (replies.length === 0) {
    const passed = endTurn(current);
    return evaluate(passed.ok ? passed.state : current, me);
  }
  const reply = bestBy(replies, (sequence) => evaluate(sequence.state, current.turn), rng);
  const after = playSequence(current, reply.moves);
  return evaluate(after, me);
}

export function chooseTurn(state: GameState, level: AiLevel, rng: Rng = Math.random): Move[] {
  if (state.status !== 'moving') return [];
  const sequences = legalSequences(state);
  if (sequences.length === 0) return [];
  const side = state.turn;

  if (level === 'easy') {
    // Easy deliberately has no plan: a random legal turn.
    return pick(sequences, rng).moves;
  }

  if (level === 'companion') {
    // Companion is kind: it avoids hitting whenever a gentler turn exists.
    const wins = sequences.filter((sequence) => sequence.state.winner === side);
    if (wins.length > 0) return pick(wins, rng).moves;
    const gentle = sequences.filter((sequence) => sequenceHits(sequence) === 0);
    const pool = gentle.length > 0 ? gentle : sequences;
    const chosen = bestBy(pool, (sequence) => evaluate(sequence.state, side) + rng() * 1.4, rng);
    return chosen.moves;
  }

  if (level === 'normal') {
    return bestBy(sequences, (sequence) => evaluate(sequence.state, side) + rng() * 0.15, rng).moves;
  }

  // Hard: rank the candidate turns, then sample the opponent's next dice to
  // punish loose blots and reward durable positions. Deterministic given rng.
  const ranked = sequences
    .map((sequence) => ({ sequence, score: evaluate(sequence.state, side) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  let bestScore = -Infinity;
  let best: TurnSequence[] = [];
  for (const candidate of ranked) {
    let total = candidate.score;
    for (let sample = 0; sample < 5; sample += 1) {
      total += simulateReply(candidate.sequence.state, side, rng) * 0.32;
    }
    // A tiny tie-break keeps equal positions varied but reproducible.
    total += rng() * 0.01;
    if (total > bestScore + 1e-9) {
      bestScore = total;
      best = [candidate.sequence];
    } else if (Math.abs(total - bestScore) <= 1e-9) {
      best.push(candidate.sequence);
    }
  }
  return pick(best, rng).moves;
}

export type HintReason = 'hit' | 'enter' | 'bear-off' | 'make-point' | 'safe' | 'best';

export interface Hint {
  moves: Move[];
  reason: HintReason;
}

export function hint(state: GameState, rng: Rng = Math.random): Hint {
  const moves = chooseTurn(state, 'hard', rng);
  if (moves.length === 0) return { moves, reason: 'best' };
  let reason: HintReason = 'best';
  if (moves.some((move) => move.hit)) reason = 'hit';
  else if (moves[0].from === 'bar') reason = 'enter';
  else if (moves.some((move) => move.to === 'off')) reason = 'bear-off';
  else {
    const first = moves[0];
    if (typeof first.to === 'number' && ownCount(state, state.turn, first.to) === 1) {
      reason = 'make-point';
    } else {
      reason = 'safe';
    }
  }
  return { moves, reason };
}

/** Evaluate the current position for the UI without exposing internals. */
export function positionFacts(state: GameState) {
  return {
    whitePips: pipCount(state, 'W'),
    blackPips: pipCount(state, 'B'),
    whiteCheckers: checkersOnBoard(state, 'W'),
    blackCheckers: checkersOnBoard(state, 'B'),
  };
}
