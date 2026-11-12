/**
 * Hive — pure base-set rules engine.
 *
 * No DOM, clock, network or Math.random. All randomness is injected by callers.
 * The board is an axial hex grid; each occupied cell stores a stack of pieces
 * from the ground up. A beetle on top is the only way a stack grows.
 */

export type Player = 'W' | 'B';
export type PieceKind = 'queen' | 'ant' | 'beetle' | 'grasshopper' | 'spider';

export interface Piece {
  id: string;
  kind: PieceKind;
  owner: Player;
}

export interface Hex {
  q: number;
  r: number;
}

export interface Stack extends Hex {
  pieces: Piece[];
}

export type Move =
  | { type: 'place'; kind: PieceKind; at: Hex }
  | { type: 'move'; from: Hex; to: Hex }
  | { type: 'pass' };

export interface GameState {
  /** Ground-level cells keyed as `q,r`; each value is a bottom-to-top stack. */
  cells: Record<string, Piece[]>;
  turn: Player;
  status: 'playing' | 'won' | 'draw';
  winner: Player | null;
  first: Player;
  moveCount: number;
  last: Move | null;
}

export type MoveError =
  | 'game-over'
  | 'wrong-turn'
  | 'bad-seat'
  | 'ill-formed'
  | 'occupied'
  | 'hand-empty'
  | 'must-place-queen'
  | 'queen-first'
  | 'illegal';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export const PIECE_KINDS: readonly PieceKind[] = [
  'queen',
  'ant',
  'beetle',
  'grasshopper',
  'spider',
];

export const PIECE_COUNTS: Record<PieceKind, number> = {
  queen: 1,
  ant: 3,
  beetle: 2,
  grasshopper: 3,
  spider: 2,
};

export const PIECES_PER_PLAYER = 11;

export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function other(player: Player): Player {
  return player === 'W' ? 'B' : 'W';
}

export function keyOf(hex: Hex): string {
  return `${hex.q},${hex.r}`;
}

export function parseKey(key: string): Hex {
  const comma = key.indexOf(',');
  return { q: Number(key.slice(0, comma)), r: Number(key.slice(comma + 1)) };
}

export function makeHex(q: number, r: number): Hex {
  return { q, r };
}

export function neighbor(hex: Hex, direction: Hex): Hex {
  return { q: hex.q + direction.q, r: hex.r + direction.r };
}

export function neighbors(hex: Hex): Hex[] {
  return DIRECTIONS.map((direction) => neighbor(hex, direction));
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -dq - dr;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

export function setup(first: Player = 'W'): GameState {
  return {
    cells: {},
    turn: first,
    status: 'playing',
    winner: null,
    first,
    moveCount: 0,
    last: null,
  };
}

export function stackAt(state: GameState, hex: Hex): Piece[] | null {
  return state.cells[keyOf(hex)] ?? null;
}

export function topPiece(state: GameState, hex: Hex): Piece | null {
  const stack = stackAt(state, hex);
  return stack && stack.length > 0 ? stack[stack.length - 1] : null;
}

export function heightAt(state: GameState, hex: Hex): number {
  return stackAt(state, hex)?.length ?? 0;
}

function piecesOf(cells: Record<string, Piece[]>, player: Player): Piece[] {
  const pieces: Piece[] = [];
  for (const stack of Object.values(cells)) {
    for (const piece of stack) {
      if (piece.owner === player) pieces.push(piece);
    }
  }
  return pieces;
}

export function placedCount(state: GameState, player: Player): number {
  return piecesOf(state.cells, player).length;
}

export function handCounts(state: GameState, player: Player): Record<PieceKind, number> {
  const counts: Record<PieceKind, number> = {
    queen: PIECE_COUNTS.queen,
    ant: PIECE_COUNTS.ant,
    beetle: PIECE_COUNTS.beetle,
    grasshopper: PIECE_COUNTS.grasshopper,
    spider: PIECE_COUNTS.spider,
  };
  for (const piece of piecesOf(state.cells, player)) {
    counts[piece.kind] = Math.max(0, counts[piece.kind] - 1);
  }
  return counts;
}

export function queenOnBoard(state: GameState, player: Player): boolean {
  return piecesOf(state.cells, player).some((piece) => piece.kind === 'queen');
}

export function queenCell(state: GameState, player: Player): Hex | null {
  for (const [key, stack] of Object.entries(state.cells)) {
    if (stack.some((piece) => piece.owner === player && piece.kind === 'queen')) {
      return parseKey(key);
    }
  }
  return null;
}

function queenCellIn(
  cells: Record<string, Piece[]>,
  player: Player,
): Hex | null {
  for (const [key, stack] of Object.entries(cells)) {
    if (stack.some((piece) => piece.owner === player && piece.kind === 'queen')) {
      return parseKey(key);
    }
  }
  return null;
}

function surroundedIn(cells: Record<string, Piece[]>, hex: Hex): boolean {
  return neighbors(hex).every((space) => Boolean(cells[keyOf(space)]?.length));
}

export function surroundCount(state: GameState, player: Player): number {
  const queen = queenCell(state, player);
  if (!queen) return 0;
  return neighbors(queen).filter((space) => Boolean(state.cells[keyOf(space)]?.length)).length;
}

export function queenSurrounded(state: GameState, player: Player): boolean {
  const queen = queenCell(state, player);
  return queen ? surroundedIn(state.cells, queen) : false;
}

/** Completed turns by this player, derived from the alternating move count. */
export function turnsTaken(state: GameState, player: Player): number {
  return player === state.first
    ? Math.ceil(state.moveCount / 2)
    : Math.floor(state.moveCount / 2);
}

/** The player's current turn when it is theirs, otherwise their next turn. */
export function turnNumber(state: GameState, player: Player): number {
  return turnsTaken(state, player) + 1;
}

export function mustPlaceQueen(state: GameState, player: Player = state.turn): boolean {
  return !queenOnBoard(state, player) && turnNumber(state, player) >= 4;
}

/** The seven sensible opening cells. Hive is translation-invariant. */
function openingCells(): Hex[] {
  const origin: Hex = { q: 0, r: 0 };
  return [origin, ...neighbors(origin)];
}

function emptyKeys(cells: Record<string, Piece[]>, keys: Iterable<string>): string[] {
  return [...keys].filter((key) => !cells[key]?.length);
}

function adjacentKeys(hex: Hex): string[] {
  return neighbors(hex).map(keyOf);
}

/** Every empty cell where `player` may place a new piece, ignoring piece kind. */
export function placementTargets(state: GameState, player: Player = state.turn): Hex[] {
  const cells = state.cells;
  const occupied = Object.keys(cells).filter((key) => cells[key]?.length > 0);
  if (occupied.length === 0) return openingCells();

  const ownCells: string[] = [];
  const enemyCells: string[] = [];
  for (const key of occupied) {
    const stack = cells[key];
    const top = stack[stack.length - 1];
    if (top?.owner === player) ownCells.push(key);
    if (top?.owner === other(player)) enemyCells.push(key);
  }

  const ownPlaced = piecesOf(cells, player).length;
  if (ownPlaced === 0) {
    const candidates = new Set<string>();
    for (const key of enemyCells) {
      for (const space of adjacentKeys(parseKey(key))) candidates.add(space);
    }
    return emptyKeys(cells, candidates).map(parseKey);
  }

  const ownAdjacent = new Set<string>();
  for (const key of ownCells) {
    for (const space of adjacentKeys(parseKey(key))) ownAdjacent.add(space);
  }
  const enemyAdjacent = new Set<string>();
  for (const key of enemyCells) {
    for (const space of adjacentKeys(parseKey(key))) enemyAdjacent.add(space);
  }

  return emptyKeys(cells, ownAdjacent)
    .filter((key) => !enemyAdjacent.has(key))
    .map(parseKey);
}

function isPlacementLegal(
  cells: Record<string, Piece[]>,
  player: Player,
  at: Hex,
): boolean {
  if (!Number.isInteger(at.q) || !Number.isInteger(at.r)) return false;
  if (cells[keyOf(at)]?.length) return false;
  const occupied = Object.keys(cells).filter((key) => cells[key]?.length > 0);
  if (occupied.length === 0) return true;

  const ownPlaced = piecesOf(cells, player).length;
  const adjacentOwn = neighbors(at).some((space) => {
    const stack = cells[keyOf(space)];
    return stack?.[stack.length - 1]?.owner === player;
  });
  const adjacentEnemy = neighbors(at).some((space) => {
    const stack = cells[keyOf(space)];
    return stack?.[stack.length - 1]?.owner === other(player);
  });
  if (ownPlaced === 0) return adjacentEnemy;
  return adjacentOwn && !adjacentEnemy;
}

function isSingleHive(cells: Record<string, Piece[]>): boolean {
  const keys = Object.keys(cells).filter((key) => cells[key]?.length > 0);
  if (keys.length <= 1) return true;
  const seen = new Set<string>([keys[0]]);
  const queue = [keys[0]];
  while (queue.length > 0) {
    const key = queue.shift() as string;
    for (const space of adjacentKeys(parseKey(key))) {
      if (!seen.has(space) && cells[space]?.length) {
        seen.add(space);
        queue.push(space);
      }
    }
  }
  return seen.size === keys.length;
}

function gateOpen(
  cells: Record<string, Piece[]>,
  from: Hex,
  to: Hex,
  sourceLayer = 0,
  destinationLayer = 0,
): boolean {
  const common = neighbors(from).filter((space) => distance(space, to) === 1);
  const travelPlane = Math.max(sourceLayer, destinationLayer);
  return common.some(
    (space) => (cells[keyOf(space)]?.length ?? 0) <= travelPlane,
  );
}

function touchesHive(cells: Record<string, Piece[]>, hex: Hex): boolean {
  return neighbors(hex).some((space) => Boolean(cells[keyOf(space)]?.length));
}

function movedOnto(
  rest: Record<string, Piece[]>,
  piece: Piece,
  to: Hex,
): Record<string, Piece[]> {
  const key = keyOf(to);
  const target = rest[key] ?? [];
  return { ...rest, [key]: [...target, piece] };
}

function cloneCells(cells: Record<string, Piece[]>): Record<string, Piece[]> {
  const copy: Record<string, Piece[]> = {};
  for (const [key, stack] of Object.entries(cells)) copy[key] = stack.slice();
  return copy;
}

function withoutTop(
  cells: Record<string, Piece[]>,
  from: Hex,
): { cells: Record<string, Piece[]>; piece: Piece | null } {
  const copy = cloneCells(cells);
  const key = keyOf(from);
  const stack = copy[key];
  if (!stack?.length) return { cells: copy, piece: null };
  const piece = stack[stack.length - 1];
  stack.pop();
  if (stack.length === 0) delete copy[key];
  return { cells: copy, piece };
}

function antReach(cells: Record<string, Piece[]>, from: Hex): Set<string> {
  const startKey = keyOf(from);
  const seen = new Set<string>([startKey]);
  const queue: Hex[] = [from];
  while (queue.length > 0) {
    const current = queue.shift() as Hex;
    for (const next of neighbors(current)) {
      const nextKey = keyOf(next);
      if (seen.has(nextKey) || cells[nextKey]?.length) continue;
      if (!touchesHive(cells, next)) continue;
      if (!gateOpen(cells, current, next)) continue;
      seen.add(nextKey);
      queue.push(next);
    }
  }
  seen.delete(startKey);
  return seen;
}

function spiderReach(cells: Record<string, Piece[]>, from: Hex): Set<string> {
  const ends = new Set<string>();
  const startKey = keyOf(from);
  const walk = (current: Hex, visited: Set<string>, step: number): void => {
    if (step === 3) {
      ends.add(keyOf(current));
      return;
    }
    for (const next of neighbors(current)) {
      const nextKey = keyOf(next);
      if (visited.has(nextKey) || cells[nextKey]?.length) continue;
      if (!touchesHive(cells, next)) continue;
      if (!gateOpen(cells, current, next)) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(nextKey);
      walk(next, nextVisited, step + 1);
    }
  };
  walk(from, new Set([startKey]), 0);
  return ends;
}

function destinationsFor(
  state: GameState,
  from: Hex,
  piece: Piece,
): Hex[] {
  const source = stackAt(state, from);
  if (!source?.length) return [];
  const { cells: rest, piece: removed } = withoutTop(state.cells, from);
  if (!removed || removed.id !== piece.id) return [];
  if (!isSingleHive(rest)) return [];

  if (piece.kind === 'queen') {
    return neighbors(from).filter(
      (to) =>
        !rest[keyOf(to)]?.length &&
        gateOpen(rest, from, to) &&
        isSingleHive(movedOnto(rest, piece, to)),
    );
  }

  if (piece.kind === 'beetle') {
    const sourceLayer = source.length - 1;
    return neighbors(from).filter((to) => {
      const destinationLayer = rest[keyOf(to)]?.length ?? 0;
      if (!gateOpen(rest, from, to, sourceLayer, destinationLayer)) return false;
      return isSingleHive(movedOnto(rest, piece, to));
    });
  }

  if (piece.kind === 'grasshopper') {
    const jumps: Hex[] = [];
    for (const direction of DIRECTIONS) {
      let cursor = neighbor(from, direction);
      let jumped = false;
      while (rest[keyOf(cursor)]?.length) {
        jumped = true;
        cursor = neighbor(cursor, direction);
        if (Math.abs(cursor.q) + Math.abs(cursor.r) > 40) break;
      }
      if (
        jumped &&
        !rest[keyOf(cursor)]?.length &&
        isSingleHive(movedOnto(rest, piece, cursor))
      ) {
        jumps.push(cursor);
      }
    }
    return jumps;
  }

  if (piece.kind === 'ant') {
    return [...antReach(rest, from)]
      .map(parseKey)
      .filter((to) => isSingleHive(movedOnto(rest, piece, to)));
  }

  if (piece.kind === 'spider') {
    return [...spiderReach(rest, from)]
      .map(parseKey)
      .filter((to) => isSingleHive(movedOnto(rest, piece, to)));
  }

  return [];
}

function nextPieceId(
  cells: Record<string, Piece[]>,
  player: Player,
  kind: PieceKind,
): string {
  const used = new Set<string>();
  for (const stack of Object.values(cells)) {
    for (const piece of stack) used.add(piece.id);
  }
  let index = 1;
  while (used.has(`${player.toLowerCase()}-${kind}-${index}`)) index += 1;
  return `${player.toLowerCase()}-${kind}-${index}`;
}

function sameHex(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

function validatePlacement(
  state: GameState,
  player: Player,
  kind: PieceKind,
  at: Hex,
): MoveError | null {
  if (!PIECE_KINDS.includes(kind)) return 'ill-formed';
  if (!at || !Number.isInteger(at.q) || !Number.isInteger(at.r)) return 'ill-formed';
  if (handCounts(state, player)[kind] <= 0) return 'hand-empty';
  if (state.cells[keyOf(at)]?.length) return 'occupied';
  if (!isPlacementLegal(state.cells, player, at)) return 'illegal';
  return null;
}

function cloneMove(move: Move): Move {
  if (move.type === 'pass') return { type: 'pass' };
  return move.type === 'place'
    ? { type: 'place', kind: move.kind, at: { ...move.at } }
    : { type: 'move', from: { ...move.from }, to: { ...move.to } };
}

function buildNext(
  state: GameState,
  move: Move,
  player: Player,
): GameState {
  const opponent = other(player);
  let cells: Record<string, Piece[]>;

  if (move.type === 'place') {
    const piece: Piece = {
      id: nextPieceId(state.cells, player, move.kind),
      kind: move.kind,
      owner: player,
    };
    cells = cloneCells(state.cells);
    cells[keyOf(move.at)] = [piece];
  } else if (move.type === 'move') {
    const { cells: rest, piece } = withoutTop(state.cells, move.from);
    cells = rest;
    if (piece) {
      const key = keyOf(move.to);
      const target = cells[key] ?? [];
      cells[key] = [...target, piece];
    }
  } else {
    cells = cloneCells(state.cells);
  }

  const enemyQueen = queenCellIn(cells, opponent);
  const ownQueen = queenCellIn(cells, player);
  let winner: Player | null = null;
  if (enemyQueen && surroundedIn(cells, enemyQueen)) winner = player;
  else if (ownQueen && surroundedIn(cells, ownQueen)) winner = opponent;

  return {
    ...state,
    cells,
    turn: opponent,
    status: winner ? 'won' : 'playing',
    winner,
    moveCount: state.moveCount + 1,
    last: cloneMove(move),
  };
}

/** All legal moves for the side to play. */
/** Placement and movement moves, excluding an automatic pass. */
export function normalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  const player = state.turn;
  const targets = placementTargets(state, player);
  const hand = handCounts(state, player);
  const placements: Move[] = [];
  for (const kind of PIECE_KINDS) {
    if (hand[kind] <= 0) continue;
    for (const at of targets) placements.push({ type: 'place', kind, at });
  }

  if (mustPlaceQueen(state, player)) {
    const queenPlacements = placements.filter(
      (move) => move.type === 'place' && move.kind === 'queen',
    );
    // The rulebook assumes a legal queen placement exists. If the board is
    // pathologically blocked, keep play moving rather than deadlocking.
    if (queenPlacements.length > 0) return queenPlacements;
  }

  // You may not move any piece until your queen is on the board.
  if (!queenOnBoard(state, player)) return placements;

  const moves: Move[] = [...placements];
  for (const [key, stack] of Object.entries(state.cells)) {
    if (!stack.length) continue;
    const top = stack[stack.length - 1];
    if (top.owner !== player) continue;
    const from = parseKey(key);
    for (const to of destinationsFor(state, from, top)) {
      moves.push({ type: 'move', from, to });
    }
  }
  return moves;
}

/** All legal moves. A shut-out player must pass, so a lone pass is included. */
export function legalMoves(state: GameState): Move[] {
  const moves = normalMoves(state);
  if (moves.length > 0) return moves;
  return state.status === 'playing' ? [{ type: 'pass' }] : [];
}

export function legalMovesFrom(state: GameState, from: Hex): Move[] {
  const key = keyOf(from);
  return legalMoves(state).filter(
    (move) => move.type === 'move' && keyOf(move.from) === key,
  );
}

export function apply(state: GameState, move: Move): MoveResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-over' };
  if (
    !move ||
    (move.type !== 'place' && move.type !== 'move' && move.type !== 'pass')
  ) {
    return { ok: false, state, error: 'ill-formed' };
  }
  const player = state.turn;

  if (move.type === 'pass') {
    if (normalMoves(state).length > 0) return { ok: false, state, error: 'illegal' };
    const next: GameState = {
      ...state,
      turn: other(player),
      moveCount: state.moveCount + 1,
      last: { type: 'pass' },
    };
    if (normalMoves(next).length === 0) {
      next.status = 'draw';
      next.winner = null;
    }
    return { ok: true, state: next };
  }

  if (mustPlaceQueen(state, player)) {
    const queenPlacements = placementTargets(state, player);
    const queenInHand = handCounts(state, player).queen > 0;
    if (queenInHand && queenPlacements.length > 0) {
      if (!(move.type === 'place' && move.kind === 'queen')) {
        return { ok: false, state, error: 'must-place-queen' };
      }
    }
  }

  if (move.type === 'move' && !queenOnBoard(state, player)) {
    return { ok: false, state, error: 'queen-first' };
  }

  if (move.type === 'place') {
    const error = validatePlacement(state, player, move.kind, move.at);
    if (error) return { ok: false, state, error };
  } else {
    if (!move.from || !move.to) return { ok: false, state, error: 'ill-formed' };
    if (
      !Number.isInteger(move.from.q) ||
      !Number.isInteger(move.from.r) ||
      !Number.isInteger(move.to.q) ||
      !Number.isInteger(move.to.r)
    ) {
      return { ok: false, state, error: 'ill-formed' };
    }
    if (sameHex(move.from, move.to)) return { ok: false, state, error: 'illegal' };
    const source = stackAt(state, move.from);
    if (!source?.length) return { ok: false, state, error: 'illegal' };
    const top = source[source.length - 1];
    if (top.owner !== player) return { ok: false, state, error: 'illegal' };
    const legal = destinationsFor(state, move.from, top).some((to) =>
      sameHex(to, move.to),
    );
    if (!legal) return { ok: false, state, error: 'illegal' };
  }

  return { ok: true, state: buildNext(state, move, player) };
}

export function applySeat(state: GameState, seat: number, move: Move): MoveResult {
  const player: Player | null = seat === 0 ? 'W' : seat === 1 ? 'B' : null;
  if (!player) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== player) return { ok: false, state, error: 'wrong-turn' };
  return apply(state, move);
}

export interface SeatView {
  state: GameState;
  seat: number;
  player: Player;
  canMove: boolean;
}

export function view(state: GameState, seat: number): SeatView {
  const player: Player = seat === 0 ? 'W' : 'B';
  return {
    state,
    seat,
    player,
    canMove: state.status === 'playing' && state.turn === player,
  };
}

/** Occupied cells plus their empty neighbours — the useful drawable board. */
export function candidateHexes(state: GameState): Hex[] {
  const found = new Map<string, Hex>();
  const add = (hex: Hex): void => {
    found.set(keyOf(hex), hex);
  };
  const occupied = Object.entries(state.cells).filter(([, stack]) => stack.length > 0);
  if (occupied.length === 0) {
    for (const hex of openingCells()) add(hex);
  } else {
    for (const [key] of occupied) {
      const hex = parseKey(key);
      add(hex);
      for (const space of neighbors(hex)) add(space);
    }
  }
  return [...found.values()].sort((a, b) => a.r - b.r || a.q - b.q);
}

export function moveKey(move: Move): string {
  if (move.type === 'pass') return 'pass';
  if (move.type === 'place') return `place:${move.kind}:${keyOf(move.at)}`;
  return `move:${keyOf(move.from)}:${keyOf(move.to)}`;
}

export function movePieceKind(state: GameState, move: Move): PieceKind | null {
  if (move.type === 'pass') return null;
  if (move.type === 'place') return move.kind;
  const stack = stackAt(state, move.from);
  return stack?.[stack.length - 1]?.kind ?? null;
}

export function resultText(state: GameState): 'amber' | 'onyx' | 'draw' | null {
  if (state.status === 'draw') return 'draw';
  if (state.status !== 'won' || !state.winner) return null;
  return state.winner === 'W' ? 'amber' : 'onyx';
}
