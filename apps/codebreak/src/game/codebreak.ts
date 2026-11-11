/**
 * Codebreak · 猜色 — pure Mastermind engine.
 *
 * No DOM, network, clock or Math.random. Every random choice takes an injected
 * RNG so games, tests and saved replays are reproducible.
 */

export const COLORS = ['red', 'yellow', 'green', 'blue', 'purple', 'orange'] as const;
export type Peg = (typeof COLORS)[number];
export type Code = Peg[];

export const CODE_LENGTH = 4;
export const MAX_GUESSES = 10;
export const MAX_COLORS = COLORS.length;

export type Rng = () => number;

export interface Feedback {
  /** Right colour in the right place. */
  black: number;
  /** Right colour in the wrong place. */
  white: number;
}

export interface Guess {
  code: Code;
  feedback: Feedback;
}

export type GameStatus = 'setting' | 'playing' | 'won' | 'lost';
export type Seat = 0 | 1;
export type Role = 'setter' | 'breaker';

export interface GameState {
  setterSeat: Seat;
  breakerSeat: Seat;
  /** Null until the setter locks a code. */
  secret: Code | null;
  guesses: Guess[];
  status: GameStatus;
  maxGuesses: number;
  /** Pegs exposed by a companion hint; null means still hidden. */
  revealed: (Peg | null)[];
  hintsLeft: number;
}

export interface SetupOptions {
  setterSeat?: Seat;
  /** Providing a secret skips the setting phase. */
  secret?: readonly string[] | null;
  maxGuesses?: number;
  hintsLeft?: number;
}

export type GameError =
  | 'bad-code'
  | 'bad-action'
  | 'wrong-phase'
  | 'wrong-seat'
  | 'no-hints'
  | 'game-over';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: GameError;
}

export type GameAction =
  | { type: 'secret'; code: readonly string[] }
  | { type: 'guess'; code: readonly string[] };

export interface GuessView {
  code: Code;
  feedback: Feedback;
}

export interface SeatView {
  seat: Seat;
  role: Role;
  setterSeat: Seat;
  breakerSeat: Seat;
  status: GameStatus;
  maxGuesses: number;
  guesses: GuessView[];
  /** Only the setter sees this while the game is running. */
  secret: Code | null;
  revealed: (Peg | null)[];
  hintsLeft: number;
  guessCount: number;
  remaining: number;
  canSet: boolean;
  canGuess: boolean;
}

const PEG_SET: ReadonlySet<string> = new Set(COLORS);

/** Validate an arbitrary value as a four-peg code. */
export function isCode(value: unknown): value is Code {
  return (
    Array.isArray(value) &&
    value.length === CODE_LENGTH &&
    value.every((peg) => typeof peg === 'string' && PEG_SET.has(peg))
  );
}

export function isPeg(value: unknown): value is Peg {
  return typeof value === 'string' && PEG_SET.has(value);
}

function cloneCode(code: readonly Peg[]): Code {
  return code.slice(0, CODE_LENGTH);
}

/** Exact-position black pegs, then colour-only white pegs. */
export function score(secret: readonly Peg[], guess: readonly Peg[]): Feedback {
  let black = 0;
  const secretCounts = new Map<Peg, number>();
  const guessCounts = new Map<Peg, number>();
  for (let index = 0; index < CODE_LENGTH; index++) {
    if (secret[index] === guess[index]) {
      black += 1;
    } else {
      const s = secret[index];
      const g = guess[index];
      secretCounts.set(s, (secretCounts.get(s) ?? 0) + 1);
      guessCounts.set(g, (guessCounts.get(g) ?? 0) + 1);
    }
  }
  let white = 0;
  for (const [color, count] of secretCounts) {
    white += Math.min(count, guessCounts.get(color) ?? 0);
  }
  return { black, white };
}

export function sameFeedback(a: Feedback, b: Feedback): boolean {
  return a.black === b.black && a.white === b.white;
}

let cachedCodes: Code[] | null = null;

/** All 6^4 = 1296 codes in a stable order. */
export function allCodes(): readonly Code[] {
  if (!cachedCodes) {
    const codes: Code[] = [];
    for (const a of COLORS) {
      for (const b of COLORS) {
        for (const c of COLORS) {
          for (const d of COLORS) {
            codes.push([a, b, c, d]);
          }
        }
      }
    }
    cachedCodes = codes;
  }
  return cachedCodes;
}

/** A random legal code using the injected RNG. */
export function randomCode(rng: Rng): Code {
  return Array.from({ length: CODE_LENGTH }, () => {
    const index = Math.min(COLORS.length - 1, Math.floor(rng() * COLORS.length));
    return COLORS[Math.max(0, index)];
  });
}

/** Codes that match every guess and feedback in the history. */
export function consistentCodes(guesses: readonly Guess[]): Code[] {
  if (guesses.length === 0) return allCodes().map((code) => [...code]);
  return allCodes()
    .filter((candidate) =>
      guesses.every((guess) => sameFeedback(score(candidate, guess.code), guess.feedback)),
    )
    .map((code) => [...code]);
}

export function codeKey(code: readonly Peg[]): string {
  return code.join('-');
}

export function setup(options: SetupOptions = {}): GameState {
  const setterSeat = options.setterSeat ?? 0;
  if (setterSeat !== 0 && setterSeat !== 1) throw new RangeError('setterSeat must be 0 or 1');
  const maxGuesses = options.maxGuesses ?? MAX_GUESSES;
  if (!Number.isInteger(maxGuesses) || maxGuesses < 1 || maxGuesses > 20) {
    throw new RangeError('maxGuesses must be 1–20');
  }
  const hintsLeft = options.hintsLeft ?? 0;
  if (!Number.isInteger(hintsLeft) || hintsLeft < 0) {
    throw new RangeError('hintsLeft must be a non-negative integer');
  }
  let secret: Code | null = null;
  let status: GameStatus = 'setting';
  if (options.secret !== undefined && options.secret !== null) {
    if (!isCode(options.secret)) throw new RangeError('secret must be a four-peg code');
    secret = cloneCode(options.secret);
    status = 'playing';
  }
  return {
    setterSeat,
    breakerSeat: setterSeat === 0 ? 1 : 0,
    secret,
    guesses: [],
    status,
    maxGuesses,
    revealed: Array<Peg | null>(CODE_LENGTH).fill(null),
    hintsLeft,
  };
}

export function submitSecret(state: GameState, code: readonly string[]): ActionResult {
  if (state.status !== 'setting') return { ok: false, state, error: 'wrong-phase' };
  if (!isCode(code)) return { ok: false, state, error: 'bad-code' };
  return {
    ok: true,
    state: {
      ...state,
      secret: cloneCode(code as Code),
      status: 'playing',
    },
  };
}

export function submitGuess(state: GameState, code: readonly string[]): ActionResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!isCode(code)) return { ok: false, state, error: 'bad-code' };
  const guess = code as Code;
  const feedback = score(state.secret as Code, guess);
  const guesses = [...state.guesses, { code: cloneCode(guess), feedback }];
  const status: GameStatus =
    feedback.black === CODE_LENGTH ? 'won' : guesses.length >= state.maxGuesses ? 'lost' : 'playing';
  return {
    ok: true,
    state: {
      ...state,
      guesses,
      status,
    },
  };
}

export function applySeat(state: GameState, seat: number, action: GameAction): ActionResult {
  if (!action || typeof action !== 'object' || !('type' in action)) {
    return { ok: false, state, error: 'bad-action' };
  }
  if (action.type === 'secret') {
    if (seat !== state.setterSeat) return { ok: false, state, error: 'wrong-seat' };
    return submitSecret(state, action.code);
  }
  if (action.type === 'guess') {
    if (seat !== state.breakerSeat) return { ok: false, state, error: 'wrong-seat' };
    return submitGuess(state, action.code);
  }
  return { ok: false, state, error: 'bad-action' };
}

/** Reveal one still-hidden secret peg. Used by the Companion level. */
export function revealPeg(state: GameState, index?: number): ActionResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (state.hintsLeft <= 0) return { ok: false, state, error: 'no-hints' };
  const secret = state.secret;
  if (!secret) return { ok: false, state, error: 'wrong-phase' };
  let target = index ?? state.revealed.findIndex((peg) => peg === null);
  if (target < 0 || target >= CODE_LENGTH) {
    target = state.revealed.findIndex((peg) => peg === null);
  }
  if (target < 0) return { ok: false, state, error: 'no-hints' };
  if (state.revealed[target] !== null) return { ok: false, state, error: 'no-hints' };
  const revealed = state.revealed.slice();
  revealed[target] = secret[target];
  return {
    ok: true,
    state: {
      ...state,
      revealed,
      hintsLeft: state.hintsLeft - 1,
    },
  };
}

export function resultOf(state: GameState): 'breaker' | 'setter' | null {
  if (state.status === 'won') return 'breaker';
  if (state.status === 'lost') return 'setter';
  return null;
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat: Seat = seat === 1 ? 1 : 0;
  const role: Role = safeSeat === state.setterSeat ? 'setter' : 'breaker';
  const finished = state.status === 'won' || state.status === 'lost';
  const secretVisible = state.secret !== null && (role === 'setter' || finished);
  return {
    seat: safeSeat,
    role,
    setterSeat: state.setterSeat,
    breakerSeat: state.breakerSeat,
    status: state.status,
    maxGuesses: state.maxGuesses,
    guesses: state.guesses.map((guess) => ({
      code: cloneCode(guess.code),
      feedback: { ...guess.feedback },
    })),
    secret: secretVisible ? cloneCode(state.secret as Code) : null,
    revealed: state.revealed.slice(),
    hintsLeft: state.hintsLeft,
    guessCount: state.guesses.length,
    remaining: Math.max(0, state.maxGuesses - state.guesses.length),
    canSet: state.status === 'setting' && role === 'setter',
    canGuess: state.status === 'playing' && role === 'breaker',
  };
}
