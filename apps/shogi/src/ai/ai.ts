import {
  PIECE_VALUES,
  hasAnyLegalMove,
  isSquareAttacked,
  legalMoves,
  makeMoveUnchecked,
  otherSide,
  rowOf,
  sameMove,
  type Board,
  type GameState,
  type HandType,
  type Move,
  type Piece,
  type PieceType,
  type Side,
} from '../game/shogi';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

const MATE = 1_000_000;

const PROMOTED_VALUES: Readonly<Record<PieceType, number>> = {
  K: 0,
  R: 1050,
  B: 900,
  G: 500,
  S: 450,
  N: 450,
  L: 450,
  P: 450,
};

function pieceValue(pieceOn: Piece): number {
  return pieceOn.promoted ? PROMOTED_VALUES[pieceOn.type] : PIECE_VALUES[pieceOn.type];
}

function material(board: Board, side: Side): number {
  let score = 0;
  for (const square of board) {
    if (square?.side === side) score += pieceValue(square);
  }
  return score;
}

function handValue(state: GameState, side: Side): number {
  let score = 0;
  for (const type of Object.keys(state.hands[side]) as HandType[]) {
    score += state.hands[side][type] * PIECE_VALUES[type] * 0.9;
  }
  return score;
}

function positionScore(board: Board, side: Side): number {
  let score = 0;
  const enemy = otherSide(side);
  for (let index = 0; index < board.length; index += 1) {
    const square = board[index];
    if (!square || square.side !== side) continue;
    const row = rowOf(index);
    const col = index % 9;
    if (!square.promoted) {
      if (square.type === 'P') {
        score += (side === 'b' ? 6 - row : row - 2) * 5;
      } else if (square.type === 'L') {
        score += (side === 'b' ? 6 - row : row - 2) * 3;
      } else if (square.type === 'N') {
        score += (side === 'b' ? 6 - row : row - 2) * 4;
      } else if (square.type === 'S') {
        score += (side === 'b' ? 5 - row : row - 3) * 2;
      }
    }
    if (square.type !== 'P' && square.type !== 'K') {
      const enemyCamp = side === 'b' ? row <= 2 : row >= 6;
      if (enemyCamp) score += square.promoted ? 10 : 18;
    }

    // Hanging pieces: important for drop safety and for teaching the AI not to
    // leave golds, silvers or majors undefended.
    if (square.type !== 'K' && square.type !== 'P' && PIECE_VALUES[square.type] >= 400) {
      if (isSquareAttacked(board, index, enemy)) {
        const defended = isSquareAttacked(board, index, side);
        score -= defended ? pieceValue(square) * 0.06 : pieceValue(square) * 0.3;
      }
    }

    // A small nudge for pieces near the enemy king (column and row distance).
    const enemyKing = findEnemyKing(board, enemy);
    if (enemyKing >= 0 && square.type !== 'K') {
      const kr = rowOf(enemyKing);
      const kc = enemyKing % 9;
      const distance = Math.max(Math.abs(row - kr), Math.abs(col - kc));
      if (distance <= 3) score += Math.max(0, 4 - distance) * 2;
    }
  }
  return score;
}

function findEnemyKing(board: Board, side: Side): number {
  for (let index = 0; index < board.length; index += 1) {
    const square = board[index];
    if (square && square.side === side && square.type === 'K') return index;
  }
  return -1;
}

function kingSafety(state: GameState, side: Side): number {
  const king = findEnemyKing(state.board, side);
  if (king < 0) return -1000;
  const row = rowOf(king);
  const col = king % 9;
  const enemy = otherSide(side);
  let score = 0;
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= 9 || c < 0 || c >= 9) continue;
      const index = r * 9 + c;
      const guard = state.board[index];
      if (guard && guard.side === side && (guard.type === 'G' || guard.type === 'S')) {
        score += 8;
      }
      if (isSquareAttacked(state.board, index, enemy)) score -= 7;
    }
  }
  if (state.check) score += state.turn === side ? -80 : 35;
  return score;
}

export function evaluate(state: GameState, me: Side): number {
  if (state.status === 'won') return state.winner === me ? MATE : -MATE;
  if (state.status === 'draw') return 0;
  const enemy = otherSide(me);
  let score =
    material(state.board, me) +
    handValue(state, me) +
    positionScore(state.board, me) +
    kingSafety(state, me) -
    (material(state.board, enemy) + handValue(state, enemy) + positionScore(state.board, enemy) + kingSafety(state, enemy));
  if (state.check) score += state.turn === me ? -25 : 25;
  return score;
}

interface SearchContext {
  me: Side;
  nodes: number;
  limit: number;
}

function orderValue(state: GameState, move: Move): number {
  if (move.kind === 'drop') return 8;
  const captured = state.board[move.to];
  const moving = state.board[move.from];
  let value = captured ? 12 * PIECE_VALUES[captured.type] - PIECE_VALUES[moving?.type ?? 'P'] : 0;
  if (move.promote) value += 140;
  return value;
}

function ordered(state: GameState, moves: Move[]): Move[] {
  return moves
    .map((move, index) => ({ move, index, value: orderValue(state, move) }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map((entry) => entry.move);
}

function search(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
  ply: number,
): number {
  ctx.nodes += 1;
  if (state.status === 'won') {
    return state.winner === ctx.me ? MATE - ply : -MATE + ply;
  }
  if (state.status === 'draw') return 0;
  if (ctx.nodes >= ctx.limit) return evaluate(state, ctx.me);

  const moves = ordered(state, legalMoves(state));
  if (moves.length === 0) {
    return state.turn === ctx.me ? -MATE + ply : MATE - ply;
  }
  if (depth <= 0) return evaluate(state, ctx.me);

  const maximizing = state.turn === ctx.me;
  let best = maximizing ? -Infinity : Infinity;
  let a = alpha;
  let b = beta;

  for (const move of moves) {
    const next = makeMoveUnchecked(state, move);
    const score = search(next, depth - 1, a, b, ctx, ply + 1);
    if (maximizing) {
      if (score > best) best = score;
      if (best > a) a = best;
    } else {
      if (score < best) best = score;
      if (best < b) b = best;
    }
    if (b <= a) break;
    if (ctx.nodes >= ctx.limit) break;
  }

  return best;
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] ?? items[0];
}

function mateInOne(state: GameState, moves: Move[]): Move | null {
  for (const move of moves) {
    const next = makeMoveUnchecked(state, move);
    if (!next.check) continue;
    if (!hasAnyLegalMove(next, true)) return move;
  }
  return null;
}

function onePlyScores(state: GameState, moves: Move[], me: Side): { move: Move; score: number }[] {
  return moves.map((move) => ({
    move,
    score: evaluate(makeMoveUnchecked(state, move), me),
  }));
}

function sortedScores(scored: { move: Move; score: number }[]): { move: Move; score: number }[] {
  return [...scored].sort((a, b) => b.score - a.score);
}

function rootSearch(
  state: GameState,
  moves: Move[],
  depth: number,
  me: Side,
  limit: number,
): Move | null {
  if (moves.length === 0) return null;
  const ctx: SearchContext = { me, nodes: 0, limit };
  let bestScore = -Infinity;
  let bestMoves: Move[] = [];

  for (const move of ordered(state, moves)) {
    const next = makeMoveUnchecked(state, move);
    const score = search(next, depth - 1, -Infinity, Infinity, ctx, 1);
    if (score > bestScore + 0.001) {
      bestScore = score;
      bestMoves = [move];
    } else if (Math.abs(score - bestScore) <= 0.001) {
      bestMoves.push(move);
    }
    if (ctx.nodes >= ctx.limit) break;
  }

  return bestMoves[0] ?? moves[0];
}

/**
 * Deterministic four-level AI. The only source of variety is the injected RNG,
 * so the same state, level and RNG sequence always produce the same move.
 */
export function chooseMove(state: GameState, level: AiLevel, rng: Rng = Math.random): Move | null {
  if (state.status !== 'playing') return null;
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const me = state.turn;
  const mate = mateInOne(state, moves);

  if (level === 'companion') {
    if (mate) return mate;
    const scored = sortedScores(onePlyScores(state, moves, me));
    const gentle = scored.map(({ move, score }) => {
      let value = score;
      if (move.kind === 'move') {
        const captured = state.board[move.to];
        if (captured && PIECE_VALUES[captured.type] >= 400) value -= 120;
        const next = makeMoveUnchecked(state, move);
        if (next.check) value -= 35;
      } else {
        value -= 18;
      }
      return { move, score: value };
    });
    gentle.sort((a, b) => b.score - a.score);
    const top = gentle.slice(0, 4);
    const roll = rng();
    const index = roll < 0.55 ? 0 : roll < 0.8 ? Math.min(1, top.length - 1) : Math.min(2, top.length - 1);
    return top[index]?.move ?? moves[0];
  }

  if (level === 'easy') {
    if (mate && rng() > 0.2) return mate;
    if (rng() < 0.38) return pick(moves, rng);
    const scored = sortedScores(onePlyScores(state, moves, me));
    const top = scored.slice(0, 3);
    return pick(top.map((entry) => entry.move), rng);
  }

  if (level === 'normal') {
    if (mate) return mate;
    if (rng() < 0.08) return pick(moves, rng);
    return rootSearch(state, moves, 2, me, 42_000);
  }

  if (mate) return mate;
  return rootSearch(state, moves, 3, me, 90_000);
}

export function legalMoveFor(state: GameState, move: Move): boolean {
  return legalMoves(state).some((candidate) => sameMove(candidate, move));
}
