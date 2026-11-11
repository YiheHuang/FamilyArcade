/**
 * Fleet engine — pure, deterministic battleship.
 *
 * No DOM, network, clock or Math.random. Randomness is injected as `Rng`.
 * Coordinates are row-major indexes 0..99; row 0 is the top row.
 */

export const BOARD_SIZE = 10;
export type Seat = 0 | 1;
export type Rng = () => number;

export const FLEET = [
  { id: 'carrier', length: 5 },
  { id: 'battleship', length: 4 },
  { id: 'cruiser', length: 3 },
  { id: 'submarine', length: 3 },
  { id: 'destroyer', length: 2 },
] as const;

export type ShipId = (typeof FLEET)[number]['id'];
export type Phase = 'placing' | 'playing' | 'finished';
export type ShotResult = 'miss' | 'hit' | 'sunk';

export interface Ship {
  id: ShipId;
  cells: number[];
}

export interface Shot {
  cell: number;
  hit: boolean;
  ship: ShipId | null;
}

export interface Board {
  ships: Ship[];
  shots: Shot[];
}

export interface ShotMove {
  seat: Seat;
  cell: number;
  result: ShotResult;
  ship: ShipId | null;
}

export interface GameState {
  boards: [Board, Board];
  phase: Phase;
  ready: [boolean, boolean];
  turn: Seat;
  first: Seat;
  winner: Seat | null;
  moves: ShotMove[];
}

export type EngineError =
  | 'wrong-phase'
  | 'bad-ship'
  | 'bad-start'
  | 'occupied'
  | 'already-placed'
  | 'not-ready'
  | 'bad-cell'
  | 'already-shot'
  | 'wrong-turn'
  | 'game-over';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: EngineError;
  shot?: { cell: number; result: ShotResult; ship: ShipId | null };
}

export interface SeenShip {
  id: ShipId;
  length: number;
  cells: number[];
  sunk: boolean;
}

export interface SeenShot {
  cell: number;
  result: ShotResult;
}

export interface SeenFleetShip {
  id: ShipId;
  length: number;
  sunk: boolean;
}

/** A per-seat view. It never contains the opponent's hulls until they sink. */
export interface SeatView {
  seat: Seat;
  phase: Phase;
  turn: Seat;
  first: Seat;
  winner: Seat | null;
  ready: [boolean, boolean];
  canPlace: boolean;
  canFire: boolean;
  myShips: SeenShip[];
  /** Shots the opponent has fired at my waters. */
  ownBoardShots: SeenShot[];
  /** Shots I have fired at enemy waters. */
  enemyBoardShots: SeenShot[];
  /** The enemy roster: length and sunk status, never live hull positions. */
  enemyFleet: SeenFleetShip[];
  /** Sunk hulls (or every hull after the game ends). */
  enemyShips: SeenShip[];
  lastMove: ShotMove | null;
  moveCount: number;
}

const OTHER: Record<Seat, Seat> = { 0: 1, 1: 0 };
export const otherSeat = (seat: Seat): Seat => OTHER[seat];

export function emptyBoard(): Board {
  return { ships: [], shots: [] };
}

export function setup(first: Seat = 0): GameState {
  return {
    boards: [emptyBoard(), emptyBoard()],
    phase: 'placing',
    ready: [false, false],
    turn: first,
    first,
    winner: null,
    moves: [],
  };
}

export function shipSpec(id: ShipId): (typeof FLEET)[number] {
  const spec = FLEET.find((item) => item.id === id);
  if (!spec) throw new Error(`Unknown ship: ${id}`);
  return spec;
}

export function cellRow(cell: number): number {
  return Math.floor(cell / BOARD_SIZE);
}

export function cellCol(cell: number): number {
  return cell % BOARD_SIZE;
}

export function coordLabel(cell: number): string {
  if (!Number.isInteger(cell) || cell < 0 || cell >= BOARD_SIZE * BOARD_SIZE) return '—';
  return `${String.fromCharCode(65 + cellRow(cell))}${cellCol(cell) + 1}`;
}

/** Ten-cell labels, A1 through J10. Useful for tests and accessible text. */
export function cellName(cell: number): string {
  return coordLabel(cell);
}

/** The cells a hull would occupy, or null when it runs off the chart. */
export function shipCells(start: number, length: number, horizontal: boolean): number[] | null {
  if (!Number.isInteger(start) || start < 0 || start >= BOARD_SIZE * BOARD_SIZE) return null;
  if (!Number.isInteger(length) || length < 1) return null;
  const row = cellRow(start);
  const col = cellCol(start);
  if (horizontal && col + length > BOARD_SIZE) return null;
  if (!horizontal && row + length > BOARD_SIZE) return null;
  return Array.from({ length }, (_, index) => start + (horizontal ? index : index * BOARD_SIZE));
}

export function findShip(board: Board, id: ShipId): Ship | undefined {
  return board.ships.find((ship) => ship.id === id);
}

export function shipAt(board: Board, cell: number): Ship | undefined {
  return board.ships.find((ship) => ship.cells.includes(cell));
}

export function shotAt(board: Board, cell: number): Shot | undefined {
  return board.shots.find((shot) => shot.cell === cell);
}

export function isShipSunk(board: Board, ship: Ship): boolean {
  return ship.cells.every((cell) => board.shots.some((shot) => shot.cell === cell && shot.hit));
}

export function isFleetSunk(board: Board): boolean {
  return board.ships.length === FLEET.length && board.ships.every((ship) => isShipSunk(board, ship));
}

export function fleetComplete(state: GameState, seat: Seat): boolean {
  const board = state.boards[seat];
  return FLEET.every((spec) => board.ships.some((ship) => ship.id === spec.id));
}

function validFleetShape(board: Board): boolean {
  const ids = new Set<ShipId>();
  const used = new Set<number>();
  for (const ship of board.ships) {
    if (!FLEET.some((spec) => spec.id === ship.id) || ids.has(ship.id)) return false;
    ids.add(ship.id);
    const spec = shipSpec(ship.id);
    if (!Array.isArray(ship.cells) || ship.cells.length !== spec.length) return false;
    const expected = shipCells(ship.cells[0], spec.length, ship.cells.length > 1 && ship.cells[1] === ship.cells[0] + 1);
    if (!expected) return false;
    if (expected.some((cell, index) => cell !== ship.cells[index])) return false;
    for (const cell of ship.cells) {
      if (used.has(cell)) return false;
      used.add(cell);
    }
  }
  return ids.size === FLEET.length;
}

export function canPlaceShip(
  state: GameState,
  seat: Seat,
  id: ShipId,
  start: number,
  horizontal: boolean,
): boolean {
  if (state.phase !== 'placing') return false;
  const spec = FLEET.find((item) => item.id === id);
  if (!spec) return false;
  const board = state.boards[seat];
  if (findShip(board, id)) return false;
  const cells = shipCells(start, spec.length, horizontal);
  if (!cells) return false;
  const taken = new Set(board.ships.flatMap((ship) => ship.cells));
  return cells.every((cell) => !taken.has(cell));
}

export function placeShip(
  state: GameState,
  seat: Seat,
  id: ShipId,
  start: number,
  horizontal: boolean,
): MoveResult {
  if (state.phase !== 'placing') return { ok: false, state, error: 'wrong-phase' };
  const spec = FLEET.find((item) => item.id === id);
  if (!spec) return { ok: false, state, error: 'bad-ship' };
  const board = state.boards[seat];
  if (findShip(board, id)) return { ok: false, state, error: 'already-placed' };
  const cells = shipCells(start, spec.length, horizontal);
  if (!cells) return { ok: false, state, error: 'bad-start' };
  const taken = new Set(board.ships.flatMap((ship) => ship.cells));
  if (cells.some((cell) => taken.has(cell))) return { ok: false, state, error: 'occupied' };
  const boards: [Board, Board] = [state.boards[0], state.boards[1]];
  boards[seat] = { ...board, ships: [...board.ships, { id, cells }] };
  return { ok: true, state: { ...state, boards } };
}

export function removeShip(state: GameState, seat: Seat, id: ShipId): GameState {
  if (state.phase !== 'placing') return state;
  const board = state.boards[seat];
  if (!findShip(board, id)) return state;
  const boards: [Board, Board] = [state.boards[0], state.boards[1]];
  boards[seat] = { ...board, ships: board.ships.filter((ship) => ship.id !== id) };
  return { ...state, boards };
}

export function clearFleet(state: GameState, seat: Seat): GameState {
  if (state.phase !== 'placing') return state;
  const boards: [Board, Board] = [state.boards[0], state.boards[1]];
  boards[seat] = { ...boards[seat], ships: [] };
  return { ...state, boards };
}

/** Validate and install a complete five-ship fleet. */
export function placeFleet(state: GameState, seat: Seat, ships: Ship[]): MoveResult {
  if (state.phase !== 'placing') return { ok: false, state, error: 'wrong-phase' };
  const trial: Board = { ships: ships.map((ship) => ({ id: ship.id, cells: [...ship.cells] })), shots: [] };
  if (!validFleetShape(trial)) return { ok: false, state, error: 'bad-ship' };
  const boards: [Board, Board] = [state.boards[0], state.boards[1]];
  boards[seat] = { ...boards[seat], ships: trial.ships };
  return { ok: true, state: { ...state, boards } };
}

/**
 * Build a random legal fleet. Tries random starts first, then falls back to a
 * fixed layout so it always terminates.
 */
export function randomFleet(rng: Rng): Ship[] {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ships: Ship[] = [];
    const used = new Set<number>();
    let failed = false;
    for (const spec of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 300; tries += 1) {
        const horizontal = rng() < 0.5;
        const row = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor(rng() * BOARD_SIZE)));
        const col = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor(rng() * BOARD_SIZE)));
        const cells = shipCells(row * BOARD_SIZE + col, spec.length, horizontal);
        if (!cells || cells.some((cell) => used.has(cell))) continue;
        ships.push({ id: spec.id, cells });
        cells.forEach((cell) => used.add(cell));
        placed = true;
        break;
      }
      if (!placed) {
        failed = true;
        break;
      }
    }
    if (!failed) return ships;
  }
  return [
    { id: 'carrier', cells: [0, 1, 2, 3, 4] },
    { id: 'battleship', cells: [10, 20, 30, 40] },
    { id: 'cruiser', cells: [50, 51, 52] },
    { id: 'submarine', cells: [60, 70, 80] },
    { id: 'destroyer', cells: [90, 91] },
  ];
}

export function autoPlace(state: GameState, seat: Seat, rng: Rng): MoveResult {
  return placeFleet(state, seat, randomFleet(rng));
}

export function readyUp(state: GameState, seat: Seat): MoveResult {
  if (state.phase !== 'placing') return { ok: false, state, error: 'wrong-phase' };
  if (!fleetComplete(state, seat)) return { ok: false, state, error: 'not-ready' };
  const ready: [boolean, boolean] = [state.ready[0], state.ready[1]];
  ready[seat] = true;
  const both = ready[0] && ready[1];
  return {
    ok: true,
    state: {
      ...state,
      ready,
      phase: both ? 'playing' : 'placing',
      turn: both ? state.first : state.turn,
    },
  };
}

function resultOf(board: Board, shot: Shot): ShotResult {
  if (!shot.hit) return 'miss';
  const ship = shot.ship ? board.ships.find((item) => item.id === shot.ship) : undefined;
  return ship && isShipSunk(board, ship) ? 'sunk' : 'hit';
}

function seenShots(board: Board, shots: Shot[]): SeenShot[] {
  return shots.map((shot) => ({ cell: shot.cell, result: resultOf(board, shot) }));
}

export function fire(state: GameState, seat: Seat, cell: number): MoveResult {
  if (state.phase === 'finished') return { ok: false, state, error: 'game-over' };
  if (state.phase !== 'playing') return { ok: false, state, error: 'wrong-phase' };
  if (!Number.isInteger(cell) || cell < 0 || cell >= BOARD_SIZE * BOARD_SIZE) {
    return { ok: false, state, error: 'bad-cell' };
  }
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  const targetSeat = otherSeat(seat);
  const target = state.boards[targetSeat];
  if (shotAt(target, cell)) return { ok: false, state, error: 'already-shot' };
  const hitShip = shipAt(target, cell);
  const shot: Shot = { cell, hit: Boolean(hitShip), ship: hitShip?.id ?? null };
  const boards: [Board, Board] = [state.boards[0], state.boards[1]];
  boards[targetSeat] = { ...target, shots: [...target.shots, shot] };
  const hitBoard = boards[targetSeat];
  const result: ShotResult = !hitShip ? 'miss' : isShipSunk(hitBoard, hitShip) ? 'sunk' : 'hit';
  const move: ShotMove = {
    seat,
    cell,
    result,
    ship: hitShip ? hitShip.id : null,
  };
  const won = isFleetSunk(hitBoard);
  return {
    ok: true,
    state: {
      ...state,
      boards,
      moves: [...state.moves, move],
      phase: won ? 'finished' : 'playing',
      winner: won ? seat : null,
      turn: won ? seat : targetSeat,
    },
    shot: { cell, result, ship: result === 'sunk' ? (hitShip?.id ?? null) : null },
  };
}

export function view(state: GameState, seat: Seat): SeatView {
  const mine = state.boards[seat];
  const enemy = state.boards[otherSeat(seat)];
  const myShips: SeenShip[] = mine.ships.map((ship) => ({
    id: ship.id,
    length: shipSpec(ship.id).length,
    cells: [...ship.cells],
    sunk: isShipSunk(mine, ship),
  }));
  const revealAll = state.phase === 'finished';
  const enemyShips: SeenShip[] = enemy.ships
    .filter((ship) => revealAll || isShipSunk(enemy, ship))
    .map((ship) => ({
      id: ship.id,
      length: shipSpec(ship.id).length,
      cells: [...ship.cells],
      sunk: isShipSunk(enemy, ship),
    }));
  const lastPlayed = state.moves.length ? state.moves[state.moves.length - 1] : null;
  const lastMove: ShotMove | null = lastPlayed
    ? { ...lastPlayed, ship: lastPlayed.result === 'sunk' ? lastPlayed.ship : null }
    : null;
  return {
    seat,
    phase: state.phase,
    turn: state.turn,
    first: state.first,
    winner: state.winner,
    ready: [state.ready[0], state.ready[1]],
    canPlace: state.phase === 'placing' && !state.ready[seat],
    canFire: state.phase === 'playing' && state.turn === seat,
    myShips,
    ownBoardShots: seenShots(mine, mine.shots),
    enemyBoardShots: seenShots(enemy, enemy.shots),
    enemyFleet: FLEET.map((spec) => {
      const ship = enemy.ships.find((item) => item.id === spec.id);
      return { id: spec.id, length: spec.length, sunk: ship ? isShipSunk(enemy, ship) : false };
    }),
    enemyShips,
    lastMove,
    moveCount: state.moves.length,
  };
}

export function remainingShips(v: SeatView): number {
  return v.enemyFleet.filter((ship) => !ship.sunk).length;
}

export function shotCount(state: GameState, seat: Seat): number {
  return state.boards[otherSeat(seat)].shots.length;
}
