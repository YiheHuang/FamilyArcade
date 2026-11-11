/**
 * Flip — a pure, deterministic 8×8 Reversi engine.
 *
 * No DOM, no network, no clock and no Math.random. Every function returns a new
 * state instead of mutating its input. Board indices are 0–63, row-major:
 *   0  1  2  3  4  5  6  7
 *   8  9 10 11 12 13 14 15
 *   ...
 * Black ('B') always moves first; White is 'W'.
 */

export type Disc = 'B' | 'W';
export type Cell = Disc | null;
export type GameStatus = 'playing' | 'won' | 'draw';

export interface GameState {
  board: Cell[];
  turn: Disc;
  status: GameStatus;
  winner: Disc | null;
  /** Index of the most recent placement, or null before the first move. */
  lastMove: number | null;
  /** True when the move that produced this state made the opponent pass. */
  passed: boolean;
  /** Placement history (passes are not stored as squares). */
  moves: number[];
  first: Disc;
}

export type MoveError =
  | 'occupied'
  | 'game-over'
  | 'bad-cell'
  | 'illegal'
  | 'wrong-turn';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
  /** Indices of the discs flipped by this move. */
  flips?: number[];
}

export interface SeatView {
  board: Cell[];
  turn: Disc;
  status: GameStatus;
  winner: Disc | null;
  lastMove: number | null;
  passed: boolean;
  counts: { B: number; W: number };
  /** Legal moves for the player whose turn it is. */
  legal: number[];
  mark: Disc;
  seat: number;
  canMove: boolean;
  moveCount: number;
}

export const SIZE = 8;
export const CELLS = SIZE * SIZE;
export const BLACK: Disc = 'B';
export const WHITE: Disc = 'W';

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export const other = (disc: Disc): Disc => (disc === 'B' ? 'W' : 'B');

export const rowOf = (index: number): number => Math.floor(index / SIZE);
export const colOf = (index: number): number => index % SIZE;

/** Human coordinate such as D4 (column letter, row number from the top). */
export function coord(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= CELLS) return '';
  return `${'ABCDEFGH'[colOf(index)]}${rowOf(index) + 1}`;
}

export function counts(board: readonly Cell[]): { B: number; W: number } {
  let B = 0;
  let W = 0;
  for (const cell of board) {
    if (cell === 'B') B += 1;
    else if (cell === 'W') W += 1;
  }
  return { B, W };
}

/** The standard four-disc starting position. */
export function setup(first: Disc = BLACK): GameState {
  const board: Cell[] = Array<Cell>(CELLS).fill(null);
  board[27] = 'W'; // d4
  board[28] = 'B'; // e4
  board[35] = 'B'; // d5
  board[36] = 'W'; // e5
  return {
    board,
    turn: first,
    status: 'playing',
    winner: null,
    lastMove: null,
    passed: false,
    moves: [],
    first,
  };
}

/**
 * Every disc that `disc` would flip by placing on `index`.
 * Returns an empty array for occupied squares, off-board indices and moves that
 * do not bracket at least one opponent disc.
 */
export function flipsFrom(
  board: readonly Cell[],
  index: number,
  disc: Disc,
): number[] {
  if (!Number.isInteger(index) || index < 0 || index >= CELLS) return [];
  if (board[index] !== null) return [];
  const opponent = other(disc);
  const row = rowOf(index);
  const col = colOf(index);
  const flips: number[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    let r = row + dr;
    let c = col + dc;
    const line: number[] = [];
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      const cell = board[r * SIZE + c];
      if (cell === opponent) {
        line.push(r * SIZE + c);
      } else if (cell === disc) {
        if (line.length > 0) flips.push(...line);
        break;
      } else {
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return flips;
}

/** Legal moves for a disc on an arbitrary board (used by the AI and tests). */
export function legalMovesFor(board: readonly Cell[], disc: Disc): number[] {
  const moves: number[] = [];
  for (let index = 0; index < CELLS; index += 1) {
    if (board[index] === null && flipsFrom(board, index, disc).length > 0) {
      moves.push(index);
    }
  }
  return moves;
}

export function legalMoves(state: GameState): number[] {
  if (state.status !== 'playing') return [];
  return legalMovesFor(state.board, state.turn);
}

export function isLegal(state: GameState, index: number): boolean {
  return (
    state.status === 'playing' &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < CELLS &&
    state.board[index] === null &&
    flipsFrom(state.board, index, state.turn).length > 0
  );
}

/** Disc count result once no further move is possible. */
export function finalResult(board: readonly Cell[]): {
  status: 'won' | 'draw';
  winner: Disc | null;
} {
  const score = counts(board);
  if (score.B === score.W) return { status: 'draw', winner: null };
  return { status: 'won', winner: score.B > score.W ? 'B' : 'W' };
}

/**
 * Place a disc for the player to move. If the opponent has no legal reply the
 * turn passes back automatically; if neither player can move the game ends.
 */
export function apply(state: GameState, index: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(index) || index < 0 || index >= CELLS) {
    return { ok: false, state, error: 'bad-cell' };
  }
  if (state.board[index] !== null) return { ok: false, state, error: 'occupied' };

  const flips = flipsFrom(state.board, index, state.turn);
  if (flips.length === 0) return { ok: false, state, error: 'illegal' };

  const board = state.board.slice();
  board[index] = state.turn;
  for (const flipped of flips) board[flipped] = state.turn;

  const me = state.turn;
  const opponent = other(me);
  const opponentCanMove = legalMovesFor(board, opponent).length > 0;
  const iCanMove = legalMovesFor(board, me).length > 0;

  let turn: Disc = opponent;
  let status: GameStatus = 'playing';
  let winner: Disc | null = null;
  let passed = false;

  if (!opponentCanMove) {
    if (iCanMove) {
      turn = me;
      passed = true;
    } else {
      turn = opponent;
      const result = finalResult(board);
      status = result.status;
      winner = result.winner;
    }
  }

  return {
    ok: true,
    flips,
    state: {
      ...state,
      board,
      turn,
      status,
      winner,
      lastMove: index,
      passed,
      moves: [...state.moves, index],
    },
  };
}

/** Seat 0 is Black, seat 1 is White. Validates the seat's turn. */
export function applySeat(state: GameState, seat: number, index: number): MoveResult {
  const mark: Disc | null = seat === 0 ? 'B' : seat === 1 ? 'W' : null;
  if (!mark || state.turn !== mark) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, index);
}

/** Public, serialisable view for a seat. Reversi has no hidden information. */
export function view(state: GameState, seat: number): SeatView {
  const mark: Disc = seat === 0 ? 'B' : 'W';
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    lastMove: state.lastMove,
    passed: state.passed,
    counts: counts(state.board),
    legal: legalMoves(state),
    mark,
    seat,
    canMove: state.status === 'playing' && state.turn === mark,
    moveCount: state.moves.length,
  };
}
