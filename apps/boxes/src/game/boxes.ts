/**
 * Boxes · 点格棋 — pure dots-and-boxes engine.
 *
 * A 6×6 lattice of dots makes 5×5 boxes. There are 30 horizontal and 30
 * vertical edges (60 in total). Completing a box claims it and grants another
 * turn. No DOM, network, clock or randomness lives in this file.
 */

export const DOTS = 6;
export const BOXES = DOTS - 1;
export const BOX_COUNT = BOXES * BOXES;
export const H_EDGES = DOTS * BOXES;
export const V_EDGES = BOXES * DOTS;
export const EDGE_COUNT = H_EDGES + V_EDGES;

export type Player = 0 | 1;
export type Owner = Player | null;
export type GameStatus = 'playing' | 'done';

export interface GameState {
  /** 60 flags, horizontal edges 0–29 then vertical edges 30–59. */
  edges: boolean[];
  /** Which player drew each edge (for the pencil colours in the UI). */
  edgeOwners: Owner[];
  /** Owner of each of the 25 boxes, or null. */
  owners: Owner[];
  turn: Player;
  scores: [number, number];
  status: GameStatus;
  winner: Player | null;
  moves: number[];
  lastEdge: number | null;
  lastClaimed: number[];
  first: Player;
}

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: 'bad-edge' | 'drawn' | 'game-over' | 'wrong-turn';
}

export interface SeatView {
  edges: boolean[];
  edgeOwners: Owner[];
  owners: Owner[];
  scores: [number, number];
  turn: Player;
  status: GameStatus;
  winner: Player | null;
  lastEdge: number | null;
  lastClaimed: number[];
  moveCount: number;
  remaining: number;
  seat: Player;
  canMove: boolean;
}

export function other(player: Player): Player {
  return player === 0 ? 1 : 0;
}

/** Horizontal edge between dot (row, col) and (row, col + 1). */
export function hEdge(row: number, col: number): number {
  return row * BOXES + col;
}

/** Vertical edge between dot (row, col) and (row + 1, col). */
export function vEdge(row: number, col: number): number {
  return H_EDGES + row * DOTS + col;
}

export function edgePosition(edge: number): { kind: 'h' | 'v'; row: number; col: number } | null {
  if (!Number.isInteger(edge) || edge < 0 || edge >= EDGE_COUNT) return null;
  if (edge < H_EDGES) {
    return { kind: 'h', row: Math.floor(edge / BOXES), col: edge % BOXES };
  }
  const vertical = edge - H_EDGES;
  return { kind: 'v', row: Math.floor(vertical / DOTS), col: vertical % DOTS };
}

export function boxIndex(row: number, col: number): number {
  return row * BOXES + col;
}

export function boxPosition(box: number): { row: number; col: number } {
  return { row: Math.floor(box / BOXES), col: box % BOXES };
}

/** The four edges of a box: top, bottom, left, right. */
export function boxEdges(box: number): [number, number, number, number] {
  const { row, col } = boxPosition(box);
  return [hEdge(row, col), hEdge(row + 1, col), vEdge(row, col), vEdge(row, col + 1)];
}

/** Boxes that touch an edge: one at the rim, two in the middle. */
export function boxesTouchingEdge(edge: number): number[] {
  const position = edgePosition(edge);
  if (!position) return [];
  const { kind, row, col } = position;
  if (kind === 'h') {
    const boxes: number[] = [];
    if (row > 0) boxes.push(boxIndex(row - 1, col));
    if (row < BOXES) boxes.push(boxIndex(row, col));
    return boxes;
  }
  const boxes: number[] = [];
  if (col > 0) boxes.push(boxIndex(row, col - 1));
  if (col < BOXES) boxes.push(boxIndex(row, col));
  return boxes;
}

export function setup(first: Player = 0): GameState {
  return {
    edges: Array<boolean>(EDGE_COUNT).fill(false),
    edgeOwners: Array<Owner>(EDGE_COUNT).fill(null),
    owners: Array<Owner>(BOX_COUNT).fill(null),
    turn: first,
    scores: [0, 0],
    status: 'playing',
    winner: null,
    moves: [],
    lastEdge: null,
    lastClaimed: [],
    first,
  };
}

export function legal(state: GameState, edge: number): boolean {
  return (
    state.status === 'playing' &&
    Number.isInteger(edge) &&
    edge >= 0 &&
    edge < EDGE_COUNT &&
    !state.edges[edge]
  );
}

export function legalMoves(state: GameState): number[] {
  if (state.status !== 'playing') return [];
  const moves: number[] = [];
  for (let edge = 0; edge < EDGE_COUNT; edge++) {
    if (!state.edges[edge]) moves.push(edge);
  }
  return moves;
}

/** How many sides a box already has. */
export function boxSides(state: GameState, box: number): number {
  return boxEdges(box).reduce((count, edge) => count + (state.edges[edge] ? 1 : 0), 0);
}

/** Unowned boxes with exactly three sides — the next player can take them. */
export function openBoxes(state: GameState): number[] {
  const result: number[] = [];
  for (let box = 0; box < BOX_COUNT; box++) {
    if (state.owners[box] === null && boxSides(state, box) === 3) result.push(box);
  }
  return result;
}

/**
 * Boxes that would be claimed if `edge` were drawn. Does not mutate state and
 * does not require the edge to be legal, but an already-drawn edge returns [].
 */
export function completedBoxes(state: GameState, edge: number): number[] {
  if (!Number.isInteger(edge) || edge < 0 || edge >= EDGE_COUNT) return [];
  if (state.edges[edge]) return [];
  const result: number[] = [];
  for (const box of boxesTouchingEdge(edge)) {
    if (state.owners[box] !== null) continue;
    if (boxEdges(box).every((side) => side === edge || state.edges[side])) {
      result.push(box);
    }
  }
  return result;
}

export function apply(state: GameState, edge: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (!Number.isInteger(edge) || edge < 0 || edge >= EDGE_COUNT) {
    return { ok: false, state, error: 'bad-edge' };
  }
  if (state.edges[edge]) return { ok: false, state, error: 'drawn' };

  const claimed = completedBoxes(state, edge);
  const edges = state.edges.slice();
  const edgeOwners = state.edgeOwners.slice();
  const owners = state.owners.slice();
  const scores: [number, number] = [state.scores[0], state.scores[1]];
  const player = state.turn;

  edges[edge] = true;
  edgeOwners[edge] = player;
  for (const box of claimed) {
    owners[box] = player;
    scores[player] += 1;
  }

  const done = edges.every(Boolean);
  const nextTurn = claimed.length > 0 ? player : other(player);
  const winner = done ? (scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1) : null;

  const next: GameState = {
    ...state,
    edges,
    edgeOwners,
    owners,
    turn: nextTurn,
    scores,
    status: done ? 'done' : 'playing',
    winner,
    moves: [...state.moves, edge],
    lastEdge: edge,
    lastClaimed: claimed,
  };
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: Player, edge: number): MoveResult {
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, edge);
}

export function view(state: GameState, seat: Player): SeatView {
  return {
    edges: state.edges.slice(),
    edgeOwners: state.edgeOwners.slice(),
    owners: state.owners.slice(),
    scores: [state.scores[0], state.scores[1]],
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    lastEdge: state.lastEdge,
    lastClaimed: state.lastClaimed.slice(),
    moveCount: state.moves.length,
    remaining: EDGE_COUNT - state.moves.length,
    seat,
    canMove: state.status === 'playing' && state.turn === seat,
  };
}

export function resultText(state: GameState): 'p1' | 'p2' | 'draw' | null {
  if (state.status !== 'done') return null;
  if (state.winner === null) return 'draw';
  return state.winner === 0 ? 'p1' : 'p2';
}
