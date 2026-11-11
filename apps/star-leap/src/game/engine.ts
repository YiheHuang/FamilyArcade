import {
  ADJ,
  HOLE_COUNT,
  JUMP,
  TRIANGLE_SET,
  distanceToTarget,
  startHoles,
  targetHoles,
  targetTriangle,
} from './board';
import type {
  ApplyResult,
  ErrorCode,
  GameConfig,
  GameResult,
  GameState,
  Move,
  RankingRow,
} from './types';

export const STALEMATE_TURNS = 80;
export const MAX_MOVES = 300;
export const START_MARBLES = 10;

export function setup(config: GameConfig): GameState {
  const playerCount = config.playerCount;
  if (playerCount < 2 || playerCount > 4) {
    throw new Error('playerCount must be 2, 3 or 4');
  }
  if (config.seats.length !== playerCount) {
    throw new Error('seat count mismatch');
  }

  const board = new Array<number>(HOLE_COUNT).fill(0);
  for (let seat = 0; seat < playerCount; seat++) {
    for (const hole of startHoles(playerCount, seat)) board[hole] = seat + 1;
  }

  return {
    version: 1,
    config: {
      ...config,
      seats: config.seats.map((s) => ({ ...s })),
    },
    board,
    current: 0,
    turn: 1,
    winner: null,
    noProgress: 0,
    moves: [],
    lastMove: null,
    status: 'playing',
    endReason: null,
  };
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config, seats: state.config.seats.map((s) => ({ ...s })) },
    board: [...state.board],
    moves: state.moves.map((m) => ({ ...m, path: [...m.path] })),
    lastMove: state.lastMove
      ? { ...state.lastMove, path: [...state.lastMove.path] }
      : null,
  };
}

export function ownMarbles(state: GameState, seat: number): number[] {
  const out: number[] = [];
  const v = seat + 1;
  for (let h = 0; h < HOLE_COUNT; h++) if (state.board[h] === v) out.push(h);
  return out;
}

/** All single steps and chain-jump destinations for one marble. */
export function movesForMarble(state: GameState, from: number): Move[] {
  const seat = state.board[from] - 1;
  if (seat < 0) return [];
  const moves: Move[] = [];

  for (const to of ADJ[from]) {
    if (state.board[to] === 0) {
      moves.push({ seat, from, to, path: [from, to], kind: 'step' });
    }
  }

  const seen = new Map<number, number[]>();
  const visited = new Set<number>([from]);

  const walk = (cur: number, path: number[]): void => {
    for (const over of ADJ[cur]) {
      if (state.board[over] === 0) continue; // must jump over a marble
      const to = JUMP[cur][over];
      if (to < 0) continue;
      if (state.board[to] !== 0) continue; // landing must be empty
      if (visited.has(to)) continue;
      const nextPath = [...path, to];
      if (!seen.has(to)) seen.set(to, nextPath);
      visited.add(to);
      walk(to, nextPath);
      visited.delete(to);
    }
  };

  walk(from, [from]);

  for (const [to, path] of seen) {
    moves.push({ seat, from, to, path, kind: 'jump' });
  }

  // House rule: a marble that has reached its target triangle stays there.
  // It may still step between holes inside the triangle, but never leave.
  const target = TRIANGLE_SET[targetTriangle(state.config.playerCount, seat)];
  if (target.has(from)) {
    return moves.filter((m) => m.kind === 'step' && target.has(m.to));
  }
  return moves;
}

export function legalMoves(state: GameState, seat: number): Move[] {
  if (state.status === 'ended' || state.current !== seat) return [];
  const out: Move[] = [];
  for (const from of ownMarbles(state, seat)) out.push(...movesForMarble(state, from));
  return out;
}

export function mustPass(state: GameState, seat: number): boolean {
  return state.status === 'playing' && state.current === seat && legalMoves(state, seat).length === 0;
}

export function isHome(state: GameState, seat: number): boolean {
  const target = TRIANGLE_SET[targetTriangle(state.config.playerCount, seat)];
  const v = seat + 1;
  for (const hole of target) if (state.board[hole] !== v) return false;
  return true;
}

export function homeCount(state: GameState, seat: number): number {
  const target = TRIANGLE_SET[targetTriangle(state.config.playerCount, seat)];
  const v = seat + 1;
  let n = 0;
  for (const hole of target) if (state.board[hole] === v) n++;
  return n;
}

/** Sum of BFS distances from every marble to the target triangle. Lower is better. */
export function distanceSum(state: GameState, seat: number): number {
  const dist = distanceToTarget(state.config.playerCount, seat);
  const v = seat + 1;
  let sum = 0;
  for (let h = 0; h < HOLE_COUNT; h++) if (state.board[h] === v) sum += dist[h];
  return sum;
}

/** Apply a move that is already known to be legal (AI/search/replay fast path). */
export function applyUnchecked(state: GameState, move: Move): GameState {
  const next = cloneState(state);
  next.moves.push({ ...move, path: [...move.path] });
  next.lastMove = next.moves[next.moves.length - 1];

  if (move.kind === 'pass') {
    next.noProgress++;
  } else {
    const seat = move.seat;
    next.board[move.from] = 0;
    next.board[move.to] = seat + 1;
    const target = TRIANGLE_SET[targetTriangle(state.config.playerCount, seat)];
    next.noProgress = target.has(move.to) ? 0 : next.noProgress + 1;
  }

  const finished = isHome(next, next.current);
  if (finished) {
    next.status = 'ended';
    next.winner = next.current;
    next.endReason = 'home';
    return next;
  }

  next.current = (next.current + 1) % next.config.playerCount;
  next.turn++;

  if (next.noProgress >= STALEMATE_TURNS) {
    next.status = 'ended';
    next.winner = null;
    next.endReason = 'stalemate';
  } else if (next.moves.length >= MAX_MOVES) {
    // Hard safety net: a family game must end, even if both sides shuffle.
    next.status = 'ended';
    next.winner = null;
    next.endReason = 'cap';
  }
  return next;
}

function sameMove(a: Move, b: Move): boolean {
  if (a.seat !== b.seat || a.from !== b.from || a.to !== b.to || a.kind !== b.kind) {
    return false;
  }
  if (a.path.length !== b.path.length) return false;
  for (let i = 0; i < a.path.length; i++) if (a.path[i] !== b.path[i]) return false;
  return true;
}

export function apply(state: GameState, move: Move): ApplyResult {
  if (state.status === 'ended') return { ok: false, reason: 'game-over' };
  if (move.seat !== state.current) return { ok: false, reason: 'not-your-turn' };

  if (move.kind === 'pass') {
    if (legalMoves(state, move.seat).length > 0) {
      return { ok: false, reason: 'pass-not-allowed' };
    }
    return { ok: true, state: applyUnchecked(state, move) };
  }

  if (state.board[move.from] !== move.seat + 1) return { ok: false, reason: 'no-marble' };
  if (state.board[move.to] !== 0) return { ok: false, reason: 'occupied' };

  const legal = legalMoves(state, move.seat);
  const found = legal.find((m) => sameMove(m, move));
  if (!found) return { ok: false, reason: 'illegal-move' };
  return { ok: true, state: applyUnchecked(state, found) };
}

export function ranking(state: GameState): RankingRow[] {
  const rows: RankingRow[] = state.config.seats.map((s, seat) => ({
    seat,
    name: s.name,
    home: homeCount(state, seat),
    distance: distanceSum(state, seat),
    remaining: START_MARBLES - homeCount(state, seat),
    rank: 0,
  }));
  rows.sort((a, b) => {
    if (b.home !== a.home) return b.home - a.home;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.seat - b.seat;
  });
  let rank = 0;
  let prev: RankingRow | null = null;
  for (const row of rows) {
    if (!prev || row.home !== prev.home || row.distance !== prev.distance) rank++;
    row.rank = rank;
    prev = row;
  }
  return rows;
}

export function result(state: GameState): GameResult | null {
  if (state.status !== 'ended') return null;
  return {
    winner: state.winner,
    reason: state.endReason === 'home' ? 'home' : state.endReason === 'cap' ? 'cap' : 'stalemate',
    ranking: ranking(state),
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const parsed = JSON.parse(json) as GameState;
  if (parsed.version !== 1) throw new Error(`unsupported save version: ${String(parsed.version)}`);
  if (!Array.isArray(parsed.board) || parsed.board.length !== HOLE_COUNT) {
    throw new Error('bad board length');
  }
  if (!Array.isArray(parsed.config?.seats) || parsed.config.seats.length !== parsed.config.playerCount) {
    throw new Error('bad seat config');
  }
  return parsed;
}

export function replay(config: GameConfig, moves: Move[]): GameState {
  let state = setup(config);
  for (const move of moves) {
    const out = apply(state, move);
    if (!out.ok) throw new Error(`illegal replay move: ${out.reason}`);
    state = out.state;
  }
  return state;
}

export function errorTextKey(reason: ErrorCode): string {
  return `error.${reason}`;
}

export { startHoles, targetHoles, targetTriangle, TRIANGLE_SET };
