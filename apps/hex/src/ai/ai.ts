import {
  CELL_COUNT,
  SIZE,
  apply,
  colOf,
  legalMoves,
  opponent,
  rowOf,
  winningPath,
  type Cell,
  type GameState,
  type Player,
} from '../game/hex';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type HintReason = 'win' | 'block' | 'connect' | 'route' | 'center' | 'space';

type Rng = () => number;

const CENTER = Math.floor(SIZE / 2);

/** Shortest connection cost: own stones are free, empty cells cost one. */
export function shortestDistance(board: Cell[], player: Player): number {
  const cost = new Float64Array(CELL_COUNT);
  cost.fill(Infinity);
  const deque: number[] = [];
  const other = opponent(player);

  const relax = (index: number, value: number) => {
    if (value >= cost[index]) return;
    cost[index] = value;
    if (value === 0) deque.unshift(index);
    else deque.push(index);
  };

  for (let index = 0; index < CELL_COUNT; index++) {
    const onStart = player === 'R' ? rowOf(index) === 0 : colOf(index) === 0;
    if (!onStart || board[index] === other) continue;
    relax(index, board[index] === player ? 0 : 1);
  }

  while (deque.length) {
    const current = deque.shift() as number;
    const row = rowOf(current);
    const col = colOf(current);
    const deltas: readonly (readonly [number, number])[] = [
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
      [1, 0],
    ];
    for (const [dr, dc] of deltas) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const next = nr * SIZE + nc;
      if (board[next] === other) continue;
      const step = board[next] === player ? 0 : 1;
      const nextCost = cost[current] + step;
      if (nextCost < cost[next]) {
        cost[next] = nextCost;
        if (step === 0) deque.unshift(next);
        else deque.push(next);
      }
    }
  }

  let best = Infinity;
  for (let index = 0; index < CELL_COUNT; index++) {
    const onGoal = player === 'R' ? rowOf(index) === SIZE - 1 : colOf(index) === SIZE - 1;
    if (onGoal) best = Math.min(best, cost[index]);
  }
  return best;
}

function winsAt(board: Cell[], index: number, player: Player): boolean {
  if (board[index] !== null) return false;
  const copy = board.slice();
  copy[index] = player;
  return winningPath(copy, player) !== null;
}

function centreScore(index: number): number {
  return 10 - (Math.abs(rowOf(index) - CENTER) + Math.abs(colOf(index) - CENTER));
}

const blockedCost = SIZE + 1;
const costOf = (value: number) => (Number.isFinite(value) ? value : blockedCost);

function rankedMoves(state: GameState, player: Player): { move: number; score: number }[] {
  const other = opponent(player);
  const beforeMine = costOf(shortestDistance(state.board, player));
  const beforeTheirs = costOf(shortestDistance(state.board, other));
  const ranked: { move: number; score: number }[] = [];
  for (const move of legalMoves(state)) {
    const board = state.board.slice();
    board[move] = player;
    const mine = costOf(shortestDistance(board, player));
    const theirs = costOf(shortestDistance(board, other));
    const pressure = (beforeMine - mine) * 120 + (theirs - beforeTheirs) * 90;
    ranked.push({ move, score: pressure + centreScore(move) * 0.8 - mine * 1.5 });
  }
  ranked.sort((a, b) => b.score - a.score || a.move - b.move);
  return ranked;
}

function findImmediateWin(state: GameState, player: Player): number | null {
  for (const move of legalMoves(state)) {
    if (winsAt(state.board, move, player)) return move;
  }
  return null;
}

function findImmediateBlock(state: GameState, player: Player): number | null {
  const other = opponent(player);
  for (const move of legalMoves(state)) {
    if (winsAt(state.board, move, other)) return move;
  }
  return null;
}

/** Union-find specialised for fast random playouts. */
class Dsu {
  parent: Int32Array;
  rank: Uint8Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    for (let i = 0; i < size; i++) this.parent[i] = i;
    this.rank = new Uint8Array(size);
  }

  find(value: number): number {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[value] !== value) {
      const next = this.parent[value];
      this.parent[value] = root;
      value = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) {
      const swap = ra;
      ra = rb;
      rb = swap;
    }
    this.parent[rb] = ra;
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
  }

  clone(): Dsu {
    const copy = new Dsu(0);
    copy.parent = this.parent.slice();
    copy.rank = this.rank.slice();
    return copy;
  }
}

const RED_NORTH = CELL_COUNT;
const RED_SOUTH = CELL_COUNT + 1;
const BLUE_WEST = CELL_COUNT;
const BLUE_EAST = CELL_COUNT + 1;
const NEIGHBOUR_DELTAS: readonly (readonly [number, number])[] = [
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 0],
];

function neighboursOf(index: number): number[] {
  const row = rowOf(index);
  const col = colOf(index);
  const result: number[] = [];
  for (const [dr, dc] of NEIGHBOUR_DELTAS) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) result.push(nr * SIZE + nc);
  }
  return result;
}

interface PlayoutBoard {
  red: Dsu;
  blue: Dsu;
}

function buildPlayout(board: Cell[]): PlayoutBoard {
  const red = new Dsu(CELL_COUNT + 2);
  const blue = new Dsu(CELL_COUNT + 2);
  for (let index = 0; index < CELL_COUNT; index++) {
    const cell = board[index];
    if (cell === null) continue;
    const dsu = cell === 'R' ? red : blue;
    for (const next of neighboursOf(index)) {
      if (board[next] === cell) dsu.union(index, next);
    }
    if (cell === 'R') {
      if (rowOf(index) === 0) dsu.union(index, RED_NORTH);
      if (rowOf(index) === SIZE - 1) dsu.union(index, RED_SOUTH);
    } else {
      if (colOf(index) === 0) dsu.union(index, BLUE_WEST);
      if (colOf(index) === SIZE - 1) dsu.union(index, BLUE_EAST);
    }
  }
  return { red, blue };
}

function place(dsu: Dsu, board: Cell[], index: number, player: Player): boolean {
  board[index] = player;
  for (const next of neighboursOf(index)) {
    if (board[next] === player) dsu.union(index, next);
  }
  if (player === 'R') {
    if (rowOf(index) === 0) dsu.union(index, RED_NORTH);
    if (rowOf(index) === SIZE - 1) dsu.union(index, RED_SOUTH);
    return dsu.find(RED_NORTH) === dsu.find(RED_SOUTH);
  }
  if (colOf(index) === 0) dsu.union(index, BLUE_WEST);
  if (colOf(index) === SIZE - 1) dsu.union(index, BLUE_EAST);
  return dsu.find(BLUE_WEST) === dsu.find(BLUE_EAST);
}

/**
 * One random continuation. Returns the winner, or null in the impossible
 * case that all 121 cells fill without a connection.
 */
function playout(state: GameState, rng: Rng, base: PlayoutBoard): Player | null {
  const board = state.board.slice();
  const red = base.red.clone();
  const blue = base.blue.clone();
  const empties: number[] = [];
  for (let index = 0; index < CELL_COUNT; index++) {
    if (board[index] === null) empties.push(index);
  }
  for (let i = empties.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = empties[i];
    empties[i] = empties[j];
    empties[j] = swap;
  }
  let turn = state.turn;
  for (const index of empties) {
    const won = turn === 'R' ? place(red, board, index, 'R') : place(blue, board, index, 'B');
    if (won) return turn;
    turn = opponent(turn);
  }
  return null;
}

function monteCarlo(state: GameState, rng: Rng): number {
  const me = state.turn;
  const ranked = rankedMoves(state, me);
  const candidateCount = ranked.length > 60 ? 24 : ranked.length > 20 ? 20 : ranked.length;
  const candidates = ranked.slice(0, candidateCount);
  const empties = CELL_COUNT - state.moves.length;
  const playouts = empties > 90 ? 26 : empties > 40 ? 34 : 46;
  let bestMove = candidates[0]?.move ?? -1;
  let bestValue = -Infinity;

  for (const candidate of candidates) {
    const next = apply(state, candidate.move).state;
    const base = buildPlayout(next.board);
    let wins = 0;
    for (let i = 0; i < playouts; i++) {
      if (playout(next, rng, base) === me) wins++;
    }
    const winRate = wins / playouts;
    const tieBreak = (candidate.score / (1 + Math.abs(candidate.score))) * 0.02;
    const value = winRate + tieBreak;
    if (value > bestValue + 1e-9) {
      bestValue = value;
      bestMove = candidate.move;
    }
  }
  return bestMove;
}

function pick(items: readonly number[], rng: Rng): number {
  if (items.length === 0) return -1;
  const value = Math.floor(rng() * items.length);
  return items[Math.min(Math.max(value, 0), items.length - 1)];
}

export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return -1;
  if (moves.length === 1) return moves[0];
  const me = state.turn;

  const immediateWin = findImmediateWin(state, me);
  if (immediateWin !== null) return immediateWin;

  if (level === 'easy') {
    if (rng() < 0.7) return pick(moves, rng);
    const ranked = rankedMoves(state, me);
    return pick(ranked.slice(0, Math.min(8, ranked.length)).map((item) => item.move), rng);
  }

  if (level === 'companion') {
    const block = findImmediateBlock(state, me);
    if (block !== null) return block;
    // Gentle: stay near the centre but sometimes wander, and never grind a
    // child into a corner with a deep search.
    if (rng() < 0.28) return pick(moves, rng);
    const ranked = rankedMoves(state, me);
    return pick(ranked.slice(0, Math.min(6, ranked.length)).map((item) => item.move), rng);
  }

  const block = findImmediateBlock(state, me);
  if (block !== null) return block;

  if (level === 'normal') {
    if (rng() < 0.1) return pick(moves, rng);
    const ranked = rankedMoves(state, me);
    return ranked[0]?.move ?? moves[0];
  }

  return monteCarlo(state, rng);
}

/**
 * Explain a suggested move in game terms. Used by the hint coach. The mapping
 * to Chinese/English copy lives in the UI layer so the AI stays pure.
 */
export function explainMove(state: GameState, move: number): HintReason {
  if (state.status !== 'playing' || !Number.isInteger(move) || state.board[move] !== null) {
    return 'center';
  }
  const me = state.turn;
  const other = opponent(me);
  if (winsAt(state.board, move, me)) return 'win';
  if (winsAt(state.board, move, other)) return 'block';

  const beforeMine = costOf(shortestDistance(state.board, me));
  const beforeTheirs = costOf(shortestDistance(state.board, other));
  const board = state.board.slice();
  board[move] = me;
  const afterMine = costOf(shortestDistance(board, me));
  const afterTheirs = costOf(shortestDistance(board, other));

  if (afterMine < beforeMine) return 'connect';
  if (afterTheirs > beforeTheirs) return 'route';
  if (centreScore(move) >= 6) return 'center';
  return 'space';
}

/** Small helper used by the UI to show both sides' remaining path cost. */
export function routeCosts(board: readonly Cell[]): { red: number; blue: number } {
  const copy = board.slice();
  return {
    red: shortestDistance(copy, 'R'),
    blue: shortestDistance(copy, 'B'),
  };
}
