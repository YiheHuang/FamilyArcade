/**
 * Xiangqi (Chinese chess) rules engine — pure TypeScript.
 *
 * Board layout: 9 files (columns) × 10 ranks (rows). Index 0 is the top-left
 * intersection and index 89 the bottom-right. Black starts at the top (rows
 * 0–4), Red at the bottom (rows 5–9). The palace is files 3–5 on each side.
 * The river runs between rows 4 and 5.
 *
 * No DOM, network, clock or Math.random lives here. The engine is deterministic
 * and every function returns fresh state; callers may keep the old state.
 */

export type Side = 'R' | 'B';
export type PieceType = 'G' | 'A' | 'E' | 'H' | 'R' | 'C' | 'S';
export type Cell = { side: Side; type: PieceType } | null;
export type GameStatus = 'playing' | 'won' | 'draw';
export type GameReason =
  | 'checkmate'
  | 'stalemate'
  | 'repetition'
  | 'no-capture'
  | null;

export interface Move {
  from: number;
  to: number;
}

export interface GameState {
  board: Cell[];
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  reason: GameReason;
  moves: Move[];
  check: boolean;
  halfmoveClock: number;
  positionCounts: Record<string, number>;
}

export type MoveError =
  | 'game-over'
  | 'bad-square'
  | 'no-piece'
  | 'wrong-side'
  | 'wrong-turn'
  | 'illegal';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  board: Cell[];
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  reason: GameReason;
  check: boolean;
  side: Side;
  seat: number;
  canMove: boolean;
  moveCount: number;
  last: Move | null;
  halfmoveClock: number;
}

export const COLS = 9;
export const ROWS = 10;
export const CELLS = COLS * ROWS;

const BACK_RANK: readonly PieceType[] = ['R', 'H', 'E', 'A', 'G', 'A', 'E', 'H', 'R'];
const DIRS4: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function opponent(side: Side): Side {
  return side === 'R' ? 'B' : 'R';
}

export function rowOf(index: number): number {
  return Math.floor(index / COLS);
}

export function colOf(index: number): number {
  return index % COLS;
}

export function indexOf(row: number, col: number): number {
  return row * COLS + col;
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

export function inPalace(side: Side, row: number, col: number): boolean {
  if (col < 3 || col > 5) return false;
  return side === 'R' ? row >= 7 && row <= 9 : row >= 0 && row <= 2;
}

function onOwnHalf(side: Side, row: number): boolean {
  return side === 'R' ? row >= 5 : row <= 4;
}

function hasCrossedRiver(side: Side, row: number): boolean {
  return side === 'R' ? row <= 4 : row >= 5;
}

function piece(side: Side, type: PieceType): { side: Side; type: PieceType } {
  return { side, type };
}

export function initialBoard(): Cell[] {
  const board: Cell[] = Array<Cell>(CELLS).fill(null);
  for (let col = 0; col < COLS; col += 1) {
    board[indexOf(0, col)] = piece('B', BACK_RANK[col]);
    board[indexOf(9, col)] = piece('R', BACK_RANK[col]);
  }
  board[indexOf(2, 1)] = piece('B', 'C');
  board[indexOf(2, 7)] = piece('B', 'C');
  board[indexOf(7, 1)] = piece('R', 'C');
  board[indexOf(7, 7)] = piece('R', 'C');
  for (const col of [0, 2, 4, 6, 8]) {
    board[indexOf(3, col)] = piece('B', 'S');
    board[indexOf(6, col)] = piece('R', 'S');
  }
  return board;
}

/** Stable encoding of a position for repetition detection. */
export function positionKey(board: Cell[], turn: Side): string {
  let key = '';
  for (const cell of board) {
    if (!cell) key += '.';
    else {
      const letter = cell.type;
      key += cell.side === 'R' ? letter : letter.toLowerCase();
    }
  }
  return `${key}|${turn}`;
}

export function setup(first: Side = 'R'): GameState {
  const board = initialBoard();
  return {
    board,
    turn: first,
    status: 'playing',
    winner: null,
    reason: null,
    moves: [],
    check: false,
    halfmoveClock: 0,
    positionCounts: { [positionKey(board, first)]: 1 },
  };
}

export function generalIndex(board: Cell[], side: Side): number {
  for (let index = 0; index < board.length; index += 1) {
    const cell = board[index];
    if (cell && cell.side === side && cell.type === 'G') return index;
  }
  return -1;
}

function pseudoMovesFrom(board: Cell[], from: number): Move[] {
  const moving = board[from];
  if (!moving) return [];
  const side = moving.side;
  const row = rowOf(from);
  const col = colOf(from);
  const moves: Move[] = [];

  const add = (toRow: number, toCol: number): boolean => {
    if (!inBounds(toRow, toCol)) return false;
    const to = indexOf(toRow, toCol);
    const target = board[to];
    if (target && target.side === side) return false;
    moves.push({ from, to });
    return true;
  };

  if (moving.type === 'G') {
    for (const [dr, dc] of DIRS4) {
      const toRow = row + dr;
      const toCol = col + dc;
      if (inPalace(side, toRow, toCol)) add(toRow, toCol);
    }
    // Flying general: a general may capture the opposing general along an open file.
    for (const direction of [-1, 1]) {
      for (let step = 1; ; step += 1) {
        const toRow = row + direction * step;
        if (toRow < 0 || toRow >= ROWS) break;
        const to = indexOf(toRow, col);
        const target = board[to];
        if (!target) continue;
        if (target.side === side) break;
        if (target.type === 'G') moves.push({ from, to });
        break;
      }
    }
    return moves;
  }

  if (moving.type === 'A') {
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const toRow = row + dr;
      const toCol = col + dc;
      if (inPalace(side, toRow, toCol)) add(toRow, toCol);
    }
    return moves;
  }

  if (moving.type === 'E') {
    for (const [dr, dc] of [
      [-2, -2],
      [-2, 2],
      [2, -2],
      [2, 2],
    ]) {
      const toRow = row + dr;
      const toCol = col + dc;
      if (!inBounds(toRow, toCol) || !onOwnHalf(side, toRow)) continue;
      const eyeRow = row + dr / 2;
      const eyeCol = col + dc / 2;
      if (board[indexOf(eyeRow, eyeCol)]) continue;
      add(toRow, toCol);
    }
    return moves;
  }

  if (moving.type === 'H') {
    const jumps: readonly (readonly [number, number, number, number])[] = [
      [-2, -1, -1, 0],
      [-2, 1, -1, 0],
      [2, -1, 1, 0],
      [2, 1, 1, 0],
      [-1, -2, 0, -1],
      [1, -2, 0, -1],
      [-1, 2, 0, 1],
      [1, 2, 0, 1],
    ];
    for (const [dr, dc, legR, legC] of jumps) {
      const toRow = row + dr;
      const toCol = col + dc;
      if (!inBounds(toRow, toCol)) continue;
      if (board[indexOf(row + legR, col + legC)]) continue;
      add(toRow, toCol);
    }
    return moves;
  }

  if (moving.type === 'R') {
    for (const [dr, dc] of DIRS4) {
      for (let step = 1; ; step += 1) {
        const toRow = row + dr * step;
        const toCol = col + dc * step;
        if (!inBounds(toRow, toCol)) break;
        const to = indexOf(toRow, toCol);
        const target = board[to];
        if (!target) {
          moves.push({ from, to });
          continue;
        }
        if (target.side !== side) moves.push({ from, to });
        break;
      }
    }
    return moves;
  }

  if (moving.type === 'C') {
    for (const [dr, dc] of DIRS4) {
      let screen = false;
      for (let step = 1; ; step += 1) {
        const toRow = row + dr * step;
        const toCol = col + dc * step;
        if (!inBounds(toRow, toCol)) break;
        const to = indexOf(toRow, toCol);
        const target = board[to];
        if (!screen) {
          if (!target) moves.push({ from, to });
          else screen = true;
        } else if (target) {
          if (target.side !== side) moves.push({ from, to });
          break;
        }
      }
    }
    return moves;
  }

  // Soldier: forward one; sideways only after crossing the river.
  const forward = side === 'R' ? -1 : 1;
  add(row + forward, col);
  if (hasCrossedRiver(side, row)) {
    add(row, col - 1);
    add(row, col + 1);
  }
  return moves;
}

export function pseudoMoves(board: Cell[], side: Side): Move[] {
  const moves: Move[] = [];
  for (let index = 0; index < board.length; index += 1) {
    const cell = board[index];
    if (cell && cell.side === side) moves.push(...pseudoMovesFrom(board, index));
  }
  return moves;
}

/**
 * Is `target` attacked by `by`? Used for general safety, so a general on an open
 * file counts as a flying-general attack. Cannons need exactly one screen.
 */
export function isSquareAttacked(board: Cell[], target: number, by: Side): boolean {
  const row = rowOf(target);
  const col = colOf(target);

  // Soldiers.
  if (by === 'R') {
    const front = inBounds(row + 1, col) ? board[indexOf(row + 1, col)] : null;
    if (front && front.side === 'R' && front.type === 'S') return true;
    if (row <= 4) {
      for (const dc of [-1, 1]) {
        if (!inBounds(row, col + dc)) continue;
        const side = board[indexOf(row, col + dc)];
        if (side && side.side === 'R' && side.type === 'S') return true;
      }
    }
  } else {
    const front = inBounds(row - 1, col) ? board[indexOf(row - 1, col)] : null;
    if (front && front.side === 'B' && front.type === 'S') return true;
    if (row >= 5) {
      for (const dc of [-1, 1]) {
        if (!inBounds(row, col + dc)) continue;
        const side = board[indexOf(row, col + dc)];
        if (side && side.side === 'B' && side.type === 'S') return true;
      }
    }
  }

  // Horses (the leg is beside the horse, toward the target).
  const horseChecks: readonly (readonly [number, number, number, number])[] = [
    [-2, -1, -1, -1],
    [-2, 1, -1, 1],
    [2, -1, 1, -1],
    [2, 1, 1, 1],
    [-1, -2, -1, -1],
    [1, -2, 1, -1],
    [-1, 2, -1, 1],
    [1, 2, 1, 1],
  ];
  for (const [dr, dc, legR, legC] of horseChecks) {
    const horseRow = row + dr;
    const horseCol = col + dc;
    if (!inBounds(horseRow, horseCol)) continue;
    const horse = board[indexOf(horseRow, horseCol)];
    if (!horse || horse.side !== by || horse.type !== 'H') continue;
    if (!board[indexOf(row + legR, col + legC)]) return true;
  }

  // Rooks, generals and cannons along the four rays.
  for (const [dr, dc] of DIRS4) {
    let first: Cell = null;
    let second: Cell = null;
    let firstDistance = 0;
    let distance = 0;
    let rr = row + dr;
    let cc = col + dc;
    while (inBounds(rr, cc)) {
      distance += 1;
      const cell = board[indexOf(rr, cc)];
      if (cell) {
        if (!first) {
          first = cell;
          firstDistance = distance;
        } else {
          second = cell;
          break;
        }
      }
      rr += dr;
      cc += dc;
    }
    if (first && first.side === by) {
      if (first.type === 'R') return true;
      if (first.type === 'G') {
        if (firstDistance === 1) return true;
        if (dc === 0) return true; // flying general on an open file
      }
    }
    if (second && second.side === by && second.type === 'C') return true;
  }

  return false;
}

export function isInCheck(board: Cell[], side: Side): boolean {
  const king = generalIndex(board, side);
  if (king < 0) return true;
  return isSquareAttacked(board, king, opponent(side));
}

function isMoveSafe(board: Cell[], side: Side, move: Move): boolean {
  const moving = board[move.from];
  const captured = board[move.to];
  if (!moving) return false;
  board[move.to] = moving;
  board[move.from] = null;
  const safe = !isInCheck(board, side);
  board[move.from] = moving;
  board[move.to] = captured;
  return safe;
}

/** Legal moves for one side on a board, regardless of game status. */
export function legalMovesForBoard(board: Cell[], side: Side): Move[] {
  if (generalIndex(board, side) < 0) return [];
  return pseudoMoves(board, side).filter((move) => isMoveSafe(board, side, move));
}

export function legalMovesFromBoard(board: Cell[], side: Side, from: number): Move[] {
  const moving = board[from];
  if (!moving || moving.side !== side) return [];
  if (generalIndex(board, side) < 0) return [];
  return pseudoMovesFrom(board, from).filter((move) => isMoveSafe(board, side, move));
}

export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  return legalMovesForBoard(state.board, state.turn);
}

export function legalMovesFrom(state: GameState, from: number): Move[] {
  if (state.status !== 'playing') return [];
  return legalMovesFromBoard(state.board, state.turn, from);
}

/**
 * Fast successor used by search and safety checks. It applies a presumed-legal
 * move, flips the turn and recomputes check, but leaves terminal status to the
 * caller. Public `applyMove` finalizes the position.
 */
export function simulateMove(state: GameState, move: Move): GameState {
  const board = state.board.slice();
  const moving = board[move.from];
  const captured = board[move.to];
  board[move.to] = moving;
  board[move.from] = null;
  const turn = opponent(state.turn);
  return {
    ...state,
    board,
    turn,
    status: 'playing',
    winner: null,
    reason: null,
    moves: [...state.moves, { from: move.from, to: move.to }],
    check: isInCheck(board, turn),
    halfmoveClock: captured ? 0 : state.halfmoveClock + 1,
  };
}

export function applyMove(state: GameState, from: number, to: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= CELLS ||
    to < 0 ||
    to >= CELLS
  ) {
    return { ok: false, state, error: 'bad-square' };
  }
  if (from === to) return { ok: false, state, error: 'illegal' };
  const moving = state.board[from];
  if (!moving) return { ok: false, state, error: 'no-piece' };
  if (moving.side !== state.turn) return { ok: false, state, error: 'wrong-side' };
  const legal = legalMovesFromBoard(state.board, moving.side, from);
  if (!legal.some((move) => move.to === to)) {
    return { ok: false, state, error: 'illegal' };
  }

  const next = simulateMove(state, { from, to });
  const key = positionKey(next.board, next.turn);
  const positionCounts = { ...state.positionCounts };
  positionCounts[key] = (positionCounts[key] ?? 0) + 1;
  next.positionCounts = positionCounts;

  const replies = legalMovesForBoard(next.board, next.turn);
  if (replies.length === 0) {
    // Xiangqi scores stalemate as a loss for the side with no legal move.
    next.status = 'won';
    next.winner = moving.side;
    next.reason = next.check ? 'checkmate' : 'stalemate';
    return { ok: true, state: next };
  }
  if (positionCounts[key] >= 3) {
    next.status = 'draw';
    next.reason = 'repetition';
    return { ok: true, state: next };
  }
  if (next.halfmoveClock >= 120) {
    // Sixty full moves (120 plies) without a capture.
    next.status = 'draw';
    next.reason = 'no-capture';
    return { ok: true, state: next };
  }
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, from: number, to: number): MoveResult {
  const side: Side = seat === 0 ? 'R' : 'B';
  if (state.turn !== side) return { ok: false, state, error: 'wrong-turn' };
  return applyMove(state, from, to);
}

export function view(state: GameState, seat: number): SeatView {
  const side: Side = seat === 0 ? 'R' : 'B';
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    reason: state.reason,
    check: state.check,
    side,
    seat,
    canMove: state.status === 'playing' && state.turn === side,
    moveCount: state.moves.length,
    last: state.moves.length > 0 ? state.moves[state.moves.length - 1] : null,
    halfmoveClock: state.halfmoveClock,
  };
}

export function resultText(state: GameState): 'red' | 'black' | 'draw' | null {
  if (state.status === 'draw') return 'draw';
  if (state.status === 'won') return state.winner === 'R' ? 'red' : 'black';
  return null;
}
