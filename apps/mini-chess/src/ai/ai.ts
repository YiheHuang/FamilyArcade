import {
  apply,
  isInCheck,
  legalMoves,
  opposite,
  rowOf,
  colOf,
  type GameState,
  type LegalMove,
  type PieceType,
} from '../game/chess';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const VALUES: Record<PieceType, number> = {
  P: 100,
  N: 320,
  B: 340,
  R: 500,
  K: 0,
};

type Grid = readonly (readonly number[])[];

function flatten(rows: Grid): number[] {
  return rows.flat();
}

// Piece-square tables are written from White's point of view with row 0 at the
// top (Black's home rank). Black mirrors the table vertically.
const PST: Record<PieceType, number[]> = {
  P: flatten([
    [0, 0, 0, 0, 0],
    [80, 85, 90, 85, 80],
    [45, 50, 55, 50, 45],
    [20, 25, 30, 25, 20],
    [0, 5, 10, 5, 0],
    [0, 0, 0, 0, 0],
  ]),
  N: flatten([
    [-20, -10, 0, -10, -20],
    [-5, 10, 15, 10, -5],
    [0, 15, 25, 15, 0],
    [0, 15, 25, 15, 0],
    [-5, 10, 20, 10, -5],
    [-15, -5, 0, -5, -15],
  ]),
  B: flatten([
    [-10, -5, 0, -5, -10],
    [0, 10, 10, 10, 0],
    [5, 10, 20, 10, 5],
    [0, 10, 20, 10, 0],
    [0, 5, 10, 5, 0],
    [-10, 0, 0, 0, -10],
  ]),
  R: flatten([
    [0, 0, 5, 0, 0],
    [10, 10, 15, 10, 10],
    [0, 5, 10, 5, 0],
    [0, 5, 10, 5, 0],
    [0, 0, 5, 0, 0],
    [0, 0, 0, 0, 0],
  ]),
  K: flatten([
    [-40, -40, -50, -40, -40],
    [-30, -30, -40, -30, -30],
    [-20, -20, -30, -20, -20],
    [-10, -10, -20, -10, -10],
    [0, 0, -10, 0, 0],
    [10, 15, 0, 15, 10],
  ]),
};

const MATE = 100_000;

function mirror(index: number): number {
  return (5 - rowOf(index)) * 5 + colOf(index);
}

export function evaluateBoard(board: GameState['board']): number {
  let score = 0;
  const pawnFiles = { w: [0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0] };
  const bishops = { w: 0, b: 0 };

  for (let index = 0; index < board.length; index += 1) {
    const square = board[index];
    if (!square) continue;
    const color = square[0] as 'w' | 'b';
    const type = square[1] as PieceType;
    const tableIndex = color === 'w' ? index : mirror(index);
    const value = VALUES[type] + PST[type][tableIndex];
    score += color === 'w' ? value : -value;
    if (type === 'P') pawnFiles[color][colOf(index)] += 1;
    if (type === 'B') bishops[color] += 1;
  }

  for (const color of ['w', 'b'] as const) {
    const sign = color === 'w' ? 1 : -1;
    if (bishops[color] >= 2) score += sign * 24;
    for (let file = 0; file < 5; file += 1) {
      const count = pawnFiles[color][file];
      if (count > 1) score -= sign * (count - 1) * 10;
      if (count > 0) {
        const left = file > 0 ? pawnFiles[color][file - 1] : 0;
        const right = file < 4 ? pawnFiles[color][file + 1] : 0;
        if (left === 0 && right === 0) score -= sign * 8;
      }
    }
  }

  return score;
}

function terminalScore(state: GameState, ply: number): number | null {
  if (state.status === 'checkmate') return -MATE + ply;
  if (state.status === 'draw' || state.status === 'stalemate') return 0;
  return null;
}

function evaluateFor(state: GameState, color: 'w' | 'b'): number {
  const raw = evaluateBoard(state.board);
  return color === 'w' ? raw : -raw;
}

function orderValue(move: LegalMove): number {
  let score = 0;
  if (move.captured) score += VALUES[move.captured] * 10 - VALUES[move.piece];
  if (move.promotion) score += 800;
  return score;
}

function orderedMoves(state: GameState): LegalMove[] {
  return legalMoves(state).sort((a, b) => orderValue(b) - orderValue(a));
}

function quiesce(
  state: GameState,
  alpha: number,
  beta: number,
  ply: number,
  qdepth: number,
): number {
  const terminal = terminalScore(state, ply);
  if (terminal !== null) return terminal;

  const inCheck = isInCheck(state.board, state.turn);
  if (!inCheck) {
    const stand = evaluateFor(state, state.turn);
    if (qdepth >= 5) return stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  } else if (qdepth >= 4) {
    return evaluateFor(state, state.turn);
  }

  const moves = orderedMoves(state);
  const tactical = inCheck ? moves : moves.filter((move) => move.captured || move.promotion);
  if (tactical.length === 0) return inCheck ? evaluateFor(state, state.turn) : alpha;

  for (const move of tactical) {
    const result = apply(state, move.from, move.to, move.promotion ?? undefined);
    if (!result.ok) continue;
    const score = -quiesce(result.state, -beta, -alpha, ply + 1, qdepth + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): number {
  const terminal = terminalScore(state, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) return quiesce(state, alpha, beta, ply, 0);

  const moves = orderedMoves(state);
  if (moves.length === 0) return 0;
  let best = -Infinity;

  for (const move of moves) {
    const result = apply(state, move.from, move.to, move.promotion ?? undefined);
    if (!result.ok) continue;
    const score = -negamax(result.state, depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

interface SearchResult {
  move: LegalMove;
  score: number;
}

function searchRoot(state: GameState, depth: number, rng: Rng): SearchResult | null {
  const moves = orderedMoves(state);
  if (moves.length === 0) return null;
  let bestScore = -Infinity;
  let best: LegalMove[] = [];

  for (const move of moves) {
    const result = apply(state, move.from, move.to, move.promotion ?? undefined);
    if (!result.ok) continue;
    const score = -negamax(result.state, depth - 1, -Infinity, Infinity, 1);
    if (score > bestScore + 0.25) {
      bestScore = score;
      best = [move];
    } else if (Math.abs(score - bestScore) <= 0.25) {
      best.push(move);
    }
  }

  if (best.length === 0) return null;
  const pick = best[Math.min(best.length - 1, Math.floor(rng() * best.length))] ?? best[0];
  return { move: pick, score: bestScore };
}

function givesCheck(state: GameState, move: LegalMove): boolean {
  const result = apply(state, move.from, move.to, move.promotion ?? undefined);
  return result.ok && result.state.status !== 'checkmate' && isInCheck(result.state.board, result.state.turn);
}

function companionMove(state: GameState, rng: Rng): LegalMove | null {
  const moves = orderedMoves(state);
  if (moves.length === 0) return null;

  // A gentle companion still takes a mate when one is right there.
  for (const move of moves) {
    const result = apply(state, move.from, move.to, move.promotion ?? undefined);
    if (result.ok && result.state.status === 'checkmate') return move;
  }

  let pool = moves;
  // Avoid giving check during the opening. Children should get room to move.
  if (state.moves.length < 10) {
    const quiet = moves.filter((move) => !givesCheck(state, move));
    if (quiet.length > 0) pool = quiet;
  }

  // Avoid walking into a mate in one.
  const safe = pool.filter((move) => {
    const result = apply(state, move.from, move.to, move.promotion ?? undefined);
    if (!result.ok) return false;
    if (result.state.status !== 'playing') return true;
    return !legalMoves(result.state).some((reply) => {
      const answer = apply(result.state, reply.from, reply.to, reply.promotion ?? undefined);
      return answer.ok && answer.state.status === 'checkmate';
    });
  });
  if (safe.length > 0) pool = safe;

  let best = -Infinity;
  let picks: LegalMove[] = [];
  for (const move of pool) {
    const result = apply(state, move.from, move.to, move.promotion ?? undefined);
    if (!result.ok) continue;
    let score = evaluateFor(result.state, state.turn);
    // Gentle hands: capturing is fine, but not the whole point of the evening.
    if (move.captured) score -= 35;
    score += rng() * 24;
    if (score > best + 1e-9) {
      best = score;
      picks = [move];
    } else if (Math.abs(score - best) < 1e-9) {
      picks.push(move);
    }
  }

  if (picks.length === 0) return moves[0] ?? null;
  return picks[Math.min(picks.length - 1, Math.floor(rng() * picks.length))] ?? picks[0];
}

export interface Hint {
  move: LegalMove;
  reason: 'mate' | 'capture' | 'promotion' | 'check' | 'draw' | 'advance' | 'develop';
  score: number;
}

export function chooseMoveDetailed(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): SearchResult | null {
  if (state.status !== 'playing') return null;
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  if (level === 'easy') {
    const move = moves[Math.min(moves.length - 1, Math.floor(rng() * moves.length))];
    return move ? { move, score: 0 } : null;
  }
  if (level === 'companion') {
    const move = companionMove(state, rng);
    return move ? { move, score: 0 } : null;
  }
  if (level === 'normal') {
    if (rng() < 0.12) {
      const move = moves[Math.min(moves.length - 1, Math.floor(rng() * moves.length))];
      return move ? { move, score: 0 } : null;
    }
    return searchRoot(state, 2, rng);
  }
  return searchRoot(state, 5, rng);
}

export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
): LegalMove | null {
  return chooseMoveDetailed(state, level, rng)?.move ?? null;
}

export function hint(state: GameState, rng: Rng = Math.random): Hint | null {
  const found = searchRoot(state, 5, rng);
  if (!found) return null;
  const move = found.move;
  const result = apply(state, move.from, move.to, move.promotion ?? undefined);
  let reason: Hint['reason'] = 'develop';
  if (result.ok) {
    if (result.state.status === 'checkmate') reason = 'mate';
    else if (result.state.status === 'draw' || result.state.status === 'stalemate') reason = 'draw';
    else if (move.promotion) reason = 'promotion';
    else if (move.captured) reason = 'capture';
    else if (isInCheck(result.state.board, result.state.turn)) reason = 'check';
    else if (move.piece === 'P') reason = 'advance';
  }
  return { move, reason, score: found.score };
}

export function opponent(color: 'w' | 'b'): 'w' | 'b' {
  return opposite(color);
}
