/**
 * Five Dice · pure, deterministic Yahtzee-like engine.
 *
 * No DOM, clock, network or Math.random here. Every random value comes from the
 * injected rng. The UI and the AI both drive the game through `applyAction`.
 */

export const DICE_COUNT = 5;
export const MAX_ROLLS = 3;
export const UPPER_TARGET = 63;
export const UPPER_BONUS = 35;

export const CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'threeKind',
  'fourKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'fiveKind',
  'chance',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type CategoryIndex = number;
export type Rng = () => number;
export type AiLevel = 'companion' | 'easy' | 'normal' | 'hard';

export const UPPER_CATEGORIES: readonly Category[] = CATEGORIES.slice(0, 6);
export const LOWER_CATEGORIES: readonly Category[] = CATEGORIES.slice(6);

export function isUpper(category: Category): boolean {
  return CATEGORIES.indexOf(category) >= 0 && CATEGORIES.indexOf(category) < 6;
}

export function categoryIndex(category: Category): number {
  return CATEGORIES.indexOf(category);
}

export function categoryAt(index: number): Category | null {
  return Number.isInteger(index) && index >= 0 && index < CATEGORIES.length
    ? CATEGORIES[index]
    : null;
}

export interface Player {
  name: string;
  ai: boolean;
  level?: AiLevel;
}

export type ScoreLine = Array<number | null>;

export interface LastScore {
  player: number;
  category: Category;
  points: number;
}

export interface GameState {
  version: 1;
  players: Player[];
  scores: ScoreLine[];
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  rollsUsed: number;
  turn: number;
  turnCount: number;
  status: 'playing' | 'over';
  startPlayer: number;
  last: LastScore | null;
}

export type Action =
  | { type: 'roll'; hold?: boolean[] }
  | { type: 'hold'; index: number }
  | { type: 'score'; category: number };

export type ActionError =
  | 'game-over'
  | 'wrong-turn'
  | 'no-rolls'
  | 'must-roll'
  | 'bad-die'
  | 'bad-category'
  | 'taken'
  | 'bad-seat';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: ActionError;
}

export interface PlayerTotals {
  upper: number;
  bonus: number;
  upperTotal: number;
  lower: number;
  total: number;
  filled: number;
}

export interface Standing {
  player: number;
  total: number;
  rank: number;
}

export interface SeatView {
  version: 1;
  players: Player[];
  scores: ScoreLine[];
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  rollsUsed: number;
  turn: number;
  turnCount: number;
  status: GameState['status'];
  startPlayer: number;
  last: LastScore | null;
  seat: number;
  canAct: boolean;
  open: number[];
  totals: PlayerTotals[];
  standings: Standing[];
  winners: number[];
}

function cloneScores(scores: ScoreLine[]): ScoreLine[] {
  return scores.map((line) => line.slice());
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    scores: cloneScores(state.scores),
    dice: state.dice.slice(),
    held: state.held.slice(),
    last: state.last ? { ...state.last } : null,
  };
}

function randomDie(rng: Rng): number {
  const value = Math.floor(rng() * 6) + 1;
  return Math.min(6, Math.max(1, value));
}

export function emptyLine(): ScoreLine {
  return Array<number | null>(CATEGORIES.length).fill(null);
}

export function createGame(players: Player[], startPlayer = 0): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new Error('Five Dice needs 2 to 4 players');
  }
  const seat = Math.min(players.length - 1, Math.max(0, Math.trunc(startPlayer)));
  return {
    version: 1,
    players: players.map((player) => ({ ...player })),
    scores: players.map(() => emptyLine()),
    dice: Array<number>(DICE_COUNT).fill(0),
    held: Array<boolean>(DICE_COUNT).fill(false),
    rollsLeft: MAX_ROLLS,
    rollsUsed: 0,
    turn: seat,
    turnCount: 0,
    status: 'playing',
    startPlayer: seat,
    last: null,
  };
}

/** Count occurrences of each face; index 1..6 is used. */
export function faceCounts(dice: readonly number[]): number[] {
  const counts = Array<number>(7).fill(0);
  for (const die of dice) {
    if (Number.isInteger(die) && die >= 1 && die <= 6) counts[die] += 1;
  }
  return counts;
}

function hasStraight(counts: number[], length: 4 | 5): boolean {
  for (let start = 1; start + length - 1 <= 6; start += 1) {
    let all = true;
    for (let face = start; face < start + length; face += 1) {
      if (counts[face] < 1) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/** The 13 category values for a five-die hand. */
export function scoreDice(dice: readonly number[], category: Category): number {
  if (dice.length !== DICE_COUNT || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) {
    return 0;
  }
  const counts = faceCounts(dice);
  const sum = dice.reduce((total, die) => total + die, 0);
  const upper = CATEGORIES.indexOf(category);
  if (upper >= 0 && upper < 6) return counts[upper + 1] * (upper + 1);
  const highest = Math.max(...counts.slice(1));
  const pairs = counts.slice(1).filter((count) => count === 2).length;
  const triples = counts.slice(1).filter((count) => count === 3).length;
  switch (category) {
    case 'threeKind':
      return highest >= 3 ? sum : 0;
    case 'fourKind':
      return highest >= 4 ? sum : 0;
    case 'fullHouse':
      return triples === 1 && pairs === 1 ? 25 : 0;
    case 'smallStraight':
      return hasStraight(counts, 4) ? 30 : 0;
    case 'largeStraight':
      return hasStraight(counts, 5) ? 40 : 0;
    case 'fiveKind':
      return highest === 5 ? 50 : 0;
    case 'chance':
      return sum;
    default:
      return 0;
  }
}

export function upperSubtotal(line: readonly (number | null)[]): number {
  let total = 0;
  for (let index = 0; index < 6; index += 1) total += line[index] ?? 0;
  return total;
}

export function lowerSubtotal(line: readonly (number | null)[]): number {
  let total = 0;
  for (let index = 6; index < CATEGORIES.length; index += 1) total += line[index] ?? 0;
  return total;
}

export function totalsFor(line: readonly (number | null)[]): PlayerTotals {
  const upper = upperSubtotal(line);
  const bonus = upper >= UPPER_TARGET ? UPPER_BONUS : 0;
  const lower = lowerSubtotal(line);
  const filled = line.filter((value) => value !== null).length;
  return { upper, bonus, upperTotal: upper + bonus, lower, total: upper + bonus + lower, filled };
}

export function totals(state: GameState): PlayerTotals[] {
  return state.scores.map((line) => totalsFor(line));
}

export function openCategories(state: GameState, player = state.turn): number[] {
  const line = state.scores[player];
  if (!line) return [];
  return line.flatMap((value, index) => (value === null ? [index] : []));
}

export function canScore(state: GameState, category: CategoryIndex, player = state.turn): boolean {
  return (
    state.status === 'playing' &&
    state.rollsUsed > 0 &&
    openCategories(state, player).includes(category)
  );
}

export function standings(state: GameState): Standing[] {
  const rows = state.scores.map((line, player) => ({
    player,
    total: totalsFor(line).total,
  }));
  rows.sort((a, b) => b.total - a.total || a.player - b.player);
  let rank = 0;
  let previous: number | null = null;
  return rows.map((row, index) => {
    if (previous === null || row.total !== previous) rank = index + 1;
    previous = row.total;
    return { ...row, rank };
  });
}

export function winners(state: GameState): number[] {
  if (state.status !== 'over') return [];
  const rows = standings(state);
  const best = rows[0]?.total ?? 0;
  return rows.filter((row) => row.total === best).map((row) => row.player);
}

function advanceTurn(state: GameState): GameState {
  const next = cloneState(state);
  const players = next.players.length;
  const allDone = next.scores.every((line) => line.every((value) => value !== null));
  if (allDone) {
    next.status = 'over';
    return next;
  }
  let seat = next.turn;
  for (let step = 0; step < players; step += 1) {
    seat = (seat + 1) % players;
    if (next.scores[seat].some((value) => value === null)) break;
  }
  next.turn = seat;
  next.dice = Array<number>(DICE_COUNT).fill(0);
  next.held = Array<boolean>(DICE_COUNT).fill(false);
  next.rollsLeft = MAX_ROLLS;
  next.rollsUsed = 0;
  return next;
}

export function roll(state: GameState, rng: Rng, hold?: boolean[]): ActionResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (state.rollsLeft <= 0) return { ok: false, state, error: 'no-rolls' };
  const next = cloneState(state);
  if (next.rollsUsed === 0) {
    next.dice = next.dice.map(() => randomDie(rng));
    next.held = Array<boolean>(DICE_COUNT).fill(false);
  } else {
    if (hold && hold.length === DICE_COUNT) {
      next.held = hold.map(Boolean);
    }
    next.dice = next.dice.map((die, index) => (next.held[index] ? die : randomDie(rng)));
  }
  next.rollsUsed += 1;
  next.rollsLeft = MAX_ROLLS - next.rollsUsed;
  return { ok: true, state: next };
}

export function toggleHold(state: GameState, index: number): ActionResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(index) || index < 0 || index >= DICE_COUNT) {
    return { ok: false, state, error: 'bad-die' };
  }
  if (state.rollsUsed === 0) return { ok: false, state, error: 'must-roll' };
  if (state.rollsLeft <= 0) return { ok: false, state, error: 'no-rolls' };
  const next = cloneState(state);
  next.held[index] = !next.held[index];
  return { ok: true, state: next };
}

export function scoreTurn(state: GameState, category: CategoryIndex): ActionResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (state.rollsUsed === 0) return { ok: false, state, error: 'must-roll' };
  if (!Number.isInteger(category) || category < 0 || category >= CATEGORIES.length) {
    return { ok: false, state, error: 'bad-category' };
  }
  if (state.scores[state.turn][category] !== null) {
    return { ok: false, state, error: 'taken' };
  }
  const next = cloneState(state);
  const cat = CATEGORIES[category];
  const points = scoreDice(next.dice, cat);
  next.scores[next.turn][category] = points;
  next.last = { player: next.turn, category: cat, points };
  next.turnCount += 1;
  return { ok: true, state: advanceTurn(next) };
}

export function applyAction(
  state: GameState,
  seat: number,
  action: Action,
  rng: Rng,
): ActionResult {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    return { ok: false, state, error: 'bad-seat' };
  }
  if (seat !== state.turn) return { ok: false, state, error: 'wrong-turn' };
  if (action.type === 'roll') return roll(state, rng, action.hold);
  if (action.type === 'hold') return toggleHold(state, action.index);
  if (action.type === 'score') return scoreTurn(state, action.category);
  return { ok: false, state, error: 'bad-category' };
}

export function currentRound(state: GameState): number {
  const round = Math.floor(state.turnCount / state.players.length) + 1;
  return Math.min(CATEGORIES.length, Math.max(1, round));
}

export type HandKind =
  | 'fiveKind'
  | 'largeStraight'
  | 'smallStraight'
  | 'fullHouse'
  | 'fourKind'
  | 'threeKind'
  | 'twoPair'
  | 'pair'
  | 'high';

/** A friendly label for the current five-die hand. */
export function classifyHand(dice: readonly number[]): HandKind | null {
  if (dice.length !== DICE_COUNT || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) {
    return null;
  }
  const counts = faceCounts(dice);
  const groups = counts.slice(1);
  const highest = Math.max(...groups);
  if (highest === 5) return 'fiveKind';
  if (hasStraight(counts, 5)) return 'largeStraight';
  if (hasStraight(counts, 4)) return 'smallStraight';
  if (groups.filter((count) => count === 3).length === 1 && groups.filter((count) => count === 2).length === 1) {
    return 'fullHouse';
  }
  if (highest === 4) return 'fourKind';
  if (highest === 3) return 'threeKind';
  if (groups.filter((count) => count === 2).length === 2) return 'twoPair';
  if (highest === 2) return 'pair';
  return 'high';
}

export function viewFor(state: GameState, seat: number): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat < state.players.length ? seat : 0;
  return {
    version: 1,
    players: state.players.map((player) => ({ ...player })),
    scores: cloneScores(state.scores),
    dice: state.dice.slice(),
    held: state.held.slice(),
    rollsLeft: state.rollsLeft,
    rollsUsed: state.rollsUsed,
    turn: state.turn,
    turnCount: state.turnCount,
    status: state.status,
    startPlayer: state.startPlayer,
    last: state.last ? { ...state.last } : null,
    seat: safeSeat,
    canAct: state.status === 'playing' && state.turn === safeSeat,
    open: openCategories(state, safeSeat),
    totals: totals(state),
    standings: standings(state),
    winners: winners(state),
  };
}

export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  if (state.version !== 1) return false;
  if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 4) return false;
  if (!state.players.every((player) => player && typeof player.name === 'string')) return false;
  if (!Array.isArray(state.scores) || state.scores.length !== state.players.length) return false;
  if (!state.scores.every(
    (line) =>
      Array.isArray(line) &&
      line.length === CATEGORIES.length &&
      line.every((score) => score === null || (typeof score === 'number' && Number.isFinite(score))),
  )) {
    return false;
  }
  if (!Array.isArray(state.dice) || state.dice.length !== DICE_COUNT) return false;
  if (!state.dice.every((die) => Number.isInteger(die) && die >= 0 && die <= 6)) return false;
  if (!Array.isArray(state.held) || state.held.length !== DICE_COUNT) return false;
  if (!state.held.every((held) => typeof held === 'boolean')) return false;
  if (state.status !== 'playing' && state.status !== 'over') return false;
  if (typeof state.turn !== 'number' || state.turn < 0 || state.turn >= state.players.length) return false;
  if (typeof state.turnCount !== 'number' || state.turnCount < 0) return false;
  if (typeof state.rollsLeft !== 'number' || state.rollsLeft < 0 || state.rollsLeft > MAX_ROLLS) return false;
  if (typeof state.rollsUsed !== 'number' || state.rollsUsed < 0 || state.rollsUsed > MAX_ROLLS) return false;
  return true;
}
