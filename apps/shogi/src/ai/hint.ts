import { chooseMove } from './ai';
import {
  hasAnyLegalMove,
  makeMoveUnchecked,
  type GameState,
  type HandType,
  type Move,
  type PieceType,
} from '../game/shogi';

export type HintKind = 'mate' | 'capture' | 'promote' | 'drop' | 'defend' | 'develop';

export interface Hint {
  move: Move;
  kind: HintKind;
  piece?: PieceType | HandType;
  captured?: PieceType;
}

/**
 * A deterministic, explainable hint for the side to move. The move comes from
 * the Hard search; the reason is read from the position so the UI can say why.
 */
export function hintFor(state: GameState): Hint | null {
  if (state.status !== 'playing') return null;
  const move = chooseMove(state, 'hard', () => 0.5);
  if (!move) return null;

  const next = makeMoveUnchecked(state, move);
  if (!hasAnyLegalMove(next, true)) {
    return { move, kind: 'mate' };
  }
  if (state.check) return { move, kind: 'defend' };
  if (move.kind === 'drop') return { move, kind: 'drop', piece: move.type };
  if (move.promote) {
    const moving = state.board[move.from];
    return { move, kind: 'promote', piece: moving?.type };
  }
  const captured = state.board[move.to];
  if (captured) return { move, kind: 'capture', captured: captured.type };
  const moving = state.board[move.from];
  return { move, kind: 'develop', piece: moving?.type };
}
