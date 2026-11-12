import {
  PIECE_VALUE,
  legalMoves,
  makeMove,
  type Color,
  type GameState,
  type Move,
  type Piece,
  type PieceType,
} from '../game/chess';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const MATE = 1_000_000;
const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const ROOK_TABLE = [
  0, 0, 0, 5, 5, 0, 0, 0,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  5, 10, 10, 10, 10, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING_MIDDLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

const TABLES: Record<Exclude<PieceType, 'k'>, number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
};

const mirror = (square: number): number => square ^ 56;

function pieceScore(piece: Piece, square: number, endgame: boolean): number {
  const table =
    piece.type === 'k' ? (endgame ? KING_END : KING_MIDDLE) : TABLES[piece.type];
  const index = piece.color === 'w' ? square : mirror(square);
  return PIECE_VALUE[piece.type] + table[index];
}

/** Static evaluation, always from White's point of view. */
export function evaluate(state: GameState): number {
  let score = 0;
  let nonPawn = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  const pawnFiles: Record<Color, number[]> = {
    w: [0, 0, 0, 0, 0, 0, 0, 0],
    b: [0, 0, 0, 0, 0, 0, 0, 0],
  };

  for (let square = 0; square < 64; square += 1) {
    const piece = state.board[square];
    if (!piece) continue;
    if (piece.type !== 'p' && piece.type !== 'k') nonPawn += PIECE_VALUE[piece.type];
    if (piece.type === 'p') pawnFiles[piece.color][square & 7] += 1;
    if (piece.type === 'b') {
      if (piece.color === 'w') whiteBishops += 1;
      else blackBishops += 1;
    }
  }
  const endgame = nonPawn <= 2200;

  for (let square = 0; square < 64; square += 1) {
    const piece = state.board[square];
    if (!piece) continue;
    const value = pieceScore(piece, square, endgame);
    score += piece.color === 'w' ? value : -value;
  }

  if (whiteBishops >= 2) score += 28;
  if (blackBishops >= 2) score -= 28;

  for (const color of ['w', 'b'] as const) {
    const sign = color === 'w' ? 1 : -1;
    for (let file = 0; file < 8; file += 1) {
      const count = pawnFiles[color][file];
      if (count > 1) score -= sign * 12 * (count - 1);
      if (count > 0) {
        const left = file > 0 ? pawnFiles[color][file - 1] : 0;
        const right = file < 7 ? pawnFiles[color][file + 1] : 0;
        if (left === 0 && right === 0) score -= sign * 9;
      }
    }
  }
  return score;
}

function evaluateFor(state: GameState, color: Color): number {
  const white = evaluate(state);
  return color === 'w' ? white : -white;
}

function capturedValue(state: GameState, move: Move): number {
  const target = state.board[move.to];
  if (target) return PIECE_VALUE[target.type];
  if (move.enPassant) return PIECE_VALUE.p;
  return 0;
}

function orderMoves(state: GameState, moves: Move[]): Move[] {
  return [...moves].sort((a, b) => moveOrderScore(state, b) - moveOrderScore(state, a));
}

function moveOrderScore(state: GameState, move: Move): number {
  const moving = state.board[move.from];
  const captured = capturedValue(state, move);
  let score = 0;
  if (captured > 0 && moving) score += 10_000 + captured * 10 - PIECE_VALUE[moving.type];
  if (move.promotion) score += 8_000 + PIECE_VALUE[move.promotion];
  if (move.castle) score += 120;
  return score;
}

function quiescence(
  state: GameState,
  alpha: number,
  beta: number,
  ply: number,
  depth: number,
): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return state.inCheck ? -MATE + ply : 0;
  if (state.halfmove >= 100) return 0;

  if (state.inCheck) {
    if (depth <= 0) return evaluateFor(state, state.turn);
    let best = -Infinity;
    for (const move of orderMoves(state, moves)) {
      const score = -quiescence(makeMove(state, move), -beta, -alpha, ply + 1, depth - 1);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = evaluateFor(state, state.turn);
  if (best >= beta) return best;
  if (best > alpha) alpha = best;
  if (depth <= 0) return best;

  const tactical = moves.filter(
    (move) => capturedValue(state, move) > 0 || Boolean(move.promotion),
  );
  for (const move of orderMoves(state, tactical)) {
    const score = -quiescence(makeMove(state, move), -beta, -alpha, ply + 1, depth - 1);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): number {
  const moves = legalMoves(state);
  if (moves.length === 0) return state.inCheck ? -MATE + ply : 0;
  if (state.halfmove >= 100) return 0;
  if (depth <= 0) return quiescence(state, alpha, beta, ply, 4);

  let best = -Infinity;
  for (const move of orderMoves(state, moves)) {
    const score = -negamax(makeMove(state, move), depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

interface ScoredMove {
  move: Move;
  score: number;
}

function searchRoot(state: GameState, depth: number): ScoredMove[] {
  const moves = legalMoves(state);
  const scored: ScoredMove[] = [];
  for (const move of orderMoves(state, moves)) {
    const score = -negamax(makeMove(state, move), depth - 1, -Infinity, Infinity, 1);
    scored.push({ move, score });
  }
  return scored;
}

function pickBest(scored: ScoredMove[], rng: Rng): Move | null {
  if (scored.length === 0) return null;
  let best = -Infinity;
  for (const item of scored) if (item.score > best) best = item.score;
  const picks = scored.filter((item) => item.score >= best - 0.001);
  return picks[Math.min(picks.length - 1, Math.floor(rng() * picks.length))]?.move ?? picks[0].move;
}

function pickRandom(moves: Move[], rng: Rng): Move {
  return moves[Math.min(moves.length - 1, Math.floor(rng() * moves.length))] ?? moves[0];
}

function companionMove(state: GameState, moves: Move[], rng: Rng): Move {
  for (const move of moves) {
    const next = makeMove(state, move);
    if (next.inCheck && legalMoves(next).length === 0) return move;
  }
  const scored: ScoredMove[] = moves.map((move) => {
    const next = makeMove(state, move);
    let score = evaluateFor(next, state.turn);
    if (capturedValue(state, move) > 0) score -= 45;
    if (next.inCheck) score -= 30;
    if (move.promotion) score -= 12;
    if (move.castle) score += 24;
    score += rng() * 36;
    return { move, score };
  });
  return pickBest(scored, rng) ?? pickRandom(moves, rng);
}

function easyMove(state: GameState, moves: Move[], rng: Rng): Move {
  if (rng() < 0.5) return pickRandom(moves, rng);
  const scored: ScoredMove[] = moves.map((move) => {
    const next = makeMove(state, move);
    let score = evaluateFor(next, state.turn);
    if (capturedValue(state, move) > 0) score += 15;
    if (next.inCheck) score += 8;
    score += rng() * 45;
    return { move, score };
  });
  return pickBest(scored, rng) ?? pickRandom(moves, rng);
}

/**
 * Choose a move for the side to move. All levels are deterministic for the
 * same state, level and injected RNG sequence.
 */
export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  if (level === 'companion') return companionMove(state, moves, rng);
  if (level === 'easy') return easyMove(state, moves, rng);

  if (level === 'normal') {
    if (rng() < 0.12) return pickRandom(moves, rng);
    return pickBest(searchRoot(state, 2), rng);
  }

  return pickBest(searchRoot(state, 3), rng);
}

/** A stable, friendly opening line for the hint when the board is still full. */
export function bestScoredMove(state: GameState): Move | null {
  const scored = searchRoot(state, 3);
  let best: ScoredMove | null = null;
  for (const item of scored) if (!best || item.score > best.score) best = item;
  return best?.move ?? null;
}
