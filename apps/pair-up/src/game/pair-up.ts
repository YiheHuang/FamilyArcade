/**
 * Pair Up — pure, deterministic memory-game engine.
 *
 * No DOM, network, clock or Math.random. The shuffle takes an injected RNG.
 * A turn is two flips. A matching pair stays open and scores; a miss goes into
 * the `resolve` phase, and the caller calls `resolve()` after showing the cards.
 */

export type DeckSize = 4 | 6;
export type Phase = 'choose' | 'resolve' | 'over';
export type Status = 'playing' | 'finished';

export interface Reveal {
  index: number;
  value: number;
  seat: number;
}

export interface LastEvent {
  kind: 'match' | 'miss';
  seat: number;
  tiles: number[];
}

export interface GameState {
  version: 1;
  size: DeckSize;
  deck: number[];
  playerCount: number;
  turn: number;
  first: number;
  flipped: number[];
  matchedBy: (number | null)[];
  scores: number[];
  misses: number[];
  pairsLeft: number;
  moves: number;
  phase: Phase;
  status: Status;
  winner: number | null;
  ties: number[];
  reveals: Reveal[];
  lastEvent: LastEvent | null;
}

export type FlipError =
  | 'game-over'
  | 'resolve'
  | 'bad-tile'
  | 'matched'
  | 'already-up'
  | 'wrong-turn';

export interface FlipResult {
  ok: boolean;
  state: GameState;
  error?: FlipError;
}

export interface SetupOptions {
  size?: DeckSize;
  players?: number;
  first?: number;
}

export interface TileView {
  /** Face value only when the card is open or has been matched. */
  value: number | null;
  matchedBy: number | null;
}

export interface SeatView {
  version: 1;
  size: DeckSize;
  playerCount: number;
  seat: number;
  turn: number;
  phase: Phase;
  status: Status;
  scores: number[];
  misses: number[];
  matchedBy: (number | null)[];
  flipped: number[];
  tiles: TileView[];
  pairsLeft: number;
  moves: number;
  winner: number | null;
  ties: number[];
  canFlip: boolean;
  myTurn: boolean;
  lastEvent: LastEvent | null;
}

const SIZES: readonly DeckSize[] = [4, 6];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

function assertSize(size: number): asserts size is DeckSize {
  if (!SIZES.includes(size as DeckSize)) throw new RangeError('deck size must be 4 or 6');
}

function assertPlayers(players: number): void {
  if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
    throw new RangeError(`players must be ${MIN_PLAYERS}–${MAX_PLAYERS}`);
  }
}

function clampRng(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999, Math.max(0, value));
}

/** A valid deck has two copies of every value and exactly 16 or 36 cards. */
export function isDeck(deck: readonly number[]): boolean {
  if (!Array.isArray(deck)) return false;
  if (deck.length !== 16 && deck.length !== 36) return false;
  const counts = new Map<number, number>();
  for (const value of deck) {
    if (!Number.isInteger(value) || value < 0) return false;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (counts.size !== deck.length / 2) return false;
  for (const count of counts.values()) if (count !== 2) return false;
  return true;
}

/** Build a state around an exact deck. Useful for tests and deterministic demos. */
export function createState(deck: readonly number[], players = MIN_PLAYERS, first = 0): GameState {
  if (!isDeck(deck)) throw new Error('invalid deck');
  assertPlayers(players);
  const size = Math.sqrt(deck.length) as DeckSize;
  assertSize(size);
  if (!Number.isInteger(first) || first < 0 || first >= players) {
    throw new RangeError('first seat is out of range');
  }
  const pairs = deck.length / 2;
  return {
    version: 1,
    size,
    deck: [...deck],
    playerCount: players,
    turn: first,
    first,
    flipped: [],
    matchedBy: Array<number | null>(deck.length).fill(null),
    scores: Array<number>(players).fill(0),
    misses: Array<number>(players).fill(0),
    pairsLeft: pairs,
    moves: 0,
    phase: 'choose',
    status: 'playing',
    winner: null,
    ties: [],
    reveals: [],
    lastEvent: null,
  };
}

/** Shuffle a fresh deck with the caller's RNG (Fisher–Yates). */
export function setup(
  options: SetupOptions = {},
  rng: () => number = () => 0,
): GameState {
  const size = options.size ?? 4;
  const players = options.players ?? 2;
  const first = options.first ?? 0;
  assertSize(size);
  assertPlayers(players);
  if (!Number.isInteger(first) || first < 0 || first >= players) {
    throw new RangeError('first seat is out of range');
  }
  const pairs = (size * size) / 2;
  const deck: number[] = [];
  for (let value = 0; value < pairs; value++) deck.push(value, value);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(clampRng(rng) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return createState(deck, players, first);
}

export function faceUp(state: GameState, index: number): boolean {
  return state.matchedBy[index] !== null || state.flipped.includes(index);
}

export function visibleValue(state: GameState, index: number): number | null {
  return faceUp(state, index) ? state.deck[index] : null;
}

/** Face-down, unmatched cards that may be flipped this turn. */
export function legalFlips(state: GameState): number[] {
  if (state.status !== 'playing' || state.phase !== 'choose') return [];
  return state.deck.flatMap((_, index) => {
    if (state.matchedBy[index] !== null) return [];
    if (state.flipped.includes(index)) return [];
    return [index];
  });
}

function finish(state: GameState): GameState {
  if (state.pairsLeft > 0) return state;
  const best = Math.max(...state.scores);
  const winners = state.scores.flatMap((score, seat) => (score === best ? [seat] : []));
  return {
    ...state,
    phase: 'over',
    status: 'finished',
    winner: winners.length === 1 ? winners[0] : null,
    ties: winners.length > 1 ? winners : [],
  };
}

function nextTurn(state: GameState): GameState {
  return {
    ...state,
    turn: (state.turn + 1) % state.playerCount,
    phase: 'choose',
  };
}

/** Flip one card. The second flip of a miss enters the `resolve` phase. */
export function flip(state: GameState, index: number): FlipResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (state.phase !== 'choose') return { ok: false, state, error: 'resolve' };
  if (!Number.isInteger(index) || index < 0 || index >= state.deck.length) {
    return { ok: false, state, error: 'bad-tile' };
  }
  if (state.matchedBy[index] !== null) return { ok: false, state, error: 'matched' };
  if (state.flipped.includes(index)) return { ok: false, state, error: 'already-up' };

  const seat = state.turn;
  const value = state.deck[index];
  const reveals = [...state.reveals, { index, value, seat }];

  if (state.flipped.length === 0) {
    return {
      ok: true,
      state: { ...state, flipped: [index], reveals },
    };
  }

  const firstIndex = state.flipped[0];
  const matched = state.deck[firstIndex] === value;
  const moves = state.moves + 1;

  if (matched) {
    const matchedBy = state.matchedBy.slice();
    matchedBy[firstIndex] = seat;
    matchedBy[index] = seat;
    const scores = state.scores.slice();
    scores[seat] += 1;
    const next: GameState = {
      ...state,
      flipped: [],
      matchedBy,
      scores,
      pairsLeft: state.pairsLeft - 1,
      moves,
      reveals,
      phase: 'choose',
      lastEvent: { kind: 'match', seat, tiles: [firstIndex, index] },
    };
    return { ok: true, state: finish(next) };
  }

  const misses = state.misses.slice();
  misses[seat] += 1;
  return {
    ok: true,
    state: {
      ...state,
      flipped: [firstIndex, index],
      misses,
      moves,
      phase: 'resolve',
      reveals,
      lastEvent: { kind: 'miss', seat, tiles: [firstIndex, index] },
    },
  };
}

/** Turn the two mismatched cards face down and pass the turn. */
export function resolve(state: GameState): GameState {
  if (state.phase !== 'resolve' || state.status !== 'playing') return state;
  const next = nextTurn({ ...state, flipped: [] });
  return next;
}

/** Enforce that a network seat only flips on its own turn. */
export function flipForSeat(state: GameState, seat: number, index: number): FlipResult {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.playerCount) {
    return { ok: false, state, error: 'wrong-turn' };
  }
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  return flip(state, index);
}

/** Hidden-information view: face-down values are null. */
export function view(state: GameState, seat: number): SeatView {
  const canFlip =
    state.status === 'playing' &&
    state.phase === 'choose' &&
    state.turn === seat &&
    state.flipped.length < 2;
  return {
    version: 1,
    size: state.size,
    playerCount: state.playerCount,
    seat,
    turn: state.turn,
    phase: state.phase,
    status: state.status,
    scores: state.scores.slice(),
    misses: state.misses.slice(),
    matchedBy: state.matchedBy.slice(),
    flipped: state.flipped.slice(),
    tiles: state.deck.map((value, index) => ({
      value: faceUp(state, index) ? value : null,
      matchedBy: state.matchedBy[index],
    })),
    pairsLeft: state.pairsLeft,
    moves: state.moves,
    winner: state.winner,
    ties: state.ties.slice(),
    canFlip,
    myTurn: state.turn === seat,
    lastEvent: state.lastEvent
      ? { ...state.lastEvent, tiles: state.lastEvent.tiles.slice() }
      : null,
  };
}

/** Clean JSON snapshot for LAN / autosave. */
export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string): GameState | null {
  try {
    const value = JSON.parse(raw) as GameState;
    if (!value || value.version !== 1) return null;
    if (!isDeck(value.deck)) return null;
    if (value.deck.length !== value.size * value.size) return null;
    if (value.matchedBy.length !== value.deck.length) return null;
    if (value.flipped.length > 2) return null;
    if (!Array.isArray(value.scores) || value.scores.length !== value.playerCount) return null;
    return value;
  } catch {
    return null;
  }
}
