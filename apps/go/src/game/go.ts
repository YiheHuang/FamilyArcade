/**
 * Full Go engine — 9×9, 13×13 and 19×19.
 *
 * Rules implemented:
 *   · Black and White alternate placing one stone on an empty intersection.
 *   · A group with no liberties is captured and removed.
 *   · Suicide is illegal, unless the move captures first.
 *   · Simple ko: the point that would immediately recreate the previous
 *     position may not be played for one move.
 *   · Two consecutive passes end the game.
 *   · Area scoring: stones on the board + empty points surrounded by one
 *     colour. White receives 6.5 or 7.5 komi.
 *
 * The module has no DOM, network, clock or randomness dependency.
 */

export type Color = 'B' | 'W';
export type Cell = Color | null;

export const BOARD_SIZES = [9, 13, 19] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

export const KOMI_OPTIONS = [6.5, 7.5] as const;
export type Komi = (typeof KOMI_OPTIONS)[number];

export const DEFAULT_SIZE: BoardSize = 19;
export const DEFAULT_KOMI: Komi = 7.5;

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
  /** Empty points after scoring: a territory owner, or null for neutral. */
  ownership: (Color | null)[];
}

export interface GameState {
  size: BoardSize;
  board: Cell[];
  turn: Color;
  status: 'playing' | 'finished';
  /** Consecutive passes. Two finish the game. */
  passes: number;
  /** Point where the next player may not immediately recapture (simple ko). */
  koPoint: number | null;
  /** Stones captured by each colour. */
  captures: { B: number; W: number };
  moves: MoveRecord[];
  first: Color;
  lastMove: number | null;
  komi: Komi;
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
  size: BoardSize;
  komi: Komi;
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

const neighborCache = new Map<BoardSize, readonly (readonly number[])[]>();

/** Adjacency table for a board size, cached because 19×19 is used often. */
export function neighborsFor(size: BoardSize): readonly (readonly number[])[] {
  const cached = neighborCache.get(size);
  if (cached) return cached;
  const table: number[][] = [];
  for (let index = 0; index < size * size; index++) {
    const row = Math.floor(index / size);
    const col = index % size;
    const list: number[] = [];
    if (row > 0) list.push(index - size);
    if (row < size - 1) list.push(index + size);
    if (col > 0) list.push(index - 1);
    if (col < size - 1) list.push(index + 1);
    table.push(list);
  }
  neighborCache.set(size, table);
  return table;
}

export function neighborsOf(size: BoardSize, index: number): readonly number[] {
  return neighborsFor(size)[index] ?? [];
}

export function areaOf(size: BoardSize): number {
  return size * size;
}

export function centerIndex(size: BoardSize): number {
  const middle = Math.floor(size / 2);
  return middle * size + middle;
}

export function isBoardSize(value: unknown): value is BoardSize {
  return value === 9 || value === 13 || value === 19;
}

export function isKomi(value: unknown): value is Komi {
  return value === 6.5 || value === 7.5;
}

export const opponent = (color: Color): Color => (color === 'B' ? 'W' : 'B');
export const colorForSeat = (seat: number): Color => (seat === 0 ? 'B' : 'W');

export function emptyBoard(size: BoardSize = DEFAULT_SIZE): Cell[] {
  return Array<Cell>(size * size).fill(null);
}

/** Standard hoshi points: five on 9×9 and 13×13, nine on 19×19. */
export function starPoints(size: BoardSize): number[] {
  const edge = size === 9 ? 2 : 3;
  const far = size - 1 - edge;
  const mid = (size - 1) / 2;
  const coordinates: [number, number][] = [
    [edge, edge],
    [far, edge],
    [edge, far],
    [far, far],
    [mid, mid],
  ];
  if (size === 19) {
    const axis = [3, 9, 15];
    for (const y of axis) {
      for (const x of axis) {
        if (x === 3 || x === 15 || y === 3 || y === 15) coordinates.push([x, y]);
      }
    }
  }
  const seen = new Set<number>();
  return coordinates
    .map(([x, y]) => y * size + x)
    .filter((index) => {
      if (seen.has(index)) return false;
      seen.add(index);
      return index >= 0 && index < size * size;
    })
    .sort((a, b) => a - b);
}

export function setup(options: { size?: BoardSize; komi?: Komi; first?: Color } = {}): GameState {
  const size = options.size ?? DEFAULT_SIZE;
  const komi = options.komi ?? DEFAULT_KOMI;
  const first = options.first ?? 'B';
  return {
    size,
    board: emptyBoard(size),
    turn: first,
    status: 'playing',
    passes: 0,
    koPoint: null,
    captures: { B: 0, W: 0 },
    moves: [],
    first,
    lastMove: null,
    komi,
    score: null,
  };
}

export interface GroupInfo {
  stones: number[];
  liberties: Set<number>;
}

function groupAt(board: Cell[], size: BoardSize, start: number): GroupInfo {
  const color = board[start];
  const stones: number[] = [];
  const liberties = new Set<number>();
  if (!color) return { stones, liberties };
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const index = queue.pop() as number;
    stones.push(index);
    for (const next of neighborsOf(size, index)) {
      if (board[next] === null) liberties.add(next);
      else if (board[next] === color && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return { stones, liberties };
}

export function groupInfo(board: Cell[], size: BoardSize, index: number): GroupInfo {
  return groupAt(board, size, index);
}

export function libertiesAt(board: Cell[], size: BoardSize, index: number): number {
  return groupAt(board, size, index).liberties.size;
}

export function inAtari(board: Cell[], size: BoardSize, index: number): boolean {
  return board[index] !== null && libertiesAt(board, size, index) === 1;
}

/**
 * Area-style territory map: every empty point is assigned to 'B' or 'W' when
 * the whole connected empty region touches only that colour. Mixed regions are
 * neutral (null).
 */
export function territoryOwner(board: Cell[], size: BoardSize): (Color | null)[] {
  const owner = Array<Color | null>(size * size).fill(null);
  const seen = new Set<number>();
  for (let start = 0; start < size * size; start++) {
    if (board[start] !== null || seen.has(start)) continue;
    const points: number[] = [];
    const border = new Set<Color>();
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const index = queue.pop() as number;
      points.push(index);
      for (const next of neighborsOf(size, index)) {
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

export function scoreBoard(board: Cell[], size: BoardSize, komi: Komi = DEFAULT_KOMI): Score {
  if (board.length !== size * size) throw new Error('The board size does not match its points');
  let blackStones = 0;
  let whiteStones = 0;
  for (const cell of board) {
    if (cell === 'B') blackStones += 1;
    else if (cell === 'W') whiteStones += 1;
  }
  const owner = territoryOwner(board, size);
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let neutral = 0;
  for (let index = 0; index < size * size; index++) {
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
    ownership: owner,
  };
}

function finish(state: GameState): GameState {
  return {
    ...state,
    status: 'finished',
    score: scoreBoard(state.board, state.size, state.komi),
    koPoint: null,
  };
}

export function apply(state: GameState, index: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.size * state.size
  ) {
    return { ok: false, state, error: 'bad-cell' };
  }
  if (state.board[index] !== null) return { ok: false, state, error: 'occupied' };
  if (state.koPoint === index) return { ok: false, state, error: 'ko' };

  const color = state.turn;
  const other = opponent(color);
  const board = state.board.slice();
  board[index] = color;

  // Collect every adjacent enemy group first, then remove all groups that had
  // no liberties. Removing one group cannot rescue another group that was
  // already surrounded.
  const doomed: number[] = [];
  const checked = new Set<number>();
  for (const neighbor of neighborsOf(state.size, index)) {
    if (board[neighbor] !== other) continue;
    const group = groupAt(board, state.size, neighbor);
    const marker = group.stones[0];
    if (checked.has(marker)) continue;
    checked.add(marker);
    if (group.liberties.size === 0) doomed.push(...group.stones);
  }
  for (const stone of doomed) board[stone] = null;

  const own = groupAt(board, state.size, index);
  if (own.liberties.size === 0) {
    return { ok: false, state, error: 'suicide' };
  }

  // Simple ko: one stone captured, the capturing stone stands alone with a
  // single liberty — that liberty is the point of immediate recapture.
  let koPoint: number | null = null;
  if (doomed.length === 1 && own.stones.length === 1 && own.liberties.size === 1) {
    koPoint = doomed[0];
  }

  const next: GameState = {
    ...state,
    board,
    turn: other,
    status: 'playing',
    passes: 0,
    koPoint,
    captures: {
      ...state.captures,
      [color]: state.captures[color] + doomed.length,
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
  for (let index = 0; index < state.size * state.size; index++) {
    if (state.board[index] !== null) continue;
    if (state.koPoint === index) continue;
    if (apply(state, index).ok) moves.push(index);
  }
  return moves;
}

export function isLegal(state: GameState, index: number): boolean {
  return apply(state, index).ok;
}

export function view(state: GameState, seat: number): SeatView {
  const color = colorForSeat(seat);
  return {
    size: state.size,
    komi: state.komi,
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    passes: state.passes,
    koPoint: state.koPoint,
    lastMove: state.lastMove,
    captures: { ...state.captures },
    moveCount: state.moves.length,
    score: state.score
      ? { ...state.score, ownership: state.score.ownership.slice() }
      : null,
    color,
    seat,
    canMove: state.status === 'playing' && state.turn === color,
  };
}

const COLUMNS = 'ABCDEFGHJKLMNOPQRST';

/** Coordinate label such as D4 or Q16 (the letter I is skipped, as in Go). */
export function pointName(size: BoardSize, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= size * size) return '—';
  const row = Math.floor(index / size);
  const col = index % size;
  return `${COLUMNS[col] ?? '?'}${size - row}`;
}

/** Parse D4 / q16 into an index. Returns -1 for an invalid point. */
export function parsePoint(size: BoardSize, name: string): number {
  const match = /^([A-HJ-T])(\d{1,2})$/i.exec(name.trim());
  if (!match) return -1;
  const col = COLUMNS.indexOf(match[1].toUpperCase());
  const number = Number(match[2]);
  if (col < 0 || col >= size || !Number.isInteger(number) || number < 1 || number > size) {
    return -1;
  }
  const row = size - number;
  return row * size + col;
}
