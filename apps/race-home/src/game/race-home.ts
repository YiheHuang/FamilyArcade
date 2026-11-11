/**
 * Race Home — pure, deterministic Ludo-like race engine.
 *
 * No DOM, clock, network or Math.random here. Everyone calls `roll` with a
 * number generator; the rest of the game is a pure state machine.
 *
 * Pawn positions:
 *   -1        waiting in the colour yard
 *   0..51     on the shared ring, counted from this colour's own start
 *   52..56    in the five colour lane squares
 *   57        home (the house at the centre of the board)
 */

export const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export const PAWNS_PER_PLAYER = 4;
export const RING_CELLS = 52;
export const LANE_CELLS = 5;
export const LANE_START = RING_CELLS; // 52
export const HOME = RING_CELLS + LANE_CELLS; // 57
export const DIE_FACES = [1, 2, 3, 4, 5, 6] as const;

/** Absolute ring cell where each colour begins. */
export const START_CELL: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export type Phase = 'roll' | 'move' | 'over';

export interface PawnRef {
  color: Color;
  pawn: number;
}

export type GameEvent =
  | { type: 'roll'; color: Color; die: number; legal: number[] }
  | { type: 'pass'; color: Color; die: number }
  | {
      type: 'move';
      color: Color;
      pawn: number;
      from: number;
      to: number;
      captured: PawnRef[];
      extra: boolean;
    }
  | {
      type: 'win';
      color: Color;
      pawn: number;
      from: number;
      to: number;
      captured: PawnRef[];
    };

export interface GameState {
  /** Active players in seat order. Seat i controls players[i]. */
  players: Color[];
  /** Index into `players`. */
  turn: number;
  pawns: Record<Color, number[]>;
  /** The die currently shown. Kept after a pass so the table can see it. */
  die: number | null;
  phase: Phase;
  winner: Color | null;
  /** How many times the die has been rolled. Useful for the record and demos. */
  rolls: number;
  /** How many pawn steps have been made. */
  moves: number;
  lastEvent: GameEvent | null;
}

export type RollError = 'game-over' | 'wrong-phase';
export type MoveError = 'game-over' | 'wrong-phase' | 'no-die' | 'illegal-pawn' | 'bad-pawn';

export interface RollResult {
  ok: boolean;
  state: GameState;
  error?: RollError;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

function emptyPawns(): Record<Color, number[]> {
  return {
    red: Array<number>(PAWNS_PER_PLAYER).fill(-1),
    green: Array<number>(PAWNS_PER_PLAYER).fill(-1),
    yellow: Array<number>(PAWNS_PER_PLAYER).fill(-1),
    blue: Array<number>(PAWNS_PER_PLAYER).fill(-1),
  };
}

function validPlayers(players: readonly Color[]): Color[] {
  if (players.length < 2 || players.length > COLORS.length) {
    throw new Error('Race Home needs 2 to 4 players');
  }
  if (new Set(players).size !== players.length) {
    throw new Error('Each colour can only sit at one seat');
  }
  for (const color of players) {
    if (!COLORS.includes(color)) throw new Error(`Unknown colour: ${String(color)}`);
  }
  return [...players];
}

/** Create a fresh game. Seat 0 is first unless `firstSeat` says otherwise. */
export function setup(players: readonly Color[] = COLORS, firstSeat = 0): GameState {
  const active = validPlayers(players);
  return {
    players: active,
    turn: ((firstSeat % active.length) + active.length) % active.length,
    pawns: emptyPawns(),
    die: null,
    phase: 'roll',
    winner: null,
    rolls: 0,
    moves: 0,
    lastEvent: null,
  };
}

/** Absolute ring cell (0..51) for a pawn of `color` at progress `pos`. */
export function ringCell(color: Color, pos: number): number | null {
  if (pos < 0 || pos >= RING_CELLS) return null;
  return (START_CELL[color] + pos) % RING_CELLS;
}

/** Ring progress of an absolute cell for a particular colour (0..51). */
export function progressOnRing(color: Color, cell: number): number {
  return ((cell - START_CELL[color]) % RING_CELLS + RING_CELLS) % RING_CELLS;
}

export function currentColor(state: GameState): Color {
  return state.players[state.turn];
}

export function legalMoves(state: GameState): number[] {
  if (state.phase !== 'move' || state.winner !== null || state.die === null) return [];
  const color = currentColor(state);
  const die = state.die;
  return state.pawns[color].flatMap((pos, index) => {
    if (pos === HOME) return [];
    if (pos === -1) return die === 6 ? [index] : [];
    return pos + die <= HOME ? [index] : [];
  });
}

/** Destination progress for a legal (or hypothetical) pawn. */
export function destination(state: GameState, pawn: number): number | null {
  if (state.die === null) return null;
  const color = currentColor(state);
  const pos = state.pawns[color][pawn];
  if (pos === undefined || pos === HOME) return null;
  return pos === -1 ? 0 : pos + state.die;
}

function withEvent(state: GameState, event: GameEvent): GameState {
  return { ...state, lastEvent: event };
}

function advanceTurn(state: GameState): GameState {
  return {
    ...state,
    turn: (state.turn + 1) % state.players.length,
    phase: 'roll',
  };
}

/**
 * Roll the die. A roll with no legal move passes the turn immediately, so the
 * UI never gets stuck showing a dead "move a pawn" step.
 */
export function roll(state: GameState, rng: () => number): RollResult {
  if (state.phase === 'over' || state.winner !== null) {
    return { ok: false, state, error: 'game-over' };
  }
  if (state.phase !== 'roll') return { ok: false, state, error: 'wrong-phase' };

  const raw = rng();
  const sampled = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
  const die = 1 + Math.floor(sampled * 6);
  const color = currentColor(state);

  const rolled = withEvent(
    {
      ...state,
      die,
      phase: 'move',
      rolls: state.rolls + 1,
    },
    { type: 'roll', color, die, legal: [] },
  );

  const legal = legalMoves(rolled);
  if (legal.length === 0) {
    const passed = withEvent(advanceTurn({ ...rolled, die }), {
      type: 'pass',
      color,
      die,
    });
    return { ok: true, state: passed };
  }

  return {
    ok: true,
    state: withEvent(rolled, { type: 'roll', color, die, legal }),
  };
}

/** Move one of the current player's pawns. */
export function move(state: GameState, pawn: number): MoveResult {
  if (state.phase === 'over' || state.winner !== null) {
    return { ok: false, state, error: 'game-over' };
  }
  if (state.phase !== 'move') return { ok: false, state, error: 'wrong-phase' };
  if (state.die === null) return { ok: false, state, error: 'no-die' };
  if (!Number.isInteger(pawn) || pawn < 0 || pawn >= PAWNS_PER_PLAYER) {
    return { ok: false, state, error: 'bad-pawn' };
  }
  if (!legalMoves(state).includes(pawn)) {
    return { ok: false, state, error: 'illegal-pawn' };
  }

  const color = currentColor(state);
  const from = state.pawns[color][pawn];
  const to = from === -1 ? 0 : from + state.die;
  const captured: PawnRef[] = [];
  const pawns: Record<Color, number[]> = {
    ...state.pawns,
    [color]: [...state.pawns[color]],
  };
  pawns[color][pawn] = to;

  // Captures only happen on the shared ring. A pawn in a colour lane is safe.
  const landingCell = ringCell(color, to);
  if (landingCell !== null) {
    for (const other of state.players) {
      if (other === color) continue;
      const otherPawns = state.pawns[other];
      let changed = false;
      const copy = [...otherPawns];
      for (let i = 0; i < copy.length; i++) {
        if (copy[i] < 0 || copy[i] >= RING_CELLS) continue;
        if (ringCell(other, copy[i]) !== landingCell) continue;
        copy[i] = -1;
        captured.push({ color: other, pawn: i });
        changed = true;
      }
      if (changed) pawns[other] = copy;
    }
  }

  const allHome = pawns[color].every((pos) => pos === HOME);
  const extra = state.die === 6 && !allHome;
  const baseNext: GameState = {
    ...state,
    pawns,
    moves: state.moves + 1,
    die: state.die,
    phase: allHome ? 'over' : 'roll',
    winner: allHome ? color : null,
    lastEvent: null,
  };

  if (allHome) {
    return {
      ok: true,
      state: withEvent(baseNext, {
        type: 'win',
        color,
        pawn,
        from,
        to,
        captured,
      }),
    };
  }

  const next = extra ? baseNext : advanceTurn(baseNext);
  return {
    ok: true,
    state: withEvent(next, {
      type: 'move',
      color,
      pawn,
      from,
      to,
      captured,
      extra,
    }),
  };
}

/**
 * Move only if `seat` is the player whose turn it is. Used by the LAN host to
 * reject stale or spoofed guest intents without trusting their view.
 */
export function moveSeat(state: GameState, seat: number, pawn: number): MoveResult {
  if (seat !== state.turn) return { ok: false, state, error: 'wrong-phase' };
  return move(state, pawn);
}

export function rollSeat(state: GameState, seat: number, rng: () => number): RollResult {
  if (seat !== state.turn) return { ok: false, state, error: 'wrong-phase' };
  return roll(state, rng);
}

/**
 * Skip the current player's roll. Only the LAN host uses this, when a guest
 * disconnects and the table needs a way past a frozen turn.
 */
export function skipTurn(state: GameState): GameState {
  if (state.phase === 'over' || state.winner !== null) return state;
  const color = currentColor(state);
  return withEvent(advanceTurn({ ...state, die: state.die }), {
    type: 'pass',
    color,
    die: state.die ?? 0,
  });
}

export interface SeatView extends GameState {
  seat: number;
  color: Color;
  canRoll: boolean;
  canMove: boolean;
  legal: number[];
}

/** Everything a seat is allowed to see. Ludo has no hidden information. */
export function view(state: GameState, seat: number): SeatView {
  const color = state.players[seat] ?? state.players[0];
  const active = state.turn === seat;
  const canRoll = active && state.phase === 'roll';
  const canMove = active && state.phase === 'move';
  return {
    ...state,
    players: [...state.players],
    pawns: {
      red: [...state.pawns.red],
      green: [...state.pawns.green],
      yellow: [...state.pawns.yellow],
      blue: [...state.pawns.blue],
    },
    seat,
    color,
    canRoll,
    canMove,
    legal: canMove ? legalMoves(state) : [],
  };
}

export function pawnsAt(state: GameState, color: Color, zone: 'base' | 'ring' | 'lane' | 'home'): number {
  return state.pawns[color].filter((pos) => {
    if (zone === 'base') return pos === -1;
    if (zone === 'ring') return pos >= 0 && pos < RING_CELLS;
    if (zone === 'lane') return pos >= LANE_START && pos < HOME;
    return pos === HOME;
  }).length;
}

export function homeCount(state: GameState, color: Color): number {
  return pawnsAt(state, color, 'home');
}

export function occupiedCells(state: GameState): Map<number, PawnRef[]> {
  const map = new Map<number, PawnRef[]>();
  for (const color of state.players) {
    state.pawns[color].forEach((pos, pawn) => {
      const cell = ringCell(color, pos);
      if (cell === null) return;
      const list = map.get(cell) ?? [];
      list.push({ color, pawn });
      map.set(cell, list);
    });
  }
  return map;
}

/** A compact, UI-friendly summary of the current turn. */
export function turnInfo(state: GameState): { color: Color; name: 'roll' | 'move' | 'over' } {
  return {
    color: currentColor(state),
    name: state.phase === 'over' ? 'over' : state.phase,
  };
}
