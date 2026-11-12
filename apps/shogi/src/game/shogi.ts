/**
 * Pure 9×9 shogi engine.
 *
 * Board index 0 is the top-left square (White's back rank); index 80 is the
 * bottom-right square (Black's back rank). Black starts at the bottom and moves
 * up the board, as in a printed shogi diagram.
 *
 * The module has no DOM, network, clock or randomness. `apply` is deterministic
 * and never mutates the state passed to it.
 */

export type Side = 'b' | 'w';
export type PieceType = 'K' | 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P';
export type HandType = Exclude<PieceType, 'K'>;

export interface Piece {
  side: Side;
  type: PieceType;
  promoted: boolean;
}

export type Square = Piece | null;
export type Board = Square[];

export type Hand = Record<HandType, number>;

export interface Hands {
  b: Hand;
  w: Hand;
}

export type Move =
  | {
      kind: 'move';
      from: number;
      to: number;
      promote: boolean;
      /** Optional notation hint; legal generation does not need it. */
      piece?: PieceType;
      captured?: PieceType;
    }
  | { kind: 'drop'; type: HandType; to: number };

export type EndReason = 'checkmate' | 'no-moves' | 'repetition' | null;

export interface GameState {
  board: Board;
  hands: Hands;
  turn: Side;
  status: 'playing' | 'won' | 'draw';
  winner: Side | null;
  check: boolean;
  moves: Move[];
  lastMove: Move | null;
  positionCounts: Record<string, number>;
  endReason: EndReason;
}

export interface SeatView {
  board: Board;
  hands: Hands;
  turn: Side;
  status: GameState['status'];
  winner: Side | null;
  check: boolean;
  moves: Move[];
  lastMove: Move | null;
  moveCount: number;
  side: Side;
  seat: number;
  canMove: boolean;
  endReason: EndReason;
}

export type MoveError =
  | 'game-over'
  | 'bad-square'
  | 'no-piece'
  | 'wrong-piece'
  | 'occupied'
  | 'wrong-turn'
  | 'no-hand'
  | 'cannot-promote'
  | 'illegal';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export const SIZE = 9;
export const SQUARES = SIZE * SIZE;
export const HAND_TYPES: readonly HandType[] = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

export const PIECE_VALUES: Readonly<Record<PieceType, number>> = {
  K: 0,
  R: 850,
  B: 700,
  G: 500,
  S: 400,
  N: 300,
  L: 250,
  P: 100,
};

const BACK_RANK: readonly PieceType[] = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];

interface Step {
  dr: number;
  dc: number;
  slide: boolean;
}

const KING_STEPS: readonly Step[] = [
  { dr: -1, dc: -1, slide: false },
  { dr: -1, dc: 0, slide: false },
  { dr: -1, dc: 1, slide: false },
  { dr: 0, dc: -1, slide: false },
  { dr: 0, dc: 1, slide: false },
  { dr: 1, dc: -1, slide: false },
  { dr: 1, dc: 0, slide: false },
  { dr: 1, dc: 1, slide: false },
];

const ORTHO_SLIDES: readonly Step[] = [
  { dr: -1, dc: 0, slide: true },
  { dr: 1, dc: 0, slide: true },
  { dr: 0, dc: -1, slide: true },
  { dr: 0, dc: 1, slide: true },
];

const DIAG_SLIDES: readonly Step[] = [
  { dr: -1, dc: -1, slide: true },
  { dr: -1, dc: 1, slide: true },
  { dr: 1, dc: -1, slide: true },
  { dr: 1, dc: 1, slide: true },
];

const DIAG_STEPS: readonly Step[] = [
  { dr: -1, dc: -1, slide: false },
  { dr: -1, dc: 1, slide: false },
  { dr: 1, dc: -1, slide: false },
  { dr: 1, dc: 1, slide: false },
];

const ORTHO_STEPS: readonly Step[] = [
  { dr: -1, dc: 0, slide: false },
  { dr: 1, dc: 0, slide: false },
  { dr: 0, dc: -1, slide: false },
  { dr: 0, dc: 1, slide: false },
];

export function otherSide(side: Side): Side {
  return side === 'b' ? 'w' : 'b';
}

export function sideForSeat(seat: number): Side {
  return seat === 0 ? 'b' : 'w';
}

export function emptyHand(): Hand {
  return { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 };
}

export function emptyHands(): Hands {
  return { b: emptyHand(), w: emptyHand() };
}

export function piece(type: PieceType, side: Side, promoted = false): Piece {
  return { type, side, promoted };
}

export function isPromotable(type: PieceType): boolean {
  return type !== 'K' && type !== 'G';
}

export function isHandType(type: PieceType): type is HandType {
  return type !== 'K';
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

export function rowOf(index: number): number {
  return Math.floor(index / SIZE);
}

export function colOf(index: number): number {
  return index % SIZE;
}

export function inPromotionZone(side: Side, index: number): boolean {
  const row = rowOf(index);
  return side === 'b' ? row <= 2 : row >= 6;
}

function lastRank(side: Side): number {
  return side === 'b' ? 0 : SIZE - 1;
}

function mandatoryPromotion(type: PieceType, side: Side, to: number): boolean {
  const row = rowOf(to);
  if (type === 'P' || type === 'L') return row === lastRank(side);
  if (type === 'N') return side === 'b' ? row <= 1 : row >= SIZE - 2;
  return false;
}

function goldSteps(forward: number): Step[] {
  return [
    { dr: forward, dc: 0, slide: false },
    { dr: forward, dc: -1, slide: false },
    { dr: forward, dc: 1, slide: false },
    { dr: 0, dc: -1, slide: false },
    { dr: 0, dc: 1, slide: false },
    { dr: -forward, dc: 0, slide: false },
  ];
}

function silverSteps(forward: number): Step[] {
  return [
    { dr: forward, dc: 0, slide: false },
    { dr: forward, dc: -1, slide: false },
    { dr: forward, dc: 1, slide: false },
    { dr: -forward, dc: -1, slide: false },
    { dr: -forward, dc: 1, slide: false },
  ];
}

function stepsFor(pieceOn: Piece): readonly Step[] {
  const forward = pieceOn.side === 'b' ? -1 : 1;
  if (pieceOn.promoted) {
    if (pieceOn.type === 'R') return [...ORTHO_SLIDES, ...DIAG_STEPS];
    if (pieceOn.type === 'B') return [...DIAG_SLIDES, ...ORTHO_STEPS];
    return goldSteps(forward);
  }
  switch (pieceOn.type) {
    case 'K':
      return KING_STEPS;
    case 'G':
      return goldSteps(forward);
    case 'S':
      return silverSteps(forward);
    case 'N':
      return [
        { dr: 2 * forward, dc: -1, slide: false },
        { dr: 2 * forward, dc: 1, slide: false },
      ];
    case 'L':
      return [{ dr: forward, dc: 0, slide: true }];
    case 'P':
      return [{ dr: forward, dc: 0, slide: false }];
    case 'R':
      return ORTHO_SLIDES;
    case 'B':
      return DIAG_SLIDES;
  }
}

export function setup(first: Side = 'b'): GameState {
  const board: Board = Array<Square>(SQUARES).fill(null);

  for (let col = 0; col < SIZE; col += 1) {
    board[col] = piece(BACK_RANK[col], 'w');
    board[8 * SIZE + col] = piece(BACK_RANK[col], 'b');
  }
  board[SIZE + 1] = piece('R', 'w');
  board[SIZE + 7] = piece('B', 'w');
  board[7 * SIZE + 1] = piece('B', 'b');
  board[7 * SIZE + 7] = piece('R', 'b');
  for (let col = 0; col < SIZE; col += 1) {
    board[2 * SIZE + col] = piece('P', 'w');
    board[6 * SIZE + col] = piece('P', 'b');
  }

  const state: GameState = {
    board,
    hands: emptyHands(),
    turn: first,
    status: 'playing',
    winner: null,
    check: false,
    moves: [],
    lastMove: null,
    positionCounts: {},
    endReason: null,
  };
  state.positionCounts[positionKey(state)] = 1;
  return state;
}

/** A legal-position helper for puzzles and tests. It does not add a king. */
export function emptyGame(turn: Side = 'b'): GameState {
  return {
    board: Array<Square>(SQUARES).fill(null),
    hands: emptyHands(),
    turn,
    status: 'playing',
    winner: null,
    check: false,
    moves: [],
    lastMove: null,
    positionCounts: {},
    endReason: null,
  };
}

export function cloneBoard(board: Board): Board {
  return board.map((square) => (square ? { ...square } : null));
}

export function cloneHands(hands: Hands): Hands {
  return {
    b: { ...hands.b },
    w: { ...hands.w },
  };
}

function handKey(hand: Hand): string {
  return `${hand.R},${hand.B},${hand.G},${hand.S},${hand.N},${hand.L},${hand.P}`;
}

export function positionKey(state: Pick<GameState, 'board' | 'hands' | 'turn'>): string {
  const cells = state.board
    .map((square) =>
      square ? `${square.side}${square.type}${square.promoted ? '+' : ''}` : '.',
    )
    .join('');
  return `${state.turn}|${cells}|${handKey(state.hands.b)}|${handKey(state.hands.w)}`;
}

export function findKing(board: Board, side: Side): number {
  for (let index = 0; index < SQUARES; index += 1) {
    const square = board[index];
    if (square && square.side === side && square.type === 'K') return index;
  }
  return -1;
}

function squareAt(board: Board, row: number, col: number): Square {
  if (!inBounds(row, col)) return null;
  return board[row * SIZE + col];
}

function isGoldLike(square: Square, side: Side): boolean {
  if (!square || square.side !== side) return false;
  if (square.type === 'G') return true;
  return square.promoted && (square.type === 'P' || square.type === 'L' || square.type === 'N' || square.type === 'S');
}

/**
 * Constant-time-ish attack test used for check, legality and AI evaluation.
 * It scans rays outward from the target rather than generating every enemy move.
 */
export function isSquareAttacked(board: Board, target: number, by: Side): boolean {
  if (target < 0 || target >= SQUARES) return false;
  const row = rowOf(target);
  const col = colOf(target);
  const forward = by === 'b' ? -1 : 1;

  // King adjacency.
  for (const step of KING_STEPS) {
    const square = squareAt(board, row + step.dr, col + step.dc);
    if (square && square.side === by && square.type === 'K') return true;
  }

  // Pawn.
  const pawn = squareAt(board, row - forward, col);
  if (pawn && pawn.side === by && pawn.type === 'P' && !pawn.promoted) return true;

  // Knight (jumps; the two source rows are behind the target).
  for (const dc of [-1, 1]) {
    const knight = squareAt(board, row - 2 * forward, col + dc);
    if (knight && knight.side === by && knight.type === 'N' && !knight.promoted) return true;
  }

  // Gold-like pieces.
  for (const step of goldSteps(forward)) {
    const square = squareAt(board, row - step.dr, col - step.dc);
    if (isGoldLike(square, by)) return true;
  }

  // Silver.
  for (const step of silverSteps(forward)) {
    const square = squareAt(board, row - step.dr, col - step.dc);
    if (square && square.side === by && square.type === 'S' && !square.promoted) return true;
  }

  // Lance: first piece down the file behind the target.
  for (let r = row - forward; inBounds(r, col); r -= forward) {
    const square = board[r * SIZE + col];
    if (!square) continue;
    if (square.side === by && square.type === 'L' && !square.promoted) return true;
    break;
  }

  // Rook-like rays (also +B one-step orthogonal and +R sliding).
  for (const step of ORTHO_SLIDES) {
    let r = row + step.dr;
    let c = col + step.dc;
    let distance = 0;
    while (inBounds(r, c)) {
      distance += 1;
      const square = board[r * SIZE + c];
      if (square) {
        if (square.side === by) {
          if (square.type === 'R') return true;
          if (square.type === 'B' && square.promoted && distance === 1) return true;
        }
        break;
      }
      r += step.dr;
      c += step.dc;
    }
  }

  // Bishop-like rays (also +R one-step diagonal and +B sliding).
  for (const step of DIAG_SLIDES) {
    let r = row + step.dr;
    let c = col + step.dc;
    let distance = 0;
    while (inBounds(r, c)) {
      distance += 1;
      const square = board[r * SIZE + c];
      if (square) {
        if (square.side === by) {
          if (square.type === 'B') return true;
          if (square.type === 'R' && square.promoted && distance === 1) return true;
        }
        break;
      }
      r += step.dr;
      c += step.dc;
    }
  }

  return false;
}

export function isKingInCheck(board: Board, side: Side): boolean {
  const king = findKing(board, side);
  if (king < 0) return false;
  return isSquareAttacked(board, king, otherSide(side));
}

export function isInCheck(state: GameState, side: Side): boolean {
  return isKingInCheck(state.board, side);
}

function targetsFor(board: Board, from: number, moving: Piece): number[] {
  const row = rowOf(from);
  const col = colOf(from);
  const targets: number[] = [];
  for (const step of stepsFor(moving)) {
    let r = row + step.dr;
    let c = col + step.dc;
    while (inBounds(r, c)) {
      const target = r * SIZE + c;
      const occupant = board[target];
      if (!occupant) {
        targets.push(target);
      } else {
        if (occupant.side !== moving.side) targets.push(target);
        break;
      }
      if (!step.slide) break;
      r += step.dr;
      c += step.dc;
    }
  }
  return targets;
}

function promotionOptions(moving: Piece, from: number, to: number): boolean[] {
  if (moving.promoted || !isPromotable(moving.type)) return [false];
  if (!inPromotionZone(moving.side, from) && !inPromotionZone(moving.side, to)) {
    return [false];
  }
  return mandatoryPromotion(moving.type, moving.side, to) ? [true] : [true, false];
}

function nifu(board: Board, side: Side, col: number): boolean {
  for (let row = 0; row < SIZE; row += 1) {
    const square = board[row * SIZE + col];
    if (square && square.side === side && square.type === 'P' && !square.promoted) {
      return true;
    }
  }
  return false;
}

export function canDrop(state: Pick<GameState, 'board' | 'hands'>, side: Side, type: HandType, to: number): boolean {
  if (to < 0 || to >= SQUARES || state.board[to]) return false;
  if (state.hands[side][type] <= 0) return false;
  const row = rowOf(to);
  if (type === 'P') {
    if (row === lastRank(side)) return false;
    if (nifu(state.board, side, colOf(to))) return false;
  }
  if (type === 'L' && row === lastRank(side)) return false;
  if (type === 'N' && (side === 'b' ? row <= 1 : row >= SIZE - 2)) return false;
  return true;
}

function pseudoMoves(state: GameState): Move[] {
  const side = state.turn;
  const moves: Move[] = [];

  for (let from = 0; from < SQUARES; from += 1) {
    const moving = state.board[from];
    if (!moving || moving.side !== side) continue;
    for (const to of targetsFor(state.board, from, moving)) {
      for (const promote of promotionOptions(moving, from, to)) {
        moves.push({ kind: 'move', from, to, promote });
      }
    }
  }

  for (const type of HAND_TYPES) {
    if (state.hands[side][type] <= 0) continue;
    for (let to = 0; to < SQUARES; to += 1) {
      if (canDrop(state, side, type, to)) moves.push({ kind: 'drop', type, to });
    }
  }

  return moves;
}

function boardAfterMove(board: Board, move: Move, side: Side): Board {
  const next = board.slice();
  if (move.kind === 'move') {
    const moving = next[move.from];
    if (!moving) return next;
    next[move.from] = null;
    next[move.to] = move.promote
      ? { side: moving.side, type: moving.type, promoted: true }
      : { ...moving };
  } else {
    next[move.to] = { side, type: move.type, promoted: false };
  }
  return next;
}

function kingSafeAfter(board: Board, move: Move, side: Side): boolean {
  const after = boardAfterMove(board, move, side);
  return !isKingInCheck(after, side);
}

function givesPawnCheck(board: Board, move: Move, side: Side): boolean {
  if (move.kind !== 'drop' || move.type !== 'P') return false;
  const after = boardAfterMove(board, move, side);
  const enemyKing = findKing(after, otherSide(side));
  if (enemyKing < 0) return false;
  return isSquareAttacked(after, enemyKing, side);
}

function baseHandType(type: PieceType): HandType {
  if (type === 'K') throw new Error('A king cannot be captured');
  return type;
}

/**
 * Applies a move that has already been proved legal. Used by search and tests.
 * It does not set checkmate/repetition status; `apply` does that at the root.
 */
export function makeMoveUnchecked(state: GameState, move: Move): GameState {
  const mover = state.turn;
  const board = state.board.slice();
  const hands = cloneHands(state.hands);
  let storedMove: Move = move;

  if (move.kind === 'move') {
    const moving = board[move.from];
    if (!moving) throw new Error('makeMoveUnchecked: empty source square');
    const captured = board[move.to];
    if (captured && captured.side !== mover) {
      hands[mover][baseHandType(captured.type)] += 1;
    }
    storedMove = {
      ...move,
      piece: moving.type,
      ...(captured ? { captured: captured.type } : {}),
    };
    board[move.from] = null;
    board[move.to] = move.promote
      ? { side: moving.side, type: moving.type, promoted: true }
      : { ...moving };
  } else {
    hands[mover][move.type] -= 1;
    board[move.to] = { side: mover, type: move.type, promoted: false };
  }

  const next: GameState = {
    ...state,
    board,
    hands,
    turn: otherSide(mover),
    status: 'playing',
    winner: null,
    check: false,
    moves: [...state.moves, storedMove],
    lastMove: storedMove,
    endReason: null,
  };
  next.check = isInCheck(next, next.turn);
  return next;
}

export function hasAnyLegalMove(state: GameState, strictPawnMate = true): boolean {
  const side = state.turn;
  for (const move of pseudoMoves(state)) {
    if (!kingSafeAfter(state.board, move, side)) continue;
    if (strictPawnMate && givesPawnCheck(state.board, move, side)) {
      const next = makeMoveUnchecked(state, move);
      if (!hasAnyLegalMove(next, false)) continue;
    }
    return true;
  }
  return false;
}

export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  const side = state.turn;
  const legal: Move[] = [];

  for (const move of pseudoMoves(state)) {
    if (!kingSafeAfter(state.board, move, side)) continue;
    if (move.kind === 'drop' && move.type === 'P' && givesPawnCheck(state.board, move, side)) {
      const next = makeMoveUnchecked(state, move);
      if (!hasAnyLegalMove(next, false)) continue;
    }
    legal.push(move);
  }

  return legal;
}

export function sameMove(a: Move, b: Move): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'move' && b.kind === 'move') {
    return a.from === b.from && a.to === b.to && a.promote === b.promote;
  }
  if (a.kind === 'drop' && b.kind === 'drop') {
    return a.type === b.type && a.to === b.to;
  }
  return false;
}

export function moveKey(move: Move): string {
  return move.kind === 'move'
    ? `m:${move.from}:${move.to}:${move.promote ? 1 : 0}`
    : `d:${move.type}:${move.to}`;
}

function invalidShape(move: Move): boolean {
  if (!move || (move.kind !== 'move' && move.kind !== 'drop')) return true;
  if (move.kind === 'move') {
    return (
      !Number.isInteger(move.from) ||
      !Number.isInteger(move.to) ||
      move.from < 0 ||
      move.from >= SQUARES ||
      move.to < 0 ||
      move.to >= SQUARES ||
      typeof move.promote !== 'boolean'
    );
  }
  return (
    !isHandType(move.type) ||
    !Number.isInteger(move.to) ||
    move.to < 0 ||
    move.to >= SQUARES
  );
}

function classify(state: GameState, move: Move): MoveError {
  if (move.kind === 'move') {
    const moving = state.board[move.from];
    if (!moving) return 'no-piece';
    if (moving.side !== state.turn) return 'wrong-piece';
    if (state.board[move.to]?.side === state.turn) return 'occupied';
    if (move.promote) {
      if (moving.promoted || !isPromotable(moving.type)) return 'cannot-promote';
      if (
        !inPromotionZone(moving.side, move.from) &&
        !inPromotionZone(moving.side, move.to)
      ) {
        return 'cannot-promote';
      }
    }
    return 'illegal';
  }
  if (state.hands[state.turn][move.type] <= 0) return 'no-hand';
  return 'illegal';
}

export function apply(state: GameState, move: Move): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (invalidShape(move)) return { ok: false, state, error: 'bad-square' };

  const legal = legalMoves(state);
  if (!legal.some((candidate) => sameMove(candidate, move))) {
    return { ok: false, state, error: classify(state, move) };
  }

  const next = makeMoveUnchecked(state, move);
  const counts = { ...state.positionCounts };
  const key = positionKey(next);
  counts[key] = (counts[key] ?? 0) + 1;
  next.positionCounts = counts;

  if (!hasAnyLegalMove(next, true)) {
    next.status = 'won';
    next.winner = state.turn;
    next.endReason = next.check ? 'checkmate' : 'no-moves';
    return { ok: true, state: next };
  }
  if (counts[key] >= 4) {
    next.status = 'draw';
    next.endReason = 'repetition';
    return { ok: true, state: next };
  }
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, move: Move): MoveResult {
  const side = sideForSeat(seat);
  if (state.turn !== side) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, move);
}

export function view(state: GameState, seat: number): SeatView {
  const side = sideForSeat(seat);
  return {
    board: cloneBoard(state.board),
    hands: cloneHands(state.hands),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    check: state.check,
    moves: state.moves.map((move) => ({ ...move })),
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    moveCount: state.moves.length,
    side,
    seat,
    canMove: state.status === 'playing' && state.turn === side,
    endReason: state.endReason,
  };
}

export function stateFromView(value: SeatView): GameState {
  return {
    board: cloneBoard(value.board),
    hands: cloneHands(value.hands),
    turn: value.turn,
    status: value.status,
    winner: value.winner,
    check: value.check,
    moves: value.moves.map((move) => ({ ...move })),
    lastMove: value.lastMove ? { ...value.lastMove } : null,
    positionCounts: {},
    endReason: value.endReason,
  };
}

export function receivesCheck(state: GameState): boolean {
  return state.status === 'playing' && state.check;
}

export function squareName(index: number): string {
  const file = SIZE - colOf(index);
  const rank = rowOf(index) + 1;
  return `${file}${rank}`;
}
