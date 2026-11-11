import {
  COLORS,
  CODE_LENGTH,
  allCodes,
  codeKey,
  score,
  type Code,
  type Guess,
  type Peg,
  type Rng,
} from '../game/codebreak';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type AiNote = 'opening' | 'consistent' | 'elimination' | 'minimax' | 'gentle';

export interface AiMove {
  code: Code;
  candidates: number;
  worstCase: number;
  note: AiNote;
}

const CODES = allCodes();
const N = CODES.length;
const INDEX = new Map<string, number>();
CODES.forEach((code, index) => INDEX.set(codeKey(code), index));

const COLOR_INDEX = new Map<Peg, number>();
COLORS.forEach((color, index) => COLOR_INDEX.set(color, index));

function feedbackId(a: readonly Peg[], b: readonly Peg[]): number {
  let black = 0;
  const ca = [0, 0, 0, 0, 0, 0];
  const cb = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (a[i] === b[i]) {
      black += 1;
    } else {
      ca[COLOR_INDEX.get(a[i]) as number] += 1;
      cb[COLOR_INDEX.get(b[i]) as number] += 1;
    }
  }
  let white = 0;
  for (let i = 0; i < 6; i++) white += Math.min(ca[i], cb[i]);
  return black * 5 + white;
}

let table: Uint8Array | null = null;

/**
 * 1296 × 1296 feedback lookup (1.7 MB), built once. The symmetric upper
 * triangle is enough, but filling both halves keeps the hot loop branch-free.
 */
function feedbackTable(): Uint8Array {
  if (table) return table;
  const next = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) {
    next[i * N + i] = 4 * 5;
    for (let j = i + 1; j < N; j++) {
      const id = feedbackId(CODES[i], CODES[j]);
      next[i * N + j] = id;
      next[j * N + i] = id;
    }
  }
  table = next;
  return next;
}

function guessIndex(code: readonly Peg[]): number {
  return INDEX.get(codeKey(code)) ?? -1;
}

function candidateIndices(history: readonly Guess[]): number[] {
  if (history.length === 0) return Array.from({ length: N }, (_, index) => index);
  const round = feedbackTable();
  let candidates = Array.from({ length: N }, (_, index) => index);
  for (const guess of history) {
    const guessAt = guessIndex(guess.code);
    if (guessAt < 0) continue;
    const want = guess.feedback.black * 5 + guess.feedback.white;
    candidates = candidates.filter((index) => round[index * N + guessAt] === want);
    if (candidates.length === 0) break;
  }
  return candidates;
}

/** How the candidate pool is split for each possible feedback. */
function partition(
  guess: number,
  candidates: readonly number[],
  round: Uint8Array,
  buckets: Uint16Array,
): { worst: number; sumSquares: number } {
  buckets.fill(0);
  for (const candidate of candidates) {
    buckets[round[guess * N + candidate]] += 1;
  }
  let worst = 0;
  let sumSquares = 0;
  for (let index = 0; index < buckets.length; index++) {
    const size = buckets[index];
    if (size > worst) worst = size;
    sumSquares += size * size;
  }
  return { worst, sumSquares };
}

function copyCode(index: number): Code {
  return CODES[index].slice();
}

function pick<T>(items: readonly T[], rng: Rng): T {
  const raw = Math.floor(rng() * items.length);
  const index = Math.max(0, Math.min(items.length - 1, raw));
  return items[index];
}

const NORMAL_OPENERS: readonly Code[] = [
  ['red', 'red', 'yellow', 'yellow'],
  ['red', 'yellow', 'red', 'blue'],
  ['green', 'green', 'purple', 'purple'],
  ['blue', 'orange', 'blue', 'orange'],
];

/**
 * Pick the AI's next guess from the public feedback history only. The secret is
 * never passed in, so the same function can run in the browser, in tests or for
 * a hint.
 */
export function chooseGuess(history: readonly Guess[], level: AiLevel, rng: Rng): AiMove {
  const candidates = candidateIndices(history);
  const count = candidates.length;

  if (level === 'easy') {
    const index = pick(
      candidates.length > 0 ? candidates : Array.from({ length: N }, (_, i) => i),
      rng,
    );
    return {
      code: copyCode(index),
      candidates: count,
      worstCase: count,
      note: 'consistent',
    };
  }

  if (level === 'companion') {
    // Sometimes a cheerful, not-quite-consistent probe. It gives the child who
    // set the code another clue and another turn at the table.
    if (count > 1 && rng() < 0.2) {
      const index = pick(
        Array.from({ length: N }, (_, i) => i),
        rng,
      );
      return { code: copyCode(index), candidates: count, worstCase: count, note: 'gentle' };
    }
    const index = pick(candidates.length > 0 ? candidates : Array.from({ length: N }, (_, i) => i), rng);
    return { code: copyCode(index), candidates: count, worstCase: count, note: 'gentle' };
  }

  const round = feedbackTable();

  if (level === 'normal') {
    if (history.length === 0) {
      const code = pick(NORMAL_OPENERS, rng).slice();
      return { code, candidates: count, worstCase: count, note: 'opening' };
    }
    if (candidates.length === 0) {
      const index = pick(
        Array.from({ length: N }, (_, i) => i),
        rng,
      );
      return { code: copyCode(index), candidates: 0, worstCase: 0, note: 'consistent' };
    }
    if (candidates.length === 1) {
      return { code: copyCode(candidates[0]), candidates: 1, worstCase: 1, note: 'elimination' };
    }
    const buckets = new Uint16Array(25);
    let bestWorst = Number.POSITIVE_INFINITY;
    let bestSum = Number.POSITIVE_INFINITY;
    let best: number[] = [];
    for (const guess of candidates) {
      const { worst, sumSquares } = partition(guess, candidates, round, buckets);
      if (worst < bestWorst || (worst === bestWorst && sumSquares < bestSum)) {
        bestWorst = worst;
        bestSum = sumSquares;
        best = [guess];
      } else if (worst === bestWorst && sumSquares === bestSum) {
        best.push(guess);
      }
    }
    const index = pick(best, rng);
    return {
      code: copyCode(index),
      candidates: count,
      worstCase: bestWorst,
      note: 'elimination',
    };
  }

  // Hard: Knuth-style minimax over every possible guess, not only candidates.
  const candidateFlags = new Uint8Array(N);
  for (const candidate of candidates) candidateFlags[candidate] = 1;
  const buckets = new Uint16Array(25);
  let bestWorst = Number.POSITIVE_INFINITY;
  let bestSum = Number.POSITIVE_INFINITY;
  let bestIsCandidate = false;
  let best = -1;
  for (let guess = 0; guess < N; guess++) {
    if (candidates.length > 0) {
      const { worst, sumSquares } = partition(guess, candidates, round, buckets);
      const isCandidate = candidateFlags[guess] === 1;
      if (
        worst < bestWorst ||
        (worst === bestWorst && isCandidate && !bestIsCandidate) ||
        (worst === bestWorst && isCandidate === bestIsCandidate && sumSquares < bestSum)
      ) {
        bestWorst = worst;
        bestSum = sumSquares;
        bestIsCandidate = isCandidate;
        best = guess;
      }
    }
  }
  if (best < 0) {
    best = pick(
      Array.from({ length: N }, (_, i) => i),
      rng,
    );
  }
  return {
    code: copyCode(best),
    candidates: count,
    worstCase: candidates.length > 0 ? bestWorst : 0,
    note: history.length === 0 ? 'opening' : 'minimax',
  };
}

/** Number of codes still compatible with the public clues. */
export function candidateCount(history: readonly Guess[]): number {
  return candidateIndices(history).length;
}

/** Test/reference helper: keep guessing until the code is cracked. */
export function solve(
  secret: readonly Peg[],
  level: AiLevel,
  rng: Rng,
  limit = 20,
): { guesses: Guess[]; cracked: boolean } {
  const guesses: Guess[] = [];
  for (let turn = 0; turn < limit; turn++) {
    const move = chooseGuess(guesses, level, rng);
    const feedback = score(secret, move.code);
    guesses.push({ code: move.code.slice(), feedback });
    if (feedback.black === CODE_LENGTH) return { guesses, cracked: true };
  }
  return { guesses, cracked: false };
}
