/**
 * Little Go — a small, pure 9×9 Go engine.
 *
 * Rules used here:
 *   · Black and White alternate placing one stone on an empty intersection.
 *   · A group with no liberties is captured and removed.
 *   · Suicide is illegal.
 *   · Simple ko: the point that would immediately recreate the previous
 *     position may not be played for one move.
 *   · Two consecutive passes end the game.
 *   · Score = stones on the board + empty points surrounded by one colour.
 *     White receives 6.5 komi.
 *
 * The module has no DOM, network, clock or randomness dependency.
 */

export type Color = 'B' | 'W';
export type Cell = Color | null;

export const SIZE = 9;
export const POINTS = SIZE * SIZE;
export const KOMI = 6.5;

export interface MoveRecord {
  type: 'place' | 'pass';
  index: number | null;
  color: Color;
}

export interface Score {
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
  neutral: number;
  komi: number;
  black: number;
  white: number;
  winner: Color;
  margin: number;
}

export interface GameState {
  board: Cell[];
  turn: Color;
  status: 'playing' | 'finished';
  /** Consecutive passes. Two finish the game. */
  passes: number;
  /** Point where White/Black may not immediately recapture (simple ko). */
  koPoint: number | null;
  /** Stones captured by each colour. */
  captures: { B: number; W: number };
  moves: MoveRecord[];
  first: Color;
  lastMove: number | null;
  score: Score | null;
}

export type MoveError =
  | 'occupied'
  | 'game-over'
  | 'bad-cell'
  | 'wrong-turn'
  | 'suicide'
  | 'ko';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  board: Cell[];
  turn: Color;
  status: GameState['status'];
  passes: number;
  koPoint: number | null;
  lastMove: number | null;
  captures: { B: number; W: number };
  moveCount: number;
  score: Score | null;
  color: Color;
  seat: number;
  canMove: boolean;
}

export const NEIGHBORS: readonly (readonly number[])[] = (() => {
  const table: number[][] = [];
  for (let index = 0; index < POINTS; index++) {
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const list: number[] = [];
    if (row > 0) list.push(index - SIZE);
    if (row < SIZE - 1) list.push(index + SIZE);
    if (col > 0) list.push(index - 1);
    if (col < SIZE - 1) list.push(index + 1);
    table.push(list);
  }
  return table;
})();

export const STARS: readonly number[] = [20, 24, 40, 56, 60];

export const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'] as const;

export const opponent = (color: Color): Color => (color === 'B' ? 'W' : 'B');
export const colorForSeat = (seat: number): Color => (seat === 0 ? 'B' : 'W');

export function emptyBoard(): Cell[] {
  return Array<Cell>(POINTS).fill(null);
}

function groupAt(board: Cell[], start: number): { stones: number[]; liberties: Set<number> } {
  const color = board[start];
  const stones: number[] = [];
  const liberties = new Set<number>();
  if (!color) return { stones, liberties };
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const index = queue.pop() as number;
    stones.push(index);
    for (const next of NEIGHBORS[index]) {
      if (board[next] === null) liberties.add(next);
      else if (board[next] === color && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return { stones, liberties };
}

/** Set of liberties of the group at `index`. Exported for the AI. */
export function libertiesAt(board: Cell[], index: number): number {
  return groupAt(board, index).liberties.size;
}

/** Group information, exported for AI heuristics. */
export function groupInfo(board: Cell[], index: number): { stones: number[]; liberties: Set<number> } {
  return groupAt(board, index);
}

/** Whether the group at `index` is in atari (exactly one liberty). */
export function inAtari(board: Cell[], index: number): boolean {
  return board[index] !== null && libertiesAt(board, index) === 1;
}

export function setup(first: Color = 'B'): GameState {
  return {
    board: emptyBoard(),
    turn: first,
    status: 'playing',
    passes: 0,
    koPoint: null,
    captures: { B: 0, W: 0 },
    moves: [],
    first,
    lastMove: null,
    score: null,
  };
}

/**
 * Area-style territory map: every empty point is assigned to 'B' or 'W' when
 * the whole connected empty region touches only that colour. Mixed regions are
 * neutral (null). Exported because the AI uses it as a gentle-region heuristic.
 */
export function territoryOwner(board: Cell[]): (Color | null)[] {
  const owner = Array<Color | null>(POINTS).fill(null);
  const seen = new Set<number>();
  for (let start = 0; start < POINTS; start++) {
    if (board[start] !== null || seen.has(start)) continue;
    const points: number[] = [];
    const border = new Set<Color>();
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const index = queue.pop() as number;
      points.push(index);
      for (const next of NEIGHBORS[index]) {
        if (board[next] === null) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        } else {
          border.add(board[next] as Color);
        }
      }
    }
    if (border.size === 1) {
      const color = border.values().next().value as Color;
      for (const point of points) owner[point] = color;
    }
  }
  return owner;
}

export function scoreBoard(board: Cell[], komi = KOMI): Score {
  if (board.length !== POINTS) throw new Error('A Go board must have 81 points');
  let blackStones = 0;
  let whiteStones = 0;
  for (const cell of board) {
    if (cell === 'B') blackStones += 1;
    else if (cell === 'W') whiteStones += 1;
  }
  const owner = territoryOwner(board);
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let neutral = 0;
  for (let index = 0; index < POINTS; index++) {
    if (board[index] !== null) continue;
    const point = owner[index];
    if (point === 'B') blackTerritory += 1;
    else if (point === 'W') whiteTerritory += 1;
    else neutral += 1;
  }
  const black = blackStones + blackTerritory;
  const white = whiteStones + whiteTerritory + komi;
  const winner: Color = black > white ? 'B' : 'W';
  return {
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    neutral,
    komi,
    black,
    white,
    winner,
    margin: Math.round(Math.abs(black - white) * 10) / 10,
  };
}

function finish(state: GameState): GameState {
  return {
    ...state,
    status: 'finished',
    score: scoreBoard(state.board),
    koPoint: null,
  };
}

export function apply(state: GameState, index: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(index) || index < 0 || index >= POINTS) {
    return { ok: false, state, error: 'bad-cell' };
  }
  if (state.board[index] !== null) return { ok: false, state, error: 'occupied' };
  if (state.koPoint === index) return { ok: false, state, error: 'ko' };

  const color = state.turn;
  const other = opponent(color);
  const board = state.board.slice();
  board[index] = color;
  const captured: number[] = [];

  for (const neighbor of NEIGHBORS[index]) {
    if (board[neighbor] !== other) continue;
    const group = groupAt(board, neighbor);
    if (group.liberties.size === 0) {
      for (const stone of group.stones) {
        board[stone] = null;
        captured.push(stone);
      }
    }
  }

  const own = groupAt(board, index);
  if (own.liberties.size === 0) {
    return { ok: false, state, error: 'suicide' };
  }

  // Simple ko: one stone captured, the capturing stone stands alone with a
  // single liberty — that liberty is the point of immediate recapture.
  let koPoint: number | null = null;
  if (captured.length === 1 && own.stones.length === 1 && own.liberties.size === 1) {
    koPoint = captured[0];
  }

  const captureCount = captured.length;
  const next: GameState = {
    ...state,
    board,
    turn: other,
    status: 'playing',
    passes: 0,
    koPoint,
    captures: {
      ...state.captures,
      [color]: state.captures[color] + captureCount,
    },
    moves: [...state.moves, { type: 'place', index, color }],
    lastMove: index,
    score: null,
  };
  return { ok: true, state: next };
}

export function pass(state: GameState): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  const passes = state.passes + 1;
  const next: GameState = {
    ...state,
    turn: opponent(state.turn),
    passes,
    koPoint: null,
    lastMove: null,
    moves: [...state.moves, { type: 'pass', index: null, color: state.turn }],
    score: null,
  };
  return { ok: true, state: passes >= 2 ? finish(next) : next };
}

export function applySeat(state: GameState, seat: number, index: number): MoveResult {
  const color = colorForSeat(seat);
  if (state.turn !== color) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, index);
}

export function passSeat(state: GameState, seat: number): MoveResult {
  const color = colorForSeat(seat);
  if (state.turn !== color) return { ok: false, state, error: 'wrong-turn' };
  return pass(state);
}

export function legalMoves(state: GameState): number[] {
  if (state.status !== 'playing') return [];
  const moves: number[] = [];
  for (let index = 0; index < POINTS; index++) {
    if (state.board[index] !== null) continue;
    if (state.koPoint === index) continue;
    if (apply(state, index).ok) moves.push(index);
  }
  return moves;
}

export function view(state: GameState, seat: number): SeatView {
  const color = colorForSeat(seat);
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    passes: state.passes,
    koPoint: state.koPoint,
    lastMove: state.lastMove,
    captures: { ...state.captures },
    moveCount: state.moves.length,
    score: state.score ? { ...state.score } : null,
    color,
    seat,
    canMove: state.status === 'playing' && state.turn === color,
  };
}

/** Coordinate label such as E5 (column letters skip I, as in Go). */
export function pointName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= POINTS) return '—';
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  return `${COLUMN_LABELS[col]}${SIZE - row}`;
}

/** Parse E5 / e5 into an index, useful for docs and tests. */
export function parsePoint(name: string): number {
  const match = /^([A-HJ])([1-9])$/i.exec(name.trim());
  if (!match) return -1;
  const col = COLUMN_LABELS.indexOf(match[1].toUpperCase() as (typeof COLUMN_LABELS)[number]);
  const row = SIZE - Number(match[2]);
  return row * SIZE + col;
}
