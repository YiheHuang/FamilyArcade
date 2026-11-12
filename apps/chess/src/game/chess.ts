/**
 * Full FIDE chess engine.
 *
 * The module is pure: no DOM, network, clock or Math.random. Squares are
 * indexed 0..63 from a8 (top-left, black's back rank) to h1 (bottom-right,
 * white's back rank), which matches the rendered board.
 */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Promotion = 'q' | 'r' | 'b' | 'n';
export type CastleSide = 'k' | 'q';
export type GameStatus = 'playing' | 'checkmate' | 'stalemate' | 'draw';
export type DrawReason = 'fifty' | 'threefold' | 'material' | 'stalemate';
export type MoveError = 'game-over' | 'illegal' | 'wrong-turn' | 'stale';

export interface Piece {
  color: Color;
  type: PieceType;
}

export type Cell = Piece | null;

export interface Move {
  from: number;
  to: number;
  promotion?: Promotion;
  castle?: CastleSide;
  enPassant?: boolean;
}

export interface MoveRecord extends Move {
  color: Color;
  piece: PieceType;
  captured: PieceType | null;
  san: string;
  check: boolean;
  mate: boolean;
}

export interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

export interface GameState {
  board: Cell[];
  turn: Color;
  castling: CastlingRights;
  ep: number | null;
  halfmove: number;
  fullmove: number;
  status: GameStatus;
  winner: Color | null;
  drawReason: DrawReason | null;
  inCheck: boolean;
  moves: MoveRecord[];
  positions: string[];
  lastMove: MoveRecord | null;
}

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
  drawReason: DrawReason | null;
  inCheck: boolean;
  seat: number;
  canMove: boolean;
  moveCount: number;
  moves: MoveRecord[];
  lastMove: MoveRecord | null;
  legal: Move[];
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const PROMOTIONS: Promotion[] = ['q', 'r', 'b', 'n'];

const HOME_KING: Record<Color, number> = { w: 60, b: 4 };
const PROMO_RANK: Record<Color, number> = { w: 0, b: 7 };
const START_RANK: Record<Color, number> = { w: 6, b: 1 };
const PAWN_DIR: Record<Color, number> = { w: -1, b: 1 };

export const PIECE_VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const KNIGHT_STEPS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const KING_STEPS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const BISHOP_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function other(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export function fileOf(square: number): number {
  return square & 7;
}

export function rankOf(square: number): number {
  return square >> 3;
}

function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function squareAt(file: number, rank: number): number {
  return rank * 8 + file;
}

export function squareName(square: number): string {
  if (!Number.isInteger(square) || square < 0 || square > 63) return '-';
  return `${FILES[fileOf(square)]}${8 - rankOf(square)}`;
}

export function parseSquare(name: string): number | null {
  const match = /^([a-h])([1-8])$/.exec(name.trim().toLowerCase());
  if (!match) return null;
  const file = FILES.indexOf(match[1] as (typeof FILES)[number]);
  return squareAt(file, 8 - Number(match[2]));
}

function pieceChar(piece: Piece): string {
  return piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
}

function charPiece(char: string): Piece {
  const lower = char.toLowerCase();
  if (!/^[pnbrqk]$/.test(lower)) throw new Error(`Unknown piece: ${char}`);
  return { color: char === lower ? 'b' : 'w', type: lower as PieceType };
}

export function kingSquare(board: Cell[], color: Color): number {
  for (let square = 0; square < 64; square += 1) {
    const piece = board[square];
    if (piece && piece.color === color && piece.type === 'k') return square;
  }
  return -1;
}

/** True when `by` attacks `target` on this board. */
export function isAttacked(board: Cell[], target: number, by: Color): boolean {
  if (target < 0) return false;
  const targetFile = fileOf(target);
  const targetRank = rankOf(target);

  // Pawns attack diagonally toward the target.
  const pawnRank = targetRank + (by === 'w' ? 1 : -1);
  for (const fileDelta of [-1, 1]) {
    const attackerFile = targetFile + fileDelta;
    if (!onBoard(attackerFile, pawnRank)) continue;
    const piece = board[squareAt(attackerFile, pawnRank)];
    if (piece && piece.color === by && piece.type === 'p') return true;
  }

  for (const [rankDelta, fileDelta] of KNIGHT_STEPS) {
    const rank = targetRank + rankDelta;
    const file = targetFile + fileDelta;
    if (!onBoard(file, rank)) continue;
    const piece = board[squareAt(file, rank)];
    if (piece && piece.color === by && piece.type === 'n') return true;
  }

  for (const [rankDelta, fileDelta] of KING_STEPS) {
    const rank = targetRank + rankDelta;
    const file = targetFile + fileDelta;
    if (!onBoard(file, rank)) continue;
    const piece = board[squareAt(file, rank)];
    if (piece && piece.color === by && piece.type === 'k') return true;
  }

  const slide = (directions: number[][], types: PieceType[]): boolean => {
    for (const [rankDelta, fileDelta] of directions) {
      let rank = targetRank + rankDelta;
      let file = targetFile + fileDelta;
      while (onBoard(file, rank)) {
        const piece = board[squareAt(file, rank)];
        if (piece) {
          if (piece.color === by && types.includes(piece.type)) return true;
          break;
        }
        rank += rankDelta;
        file += fileDelta;
      }
    }
    return false;
  };

  if (slide(BISHOP_DIRS, ['b', 'q'])) return true;
  if (slide(ROOK_DIRS, ['r', 'q'])) return true;
  return false;
}

export function setup(): GameState {
  return fromFen(START_FEN);
}

function emptyRights(): CastlingRights {
  return { wK: false, wQ: false, bK: false, bQ: false };
}

export function fromFen(fen: string): GameState {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) throw new Error('Invalid FEN');
  const [placement, turnToken, rightsToken, epToken, halfToken, fullToken] = fields;
  if (turnToken !== 'w' && turnToken !== 'b') throw new Error('Invalid FEN turn');

  const board: Cell[] = Array<Cell>(64).fill(null);
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('Invalid FEN board');
  rows.forEach((row, rank) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
      } else {
        if (file > 7) throw new Error('Invalid FEN row');
        board[squareAt(file, rank)] = charPiece(char);
        file += 1;
      }
    }
    if (file !== 8) throw new Error('Invalid FEN row width');
  });

  const castling = emptyRights();
  if (rightsToken.includes('K')) castling.wK = true;
  if (rightsToken.includes('Q')) castling.wQ = true;
  if (rightsToken.includes('k')) castling.bK = true;
  if (rightsToken.includes('q')) castling.bQ = true;

  const ep = epToken && epToken !== '-' ? parseSquare(epToken) : null;
  const turn: Color = turnToken;
  const state: GameState = {
    board,
    turn,
    castling,
    ep,
    halfmove: Number(halfToken ?? 0) || 0,
    fullmove: Number(fullToken ?? 1) || 1,
    status: 'playing',
    winner: null,
    drawReason: null,
    inCheck: false,
    moves: [],
    positions: [],
    lastMove: null,
  };
  state.inCheck = isAttacked(board, kingSquare(board, turn), other(turn));
  state.positions = [positionKey(state)];

  const replies = legalMoves(state);
  if (replies.length === 0) {
    if (state.inCheck) {
      state.status = 'checkmate';
      state.winner = other(turn);
    } else {
      state.status = 'stalemate';
      state.drawReason = 'stalemate';
    }
  }
  return state;
}

export function toFen(state: GameState): string {
  const rows: string[] = [];
  for (let rank = 0; rank < 8; rank += 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = state.board[squareAt(file, rank)];
      if (!piece) {
        empty += 1;
      } else {
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        row += pieceChar(piece);
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const rights =
    `${state.castling.wK ? 'K' : ''}${state.castling.wQ ? 'Q' : ''}` +
    `${state.castling.bK ? 'k' : ''}${state.castling.bQ ? 'q' : ''}`;
  return [
    rows.join('/'),
    state.turn,
    rights || '-',
    state.ep === null ? '-' : squareName(state.ep),
    state.halfmove,
    state.fullmove,
  ].join(' ');
}

function enPassantIsLegal(state: GameState): boolean {
  if (state.ep === null) return false;
  const target = state.ep;
  const color = state.turn;
  const pawnRank = rankOf(target) + (color === 'w' ? 1 : -1);
  for (const fileDelta of [-1, 1]) {
    const file = fileOf(target) + fileDelta;
    if (!onBoard(file, pawnRank)) continue;
    const from = squareAt(file, pawnRank);
    const piece = state.board[from];
    if (!piece || piece.color !== color || piece.type !== 'p') continue;
    if (!leavesKingInCheck(state, { from, to: target, enPassant: true })) return true;
  }
  return false;
}

export function positionKey(state: GameState): string {
  let boardKey = '';
  for (let square = 0; square < 64; square += 1) {
    const piece = state.board[square];
    boardKey += piece ? pieceChar(piece) : '.';
  }
  const rights =
    `${state.castling.wK ? 'K' : ''}${state.castling.wQ ? 'Q' : ''}` +
    `${state.castling.bK ? 'k' : ''}${state.castling.bQ ? 'q' : ''}`;
  const epKey = enPassantIsLegal(state) && state.ep !== null ? squareName(state.ep) : '-';
  return `${boardKey} ${state.turn} ${rights || '-'} ${epKey}`;
}

function pushPawnMove(moves: Move[], from: number, to: number, color: Color): void {
  if (rankOf(to) === PROMO_RANK[color]) {
    for (const promotion of PROMOTIONS) moves.push({ from, to, promotion });
  } else {
    moves.push({ from, to });
  }
}

function pseudoMoves(state: GameState, color: Color): Move[] {
  const moves: Move[] = [];
  const board = state.board;
  const enemy = other(color);

  for (let from = 0; from < 64; from += 1) {
    const piece = board[from];
    if (!piece || piece.color !== color) continue;
    const fromFile = fileOf(from);
    const fromRank = rankOf(from);

    if (piece.type === 'p') {
      const direction = PAWN_DIR[color];
      const oneRank = fromRank + direction;
      if (onBoard(fromFile, oneRank)) {
        const one = squareAt(fromFile, oneRank);
        if (!board[one]) {
          pushPawnMove(moves, from, one, color);
          if (fromRank === START_RANK[color]) {
            const twoRank = fromRank + direction * 2;
            const two = squareAt(fromFile, twoRank);
            if (!board[two]) moves.push({ from, to: two });
          }
        }
        for (const fileDelta of [-1, 1]) {
          const captureFile = fromFile + fileDelta;
          if (!onBoard(captureFile, oneRank)) continue;
          const to = squareAt(captureFile, oneRank);
          const target = board[to];
          if (target && target.color === enemy) {
            pushPawnMove(moves, from, to, color);
          } else if (
            state.ep === to &&
            !target &&
            board[to + (color === 'w' ? 8 : -8)]?.type === 'p' &&
            board[to + (color === 'w' ? 8 : -8)]?.color === enemy
          ) {
            moves.push({ from, to, enPassant: true });
          }
        }
      }
      continue;
    }

    if (piece.type === 'n' || piece.type === 'k') {
      const steps = piece.type === 'n' ? KNIGHT_STEPS : KING_STEPS;
      for (const [rankDelta, fileDelta] of steps) {
        const rank = fromRank + rankDelta;
        const file = fromFile + fileDelta;
        if (!onBoard(file, rank)) continue;
        const to = squareAt(file, rank);
        const target = board[to];
        if (!target || target.color === enemy) moves.push({ from, to });
      }
      if (piece.type === 'k' && from === HOME_KING[color]) {
        const kingSide = color === 'w' ? state.castling.wK : state.castling.bK;
        const queenSide = color === 'w' ? state.castling.wQ : state.castling.bQ;
        const rookKing = board[from + 3];
        const rookQueen = board[from - 4];
        if (
          kingSide &&
          rookKing?.type === 'r' &&
          rookKing.color === color &&
          !board[from + 1] &&
          !board[from + 2] &&
          !isAttacked(board, from, enemy) &&
          !isAttacked(board, from + 1, enemy) &&
          !isAttacked(board, from + 2, enemy)
        ) {
          moves.push({ from, to: from + 2, castle: 'k' });
        }
        if (
          queenSide &&
          rookQueen?.type === 'r' &&
          rookQueen.color === color &&
          !board[from - 1] &&
          !board[from - 2] &&
          !board[from - 3] &&
          !isAttacked(board, from, enemy) &&
          !isAttacked(board, from - 1, enemy) &&
          !isAttacked(board, from - 2, enemy)
        ) {
          moves.push({ from, to: from - 2, castle: 'q' });
        }
      }
      continue;
    }

    const directions =
      piece.type === 'b' ? BISHOP_DIRS : piece.type === 'r' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [rankDelta, fileDelta] of directions) {
      let rank = fromRank + rankDelta;
      let file = fromFile + fileDelta;
      while (onBoard(file, rank)) {
        const to = squareAt(file, rank);
        const target = board[to];
        if (!target) {
          moves.push({ from, to });
        } else {
          if (target.color === enemy) moves.push({ from, to });
          break;
        }
        rank += rankDelta;
        file += fileDelta;
      }
    }
  }
  return moves;
}

/** Place a move on a board (no rights, clocks or status). */
function placeMove(board: Cell[], move: Move): void {
  const piece = board[move.from];
  if (!piece) return;
  board[move.from] = null;
  if (move.enPassant) {
    board[move.to + (piece.color === 'w' ? 8 : -8)] = null;
  }
  board[move.to] = move.promotion ? { color: piece.color, type: move.promotion } : piece;
  if (move.castle) {
    const rookFrom = move.castle === 'k' ? move.from + 3 : move.from - 4;
    const rookTo = move.castle === 'k' ? move.from + 1 : move.from - 1;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }
}

function leavesKingInCheck(state: GameState, move: Move): boolean {
  const piece = state.board[move.from];
  if (!piece) return true;
  const board = state.board.slice();
  placeMove(board, move);
  return isAttacked(board, kingSquare(board, piece.color), other(piece.color));
}

export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  return pseudoMoves(state, state.turn).filter((move) => !leavesKingInCheck(state, move));
}

export function legalMovesFrom(state: GameState, from: number): Move[] {
  return legalMoves(state).filter((move) => move.from === from);
}

export function findMove(
  state: GameState,
  from: number,
  to: number,
  promotion?: Promotion,
): Move | null {
  return (
    legalMoves(state).find(
      (move) =>
        move.from === from &&
        move.to === to &&
        (promotion === undefined ? move.promotion === undefined : move.promotion === promotion),
    ) ?? null
  );
}

/**
 * Fast move application used by search and perft. It trusts `move` to be legal;
 * public callers should use `apply`, which validates the move and updates the
 * record, repetition history and terminal status.
 */
export function makeMove(state: GameState, move: Move): GameState {
  const piece = state.board[move.from];
  if (!piece) throw new Error('makeMove: empty from square');
  const board = state.board.slice();
  const captured = move.enPassant ? { color: other(piece.color), type: 'p' as PieceType } : board[move.to];
  placeMove(board, move);

  const castling: CastlingRights = { ...state.castling };
  if (piece.type === 'k') {
    if (piece.color === 'w') {
      castling.wK = false;
      castling.wQ = false;
    } else {
      castling.bK = false;
      castling.bQ = false;
    }
  }
  if (piece.type === 'r') {
    if (move.from === 56) castling.wQ = false;
    if (move.from === 63) castling.wK = false;
    if (move.from === 0) castling.bQ = false;
    if (move.from === 7) castling.bK = false;
  }
  if (move.to === 56) castling.wQ = false;
  if (move.to === 63) castling.wK = false;
  if (move.to === 0) castling.bQ = false;
  if (move.to === 7) castling.bK = false;

  const isCapture = Boolean(captured) || Boolean(move.enPassant);
  const ep =
    piece.type === 'p' && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2
      ? (move.from + move.to) / 2
      : null;
  const turn = other(piece.color);
  const next: GameState = {
    board,
    turn,
    castling,
    ep,
    halfmove: piece.type === 'p' || isCapture ? 0 : state.halfmove + 1,
    fullmove: state.fullmove + (piece.color === 'b' ? 1 : 0),
    status: 'playing',
    winner: null,
    drawReason: null,
    inCheck: false,
    moves: state.moves,
    positions: state.positions,
    lastMove: null,
  };
  next.inCheck = isAttacked(next.board, kingSquare(next.board, turn), other(turn));
  return next;
}

function sanFor(state: GameState, legal: Move[], move: Move, next: GameState): string {
  const piece = state.board[move.from];
  if (!piece) return '';
  if (move.castle) {
    const base = move.castle === 'k' ? 'O-O' : 'O-O-O';
    return `${base}${next.status === 'checkmate' ? '#' : next.inCheck ? '+' : ''}`;
  }
  const capture = Boolean(state.board[move.to]) || Boolean(move.enPassant);
  let text = '';
  if (piece.type === 'p') {
    if (capture) text += FILES[fileOf(move.from)];
  } else {
    text += piece.type.toUpperCase();
    const alternatives = legal.filter((candidate) => {
      if (candidate.from === move.from || candidate.to !== move.to) return false;
      const otherPiece = state.board[candidate.from];
      return otherPiece?.type === piece.type;
    });
    if (alternatives.length > 0) {
      const sameFile = alternatives.some((candidate) => fileOf(candidate.from) === fileOf(move.from));
      const sameRank = alternatives.some((candidate) => rankOf(candidate.from) === rankOf(move.from));
      if (!sameFile) text += FILES[fileOf(move.from)];
      else if (!sameRank) text += String(8 - rankOf(move.from));
      else text += `${FILES[fileOf(move.from)]}${8 - rankOf(move.from)}`;
    }
  }
  if (capture) text += 'x';
  text += squareName(move.to);
  if (move.promotion) text += `=${move.promotion.toUpperCase()}`;
  if (next.status === 'checkmate') text += '#';
  else if (next.inCheck) text += '+';
  return text;
}

function countKey(positions: string[], key: string): number {
  let count = 0;
  for (const item of positions) if (item === key) count += 1;
  return count;
}

export function insufficientMaterial(board: Cell[]): boolean {
  const knights: Record<Color, number> = { w: 0, b: 0 };
  const bishops: number[] = [];
  for (let square = 0; square < 64; square += 1) {
    const piece = board[square];
    if (!piece) continue;
    if (piece.type === 'p' || piece.type === 'r' || piece.type === 'q') return false;
    if (piece.type === 'n') knights[piece.color] += 1;
    if (piece.type === 'b') bishops.push(square);
  }
  if (bishops.length === 0) {
    // King and knight(s) against a bare king has no possible mate. A knight
    // on both sides can still help to mate, so it is not dead.
    if (knights.w === 0 && knights.b === 0) return true;
    if (knights.w > 0 && knights.b === 0) return knights.w <= 2;
    if (knights.b > 0 && knights.w === 0) return knights.b <= 2;
    return false;
  }
  if (knights.w > 0 || knights.b > 0) return false;
  if (bishops.length === 1) return true;
  const squareColor = new Set(bishops.map((square) => (fileOf(square) + rankOf(square)) % 2));
  return squareColor.size === 1;
}

export function apply(state: GameState, move: Move): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  const legal = legalMoves(state);
  const chosen = legal.find(
    (candidate) =>
      candidate.from === move.from &&
      candidate.to === move.to &&
      candidate.promotion === move.promotion,
  );
  if (!chosen) return { ok: false, state, error: 'illegal' };

  const piece = state.board[chosen.from];
  if (!piece) return { ok: false, state, error: 'illegal' };
  const capturedType: PieceType | null = chosen.enPassant
    ? 'p'
    : state.board[chosen.to]?.type ?? null;

  const next = makeMove(state, chosen);
  const key = positionKey(next);
  const positions = [...state.positions, key];
  const replies = legalMoves(next);

  let status: GameStatus = 'playing';
  let winner: Color | null = null;
  let drawReason: DrawReason | null = null;
  if (replies.length === 0) {
    if (next.inCheck) {
      status = 'checkmate';
      winner = piece.color;
    } else {
      status = 'stalemate';
      drawReason = 'stalemate';
    }
  } else if (next.halfmove >= 100) {
    status = 'draw';
    drawReason = 'fifty';
  } else if (countKey(positions, key) >= 3) {
    status = 'draw';
    drawReason = 'threefold';
  } else if (insufficientMaterial(next.board)) {
    status = 'draw';
    drawReason = 'material';
  }

  next.status = status;
  next.winner = winner;
  next.drawReason = drawReason;
  next.positions = positions;
  const record: MoveRecord = {
    ...chosen,
    color: piece.color,
    piece: piece.type,
    captured: capturedType,
    san: '',
    check: next.inCheck,
    mate: status === 'checkmate',
  };
  record.san = sanFor(state, legal, chosen, next);
  next.moves = [...state.moves, record];
  next.lastMove = record;
  return { ok: true, state: next };
}

export function applySeat(
  state: GameState,
  seat: number,
  move: Move,
  moveCount?: number,
): MoveResult {
  const color: Color = seat === 0 ? 'w' : 'b';
  if (seat !== 0 && seat !== 1) return { ok: false, state, error: 'wrong-turn' };
  if (state.turn !== color) return { ok: false, state, error: 'wrong-turn' };
  if (moveCount !== undefined && moveCount !== state.moves.length) {
    return { ok: false, state, error: 'stale' };
  }
  return apply(state, move);
}

export function view(state: GameState, seat: number): SeatView {
  const canMove = state.status === 'playing' && state.turn === (seat === 0 ? 'w' : 'b');
  const board = state.board.map((piece) => (piece ? { ...piece } : null));
  return {
    board,
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    drawReason: state.drawReason,
    inCheck: state.inCheck,
    seat,
    canMove,
    moveCount: state.moves.length,
    moves: state.moves.map((record) => ({ ...record })),
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    legal: canMove ? legalMoves(state) : [],
  };
}

export function resultKey(state: GameState): Color | 'draw' {
  if (state.status === 'draw' || state.status === 'stalemate') return 'draw';
  return state.winner ?? 'draw';
}

export function perft(state: GameState, depth: number): number {
  if (depth <= 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const move of moves) total += perft(makeMove(state, move), depth - 1);
  return total;
}
