/**
 * Mini Chess — a pure, deterministic 5×6 chess variant.
 *
 * The board is five files (a–e) by six ranks (1–6). Row 0 is rank 6 (Black's
 * home rank); row 5 is rank 1 (White's home rank). White pawns move toward
 * row 0, Black pawns toward row 5.
 *
 * There is no DOM, clock, network or Math.random in this module. Every function
 * returns a new state; callers own time, sound and storage.
 */

export const FILES = 'abcde';
export const BOARD_FILES = 5;
export const BOARD_RANKS = 6;
export const SQUARE_COUNT = BOARD_FILES * BOARD_RANKS;

export type Color = 'w' | 'b';
export type PieceType = 'K' | 'R' | 'B' | 'N' | 'P';
export type Piece = `${Color}${PieceType}`;
export type Cell = Piece | null;
export type GameStatus = 'playing' | 'checkmate' | 'stalemate' | 'draw';
export type DrawReason = 'fifty-move' | 'insufficient-material' | null;

export interface LegalMove {
  from: number;
  to: number;
  color: Color;
  piece: PieceType;
  captured: PieceType | null;
  promotion: PieceType | null;
}

export interface Move extends LegalMove {
  check: boolean;
  checkmate: boolean;
  notation: string;
}

export interface GameState {
  board: Cell[];
  turn: Color;
  status: GameStatus;
  winner: Color | null;
  drawReason: DrawReason;
  moves: Move[];
  halfmove: number;
  fullmove: number;
}

export type MoveError =
  | 'game-over'
  | 'bad-square'
  | 'no-piece'
  | 'wrong-turn'
  | 'illegal'
  | 'bad-promotion'
  | 'bad-seat';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  board: Cell[];
  turn: Color;
  status: GameStatus;
  winner: Color | null;
  drawReason: DrawReason;
  moves: Move[];
  check: boolean;
  checkSquare: number | null;
  lastMove: Move | null;
  legal: LegalMove[];
  color: Color | null;
  seat: number;
  canMove: boolean;
  moveCount: number;
  captured: { w: PieceType[]; b: PieceType[] };
}

const BACK_RANK: readonly PieceType[] = ['R', 'N', 'B', 'K', 'R'];
const PROMOTIONS: readonly PieceType[] = ['R', 'B', 'N'];

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export function colorOf(piece: Piece): Color {
  return piece[0] as Color;
}

export function typeOf(piece: Piece): PieceType {
  return piece[1] as PieceType;
}

export function rowOf(index: number): number {
  return Math.floor(index / BOARD_FILES);
}

export function colOf(index: number): number {
  return index % BOARD_FILES;
}

export function onBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_RANKS && col >= 0 && col < BOARD_FILES;
}

export function indexOf(row: number, col: number): number {
  return row * BOARD_FILES + col;
}

export function squareName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= SQUARE_COUNT) return '?';
  return `${FILES[colOf(index)]}${BOARD_RANKS - rowOf(index)}`;
}

export function parseSquare(name: string): number {
  const match = /^([a-e])([1-6])$/i.exec(name.trim());
  if (!match) return -1;
  const col = FILES.indexOf(match[1].toLowerCase());
  const rank = Number(match[2]);
  return indexOf(BOARD_RANKS - rank, col);
}

function piece(color: Color, type: PieceType): Piece {
  return `${color}${type}`;
}

export function setup(): GameState {
  const board: Cell[] = Array<Cell>(SQUARE_COUNT).fill(null);
  for (let col = 0; col < BOARD_FILES; col += 1) {
    board[indexOf(0, col)] = piece('b', BACK_RANK[col]);
    board[indexOf(1, col)] = piece('b', 'P');
    board[indexOf(4, col)] = piece('w', 'P');
    board[indexOf(5, col)] = piece('w', BACK_RANK[col]);
  }
  return {
    board,
    turn: 'w',
    status: 'playing',
    winner: null,
    drawReason: null,
    moves: [],
    halfmove: 0,
    fullmove: 1,
  };
}

interface RawMove {
  from: number;
  to: number;
  promotion: PieceType | null;
}

const ROOK_DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const BISHOP_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const KNIGHT_STEPS: readonly (readonly [number, number])[] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const KING_STEPS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function targetAllowed(board: Cell[], from: number, to: number): boolean {
  const target = board[to];
  if (!target) return true;
  if (colorOf(target) === colorOf(board[from] as Piece)) return false;
  return typeOf(target) !== 'K';
}

function pseudoMoves(board: Cell[], from: number): RawMove[] {
  const source = board[from];
  if (!source) return [];
  const color = colorOf(source);
  const type = typeOf(source);
  const row = rowOf(from);
  const col = colOf(from);
  const out: RawMove[] = [];

  const push = (to: number, promotion: PieceType | null = null): void => {
    if (targetAllowed(board, from, to)) out.push({ from, to, promotion });
  };

  if (type === 'P') {
    const direction = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 4 : 1;
    const promotionRow = color === 'w' ? 0 : 5;
    const oneRow = row + direction;
    if (onBoard(oneRow, col)) {
      const one = indexOf(oneRow, col);
      if (!board[one]) {
        if (oneRow === promotionRow) {
          for (const promotion of PROMOTIONS) push(one, promotion);
        } else {
          push(one);
          if (row === startRow) {
            const twoRow = row + direction * 2;
            if (onBoard(twoRow, col)) {
              const two = indexOf(twoRow, col);
              if (!board[two]) push(two);
            }
          }
        }
      }
    }
    for (const dc of [-1, 1]) {
      const captureRow = row + direction;
      const captureCol = col + dc;
      if (!onBoard(captureRow, captureCol)) continue;
      const target = indexOf(captureRow, captureCol);
      if (!board[target]) continue;
      if (colorOf(board[target] as Piece) === color) continue;
      if (typeOf(board[target] as Piece) === 'K') continue;
      if (captureRow === promotionRow) {
        for (const promotion of PROMOTIONS) push(target, promotion);
      } else {
        push(target);
      }
    }
    return out;
  }

  if (type === 'N' || type === 'K') {
    const steps = type === 'N' ? KNIGHT_STEPS : KING_STEPS;
    for (const [dr, dc] of steps) {
      const targetRow = row + dr;
      const targetCol = col + dc;
      if (onBoard(targetRow, targetCol)) push(indexOf(targetRow, targetCol));
    }
    return out;
  }

  const dirs = type === 'R' ? ROOK_DIRS : BISHOP_DIRS;
  for (const [dr, dc] of dirs) {
    let targetRow = row + dr;
    let targetCol = col + dc;
    while (onBoard(targetRow, targetCol)) {
      const target = indexOf(targetRow, targetCol);
      if (!board[target]) {
        out.push({ from, to: target, promotion: null });
      } else {
        if (colorOf(board[target] as Piece) !== color) {
          if (typeOf(board[target] as Piece) !== 'K') push(target);
        }
        break;
      }
      targetRow += dr;
      targetCol += dc;
    }
  }
  return out;
}

function applyRaw(board: Cell[], move: RawMove): Cell[] {
  const next = board.slice();
  const source = next[move.from];
  if (!source) return next;
  next[move.from] = null;
  next[move.to] = move.promotion ? piece(colorOf(source), move.promotion) : source;
  return next;
}

export function isSquareAttacked(board: Cell[], index: number, by: Color): boolean {
  if (index < 0 || index >= SQUARE_COUNT) return false;
  const row = rowOf(index);
  const col = colOf(index);

  // Pawns attack diagonally forward. A White pawn one row below the target
  // attacks it, and vice versa.
  const pawnRow = by === 'w' ? row + 1 : row - 1;
  if (pawnRow >= 0 && pawnRow < BOARD_RANKS) {
    for (const dc of [-1, 1]) {
      const pawnCol = col + dc;
      if (pawnCol < 0 || pawnCol >= BOARD_FILES) continue;
      const candidate = board[indexOf(pawnRow, pawnCol)];
      if (candidate === piece(by, 'P')) return true;
    }
  }

  for (const [dr, dc] of KNIGHT_STEPS) {
    const targetRow = row + dr;
    const targetCol = col + dc;
    if (!onBoard(targetRow, targetCol)) continue;
    if (board[indexOf(targetRow, targetCol)] === piece(by, 'N')) return true;
  }

  for (const [dr, dc] of KING_STEPS) {
    const targetRow = row + dr;
    const targetCol = col + dc;
    if (!onBoard(targetRow, targetCol)) continue;
    if (board[indexOf(targetRow, targetCol)] === piece(by, 'K')) return true;
  }

  for (const [dr, dc] of ROOK_DIRS) {
    let targetRow = row + dr;
    let targetCol = col + dc;
    while (onBoard(targetRow, targetCol)) {
      const candidate = board[indexOf(targetRow, targetCol)];
      if (candidate) {
        if (colorOf(candidate) === by && typeOf(candidate) === 'R') return true;
        break;
      }
      targetRow += dr;
      targetCol += dc;
    }
  }

  for (const [dr, dc] of BISHOP_DIRS) {
    let targetRow = row + dr;
    let targetCol = col + dc;
    while (onBoard(targetRow, targetCol)) {
      const candidate = board[indexOf(targetRow, targetCol)];
      if (candidate) {
        if (colorOf(candidate) === by && typeOf(candidate) === 'B') return true;
        break;
      }
      targetRow += dr;
      targetCol += dc;
    }
  }

  return false;
}

export function findKing(board: Cell[], color: Color): number {
  for (let index = 0; index < SQUARE_COUNT; index += 1) {
    if (board[index] === piece(color, 'K')) return index;
  }
  return -1;
}

export function isInCheck(board: Cell[], color: Color): boolean {
  const king = findKing(board, color);
  if (king < 0) return false;
  return isSquareAttacked(board, king, opposite(color));
}

function isLegalSimulation(board: Cell[], raw: RawMove, color: Color): boolean {
  const next = applyRaw(board, raw);
  const king = findKing(next, color);
  if (king < 0) return false;
  return !isSquareAttacked(next, king, opposite(color));
}

function toLegal(board: Cell[], raw: RawMove): LegalMove {
  const source = board[raw.from] as Piece;
  const target = board[raw.to];
  return {
    from: raw.from,
    to: raw.to,
    color: colorOf(source),
    piece: typeOf(source),
    captured: target ? typeOf(target) : null,
    promotion: raw.promotion,
  };
}

export function legalMoves(state: GameState): LegalMove[] {
  if (state.status !== 'playing') return [];
  const out: LegalMove[] = [];
  for (let from = 0; from < SQUARE_COUNT; from += 1) {
    const source = state.board[from];
    if (!source || colorOf(source) !== state.turn) continue;
    for (const raw of pseudoMoves(state.board, from)) {
      if (isLegalSimulation(state.board, raw, state.turn)) {
        out.push(toLegal(state.board, raw));
      }
    }
  }
  return out;
}

export function movesFrom(state: GameState, from: number): LegalMove[] {
  return legalMoves(state).filter((move) => move.from === from);
}

function insufficientMaterial(board: Cell[]): boolean {
  const minors: { type: PieceType; squareColor: number }[] = [];
  for (let index = 0; index < SQUARE_COUNT; index += 1) {
    const square = board[index];
    if (!square) continue;
    const type = typeOf(square);
    if (type === 'P' || type === 'R') return false;
    if (type === 'K') continue;
    if (type === 'B') minors.push({ type, squareColor: (rowOf(index) + colOf(index)) % 2 });
    if (type === 'N') minors.push({ type, squareColor: -1 });
  }
  if (minors.length === 0) return true;
  if (minors.length === 1) return true;
  if (minors.length === 2) {
    const [a, b] = minors;
    if (a.type === 'B' && b.type === 'B' && a.squareColor === b.squareColor) return true;
  }
  return false;
}

function notationFor(boardBefore: Cell[], raw: RawMove, check: boolean, checkmate: boolean): string {
  const source = boardBefore[raw.from] as Piece;
  const type = typeOf(source);
  const target = boardBefore[raw.to];
  const capture = Boolean(target);
  const base = `${type === 'P' ? '' : type}${squareName(raw.from)}${capture ? '×' : '–'}${squareName(raw.to)}`;
  const promotion = raw.promotion ? `=${raw.promotion}` : '';
  return `${base}${promotion}${checkmate ? '#' : check ? '+' : ''}`;
}

function captureTray(moves: Move[]): { w: PieceType[]; b: PieceType[] } {
  const captured = { w: [] as PieceType[], b: [] as PieceType[] };
  for (const move of moves) {
    if (move.captured) captured[move.color].push(move.captured);
  }
  return captured;
}

export function apply(
  state: GameState,
  from: number,
  to: number,
  promotion?: PieceType,
): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(from) || from < 0 || from >= SQUARE_COUNT) {
    return { ok: false, state, error: 'bad-square' };
  }
  if (!Number.isInteger(to) || to < 0 || to >= SQUARE_COUNT) {
    return { ok: false, state, error: 'bad-square' };
  }
  const source = state.board[from];
  if (!source) return { ok: false, state, error: 'no-piece' };
  if (colorOf(source) !== state.turn) return { ok: false, state, error: 'wrong-turn' };

  const candidates = pseudoMoves(state.board, from).filter((move) => move.to === to);
  if (candidates.length === 0) return { ok: false, state, error: 'illegal' };
  if (promotion && !PROMOTIONS.includes(promotion)) {
    return { ok: false, state, error: 'bad-promotion' };
  }

  let raw: RawMove | undefined;
  if (candidates.length > 1) {
    const requested = promotion ?? 'R';
    raw = candidates.find((move) => move.promotion === requested);
  } else {
    raw = candidates[0];
    if (promotion && !raw.promotion) return { ok: false, state, error: 'bad-promotion' };
  }
  if (!raw) return { ok: false, state, error: 'illegal' };
  if (!isLegalSimulation(state.board, raw, state.turn)) {
    return { ok: false, state, error: 'illegal' };
  }

  const board = applyRaw(state.board, raw);
  const opponent = opposite(state.turn);
  const isCapture = Boolean(state.board[raw.to]);
  const halfmove = typeOf(source) === 'P' || isCapture ? 0 : state.halfmove + 1;
  const candidate: GameState = {
    board,
    turn: opponent,
    status: 'playing',
    winner: null,
    drawReason: null,
    moves: state.moves,
    halfmove,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
  };

  const replies = legalMoves(candidate);
  const check = isInCheck(board, opponent);
  let status: GameStatus = 'playing';
  let winner: Color | null = null;
  let drawReason: DrawReason = null;

  if (replies.length === 0) {
    if (check) {
      status = 'checkmate';
      winner = state.turn;
    } else {
      status = 'stalemate';
    }
  } else if (halfmove >= 100) {
    status = 'draw';
    drawReason = 'fifty-move';
  } else if (insufficientMaterial(board)) {
    status = 'draw';
    drawReason = 'insufficient-material';
  }

  const checkmate = status === 'checkmate';
  const move: Move = {
    ...toLegal(state.board, raw),
    check,
    checkmate,
    notation: notationFor(state.board, raw, check, checkmate),
  };

  return {
    ok: true,
    state: {
      ...candidate,
      status,
      winner,
      drawReason,
      moves: [...state.moves, move],
    },
  };
}

export function chooseMoveBySeat(
  state: GameState,
  seat: number,
  from: number,
  to: number,
  promotion?: PieceType,
): MoveResult {
  if (seat !== 0 && seat !== 1) return { ok: false, state, error: 'bad-seat' };
  const color: Color = seat === 0 ? 'w' : 'b';
  if (state.turn !== color) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, from, to, promotion);
}

export const applySeat = chooseMoveBySeat;

export function view(state: GameState, seat: number): SeatView {
  const color: Color | null = seat === 0 ? 'w' : seat === 1 ? 'b' : null;
  const canMove = color !== null && state.status === 'playing' && state.turn === color;
  const check = isInCheck(state.board, state.turn);
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    drawReason: state.drawReason,
    moves: state.moves.slice(),
    check,
    checkSquare: check ? findKing(state.board, state.turn) : null,
    lastMove: state.moves[state.moves.length - 1] ?? null,
    legal: canMove ? legalMoves(state) : [],
    color,
    seat,
    canMove,
    moveCount: state.moves.length,
    captured: captureTray(state.moves),
  };
}

export function resultText(state: GameState): 'white' | 'black' | 'draw' | null {
  if (state.status === 'checkmate') return state.winner === 'w' ? 'white' : 'black';
  if (state.status === 'draw' || state.status === 'stalemate') return 'draw';
  return null;
}

/** Build a position from compact FEN-like text: ranks a–e, pieces KQRBNP. */
export function fromFen(fen: string): GameState {
  const [placement, turnField = 'w', halfField = '0', fullField = '1'] = fen.trim().split(/\s+/);
  const rows = placement.split('/');
  if (rows.length !== BOARD_RANKS) throw new Error(`FEN needs ${BOARD_RANKS} ranks`);
  const board: Cell[] = Array<Cell>(SQUARE_COUNT).fill(null);
  for (let row = 0; row < BOARD_RANKS; row += 1) {
    let col = 0;
    for (const char of rows[row]) {
      if (/[1-5]/.test(char)) {
        col += Number(char);
      } else if (/[KQRBNPkqrbnp]/.test(char)) {
        if (col >= BOARD_FILES) throw new Error('FEN rank is too wide');
        const letter = char.toUpperCase();
        if (letter === 'Q') throw new Error('Mini Chess has no queens');
        const type = letter as PieceType;
        const color: Color = char === char.toUpperCase() ? 'w' : 'b';
        board[indexOf(row, col)] = piece(color, type);
        col += 1;
      } else {
        throw new Error(`Unexpected FEN character: ${char}`);
      }
    }
    if (col !== BOARD_FILES) throw new Error('FEN rank is not five files wide');
  }
  const turn: Color = turnField === 'b' ? 'b' : 'w';
  if (findKing(board, 'w') < 0 || findKing(board, 'b') < 0) {
    throw new Error('Both kings are required');
  }
  const state: GameState = {
    board,
    turn,
    status: 'playing',
    winner: null,
    drawReason: null,
    moves: [],
    halfmove: Number.isFinite(Number(halfField)) ? Number(halfField) : 0,
    fullmove: Number.isFinite(Number(fullField)) ? Number(fullField) : 1,
  };
  const replies = legalMoves(state);
  if (replies.length === 0) {
    if (isInCheck(board, turn)) {
      state.status = 'checkmate';
      state.winner = opposite(turn);
    } else {
      state.status = 'stalemate';
    }
  }
  return state;
}

export function toFen(state: GameState): string {
  const rows: string[] = [];
  for (let row = 0; row < BOARD_RANKS; row += 1) {
    let text = '';
    let empty = 0;
    for (let col = 0; col < BOARD_FILES; col += 1) {
      const square = state.board[indexOf(row, col)];
      if (!square) {
        empty += 1;
      } else {
        if (empty) {
          text += String(empty);
          empty = 0;
        }
        const letter = typeOf(square);
        text += colorOf(square) === 'w' ? letter : letter.toLowerCase();
      }
    }
    if (empty) text += String(empty);
    rows.push(text);
  }
  return `${rows.join('/')} ${state.turn} ${state.halfmove} ${state.fullmove}`;
}

export function pieceName(type: PieceType): string {
  switch (type) {
    case 'K':
      return 'king';
    case 'R':
      return 'rook';
    case 'B':
      return 'bishop';
    case 'N':
      return 'knight';
    default:
      return 'pawn';
  }
}
