/**
 * Hex — pure, deterministic rules engine.
 *
 * The board is an 11×11 rhombus stored row-major. Red connects the north edge
 * (row 0) to the south edge (row 10); Blue connects the west edge (column 0)
 * to the east edge (column 10). There are no draws: a completely filled Hex
 * board always contains a connection for one of the two players.
 *
 * No DOM, clock, network or Math.random in this module.
 */

export const SIZE = 11;
export const CELL_COUNT = SIZE * SIZE;

export type Player = 'R' | 'B';
export type Cell = Player | null;

export interface GameState {
  board: Cell[];
  turn: Player;
  status: 'playing' | 'won';
  winner: Player | null;
  /** Cells of the winning connection, from one edge to the other. */
  path: number[] | null;
  moves: number[];
  first: Player;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: 'occupied' | 'game-over' | 'bad-cell' | 'wrong-turn';
}

/** The guest only ever receives public information plus its own seat marker. */
export interface SeatView {
  board: Cell[];
  turn: Player;
  status: GameState['status'];
  winner: Player | null;
  path: number[] | null;
  player: Player;
  seat: number;
  canMove: boolean;
  moveCount: number;
  lastMove: number | null;
}

export const FIRST_PLAYER: Player = 'R';

export function opponent(player: Player): Player {
  return player === 'R' ? 'B' : 'R';
}

export function indexOf(row: number, col: number): number {
  return row * SIZE + col;
}

export function rowOf(index: number): number {
  return Math.floor(index / SIZE);
}

export function colOf(index: number): number {
  return index % SIZE;
}

export function inside(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * Axial neighbours. Columns are q, rows are r, so the six directions are
 * E, NE, NW, W, SW and SE. Precomputed once for the whole module.
 */
const NEIGHBOUR_DELTAS: readonly (readonly [number, number])[] = [
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 0],
];

export const NEIGHBOURS: readonly (readonly number[])[] = Array.from(
  { length: CELL_COUNT },
  (_, index) => {
    const row = rowOf(index);
    const col = colOf(index);
    const result: number[] = [];
    for (const [dr, dc] of NEIGHBOUR_DELTAS) {
      if (inside(row + dr, col + dc)) result.push(indexOf(row + dr, col + dc));
    }
    return result;
  },
);

export function neighbours(index: number): readonly number[] {
  return NEIGHBOURS[index] ?? [];
}

export function areNeighbours(a: number, b: number): boolean {
  return neighbours(a).includes(b);
}

export function setup(first: Player = FIRST_PLAYER): GameState {
  return {
    board: Array<Cell>(CELL_COUNT).fill(null),
    turn: first,
    status: 'playing',
    winner: null,
    path: null,
    moves: [],
    first,
  };
}

function isStartCell(player: Player, index: number): boolean {
  return player === 'R' ? rowOf(index) === 0 : colOf(index) === 0;
}

function isGoalCell(player: Player, index: number): boolean {
  return player === 'R' ? rowOf(index) === SIZE - 1 : colOf(index) === SIZE - 1;
}

/**
 * Breadth-first search through stones of one colour. Returns the actual
 * connection from the start edge to the goal edge, or null.
 */
export function winningPath(board: Cell[], player: Player): number[] | null {
  const previous = new Int16Array(CELL_COUNT).fill(-1);
  const seen = new Uint8Array(CELL_COUNT);
  const queue: number[] = [];
  const goal = new Uint8Array(CELL_COUNT);

  for (let index = 0; index < CELL_COUNT; index++) {
    if (isGoalCell(player, index)) goal[index] = 1;
    if (board[index] === player && isStartCell(player, index)) {
      seen[index] = 1;
      queue.push(index);
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (goal[current]) {
      const path: number[] = [];
      let cursor = current;
      while (cursor !== -1) {
        path.push(cursor);
        cursor = previous[cursor];
      }
      return path.reverse();
    }
    for (const next of neighbours(current)) {
      if (seen[next] || board[next] !== player) continue;
      seen[next] = 1;
      previous[next] = current;
      queue.push(next);
    }
  }
  return null;
}

export function hasWon(board: Cell[], player: Player): boolean {
  return winningPath(board, player) !== null;
}

export function legal(state: GameState, index: number): boolean {
  return (
    state.status === 'playing' &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < CELL_COUNT &&
    state.board[index] === null
  );
}

export function legalMoves(state: GameState): number[] {
  if (state.status !== 'playing') return [];
  const result: number[] = [];
  for (let index = 0; index < CELL_COUNT; index++) {
    if (state.board[index] === null) result.push(index);
  }
  return result;
}

export function apply(state: GameState, index: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) {
    return { ok: false, state, error: 'bad-cell' };
  }
  if (state.board[index] !== null) return { ok: false, state, error: 'occupied' };

  const board = state.board.slice();
  const mover = state.turn;
  board[index] = mover;
  const path = winningPath(board, mover);
  const next: GameState = {
    ...state,
    board,
    turn: opponent(mover),
    status: path ? 'won' : 'playing',
    winner: path ? mover : null,
    path,
    moves: [...state.moves, index],
  };
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, index: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  const player: Player = seat === 0 ? 'R' : 'B';
  if (state.turn !== player) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, index);
}

export function view(state: GameState, seat: number): SeatView {
  const player: Player = seat === 0 ? 'R' : 'B';
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    path: state.path ? state.path.slice() : null,
    player,
    seat,
    canMove: state.status === 'playing' && state.turn === player,
    moveCount: state.moves.length,
    lastMove: state.moves.length ? state.moves[state.moves.length - 1] : null,
  };
}

export function resultText(state: GameState): 'red' | 'blue' | null {
  if (state.status !== 'won') return null;
  return state.winner === 'R' ? 'red' : 'blue';
}

export function stoneCount(board: Cell[], player: Player): number {
  let count = 0;
  for (const cell of board) if (cell === player) count++;
  return count;
}
