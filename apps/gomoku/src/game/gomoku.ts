/**
 * Gomoku · 15×15 freestyle five-in-a-row.
 *
 * Pure rules: no DOM, clock, network or randomness. Board indices are
 * row-major, 0..224. Black (B) always moves first. In freestyle Gomoku a
 * contiguous line of five *or more* stones wins, so overlines are legal.
 */

export const SIZE = 15;
export const CELLS = SIZE * SIZE;

export type Mark = 'B' | 'W';
export type Cell = Mark | null;
export type Status = 'playing' | 'won' | 'draw';

export interface GameState {
  board: Cell[];
  turn: Mark;
  status: Status;
  winner: Mark | null;
  line: number[] | null;
  moves: number[];
  first: Mark;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: 'occupied' | 'game-over' | 'bad-cell' | 'wrong-turn' | 'bad-seat';
}

export interface SeatView {
  board: Cell[];
  turn: Mark;
  status: Status;
  winner: Mark | null;
  line: number[] | null;
  mark: Mark;
  seat: number;
  canMove: boolean;
  moveCount: number;
  last: number | null;
}

export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export const CENTER = indexOf(7, 7);

export function other(mark: Mark): Mark {
  return mark === 'B' ? 'W' : 'B';
}

export function rowOf(index: number): number {
  return Math.floor(index / SIZE);
}

export function colOf(index: number): number {
  return index % SIZE;
}

export function indexOf(row: number, col: number): number {
  return row * SIZE + col;
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

export function setup(first: Mark = 'B'): GameState {
  return {
    board: Array<Cell>(CELLS).fill(null),
    turn: first,
    status: 'playing',
    winner: null,
    line: null,
    moves: [],
    first,
  };
}

/**
 * The full contiguous run through `index` in the winning direction.
 * Returns null unless the run is at least five stones long. The caller must
 * ensure `board[index] === mark`.
 */
export function lineThrough(board: Cell[], index: number, mark: Mark): number[] | null {
  if (index < 0 || index >= CELLS || board[index] !== mark) return null;
  const row = rowOf(index);
  const col = colOf(index);
  for (const [dr, dc] of DIRECTIONS) {
    const back: number[] = [];
    for (let r = row - dr, c = col - dc; inBounds(r, c); r -= dr, c -= dc) {
      const at = indexOf(r, c);
      if (board[at] !== mark) break;
      back.push(at);
    }
    const forward: number[] = [];
    for (let r = row + dr, c = col + dc; inBounds(r, c); r += dr, c += dc) {
      const at = indexOf(r, c);
      if (board[at] !== mark) break;
      forward.push(at);
    }
    if (back.length + 1 + forward.length >= 5) {
      return [...back.reverse(), index, ...forward];
    }
  }
  return null;
}

/** First winning run found on a board, or null. */
export function winningLine(board: Cell[]): number[] | null {
  for (let index = 0; index < CELLS; index += 1) {
    const mark = board[index];
    if (!mark) continue;
    const line = lineThrough(board, index, mark);
    if (line) return line;
  }
  return null;
}

/** True when placing `mark` on the empty `index` would make at least five. */
export function wouldWin(board: Cell[], index: number, mark: Mark): boolean {
  if (index < 0 || index >= CELLS || board[index] !== null) return false;
  const row = rowOf(index);
  const col = colOf(index);
  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;
    for (let r = row - dr, c = col - dc; inBounds(r, c); r -= dr, c -= dc) {
      if (board[indexOf(r, c)] !== mark) break;
      count += 1;
    }
    for (let r = row + dr, c = col + dc; inBounds(r, c); r += dr, c += dc) {
      if (board[indexOf(r, c)] !== mark) break;
      count += 1;
    }
    if (count >= 5) return true;
  }
  return false;
}

export function legal(state: GameState, index: number): boolean {
  return (
    state.status === 'playing' &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < CELLS &&
    state.board[index] === null
  );
}

export function legalMoves(state: GameState): number[] {
  if (state.status !== 'playing') return [];
  return state.board.flatMap((cell, index) => (cell === null ? [index] : []));
}

export function apply(state: GameState, index: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(index) || index < 0 || index >= CELLS) {
    return { ok: false, state, error: 'bad-cell' };
  }
  if (state.board[index] !== null) return { ok: false, state, error: 'occupied' };

  const board = state.board.slice();
  board[index] = state.turn;
  const line = lineThrough(board, index, state.turn);
  const full = board.every(Boolean);
  const next: GameState = {
    ...state,
    board,
    moves: [...state.moves, index],
    turn: state.turn === 'B' ? 'W' : 'B',
    status: line ? 'won' : full ? 'draw' : 'playing',
    winner: line ? state.turn : null,
    line,
  };
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, index: number): MoveResult {
  if (seat !== 0 && seat !== 1) return { ok: false, state, error: 'bad-seat' };
  const mark: Mark = seat === 0 ? 'B' : 'W';
  if (state.turn !== mark) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, index);
}

export function view(state: GameState, seat: number): SeatView {
  const mark: Mark = seat === 0 ? 'B' : 'W';
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    line: state.line ? state.line.slice() : null,
    mark,
    seat,
    canMove: state.status === 'playing' && state.turn === mark,
    moveCount: state.moves.length,
    last: state.moves.length > 0 ? state.moves[state.moves.length - 1] : null,
  };
}

export function resultText(state: GameState): 'black' | 'white' | 'draw' | null {
  if (state.status === 'draw') return 'draw';
  if (state.status === 'won' && state.winner) return state.winner === 'B' ? 'black' : 'white';
  return null;
}

export function moveCount(state: GameState): number {
  return state.moves.length;
}
