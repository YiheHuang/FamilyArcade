import {
  CELLS,
  CENTER,
  SIZE,
  apply,
  colOf,
  inBounds,
  indexOf,
  legalMoves,
  other,
  rowOf,
  wouldWin,
  type Cell,
  type GameState,
  type Mark,
} from '../game/gomoku';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const WIN_SCORE = 1_000_000_000;
const NEAR_RADIUS = 2;
const HARD_DEPTH = 6;
const HARD_NODES = 14_000;
const NORMAL_NODES = 5_000;

export interface MoveAnalysis {
  winNow: boolean;
  winningPoints: number[];
  shapeScore: number;
  score: number;
}

interface Budget {
  nodes: number;
  cap: number;
}

interface RootResult {
  move: number;
  score: number;
  ranked: { move: number; score: number }[];
}

/**
 * Empty points within two intersections of a stone. Opening boards use the
 * centre. The AI never considers the whole 225-point board at once.
 */
export function candidateMoves(board: Cell[]): number[] {
  const found = new Set<number>();
  let stones = 0;
  for (let index = 0; index < CELLS; index += 1) {
    if (board[index] === null) continue;
    stones += 1;
    const row = rowOf(index);
    const col = colOf(index);
    for (let dr = -NEAR_RADIUS; dr <= NEAR_RADIUS; dr += 1) {
      for (let dc = -NEAR_RADIUS; dc <= NEAR_RADIUS; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const at = indexOf(r, c);
        if (board[at] === null) found.add(at);
      }
    }
  }
  if (stones === 0) return [CENTER];
  return [...found].sort((a, b) => a - b);
}

function contiguous(
  board: Cell[],
  index: number,
  mark: Mark,
  dr: number,
  dc: number,
): { length: number; open: number } {
  const row = rowOf(index);
  const col = colOf(index);
  let length = 1;
  let open = 0;

  for (const sign of [-1, 1] as const) {
    let r = row + dr * sign;
    let c = col + dc * sign;
    while (inBounds(r, c) && board[indexOf(r, c)] === mark) {
      length += 1;
      r += dr * sign;
      c += dc * sign;
    }
    if (inBounds(r, c) && board[indexOf(r, c)] === null) open += 1;
  }
  return { length, open };
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** A move's local shape value if `mark` played on the empty `index`. */
export function shapeScore(board: Cell[], index: number, mark: Mark): number {
  let score = 0;
  for (const [dr, dc] of DIRECTIONS) {
    const { length, open } = contiguous(board, index, mark, dr, dc);
    if (length >= 5) score += WIN_SCORE / 2;
    else if (length === 4) {
      if (open === 2) score += 5_000_000;
      else if (open === 1) score += 260_000;
    } else if (length === 3) {
      if (open === 2) score += 42_000;
      else if (open === 1) score += 3_200;
    } else if (length === 2) {
      if (open === 2) score += 620;
      else if (open === 1) score += 110;
    } else if (open === 2) {
      score += 14;
    }
  }
  return score;
}

/**
 * Full tactical read of one move. Winning points are empty cells that would
 * make five immediately after this stone lands. Two of them is an open four
 * (unstoppable), one is a four (the opponent must answer).
 */
export function analyseMove(board: Cell[], index: number, mark: Mark): MoveAnalysis {
  if (index < 0 || index >= CELLS || board[index] !== null) {
    return { winNow: false, winningPoints: [], shapeScore: 0, score: 0 };
  }
  const winNow = wouldWin(board, index, mark);
  const shape = shapeScore(board, index, mark);
  const placed = board.slice();
  placed[index] = mark;

  const winning = new Set<number>();
  const row = rowOf(index);
  const col = colOf(index);
  for (let r = Math.max(0, row - 4); r <= Math.min(SIZE - 1, row + 4); r += 1) {
    for (let c = Math.max(0, col - 4); c <= Math.min(SIZE - 1, col + 4); c += 1) {
      const at = indexOf(r, c);
      if (placed[at] !== null) continue;
      if (wouldWin(placed, at, mark)) winning.add(at);
    }
  }

  const winningPoints = [...winning].sort((a, b) => a - b);
  let score = shape;
  if (winNow) score += WIN_SCORE;
  else if (winningPoints.length >= 2) score += 3_000_000;
  else if (winningPoints.length === 1) score += 240_000;
  return { winNow, winningPoints, shapeScore: shape, score };
}

function orderScore(board: Cell[], index: number, mark: Mark): number {
  const attack = shapeScore(board, index, mark);
  const defence = shapeScore(board, index, other(mark));
  const centre = 14 - (Math.abs(rowOf(index) - 7) + Math.abs(colOf(index) - 7));
  let score = attack + defence * 0.92 + centre * 3;
  if (wouldWin(board, index, mark)) score += WIN_SCORE;
  if (wouldWin(board, index, other(mark))) score += WIN_SCORE * 0.72;
  return score;
}

const EVAL_LINES: readonly (readonly number[])[] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < SIZE; r += 1) {
    lines.push(Array.from({ length: SIZE }, (_, c) => indexOf(r, c)));
  }
  for (let c = 0; c < SIZE; c += 1) {
    lines.push(Array.from({ length: SIZE }, (_, r) => indexOf(r, c)));
  }
  for (let r = 0; r < SIZE; r += 1) {
    const down: number[] = [];
    const up: number[] = [];
    for (let k = 0; r + k < SIZE; k += 1) {
      down.push(indexOf(r + k, k));
      up.push(indexOf(r + k, SIZE - 1 - k));
    }
    if (down.length >= 5) lines.push(down);
    if (up.length >= 5) lines.push(up);
  }
  for (let c = 1; c < SIZE; c += 1) {
    const down: number[] = [];
    const up: number[] = [];
    for (let k = 0; c + k < SIZE; k += 1) {
      down.push(indexOf(k, c + k));
      up.push(indexOf(k, SIZE - 1 - c - k));
    }
    if (down.length >= 5) lines.push(down);
    if (up.length >= 5) lines.push(up);
  }
  return lines;
})();

function scoreLine(board: Cell[], line: readonly number[], mark: Mark): number {
  let score = 0;
  for (let start = 0; start <= line.length - 5; start += 1) {
    let mine = 0;
    let theirs = 0;
    for (let k = 0; k < 5; k += 1) {
      const cell = board[line[start + k]];
      if (cell === mark) mine += 1;
      else if (cell !== null) theirs += 1;
    }
    if (theirs > 0) continue;
    if (mine === 5) score += 40_000_000;
    else if (mine === 4) score += 14_000;
    else if (mine === 3) score += 210;
    else if (mine === 2) score += 7;
  }
  for (let start = 0; start <= line.length - 6; start += 1) {
    if (board[line[start]] !== null || board[line[start + 5]] !== null) continue;
    let mine = 0;
    let theirs = 0;
    for (let k = 1; k <= 4; k += 1) {
      const cell = board[line[start + k]];
      if (cell === mark) mine += 1;
      else if (cell !== null) theirs += 1;
    }
    if (theirs > 0) continue;
    if (mine === 4) score += 1_100_000;
    else if (mine === 3) score += 1_100;
  }
  return score;
}

export function evaluateBoard(board: Cell[], me: Mark): number {
  const opp = other(me);
  let mine = 0;
  let theirs = 0;
  for (const line of EVAL_LINES) {
    mine += scoreLine(board, line, me);
    theirs += scoreLine(board, line, opp);
  }
  return mine - Math.floor(theirs * 1.06);
}

function generateMoves(state: GameState, depth: number): number[] {
  const board = state.board;
  const side = state.turn;
  const opp = other(side);
  const base = candidateMoves(board);

  const wins = base.filter((index) => wouldWin(board, index, side));
  if (wins.length > 0) return wins;

  const blocks = base.filter((index) => wouldWin(board, index, opp));
  if (blocks.length > 0) return blocks.slice(0, 2);

  const ranked = base
    .map((index) => ({ index, score: orderScore(board, index, side) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const cap = depth >= 5 ? 8 : 6;
  return ranked.slice(0, cap).map((item) => item.index);
}

function search(
  state: GameState,
  me: Mark,
  depth: number,
  alpha: number,
  beta: number,
  budget: Budget,
): number {
  budget.nodes += 1;
  if (state.status === 'won') {
    return state.winner === me ? WIN_SCORE - (10 - depth) : -WIN_SCORE + (10 - depth);
  }
  if (state.status === 'draw') return 0;
  if (depth <= 0 || budget.nodes > budget.cap) return evaluateBoard(state.board, me);

  const maximizing = state.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  let a = alpha;
  let b = beta;

  for (const move of generateMoves(state, depth)) {
    const next = apply(state, move).state;
    const value = search(next, me, depth - 1, a, b, budget);
    if (maximizing) {
      if (value > best) best = value;
      if (best > a) a = best;
    } else {
      if (value < best) best = value;
      if (best < b) b = best;
    }
    if (a >= b) break;
  }
  return best;
}

function searchRoot(state: GameState, depth: number, cap: number): RootResult {
  const board = state.board;
  const me = state.turn;
  const opp = other(me);
  const base = candidateMoves(board);
  const budget: Budget = { nodes: 0, cap };

  const wins = base.filter((index) => wouldWin(board, index, me));
  if (wins.length > 0) {
    return { move: wins[0], score: WIN_SCORE, ranked: wins.map((move) => ({ move, score: WIN_SCORE })) };
  }

  const blocks = base.filter((index) => wouldWin(board, index, opp));
  const pool = blocks.length > 0 ? blocks : base;

  const ordered = pool
    .map((index) => ({ index, order: orderScore(board, index, me), analysis: analyseMove(board, index, me) }))
    .sort(
      (a, b) =>
        b.analysis.score + b.order * 0.25 - (a.analysis.score + a.order * 0.25) || a.index - b.index,
    );

  const candidates = ordered.slice(0, blocks.length > 0 ? blocks.length : 14).map((item) => item.index);
  let alpha = -Infinity;
  let beta = Infinity;
  let bestMove = candidates[0] ?? -1;
  let bestScore = -Infinity;
  const ranked: { move: number; score: number }[] = [];

  for (const move of candidates) {
    const next = apply(state, move).state;
    const score = search(next, me, depth - 1, alpha, beta, budget);
    ranked.push({ move, score });
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
  }

  ranked.sort((a, b) => b.score - a.score || a.move - b.move);
  return { move: bestMove, score: bestScore, ranked };
}

function pick(items: number[], rng: Rng): number {
  if (items.length === 0) return -1;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] ?? items[0];
}

function topQuick(board: Cell[], moves: number[], mark: Mark, count: number): number[] {
  return moves
    .map((index) => ({ index, score: orderScore(board, index, mark) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map((item) => item.index);
}

/**
 * Choose a move. Every level accepts an injected RNG, so a fixed RNG and board
 * always produce the same move. Hard uses a six-ply threat-space search with a
 * deterministic node budget; Normal uses a two-ply lookahead.
 */
export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): number {
  if (state.status !== 'playing') return -1;
  const board = state.board;
  const moves = candidateMoves(board);
  if (moves.length === 0) return -1;
  const me = state.turn;
  const opp = other(me);

  const wins = moves.filter((index) => wouldWin(board, index, me));
  if (wins.length > 0) return wins[0];

  const blocks = moves.filter((index) => wouldWin(board, index, opp));

  if (level === 'easy') {
    if (rng() < 0.52) return pick(moves, rng);
    if (blocks.length > 0 && rng() < 0.68) return pick(blocks, rng);
    return pick(topQuick(board, moves, me, 7), rng);
  }

  if (level === 'companion') {
    // Kind, not careless: always stop an immediate five, then prefer quiet
    // moves that stay near the stones instead of building a killing attack.
    if (blocks.length > 0) return pick(blocks, rng);
    const quiet = moves.filter((index) => {
      const read = analyseMove(board, index, me);
      return !read.winNow && read.winningPoints.length === 0 && read.shapeScore < 180_000;
    });
    const pool = quiet.length > 0 ? quiet : moves;
    return pick(topQuick(board, pool, me, 10), rng);
  }

  if (level === 'normal') {
    if (blocks.length === 1) return blocks[0];
    if (blocks.length > 1) {
      const result = searchRoot(state, 2, NORMAL_NODES);
      return blocks.includes(result.move) ? result.move : blocks[0];
    }
    const result = searchRoot(state, 2, NORMAL_NODES);
    if (rng() < 0.12 && result.ranked.length > 1) return result.ranked[1].move;
    return result.move;
  }

  const result = searchRoot(state, HARD_DEPTH, HARD_NODES);
  return result.move;
}

/** A deterministic legal move for tests that need a fallback. */
export function firstLegal(state: GameState): number {
  return legalMoves(state)[0] ?? -1;
}
