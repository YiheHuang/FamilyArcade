/**
 * Sowing (Kalah / mancala) — pure rules engine.
 *
 * Board layout (14 slots, counter-clockwise):
 *   0 1 2 3 4 5  [6 store of seat 0]
 *   12 11 10 9 8 7  [13 store of seat 1]
 *
 * Seat 0 sows 0 → 1 → … → 5 → store 6 → 7 → … → 12 → skip store 13.
 * Seat 1 sows 7 → 8 → … → 12 → store 13 → 0 → … → 5 → skip store 6.
 *
 * No DOM, clock, network or Math.random lives here. Every function returns a
 * fresh state and never mutates its input.
 */

export type Player = 0 | 1;
export type Status = 'playing' | 'ended';
export type MoveError = 'game-over' | 'bad-pit' | 'empty' | 'not-yours' | 'wrong-turn';

export interface LastMove {
  /** Absolute pit index that was emptied. */
  pit: number;
  /** Absolute slots the seeds landed in, in sowing order. */
  path: number[];
  /** Seeds moved to the mover's store by the capture rule. */
  capture: number;
  /** True when the last seed landed in the mover's own store. */
  extra: boolean;
}

export interface GameState {
  /**
   * 14 board slots. Slots 6 and 13 are the two store mouths and always hold
   * zero here; the store totals live in `stores`. Keeping the slots in the
   * array makes the counter-clockwise path readable in code and in the UI.
   */
  pits: number[];
  /** stores[0], stores[1]. */
  stores: [number, number];
  turn: Player;
  status: Status;
  /** Seat with more seeds, or null for a drawn store count. */
  winner: Player | null;
  /** Absolute pit indices in move order. */
  moves: number[];
  last: LastMove | null;
  first: Player;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  pits: number[];
  stores: [number, number];
  turn: Player;
  status: Status;
  winner: Player | null;
  last: LastMove | null;
  seat: Player;
  canMove: boolean;
  moveCount: number;
}

export interface MovePreview {
  pit: number;
  path: number[];
  capture: number;
  extra: boolean;
  storeGain: number;
  next: GameState;
}

export const PIT_COUNT = 12;
export const SEEDS_PER_PIT = 4;
export const TOTAL_SEEDS = PIT_COUNT * SEEDS_PER_PIT;
export const STORE_0 = 6;
export const STORE_1 = 13;
export const SLOTS = 14;

const SOUTH = [0, 1, 2, 3, 4, 5] as const;
const NORTH = [7, 8, 9, 10, 11, 12] as const;

export const other = (player: Player): Player => (player === 0 ? 1 : 0);

export function storeOf(player: Player): number {
  return player === 0 ? STORE_0 : STORE_1;
}

export function ownPits(player: Player): number[] {
  return player === 0 ? [...SOUTH] : [...NORTH];
}

export function isOwnPit(player: Player, pit: number): boolean {
  if (!Number.isInteger(pit)) return false;
  return player === 0 ? pit >= 0 && pit <= 5 : pit >= 7 && pit <= 12;
}

/** Local 1–6 number shown on the board. */
export function pitNumber(player: Player, pit: number): number {
  return player === 0 ? pit + 1 : pit - 6;
}

/** The pit directly across the board, or -1 for a store. */
export function oppositePit(pit: number): number {
  if (pit < 0 || pit >= SLOTS || pit === STORE_0 || pit === STORE_1) return -1;
  return 12 - pit;
}

export function rowSum(pits: number[], player: Player): number {
  return ownPits(player).reduce((sum, pit) => sum + (pits[pit] ?? 0), 0);
}

export function setup(first: Player = 0): GameState {
  return {
    pits: Array<number>(SLOTS)
      .fill(SEEDS_PER_PIT)
      .map((seeds, slot) => (slot === STORE_0 || slot === STORE_1 ? 0 : seeds)),
    stores: [0, 0],
    turn: first,
    status: 'playing',
    winner: null,
    moves: [],
    last: null,
    first,
  };
}

/**
 * Build an arbitrary legal-shaped state for tests and deterministic demo games.
 * Counts may be any non-negative integers; the caller owns the 48-seed invariant.
 */
export function stateOf(config: {
  pits?: number[];
  stores?: [number, number];
  turn?: Player;
  first?: Player;
  status?: Status;
  winner?: Player | null;
  moves?: number[];
  last?: LastMove | null;
} = {}): GameState {
  const source = config.pits ?? [];
  // Accept either a compact 12-pit list or a full 14-slot board.
  const compact = source.length === PIT_COUNT;
  const pits = Array<number>(SLOTS)
    .fill(0)
    .map((_, slot) => {
      if (slot === STORE_0 || slot === STORE_1) return 0;
      const index = compact ? (slot <= 5 ? slot : slot - 1) : slot;
      return Math.max(0, Math.trunc(source[index] ?? 0));
    });
  return {
    pits,
    stores: [Math.max(0, Math.trunc(config.stores?.[0] ?? 0)), Math.max(0, Math.trunc(config.stores?.[1] ?? 0))],
    turn: config.turn ?? 0,
    status: config.status ?? 'playing',
    winner: config.winner ?? null,
    moves: config.moves ? [...config.moves] : [],
    last: config.last ? { ...config.last, path: [...config.last.path] } : null,
    first: config.first ?? 0,
  };
}

export function legalMoves(state: GameState): number[] {
  if (state.status !== 'playing') return [];
  return ownPits(state.turn).filter((pit) => state.pits[pit] > 0);
}

export function isLegal(state: GameState, pit: number): boolean {
  return legalMoves(state).includes(pit);
}

function finish(pits: number[], stores: [number, number]): { status: Status; winner: Player | null } {
  const empty = rowSum(pits, 0) === 0 || rowSum(pits, 1) === 0;
  if (!empty) return { status: 'playing', winner: null };
  // Traditional finish-and-sweep: remaining seeds belong to their owner's store.
  for (const player of [0, 1] as const) {
    for (const pit of ownPits(player)) {
      stores[player] += pits[pit];
      pits[pit] = 0;
    }
  }
  const winner = stores[0] === stores[1] ? null : stores[0] > stores[1] ? 0 : 1;
  return { status: 'ended', winner };
}

export function apply(state: GameState, pit: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(pit) || pit < 0 || pit >= SLOTS || pit === STORE_0 || pit === STORE_1) {
    return { ok: false, state, error: 'bad-pit' };
  }
  if (!isOwnPit(state.turn, pit)) return { ok: false, state, error: 'not-yours' };
  if (state.pits[pit] <= 0) return { ok: false, state, error: 'empty' };

  const player = state.turn;
  const opponent = other(player);
  const pits = state.pits.slice();
  const stores: [number, number] = [state.stores[0], state.stores[1]];
  const path: number[] = [];

  let seeds = pits[pit];
  pits[pit] = 0;
  let slot = pit;
  while (seeds > 0) {
    slot = (slot + 1) % SLOTS;
    if (slot === storeOf(opponent)) continue; // never drop into the other store
    if (slot === storeOf(player)) {
      stores[player] += 1;
      path.push(slot);
      seeds -= 1;
      continue;
    }
    pits[slot] += 1;
    path.push(slot);
    seeds -= 1;
  }

  const landed = path[path.length - 1];
  const inStore = landed === storeOf(player);
  let capture = 0;
  if (!inStore && isOwnPit(player, landed) && pits[landed] === 1) {
    const opposite = oppositePit(landed);
    capture = 1 + pits[opposite];
    stores[player] += capture;
    pits[landed] = 0;
    pits[opposite] = 0;
  }

  const ended = finish(pits, stores);
  // Store mouths are always zero in the slot array; their counts live in stores.
  pits[STORE_0] = 0;
  pits[STORE_1] = 0;
  const nextTurn: Player = inStore ? player : opponent;

  return {
    ok: true,
    state: {
      pits,
      stores,
      turn: nextTurn,
      status: ended.status,
      winner: ended.winner,
      moves: [...state.moves, pit],
      last: { pit, path, capture, extra: inStore },
      first: state.first,
    },
  };
}

export function applySeat(state: GameState, seat: number, pit: number): MoveResult {
  if (seat !== 0 && seat !== 1) return { ok: false, state, error: 'wrong-turn' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, pit);
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat: Player = seat === 1 ? 1 : 0;
  return {
    pits: state.pits.slice(),
    stores: [state.stores[0], state.stores[1]],
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    last: state.last ? { ...state.last, path: [...state.last.path] } : null,
    seat: safeSeat,
    canMove:
      state.status === 'playing' &&
      state.turn === safeSeat &&
      legalMoves(state).length > 0,
    moveCount: state.moves.length,
  };
}

/** Useful for hints: simulate one move and expose why it is interesting. */
export function previewMove(state: GameState, pit: number): MovePreview | null {
  const result = apply(state, pit);
  if (!result.ok || !result.state.last) return null;
  const mover = state.turn;
  return {
    pit,
    path: [...result.state.last.path],
    capture: result.state.last.capture,
    extra: result.state.last.extra,
    storeGain: result.state.stores[mover] - state.stores[mover],
    next: result.state,
  };
}

export function scores(state: GameState): [number, number] {
  return [state.stores[0], state.stores[1]];
}
