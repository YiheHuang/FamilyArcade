/**
 * Jungle Chess / Dou Shou Qi — pure rules engine.
 *
 * Board: 7 columns × 9 rows, indexed row-major (row 0 is Blue's back row).
 *   · Den: centre of each back row, column 3.
 *   · Traps: two beside the den and one in front of it.
 *   · Rivers: rows 3–5, columns 1–2 and 4–5.
 *
 * No DOM, network, clock or randomness lives in this file.
 */

export type Side = 'X' | 'O';

export const ANIMALS = [
  'elephant',
  'lion',
  'tiger',
  'leopard',
  'wolf',
  'dog',
  'cat',
  'rat',
] as const;

export type Animal = (typeof ANIMALS)[number];

export interface Piece {
  side: Side;
  kind: Animal;
}

export type Cell = Piece | null;

export type GameStatus = 'playing' | 'won' | 'draw';
export type WinReason = 'den' | 'capture';
export type DrawReason = 'stalemate' | 'progress';

export interface GameState {
  board: Cell[];
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  /** Why the game ended; null while playing. */
  reason: WinReason | DrawReason | null;
  /** Encoded moves (from * 63 + to), oldest first. */
  moves: number[];
  first: Side;
  /** Half-moves since the last capture, used for the no-progress draw. */
  quiet: number;
}

export interface Move {
  from: number;
  to: number;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: 'game-over' | 'bad-move' | 'no-piece' | 'wrong-turn' | 'illegal';
}

export interface SeatView {
  board: Cell[];
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  reason: WinReason | DrawReason | null;
  side: Side;
  seat: number;
  canMove: boolean;
  moveCount: number;
  last: number | null;
  lastMove: Move | null;
  quiet: number;
}

export const COLS = 7;
export const ROWS = 9;
export const BOARD_SIZE = COLS * ROWS;
export const QUIET_LIMIT = 120;

export const RANKS: Record<Animal, number> = {
  rat: 1,
  cat: 2,
  dog: 3,
  wolf: 4,
  leopard: 5,
  tiger: 6,
  lion: 7,
  elephant: 8,
};

export const ANIMAL_ORDER: readonly Animal[] = [
  'elephant',
  'lion',
  'tiger',
  'leopard',
  'wolf',
  'dog',
  'cat',
  'rat',
];

const opposite = (side: Side): Side => (side === 'X' ? 'O' : 'X');

export const indexOf = (row: number, col: number): number => row * COLS + col;
export const rowOf = (index: number): number => Math.floor(index / COLS);
export const colOf = (index: number): number => index % COLS;

export const DENS: Readonly<Record<Side, number>> = {
  X: indexOf(8, 3),
  O: indexOf(0, 3),
};

export const TRAPS: Readonly<Record<Side, readonly number[]>> = {
  X: [indexOf(8, 2), indexOf(8, 4), indexOf(7, 3)],
  O: [indexOf(0, 2), indexOf(0, 4), indexOf(1, 3)],
};

const TRAP_OWNER = new Map<number, Side>();
for (const side of ['X', 'O'] as const) {
  for (const square of TRAPS[side]) TRAP_OWNER.set(square, side);
}

export function isWater(index: number): boolean {
  const row = rowOf(index);
  const col = colOf(index);
  return row >= 3 && row <= 5 && (col === 1 || col === 2 || col === 4 || col === 5);
}

export function trapOwner(index: number): Side | null {
  return TRAP_OWNER.get(index) ?? null;
}

export function isDen(index: number): boolean {
  return index === DENS.X || index === DENS.O;
}

export function ownDen(side: Side): number {
  return DENS[side];
}

export function enemyDen(side: Side): number {
  return DENS[opposite(side)];
}

export function sideForSeat(seat: number): Side | null {
  if (seat === 0) return 'X';
  if (seat === 1) return 'O';
  return null;
}

export function seatForSide(side: Side): number {
  return side === 'X' ? 0 : 1;
}

export function encodeMove(from: number, to: number): number {
  return from * BOARD_SIZE + to;
}

export function decodeMove(move: number): Move | null {
  if (!Number.isInteger(move) || move < 0 || move >= BOARD_SIZE * BOARD_SIZE) return null;
  const from = Math.floor(move / BOARD_SIZE);
  const to = move % BOARD_SIZE;
  if (from === to) return null;
  return { from, to };
}

const rowDistance = (a: number, b: number): number => Math.abs(rowOf(a) - rowOf(b));
const colDistance = (a: number, b: number): number => Math.abs(colOf(a) - colOf(b));
export const distance = (a: number, b: number): number => rowDistance(a, b) + colDistance(a, b);

function put(board: Cell[], row: number, col: number, side: Side, kind: Animal): void {
  board[indexOf(row, col)] = { side, kind };
}

/**
 * The classic starting layout, rotationally symmetric. X is the bottom (Red)
 * side and moves first in the family version used here.
 */
export function initialBoard(): Cell[] {
  const board: Cell[] = Array<Cell>(BOARD_SIZE).fill(null);

  // Blue / O — top.
  put(board, 0, 0, 'O', 'lion');
  put(board, 0, 6, 'O', 'tiger');
  put(board, 1, 1, 'O', 'dog');
  put(board, 1, 5, 'O', 'cat');
  put(board, 2, 0, 'O', 'rat');
  put(board, 2, 2, 'O', 'leopard');
  put(board, 2, 4, 'O', 'wolf');
  put(board, 2, 6, 'O', 'elephant');

  // Red / X — bottom (rotated 180°).
  put(board, 8, 0, 'X', 'tiger');
  put(board, 8, 6, 'X', 'lion');
  put(board, 7, 1, 'X', 'cat');
  put(board, 7, 5, 'X', 'dog');
  put(board, 6, 0, 'X', 'elephant');
  put(board, 6, 2, 'X', 'wolf');
  put(board, 6, 4, 'X', 'leopard');
  put(board, 6, 6, 'X', 'rat');

  return board;
}

export function setup(first: Side = 'X'): GameState {
  return {
    board: initialBoard(),
    turn: first,
    status: 'playing',
    winner: null,
    reason: null,
    moves: [],
    first,
    quiet: 0,
  };
}

export function pieceAt(state: GameState, index: number): Cell {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return null;
  return state.board[index];
}

export function effectiveRank(piece: Piece, index: number): number {
  const owner = trapOwner(index);
  if (owner && owner !== piece.side) return 0;
  return RANKS[piece.kind];
}

function anyPieceOnWater(board: Cell[], from: number, to: number): boolean {
  const step = from < to ? 1 : -1;
  if (rowOf(from) === rowOf(to)) {
    for (let col = colOf(from) + step; col !== colOf(to); col += step) {
      if (board[indexOf(rowOf(from), col)]) return true;
    }
    return false;
  }
  for (let row = rowOf(from) + step; row !== rowOf(to); row += step) {
    if (board[indexOf(row, colOf(from))]) return true;
  }
  return false;
}

/**
 * A blocked river jump is blocked by a rat of either colour in the water,
 * which is the only piece that can occupy a water square.
 */
function jumpBlocked(board: Cell[], from: number, to: number): boolean {
  return anyPieceOnWater(board, from, to);
}

export function canCapture(
  attacker: Piece,
  from: number,
  defender: Piece,
  to: number,
): boolean {
  if (attacker.side === defender.side) return false;

  const attackerWater = isWater(from);
  const defenderWater = isWater(to);
  if (attackerWater || defenderWater) {
    // Only a rat can be in water; a rat is safe from the bank and cannot
    // attack out of the water. Water rats may capture each other.
    return attacker.kind === 'rat' && defender.kind === 'rat' && attackerWater && defenderWater;
  }

  // The rat beats the elephant from land, never from water. The elephant
  // can never capture a rat.
  if (attacker.kind === 'rat' && defender.kind === 'elephant') return true;
  if (attacker.kind === 'elephant' && defender.kind === 'rat') return false;

  const attackRank = effectiveRank(attacker, from);
  const defendRank = effectiveRank(defender, to);
  if (attackRank === 0) return defendRank === 0;
  return attackRank >= defendRank;
}

const DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function inBoard(row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

/**
 * Generate every legal move for the side to move. Lions and tigers get their
 * river jumps here; all other movement is one orthogonal square.
 */
export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  return movesForSide(state, state.turn);
}

export function movesForSide(state: GameState, side: Side): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < BOARD_SIZE; from += 1) {
    const piece = state.board[from];
    if (!piece || piece.side !== side) continue;
    moves.push(...movesFrom(state, from));
  }
  return moves;
}

export function movesFrom(state: GameState, from: number): Move[] {
  if (state.status !== 'playing' || !Number.isInteger(from) || from < 0 || from >= BOARD_SIZE) {
    return [];
  }
  const piece = state.board[from];
  if (!piece || piece.side !== state.turn) return [];

  const moves: Move[] = [];
  const row = rowOf(from);
  const col = colOf(from);
  const own = piece.side;
  const ownDenSquare = ownDen(own);

  for (const [dr, dc] of DIRS) {
    const nr = row + dr;
    const nc = col + dc;
    if (!inBoard(nr, nc)) continue;
    const to = indexOf(nr, nc);
    if (to === ownDenSquare) continue;
    if (isWater(to) && piece.kind !== 'rat') continue;

    const target = state.board[to];
    if (!target) {
      moves.push({ from, to });
    } else if (canCapture(piece, from, target, to)) {
      moves.push({ from, to });
    }
  }

  if (piece.kind === 'lion' || piece.kind === 'tiger') {
    for (const [dr, dc] of DIRS) {
      const firstRow = row + dr;
      const firstCol = col + dc;
      if (!inBoard(firstRow, firstCol)) continue;
      const first = indexOf(firstRow, firstCol);
      if (!isWater(first)) continue;

      let nr = firstRow;
      let nc = firstCol;
      while (inBoard(nr, nc) && isWater(indexOf(nr, nc))) {
        nr += dr;
        nc += dc;
      }
      if (!inBoard(nr, nc)) continue;
      const to = indexOf(nr, nc);
      if (to === ownDenSquare) continue;
      if (jumpBlocked(state.board, from, to)) continue;
      const target = state.board[to];
      if (!target) {
        moves.push({ from, to });
      } else if (canCapture(piece, from, target, to)) {
        moves.push({ from, to });
      }
    }
  }

  return moves;
}

export function hasAnyMove(state: GameState, side: Side): boolean {
  for (let from = 0; from < BOARD_SIZE; from += 1) {
    const piece = state.board[from];
    if (!piece || piece.side !== side) continue;
    if (movesFromForSide(state, from, side).length > 0) return true;
  }
  return false;
}

function movesFromForSide(state: GameState, from: number, side: Side): Move[] {
  const piece = state.board[from];
  if (!piece || piece.side !== side) return [];
  return movesFrom({ ...state, turn: side }, from);
}

/**
 * Apply an encoded move or a {from,to} pair. The input state is never mutated.
 */
export function apply(state: GameState, move: number | Move): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };

  let from: number;
  let to: number;
  if (typeof move === 'number') {
    const decoded = decodeMove(move);
    if (!decoded) return { ok: false, state, error: 'bad-move' };
    from = decoded.from;
    to = decoded.to;
  } else {
    from = move.from;
    to = move.to;
  }

  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= BOARD_SIZE ||
    to < 0 ||
    to >= BOARD_SIZE ||
    from === to
  ) {
    return { ok: false, state, error: 'bad-move' };
  }

  const piece = state.board[from];
  if (!piece) return { ok: false, state, error: 'no-piece' };
  if (piece.side !== state.turn) return { ok: false, state, error: 'wrong-turn' };

  const legal = movesFrom(state, from).some((candidate) => candidate.to === to);
  if (!legal) return { ok: false, state, error: 'illegal' };

  const board = state.board.slice();
  const target = board[to];
  board[from] = null;
  board[to] = piece;

  const nextTurn = opposite(state.turn);
  const captured = target !== null;
  const quiet = captured ? 0 : state.quiet + 1;
  const base: GameState = {
    ...state,
    board,
    turn: nextTurn,
    moves: [...state.moves, encodeMove(from, to)],
    quiet,
    winner: null,
    reason: null,
  };

  if (to === enemyDen(state.turn)) {
    return {
      ok: true,
      state: { ...base, status: 'won', winner: state.turn, reason: 'den' },
    };
  }

  const opponentPieces = board.some((cell) => cell?.side === nextTurn);
  if (!opponentPieces) {
    return {
      ok: true,
      state: { ...base, status: 'won', winner: state.turn, reason: 'capture' },
    };
  }

  if (!hasAnyMove(base, nextTurn)) {
    return {
      ok: true,
      state: { ...base, status: 'draw', winner: null, reason: 'stalemate' },
    };
  }

  if (quiet >= QUIET_LIMIT) {
    return {
      ok: true,
      state: { ...base, status: 'draw', winner: null, reason: 'progress' },
    };
  }

  return { ok: true, state: base };
}

export function applySeat(state: GameState, seat: number, move: number | Move): MoveResult {
  const side = sideForSeat(seat);
  if (!side) return { ok: false, state, error: 'bad-move' };
  if (state.turn !== side) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, move);
}

export function view(state: GameState, seat: number): SeatView {
  const side = sideForSeat(seat);
  const last = state.moves.length > 0 ? state.moves[state.moves.length - 1] : null;
  return {
    board: state.board.map((cell) => (cell ? { ...cell } : null)),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    reason: state.reason,
    side: side ?? 'O',
    seat,
    canMove: state.status === 'playing' && side !== null && state.turn === side,
    moveCount: state.moves.length,
    last,
    lastMove: last === null ? null : decodeMove(last),
    quiet: state.quiet,
  };
}

export function countPieces(board: Cell[], side: Side): number {
  return board.reduce((total, cell) => total + (cell?.side === side ? 1 : 0), 0);
}

export function piecesOf(board: Cell[], side: Side): { kind: Animal; index: number }[] {
  const list: { kind: Animal; index: number }[] = [];
  for (let index = 0; index < board.length; index += 1) {
    const cell = board[index];
    if (cell?.side === side) list.push({ kind: cell.kind, index });
  }
  return list;
}

export { opposite };
