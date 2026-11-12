import {
  advance,
  isKing,
  legalMoves,
  rowOf,
  sideOf,
  type GameState,
  type Move,
  type Piece,
} from '../game/intl-draughts';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const WIN = 1_000_000;
const MAN_VALUE = 100;
const KING_VALUE = 320;
const SEARCH_INFINITY = 2_000_000;

function material(piece: Piece): number {
  return isKing(piece) ? KING_VALUE : MAN_VALUE;
}

/** Static evaluation from the side-to-move perspective. */
export function evaluate(state: GameState): number {
  let white = 0;
  for (let square = 0; square < state.board.length; square += 1) {
    const piece = state.board[square];
    if (!piece) continue;
    const side = sideOf(piece);
    const row = rowOf(square);
    const col = square % 10;
    let value = material(piece);
    if (!isKing(piece)) {
      // Advancement is worth a little more than raw material.
      value += side === 'W' ? (9 - row) * 3 : row * 3;
      // Keep a guard on the home row while the men are still fighting.
      if ((side === 'W' && row === 9) || (side === 'B' && row === 0)) value += 6;
      value += 2 - Math.abs(col - 4.5) * 0.35;
    } else {
      value += 3 - Math.abs(row - 4.5) * 0.3 - Math.abs(col - 4.5) * 0.3;
    }
    white += side === 'W' ? value : -value;
  }
  return state.turn === 'W' ? white : -white;
}

function terminalScore(state: GameState, ply: number): number | null {
  if (state.status === 'won') {
    return state.winner === state.turn ? WIN - ply : -WIN + ply;
  }
  if (state.status === 'draw') return 0;
  return null;
}

function quiesce(
  state: GameState,
  alpha: number,
  beta: number,
  ply: number,
  depth: number,
): number {
  const terminal = terminalScore(state, ply);
  if (terminal !== null) return terminal;
  const moves = legalMoves(state);
  if (moves.length === 0) return evaluate(state);
  // If a capture is available it is forced; otherwise the position is quiet.
  if (moves[0].captures.length === 0 || depth <= 0) return evaluate(state);

  let best = -SEARCH_INFINITY;
  let nextAlpha = alpha;
  for (const move of moves) {
    const score = -quiesce(
      advance(state, move),
      -beta,
      -nextAlpha,
      ply + 1,
      depth - 1,
    );
    if (score > best) best = score;
    if (score > nextAlpha) nextAlpha = score;
    if (nextAlpha >= beta) break;
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
  const terminal = terminalScore(state, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) return quiesce(state, alpha, beta, ply, 3);
  const moves = legalMoves(state);
  if (moves.length === 0) return evaluate(state);

  let best = -SEARCH_INFINITY;
  let nextAlpha = alpha;
  for (const move of moves) {
    const score = -negamax(
      advance(state, move),
      depth - 1,
      -beta,
      -nextAlpha,
      ply + 1,
    );
    if (score > best) best = score;
    if (score > nextAlpha) nextAlpha = score;
    if (nextAlpha >= beta) break;
  }
  return best;
}

function searchDepth(state: GameState, level: AiLevel): number {
  if (level === 'companion' || level === 'easy') return 1;
  if (level === 'normal') return 3;
  const pieces = state.board.reduce((total, piece) => total + (piece ? 1 : 0), 0);
  return pieces <= 8 ? 6 : 4;
}

function scoringMoves(
  state: GameState,
  depth: number,
  rng: Rng,
): { move: Move; score: number }[] {
  const moves = legalMoves(state);
  const scored = moves.map((move) => {
    const next = advance(state, move);
    const score =
      next.status === 'won' && next.winner === state.turn
        ? WIN
        : -negamax(next, Math.max(0, depth - 1), -SEARCH_INFINITY, SEARCH_INFINITY, 1);
    return { move, score };
  });
  const best = scored.reduce(
    (value, entry) => Math.max(value, entry.score),
    -SEARCH_INFINITY,
  );
  const ties = scored.filter((entry) => entry.score >= best - 1e-6);
  // The injected RNG only breaks exact ties, so the same seed is reproducible.
  const pick = ties[Math.floor(rng() * ties.length)] ?? ties[0];
  return [pick, ...scored.filter((entry) => entry !== pick)];
}

export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = () => 0.5,
): Move | null {
  if (state.status !== 'playing') return null;
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const immediateWin = moves.find((move) => {
    const next = advance(state, move);
    return next.status === 'won' && next.winner === state.turn;
  });
  if (immediateWin && level !== 'easy') return immediateWin;
  if (immediateWin && rng() < 0.75) return immediateWin;

  if (level === 'companion') {
    if (rng() < 0.55) return moves[Math.floor(rng() * moves.length)] ?? moves[0];
    return scoringMoves(state, 1, rng)[0].move;
  }
  if (level === 'easy') {
    if (rng() < 0.3) return moves[Math.floor(rng() * moves.length)] ?? moves[0];
    return scoringMoves(state, 1, rng)[0].move;
  }
  if (level === 'normal') {
    if (rng() < 0.08) return moves[Math.floor(rng() * moves.length)] ?? moves[0];
    return scoringMoves(state, searchDepth(state, level), rng)[0].move;
  }
  return scoringMoves(state, searchDepth(state, level), rng)[0].move;
}
