/**
 * International Draughts (10×10) engine.
 *
 * Pure rules: no DOM, no network, no clock and no Math.random. The caller
 * supplies all randomness at the AI layer.
 *
 * Board: 10×10, index = row * 10 + col, row 0 at the top. Only dark squares
 * ((row + col) odd) are used. White men start on rows 6–9 and move up; black
 * men start on rows 0–3 and move down. White moves first.
 *
 * International rules implemented here:
 * - men move one square diagonally forward but capture in all four directions;
 * - captures are mandatory and the longest capture sequence must be played;
 * - captured pieces stay on the board until the whole sequence ends, so they
 *   block later jumps and cannot be captured twice;
 * - a man that ends a move on the far row is crowned; passing through the far
 *   row during a capture does not crown it;
 * - kings fly any distance, capture a single piece from a distance and may
 *   land on any empty square beyond it, turning corners between jumps;
 * - a side with no pieces or no legal move loses;
 * - 25 moves each without a capture or a man move is a draw (the family
 *   convention; threefold repetition and a 500-ply ceiling are also enforced).
 */

export const BOARD_SIZE = 10;
export const SQUARES = BOARD_SIZE * BOARD_SIZE;
/** 25 moves by each side without a capture or a man move. */
export const QUIET_LIMIT = 50;
export const MAX_PLIES = 500;

export type Side = 'W' | 'B';
/** Lowercase is a man, uppercase is a king. */
export type Piece = 'w' | 'b' | 'W' | 'B';
export type Square = number;
export type GameStatus = 'playing' | 'won' | 'draw';
export type WinReason = 'all-captured' | 'blocked';
export type DrawReason = 'quiet' | 'repetition' | 'limit';

export interface Move {
  from: Square;
  to: Square;
  /** Landing squares including `from` as the first element. */
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
  /** Plies without a capture or a man move (used for the 25-move draw). */
  quietPlies: number;
  lastMove: Move | null;
  first: Side;
  /** Position key -> times seen, for threefold repetition. */
  repetitions: Record<string, number>;
}

export type MoveError =
  | 'game-over'
  | 'bad-from'
  | 'wrong-piece'
  | 'wrong-turn'
  | 'must-capture'
  | 'incomplete'
  | 'illegal';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  board: (Piece | null)[];
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  winReason: WinReason | null;
  drawReason: DrawReason | null;
  plies: number;
  quietPlies: number;
  lastMove: Move | null;
  legalMoves: Move[];
  canMove: boolean;
  seat: number;
  side: Side;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export const otherSide = (side: Side): Side => (side === 'W' ? 'B' : 'W');

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

export function isDarkSquare(square: Square): boolean {
  return isDark(rowOf(square), colOf(square));
}

export function sideOf(piece: Piece): Side {
  return piece === 'w' || piece === 'W' ? 'W' : 'B';
}

export function isKing(piece: Piece): boolean {
  return piece === 'W' || piece === 'B';
}

function kingOf(piece: Piece): Piece {
  if (piece === 'w') return 'W';
  if (piece === 'b') return 'B';
  return piece;
}

function promotionRow(side: Side): number {
  return side === 'W' ? 0 : BOARD_SIZE - 1;
}

export function emptyBoard(): (Piece | null)[] {
  return Array<Piece | null>(SQUARES).fill(null);
}

export function setup(first: Side = 'W'): GameState {
  const board = emptyBoard();
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (isDark(row, col)) board[indexOf(row, col)] = 'b';
    }
  }
  for (let row = 6; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (isDark(row, col)) board[indexOf(row, col)] = 'w';
    }
  }
  return position(board, first, { first });
}

export interface PositionOptions {
  plies?: number;
  quietPlies?: number;
  lastMove?: Move | null;
  first?: Side;
  repetitions?: Record<string, number>;
}

/**
 * Build a position for tests and puzzles. The caller owns the board array; it
 * is copied. Terminal status is deliberately left as `playing`; `apply` and
 * `advance` settle it after the next move.
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

export function positionKey(state: Pick<GameState, 'board' | 'turn'>): string {
  return `${state.board.map((piece) => piece ?? '.').join('')}:${state.turn}`;
}

function simpleMovesFrom(
  board: (Piece | null)[],
  from: Square,
  piece: Piece,
): Move[] {
  const row = rowOf(from);
  const col = colOf(from);
  const side = sideOf(piece);
  const moves: Move[] = [];
  if (isKing(piece)) {
    for (const [dr, dc] of DIRECTIONS) {
      let nextRow = row + dr;
      let nextCol = col + dc;
      while (inBounds(nextRow, nextCol)) {
        const to = indexOf(nextRow, nextCol);
        if (board[to]) break;
        moves.push({
          from,
          to,
          path: [from, to],
          captures: [],
          promote: false,
        });
        nextRow += dr;
        nextCol += dc;
      }
    }
    return moves;
  }
  const dr = side === 'W' ? -1 : 1;
  for (const dc of [-1, 1]) {
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
      promote: nextRow === promotionRow(side),
    });
  }
  return moves;
}

interface JumpOption {
  middle: Square;
  landing: Square;
}

function jumpOptions(
  board: (Piece | null)[],
  at: Square,
  piece: Piece,
  captured: ReadonlySet<Square>,
): JumpOption[] {
  const row = rowOf(at);
  const col = colOf(at);
  const side = sideOf(piece);
  const options: JumpOption[] = [];
  if (isKing(piece)) {
    for (const [dr, dc] of DIRECTIONS) {
      let midRow = row + dr;
      let midCol = col + dc;
      while (inBounds(midRow, midCol) && board[indexOf(midRow, midCol)] === null) {
        midRow += dr;
        midCol += dc;
      }
      if (!inBounds(midRow, midCol)) continue;
      const middle = indexOf(midRow, midCol);
      const target = board[middle];
      if (!target || sideOf(target) === side || captured.has(middle)) continue;
      let landRow = midRow + dr;
      let landCol = midCol + dc;
      while (inBounds(landRow, landCol) && board[indexOf(landRow, landCol)] === null) {
        options.push({ middle, landing: indexOf(landRow, landCol) });
        landRow += dr;
        landCol += dc;
      }
    }
    return options;
  }
  for (const [dr, dc] of DIRECTIONS) {
    const midRow = row + dr;
    const midCol = col + dc;
    const landRow = row + dr * 2;
    const landCol = col + dc * 2;
    if (!inBounds(midRow, midCol) || !inBounds(landRow, landCol)) continue;
    const middle = indexOf(midRow, midCol);
    const landing = indexOf(landRow, landCol);
    const target = board[middle];
    if (!target || sideOf(target) === side || captured.has(middle)) continue;
    if (board[landing] !== null || captured.has(landing)) continue;
    options.push({ middle, landing });
  }
  return options;
}

/** True if any piece of `side` has at least one jump available. */
function hasAnyJump(board: (Piece | null)[], side: Side): boolean {
  const captured = new Set<Square>();
  for (let square = 0; square < SQUARES; square += 1) {
    const piece = board[square];
    if (!piece || sideOf(piece) !== side) continue;
    if (jumpOptions(board, square, piece, captured).length > 0) return true;
  }
  return false;
}

function hasAnyMove(state: GameState): boolean {
  if (hasAnyJump(state.board, state.turn)) return true;
  for (let square = 0; square < SQUARES; square += 1) {
    const piece = state.board[square];
    if (!piece || sideOf(piece) !== state.turn) continue;
    if (simpleMovesFrom(state.board, square, piece).length > 0) return true;
  }
  return false;
}

function captureSequencesFrom(
  board: (Piece | null)[],
  start: Square,
  piece: Piece,
): Move[] {
  const side = sideOf(piece);
  const walk = (
    at: Square,
    path: Square[],
    captures: Square[],
    captured: ReadonlySet<Square>,
  ): Move[] => {
    const options = jumpOptions(board, at, piece, captured);
    if (options.length === 0) {
      if (captures.length === 0) return [];
      const to = path[path.length - 1];
      return [
        {
          from: start,
          to,
          path,
          captures,
          promote: !isKing(piece) && rowOf(to) === promotionRow(side),
        },
      ];
    }
    const moves: Move[] = [];
    for (const option of options) {
      const nextCaptured = new Set(captured);
      nextCaptured.add(option.middle);
      moves.push(
        ...walk(
          option.landing,
          [...path, option.landing],
          [...captures, option.middle],
          nextCaptured,
        ),
      );
    }
    return moves;
  };
  return walk(start, [start], [], new Set<Square>());
}

function compareMoves(a: Move, b: Move): number {
  if (b.captures.length !== a.captures.length) {
    return b.captures.length - a.captures.length;
  }
  if (a.promote !== b.promote) return a.promote ? -1 : 1;
  if (a.from !== b.from) return a.from - b.from;
  const length = Math.min(a.path.length, b.path.length);
  for (let index = 0; index < length; index += 1) {
    if (a.path[index] !== b.path[index]) return a.path[index] - b.path[index];
  }
  return a.path.length - b.path.length;
}

/**
 * Legal moves. If any capture exists, only capture moves are returned and only
 * the sequences capturing the maximum number of pieces survive. Equal-length
 * maximum sequences are all legal; the player chooses between them.
 */
export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  const captures: Move[] = [];
  const simple: Move[] = [];
  for (let square = 0; square < SQUARES; square += 1) {
    const piece = state.board[square];
    if (!piece || sideOf(piece) !== state.turn) continue;
    const jumps = captureSequencesFrom(state.board, square, piece);
    if (jumps.length > 0) captures.push(...jumps);
    else simple.push(...simpleMovesFrom(state.board, square, piece));
  }
  if (captures.length > 0) {
    const longest = captures.reduce(
      (best, move) => Math.max(best, move.captures.length),
      0,
    );
    return captures
      .filter((move) => move.captures.length === longest)
      .sort(compareMoves);
  }
  return simple.sort(compareMoves);
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
    move.path[0] === move.from &&
    move.path[move.path.length - 1] === move.to &&
    Array.isArray(move.captures) &&
    move.captures.every((square) => Number.isInteger(square))
  );
}

export function sameMove(a: Move, b: Move): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.promote === b.promote &&
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

/**
 * Apply a move that is already known to be legal. This is the hot path used by
 * the AI search. Callers outside the engine should use `apply` / `applyPath`,
 * which validate against `legalMoves`.
 */
export function advance(state: GameState, move: Move): GameState {
  const piece = state.board[move.from];
  if (!piece) throw new Error('advance called with an empty from square');
  const board = state.board.slice();
  board[move.from] = null;
  for (const captured of move.captures) board[captured] = null;
  board[move.to] =
    move.promote && !isKing(piece) ? kingOf(piece) : piece;

  const nextTurn = otherSide(state.turn);
  const next: GameState = {
    ...state,
    board,
    turn: nextTurn,
    plies: state.plies + 1,
    quietPlies:
      move.captures.length > 0 || !isKing(piece) ? 0 : state.quietPlies + 1,
    lastMove: cloneMove(move),
    repetitions: { ...state.repetitions },
  };

  const key = positionKey(next);
  next.repetitions[key] = (next.repetitions[key] ?? 0) + 1;

  if (!board.some((cell) => cell !== null && sideOf(cell) === nextTurn)) {
    next.status = 'won';
    next.winner = state.turn;
    next.winReason = 'all-captured';
    return next;
  }

  if (!hasAnyMove(next)) {
    next.status = 'won';
    next.winner = state.turn;
    next.winReason = 'blocked';
    return next;
  }

  if (next.quietPlies >= QUIET_LIMIT) {
    next.status = 'draw';
    next.drawReason = 'quiet';
  } else if (next.repetitions[key] >= 3) {
    next.status = 'draw';
    next.drawReason = 'repetition';
  } else if (next.plies >= MAX_PLIES) {
    next.status = 'draw';
    next.drawReason = 'limit';
  }

  return next;
}

export function apply(state: GameState, move: Move): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!isMove(move)) return { ok: false, state, error: 'illegal' };
  const found = legalMoves(state).find((candidate) => sameMove(candidate, move));
  if (!found) return { ok: false, state, error: 'illegal' };
  return { ok: true, state: advance(state, found) };
}

/** Apply a move by its from square and landing squares (without the from). */
export function applyPath(
  state: GameState,
  from: Square,
  path: readonly Square[],
): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(from) || from < 0 || from >= SQUARES) {
    return { ok: false, state, error: 'bad-from' };
  }
  const piece = state.board[from];
  if (!piece || sideOf(piece) !== state.turn) {
    return { ok: false, state, error: 'wrong-piece' };
  }
  if (!path.every((square) => Number.isInteger(square) && square >= 0 && square < SQUARES)) {
    return { ok: false, state, error: 'illegal' };
  }
  const expected = [from, ...path];
  const legal = legalMoves(state);
  const found = legal.find((move) => samePath(move.path, expected));
  if (found) return { ok: true, state: advance(state, found) };

  const fromMoves = legal.filter((move) => move.from === from);
  if (
    fromMoves.some(
      (move) =>
        move.path.length > expected.length &&
        samePath(move.path.slice(0, expected.length), expected),
    )
  ) {
    return { ok: false, state, error: 'incomplete' };
  }
  if (
    fromMoves.length > 0 &&
    fromMoves[0].captures.length > 0 &&
    path.length === 1
  ) {
    return { ok: false, state, error: 'must-capture' };
  }
  return { ok: false, state, error: 'illegal' };
}

export function applySeat(
  state: GameState,
  seat: number,
  from: Square,
  path: readonly Square[],
): MoveResult {
  if (seat !== 0 && seat !== 1) return { ok: false, state, error: 'wrong-turn' };
  const side: Side = seat === 0 ? 'W' : 'B';
  if (state.turn !== side) return { ok: false, state, error: 'wrong-turn' };
  return applyPath(state, from, path);
}

export function view(state: GameState, seat: number): SeatView {
  const side: Side = seat === 0 ? 'W' : 'B';
  const canMove = state.status === 'playing' && state.turn === side;
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    winReason: state.winReason,
    drawReason: state.drawReason,
    plies: state.plies,
    quietPlies: state.quietPlies,
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

export function countKings(board: (Piece | null)[], side: Side): number {
  return board.reduce(
    (total, piece) =>
      total + (piece && sideOf(piece) === side && isKing(piece) ? 1 : 0),
    0,
  );
}
