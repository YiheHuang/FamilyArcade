/**
 * Tables — a pure, deterministic backgammon engine.
 *
 * No DOM, clock, network or Math.random. Dice are supplied by the caller.
 *
 * Board indexing: 24 points, 0..23. Point 0 is White's 1-point and point 23 is
 * White's 24-point. White travels 23 -> 0 and bears off below 0; Black travels
 * 0 -> 23 and bears off above 23. White's home board is 0..5, Black's is 18..23.
 * Checkers are stored signed: positive = White, negative = Black.
 */

export type Side = 'W' | 'B';
export type MoveFrom = number | 'bar';
export type MoveTo = number | 'off';
export type GameStatus = 'awaiting-roll' | 'moving' | 'finished';

export interface Move {
  from: MoveFrom;
  to: MoveTo;
  die: number;
  hit: boolean;
}

export interface LoggedMove {
  turn: number;
  side: Side;
  move: Move;
}

export interface GameState {
  points: number[];
  bar: Record<Side, number>;
  off: Record<Side, number>;
  turn: Side;
  status: GameStatus;
  dice: number[];
  roll: [number, number] | null;
  winner: Side | null;
  first: Side;
  turnNo: number;
  lastMove: Move | null;
  turnMoves: Move[];
  log: LoggedMove[];
}

export type MoveError =
  | 'game-over'
  | 'wrong-phase'
  | 'wrong-turn'
  | 'bad-dice'
  | 'bad-die'
  | 'bad-from'
  | 'no-checker'
  | 'bar-first'
  | 'blocked'
  | 'illegal'
  | 'cannot-bear-off'
  | 'must-move'
  | 'suboptimal';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface TurnSequence {
  moves: Move[];
  state: GameState;
}

export interface SeatView {
  seat: number;
  side: Side;
  state: GameState;
  canRoll: boolean;
  canMove: boolean;
}

export const POINTS = 24;
export const CHECKERS = 15;
export const HOME: Record<Side, readonly number[]> = {
  W: [0, 1, 2, 3, 4, 5],
  B: [18, 19, 20, 21, 22, 23],
};

export const other = (side: Side): Side => (side === 'W' ? 'B' : 'W');
export const sideOfSeat = (seat: number): Side => (seat === 0 ? 'W' : 'B');
export const seatOfSide = (side: Side): number => (side === 'W' ? 0 : 1);

function emptyCounts(): Record<Side, number> {
  return { W: 0, B: 0 };
}

export function setup(first: Side = 'W'): GameState {
  const points = Array<number>(POINTS).fill(0);
  // Standard opening position, using point 0 as White's 1-point.
  points[23] = 2; // White on 24
  points[12] = 5; // White on 13
  points[7] = 3; // White on 8
  points[5] = 5; // White on 6
  points[0] = -2; // Black on 1
  points[11] = -5; // Black on 12
  points[16] = -3; // Black on 17
  points[18] = -5; // Black on 19
  return {
    points,
    bar: emptyCounts(),
    off: emptyCounts(),
    turn: first,
    status: 'awaiting-roll',
    dice: [],
    roll: null,
    winner: null,
    first,
    turnNo: 1,
    lastMove: null,
    turnMoves: [],
    log: [],
  };
}

export function ownCount(state: GameState, side: Side, point: number): number {
  const value = state.points[point] ?? 0;
  return side === 'W' ? Math.max(0, value) : Math.max(0, -value);
}

export function opponentCount(state: GameState, side: Side, point: number): number {
  return ownCount(state, other(side), point);
}

export function pipCount(state: GameState, side: Side): number {
  let pips = state.bar[side] * 25;
  for (let point = 0; point < POINTS; point += 1) {
    const distance = side === 'W' ? point + 1 : POINTS - point;
    pips += ownCount(state, side, point) * distance;
  }
  return pips;
}

export function checkersOnBoard(state: GameState, side: Side): number {
  let total = state.bar[side] + state.off[side];
  for (let point = 0; point < POINTS; point += 1) total += ownCount(state, side, point);
  return total;
}

export function allHome(state: GameState, side: Side): boolean {
  if (state.bar[side] > 0) return false;
  const home = new Set(HOME[side]);
  for (let point = 0; point < POINTS; point += 1) {
    if (ownCount(state, side, point) > 0 && !home.has(point)) return false;
  }
  return true;
}

export function distanceToOff(side: Side, point: number): number {
  return side === 'W' ? point + 1 : POINTS - point;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    points: state.points.slice(),
    bar: { ...state.bar },
    off: { ...state.off },
    dice: state.dice.slice(),
    turnMoves: state.turnMoves.slice(),
    log: state.log.slice(),
  };
}

/** Every single-die move that is geometrically possible, before turn-length rules. */
export function atomicMoves(state: GameState): Move[] {
  if (state.status !== 'moving') return [];
  const side = state.turn;
  const sign = side === 'W' ? -1 : 1;
  const dice = Array.from(new Set(state.dice)).sort((a, b) => a - b);
  const sources: MoveFrom[] = [];
  if (state.bar[side] > 0) {
    sources.push('bar');
  } else {
    for (let point = 0; point < POINTS; point += 1) {
      if (ownCount(state, side, point) > 0) sources.push(point);
    }
  }

  const moves: Move[] = [];
  for (const die of dice) {
    for (const from of sources) {
      if (from === 'bar') {
        const to = side === 'W' ? POINTS - die : die - 1;
        if (opponentCount(state, side, to) < 2) {
          moves.push({ from, to, die, hit: opponentCount(state, side, to) === 1 });
        }
        continue;
      }
      const to = from + sign * die;
      if (to >= 0 && to < POINTS) {
        if (opponentCount(state, side, to) < 2) {
          moves.push({ from, to, die, hit: opponentCount(state, side, to) === 1 });
        }
        continue;
      }
      if (allHome(state, side) && canBearOff(state, side, from, die)) {
        moves.push({ from, to: 'off', die, hit: false });
      }
    }
  }
  return moves;
}

export function canBearOff(state: GameState, side: Side, from: number, die: number): boolean {
  if (side !== state.turn) return false;
  if (state.bar[side] > 0 || !allHome(state, side)) return false;
  if (from < 0 || from >= POINTS || ownCount(state, side, from) <= 0) return false;
  const distance = distanceToOff(side, from);
  if (die < distance) return false;
  if (die === distance) return true;
  // A larger die may only remove a checker from the furthest occupied point.
  if (side === 'W') {
    for (let p = from + 1; p <= 5; p += 1) if (ownCount(state, side, p) > 0) return false;
  } else {
    for (let p = 18; p < from; p += 1) if (ownCount(state, side, p) > 0) return false;
  }
  return true;
}

function validateAtomic(state: GameState, move: Move): MoveError | null {
  if (state.status === 'finished') return 'game-over';
  if (state.status !== 'moving') return 'wrong-phase';
  const side = state.turn;
  if (!Number.isInteger(move.die) || !state.dice.includes(move.die)) return 'bad-die';

  if (move.from === 'bar') {
    if (state.bar[side] <= 0) return 'no-checker';
  } else {
    if (!Number.isInteger(move.from) || move.from < 0 || move.from >= POINTS) return 'bad-from';
    if (state.bar[side] > 0) return 'bar-first';
    if (ownCount(state, side, move.from) <= 0) return 'no-checker';
  }

  if (move.to === 'off') {
    if (move.from === 'bar') return 'illegal';
    if (!allHome(state, side)) return 'cannot-bear-off';
    if (!canBearOff(state, side, move.from, move.die)) return 'cannot-bear-off';
    return null;
  }

  if (!Number.isInteger(move.to) || move.to < 0 || move.to >= POINTS) return 'illegal';
  const expected =
    move.from === 'bar'
      ? side === 'W'
        ? POINTS - move.die
        : move.die - 1
      : move.from + (side === 'W' ? -move.die : move.die);
  if (move.to !== expected) return 'illegal';
  if (opponentCount(state, side, move.to) >= 2) return 'blocked';
  return null;
}

/** Apply one move without turn bookkeeping. Internal, but useful in tests. */
function applyRaw(state: GameState, move: Move): GameState {
  const next = cloneState(state);
  const side = next.turn;
  if (move.from === 'bar') next.bar[side] -= 1;
  else next.points[move.from] -= side === 'W' ? 1 : -1;

  if (move.to === 'off') {
    next.off[side] += 1;
  } else {
    if (move.hit) {
      const victim = other(side);
      next.points[move.to] = 0;
      next.bar[victim] += 1;
    }
    next.points[move.to] += side === 'W' ? 1 : -1;
  }

  const dice = next.dice.slice();
  const index = dice.indexOf(move.die);
  if (index >= 0) dice.splice(index, 1);
  next.dice = dice;
  next.lastMove = move;
  next.turnMoves.push(move);
  next.log.push({ turn: next.turnNo, side, move });
  if (next.off[side] >= CHECKERS) {
    next.status = 'finished';
    next.winner = side;
    next.dice = [];
  }
  return next;
}

function moveKey(move: Move): string {
  return `${move.from}>${move.to}:${move.die}`;
}

function sequenceKey(sequence: Move[]): string {
  return sequence.map(moveKey).join('|');
}

/** All optimal complete sequences for the dice currently on the table. */
export function legalSequences(state: GameState): TurnSequence[] {
  if (state.status !== 'moving') return [];
  const found: TurnSequence[] = [];

  const walk = (current: GameState, moves: Move[]) => {
    if (current.status === 'finished' || current.dice.length === 0) {
      found.push({ moves, state: current });
      return;
    }
    const atomics = atomicMoves(current);
    if (atomics.length === 0) {
      found.push({ moves, state: current });
      return;
    }
    const dice = Array.from(new Set(current.dice));
    for (const die of dice) {
      for (const move of atomics.filter((item) => item.die === die)) {
        walk(applyRaw(current, move), [...moves, move]);
      }
    }
  };

  walk(state, []);
  const played = found.filter((item) => item.moves.length > 0);
  if (played.length === 0) return [];

  const maxUsed = Math.max(...played.map((item) => item.moves.length));
  let optimal = played.filter((item) => item.moves.length === maxUsed);

  if (maxUsed === 1) {
    const highestDie = Math.max(...optimal.map((item) => item.moves[0].die));
    optimal = optimal.filter((item) => item.moves[0].die === highestDie);
  }

  const seen = new Set<string>();
  const unique: TurnSequence[] = [];
  for (const item of optimal) {
    const key = sequenceKey(item.moves);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/** The moves that may legally start (or continue) a turn. */
export function legalMoves(state: GameState): Move[] {
  const seen = new Set<string>();
  const moves: Move[] = [];
  for (const sequence of legalSequences(state)) {
    const first = sequence.moves[0];
    if (!first) continue;
    const key = moveKey(first);
    if (seen.has(key)) continue;
    seen.add(key);
    moves.push(first);
  }
  return moves.sort((a, b) => {
    const fromA = a.from === 'bar' ? -1 : a.from;
    const fromB = b.from === 'bar' ? -1 : b.from;
    return fromA - fromB || a.die - b.die || String(a.to).localeCompare(String(b.to));
  });
}

function finishTurn(state: GameState): GameState {
  if (state.status !== 'moving') return state;
  const next = cloneState(state);
  next.turn = other(state.turn);
  next.status = 'awaiting-roll';
  next.dice = [];
  next.roll = null;
  next.turnMoves = [];
  next.turnNo += 1;
  return next;
}

export function endTurn(state: GameState): MoveResult {
  if (state.status === 'finished') return { ok: false, state, error: 'game-over' };
  if (state.status !== 'moving') return { ok: false, state, error: 'wrong-phase' };
  if (legalMoves(state).length > 0) return { ok: false, state, error: 'must-move' };
  return { ok: true, state: finishTurn(state) };
}

export function applyMove(state: GameState, move: Move): MoveResult {
  if (state.status === 'finished') return { ok: false, state, error: 'game-over' };
  if (state.status !== 'moving') return { ok: false, state, error: 'wrong-phase' };
  const invalid = validateAtomic(state, move);
  if (invalid) return { ok: false, state, error: invalid };

  const allowed = legalMoves(state).find((candidate) => moveKey(candidate) === moveKey(move));
  if (!allowed) return { ok: false, state, error: 'suboptimal' };

  // Never trust a caller-supplied hit flag (LAN intents are untrusted JSON):
  // derive it from the board, then apply the move.
  let next = applyRaw(state, { ...move, hit: allowed.hit });
  if (next.status === 'finished') {
    next.winner = next.winner ?? state.turn;
    return { ok: true, state: next };
  }
  if (next.dice.length === 0 || legalSequences(next).length === 0) {
    next = finishTurn(next);
  }
  return { ok: true, state: next };
}

export function roll(state: GameState, a: number, b: number): MoveResult {
  if (state.status === 'finished') return { ok: false, state, error: 'game-over' };
  if (state.status !== 'awaiting-roll') return { ok: false, state, error: 'wrong-phase' };
  if (![a, b].every((die) => Number.isInteger(die) && die >= 1 && die <= 6)) {
    return { ok: false, state, error: 'bad-dice' };
  }
  const next = cloneState(state);
  next.dice = a === b ? [a, a, a, a] : [a, b];
  next.roll = [a, b];
  next.status = 'moving';
  next.turnMoves = [];
  return { ok: true, state: next };
}

export function applySeat(state: GameState, seat: number, move: Move): MoveResult {
  if (state.status === 'finished') return { ok: false, state, error: 'game-over' };
  if (state.turn !== sideOfSeat(seat)) return { ok: false, state, error: 'wrong-turn' };
  return applyMove(state, move);
}

export function view(state: GameState, seat: number): SeatView {
  const side = sideOfSeat(seat);
  return {
    seat,
    side,
    state,
    canRoll: state.status === 'awaiting-roll' && state.turn === side,
    canMove: state.status === 'moving' && state.turn === side && legalMoves(state).length > 0,
  };
}

export function resultText(state: GameState): 'white' | 'black' | null {
  if (state.status !== 'finished' || !state.winner) return null;
  return state.winner === 'W' ? 'white' : 'black';
}

/** A small deterministic RNG for simulations, tests and reproducible demos. */
export function seededRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
