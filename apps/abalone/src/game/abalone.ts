/**
 * Pure Abalone engine.
 *
 * The board is a radius-4 hexagon: 61 points in nine horizontal rows
 * (5, 6, 7, 8, 9, 8, 7, 6, 5).  Axial coordinates keep every rule symmetric.
 * No DOM, network, clock or Math.random is used here.
 */

export type Player = 'B' | 'W';
export type Cell = Player | null;
export type Dir = 'E' | 'NE' | 'NW' | 'W' | 'SW' | 'SE';
export type Status = 'playing' | 'won';
export type MoveError = 'game-over' | 'bad-move' | 'wrong-turn' | 'bad-seat';

export const DIRS: readonly Dir[] = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];
export const AXES: readonly Dir[] = ['E', 'NE', 'NW'];
export const CAPTURES_TO_WIN = 6;

export const OPPOSITE: Record<Dir, Dir> = {
  E: 'W',
  NE: 'SW',
  NW: 'SE',
  W: 'E',
  SW: 'NE',
  SE: 'NW',
};

const VECTOR: Record<Dir, readonly [number, number]> = {
  E: [1, 0],
  NE: [1, -1],
  NW: [0, -1],
  W: [-1, 0],
  SW: [-1, 1],
  SE: [0, 1],
};

export interface Point {
  index: number;
  q: number;
  r: number;
  /** Screen-relative centre, in board units. */
  x: number;
  y: number;
}

export interface Move {
  /** One to three source points, ordered back to front along the line. */
  cells: number[];
  dir: Dir;
}

export interface GameState {
  board: Cell[];
  turn: Player;
  status: Status;
  winner: Player | null;
  /** Marbles pushed off by each player. */
  captured: Record<Player, number>;
  moves: Move[];
  first: Player;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  board: Cell[];
  turn: Player;
  status: Status;
  winner: Player | null;
  captured: Record<Player, number>;
  moveCount: number;
  last: Move | null;
  mark: Player;
  seat: number;
  canMove: boolean;
}

const HALF_ROW = Math.sqrt(3) / 2;

function buildPoints(): Point[] {
  const points: Point[] = [];
  for (let r = -4; r <= 4; r += 1) {
    const from = Math.max(-4, -4 - r);
    const to = Math.min(4, 4 - r);
    for (let q = from; q <= to; q += 1) {
      points.push({
        index: points.length,
        q,
        r,
        x: q + r / 2,
        y: r * HALF_ROW,
      });
    }
  }
  return points;
}

export const POINTS: readonly Point[] = buildPoints();
export const BOARD_SIZE = POINTS.length;

const LOOKUP = new Map<string, number>();
for (const point of POINTS) LOOKUP.set(`${point.q},${point.r}`, point.index);

export function indexAt(q: number, r: number): number {
  return LOOKUP.get(`${q},${r}`) ?? -1;
}

export function pointAt(index: number): Point | null {
  return POINTS[index] ?? null;
}

export function neighbor(index: number, dir: Dir): number {
  const point = POINTS[index];
  if (!point) return -1;
  const [dq, dr] = VECTOR[dir];
  return indexAt(point.q + dq, point.r + dr);
}

export function distanceFromCenter(index: number): number {
  const point = POINTS[index];
  if (!point) return 0;
  return Math.max(Math.abs(point.q), Math.abs(point.r), Math.abs(point.q + point.r));
}

export function other(player: Player): Player {
  return player === 'B' ? 'W' : 'B';
}

export function colorOfSeat(seat: number): Player | null {
  if (seat === 0) return 'B';
  if (seat === 1) return 'W';
  return null;
}

function isDir(value: unknown): value is Dir {
  return typeof value === 'string' && (DIRS as readonly string[]).includes(value);
}

function projection(point: Point, axis: Dir): number {
  const [dq, dr] = VECTOR[axis];
  return point.q * dq + point.r * dr;
}

/**
 * Return the same set of points ordered back-to-front, or null if the points
 * are not one contiguous straight line of 1–3 cells.
 */
export function lineOrder(cells: readonly number[]): number[] | null {
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 3) return null;
  const unique = new Set(cells);
  if (unique.size !== cells.length) return null;
  for (const index of cells) {
    if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return null;
  }
  if (cells.length === 1) return [cells[0]];

  for (const axis of AXES) {
    const sorted = [...cells].sort(
      (a, b) => projection(POINTS[a], axis) - projection(POINTS[b], axis),
    );
    let contiguous = true;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (neighbor(sorted[i], axis) !== sorted[i + 1]) {
        contiguous = false;
        break;
      }
    }
    if (contiguous) return sorted;
  }
  return null;
}

export function axisOf(cells: readonly number[]): Dir | null {
  const ordered = lineOrder(cells);
  if (!ordered || ordered.length < 2) return null;
  for (const axis of AXES) {
    if (neighbor(ordered[0], axis) === ordered[1]) return axis;
  }
  return null;
}

export function sameCells(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

export function moveKey(move: Move): string {
  const ordered = lineOrder(move.cells) ?? [...move.cells].sort((a, b) => a - b);
  return `${ordered.join('-')}:${move.dir}`;
}

/** Points a player can click to make this move. Captures point at the victim. */
export function moveDestinations(move: Move): number[] {
  const ordered = lineOrder(move.cells);
  if (!ordered) return [];
  if (ordered.length === 1) {
    const dest = neighbor(ordered[0], move.dir);
    return dest >= 0 ? [dest] : [];
  }
  const axis = axisOf(ordered);
  if (!axis) return [];
  if (move.dir === axis) {
    const dest = neighbor(ordered[ordered.length - 1], move.dir);
    return dest >= 0 ? [dest] : [];
  }
  if (move.dir === OPPOSITE[axis]) {
    const dest = neighbor(ordered[0], move.dir);
    return dest >= 0 ? [dest] : [];
  }
  return ordered.map((index) => neighbor(index, move.dir)).filter((index) => index >= 0);
}

export function setup(first: Player = 'B'): GameState {
  const board: Cell[] = Array<Cell>(BOARD_SIZE).fill(null);
  for (const point of POINTS) {
    if (point.r <= -3 || (point.r === -2 && point.q <= 0)) board[point.index] = 'B';
    if (point.r >= 3 || (point.r === 2 && point.q >= 0)) board[point.index] = 'W';
  }
  return {
    board,
    turn: first,
    status: 'playing',
    winner: null,
    captured: { B: 0, W: 0 },
    moves: [],
    first,
  };
}

/** Validate a move for the side to play, without changing the state. */
export function validate(state: GameState, move: Move): MoveError | null {
  if (state.status !== 'playing') return 'game-over';
  if (!move || !Array.isArray(move.cells) || !isDir(move.dir)) return 'bad-move';

  const ordered = lineOrder(move.cells);
  if (!ordered) return 'bad-move';
  if (ordered.some((index) => state.board[index] !== state.turn)) return 'bad-move';

  const mine = ordered.length;
  const front = ordered[mine - 1];

  if (mine === 1) {
    const dest = neighbor(front, move.dir);
    if (dest < 0) return 'bad-move';
    return state.board[dest] === null ? null : 'bad-move';
  }

  const axis = axisOf(ordered);
  if (!axis) return 'bad-move';

  if (move.dir === axis) {
    // In-line, forward: empty space or a weaker opponent line to push.
    const dest = neighbor(front, move.dir);
    if (dest < 0) return 'bad-move';
    if (state.board[dest] === null) return null;
    if (state.board[dest] === state.turn) return 'bad-move';

    const opponent = other(state.turn);
    let run = 0;
    let cursor = dest;
    while (cursor >= 0 && state.board[cursor] === opponent) {
      run += 1;
      cursor = neighbor(cursor, move.dir);
    }
    if (mine > run && (cursor < 0 || state.board[cursor] === null)) return null;
    return 'bad-move';
  }

  if (move.dir === OPPOSITE[axis]) {
    // In-line, backward: the whole line retreats into empty space.
    const rear = ordered[0];
    const dest = neighbor(rear, move.dir);
    if (dest < 0 || state.board[dest] !== null) return 'bad-move';
    return null;
  }

  // Broadside: every marble slides one step into an empty point.
  for (const index of ordered) {
    const dest = neighbor(index, move.dir);
    if (dest < 0 || state.board[dest] !== null) return 'bad-move';
  }
  return null;
}

export function apply(state: GameState, move: Move): MoveResult {
  const error = validate(state, move);
  if (error) return { ok: false, state, error };

  const ordered = lineOrder(move.cells);
  if (!ordered) return { ok: false, state, error: 'bad-move' };

  const color = state.turn;
  const opponent = other(color);
  const board = state.board.slice();
  const captured: Record<Player, number> = { ...state.captured };
  const mine = ordered.length;
  const front = ordered[mine - 1];

  if (mine === 1) {
    const dest = neighbor(front, move.dir);
    board[front] = null;
    board[dest] = color;
  } else {
    const axis = axisOf(ordered);
    if (!axis) return { ok: false, state, error: 'bad-move' };

    if (move.dir === axis) {
      const dest = neighbor(front, move.dir);
      if (board[dest] === opponent) {
        const run: number[] = [];
        let cursor = dest;
        while (cursor >= 0 && board[cursor] === opponent) {
          run.push(cursor);
          cursor = neighbor(cursor, move.dir);
        }

        for (const index of ordered) board[index] = null;
        for (const index of run) board[index] = null;
        for (const index of ordered) board[neighbor(index, move.dir)] = color;
        for (const index of run) {
          const target = neighbor(index, move.dir);
          if (target < 0) captured[color] += 1;
          else board[target] = opponent;
        }
      } else {
        for (const index of ordered) board[index] = null;
        for (const index of ordered) board[neighbor(index, move.dir)] = color;
      }
    } else if (move.dir === OPPOSITE[axis]) {
      for (const index of ordered) board[index] = null;
      for (const index of ordered) board[neighbor(index, move.dir)] = color;
    } else {
      for (const index of ordered) board[index] = null;
      for (const index of ordered) board[neighbor(index, move.dir)] = color;
    }
  }

  const winner: Player | null =
    captured.B >= CAPTURES_TO_WIN ? 'B' : captured.W >= CAPTURES_TO_WIN ? 'W' : null;

  return {
    ok: true,
    state: {
      ...state,
      board,
      turn: opponent,
      captured,
      status: winner ? 'won' : 'playing',
      winner,
      moves: [
        ...state.moves,
        { cells: [...ordered], dir: move.dir },
      ],
    },
  };
}

export function applySeat(state: GameState, seat: number, move: Move): MoveResult {
  const color = colorOfSeat(seat);
  if (!color) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== color) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, move);
}

/** All unique legal moves for the side to play. */
export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  const moves: Move[] = [];
  const seen = new Set<string>();
  const add = (cells: number[], dir: Dir): void => {
    const move: Move = { cells: [...cells], dir };
    const key = moveKey(move);
    if (seen.has(key)) return;
    if (validate(state, move) !== null) return;
    seen.add(key);
    moves.push(move);
  };

  for (const point of POINTS) {
    if (state.board[point.index] !== state.turn) continue;
    for (const axis of AXES) {
      const cells: number[] = [point.index];
      let cursor = point.index;
      for (let length = 1; length <= 3; length += 1) {
        if (length > 1) {
          cursor = neighbor(cursor, axis);
          if (cursor < 0 || state.board[cursor] !== state.turn) break;
          cells.push(cursor);
        }

        if (length === 1) {
          for (const dir of DIRS) add(cells, dir);
        } else {
          add(cells, axis);
          add(cells, OPPOSITE[axis]);
          for (const dir of DIRS) {
            if (dir !== axis && dir !== OPPOSITE[axis]) add(cells, dir);
          }
        }
      }
    }
  }
  return moves;
}

export function movesForSelection(state: GameState, cells: readonly number[]): Move[] {
  const ordered = lineOrder(cells);
  if (!ordered) return [];
  return legalMoves(state).filter((move) => sameCells(move.cells, ordered));
}

/** Convert a seat view back into the small shape the rules functions need. */
export function stateFromView(view: SeatView): GameState {
  return {
    board: view.board.slice(),
    turn: view.turn,
    status: view.status,
    winner: view.winner,
    captured: { ...view.captured },
    moves: [],
    first: 'B',
  };
}

export function view(state: GameState, seat: number): SeatView {
  const mark = colorOfSeat(seat) ?? 'W';
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    captured: { ...state.captured },
    moveCount: state.moves.length,
    last: state.moves.length
      ? { cells: [...state.moves[state.moves.length - 1].cells], dir: state.moves[state.moves.length - 1].dir }
      : null,
    mark,
    seat,
    canMove: state.status === 'playing' && state.turn === mark,
  };
}
