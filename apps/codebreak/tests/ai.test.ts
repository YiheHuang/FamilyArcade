import { describe, expect, it } from 'vitest';
import { candidateCount, chooseGuess, solve, type AiLevel } from '../src/ai/ai';
import {
  CODE_LENGTH,
  isCode,
  sameFeedback,
  score,
  type Code,
  type Guess,
  type Peg,
} from '../src/game/codebreak';

const c = (...pegs: Peg[]): Code => pegs;

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const history: Guess[] = [
  { code: c('red', 'red', 'yellow', 'blue'), feedback: { black: 1, white: 1 } },
  { code: c('green', 'blue', 'purple', 'orange'), feedback: { black: 0, white: 2 } },
];

const LEVELS: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

describe('Codebreak AI · legality', () => {
  it('returns a four-peg legal code at every level', () => {
    for (const level of LEVELS) {
      const move = chooseGuess(history, level, seeded(11));
      expect(isCode(move.code)).toBe(true);
      expect(move.code).toHaveLength(CODE_LENGTH);
      expect(move.candidates).toBeGreaterThan(0);
    }
  });

  it('only returns guesses that fit the clues on Easy and Normal', () => {
    for (const level of ['easy', 'normal'] as const) {
      const move = chooseGuess(history, level, seeded(5));
      for (const guess of history) {
        expect(sameFeedback(score(move.code, guess.code), guess.feedback)).toBe(true);
      }
    }
  });

  it('keeps Hard guesses consistent with the public clues', () => {
    const move = chooseGuess(history, 'hard', seeded(9));
    for (const guess of history) {
      expect(sameFeedback(score(move.code, guess.code), guess.feedback)).toBe(true);
    }
  });

  it('lets Companion make a friendly non-optimal probe but never an illegal code', () => {
    const move = chooseGuess(history, 'companion', seeded(1));
    expect(isCode(move.code)).toBe(true);
    expect(['gentle', 'opening']).toContain(move.note);
  });

  it('never returns the secret as feedback history (no accidental oracle)', () => {
    for (const level of LEVELS) {
      const move = chooseGuess(history, level, seeded(21));
      expect(move.code).not.toEqual(c('red', 'red', 'yellow', 'blue'));
    }
  });
});

describe('Codebreak AI · deterministic and candidate-aware', () => {
  it('is deterministic with the same injected RNG', () => {
    for (const level of LEVELS) {
      const a = chooseGuess(history, level, seeded(123));
      const b = chooseGuess(history, level, seeded(123));
      expect(a.code).toEqual(b.code);
      expect(a.note).toBe(b.note);
    }
  });

  it('ignores the RNG on Hard while candidates remain', () => {
    const low = chooseGuess(history, 'hard', () => 0);
    const high = chooseGuess(history, 'hard', () => 0.999);
    expect(low.code).toEqual(high.code);
  });

  it('narrows the candidate pool after a clue', () => {
    const count = candidateCount(history);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(1296);
    expect(count).toBeLessThan(candidateCount([history[0]]));
  });

  it('reports a worst-case pool no larger than the candidate count', () => {
    for (const level of ['normal', 'hard'] as const) {
      const move = chooseGuess(history, level, seeded(4));
      expect(move.worstCase).toBeGreaterThan(0);
      expect(move.worstCase).toBeLessThanOrEqual(move.candidates);
    }
  });

  it('uses an opening probe on an empty history', () => {
    for (const level of LEVELS) {
      const move = chooseGuess([], level, seeded(77));
      expect(move.candidates).toBe(1296);
      expect(isCode(move.code)).toBe(true);
    }
    expect(chooseGuess([], 'normal', seeded(2)).note).toBe('opening');
    expect(chooseGuess([], 'hard', seeded(2)).note).toBe('opening');
  });
});

describe('Codebreak AI · solving', () => {
  it('Hard cracks a fixed secret within six guesses', () => {
    const result = solve(c('red', 'green', 'blue', 'purple'), 'hard', seeded(2026));
    expect(result.cracked).toBe(true);
    expect(result.guesses.length).toBeLessThanOrEqual(6);
    expect(result.guesses[result.guesses.length - 1].feedback).toEqual({ black: 4, white: 0 });
  });

  it('Normal cracks a fixed secret within the ten-guess limit', () => {
    const result = solve(c('orange', 'orange', 'yellow', 'green'), 'normal', seeded(8));
    expect(result.cracked).toBe(true);
    expect(result.guesses.length).toBeLessThanOrEqual(10);
  });

  it('Easy eventually finds a code when given enough turns', () => {
    const result = solve(c('blue', 'red', 'orange', 'purple'), 'easy', seeded(31), 30);
    expect(result.cracked).toBe(true);
  });

  it('produces a legal and useful hint for a human guesser', () => {
    const move = chooseGuess(history, 'normal', seeded(99));
    expect(isCode(move.code)).toBe(true);
    expect(move.candidates).toBe(candidateCount(history));
    expect(move.worstCase).toBeGreaterThan(0);
  });
});
