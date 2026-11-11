/**
 * Four · pure Connect Four engine.
 *
 * 7 columns × 6 rows. The board is a 42-cell row-major array: index 0 is the
 * top-left slot and index 41 the bottom-right slot. A move is a column number
 * (0–6); the disc falls to the lowest empty slot in that column.
 *
 * This module never touches the DOM, the network, the clock or `Math.random`.
 */

export type Disc = 'R' | 'Y';
export type Cell = Disc | null;

export const COLS = 7;
export const ROWS = 6;
export const CELLS = COLS * ROWS;

export interface GameState {
  board: Cell[];
  turn: Disc;
  status: 'playing' | 'won' | 'draw';
  winner: Disc | null;
  /** Four winning cell indices, or null. */
  line: number[] | null;
  /** Every column played, in order. */
  moves: number[];
  /** First disc. Red starts by convention. */
  first: Disc;
  /** Cell index of the most recent drop, or null. */
  last: number | null;
}

export type MoveError = 'bad-column' | 'full-column' | 'game-over' | 'wrong-turn';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  board: Cell[];
  turn: Disc;
  status: GameState['status'];
  winner: Disc | null;
  line: number[] | null;
  disc: Disc;
  seat: number;
  canMove: boolean;
  moveCount: number;
  last: number | null;
}

export const other = (disc: Disc): Disc => (disc === 'R' ? 'Y' : 'R');

export const discForSeat = (seat: number): Disc => (seat === 0 ? 'R' : 'Y');

export const seatForDisc = (disc: Disc): number => (disc === 'R' ? 0 : 1);

export function indexAt(row: number, col: number): number {
  return row * COLS + col;
}

export function rowOf(index: number): number {
  return Math.floor(index / COLS);
}

export function colOf(index: number): number {
  return index % COLS;
}

export function inBoard(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < CELLS;
}

/** Lowest empty row in a column, or -1 when the column is full. Rows run top→bottom. */
export function dropRow(board: Cell[], col: number): number {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[indexAt(row, col)] === null) return row;
  }
  return -1;
}

/** Column height (0–6). */
export function columnHeight(board: Cell[], col: number): number {
  let height = 0;
  for (let row = 0; row < ROWS; row++) {
    if (board[indexAt(row, col)] !== null) height += 1;
  }
  return height;
}

export function setup(first: Disc = 'R'): GameState {
  return {
    board: Array<Cell>(CELLS).fill(null),
    turn: first,
    status: 'playing',
    winner: null,
    line: null,
    moves: [],
    first,
    last: null,
  };
}

/** All four-cell windows: horizontal, vertical and both diagonals. */
export function windows(): number[][] {
  const result: number[][] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      result.push([
        indexAt(row, col),
        indexAt(row, col + 1),
        indexAt(row, col + 2),
        indexAt(row, col + 3),
      ]);
    }
  }
  for (let row = 0; row < ROWS - 3; row++) {
    for (let col = 0; col < COLS; col++) {
      result.push([
        indexAt(row, col),
        indexAt(row + 1, col),
        indexAt(row + 2, col),
        indexAt(row + 3, col),
      ]);
    }
  }
  for (let row = 0; row < ROWS - 3; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      result.push([
        indexAt(row, col),
        indexAt(row + 1, col + 1),
        indexAt(row + 2, col + 2),
        indexAt(row + 3, col + 3),
      ]);
    }
  }
  for (let row = 3; row < ROWS; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      result.push([
        indexAt(row, col),
        indexAt(row - 1, col + 1),
        indexAt(row - 2, col + 2),
        indexAt(row - 3, col + 3),
      ]);
    }
  }
  return result;
}

const WINDOWS = windows();

/** First four-in-line on the board, or null. */
export function winningLine(board: Cell[]): number[] | null {
  for (const window of WINDOWS) {
    const [a, b, c, d] = window;
    const cell = board[a];
    if (cell && cell === board[b] && cell === board[c] && cell === board[d]) {
      return [...window];
    }
  }
  return null;
}

/**
 * The four-in-line that runs through `index`, or null. Used after a drop so a
 * win can be reported without scanning the whole board.
 */
export function lineThrough(board: Cell[], index: number): number[] | null {
  if (!inBoard(index)) return null;
  const disc = board[index];
  if (!disc) return null;
  const row = rowOf(index);
  const col = colOf(index);
  const directions: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of directions) {
    for (let start = -3; start <= 0; start++) {
      const cells: number[] = [];
      let valid = true;
      for (let step = 0; step < 4; step++) {
        const r = row + (start + step) * dr;
        const c = col + (start + step) * dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
          valid = false;
          break;
        }
        const at = indexAt(r, c);
        if (board[at] !== disc) {
          valid = false;
          break;
        }
        cells.push(at);
      }
      if (valid) return cells;
    }
  }
  return null;
}

export function legal(state: GameState, col: number): boolean {
  return (
    state.status === 'playing' &&
    Number.isInteger(col) &&
    col >= 0 &&
    col < COLS &&
    dropRow(state.board, col) >= 0
  );
}

export function legalColumns(state: GameState): number[] {
  if (state.status !== 'playing') return [];
  const result: number[] = [];
  for (let col = 0; col < COLS; col++) {
    if (dropRow(state.board, col) >= 0) result.push(col);
  }
  return result;
}

/** Columns that complete four right now for the player to move. */
export function winningColumns(state: GameState): number[] {
  return legalColumns(state).filter((col) => {
    const result = apply(state, col);
    return result.ok && result.state.status === 'won';
  });
}

export function apply(state: GameState, col: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(col) || col < 0 || col >= COLS) {
    return { ok: false, state, error: 'bad-column' };
  }
  const row = dropRow(state.board, col);
  if (row < 0) return { ok: false, state, error: 'full-column' };

  const board = state.board.slice();
  const index = indexAt(row, col);
  board[index] = state.turn;
  const line = lineThrough(board, index);
  const moves = [...state.moves, col];
  const full = moves.length === CELLS;
  const next: GameState = {
    ...state,
    board,
    moves,
    last: index,
    turn: other(state.turn),
    status: line ? 'won' : full ? 'draw' : 'playing',
    winner: line ? state.turn : null,
    line,
  };
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, col: number): MoveResult {
  const disc = discForSeat(seat);
  if (state.turn !== disc) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, col);
}

export function view(state: GameState, seat: number): SeatView {
  const disc = discForSeat(seat);
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    line: state.line ? [...state.line] : null,
    disc,
    seat,
    canMove: state.status === 'playing' && state.turn === disc,
    moveCount: state.moves.length,
    last: state.last,
  };
}

/** Replay a column sequence from the opening position (handy for tests and demos). */
export function replay(columns: number[], first: Disc = 'R'): GameState {
  let state = setup(first);
  for (const col of columns) {
    const result = apply(state, col);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
}

export function resultOf(state: GameState): Disc | 'draw' | null {
  if (state.status === 'draw') return 'draw';
  if (state.status === 'won') return state.winner;
  return null;
}
