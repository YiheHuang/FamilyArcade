import { apply, rankOf, type GameState, type Move } from '../game/chess';
import { bestScoredMove } from './ai';

export type HintReason =
  | 'mate'
  | 'promotion'
  | 'capture'
  | 'check'
  | 'castle'
  | 'center'
  | 'develop'
  | 'defend'
  | 'best';

export interface Hint {
  move: Move;
  san: string;
  reason: HintReason;
}

const CENTER = new Set([27, 28, 35, 36]);

/**
 * A deterministic, explainable hint for the side to move. The move comes from
 * the same alpha-beta search as Hard; the reason is read from the position so
 * the UI can explain why it is a good idea.
 */
export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const move = bestScoredMove(state);
  if (!move) return null;
  const result = apply(state, move);
  if (!result.ok) return null;
  const after = result.state;

  let reason: HintReason = 'best';
  if (after.status === 'checkmate') reason = 'mate';
  else if (move.promotion) reason = 'promotion';
  else if (move.castle) reason = 'castle';
  else if (state.inCheck) reason = 'defend';
  else if (state.board[move.to] || move.enPassant) reason = 'capture';
  else if (after.inCheck) reason = 'check';
  else if (CENTER.has(move.to)) reason = 'center';
  else if (
    (state.turn === 'w' && rankOf(move.from) === 7) ||
    (state.turn === 'b' && rankOf(move.from) === 0)
  ) {
    reason = 'develop';
  }

  return { move, san: after.moves[after.moves.length - 1]?.san ?? '', reason };
}
