/**
 * English draughts (American checkers) engine.
 *
 * Pure: no DOM, no clock, no network and no Math.random. The caller supplies
 * the first player and all randomness lives in the AI layer.
 *
 * Board: 8×8, dark squares only, index = row * 8 + col with row 0 at the top.
 * Red men start on rows 5–7 and move up; white men start on rows 0–2 and move
 * down. Red moves first (the family-friendly convention documented in
 * docs/limitations.md).
 */

export type Side = 'red' | 'white';
export type Piece = 'r' | 'w' | 'R' | 'W';
export type Square = number;
export type GameStatus = 'playing' | 'won' | 'draw';
export type WinReason = 'all-captured' | 'blocked';
export type DrawReason = 'forty-move' | 'repetition' | 'limit';

export interface Move {
  from: Square;
  to: Square;
  /** Every landing square, starting with `from`. */
  path: Square[];
  /** Captured squares in jump order. */
  captures: Square[];
  promote: boolean;
}

export interface GameState {
  board: (Piece | null)[];
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  winReason: WinReason | null;
  drawReason: DrawReason | null;
  /** Plies played from the opening position. */
  plies: number;
  /** King-only plies without a capture; resets on a capture or a man move. */
  quietPlies: number;
  lastMove: Move | null;
  first: Side;
  /** Position key -> times seen, for threefold repetition. */
  repetitions: Record<string, number>;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: 'game-over' | 'illegal' | 'wrong-turn';
}

export interface SeatView {
  board: (Piece | null)[];
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  winReason: WinReason | null;
  drawReason: DrawReason | null;
  plies: number;
  lastMove: Move | null;
  legalMoves: Move[];
  canMove: boolean;
  seat: number;
  side: Side;
}

export const BOARD_SIZE = 8;
export const SQUARES = BOARD_SIZE * BOARD_SIZE;
export const QUIET_LIMIT = 80;
export const MAX_PLIES = 300;

export const opponent = (side: Side): Side => (side === 'red' ? 'white' : 'red');

export const rowOf = (square: Square): number => Math.floor(square / BOARD_SIZE);
export const colOf = (square: Square): number => square % BOARD_SIZE;
export const indexOf = (row: number, col: number): Square => row * BOARD_SIZE + col;

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/** Playable squares are the dark ones: (row + col) is odd. */
export function isDark(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

export function sideOf(piece: Piece): Side {
  return piece === 'r' || piece === 'R' ? 'red' : 'white';
}

export function isKing(piece: Piece): boolean {
  return piece === 'R' || piece === 'W';
}

function kingOf(piece: Piece): Piece {
  return piece === 'r' ? 'R' : piece === 'w' ? 'W' : piece;
}

function promotionRow(side: Side): number {
  return side === 'red' ? 0 : 7;
}

export function squareName(square: Square): string {
  return `${String.fromCharCode(97 + colOf(square))}${BOARD_SIZE - rowOf(square)}`;
}

export function parseSquare(name: string): Square | null {
  const match = /^([a-h])([1-8])$/.exec(name.trim().toLowerCase());
  if (!match) return null;
  const col = match[1].charCodeAt(0) - 97;
  const row = BOARD_SIZE - Number(match[2]);
  return indexOf(row, col);
}

export function moveName(move: Move): string {
  const separator = move.captures.length > 0 ? 'x' : '-';
  const body = [move.from, ...move.path.slice(1)].map(squareName).join(separator);
  return move.promote ? `${body}=K` : body;
}

const KING_DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function directionsFor(piece: Piece): readonly (readonly [number, number])[] {
  if (isKing(piece)) return KING_DIRECTIONS;
  const dr = piece === 'r' ? -1 : 1;
  return [
    [dr, -1],
    [dr, 1],
  ];
}

function simpleMovesFrom(board: (Piece | null)[], from: Square, piece: Piece): Move[] {
  const row = rowOf(from);
  const col = colOf(from);
  const side = sideOf(piece);
  const moves: Move[] = [];
  for (const [dr, dc] of directionsFor(piece)) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (!inBounds(nextRow, nextCol)) continue;
    const to = indexOf(nextRow, nextCol);
    if (board[to]) continue;
    moves.push({
      from,
      to,
      path: [from, to],
      captures: [],
      promote: !isKing(piece) && nextRow === promotionRow(side),
    });
  }
  return moves;
}

interface JumpOption {
  middle: Square;
  landing: Square;
}

function jumpOptions(board: (Piece | null)[], at: Square, piece: Piece): JumpOption[] {
  const row = rowOf(at);
  const col = colOf(at);
  const side = sideOf(piece);
  const options: JumpOption[] = [];
  for (const [dr, dc] of directionsFor(piece)) {
    const middleRow = row + dr;
    const middleCol = col + dc;
    const landingRow = row + dr * 2;
    const landingCol = col + dc * 2;
    if (!inBounds(landingRow, landingCol)) continue;
    const middle = indexOf(middleRow, middleCol);
    const landing = indexOf(landingRow, landingCol);
    const target = board[middle];
    if (!target || sideOf(target) === side || board[landing]) continue;
    options.push({ middle, landing });
  }
  return options;
}

/**
 * All complete capture sequences for one piece. A man that lands on the far
 * row is crowned immediately and the turn ends (English draughts rule).
 */
function captureSequencesFrom(
  board: (Piece | null)[],
  from: Square,
  piece: Piece,
): Move[] {
  const side = sideOf(piece);
  const start = from;

  const walk = (
    currentBoard: (Piece | null)[],
    at: Square,
    path: Square[],
    captures: Square[],
  ): Move[] => {
    const options = jumpOptions(currentBoard, at, piece);
    if (options.length === 0) {
      if (captures.length === 0) return [];
      return [{ from: start, to: at, path, captures, promote: false }];
    }
    const moves: Move[] = [];
    for (const option of options) {
      const nextBoard = currentBoard.slice();
      nextBoard[at] = null;
      nextBoard[option.middle] = null;
      const crowned =
        !isKing(piece) && rowOf(option.landing) === promotionRow(side);
      if (crowned) {
        moves.push({
          from: start,
          to: option.landing,
          path: [...path, option.landing],
          captures: [...captures, option.middle],
          promote: true,
        });
        continue;
      }
      nextBoard[option.landing] = piece;
      moves.push(
        ...walk(
          nextBoard,
          option.landing,
          [...path, option.landing],
          [...captures, option.middle],
        ),
      );
    }
    return moves;
  };

  return walk(board, from, [from], []);
}

function positionKey(state: Pick<GameState, 'board' | 'turn'>): string {
  return `${state.board.map((piece) => piece ?? '.').join('')}:${state.turn}`;
}

export function setup(first: Side = 'red'): GameState {
  const board = Array<Piece | null>(SQUARES).fill(null);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (isDark(row, col)) board[indexOf(row, col)] = 'w';
    }
  }
  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (isDark(row, col)) board[indexOf(row, col)] = 'r';
    }
  }
  const state: GameState = {
    board,
    turn: first,
    status: 'playing',
    winner: null,
    winReason: null,
    drawReason: null,
    plies: 0,
    quietPlies: 0,
    lastMove: null,
    first,
    repetitions: {},
  };
  state.repetitions[positionKey(state)] = 1;
  return state;
}

export interface PositionOptions {
  plies?: number;
  quietPlies?: number;
  lastMove?: Move | null;
  first?: Side;
  repetitions?: Record<string, number>;
}

/**
 * Build a position for tests and puzzles. The board must contain 64 cells.
 * Terminal status is deliberately left as `playing`; `apply` settles it.
 */
export function position(
  board: (Piece | null)[],
  turn: Side,
  options: PositionOptions = {},
): GameState {
  if (board.length !== SQUARES) {
    throw new Error(`A draughts board needs ${SQUARES} cells`);
  }
  const state: GameState = {
    board: board.slice(),
    turn,
    status: 'playing',
    winner: null,
    winReason: null,
    drawReason: null,
    plies: options.plies ?? 0,
    quietPlies: options.quietPlies ?? 0,
    lastMove: options.lastMove ?? null,
    first: options.first ?? turn,
    repetitions: { ...(options.repetitions ?? {}) },
  };
  const key = positionKey(state);
  if (!state.repetitions[key]) state.repetitions[key] = 1;
  return state;
}

export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  const captures: Move[] = [];
  const simple: Move[] = [];
  for (let square = 0; square < SQUARES; square++) {
    const piece = state.board[square];
    if (!piece || sideOf(piece) !== state.turn) continue;
    const jumps = captureSequencesFrom(state.board, square, piece);
    if (jumps.length > 0) {
      captures.push(...jumps);
    } else {
      simple.push(...simpleMovesFrom(state.board, square, piece));
    }
  }
  return captures.length > 0 ? captures : simple;
}

export function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function isMove(value: unknown): value is Move {
  if (!value || typeof value !== 'object') return false;
  const move = value as Partial<Move>;
  return (
    Number.isInteger(move.from) &&
    Number.isInteger(move.to) &&
    typeof move.promote === 'boolean' &&
    Array.isArray(move.path) &&
    move.path.length >= 2 &&
    move.path.every((square) => Number.isInteger(square)) &&
    Array.isArray(move.captures) &&
    move.captures.every((square) => Number.isInteger(square))
  );
}

export function sameMove(a: Move, b: Move): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    samePath(a.path, b.path) &&
    samePath(a.captures, b.captures)
  );
}

export function cloneMove(move: Move | null): Move | null {
  if (!move) return null;
  return {
    ...move,
    path: move.path.slice(),
    captures: move.captures.slice(),
  };
}

export function apply(state: GameState, move: Move): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!isMove(move)) return { ok: false, state, error: 'illegal' };
  const legal = legalMoves(state);
  const found = legal.find((candidate) => sameMove(candidate, move));
  if (!found) return { ok: false, state, error: 'illegal' };

  const piece = state.board[found.from];
  if (!piece) return { ok: false, state, error: 'illegal' };

  const board = state.board.slice();
  board[found.from] = null;
  for (const captured of found.captures) board[captured] = null;
  board[found.to] = found.promote && !isKing(piece) ? kingOf(piece) : piece;

  const nextTurn = opponent(state.turn);
  const next: GameState = {
    ...state,
    board,
    turn: nextTurn,
    plies: state.plies + 1,
    quietPlies:
      found.captures.length > 0 || !isKing(piece) ? 0 : state.quietPlies + 1,
    lastMove: cloneMove(found),
    repetitions: { ...state.repetitions },
  };
  const key = positionKey(next);
  next.repetitions[key] = (next.repetitions[key] ?? 0) + 1;

  const hasPieces = board.some(
    (cell) => cell !== null && sideOf(cell) === nextTurn,
  );
  if (!hasPieces) {
    next.status = 'won';
    next.winner = state.turn;
    next.winReason = 'all-captured';
    return { ok: true, state: next };
  }

  const replies = legalMoves(next);
  if (replies.length === 0) {
    next.status = 'won';
    next.winner = state.turn;
    next.winReason = 'blocked';
    return { ok: true, state: next };
  }

  if (next.quietPlies >= QUIET_LIMIT) {
    next.status = 'draw';
    next.drawReason = 'forty-move';
  } else if (next.repetitions[key] >= 3) {
    next.status = 'draw';
    next.drawReason = 'repetition';
  } else if (next.plies >= MAX_PLIES) {
    next.status = 'draw';
    next.drawReason = 'limit';
  }

  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, move: Move): MoveResult {
  const side: Side = seat === 0 ? 'red' : seat === 1 ? 'white' : 'red';
  if (seat !== 0 && seat !== 1) return { ok: false, state, error: 'wrong-turn' };
  if (state.turn !== side) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, move);
}

export function view(state: GameState, seat: number): SeatView {
  const side: Side = seat === 0 ? 'red' : 'white';
  const canMove = state.status === 'playing' && state.turn === side;
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    winReason: state.winReason,
    drawReason: state.drawReason,
    plies: state.plies,
    lastMove: cloneMove(state.lastMove),
    legalMoves: canMove ? legalMoves(state) : [],
    canMove,
    seat,
    side,
  };
}

export function resultOf(state: GameState): Side | 'draw' | null {
  if (state.status === 'draw') return 'draw';
  if (state.status === 'won') return state.winner;
  return null;
}

export function countPieces(board: (Piece | null)[], side: Side): number {
  return board.reduce(
    (total, piece) => total + (piece && sideOf(piece) === side ? 1 : 0),
    0,
  );
}
