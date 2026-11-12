import {
  legalMovesForBoard,
  simulateMove,
  type Cell,
  type GameState,
  type Move,
  type PieceType,
  type Side,
} from '../game/xiangqi';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const MATE = 1_000_000;

const VALUE: Record<PieceType, number> = {
  G: 100_000,
  R: 900,
  C: 450,
  H: 400,
  A: 200,
  E: 200,
  S: 100,
};

function evaluate(board: Cell[], me: Side): number {
  let score = 0;
  for (let index = 0; index < board.length; index += 1) {
    const cell = board[index];
    if (!cell) continue;
    let value = VALUE[cell.type];
    const row = Math.floor(index / 9);
    const col = index % 9;
    if (cell.type === 'S') {
      const advance = cell.side === 'R' ? 6 - row : row - 3;
      value += Math.max(0, advance) * 14;
      const crossed = cell.side === 'R' ? row <= 4 : row >= 5;
      if (crossed) value += 35;
    } else if (cell.type === 'H' || cell.type === 'C') {
      value += (4 - Math.abs(col - 4)) * 7;
    } else if (cell.type === 'R') {
      value += (4 - Math.abs(col - 4)) * 4;
    } else if (cell.type === 'A' || cell.type === 'E') {
      value += 8;
    } else if (cell.type === 'G') {
      const home = cell.side === 'R' ? row === 9 : row === 0;
      value += home ? 35 : 0;
      value += (4 - Math.abs(col - 4)) * 4;
    }
    score += cell.side === me ? value : -value;
  }
  return score;
}

function moveOrderScore(board: Cell[], move: Move): number {
  const target = board[move.to];
  if (!target) return 0;
  const attacker = board[move.from];
  return VALUE[target.type] * 10 - (attacker ? VALUE[attacker.type] : 0);
}

function ordered(moves: Move[], board: Cell[]): Move[] {
  return moves.slice().sort((a, b) => moveOrderScore(board, b) - moveOrderScore(board, a));
}

interface SearchContext {
  me: Side;
  nodes: number;
}

function search(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
): number {
  ctx.nodes += 1;
  const moves = legalMovesForBoard(state.board, state.turn);
  if (moves.length === 0) {
    // Checkmate and stalemate both lose in Xiangqi. More remaining depth means
    // the mate is closer to the root, so it should score higher.
    return state.turn === ctx.me ? -MATE - depth : MATE + depth;
  }
  if (depth <= 0) return evaluate(state.board, ctx.me);

  const maximizing = state.turn === ctx.me;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of ordered(moves, state.board)) {
    const next = simulateMove(state, move);
    const score = search(next, depth - 1, alpha, beta, ctx);
    if (maximizing) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

function rootScores(state: GameState, depth: number): { move: Move; score: number }[] {
  const me = state.turn;
  const moves = ordered(legalMovesForBoard(state.board, me), state.board);
  const ctx: SearchContext = { me, nodes: 0 };
  const scores: { move: Move; score: number }[] = [];
  let alpha = -Infinity;
  for (const move of moves) {
    const next = simulateMove(state, move);
    const score = search(next, depth - 1, alpha, Infinity, ctx);
    if (score > alpha) alpha = score;
    scores.push({ move, score });
  }
  return scores;
}

function pickBest(scores: { move: Move; score: number }[]): Move | null {
  if (scores.length === 0) return null;
  let best = -Infinity;
  let move: Move | null = null;
  for (const entry of scores) {
    // Root moves are searched with a shared alpha window, so a later inferior
    // move can report an upper bound equal to the current best. Keep the first
    // exact best rather than treating that bound as a tie.
    if (entry.score > best) {
      best = entry.score;
      move = entry.move;
    }
  }
  return move;
}

function pickRandom(moves: Move[], rng: Rng): Move | null {
  if (moves.length === 0) return null;
  return moves[Math.floor(rng() * moves.length)] ?? moves[0];
}

function findMateInOne(state: GameState): Move | null {
  for (const move of legalMovesForBoard(state.board, state.turn)) {
    const next = simulateMove(state, move);
    if (legalMovesForBoard(next.board, next.turn).length === 0) return move;
  }
  return null;
}

/**
 * Deterministic with an injected RNG. Companion and Easy look one ply ahead,
 * Normal two, Hard four. Hard uses alpha-beta ordering and captures first.
 */
export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = () => 0.5,
): Move | null {
  if (state.status !== 'playing') return null;
  const moves = legalMovesForBoard(state.board, state.turn);
  if (moves.length === 0) return null;

  if (level === 'companion') {
    const mate = findMateInOne(state);
    if (mate) return mate;
    if (rng() < 0.5) {
      const quiet = moves.filter((move) => !state.board[move.to]);
      return pickRandom(quiet.length > 0 ? quiet : moves, rng);
    }
    return pickBest(rootScores(state, 1));
  }

  if (level === 'easy') {
    if (rng() < 0.35) return pickRandom(moves, rng);
    return pickBest(rootScores(state, 1));
  }

  if (level === 'normal') {
    if (rng() < 0.12) return pickRandom(moves, rng);
    return pickBest(rootScores(state, 2));
  }

  return pickBest(rootScores(state, 4));
}
