/**
 * Idiom Chain — pure, deterministic engine.
 *
 * No DOM, network, clock or Math.random. The starting seat is chosen with an
 * injected RNG. Timers live in the UI; the engine exposes `timeout()` so the UI
 * can apply a late-play penalty without ever reading a clock here.
 *
 * House choices are documented in docs/rules.md:
 *   - three strikes (configurable) and a player is out; last standing wins;
 *   - invalid, blank, passed or late attempts lose the turn and add a strike;
 *   - a hint-free run of three earns one bonus point, then the run resets;
 *   - homophone mode matches the final syllable ignoring tone.
 */

import {
  IDIOMS,
  bareSyllable,
  chainCandidates,
  findIdiom,
  isRare,
  lastSyllable,
  normalizeIdiom,
  syllables,
  type Idiom,
} from './dictionary';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const DEFAULT_SECONDS = 15;
export const DEFAULT_TARGET = 10;
export const DEFAULT_MISS_LIMIT = 3;
export const DEFAULT_NAMES = [
  'Player 1',
  'Player 2',
  'Player 3',
  'Player 4',
  'Player 5',
  'Player 6',
] as const;

export type Status = 'playing' | 'finished';
export type ClosedBy = 'score' | 'last-standing' | 'all-out' | null;

export interface PlayerState {
  name: string;
  score: number;
  misses: number;
  out: boolean;
  /** Consecutive hint-free valid idioms since the last bonus. 0, 1 or 2. */
  streak: number;
}

export interface ChainEntry {
  seat: number;
  text: string;
  pinyin: string;
  gloss: string;
  rare: boolean;
  /** Total points awarded for this play, including rare and streak bonuses. */
  points: number;
  /** True when this play completed a third consecutive hint-free idiom. */
  streakBonus: boolean;
}

export interface GameConfig {
  seconds: number;
  homophone: boolean;
  target: number;
  missLimit: number;
}

export type FailReason =
  | 'invalid'
  | 'not-in-dictionary'
  | 'wrong-start'
  | 'repeated'
  | 'blank'
  | 'late'
  | 'pass'
  | 'no-move';

export type LastEvent =
  | {
      kind: 'play';
      seat: number;
      text: string;
      points: number;
      rare: boolean;
      streakBonus: boolean;
    }
  | { kind: 'miss'; seat: number; reason: FailReason; out: boolean }
  | { kind: 'finish'; seat: number; closedBy: ClosedBy };

export interface GameState {
  version: 1;
  players: PlayerState[];
  turn: number;
  starter: number;
  chain: ChainEntry[];
  status: Status;
  winner: number | null;
  winners: number[];
  closedBy: ClosedBy;
  config: GameConfig;
  lastEvent: LastEvent | null;
}

export interface SetupOptions {
  players?: number;
  names?: readonly string[];
  first?: number;
  seconds?: number;
  homophone?: boolean;
  target?: number;
  missLimit?: number;
}

export type PlayError =
  | 'finished'
  | 'wrong-turn'
  | 'not-in-dictionary'
  | 'wrong-start'
  | 'repeated'
  | 'blank'
  | 'out';

export interface PlayResult {
  /** False only when the attempt was rejected without changing the game. */
  applied: boolean;
  /** True only when a valid idiom was accepted. */
  valid: boolean;
  state: GameState;
  error?: PlayError;
  points?: number;
  entry?: ChainEntry;
}

export interface Hint {
  idiom: Idiom;
  reason: 'only' | 'opens' | 'rare' | 'common';
  /** Known unused continuations after playing this idiom. */
  nextCount: number;
  /** Base points before any streak bonus. */
  points: number;
}

export interface Required {
  char: string | null;
  sound: string | null;
  pinyin: string | null;
  text: string | null;
}

export interface SeatView {
  version: 1;
  seat: number;
  playerCount: number;
  players: PlayerState[];
  turn: number;
  starter: number;
  chain: ChainEntry[];
  status: Status;
  winner: number | null;
  winners: number[];
  closedBy: ClosedBy;
  config: GameConfig;
  lastEvent: LastEvent | null;
  /** The seat that owns this view may submit an idiom right now. */
  canPlay: boolean;
  requiredChar: string | null;
  requiredSound: string | null;
}

function clampRng(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999, Math.max(0, value));
}

function assertPlayers(players: number): void {
  if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
    throw new RangeError(`players must be ${MIN_PLAYERS}–${MAX_PLAYERS}`);
  }
}

function nameOf(names: readonly string[] | undefined, seat: number): string {
  const raw = names?.[seat]?.trim();
  return (raw || DEFAULT_NAMES[seat] || `Player ${seat + 1}`).slice(0, 18);
}

/** Build a fresh game. Seat selection uses only the injected RNG. */
export function setup(options: SetupOptions = {}, rng: () => number = () => 0): GameState {
  const players = options.players ?? MIN_PLAYERS;
  assertPlayers(players);
  const first =
    options.first === undefined ? Math.floor(clampRng(rng) * players) : options.first;
  if (!Number.isInteger(first) || first < 0 || first >= players) {
    throw new RangeError('first seat is out of range');
  }
  const seconds = options.seconds ?? DEFAULT_SECONDS;
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 120) {
    throw new RangeError('timer must be between 5 and 120 seconds');
  }
  const target = options.target ?? DEFAULT_TARGET;
  if (!Number.isInteger(target) || target < 1) throw new RangeError('target must be positive');
  const missLimit = options.missLimit ?? DEFAULT_MISS_LIMIT;
  if (!Number.isInteger(missLimit) || missLimit < 1 || missLimit > 9) {
    throw new RangeError('miss limit must be 1–9');
  }
  return {
    version: 1,
    players: Array.from({ length: players }, (_, seat) => ({
      name: nameOf(options.names, seat),
      score: 0,
      misses: 0,
      out: false,
      streak: 0,
    })),
    turn: first,
    starter: first,
    chain: [],
    status: 'playing',
    winner: null,
    winners: [],
    closedBy: null,
    config: {
      seconds,
      homophone: Boolean(options.homophone),
      target,
      missLimit,
    },
    lastEvent: null,
  };
}

export function lastEntry(state: GameState): ChainEntry | null {
  return state.chain.length ? state.chain[state.chain.length - 1] : null;
}

export function required(state: GameState): Required {
  const last = lastEntry(state);
  if (!last) return { char: null, sound: null, pinyin: null, text: null };
  const parts = syllables(last.pinyin);
  const pinyin = parts[parts.length - 1] ?? '';
  return {
    char: last.text.slice(-1),
    sound: bareSyllable(pinyin),
    pinyin,
    text: last.text,
  };
}

export function usedTexts(state: GameState): Set<string> {
  return new Set(state.chain.map((entry) => entry.text));
}

/** All unused idioms that legally continue the chain right now. */
export function chainableIdioms(state: GameState): Idiom[] {
  if (state.status !== 'playing') return [];
  const last = lastEntry(state);
  const previous = last ? findIdiom(last.text) ?? null : null;
  return chainCandidates(previous, state.config.homophone, usedTexts(state));
}

export function startMatches(idiom: Idiom, previous: ChainEntry | null, homophone: boolean): boolean {
  if (!previous) return true;
  if (homophone) {
    const parts = syllables(previous.pinyin);
    const sound = bareSyllable(parts[parts.length - 1] ?? '');
    const first = syllables(idiom.pinyin)[0] ?? '';
    return bareSyllable(first) === sound;
  }
  return idiom.text.charAt(0) === previous.text.slice(-1);
}

export function scoreFor(idiom: Idiom, streak: number, usedHint = false): {
  points: number;
  rare: boolean;
  streakBonus: boolean;
  nextStreak: number;
} {
  const rare = isRare(idiom);
  const run = usedHint ? 1 : streak + 1;
  const streakBonus = run >= 3;
  return {
    points: 1 + (rare ? 2 : 0) + (streakBonus ? 1 : 0),
    rare,
    streakBonus,
    nextStreak: streakBonus ? 0 : run,
  };
}

function activeSeats(state: GameState): number[] {
  return state.players.flatMap((player, seat) => (player.out ? [] : [seat]));
}

function nextActive(state: GameState, from: number): number {
  for (let step = 1; step <= state.players.length; step += 1) {
    const seat = (from + step) % state.players.length;
    if (!state.players[seat].out) return seat;
  }
  return -1;
}

function highestScoreWinners(state: GameState): number[] {
  const best = Math.max(...state.players.map((player) => player.score));
  return state.players.flatMap((player, seat) => (player.score === best ? [seat] : []));
}

function finish(state: GameState, winners: number[], closedBy: Exclude<ClosedBy, null>): GameState {
  const unique = [...new Set(winners)].filter((seat) => seat >= 0 && seat < state.players.length);
  return {
    ...state,
    status: 'finished',
    winners: unique,
    winner: unique.length === 1 ? unique[0] : null,
    closedBy,
    lastEvent:
      unique.length === 1
        ? { kind: 'finish', seat: unique[0], closedBy }
        : { kind: 'finish', seat: unique[0] ?? -1, closedBy },
  };
}

/**
 * Apply a failed attempt: one strike, turn passes, and a third strike (by
 * default) removes the player. The last active player wins immediately.
 */
export function failTurn(state: GameState, seat: number, reason: FailReason): GameState {
  if (state.status !== 'playing') return state;
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) return state;
  if (state.turn !== seat) return state;
  if (state.players[seat].out) return state;

  const players = state.players.map((player, index) =>
    index === seat
      ? {
          ...player,
          misses: player.misses + 1,
          out: player.misses + 1 >= state.config.missLimit,
          streak: 0,
        }
      : player,
  );
  const out = players[seat].out;
  let next: GameState = {
    ...state,
    players,
    lastEvent: { kind: 'miss', seat, reason, out },
  };
  if (activeSeats(next).length <= 1) {
    const winners = activeSeats(next);
    if (winners.length === 1) return finish(next, winners, 'last-standing');
    return finish(next, highestScoreWinners(next), 'all-out');
  }
  const following = nextActive(next, seat);
  if (following < 0) return finish(next, highestScoreWinners(next), 'all-out');
  next = { ...next, turn: following };
  return next;
}

export function passTurn(state: GameState, seat: number): GameState {
  return failTurn(state, seat, 'pass');
}

export function timeout(state: GameState, seat: number): GameState {
  return failTurn(state, seat, 'late');
}

/**
 * Resolve one typed attempt. Invalid attempts still change the state (the turn
 * passes and a strike is recorded), so callers must always render `result.state`.
 */
export function playIdiom(
  state: GameState,
  seat: number,
  raw: string,
  options: { usedHint?: boolean } = {},
): PlayResult {
  if (state.status !== 'playing') return { applied: false, valid: false, state, error: 'finished' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    return { applied: false, valid: false, state, error: 'wrong-turn' };
  }
  if (state.turn !== seat) return { applied: false, valid: false, state, error: 'wrong-turn' };
  if (state.players[seat].out) return { applied: false, valid: false, state, error: 'out' };

  const text = normalizeIdiom(raw);
  if (!text) {
    const next = failTurn(state, seat, 'blank');
    return { applied: true, valid: false, state: next, error: 'blank' };
  }
  const idiom = findIdiom(text);
  if (!idiom) {
    const next = failTurn(state, seat, 'not-in-dictionary');
    return { applied: true, valid: false, state: next, error: 'not-in-dictionary' };
  }
  const previous = lastEntry(state);
  if (!startMatches(idiom, previous, state.config.homophone)) {
    const next = failTurn(state, seat, 'wrong-start');
    return { applied: true, valid: false, state: next, error: 'wrong-start' };
  }
  if (usedTexts(state).has(idiom.text)) {
    const next = failTurn(state, seat, 'repeated');
    return { applied: true, valid: false, state: next, error: 'repeated' };
  }

  const scored = scoreFor(idiom, state.players[seat].streak, Boolean(options.usedHint));
  const entry: ChainEntry = {
    seat,
    text: idiom.text,
    pinyin: idiom.pinyin,
    gloss: idiom.gloss,
    rare: scored.rare,
    points: scored.points,
    streakBonus: scored.streakBonus,
  };
  const players = state.players.map((player, index) =>
    index === seat
      ? {
          ...player,
          score: player.score + scored.points,
          streak: scored.nextStreak,
        }
      : player,
  );
  let next: GameState = {
    ...state,
    players,
    chain: [...state.chain, entry],
    lastEvent: {
      kind: 'play',
      seat,
      text: idiom.text,
      points: scored.points,
      rare: scored.rare,
      streakBonus: scored.streakBonus,
    },
  };
  if (players[seat].score >= state.config.target) {
    next = finish(next, [seat], 'score');
  } else {
    const following = nextActive(next, seat);
    if (following < 0) next = finish(next, highestScoreWinners(next), 'all-out');
    else next = { ...next, turn: following };
  }
  return {
    applied: true,
    valid: true,
    state: next,
    points: scored.points,
    entry,
  };
}

/** Re-check the seat before applying a LAN intent. */
export function playForSeat(
  state: GameState,
  seat: number,
  raw: string,
  options: { usedHint?: boolean } = {},
): PlayResult {
  if (state.turn !== seat) {
    return { applied: false, valid: false, state, error: 'wrong-turn' };
  }
  return playIdiom(state, seat, raw, options);
}

/** Public per-seat view. There is no hidden information in idiom chain. */
export function view(state: GameState, seat: number): SeatView {
  const active = state.players[seat];
  return {
    version: 1,
    seat,
    playerCount: state.players.length,
    players: state.players.map((player) => ({ ...player })),
    turn: state.turn,
    starter: state.starter,
    chain: state.chain.map((entry) => ({ ...entry })),
    status: state.status,
    winner: state.winner,
    winners: state.winners.slice(),
    closedBy: state.closedBy,
    config: { ...state.config },
    lastEvent: state.lastEvent ? { ...state.lastEvent } : null,
    canPlay: state.status === 'playing' && state.turn === seat && Boolean(active) && !active.out,
    requiredChar: required(state).char,
    requiredSound: required(state).sound,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string): GameState | null {
  try {
    const value = JSON.parse(raw) as GameState;
    if (!value || value.version !== 1) return null;
    if (!Array.isArray(value.players)) return null;
    if (value.players.length < MIN_PLAYERS || value.players.length > MAX_PLAYERS) return null;
    if (!Number.isInteger(value.turn) || value.turn < 0 || value.turn >= value.players.length) {
      return null;
    }
    if (!Array.isArray(value.chain)) return null;
    if (!value.config || typeof value.config.homophone !== 'boolean') return null;
    if (value.config.seconds < 5 || value.config.seconds > 120) return null;
    if (value.status !== 'playing' && value.status !== 'finished') return null;
    for (const player of value.players) {
      if (
        !player ||
        typeof player.name !== 'string' ||
        !Number.isFinite(player.score) ||
        !Number.isFinite(player.misses) ||
        typeof player.out !== 'boolean' ||
        !Number.isFinite(player.streak)
      ) {
        return null;
      }
    }
    return value;
  } catch {
    return null;
  }
}

/** Count possible continuations after one idiom, excluding the current chain. */
function continuationCount(
  idiom: Idiom,
  used: ReadonlySet<string>,
  homophone: boolean,
): number {
  const trial = new Set(used);
  trial.add(idiom.text);
  return chainCandidates(idiom, homophone, trial).length;
}

/**
 * Reasoned hint. It always chooses a legal, unused idiom. The reason is one of
 * four localisable cases, and `nextCount` lets the UI explain why it is a good
 * continuation rather than just naming a word.
 */
export function hintFor(state: GameState, seat: number): Hint | null {
  if (state.status !== 'playing' || state.turn !== seat) return null;
  if (state.players[seat]?.out) return null;
  const candidates = chainableIdioms(state);
  if (candidates.length === 0) return null;
  const used = usedTexts(state);
  const ranked = candidates
    .map((idiom) => ({
      idiom,
      nextCount: continuationCount(idiom, used, state.config.homophone),
      length: [...idiom.text].length,
    }))
    .sort(
      (a, b) =>
        b.nextCount - a.nextCount ||
        b.idiom.frequency - a.idiom.frequency ||
        a.length - b.length ||
        a.idiom.text.localeCompare(b.idiom.text),
    );
  const pick = ranked[0];
  const reason: Hint['reason'] =
    candidates.length === 1
      ? 'only'
      : pick.nextCount >= 3
        ? 'opens'
        : isRare(pick.idiom)
          ? 'rare'
          : 'common';
  return {
    idiom: pick.idiom,
    reason,
    nextCount: pick.nextCount,
    points: 1 + (isRare(pick.idiom) ? 2 : 0),
  };
}

/** Deterministic best-start helper used by tests and demos. */
export function findByText(text: string): Idiom | undefined {
  return findIdiom(text);
}

export { IDIOMS, isRare, lastSyllable };
