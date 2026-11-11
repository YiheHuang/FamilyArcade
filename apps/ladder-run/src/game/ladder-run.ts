/**
 * Ladder Run — pure snakes-and-ladders engine.
 *
 * No DOM, network, clock or Math.random lives here. Dice rolls take an injected
 * RNG (or an explicit die for deterministic UI/AI/tests). All functions return
 * new state; nothing is mutated.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const FINISH = 100;
export const BOARD_SIZE = 10;

export type AiLevel = 'companion' | 'easy' | 'normal' | 'hard';
export type SeatKind = 'human' | 'ai' | 'remote';
export type GameStatus = 'playing' | 'won';
export type Transport = 'none' | 'ladder' | 'snake';

export interface PlayerState {
  seat: number;
  name: string;
  kind: SeatKind;
  level: AiLevel;
  /** 0 = not yet on the board, 100 = home. */
  position: number;
}

export interface Move {
  seat: number;
  roll: number;
  from: number;
  /** The square the die would have reached before a snake or ladder. */
  raw: number;
  /** The final square after any snake or ladder. */
  to: number;
  transport: Transport;
  /** The roll would have gone past 100, so the player stayed put. */
  overshoot: boolean;
  wins: boolean;
}

export interface GameState {
  version: 1;
  players: PlayerState[];
  turn: number;
  status: GameStatus;
  winner: number | null;
  lastRoll: number | null;
  lastMove: Move | null;
  moves: Move[];
}

export interface SetupOptions {
  players?: number;
  names?: string[];
  kinds?: SeatKind[];
  levels?: AiLevel[];
}

export interface RollPreview {
  seat: number;
  roll: number;
  from: number;
  raw: number;
  to: number;
  transport: Transport;
  overshoot: boolean;
  wins: boolean;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  move?: Move;
  error?: 'game-over' | 'wrong-turn' | 'bad-seat' | 'bad-die';
}

export interface Hint {
  seat: number;
  previews: RollPreview[];
  best: RollPreview;
  reason: 'finish' | 'ladder' | 'safe' | 'snake' | 'overshoot';
}

export interface SeatView {
  players: PlayerState[];
  turn: number;
  status: GameStatus;
  winner: number | null;
  lastRoll: number | null;
  lastMove: Move | null;
  moveCount: number;
  seat: number;
  canRoll: boolean;
}

/** Classic family-board ladders. No ladder ends on 100: the last square is exact-roll only. */
export const LADDERS: Readonly<Record<number, number>> = Object.freeze({
  3: 22,
  8: 30,
  20: 41,
  28: 55,
  36: 44,
  51: 67,
  63: 81,
  71: 90,
  78: 98,
});

/** Snakes. Heads are high, tails are low; none touches 100. */
export const SNAKES: Readonly<Record<number, number>> = Object.freeze({
  17: 7,
  32: 12,
  45: 25,
  54: 34,
  61: 18,
  69: 50,
  74: 53,
  82: 62,
  89: 70,
  96: 86,
  99: 97,
});

export const AI_LEVELS: readonly AiLevel[] = ['companion', 'easy', 'normal', 'hard'];
export const SEAT_KINDS: readonly SeatKind[] = ['human', 'ai', 'remote'];

const MAX_NAME = 18;

function cleanName(name: unknown, fallback: string): string {
  if (typeof name !== 'string') return fallback;
  const trimmed = name.trim().slice(0, MAX_NAME);
  return trimmed || fallback;
}

function cleanLevel(level: unknown): AiLevel {
  return AI_LEVELS.includes(level as AiLevel) ? (level as AiLevel) : 'normal';
}

function cleanKind(kind: unknown): SeatKind {
  return SEAT_KINDS.includes(kind as SeatKind) ? (kind as SeatKind) : 'human';
}

/** A fresh table. Player 0 starts; everybody sits at the start (position 0). */
export function setup(options: SetupOptions = {}): GameState {
  const count = options.players ?? 2;
  if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new Error(`players must be ${MIN_PLAYERS}-${MAX_PLAYERS}`);
  }
  const names = Array.isArray(options.names) ? options.names : [];
  const kinds = Array.isArray(options.kinds) ? options.kinds : [];
  const levels = Array.isArray(options.levels) ? options.levels : [];
  const players: PlayerState[] = [];
  for (let seat = 0; seat < count; seat++) {
    players.push({
      seat,
      name: cleanName(names[seat], `Player ${seat + 1}`),
      kind: cleanKind(kinds[seat]),
      level: cleanLevel(levels[seat]),
      position: 0,
    });
  }
  return {
    version: 1,
    players,
    turn: 0,
    status: 'playing',
    winner: null,
    lastRoll: null,
    lastMove: null,
    moves: [],
  };
}

/** Roll one fair six-sided die from an injected [0,1) RNG. */
export function rollDie(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(0.999999, Math.max(0, value));
  return 1 + Math.floor(clamped * 6);
}

/** Resolve one die value from a square, including overshoot and transport. */
export function resolveTile(from: number, roll: number): Omit<RollPreview, 'seat'> {
  if (!Number.isInteger(from) || from < 0 || from > FINISH) {
    throw new Error('position must be 0-100');
  }
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new Error('die must be 1-6');
  }
  const raw = from + roll;
  if (raw > FINISH) {
    return {
      roll,
      from,
      raw,
      to: from,
      transport: 'none',
      overshoot: true,
      wins: false,
    };
  }
  const ladder = LADDERS[raw];
  if (ladder !== undefined) {
    return {
      roll,
      from,
      raw,
      to: ladder,
      transport: 'ladder',
      overshoot: false,
      wins: ladder === FINISH,
    };
  }
  const snake = SNAKES[raw];
  if (snake !== undefined) {
    return {
      roll,
      from,
      raw,
      to: snake,
      transport: 'snake',
      overshoot: false,
      wins: false,
    };
  }
  return {
    roll,
    from,
    raw,
    to: raw,
    transport: 'none',
    overshoot: false,
    wins: raw === FINISH,
  };
}

/** All six possible outcomes from a square — the honest "hint" for a game of luck. */
export function previewRolls(position: number): RollPreview[] {
  return [1, 2, 3, 4, 5, 6].map((roll) => ({ seat: -1, ...resolveTile(position, roll) }));
}

/** The turn player's six possible outcomes. */
export function previewsFor(state: GameState, seat: number = state.turn): RollPreview[] {
  const player = state.players[seat];
  if (!player) return [];
  return previewRolls(player.position).map((preview) => ({ ...preview, seat }));
}

/**
 * Rank the six rolls. With no strategy in snakes and ladders, the useful hint is
 * "which number is kindest": finishing first, then the longest ladder, then a
 * plain safe step, then the least painful snake, then overshooting.
 */
export function hint(state: GameState, seat: number = state.turn): Hint | null {
  if (state.status !== 'playing') return null;
  const player = state.players[seat];
  if (!player) return null;
  const previews = previewsFor(state, seat);
  let best = previews[0];
  let bestScore = -Infinity;
  for (const preview of previews) {
    let score: number;
    if (preview.wins) score = 100000;
    else if (preview.overshoot) score = -1000 + preview.to;
    else if (preview.transport === 'ladder') score = 5000 + preview.to;
    else if (preview.transport === 'snake') score = 1000 + preview.to;
    else score = 3000 + preview.to;
    if (score > bestScore) {
      bestScore = score;
      best = preview;
    }
  }
  const reason: Hint['reason'] = best.wins
    ? 'finish'
    : best.transport === 'ladder'
      ? 'ladder'
      : best.transport === 'snake'
        ? 'snake'
        : best.overshoot
          ? 'overshoot'
          : 'safe';
  return { seat, previews, best, reason };
}

function nextTurn(state: GameState, seat: number): number {
  return (seat + 1) % state.players.length;
}

/** Apply an explicit die value. Used by the AI, LAN host and deterministic tests. */
export function rollWithDie(state: GameState, die: number, seat: number = state.turn): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    return { ok: false, state, error: 'bad-seat' };
  }
  if (seat !== state.turn) return { ok: false, state, error: 'wrong-turn' };
  if (!Number.isInteger(die) || die < 1 || die > 6) {
    return { ok: false, state, error: 'bad-die' };
  }
  const from = state.players[seat].position;
  const resolved = resolveTile(from, die);
  const move: Move = { seat, ...resolved };
  const players = state.players.map((player, index) =>
    index === seat ? { ...player, position: resolved.to } : { ...player },
  );
  const next: GameState = {
    ...state,
    players,
    turn: resolved.wins ? seat : nextTurn(state, seat),
    status: resolved.wins ? 'won' : 'playing',
    winner: resolved.wins ? seat : null,
    lastRoll: die,
    lastMove: move,
    moves: [...state.moves, move],
  };
  return { ok: true, state: next, move };
}

/** Roll the die from an injected RNG. */
export function roll(state: GameState, rng: () => number, seat: number = state.turn): MoveResult {
  return rollWithDie(state, rollDie(rng), seat);
}

/** A seat-aware roll used by the authoritative LAN host. */
export function applySeat(state: GameState, seat: number, rng: () => number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (seat !== state.turn) return { ok: false, state, error: 'wrong-turn' };
  return roll(state, rng, seat);
}

/** Public information only: both players see the whole board. */
export function view(state: GameState, seat: number): SeatView {
  return {
    players: state.players.map((player) => ({ ...player })),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    lastRoll: state.lastRoll,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    moveCount: state.moves.length,
    seat,
    canRoll: state.status === 'playing' && state.turn === seat,
  };
}

export function leader(state: GameState): number {
  let best = 0;
  for (let seat = 1; seat < state.players.length; seat++) {
    if (state.players[seat].position > state.players[best].position) best = seat;
  }
  return best;
}

/** Defensive validation for saves and LAN payloads. */
export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  if (state.version !== 1) return false;
  if (!Array.isArray(state.players) || state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS) {
    return false;
  }
  for (const player of state.players) {
    if (
      !player ||
      typeof player !== 'object' ||
      !Number.isInteger(player.seat) ||
      player.seat < 0 ||
      player.seat >= state.players.length ||
      typeof player.name !== 'string' ||
      !SEAT_KINDS.includes(player.kind) ||
      !AI_LEVELS.includes(player.level) ||
      !Number.isInteger(player.position) ||
      player.position < 0 ||
      player.position > FINISH
    ) {
      return false;
    }
  }
  const turn = state.turn;
  if (typeof turn !== 'number' || !Number.isInteger(turn) || turn < 0 || turn >= state.players.length) return false;
  if (state.status !== 'playing' && state.status !== 'won') return false;
  const winner = state.winner;
  if (state.status === 'won') {
    if (typeof winner !== 'number' || !Number.isInteger(winner) || winner < 0 || winner >= state.players.length) {
      return false;
    }
  } else if (winner !== null) {
    return false;
  }
  const lastRoll = state.lastRoll;
  if (lastRoll !== null && (typeof lastRoll !== 'number' || !Number.isInteger(lastRoll) || lastRoll < 1 || lastRoll > 6)) {
    return false;
  }
  if (!Array.isArray(state.moves)) return false;
  if (state.lastMove !== null && (typeof state.lastMove !== 'object' || state.lastMove === null)) return false;
  return true;
}
