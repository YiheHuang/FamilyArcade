/**
 * Quarto — pure rules engine.
 *
 * 16 unique pieces, four binary attributes. A piece is a 4-bit number:
 *   bit 0  shade   0 light, 1 dark
 *   bit 1  shape   0 round, 1 square
 *   bit 2  height  0 short, 1 tall
 *   bit 3  top     0 solid, 1 hollow
 *
 * A turn has two actions: choose a piece for the opponent, then the opponent
 * places it. The placer then chooses the next piece. No DOM, clock, network or
 * randomness is used here.
 */

export const BOARD_SIZE = 4;
export const CELL_COUNT = 16;
export const PIECE_COUNT = 16;
export const ATTRIBUTE_COUNT = 4;

export type Player = 0 | 1;
export type Phase = 'choose' | 'place';
export type Status = 'playing' | 'won' | 'draw';
export type Cell = number | null;

export interface AttributeMatch {
  /** 0 shade, 1 shape, 2 height, 3 top. */
  attribute: number;
  value: 0 | 1;
}

export interface QuartoResult {
  line: number[];
  attributes: AttributeMatch[];
}

export type GameAction =
  | { type: 'choose'; piece: number }
  | { type: 'place'; cell: number };

export interface GameState {
  board: Cell[];
  /** Pieces still available to choose. */
  pool: number[];
  /** Piece chosen for the player who must now place it. */
  selected: number | null;
  turn: Player;
  phase: Phase;
  status: Status;
  winner: Player | null;
  line: number[] | null;
  attributes: AttributeMatch[] | null;
  placements: number;
  lastCell: number | null;
  lastPiece: number | null;
  first: Player;
  actions: GameAction[];
}

export type MoveError =
  | 'game-over'
  | 'wrong-phase'
  | 'bad-piece'
  | 'piece-used'
  | 'no-piece'
  | 'bad-cell'
  | 'occupied'
  | 'wrong-turn';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface SeatView {
  board: Cell[];
  pool: number[];
  selected: number | null;
  turn: Player;
  phase: Phase;
  status: Status;
  winner: Player | null;
  line: number[] | null;
  attributes: AttributeMatch[] | null;
  placements: number;
  lastCell: number | null;
  lastPiece: number | null;
  first: Player;
  seat: number;
  canAct: boolean;
  actionCount: number;
}

export const ALL_PIECES: readonly number[] = Array.from(
  { length: PIECE_COUNT },
  (_, index) => index,
);

export const LINES: readonly (readonly number[])[] = [
  // rows
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
  // columns
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  // diagonals
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];

/** Read one binary attribute from a piece. */
export function bit(piece: number, attribute: number): 0 | 1 {
  return ((piece >> attribute) & 1) as 0 | 1;
}

export function other(player: Player): Player {
  return player === 0 ? 1 : 0;
}

export function setup(first: Player = 0): GameState {
  const starter: Player = first === 1 ? 1 : 0;
  return {
    board: Array<Cell>(CELL_COUNT).fill(null),
    pool: [...ALL_PIECES],
    selected: null,
    turn: starter,
    phase: 'choose',
    status: 'playing',
    winner: null,
    line: null,
    attributes: null,
    placements: 0,
    lastCell: null,
    lastPiece: null,
    first: starter,
    actions: [],
  };
}

/**
 * Return the first completed line that shares at least one attribute, or null.
 * A line may share more than one attribute; all of them are reported.
 */
export function quartoOnBoard(board: Cell[]): QuartoResult | null {
  for (const line of LINES) {
    const pieces: number[] = [];
    let full = true;
    for (const index of line) {
      const piece = board[index];
      if (piece === null || piece === undefined) {
        full = false;
        break;
      }
      pieces.push(piece);
    }
    if (!full) continue;

    const attributes: AttributeMatch[] = [];
    for (let attribute = 0; attribute < ATTRIBUTE_COUNT; attribute += 1) {
      const value = bit(pieces[0], attribute);
      if (pieces.every((piece) => bit(piece, attribute) === value)) {
        attributes.push({ attribute, value });
      }
    }
    if (attributes.length > 0) return { line: [...line], attributes };
  }
  return null;
}

/** Alias used by tests and small callers. */
export function winningLine(board: Cell[]): number[] | null {
  return quartoOnBoard(board)?.line ?? null;
}

/**
 * Empty cells where placing `piece` would immediately complete a quarto.
 * A line needs three filled cells and one empty cell; this is the tactical
 * primitive used by the AI and the hint.
 */
export function winningCells(board: Cell[], piece: number): number[] {
  if (!Number.isInteger(piece) || piece < 0 || piece >= PIECE_COUNT) return [];
  const found = new Set<number>();

  for (const line of LINES) {
    let empty = -1;
    let emptyCount = 0;
    const pieces: number[] = [];
    for (const index of line) {
      const value = board[index];
      if (value === null || value === undefined) {
        empty = index;
        emptyCount += 1;
      } else {
        pieces.push(value);
      }
    }
    if (emptyCount !== 1 || pieces.length !== 3) continue;
    for (let attribute = 0; attribute < ATTRIBUTE_COUNT; attribute += 1) {
      const value = bit(piece, attribute);
      if (pieces.every((item) => bit(item, attribute) === value)) {
        found.add(empty);
        break;
      }
    }
  }

  return [...found].sort((a, b) => a - b);
}

export function legalActions(state: GameState): GameAction[] {
  if (state.status !== 'playing') return [];
  if (state.phase === 'choose') {
    return state.pool.map((piece) => ({ type: 'choose', piece }));
  }
  if (state.selected === null) return [];
  return state.board.flatMap((cell, index) =>
    cell === null ? [{ type: 'place' as const, cell: index }] : [],
  );
}

export function legal(state: GameState, action: GameAction): boolean {
  return legalActions(state).some((item) =>
    item.type === 'choose'
      ? action.type === 'choose' && item.piece === action.piece
      : action.type === 'place' && item.cell === action.cell,
  );
}

export function applyAction(state: GameState, action: GameAction): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };

  if (state.phase === 'choose') {
    if (action.type !== 'choose') return { ok: false, state, error: 'wrong-phase' };
    if (!Number.isInteger(action.piece) || action.piece < 0 || action.piece >= PIECE_COUNT) {
      return { ok: false, state, error: 'bad-piece' };
    }
    if (!state.pool.includes(action.piece)) {
      return { ok: false, state, error: 'piece-used' };
    }
    const pool = state.pool.filter((piece) => piece !== action.piece);
    const next: GameState = {
      ...state,
      pool,
      selected: action.piece,
      turn: other(state.turn),
      phase: 'place',
      lastPiece: action.piece,
      actions: [...state.actions, action],
    };
    return { ok: true, state: next };
  }

  if (action.type !== 'place') return { ok: false, state, error: 'wrong-phase' };
  if (state.selected === null) return { ok: false, state, error: 'no-piece' };
  if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell >= CELL_COUNT) {
    return { ok: false, state, error: 'bad-cell' };
  }
  if (state.board[action.cell] !== null) {
    return { ok: false, state, error: 'occupied' };
  }

  const board = state.board.slice();
  const placed = state.selected;
  board[action.cell] = placed;
  const placements = state.placements + 1;
  const result = quartoOnBoard(board);
  const full = placements === CELL_COUNT;
  const status: Status = result ? 'won' : full ? 'draw' : 'playing';
  const next: GameState = {
    ...state,
    board,
    selected: null,
    turn: state.turn,
    phase: 'choose',
    status,
    winner: result ? state.turn : null,
    line: result?.line ?? null,
    attributes: result?.attributes ?? null,
    placements,
    lastCell: action.cell,
    lastPiece: placed,
    actions: [...state.actions, action],
  };
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, action: GameAction): MoveResult {
  if (seat !== 0 && seat !== 1) return { ok: false, state, error: 'wrong-turn' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  return applyAction(state, action);
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat = seat === 1 ? 1 : 0;
  const canAct = state.status === 'playing' && state.turn === safeSeat;
  return {
    board: state.board.slice(),
    pool: state.pool.slice(),
    selected: state.selected,
    turn: state.turn,
    phase: state.phase,
    status: state.status,
    winner: state.winner,
    line: state.line ? [...state.line] : null,
    attributes: state.attributes ? state.attributes.map((item) => ({ ...item })) : null,
    placements: state.placements,
    lastCell: state.lastCell,
    lastPiece: state.lastPiece,
    first: state.first,
    seat: safeSeat,
    canAct,
    actionCount: state.actions.length,
  };
}
