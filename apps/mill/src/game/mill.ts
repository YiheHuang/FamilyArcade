/**
 * Mill · Nine Men's Morris — pure rules engine.
 *
 * No DOM, network, clock or Math.random. Every mutation returns a fresh
 * GameState so the UI can keep an undo stack and the LAN host can serialise
 * snapshots safely.
 *
 * Board numbering (three concentric rings, eight points each, clockwise
 * from the top-left corner):
 *
 *   outer  ring:  0 TL, 1 top-mid, 2 TR, 3 right-mid, 4 BR, 5 bottom-mid, 6 BL, 7 left-mid
 *   middle ring:  8 TL, 9 top-mid, 10 TR, 11 right-mid, 12 BR, 13 bottom-mid, 14 BL, 15 left-mid
 *   inner  ring: 16 TL, 17 top-mid, 18 TR, 19 right-mid, 20 BR, 21 bottom-mid, 22 BL, 23 left-mid
 *
 * The three rings are joined by four spokes: 1–9–17, 3–11–19, 5–13–21,
 * 7–15–23. ADJACENCY and MILLS below are the authoritative definitions.
 */

export type Player = 'W' | 'B';
export type Cell = Player | null;
export type Phase = 'placing' | 'moving' | 'ended';
export type Status = 'playing' | 'won' | 'draw';
export type WinReason = 'two-men' | 'blocked' | null;

export interface LastMove {
  by: Player;
  from: number | null;
  to: number;
  capture: boolean;
  mill: readonly number[] | null;
}

export interface GameState {
  board: Cell[];
  turn: Player;
  phase: Phase;
  status: Status;
  winner: Player | null;
  winReason: WinReason;
  /** The mark whose man must be removed right now. Turn stays with the capturer. */
  pendingCapture: Player | null;
  /** Men still waiting in each player's hand during the placing phase. */
  hand: Record<Player, number>;
  /** Men currently on the board. */
  onBoard: Record<Player, number>;
  /** Plies since the last capture — 100 quiet plies is a draw. */
  quiet: number;
  moveCount: number;
  last: LastMove | null;
  first: Player;
}

export type Move =
  | { type: 'place'; point: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'capture'; point: number };

export type MoveError =
  | 'game-over'
  | 'bad-move'
  | 'bad-point'
  | 'occupied'
  | 'wrong-phase'
  | 'not-own'
  | 'not-adjacent'
  | 'capture-required'
  | 'not-capturable'
  | 'protected'
  | 'no-mill'
  | 'wrong-turn'
  | 'bad-seat';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  board: Cell[];
  turn: Player;
  phase: Phase;
  status: Status;
  winner: Player | null;
  winReason: WinReason;
  pendingCapture: Player | null;
  hand: Record<Player, number>;
  onBoard: Record<Player, number>;
  quiet: number;
  moveCount: number;
  last: LastMove | null;
  first: Player;
  mark: Player;
  seat: number;
  canMove: boolean;
  legal: Move[];
}

export const POINTS = 24;
export const MEN_EACH = 9;
/** 50 full moves with no capture is a draw. */
export const QUIET_LIMIT = 100;

/** Every line on the board, four sides per ring plus four spokes. */
export const MILLS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [2, 3, 4],
  [4, 5, 6],
  [6, 7, 0],
  [8, 9, 10],
  [10, 11, 12],
  [12, 13, 14],
  [14, 15, 8],
  [16, 17, 18],
  [18, 19, 20],
  [20, 21, 22],
  [22, 23, 16],
  [1, 9, 17],
  [3, 11, 19],
  [5, 13, 21],
  [7, 15, 23],
];

const MILLS_BY_POINT: readonly (readonly [number, number, number])[][] = Array.from(
  { length: POINTS },
  (_, point) => MILLS.filter((line) => line.includes(point)),
);

const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 8],
  [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 16],
  [1, 9], [9, 17], [3, 11], [11, 19], [5, 13], [13, 21], [7, 15], [15, 23],
];

export const ADJACENCY: readonly (readonly number[])[] = (() => {
  const lists: number[][] = Array.from({ length: POINTS }, () => []);
  for (const [a, b] of EDGES) {
    lists[a].push(b);
    lists[b].push(a);
  }
  return lists.map((list) => [...list].sort((x, y) => x - y));
})();

export function other(player: Player): Player {
  return player === 'W' ? 'B' : 'W';
}

export function isPoint(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < POINTS;
}

export function setup(first: Player = 'W'): GameState {
  return {
    board: Array<Cell>(POINTS).fill(null),
    turn: first,
    phase: 'placing',
    status: 'playing',
    winner: null,
    winReason: null,
    pendingCapture: null,
    hand: { W: MEN_EACH, B: MEN_EACH },
    onBoard: { W: 0, B: 0 },
    quiet: 0,
    moveCount: 0,
    last: null,
    first,
  };
}

export function isAdjacent(from: number, to: number): boolean {
  return isPoint(from) && isPoint(to) && ADJACENCY[from].includes(to);
}

export function emptyPoints(board: readonly Cell[]): number[] {
  const points: number[] = [];
  for (let point = 0; point < POINTS; point += 1) {
    if (board[point] === null) points.push(point);
  }
  return points;
}

/** The first complete mill through `point`, if any. */
export function millAt(
  board: readonly Cell[],
  player: Player,
  point: number,
): readonly number[] | null {
  if (!isPoint(point) || board[point] !== player) return null;
  for (const line of MILLS_BY_POINT[point]) {
    if (line.every((index) => board[index] === player)) return line;
  }
  return null;
}

export function millsFor(board: readonly Cell[], player: Player): number[][] {
  return MILLS.filter((line) => line.every((point) => board[point] === player)).map((line) => [
    ...line,
  ]);
}

export function millPointSet(board: readonly Cell[], player: Player): Set<number> {
  const points = new Set<number>();
  for (const line of MILLS) {
    if (line.every((point) => board[point] === player)) {
      for (const point of line) points.add(point);
    }
  }
  return points;
}

/**
 * Men that may be removed. Men in a mill are protected unless every man the
 * opponent still has on the board is inside a mill.
 */
export function capturablePoints(board: readonly Cell[], mark: Player): number[] {
  const own: number[] = [];
  for (let point = 0; point < POINTS; point += 1) {
    if (board[point] === mark) own.push(point);
  }
  if (own.length === 0) return [];
  const inMill = millPointSet(board, mark);
  if (own.every((point) => inMill.has(point))) return own;
  return own.filter((point) => !inMill.has(point));
}

export function hasAnyStep(board: readonly Cell[], player: Player): boolean {
  for (let point = 0; point < POINTS; point += 1) {
    if (board[point] !== player) continue;
    for (const next of ADJACENCY[point]) {
      if (board[next] === null) return true;
    }
  }
  return false;
}

export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  if (state.pendingCapture) {
    return capturablePoints(state.board, state.pendingCapture).map((point) => ({
      type: 'capture' as const,
      point,
    }));
  }
  if (state.phase === 'placing') {
    return emptyPoints(state.board).map((point) => ({ type: 'place' as const, point }));
  }
  if (state.phase === 'moving') {
    const moves: Move[] = [];
    for (let point = 0; point < POINTS; point += 1) {
      if (state.board[point] !== state.turn) continue;
      for (const to of ADJACENCY[point]) {
        if (state.board[to] === null) moves.push({ type: 'move', from: point, to });
      }
    }
    return moves;
  }
  return [];
}

function fail(state: GameState, error: MoveError): MoveResult {
  return { ok: false, state, error };
}

function finished(
  base: GameState,
  mover: Player,
  reason: Exclude<WinReason, null>,
): GameState {
  return {
    ...base,
    status: 'won',
    winner: mover,
    winReason: reason,
    phase: 'ended',
    pendingCapture: null,
    turn: mover,
  };
}

function drawn(base: GameState): GameState {
  return {
    ...base,
    status: 'draw',
    winner: null,
    winReason: null,
    phase: 'ended',
    pendingCapture: null,
  };
}

/**
 * Switch the turn, advance the phase, then test every end condition. `mover`
 * is the player who just completed the action that led here.
 */
function finishTurn(state: GameState, mover: Player): GameState {
  let next: GameState = { ...state, turn: other(mover), pendingCapture: null };
  if (next.phase === 'placing' && next.hand.W === 0 && next.hand.B === 0) {
    next.phase = 'moving';
  }

  const toMove = next.turn;
  if (next.hand[toMove] === 0 && next.onBoard[toMove] < 3) {
    return finished(next, mover, 'two-men');
  }
  if (next.phase === 'moving' && !hasAnyStep(next.board, toMove)) {
    return finished(next, mover, 'blocked');
  }
  if (next.quiet >= QUIET_LIMIT) return drawn(next);
  return next;
}

function withCapturePending(
  state: GameState,
  mover: Player,
  line: readonly number[],
): GameState {
  return {
    ...state,
    pendingCapture: other(mover),
    last: state.last ? { ...state.last, mill: [...line] } : state.last,
  };
}

export function apply(state: GameState, move: Move): MoveResult {
  if (state.status !== 'playing') return fail(state, 'game-over');
  if (!move || typeof move !== 'object' || typeof move.type !== 'string') {
    return fail(state, 'bad-move');
  }

  if (state.pendingCapture) {
    if (move.type !== 'capture') return fail(state, 'capture-required');
    if (!isPoint(move.point)) return fail(state, 'bad-point');
    if (state.board[move.point] !== state.pendingCapture) return fail(state, 'not-capturable');
    if (!capturablePoints(state.board, state.pendingCapture).includes(move.point)) {
      return fail(state, 'protected');
    }
    const board = state.board.slice();
    board[move.point] = null;
    const mark = state.pendingCapture;
    const next: GameState = {
      ...state,
      board,
      onBoard: { ...state.onBoard, [mark]: state.onBoard[mark] - 1 },
      pendingCapture: null,
      quiet: 0,
      moveCount: state.moveCount + 1,
      last: {
        by: state.turn,
        from: null,
        to: move.point,
        capture: true,
        mill: null,
      },
    };
    if (next.hand[mark] === 0 && next.onBoard[mark] < 3) {
      return { ok: true, state: finished(next, state.turn, 'two-men') };
    }
    return { ok: true, state: finishTurn(next, state.turn) };
  }

  if (move.type === 'capture') return fail(state, 'no-mill');

  if (move.type === 'place') {
    if (state.phase !== 'placing') return fail(state, 'wrong-phase');
    if (!isPoint(move.point)) return fail(state, 'bad-point');
    if (state.hand[state.turn] <= 0) return fail(state, 'wrong-phase');
    if (state.board[move.point] !== null) return fail(state, 'occupied');
    const board = state.board.slice();
    board[move.point] = state.turn;
    const line = millAt(board, state.turn, move.point);
    const next: GameState = {
      ...state,
      board,
      hand: { ...state.hand, [state.turn]: state.hand[state.turn] - 1 },
      onBoard: { ...state.onBoard, [state.turn]: state.onBoard[state.turn] + 1 },
      quiet: state.quiet + 1,
      moveCount: state.moveCount + 1,
      last: {
        by: state.turn,
        from: null,
        to: move.point,
        capture: false,
        mill: line ? [...line] : null,
      },
    };
    if (line && state.onBoard[other(state.turn)] > 0) {
      return { ok: true, state: withCapturePending(next, state.turn, line) };
    }
    return { ok: true, state: finishTurn(next, state.turn) };
  }

  if (move.type === 'move') {
    if (state.phase !== 'moving') return fail(state, 'wrong-phase');
    if (!isPoint(move.from) || !isPoint(move.to)) return fail(state, 'bad-point');
    if (state.board[move.from] !== state.turn) return fail(state, 'not-own');
    if (state.board[move.to] !== null) return fail(state, 'occupied');
    if (!isAdjacent(move.from, move.to)) return fail(state, 'not-adjacent');
    const board = state.board.slice();
    board[move.from] = null;
    board[move.to] = state.turn;
    const line = millAt(board, state.turn, move.to);
    const next: GameState = {
      ...state,
      board,
      quiet: state.quiet + 1,
      moveCount: state.moveCount + 1,
      last: {
        by: state.turn,
        from: move.from,
        to: move.to,
        capture: false,
        mill: line ? [...line] : null,
      },
    };
    if (line && state.onBoard[other(state.turn)] > 0) {
      return { ok: true, state: withCapturePending(next, state.turn, line) };
    }
    return { ok: true, state: finishTurn(next, state.turn) };
  }

  return fail(state, 'bad-move');
}

export function applySeat(state: GameState, seat: number, move: Move): MoveResult {
  if (seat !== 0 && seat !== 1) return fail(state, 'bad-seat');
  const mark: Player = seat === 0 ? 'W' : 'B';
  if (state.turn !== mark) return fail(state, 'wrong-turn');
  return apply(state, move);
}

export function view(state: GameState, seat: number): SeatView {
  const mark: Player = seat === 0 ? 'W' : 'B';
  const canMove = state.status === 'playing' && state.turn === mark;
  return {
    board: state.board.slice(),
    turn: state.turn,
    phase: state.phase,
    status: state.status,
    winner: state.winner,
    winReason: state.winReason,
    pendingCapture: state.pendingCapture,
    hand: { ...state.hand },
    onBoard: { ...state.onBoard },
    quiet: state.quiet,
    moveCount: state.moveCount,
    last: state.last,
    first: state.first,
    mark,
    seat,
    canMove,
    legal: canMove ? legalMoves(state) : [],
  };
}
