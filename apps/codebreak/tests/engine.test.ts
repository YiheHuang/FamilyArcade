import { describe, expect, it } from 'vitest';
import {
  COLORS,
  allCodes,
  applySeat,
  codeKey,
  consistentCodes,
  isCode,
  randomCode,
  resultOf,
  revealPeg,
  score,
  setup,
  submitGuess,
  submitSecret,
  view,
  type Code,
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

function playing(secret: Code = c('red', 'green', 'blue', 'purple')) {
  return setup({ setterSeat: 0, secret });
}

describe('Codebreak engine · setup and codes', () => {
  it('starts in the setting phase with an empty board', () => {
    const state = setup();
    expect(state.status).toBe('setting');
    expect(state.secret).toBeNull();
    expect(state.setterSeat).toBe(0);
    expect(state.breakerSeat).toBe(1);
    expect(state.guesses).toEqual([]);
    expect(state.maxGuesses).toBe(10);
    expect(state.revealed).toEqual([null, null, null, null]);
  });

  it('can start with a preset secret and swaps the seats', () => {
    const state = setup({ setterSeat: 1, secret: c('orange', 'orange', 'red', 'blue'), hintsLeft: 2 });
    expect(state.status).toBe('playing');
    expect(state.breakerSeat).toBe(0);
    expect(state.secret).toEqual(['orange', 'orange', 'red', 'blue']);
    expect(state.hintsLeft).toBe(2);
  });

  it('rejects malformed setup secrets and limits', () => {
    expect(() => setup({ secret: ['red', 'red', 'red'] })).toThrow(RangeError);
    expect(() => setup({ secret: ['red', 'red', 'red', 'pink'] })).toThrow(RangeError);
    expect(() => setup({ maxGuesses: 0 })).toThrow(RangeError);
    expect(() => setup({ setterSeat: 2 as 0 })).toThrow(RangeError);
    expect(() => setup({ hintsLeft: -1 })).toThrow(RangeError);
  });

  it('accepts only four pegs from the six colours', () => {
    expect(isCode(['red', 'yellow', 'green', 'blue'])).toBe(true);
    expect(isCode(['red', 'yellow', 'green'])).toBe(false);
    expect(isCode(['red', 'yellow', 'green', 'blue', 'purple'])).toBe(false);
    expect(isCode(['red', 'yellow', 'green', 'black'])).toBe(false);
    expect(isCode(null)).toBe(false);
    expect(isCode('red-yellow-green-blue')).toBe(false);
  });

  it('builds all 1296 unique codes in a stable order', () => {
    const codes = allCodes();
    expect(codes).toHaveLength(1296);
    expect(new Set(codes.map(codeKey)).size).toBe(1296);
    expect(codes[0]).toEqual(['red', 'red', 'red', 'red']);
    expect(codes[1295]).toEqual(['orange', 'orange', 'orange', 'orange']);
  });

  it('makes deterministic random codes with an injected RNG', () => {
    const first = randomCode(seeded(42));
    const second = randomCode(seeded(42));
    expect(first).toEqual(second);
    for (let i = 0; i < 80; i++) {
      expect(isCode(randomCode(seeded(i)))).toBe(true);
    }
  });
});

describe('Codebreak engine · feedback', () => {
  it('gives four black for an exact match', () => {
    expect(score(c('red', 'yellow', 'green', 'blue'), c('red', 'yellow', 'green', 'blue'))).toEqual({
      black: 4,
      white: 0,
    });
  });

  it('gives four white for a reversed code', () => {
    expect(score(c('red', 'yellow', 'green', 'blue'), c('blue', 'green', 'yellow', 'red'))).toEqual({
      black: 0,
      white: 4,
    });
  });

  it('handles duplicate pegs without over-counting', () => {
    expect(score(c('red', 'red', 'green', 'blue'), c('green', 'red', 'red', 'red'))).toEqual({
      black: 1,
      white: 2,
    });
    expect(score(c('red', 'red', 'red', 'red'), c('red', 'red', 'red', 'red'))).toEqual({
      black: 4,
      white: 0,
    });
  });

  it('reports no clues for unrelated codes', () => {
    expect(score(c('red', 'red', 'green', 'green'), c('blue', 'blue', 'purple', 'purple'))).toEqual({
      black: 0,
      white: 0,
    });
  });

  it('never reports more than four clues', () => {
    const rng = seeded(7);
    for (let i = 0; i < 300; i++) {
      const secret = randomCode(rng);
      const guess = randomCode(rng);
      const feedback = score(secret, guess);
      expect(feedback.black + feedback.white).toBeLessThanOrEqual(4);
      expect(feedback.black).toBeGreaterThanOrEqual(0);
      expect(feedback.white).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Codebreak engine · turns and end states', () => {
  it('locks a secret and begins guessing', () => {
    const result = submitSecret(setup(), c('red', 'yellow', 'green', 'blue'));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('playing');
    expect(result.state.secret).toEqual(['red', 'yellow', 'green', 'blue']);
    expect(submitSecret(result.state, c('red', 'yellow', 'green', 'blue')).error).toBe('wrong-phase');
  });

  it('rejects bad secrets and guesses during the setting phase', () => {
    expect(submitSecret(setup(), ['red']).error).toBe('bad-code');
    expect(submitGuess(setup(), c('red', 'red', 'red', 'red')).error).toBe('game-over');
  });

  it('records feedback and keeps playing after a miss', () => {
    const state = playing();
    const result = submitGuess(state, c('red', 'red', 'green', 'blue'));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('playing');
    expect(result.state.guesses).toHaveLength(1);
    expect(result.state.guesses[0].feedback).toEqual({ black: 1, white: 2 });
    expect(result.state.secret).toEqual(['red', 'green', 'blue', 'purple']);
  });

  it('ends on four black and refuses more guesses', () => {
    const result = submitGuess(playing(), c('red', 'green', 'blue', 'purple'));
    expect(result.state.status).toBe('won');
    expect(resultOf(result.state)).toBe('breaker');
    expect(submitGuess(result.state, c('red', 'green', 'blue', 'purple')).error).toBe('game-over');
  });

  it('loses after ten legal guesses', () => {
    let state = playing(c('red', 'red', 'red', 'red'));
    for (let i = 0; i < 10; i++) {
      const result = submitGuess(state, c('yellow', 'yellow', 'yellow', 'yellow'));
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(state.status).toBe('lost');
    expect(state.guesses).toHaveLength(10);
    expect(resultOf(state)).toBe('setter');
  });

  it('lets a win on the tenth guess beat the guess limit', () => {
    let state = playing(c('red', 'red', 'red', 'red'));
    for (let i = 0; i < 9; i++) state = submitGuess(state, c('yellow', 'yellow', 'yellow', 'yellow')).state;
    state = submitGuess(state, c('red', 'red', 'red', 'red')).state;
    expect(state.status).toBe('won');
    expect(state.guesses).toHaveLength(10);
  });

  it('allows the same guess to be repeated', () => {
    let state = playing();
    state = submitGuess(state, c('red', 'red', 'red', 'red')).state;
    state = submitGuess(state, c('red', 'red', 'red', 'red')).state;
    expect(state.guesses).toHaveLength(2);
    expect(state.guesses[0].feedback).toEqual(state.guesses[1].feedback);
  });
});

describe('Codebreak engine · seats and hidden views', () => {
  it('enforces which seat may set and guess', () => {
    const setting = setup();
    expect(applySeat(setting, 1, { type: 'secret', code: c('red', 'red', 'red', 'red') }).error).toBe(
      'wrong-seat',
    );
    const started = applySeat(setting, 0, {
      type: 'secret',
      code: c('red', 'red', 'red', 'red'),
    });
    expect(started.ok).toBe(true);
    expect(
      applySeat(started.state, 0, { type: 'guess', code: c('red', 'red', 'red', 'red') }).error,
    ).toBe('wrong-seat');
    expect(
      applySeat(started.state, 1, { type: 'guess', code: c('red', 'red', 'red', 'red') }).ok,
    ).toBe(true);
  });

  it('rejects unknown actions', () => {
    expect(
      applySeat(setup(), 0, { type: 'nope' } as unknown as { type: 'guess'; code: Code }).error,
    ).toBe('bad-action');
  });

  it('hides the secret from the breaker while playing', () => {
    const state = playing();
    expect(state.secret).toEqual(['red', 'green', 'blue', 'purple']);
    expect(view(state, 1).secret).toBeNull();
    expect(view(state, 0).secret).toEqual(['red', 'green', 'blue', 'purple']);
  });

  it('reveals the secret to both seats when the round ends', () => {
    const won = submitGuess(playing(c('red', 'red', 'red', 'red')), c('red', 'red', 'red', 'red')).state;
    expect(view(won, 1).secret).toEqual(['red', 'red', 'red', 'red']);
    let lost = playing(c('red', 'red', 'red', 'red'));
    for (let i = 0; i < 10; i++) lost = submitGuess(lost, c('blue', 'blue', 'blue', 'blue')).state;
    expect(view(lost, 1).secret).toEqual(['red', 'red', 'red', 'red']);
  });

  it('reports canSet and canGuess for each seat', () => {
    const setting = setup();
    expect(view(setting, 0).canSet).toBe(true);
    expect(view(setting, 1).canSet).toBe(false);
    const started = submitSecret(setting, c('red', 'green', 'blue', 'purple')).state;
    expect(view(started, 0).canGuess).toBe(false);
    expect(view(started, 1).canGuess).toBe(true);
    expect(view(started, 1).role).toBe('breaker');
    expect(view(started, 0).role).toBe('setter');
  });

  it('returns copies that cannot mutate the engine state', () => {
    const state = playing();
    const seatView = view(state, 0);
    seatView.guesses.push({
      code: c('blue', 'blue', 'blue', 'blue'),
      feedback: { black: 0, white: 0 },
    });
    (seatView.secret as Code)[0] = 'orange';
    expect(state.guesses).toHaveLength(0);
    expect(state.secret).toEqual(['red', 'green', 'blue', 'purple']);
  });
});

describe('Codebreak engine · hints and candidate elimination', () => {
  it('reveals one peg and spends one hint', () => {
    const state = playing(c('red', 'green', 'blue', 'purple'));
    const hinted = setup({ secret: state.secret as Code, hintsLeft: 1 });
    const result = revealPeg(hinted);
    expect(result.ok).toBe(true);
    expect(result.state.hintsLeft).toBe(0);
    expect(result.state.revealed[0]).toBe('red');
    expect(revealPeg(result.state).error).toBe('no-hints');
  });

  it('can reveal a requested position', () => {
    const result = revealPeg(setup({ secret: c('red', 'green', 'blue', 'purple'), hintsLeft: 2 }), 2);
    expect(result.state.revealed).toEqual([null, null, 'blue', null]);
    expect(result.state.hintsLeft).toBe(1);
  });

  it('does not reveal pegs during the setting phase', () => {
    expect(revealPeg(setup({ hintsLeft: 2 })).ok).toBe(false);
  });

  it('keeps only codes consistent with every clue', () => {
    const state = playing(c('red', 'green', 'blue', 'purple'));
    const guessed = submitGuess(state, c('red', 'red', 'green', 'blue')).state;
    const candidates = consistentCodes(guessed.guesses);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThan(1296);
    expect(candidates.some((code) => codeKey(code) === codeKey(state.secret as Code))).toBe(true);
    for (const code of candidates) {
      expect(score(code, guessed.guesses[0].code)).toEqual(guessed.guesses[0].feedback);
    }
  });

  it('uses every colour in the palette', () => {
    expect(COLORS).toHaveLength(6);
    expect(new Set(COLORS).size).toBe(6);
  });
});
