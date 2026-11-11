export type Mark = 'X' | 'O';
export type Cell = Mark | null;

export interface GameState {
  board: Cell[];
  turn: Mark;
  status: 'playing' | 'won' | 'draw';
  winner: Mark | null;
  line: number[] | null;
  moves: number[];
  first: Mark;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: 'occupied' | 'game-over' | 'bad-cell' | 'wrong-turn';
}

export interface SeatView {
  board: Cell[];
  turn: Mark;
  status: GameState['status'];
  winner: Mark | null;
  line: number[] | null;
  mark: Mark;
  seat: number;
  canMove: boolean;
  moveCount: number;
  last: number | null;
}

export const LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function setup(first: Mark = 'X'): GameState {
  return {
    board: Array<Cell>(9).fill(null),
    turn: first,
    status: 'playing',
    winner: null,
    line: null,
    moves: [],
    first,
  };
}

export function winningLine(board: Cell[]): number[] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return [...line];
  }
  return null;
}

export function legal(state: GameState, index: number): boolean {
  return (
    state.status === 'playing' &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < 9 &&
    state.board[index] === null
  );
}

export function legalMoves(state: GameState): number[] {
  if (state.status !== 'playing') return [];
  return state.board.flatMap((cell, index) => (cell === null ? [index] : []));
}

export function apply(state: GameState, index: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(index) || index < 0 || index >= 9) {
    return { ok: false, state, error: 'bad-cell' };
  }
  if (state.board[index] !== null) return { ok: false, state, error: 'occupied' };
  const board = state.board.slice();
  board[index] = state.turn;
  const line = winningLine(board);
  const full = board.every(Boolean);
  const next: GameState = {
    ...state,
    board,
    moves: [...state.moves, index],
    turn: state.turn === 'X' ? 'O' : 'X',
    status: line ? 'won' : full ? 'draw' : 'playing',
    winner: line ? state.turn : null,
    line,
  };
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, index: number): MoveResult {
  const mark: Mark = seat === 0 ? 'X' : 'O';
  if (state.turn !== mark) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, index);
}

export function view(state: GameState, seat: number): SeatView {
  const mark: Mark = seat === 0 ? 'X' : 'O';
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    line: state.line,
    mark,
    seat,
    canMove: state.status === 'playing' && state.turn === mark,
    moveCount: state.moves.length,
    last: state.moves.length > 0 ? state.moves[state.moves.length - 1] : null,
  };
}

export function resultText(state: GameState): 'x' | 'o' | 'draw' | null {
  if (state.status === 'draw') return 'draw';
  if (state.status === 'won') return state.winner === 'X' ? 'x' : 'o';
  return null;
}
